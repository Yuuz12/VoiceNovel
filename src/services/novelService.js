// 小说服务：CRUD + 规则分段 + 角色识别（启发式）
const path = require('path');
const { readJson, writeJson, remove, listFiles } = require('../storage/fileStorage');
const { shortId } = require('../utils/id');
const settingsService = require('./settingsService');
const llmService = require('./llmService');
const characterService = require('./characterService');
const logger = require('../utils/logger');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const NOVELS_DIR = path.join(DATA_DIR, 'novels');
const SEG_PROGRESS_DIR = path.join(DATA_DIR, 'seg_progress');

function novelPath(id) {
  return path.join(NOVELS_DIR, `${id}.json`);
}

// === 分段进度文件管理（长文本增量分段可取消可继续）===
function segProgressPath(id) {
  return path.join(SEG_PROGRESS_DIR, `${id}.json`);
}
function getSegmentProgress(novelId) {
  return readJson(segProgressPath(novelId));
}
function saveSegmentProgress(p) {
  p.updatedAt = new Date().toISOString();
  writeJson(segProgressPath(p.novelId), p);
  return p;
}
function clearSegmentProgress(novelId) {
  remove(segProgressPath(novelId));
}

/**
 * 按名字匹配已有角色（功能 2：LLM 分段只复用已有角色，不创建/不覆盖）
 * 容错策略（按优先级）：
 *   1. 精确匹配（trim 后）
 *   2. 去掉尾部说话动词后缀（道/说/问/笑道/说道...）后精确匹配
 *   3. 前缀包含匹配（角色名 >= 2 字，LLM 名以角色名开头或反之）
 * 找不到返回 null（段落显示 ⚠ 未绑定，用户手动选）
 */
const SPEECH_SUFFIX_RE = /(?:微笑着|轻声|低声|高声|大声|冷冷|淡淡|缓缓|微微|轻轻|笑了笑|想了想|顿了顿|继续道|接着道|补充道|说道|喝道|喊道|怒道|冷哼|轻哼|笑骂|打趣|反驳|附和|解释|询问|回答|嗤笑|讥讽|嘲笑|调侃|嘀咕|嘟囔|沉声|冷声|轻笑|大笑|冷笑|笑道|问道|答道|叫道|吼道|叹道|哭道|道|说|问|答|喊|叫|吼|喝|笑|叹)+$/;
function matchCharacterId(name, characters) {
  if (!name) return null;
  const list = characters || [];
  const norm = (s) => (s || '').trim();
  const target = norm(name);
  if (!target) return null;

  // 1. 精确匹配
  let c = list.find((x) => norm(x.name) === target);
  if (c) return c.id;

  // 2. 去掉尾部说话动词后缀再精确匹配（cleaned 长度 >= 2，防"道"→""）
  const cleaned = target.replace(SPEECH_SUFFIX_RE, '');
  if (cleaned && cleaned !== target && cleaned.length >= 2) {
    c = list.find((x) => norm(x.name) === cleaned);
    if (c) return c.id;
  }

  // 3. 前缀包含匹配（双方 >= 2 字，排除已尝试的精确相等）
  if (target.length >= 2) {
    c = list.find((x) => {
      const n = norm(x.name);
      return n.length >= 2 && n !== target && (target.startsWith(n) || n.startsWith(target));
    });
    if (c) return c.id;
  }

  return null;
}

function listNovels() {
  const files = listFiles(NOVELS_DIR, '.json');
  const novels = [];
  for (const f of files) {
    const n = readJson(path.join(NOVELS_DIR, f));
    if (n) {
      novels.push({
        id: n.id,
        title: n.title,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        segmentCount: (n.segments || []).length,
        characterCount: (n.characters || []).length,
        rawTextLength: (n.rawText || '').length,
      });
    }
  }
  novels.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return novels;
}

function getNovel(id) {
  return readJson(novelPath(id));
}

function saveNovel(novel) {
  novel.updatedAt = new Date().toISOString();
  writeJson(novelPath(novel.id), novel);
  return novel;
}

function createNovel({ title, text, autoSegment }) {
  const id = shortId('n');
  const now = new Date().toISOString();
  const novel = {
    id,
    title: title || '未命名小说',
    rawText: text || '',
    createdAt: now,
    updatedAt: now,
    segments: [],
    characters: [],
  };

  const settings = settingsService.get();
  if (autoSegment === undefined ? settings.parsing.autoSegmentOnUpload : autoSegment) {
    const parsed = parseWithRules(text || '', settings.parsing);
    novel.segments = parsed.segments;
    novel.characters = parsed.characters;
  }
  return saveNovel(novel);
}

