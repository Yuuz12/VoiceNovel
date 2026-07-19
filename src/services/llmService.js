// LLM 服务：OpenAI 兼容 Chat Completions API
// 用于：角色提取 / 智能分段 / 音色推荐
const logger = require('../utils/logger');

// 单次 LLM 请求的兜底超时（防 TCP 半开/网络挂起永久卡死）。
// 注意：这是「单次 chat」级别，不是整个任务级别——长文本被切成多个 chunk，
// 每个 chunk 独立计时，所以整个任务可以运行很久而不被误杀。
// 优先级：opts.timeoutMs（测试用） > settings.timeoutSeconds（前端可配） > 此兜底值。
const FALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

// 解析单次请求超时（ms）：opts.timeoutMs > settings.timeoutSeconds > 兜底
function resolveTimeoutMs(opts, settings) {
  if (opts && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0) return opts.timeoutMs;
  const secs = settings && Number.isFinite(settings.timeoutSeconds) ? settings.timeoutSeconds : 0;
  if (secs > 0) return secs * 1000;
  return FALLBACK_TIMEOUT_MS;
}

class LLMError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
  }
}

/**
 * 合并多个 AbortSignal（Node 18 无 AbortSignal.any，手动实现）。
 * 任一 signal abort 时，合并 controller 立即 abort。
 * @param {...AbortSignal} signals
 * @returns {{ signal: AbortSignal, cleanup: () => void }}
 */
function combineSignals(...signals) {
  const controller = new AbortController();
  const filtered = signals.filter(Boolean);
  for (const s of filtered) {
    if (s.aborted) {
      controller.abort();
      break;
    }
  }
  let cleaned = false;
  let onAbort = null;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (onAbort) {
      for (const s of filtered) {
        try { s.removeEventListener('abort', onAbort); } catch (_) {}
      }
    }
  };
  if (!controller.signal.aborted) {
    onAbort = () => {
      controller.abort();
      cleanup();
    };
    for (const s of filtered) {
      s.addEventListener('abort', onAbort, { once: true });
    }
  }
  return { signal: controller.signal, cleanup };
}

/**
 * 调用 OpenAI 兼容 chat completions
 * @param {object} settings - settingsService.get().llm
 * @param {Array} messages
 * @param {object} [opts] { jsonMode, temperature, timeoutMs, signal }
 *   - signal: 外部 AbortSignal（用户取消），与兜底超时 signal 合并
 *   - timeoutMs: 覆盖兜底超时（测试用）
 * @returns {Promise<string>} assistant content
 */
async function chat(settings, messages, opts = {}) {
  if (!settings || !settings.apiKey) {
    throw new LLMError('未配置 LLM API Key', 'NO_API_KEY');
  }
  const baseUrl = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const timeoutMs = resolveTimeoutMs(opts, settings);

  const body = {
    model: settings.model || 'gpt-4o-mini',
    messages,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.4,
  };
  // 注：不设置 response_format={type:'json_object'}。部分 OpenAI 兼容 API（如 LongCat-2.0
  // 这类推理模型）对该参数支持异常——会把答案塞进 message.reasoning_content 而 content 留空。
  // 统一依赖 prompt 要求 JSON + extractJson 容错解析（已处理 ```json``` 代码块包裹），兼容性更好。
  // if (opts.jsonMode) { body.response_format = { type: 'json_object' }; }

  // 合并「用户取消 signal」与「兜底超时 signal」，任一触发即 abort fetch
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = combineSignals(opts.signal, timeoutSignal);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: combined.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new LLMError(`LLM HTTP ${resp.status}: ${errText.slice(0, 500)}`, 'HTTP_ERROR');
    }
    const data = await resp.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    // 兼容推理模型（LongCat-2.0 / deepseek-r1 等）：content 可能为空，实际内容在 reasoning_content
    const content = (msg && (msg.content || msg.reasoning_content)) || '';
    if (!content) {
      throw new LLMError('LLM 返回内容为空', 'EMPTY_RESPONSE');
    }
    return content;
  } catch (err) {
    // abort 来源区分：用户主动取消 vs 兜底超时
    if (err instanceof LLMError) throw err;
    if (err.name === 'AbortError' || err.code === 'ABORT_ERR' || combined.signal.aborted) {
      if (opts.signal && opts.signal.aborted) {
        throw new LLMError('LLM 请求已取消', 'ABORTED');
      }
      throw new LLMError(`LLM 单次请求超时 (${timeoutMs}ms)，请重试`, 'TIMEOUT');
    }
    throw new LLMError(`LLM 请求失败: ${err.message}`, 'NETWORK_ERROR');
  } finally {
    // 关键：请求结束后清理监听器，防止并行处理时监听器累积导致内存泄漏
    combined.cleanup();
  }
}

