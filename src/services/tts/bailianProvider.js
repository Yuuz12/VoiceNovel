// 阿里云百炼 CosyVoice TTS 服务（cosyvoice-v3-flash / cosyvoice-v2 等）
// 文档：https://help.aliyun.com/zh/model-studio/developer-reference/cosyvoice-large-model-for-speech-synthesis
//
// 三种模式（settings.tts.providers.bailian.mode）：
//   preset       → 使用预置音色（input.voice=音色 id，如 longanyang）
//   voicedesign  → 使用设计生成的 voice_id（用户在百炼平台预生成后填入 cloneVoiceId 字段）
//   voiceclone   → 使用复刻获得的 voice_id（同上，UI 与 voicedesign 共用 voice_id 输入框）
//
// 关键约束：
//   - voicedesign/voiceclone 都需要用户先在百炼平台生成 voice_id 后手动填入
//   - 旁白/角色配置中 voicedesign/voiceclone 模式统一使用 voiceConfig.bailian.cloneVoiceId 字段
//
// 音频标签处理：[高兴] 等方括号标签通过 extractExpressionContexts 提取，
//   映射为 input.instruction（"你说话的情感是xxx。"格式，CosyVoice V3 支持）。

const logger = require('../../utils/logger');
const settingsService = require('../settingsService');
const audioCache = require('../audioCacheService');
const { TTSError } = require('./ttsError');

const CHUNK_SIZE = 15 * 1024;

// 标签 → 情感关键词映射（用于 instruction）
const EMOTION_MAP = {
  '高兴': '高兴',
  '开心': '高兴',
  '快乐': '高兴',
  '悲伤': '悲伤',
  '伤心': '悲伤',
  '愤怒': '愤怒',
  '生气': '愤怒',
  '害怕': '害怕',
  '恐惧': '害怕',
  '厌恶': '厌恶',
  '反感': '厌恶',
  '惊讶': '惊讶',
  '震惊': '惊讶',
  '平静': '平静',
  '冷静': '平静',
  '中性': '平静',
};

/**
 * 从文本标签提取第一个匹配的情感关键词
 */
function pickEmotion(text) {
  const contexts = audioCache.extractExpressionContexts(text);
  if (!contexts.length) return '';
  for (const ctx of contexts) {
    for (const [kw, emo] of Object.entries(EMOTION_MAP)) {
      if (ctx.includes(kw)) return emo;
    }
  }
  return '';
}

/**
 * 流式合成（实际为非流式请求，结果按 15KB 切片 yield）
 * @param {string} text 待合成文本
 * @param {string} speaker voice 选择器（preset=音色 id / voicedesign|voiceclone=voice_id）
 * @param {object} [opts] { speed, volume, signal }
 * @yields {Buffer}
 */
