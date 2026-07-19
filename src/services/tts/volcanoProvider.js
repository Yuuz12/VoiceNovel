// 火山方舟 TTS 服务（原「方舟 Agent Plan」豆包 seed-tts-2.0）- HTTP Chunked 客户端
// 接口规范参考：接入语音模型文档.md 第 291-363 行 Python 示例
const { randomUUID } = require('crypto');
const logger = require('../../utils/logger');
const settingsService = require('../settingsService');
const audioCache = require('../audioCacheService');
const { TTSError } = require('./ttsError');

// TTS 接口地址从 settings.tts.providers.volcano.baseUrl 读取（前端设置页可配置），默认火山方舟 Agent Plan 标准地址
// 注意：请使用 Agent Plan 专属 URL，否则可能产生额外费用

/**
 * 流式合成：异步生成器，逐块 yield Buffer（音频二进制）
 * @param {string} text 待合成文本
 * @param {string} speaker 音色 voice_type，如 zh_female_vv_uranus_bigtts
 * @param {object} [opts] 可选参数 { speed, volume, format, sampleRate, signal }
 * @yields {Buffer}
 */
async function* synthesizeStream(text, speaker, opts = {}) {
  const settings = settingsService.get();
  const volcano = (settings.tts && settings.tts.providers && settings.tts.providers.volcano) || {};
  const apiKey = opts.apiKey || volcano.apiKey;
  if (!apiKey) {
    throw new TTSError('未配置火山方舟 TTS API Key，请在设置页填写', 'NO_API_KEY');
  }
  const baseUrl = opts.baseUrl || volcano.baseUrl || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';
  const resourceId = opts.resourceId || volcano.resourceId || 'seed-tts-2.0';
  const format = opts.format || volcano.audioFormat || 'mp3';
  const sampleRate = opts.sampleRate || volcano.sampleRate || 24000;

  const connectId = randomUUID();
  const headers = {
    'X-Api-Key': apiKey,
    'X-Api-Resource-Id': resourceId,
    'X-Api-Connect-Id': connectId,
    'Content-Type': 'application/json',
    'Connection': 'keep-alive',
    'X-Control-Require-Usage-Tokens-Return': '*',
  };

  const audioParams = {
    format,
    sample_rate: sampleRate,
  };
  if (typeof opts.speed === 'number' && opts.speed !== 0) {
    audioParams.speed_ratio = opts.speed; // -50 ~ 100
  }
  if (typeof opts.volume === 'number' && opts.volume !== 0) {
    audioParams.volume_ratio = opts.volume; // -50 ~ 100
  }

  // 火山 seed-tts-2.0 不识别 [描述] 方括号标签（会当普通文本朗读），
  // 需要把方括号内容从 text 提取出来，作为自然语言情感指令传到 additions.context_texts
  // （仅 TTS 2.0 支持，参考单向流式接口文档 req_params.additions.context_texts）
  // 复用 audioCache 的共享清理函数，保证缓存键与实际合成文本一致
  const contexts = audioCache.extractExpressionContexts(text);
  const cleanText = audioCache.stripExpressionTags(text);
  let additions = null;
  if (contexts.length > 0) {
    additions = JSON.stringify({ context_texts: contexts });
  }

  const payload = {
    req_params: {
      text: cleanText,
      speaker,
      audio_params: audioParams,
    },
  };
  // 仅当有情感指令时传 additions（避免无标签时改变原有请求结构）
  if (additions) {
    payload.req_params.additions = additions;
    logger.info(`[volcano] 提取情感指令: ${additions}`);
  }

  logger.info(`[volcano] TTS request: speaker=${speaker}, textLen=${text.length}, connectId=${connectId}`);

  let response;
  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: opts.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new TTSError('TTS 请求被取消', 'ABORTED');
    throw new TTSError(`TTS 网络请求失败: ${err.message}`, 'NETWORK_ERROR');
  }

  const logid = response.headers.get('x-tt-logid') || '';
  logger.info(`[volcano] TTS response: status=${response.status}, logid=${logid}`);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new TTSError(`TTS HTTP ${response.status}: ${errText.slice(0, 500)}`, 'HTTP_ERROR');
  }

  if (!response.body) {
    throw new TTSError('TTS 响应无 body', 'NO_BODY');
  }

  // 解析 chunked JSON lines: 每行一个 JSON，含 data (base64 音频) 与 code
  yield* parseChunkedResponse(response.body, opts.signal);
}

/**
 * 解析分块 JSON 响应
 * @param {ReadableStream<Uint8Array>} body
 * @param {AbortSignal} [signal]
 */
async function* parseChunkedResponse(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let receivedAny = false;

  try {
    while (true) {
      if (signal && signal.aborted) {
        throw new TTSError('TTS 请求被取消', 'ABORTED');
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按行切分（保留最后一行不完整的）
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        const chunk = parseLine(line);
        if (chunk.audio) {
          receivedAny = true;
          yield chunk.audio;
        }
        if (chunk.done) return;
        if (chunk.error) {
          throw new TTSError(chunk.error.message, chunk.error.code);
        }
      }
    }
    // 处理最后残余的一行
    const tail = buffer.trim();
    if (tail) {
      const chunk = parseLine(tail);
      if (chunk.audio) {
        receivedAny = true;
        yield chunk.audio;
      }
      if (chunk.error) {
        throw new TTSError(chunk.error.message, chunk.error.code);
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }

  if (!receivedAny) {
    throw new TTSError('TTS 未返回任何音频数据', 'NO_AUDIO');
  }
}

function parseLine(line) {
  let data;
  try {
    data = JSON.parse(line);
  } catch (err) {
    logger.warn(`[volcano] TTS 响应行解析失败: ${line.slice(0, 200)}`);
    return {};
  }
  const code = data.code || 0;
  // code === 0 表示正常音频块；code === 20000000 表示结束
  if (code === 20000000) {
    return { done: true };
  }
  if (code > 0) {
    return { error: { code: String(code), message: data.message || `TTS 错误码 ${code}` } };
  }
  if (data.data) {
    try {
      const audio = Buffer.from(data.data, 'base64');
      return { audio };
    } catch (err) {
      logger.warn(`[volcano] TTS base64 解码失败: ${err.message}`);
      return {};
    }
  }
  return {};
}

module.exports = { synthesizeStream };
