// 角色音色匹配服务：LLM 推荐 + 规则校验 + 冲突解决
const { VOICES, findByGender, findById } = require('../config/voices');
const llmService = require('./llmService');
const settingsService = require('./settingsService');
const logger = require('../utils/logger');

/**
 * 为小说的所有角色自动匹配音色（就地修改 novel.characters）
 * @param {object} novel - novel 对象（会被修改）
 * @returns {Promise<object>} novel
 */
async function autoMatch(novel, opts = {}) {
  const settings = settingsService.get();
  if (!settings.llm.apiKey) {
    const err = new Error('未配置 LLM API Key，无法使用自动匹配');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const characters = novel.characters || [];
  if (characters.length === 0) {
    // 空角色列表：emit warn 让前端模态框有明确反馈，而非从"准备中"直接跳"完成"
    if (opts.onProgress) opts.onProgress({ type: 'warn', message: '暂无角色需要匹配' });
    return novel;
  }

  // 只为还没分配音色或性别未知的角色请求 LLM
  // 实际上：让 LLM 全部推荐一遍，但保留用户已手动设置的（标记为 locked）
  const toMatch = characters.map((c) => ({
    name: c.name,
    gender: c.gender || 'unknown',
    description: c.description || '',
  }));

  let matches = [];
  try {
    // 透传 opts（signal + onProgress + concurrency）给 recommendVoices
    const characterConcurrency = Math.max(1, Math.min(10,
      (settings.parsing && settings.parsing.characterConcurrency) || 3));
    matches = await llmService.recommendVoices(
      toMatch, VOICES, settings.llm, { ...opts, concurrency: characterConcurrency }
    );
  } catch (err) {
    // 用户取消：不降级，直接抛出
    if (err.code === 'ABORTED') throw err;
    logger.error(`LLM recommendVoices failed: ${err.message}`);
    // LLM 真失败才降级规则匹配，并通过 onProgress 通知前端
    if (opts.onProgress) opts.onProgress({ type: 'fallback', message: `LLM 失败（${err.message}），降级规则匹配` });
    matches = ruleBasedMatch(toMatch);
  }

  // 应用匹配结果，做校验与冲突解决
  const usedVoiceIds = new Set();
  // 先收集用户已锁定（已设置 voiceId）的，避免被覆盖
  for (const c of characters) {
    if (c.voiceId) usedVoiceIds.add(c.voiceId);
  }

  const matchMap = new Map();
  for (const m of matches) {
    if (m.name && m.voiceId) matchMap.set(m.name, m);
  }

  for (const c of characters) {
    // 用户已设置且未要求覆盖 → 保留
    if (c.voiceId) continue;

    const m = matchMap.get(c.name);
    let voiceId = m && m.voiceId;

    // 校验 1：音色存在
    if (voiceId && !findById(voiceId)) {
      logger.warn(`Voice ${voiceId} not in catalog, falling back`);
      voiceId = null;
    }

    // 校验 2：性别一致
    if (voiceId && c.gender && c.gender !== 'unknown') {
      const v = findById(voiceId);
      if (v && v.gender !== c.gender) {
        logger.warn(`Voice ${voiceId} gender mismatch for ${c.name}, falling back`);
        voiceId = null;
      }
    }

    // 校验 3：冲突解决（同小说内尽量不重复）
    if (voiceId && usedVoiceIds.has(voiceId)) {
      const fallback = pickFallback(c, usedVoiceIds);
      voiceId = fallback;
    }

    if (voiceId) {
      c.voiceId = voiceId;
      usedVoiceIds.add(voiceId);
    } else {
      // 最终兜底
      const fallback = pickFallback(c, usedVoiceIds);
      if (fallback) {
        c.voiceId = fallback;
        usedVoiceIds.add(fallback);
      }
    }
  }

  return novel;
}

/**
 * 规则匹配（LLM 失败时降级用）：按性别轮询分配
 */
function ruleBasedMatch(characters) {
  const femaleVoices = findByGender('female');
  const maleVoices = findByGender('male');
  let fIdx = 0;
  let mIdx = 0;
  return characters.map((c) => {
    let voiceId;
    if (c.gender === 'female') {
      voiceId = femaleVoices[fIdx++ % femaleVoices.length].id;
    } else if (c.gender === 'male') {
      voiceId = maleVoices[mIdx++ % maleVoices.length].id;
    } else {
      // 未知性别，按出现顺序轮询
      const pool = (fIdx + mIdx) % 2 === 0 ? femaleVoices : maleVoices;
      const idx = ((fIdx + mIdx) % 2 === 0 ? fIdx++ : mIdx++);
      voiceId = pool[idx % pool.length].id;
    }
    return { name: c.name, voiceId, reason: '规则匹配（LLM 不可用）' };
  });
}

/**
 * 从未使用的音色里挑一个兜底
 */
function pickFallback(character, usedVoiceIds) {
  const gender = character.gender || 'unknown';
  let pool;
  if (gender === 'female') pool = findByGender('female');
  else if (gender === 'male') pool = findByGender('male');
  else pool = VOICES;

  // 优先选未用过的
  for (const v of pool) {
    if (!usedVoiceIds.has(v.id)) return v.id;
  }
  // 都用过了就取第一个
  return pool.length > 0 ? pool[0].id : null;
}

module.exports = {
  autoMatch,
  ruleBasedMatch,
  pickFallback,
};