/**
 * 流式调用 OpenAI 兼容 chat completions（stream: true）。
 * 逐 token 读取响应，通过 opts.onToken 实时回调，让前端能看到 LLM 的思考与输出实时滚动。
 * 推理模型（LongCat-2.0 / deepseek-r1 等）会先吐 reasoning_content（思考），再吐 content（答案）。
 *
 * @param {object} settings - settingsService.get().llm
 * @param {Array} messages
 * @param {object} [opts] { temperature, timeoutMs, signal, onToken }
 *   - signal: 外部 AbortSignal（用户取消），与兜底超时 signal 合并
 *   - onToken({role:'reasoning'|'content', delta, accumulated}) 每收到一段 delta 时回调
 * @returns {Promise<string>} 完整 assistant content（优先 content，为空则回退 reasoning_content）
 */
async function chatStream(settings, messages, opts = {}) {
  if (!settings || !settings.apiKey) {
    throw new LLMError('未配置 LLM API Key', 'NO_API_KEY');
  }
  const baseUrl = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const timeoutMs = resolveTimeoutMs(opts, settings);

  const body = {
    model: settings.model || 'gpt-4o-mini',
    messages,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.4,
    stream: true, // 关键：流式
  };

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = combineSignals(opts.signal, timeoutSignal);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: combined.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new LLMError(`LLM HTTP ${resp.status}: ${errText.slice(0, 500)}`, 'HTTP_ERROR');
    }

    // 流式读取 SSE：每帧形如 data: {...}\n\n，末尾 data: [DONE]\n\n
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullContent = '';
    let fullReasoning = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        // 一帧可能含多行 data: {...}
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
            if (!delta) continue;
            // 推理模型的思考内容
            if (delta.reasoning_content) {
              fullReasoning += delta.reasoning_content;
              opts.onToken && opts.onToken({
                role: 'reasoning',
                delta: delta.reasoning_content,
                accumulated: fullReasoning,
              });
            }
            // 正常输出内容
            if (delta.content) {
              fullContent += delta.content;
              opts.onToken && opts.onToken({
                role: 'content',
                delta: delta.content,
                accumulated: fullContent,
              });
            }
          } catch (_) {
            // 单帧 JSON 解析失败（半包等）跳过，下个 delta 会补全
          }
        }
      }
    }

    // 兼容推理模型：content 为空时回退到 reasoning_content
    const content = fullContent || fullReasoning;
    if (!content) {
      throw new LLMError('LLM 返回内容为空', 'EMPTY_RESPONSE');
    }
    return content;
  } catch (err) {
    if (err instanceof LLMError) throw err;
    if (err.name === 'AbortError' || err.code === 'ABORT_ERR' || combined.signal.aborted) {
      if (opts.signal && opts.signal.aborted) {
        throw new LLMError('LLM 请求已取消', 'ABORTED');
      }
      throw new LLMError(`LLM 单次请求超时 (${timeoutMs}ms)，请重试`, 'TIMEOUT');
    }
    throw new LLMError(`LLM 请求失败: ${err.message}`, 'NETWORK_ERROR');
  } finally {
    // 关键：请求结束后清理监听器，防止并行处理时监听器累积导致内存泄漏
    combined.cleanup();
  }
}

/**
 * 提取 JSON（容错：剥离 markdown 代码块、寻找首个 { 到末尾 }）
 */