function updateNovel(id, partial) {
  const novel = getNovel(id);
  if (!novel) return null;
  if (typeof partial.title === 'string') novel.title = partial.title;
  if (typeof partial.rawText === 'string') novel.rawText = partial.rawText;
  if (Array.isArray(partial.segments)) novel.segments = partial.segments;
  return saveNovel(novel);
}

function deleteNovel(id) {
  remove(novelPath(id));
  remove(segProgressPath(id)); // 清理分段进度文件
  return true;
}

/**
 * 规则分段：识别对话/旁白 + 启发式角色归因
 * @param {string} text
 * @param {object} parsingSettings { dialogSymbols, maxSegmentLength }
 * @returns {{segments: Array, characters: Array}}
 */
function parseWithRules(text, parsingSettings) {
  const symbols = (parsingSettings && parsingSettings.dialogSymbols) || [['"', '"']];
  const maxLen = (parsingSettings && parsingSettings.maxSegmentLength) || 200;

  // 1. 用正则切出对话块及其上下文
  // 构造匹配任一对话符号对的正则
  const patterns = symbols.map(([open, close]) => {
    const o = escapeReg(open);
    const c = escapeReg(close);
    return `${o}([^${c}]*?)${c}`;
  });
  const dialogRegex = new RegExp(patterns.join('|'), 'g');

  // 收集所有对话区间 [start, end, dialogText]
  const dialogRanges = [];
  let m;
  while ((m = dialogRegex.exec(text)) !== null) {
    // 找到实际匹配的对话内容（来自哪个捕获组）
    let dialogText = '';
    for (let i = 1; i < m.length; i++) {
      if (m[i] !== undefined) {
        dialogText = m[i];
        break;
      }
    }
    dialogRanges.push({
      start: m.index,
      end: m.index + m[0].length,
      full: m[0],
      text: dialogText.trim(),
    });
  }

  // 2. 把文本拆成段：旁白 / 对话交替
  const rawSegments = [];
  let cursor = 0;
  for (const dr of dialogRanges) {
    if (dr.start > cursor) {
      const narr = text.slice(cursor, dr.start).trim();
      if (narr) rawSegments.push({ type: 'narration', text: narr, range: [cursor, dr.start] });
    }
    if (dr.text) {
      rawSegments.push({ type: 'dialog', text: dr.text, full: dr.full, range: [dr.start, dr.end] });
    }
    cursor = dr.end;
  }
  if (cursor < text.length) {
    const tail = text.slice(cursor).trim();
    if (tail) rawSegments.push({ type: 'narration', text: tail, range: [cursor, text.length] });
  }

  // 3. 为对话块识别说话角色（启发式）
  const characterMap = new Map(); // name -> { id, count, firstPos }
  const segments = [];
  let order = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];

    // 过长段落按句末标点二次切分
    const pieces = splitLongSegment(seg.text, maxLen);
    for (const piece of pieces) {
      if (!piece) continue;
      let characterId = null;
      let speakerName = null;
      if (seg.type === 'dialog') {
        speakerName = detectSpeaker(seg, rawSegments, i, text);
        if (speakerName) {
          if (!characterMap.has(speakerName)) {
            characterMap.set(speakerName, { id: shortId('c'), count: 0 });
          }
          const c = characterMap.get(speakerName);
          c.count += 1;
          characterId = c.id;
        }
      }
      segments.push({
        id: shortId('s'),
        type: seg.type,
        text: piece,
        characterId,
        order: order++,
      });
    }
  }

  // 4. 构建角色列表
  const characters = Array.from(characterMap.entries()).map(([name, info]) => ({
    id: info.id,
    name,
    description: '',
    gender: 'unknown',
    voiceId: null, // 待自动匹配或用户手动配置
    voiceConfig: { speed: 0, volume: 0 },
    appearances: info.count,
  }));

  characters.sort((a, b) => b.appearances - a.appearances);

  // 给 dialog 段落填入 speaker（角色音色未定时先用 null，播放时 fallback 到旁白音色）
  // 同时把 characterId 已经填好了

  return { segments, characters };
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 启发式识别说话人
 * 策略：检查对话块前后 ~30 字符的旁白，匹配 "X说/道/问/答/笑/喊/叫/吼/喝" 等模式
 */