async function* synthesizeStream(text, speaker, opts = {}) {
  const settings = settingsService.get();
  const bailian = (settings.tts && settings.tts.providers && settings.tts.providers.bailian) || {};
  const apiKey = bailian.apiKey;
  if (!apiKey) {
    throw new TTSError('未配置阿里云百炼 TTS API Key（DASHSCOPE_API_KEY），请在设置页填写', 'NO_API_KEY');
  }
  const baseUrl = bailian.baseUrl || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/text-to-audio';
  const model = bailian.model || 'cosyvoice-v3-flash';
  const audioFormat = bailian.audioFormat || 'mp3';
  const sampleRate = bailian.sampleRate || 24000;

  if (!speaker) {
    throw new TTSError('百炼 TTS 缺少 voice（speaker）', 'NO_VOICE');
  }

  // 文本预处理
  const cleanText = audioCache.stripExpressionTags(text);
  if (!cleanText) {
    throw new TTSError('百炼 TTS 文本为空（清理标签后）', 'EMPTY_TEXT');
  }

  // 构造 input
  const input = {
    text: cleanText,
    voice: speaker,
    format: audioFormat,
    sample_rate: sampleRate,
  };
  // rate：项目 -50~100 → 百炼 -0.5~2.0（rate/100）
  if (typeof opts.speed === 'number' && opts.speed !== 0) {
    input.rate = Math.max(-0.5, Math.min(2.0, opts.speed / 100));
  }
  // volume：项目 -50~100 → 百炼 0~100（50 + vol）
  if (typeof opts.volume === 'number' && opts.volume !== 0) {
    input.volume = Math.max(0, Math.min(100, 50 + opts.volume));
  }
  // instruction：从标签提取情感（CosyVoice V3 支持）
  const emotion = pickEmotion(text);
  if (emotion) {
    input.instruction = `你说话的情感是${emotion}。`;
  }

  const payload = { model, input };

  const logCtx = `[bailian/${model}]`;
  logger.info(`${logCtx} TTS request: voice=${speaker}, textLen=${text.length}, emotion=${emotion || '-'}`);

  let response;
  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new TTSError('TTS 请求被取消', 'ABORTED');
    throw new TTSError(`百炼网络请求失败: ${err.message}`, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    logger.warn(`${logCtx} HTTP ${response.status}: ${errText.slice(0, 500)}`);
    throw new TTSError(`百炼 HTTP ${response.status}: ${errText.slice(0, 300)}`, 'HTTP_ERROR');
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new TTSError(`百炼响应 JSON 解析失败: ${err.message}`, 'BAD_RESPONSE');
  }

  // 百炼响应：data.output.audio.url（公网 URL）或 data.output.audio.data（base64）
  // 兼容 data.data.url / data.data.audio 等变体
  const audioBuffer = await extractAudioBuffer(data, opts.signal);
  if (!audioBuffer || audioBuffer.length === 0) {
    logger.warn(`${logCtx} 无音频数据，响应: ${JSON.stringify(data).slice(0, 800)}`);
    throw new TTSError('百炼未返回任何音频数据', 'NO_AUDIO');
  }

  logger.info(`${logCtx} TTS ok: ${audioBuffer.length} bytes`);

  for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
    if (opts.signal && opts.signal.aborted) {
      throw new TTSError('TTS 请求被取消', 'ABORTED');
    }
    yield audioBuffer.subarray(i, Math.min(i + CHUNK_SIZE, audioBuffer.length));
  }
}

/**
 * 防御性解析音频：
 *   - data.output.audio.url（公网 URL，需 fetch 下载）
 *   - data.output.audio.data（base64）
 *   - data.data.url / data.data.audio（变体）
 */
async function extractAudioBuffer(data, signal) {
  const output = data && data.output;
  const audioObj = output && output.audio;
  // URL 路径
  let url = '';
  if (audioObj && typeof audioObj === 'object') {
    if (typeof audioObj.url === 'string') url = audioObj.url;
  } else if (typeof audioObj === 'string') {
    // 可能直接是 url
    if (/^https?:\/\//.test(audioObj)) url = audioObj;
  }
  if (output && typeof output.url === 'string') url = output.url;
  if (data && data.data && typeof data.data === 'object') {
    if (typeof data.data.url === 'string') url = data.data.url;
  }
  if (url) {
    try {
      const r = await fetch(url, { signal });
      if (r.ok) {
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        if (buf.length > 0) return buf;
      }
    } catch (err) {
      if (err.name === 'AbortError') throw new TTSError('TTS 请求被取消', 'ABORTED');
      // URL 下载失败，继续尝试 base64 路径
    }
  }
  // base64 路径
  const b64Candidates = [];
  if (audioObj && typeof audioObj === 'object') {
    if (typeof audioObj.data === 'string') b64Candidates.push(audioObj.data);
  }
  if (output && typeof output.data === 'string') b64Candidates.push(output.data);
  if (data && data.data && typeof data.data === 'object') {
    if (typeof data.data.audio === 'string') b64Candidates.push(data.data.audio);
  }
  for (const b64 of b64Candidates) {
    try {
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 0) return buf;
    } catch (_) {}
  }
  return null;
}

module.exports = { synthesizeStream };