function extractJson(text) {
  if (!text) return null;
  let s = text.trim();
  // 去除 ```json ... ``` 包裹
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch (_) {
    // 尝试找首个 { 到最后一个 }
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch (_) {}
    }
    return null;
  }
}

/**
 * 把长文本按 ~maxChars 切片（在段落或句末切，避免切断对话）
 */
function chunkText(text, maxChars = 6000) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      // 向后找最近的段落分隔（连续两个换行）或句末
      const slice = text.slice(start, end);
      let cut = -1;
      const paraBreak = slice.lastIndexOf('\n\n');
      if (paraBreak > maxChars * 0.5) {
        cut = paraBreak;
      } else {
        const lineBreak = slice.lastIndexOf('\n');
        if (lineBreak > maxChars * 0.5) cut = lineBreak;
        else {
          // 句末标点
          const punct = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'));
          if (punct > maxChars * 0.5) cut = punct;
        }
      }
      if (cut > 0) end = start + cut + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * 提取角色清单（并行处理多个 chunk）
 * @param {string} text
 * @param {object} settings LLM 子配置 { baseUrl, apiKey, model }
 * @param {object} [opts] { signal, onProgress, concurrency }
 * @returns {Promise<Array<{name, gender, description}>>}
 */
async function extractCharacters(text, settings, opts = {}) {
  const onProgress = opts.onProgress;
  const concurrency = Math.max(1, Math.min(10, opts.concurrency || 3));
  const chunks = chunkText(text || '', 6000);
  onProgress && onProgress({ type: 'start', task: 'extract', chunkCount: chunks.length, concurrency });
  if (chunks.length === 0) return [];

  const chunkTotal = chunks.length;
  const results = new Array(chunkTotal); // 每个 chunk 解析出的角色数组
  let workerIndex = 0;
  let workerError = null;

  // 处理单个 chunk：调 LLM + 解析行格式
  const processChunk = async (i) => {
    if (opts.signal && opts.signal.aborted) {
      throw new LLMError('已取消', 'ABORTED');
    }
    const messages = [
      {
        role: 'system',
        content: '你是一名小说分析助手，请分析小说文本并提取所有"说过话"的角色（不提取仅在旁白中被提及但未说话的人物）。每行一个角色，格式：角色名|性别|简短描述。',
      },
      {
        role: 'user',
        content: `请分析以下小说文本（第 ${i + 1}/${chunkTotal} 段），提取其中所有"说过话"的角色信息。

每行一个角色，格式：
角色名|male或female或unknown|简短描述（不超过50字）

注意：
1. 只提取实际说过话的角色（包括对话中被引用的台词）
2. 名字使用文本中出现的角色名，不要发明新名字
3. 性别基于文本描述或角色名字暗示判断，无法判断时填 unknown
4. 描述简短描述角色性别、年龄、身份、性格特征等，不超过50字

小说文本：
---
${chunks[i]}
---`,
      },
    ];
    const content = await chatStream(settings, messages, {
      temperature: 0.2, signal: opts.signal,
      onToken: (t) => onProgress && onProgress({
        type: 'token', task: 'extract',
        chunkIndex: i + 1, chunkCount: chunkTotal,
        role: t.role, delta: t.delta, accumulated: t.accumulated,
      }),
    });
    // 解析行格式：name|gender|description
    const parsed = [];
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    for (const line of lines) {
      if (!line.includes('|')) continue;
      const parts = line.split('|');
      const name = parts[0] && parts[0].trim();
      if (!name) continue;
      const genderRaw = (parts[1] && parts[1].trim()) || 'unknown';
      const g = ['male', 'female', 'unknown'].includes(genderRaw) ? genderRaw : 'unknown';
      const description = (parts[2] && parts[2].trim()) || '';
      parsed.push({ name, gender: g, description });
    }
    return { content, parsed };
  };

  // 并发 worker：不断领取未处理的 chunk 直到全部完成或出错
  const worker = async () => {
    while (workerIndex < chunkTotal && !workerError) {
      if (opts.signal && opts.signal.aborted) {
        const err = new LLMError('已取消', 'ABORTED');
        workerError = err;
        return;
      }
      const idx = workerIndex++;
      try {
        const { content, parsed } = await processChunk(idx);
        results[idx] = parsed;
        // 标记该 chunk 完成（供前端变绿）
        onProgress && onProgress({
          type: 'chunk-done',
          task: 'extract',
          chunkIndex: idx + 1, chunkCount: chunkTotal,
        });
        onProgress && onProgress({
          type: 'chunk',
          task: 'extract',
          chunkIndex: idx + 1, chunkCount: chunkTotal,
          content, parsedCount: parsed.length,
        });
      } catch (err) {
        workerError = err;
        return;
      }
    }
  };

  // 启动 concurrency 个 worker
  const workers = [];
  for (let w = 0; w < Math.min(concurrency, chunkTotal); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  if (workerError) throw workerError;

  // 合并所有 chunk 的结果（同名角色合并描述）
  const all = new Map();
  for (const parsed of results) {
    if (!parsed) continue;
    for (const c of parsed) {
      if (all.has(c.name)) {
        const ex = all.get(c.name);
        if (!ex.description && c.description) ex.description = c.description;
        if ((!ex.gender || ex.gender === 'unknown') && c.gender !== 'unknown') ex.gender = c.gender;
      } else {
        all.set(c.name, { name: c.name, gender: c.gender, description: c.description });
      }
    }
  }
  return Array.from(all.values());
}

/**
 * LLM 智能分段
 * @param {string} text
 * @param {object} settings
 * @param {object} [opts] { signal, onProgress }
 * @returns {Promise<{segments: Array}>}
 */
async function segmentWithLLM(text, settings, opts = {}) {
  const onProgress = opts.onProgress;
  const chunks = chunkText(text || '', 6000);
  onProgress && onProgress({ type: 'start', task: 'segment', chunkCount: chunks.length });
  if (chunks.length === 0) return { segments: [] };

  const segments = [];
  for (let i = 0; i < chunks.length; i++) {
    if (opts.signal && opts.signal.aborted) {
      throw new LLMError('已取消', 'ABORTED');
    }
    const messages = [
      {
        role: 'system',
        content: '你是一名小说分段助手。把小说文本切分为有序段落，每段标注是旁白还是某角色的对话。严格以 JSON 格式返回。',
      },
      {
        role: 'user',
        content: `请把以下小说文本（第 ${i + 1}/${chunks.length} 段）切分为多个段落，每段标注类型。

返回 JSON 格式：
{
  "segments": [
    { "type": "narration", "text": "旁白段落原文", "characterName": null },
    { "type": "dialog", "text": "对话内容（不含引号）", "characterName": "说话角色名" }
  ]
}

要求：
1. 完整保留原文，不修改、不省略、不添加任何字
2. 对话段落需识别说话角色名；若文本明确给出（如"林墨说"），用该名字；若无法判断则 characterName 填 null
3. 连续旁白可合并为一段，但不要超过 200 字
4. 段落顺序必须与原文一致

小说文本：
---
${chunks[i]}
---`,
      },
    ];
    const content = await chatStream(settings, messages, {
      jsonMode: true, temperature: 0.2, signal: opts.signal,
      onToken: (t) => onProgress && onProgress({
        type: 'token', task: 'segment',
        chunkIndex: i + 1, chunkCount: chunks.length,
        role: t.role, delta: t.delta, accumulated: t.accumulated,
      }),
    });
    const parsed = extractJson(content);
    if (parsed && Array.isArray(parsed.segments)) {
      for (const s of parsed.segments) {
        if (!s || typeof s.text !== 'string' || !s.text.trim()) continue;
        segments.push({
          type: s.type === 'dialog' ? 'dialog' : 'narration',
          text: s.text.trim(),
          characterName: s.characterName || null,
        });
      }
    } else {
      onProgress && onProgress({ type: 'warn', chunkIndex: i + 1, message: `第 ${i + 1} 段 JSON 解析失败，跳过` });
    }
    onProgress && onProgress({
      type: 'chunk', task: 'segment',
      chunkIndex: i + 1, chunkCount: chunks.length,
      content, partialSegments: segments.length,
    });
  }
  return { segments };
}

/**
 * 处理单个文本块（segmentWithLLM 的单块版本，供增量持久化调用）。
 * 不做 chunkText 切分，只处理传入的单个 chunk，返回该块的 segments。
 * @param {string} chunk 单块文本
 * @param {number} chunkIndex 0-based 块索引
 * @param {number} chunkTotal 总块数
 * @param {object} settings settings.llm 子对象
 * @param {object} [opts] { signal, onProgress }
 * @returns {Promise<Array<{type, text, characterName}>>}
 */
async function segmentOneChunk(chunk, chunkIndex, chunkTotal, settings, opts = {}) {
  const onProgress = opts.onProgress;
  if (opts.signal && opts.signal.aborted) {
    throw new LLMError('已取消', 'ABORTED');
  }
  const messages = [
    {
      role: 'system',
      content: '你是一名小说分段助手。把小说文本切分为有序段落，每段标注是旁白还是某角色的对话。每行一段，格式：N|旁白文本 或 D|角色名|对话文本。',
    },
    {
      role: 'user',
      content: `请把以下小说文本（第 ${chunkIndex + 1}/${chunkTotal} 段）切分为多个段落。

每行一段，格式：
N|旁白段落原文
D|角色名|对话内容（不含引号）

要求：
1. 完整保留原文，不修改、不省略、不添加任何字
2. 对话段落需识别说话角色名；若文本明确给出（如"林墨说"），用该名字；若无法判断则角色名留空（D||对话）
3. 连续旁白可合并为一段，但不要超过 200 字
4. 段落顺序必须与原文一致

小说文本：
---
${chunk}
---`,
    },
  ];
  const content = await chatStream(settings, messages, {
    temperature: 0.2, signal: opts.signal,
    onToken: (t) => onProgress && onProgress({
      type: 'token', task: 'segment',
      chunkIndex: chunkIndex + 1, chunkCount: chunkTotal,
      role: t.role, delta: t.delta, accumulated: t.accumulated,
    }),
  });
  // 解析行格式
  const segs = [];
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  for (const line of lines) {
    if (line.startsWith('N|')) {
      const text = line.slice(2).trim();
      if (text) segs.push({ type: 'narration', text, characterName: null });
    } else if (line.startsWith('D|')) {
      const parts = line.slice(2).split('|');
      const characterName = parts[0] && parts[0].trim() ? parts[0].trim() : null;
      const text = parts.slice(1).join('|').trim();
      if (text) segs.push({ type: 'dialog', text, characterName });
    }
  }
  if (segs.length === 0) {
    onProgress && onProgress({ type: 'warn', chunkIndex: chunkIndex + 1, message: `第 ${chunkIndex + 1} 段解析失败，跳过` });
  }
  onProgress && onProgress({
    type: 'chunk', task: 'segment',
    chunkIndex: chunkIndex + 1, chunkCount: chunkTotal,
    content,
  });
  return segs;
}

/**
 * 为角色推荐音色（角色多时按 concurrency 分批并行调用）
 * @param {Array} characters - [{name, gender, description}]
 * @param {Array} voices - voice catalog
 * @param {object} settings LLM 子配置
 * @param {object} [opts] { signal, onProgress, concurrency }
 * @returns {Promise<Array<{name, voiceId, reason}>>}
 */
async function recommendVoices(characters, voices, settings, opts = {}) {
  const onProgress = opts.onProgress;
  const concurrency = Math.max(1, Math.min(10, opts.concurrency || 3));
  // 把音色精简一下减小 token：只保留 id/name/gender/style/tags
  const slimVoices = voices.map((v) => ({
    id: v.id,
    name: v.name,
    gender: v.gender,
    style: v.style,
    tags: v.tags,
  }));
  const slimChars = characters.map((c) => ({
    name: c.name,
    gender: c.gender,
    description: c.description,
  }));

  // 按 concurrency 把角色分成 N 批（每批尽量均匀）
  const batchCount = Math.min(concurrency, Math.max(1, slimChars.length));
  const batches = new Array(batchCount);
  for (let i = 0; i < batchCount; i++) batches[i] = [];
  slimChars.forEach((c, i) => batches[i % batchCount].push(c));

  onProgress && onProgress({
    type: 'start', task: 'auto-match',
    characterCount: characters.length, chunkCount: batchCount, concurrency,
  });
  if (opts.signal && opts.signal.aborted) {
    throw new LLMError('已取消', 'ABORTED');
  }

  const results = new Array(batchCount);
  let workerIndex = 0;
  let workerError = null;

  // 处理单个 batch
  const processBatch = async (batchIdx) => {
    if (opts.signal && opts.signal.aborted) {
      throw new LLMError('已取消', 'ABORTED');
    }
    const batchChars = batches[batchIdx];
    if (!batchChars || batchChars.length === 0) return '';
    const messages = [
      {
        role: 'system',
        content: '你是一名音色匹配助手。根据小说角色的性别、年龄、性格、身份，从可用音色列表中为每个角色推荐最匹配的音色。每行一个匹配，格式：角色名|音色id|简短理由。',
      },
      {
        role: 'user',
        content: `请为以下小说角色推荐最匹配的音色。

角色列表：
${JSON.stringify(batchChars, null, 2)}

可用音色列表（仅可使用以下 id）：
${JSON.stringify(slimVoices, null, 2)}

每行一个匹配，格式：
角色名|音色id|简短理由（不超过30字）

要求：
1. 性别必须匹配：女角色只能分配 female 音色，男角色只能分配 male 音色
2. 不同角色尽量分配不同音色 id
3. 根据角色性格、年龄、身份选择最贴合的音色（如高冷御姐选 gaolengyujie，温柔少女选 wenroushunv 等）
4. 音色id 必须是上面列表中存在的 id`,
      },
    ];
    return await chatStream(settings, messages, {
      temperature: 0.3, signal: opts.signal,
      onToken: (t) => onProgress && onProgress({
        type: 'token', task: 'auto-match',
        chunkIndex: batchIdx + 1, chunkCount: batchCount,
        role: t.role, delta: t.delta, accumulated: t.accumulated,
      }),
    });
  };

  // 并发 worker
  const worker = async () => {
    while (workerIndex < batchCount && !workerError) {
      if (opts.signal && opts.signal.aborted) {
        workerError = new LLMError('已取消', 'ABORTED');
        return;
      }
      const idx = workerIndex++;
      try {
        const content = await processBatch(idx);
        results[idx] = content;
        onProgress && onProgress({
          type: 'chunk-done',
          task: 'auto-match',
          chunkIndex: idx + 1, chunkCount: batchCount,
        });
        onProgress && onProgress({
          type: 'chunk',
          task: 'auto-match',
          chunkIndex: idx + 1, chunkCount: batchCount,
          content, parsedCount: 0,
        });
      } catch (err) {
        workerError = err;
        return;
      }
    }
  };

  const workers = [];
  for (let w = 0; w < batchCount; w++) workers.push(worker());
  await Promise.all(workers);
  if (workerError) throw workerError;

  onProgress && onProgress({ type: 'llm-done', content: results.join('\n') });
  // 合并所有 batch 的结果，解析行格式：name|voiceId|reason
  const matches = [];
  for (const content of results) {
    if (!content) continue;
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    for (const line of lines) {
      if (!line.includes('|')) continue;
      const parts = line.split('|');
      const name = parts[0] && parts[0].trim();
      const voiceId = parts[1] && parts[1].trim();
      const reason = (parts[2] && parts[2].trim()) || '';
      if (!name || !voiceId) continue;
      const exists = slimVoices.some(v => v.id === voiceId);
      if (!exists) continue;
      matches.push({ name, voiceId, reason });
    }
  }
  if (matches.length === 0) {
    throw new LLMError('LLM 推荐音色返回格式错误或无有效匹配', 'BAD_FORMAT');
  }
  return matches;
}

module.exports = {
  LLMError,
  chat,
  chatStream,
  extractCharacters,
  segmentWithLLM,
  segmentOneChunk,
  recommendVoices,
  chunkText,
  combineSignals,
};