function detectSpeaker(dialogSeg, allSegs, idx, fullText) {
  // 从原始 fullText 中取对话块前后 30 字符
  const beforeStart = Math.max(0, dialogSeg.range[0] - 30);
  const beforeText = fullText.slice(beforeStart, dialogSeg.range[0]);
  const afterText = fullText.slice(dialogSeg.range[1], dialogSeg.range[1] + 30);

  // 模式 1：对话前 "X说道：" / "X道：" / "X说："
  // name 非贪婪 2-4 字；副词/动词按长度降序排列避免短词先吃；结尾必须冒号或逗号（排除句号，防跨句归因）
  const beforePattern = /([\u4e00-\u9fa5]{2,4}?)(?:微笑着|轻声|低声|高声|大声|微笑|冷冷|淡淡|缓缓|猛地|突然|继续|接着|微微|轻轻|默默|静静|淡然|冷然)?(?:笑了笑|想了想|顿了顿|继续道|接着道|补充道|说道|喝道|喊道|怒道|冷哼|轻哼|笑骂|打趣|反驳|附和|解释|询问|回答|嗤笑|讥讽|嘲笑|调侃|嘀咕|嘟囔|沉声|冷声|轻笑|大笑|冷笑|道|说|问|答|喊|叫|吼|喝|笑|叹)[：:，,]\s*$/;
  const m1 = beforeText.match(beforePattern);
  if (m1) return cleanName(m1[1]);

  // 模式 2：对话后 "，X说道。" / "X说。"
  const afterPattern = /^[，,。：:\s]*([\u4e00-\u9fa5]{2,4}?)(?:微笑着|轻声|低声|高声|大声|微笑|冷冷|淡淡|缓缓|猛地|突然|继续|接着|微微|轻轻|默默|静静|淡然|冷然)?(?:笑了笑|想了想|顿了顿|继续道|接着道|补充道|说道|喝道|喊道|怒道|冷哼|轻哼|笑骂|打趣|反驳|附和|解释|询问|回答|嗤笑|讥讽|嘲笑|调侃|嘀咕|嘟囔|沉声|冷声|轻笑|大笑|冷笑|道|说|问|答|喊|叫|吼|喝|笑|叹)/;
  const m2 = afterText.match(afterPattern);
  if (m2) return cleanName(m2[1]);

  // 模式 3：剧本式 "X：" 紧邻对话前
  const colonPattern = /([\u4e00-\u9fa5]{2,5})[：:]\s*$/;
  const m3 = beforeText.match(colonPattern);
  if (m3) return cleanName(m3[1]);

  return null;
}

function cleanName(name) {
  // 过滤掉明显不是名字的词（含会被单字动词误捕的高频二字词，如 "知道"→知+道）
  const stopWords = [
    '然后', '接着', '于是', '但是', '因为', '所以', '他们', '她们', '我们', '你们', '这个', '那个', '于是乎',
    '知道', '看到', '听到', '感到', '觉得', '发现', '明白', '认为', '开始', '准备',
    '已经', '还是', '只是', '就是', '不是', '便是', '即是', '虽说', '莫说', '话说', '且说'
  ];
  if (stopWords.includes(name)) return null;
  // 去掉前后可能的动词残留
  return name;
}

/**
 * 按句末标点切分过长段落
 */
function splitLongSegment(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const pieces = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      // 在 [start, end] 范围内向后找最近的句末标点
      const slice = text.slice(start, end);
      const punctRegex = /[。！？…；!?;]/g;
      let lastPunct = -1;
      let pm;
      while ((pm = punctRegex.exec(slice)) !== null) {
        lastPunct = pm.index;
      }
      if (lastPunct > 0) {
        end = start + lastPunct + 1;
      }
    }
    pieces.push(text.slice(start, end).trim());
    start = end;
  }
  return pieces.filter(Boolean);
}

/**
 * 重新分段（规则模式）
 */
function segmentNovelRule(id) {
  const novel = getNovel(id);
  if (!novel) return null;
  const settings = settingsService.get();
  const parsed = parseWithRules(novel.rawText || '', settings.parsing);
  // 保留旧角色的音色配置（按名字匹配）
  const oldCharMap = new Map((novel.characters || []).map((c) => [c.name, c]));
  parsed.characters = parsed.characters.map((c) => {
    const old = oldCharMap.get(c.name);
    if (old) {
      return {
        ...c,
        gender: old.gender || c.gender,
        description: old.description || c.description,
        voiceId: old.voiceId,
        voiceConfig: old.voiceConfig,
      };
    }
    return c;
  });
  novel.segments = parsed.segments;
  novel.characters = parsed.characters;
  return saveNovel(novel);
}

/**
 * LLM 智能分段（增量持久化 + 可取消可继续 + 只复用已有角色）
 *
 * 关键设计：
 * 1. 只复用已有角色（不创建/不覆盖 novel.characters），按名字匹配绑定 characterId；
 *    找不到同名角色 → characterId = null（段落显示 ⚠，用户手动选）
 * 2. 已有角色为空时默认抛 NO_CHARACTERS，让前端提示用户先提取/新建角色；
 *    opts.forceEmpty=true（用户执意）则继续，所有段落 characterId=null
 * 3. 长文本按 settings.parsing.llmChunkSize 切块，逐块调 LLM，每块完成立即持久化 + 推 chunk-persisted 事件
 * 4. 进度存 data/seg_progress/{novelId}.json，支持取消后继续；删除小说时清理
 *
 * opts: { signal, onProgress, continue, fresh, forceEmpty }
 *   - continue: 从进度文件记录的下一块接着分（不重置 segments）
 *   - fresh: 重新开始（清空已有 segments + 进度文件）
 *   - forceEmpty: 角色为空时强制继续（所有段落 characterId=null）
 */
async function segmentNovelLLM(id, opts = {}) {
  const novel = getNovel(id);
  if (!novel) return null;
  const settings = settingsService.get();
  if (!settings.llm.apiKey) {
    const err = new Error('未配置 LLM API Key，无法使用 LLM 智能分段');
    err.code = 'NO_API_KEY';
    throw err;
  }

  // 功能 2：已有角色为空时阻止（除非 forceEmpty）
  const hasChars = (novel.characters || []).length > 0;
  if (!hasChars && !opts.forceEmpty) {
    const err = new Error('当前没有角色，请先新建角色或用 LLM 提取角色');
    err.code = 'NO_CHARACTERS';
    throw err;
  }

  const chunkSize = settings.parsing.llmChunkSize || 2000;

  // 确定起始块索引
  let startChunkIndex = 0;
  let progress = null;
  if (opts.continue) {
    progress = getSegmentProgress(id);
    if (progress && !progress.completed) {
      // 用进度文件记录的 chunkSize 重新切分校验一致性
      const checkChunks = llmService.chunkText(novel.rawText || '', progress.chunkSize);
      if (checkChunks.length === progress.chunkTotal) {
        startChunkIndex = progress.chunkIndex; // 接着已完成的下一块
        // 继续：不重置 segments，接着已有 segments 追加
      } else {
        // 文本变了或设置不一致，重新开始
        startChunkIndex = 0;
        progress = null;
      }
    } else {
      progress = null;
    }
  }
  if (opts.fresh || (!opts.continue && !progress)) {
    // 重新开始：清空已有 segments + 进度文件
    novel.segments = [];
    saveNovel(novel);
    clearSegmentProgress(id);
    progress = null;
  }

  // 切分文本（用当前设置的 chunkSize）
  const chunks = llmService.chunkText(novel.rawText || '', chunkSize);
  const chunkTotal = chunks.length;
  if (chunkTotal === 0) {
    clearSegmentProgress(id);
    return novel;
  }

  // 新建或更新进度文件
  if (!progress) {
    progress = {
      novelId: id,
      chunkTotal,
      chunkIndex: 0,
      chunkSize,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    saveSegmentProgress(progress);
  }

  opts.onProgress && opts.onProgress({
    type: 'start', task: 'segment',
    chunkTotal, startChunkIndex,
  });

  // 计算 nextOrder（接着已有 segments 的最大 order + 1）
  let nextOrder = (novel.segments || []).reduce((max, s) => Math.max(max, s.order), -1) + 1;
  // 收集未匹配到已有角色的 characterName，结束后汇总提示用户
  const unmatchedNames = new Set();

  // 逐块处理
  for (let i = startChunkIndex; i < chunkTotal; i++) {
    if (opts.signal && opts.signal.aborted) {
      const err = new Error('已取消');
      err.code = 'ABORTED';
      throw err;
    }

    // 调 LLM 处理单块（segmentOneChunk 透传 opts.signal + opts.onProgress）
    const chunkSegs = await llmService.segmentOneChunk(chunks[i], i, chunkTotal, settings.llm, opts);

    // 转换为内部格式 + 角色匹配（只复用已有角色，找不到则 null）
    for (const s of chunkSegs) {
      const pieces = splitLongSegment(s.text, settings.parsing.maxSegmentLength || 200);
      for (const piece of pieces) {
        if (!piece) continue;
        const cid = hasChars ? matchCharacterId(s.characterName, novel.characters) : null;
        // 收集未匹配的 characterName（有角色列表 + LLM 给了名字但没匹配上）
        if (hasChars && s.characterName && !cid) unmatchedNames.add(s.characterName);
        // 累加对应角色的 appearances 计数（仅当成功匹配时）
        if (cid) {
          const matched = (novel.characters || []).find((c) => c.id === cid);
          if (matched) matched.appearances = (matched.appearances || 0) + 1;
        }
        novel.segments.push({
          id: shortId('s'),
          type: s.type,
          text: piece,
          characterId: cid,
          order: nextOrder++,
        });
      }
    }

    // 增量持久化：每块完成立即写盘 + 更新进度文件
    saveNovel(novel);
    progress.chunkIndex = i + 1;
    saveSegmentProgress(progress);

    // 推送增量进度（含 novel，前端直接刷新段落列表）
    opts.onProgress && opts.onProgress({
      type: 'chunk-persisted',
      chunkIndex: i + 1, chunkTotal,
      segmentsSoFar: novel.segments.length,
      novel,
    });
  }

  // 全部完成：若有未匹配的角色名，汇总提示用户（前端在实时输出日志区显示）
  if (unmatchedNames.size > 0) {
    opts.onProgress && opts.onProgress({
      type: 'warn',
      message: `以下角色名未匹配到已有角色（已置为未绑定）：${Array.from(unmatchedNames).join('、')}`,
    });
  }

  // 全部完成：清理进度文件
  progress.completed = true;
  clearSegmentProgress(id);

  // 完成后按 appearances 重排角色（仅排序，不删除/不重建）
  if (novel.characters) {
    novel.characters.sort((a, b) => (b.appearances || 0) - (a.appearances || 0));
  }
  saveNovel(novel);

  // 取消边缘保险（完成瞬间被取消）
  if (opts.signal && opts.signal.aborted) {
    const err = new Error('已取消');
    err.code = 'ABORTED';
    throw err;
  }
  return novel;
}

/**
 * 更新单个角色
 */
function updateCharacter(novelId, characterId, partial) {
  const novel = getNovel(novelId);
  if (!novel) return null;
  const c = (novel.characters || []).find((x) => x.id === characterId);
  if (!c) return null;
  if (typeof partial.name === 'string') c.name = partial.name;
  if (typeof partial.gender === 'string') c.gender = partial.gender;
  if (typeof partial.description === 'string') c.description = partial.description;
  if (typeof partial.voiceId === 'string') c.voiceId = partial.voiceId;
  if (partial.voiceConfig && typeof partial.voiceConfig === 'object') {
    c.voiceConfig = { ...c.voiceConfig, ...partial.voiceConfig };
  }
  saveNovel(novel);
  return c;
}

/**
 * LLM 提取角色清单（覆盖模式：删除所有旧角色及音色配置，用新列表重建）
 * 同时按名字换绑段落 characterId；找不到同名新角色的段落清空，让用户在 UI 手动选。
 * 返回整个 novel（含新段落 characterId + 新角色列表），供前端整体刷新。
 */
async function extractCharacters(novelId, opts = {}) {
  const novel = getNovel(novelId);
  if (!novel) return null;
  const settings = settingsService.get();
  if (!settings.llm.apiKey) {
    const err = new Error('未配置 LLM API Key');
    err.code = 'NO_API_KEY';
    throw err;
  }
  // 注意：llmService 期望 settings.llm 子对象（{ baseUrl, apiKey, model }），不能传整个 settings
  // 透传 opts（signal + onProgress）给下层，支持流式进度与取消
  const extracted = await llmService.extractCharacters(novel.rawText || '', settings.llm, opts);

  // === 覆盖模式：删除所有旧角色及音色配置，用 LLM 提取的新列表重建 ===
  // 1. 旧角色 ID→name 映射，用于段落换绑时反查旧名字
  const oldCharIdToName = new Map((novel.characters || []).map((c) => [c.id, c.name]));
  // 2. 用新列表重建 characters：每个角色生成新 ID，voiceId/voiceConfig 全部重置
  const newCharacters = extracted.map((ext) => ({
    id: shortId('c'),
    name: ext.name,
    description: ext.description || '',
    gender: ext.gender || 'unknown',
    voiceId: null,
    voiceConfig: { speed: 0, volume: 0 },
    appearances: 0,
  }));
  // 3. 新角色 name→id 映射，用于段落换绑
  const newCharNameToId = new Map(newCharacters.map((c) => [c.name, c.id]));
  // 4. 遍历段落：旧 characterId → 旧 name → 同名新角色 ID（换绑）；找不到则清空让用户手动选
  for (const seg of novel.segments || []) {
    if (seg.characterId) {
      const oldName = oldCharIdToName.get(seg.characterId);
      if (oldName && newCharNameToId.has(oldName)) {
        const newId = newCharNameToId.get(oldName);
        seg.characterId = newId;
        const newChar = newCharacters.find((c) => c.id === newId);
        if (newChar) newChar.appearances += 1;
      } else {
        seg.characterId = null; // 清空，UI 高亮提示手动选
      }
    }
  }
  // 5. 替换角色列表（按出现次数降序）
  novel.characters = newCharacters.sort((a, b) => b.appearances - a.appearances);
  // 取消后不写盘
  if (opts.signal && opts.signal.aborted) {
    const err = new Error('已取消');
    err.code = 'ABORTED';
    throw err;
  }
  saveNovel(novel);
  return novel;
}

/**
 * 更新单个段落（目前仅支持换绑 characterId，允许 null 清空）
 * characterId 非 null 时必须存在于 novel.characters 中，否则返回 null（视为非法）
 */
function updateSegment(novelId, segmentId, partial) {
  const novel = getNovel(novelId);
  if (!novel) return null;
  const seg = (novel.segments || []).find((s) => s.id === segmentId);
  if (!seg) return null;
  if (partial.characterId !== undefined) {
    const cid = partial.characterId || null;
    if (cid && !(novel.characters || []).some((c) => c.id === cid)) return null;
    seg.characterId = cid;
  }
  saveNovel(novel);
  return seg;
}

/**
 * 新增角色（手动添加，voiceId/voiceConfig 默认空，待用户配置）
 */
function addCharacter(novelId, partial) {
  const novel = getNovel(novelId);
  if (!novel) return null;
  const c = {
    id: shortId('c'),
    name: (partial && partial.name) || '新角色',
    description: (partial && partial.description) || '',
    gender: (partial && partial.gender) || 'unknown',
    voiceId: null,
    voiceConfig: { speed: 0, volume: 0 },
    appearances: 0,
  };
  novel.characters = novel.characters || [];
  novel.characters.push(c);
  saveNovel(novel);
  return c;
}

/**
 * 删除角色：移除角色 + 清空绑定到该角色的段落 characterId
 * 段落显示 ⚠ 未绑定，用户可在段落列表手动重绑
 */
function deleteCharacter(novelId, characterId) {
  const novel = getNovel(novelId);
  if (!novel) return null;
  const before = (novel.characters || []).length;
  novel.characters = (novel.characters || []).filter((c) => c.id !== characterId);
  if (novel.characters.length === before) return null; // 角色不存在
  // 清空绑定到该角色的段落 characterId
  for (const seg of novel.segments || []) {
    if (seg.characterId === characterId) seg.characterId = null;
  }
  saveNovel(novel);
  return true;
}

/**
 * LLM 一键自动匹配角色音色
 */
async function autoMatchVoices(novelId, opts = {}) {
  const novel = getNovel(novelId);
  if (!novel) return null;
  // 透传 opts（signal + onProgress）给 characterService.autoMatch
  await characterService.autoMatch(novel, opts);
  // 取消后不写盘
  if (opts.signal && opts.signal.aborted) {
    const err = new Error('已取消');
    err.code = 'ABORTED';
    throw err;
  }
  saveNovel(novel);
  return novel.characters;
}

module.exports = {
  listNovels,
  getNovel,
  createNovel,
  updateNovel,
  deleteNovel,
  saveNovel,
  segmentNovelRule,
  segmentNovelLLM,
  updateCharacter,
  addCharacter,
  deleteCharacter,
  updateSegment,
  extractCharacters,
  autoMatchVoices,
  getSegmentProgress,
  clearSegmentProgress,
  parseWithRules, // 导出便于测试
};
