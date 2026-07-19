// MiniMax TTS 服务（speech-02-hd / speech-01-turbo 等）
// 文档：https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
//
// 三种模式（settings.tts.providers.minimax.mode）：
//   preset       → 使用预置系统音色（voice_setting.voice_id=音色 id，如 male-qn-qingse）
//   voicedesign  → 使用设计生成的 voice_id（用户在 MiniMax 平台预生成后填入 cloneVoiceId 字段）
//   voiceclone   → 使用复刻获得的 voice_id（同上，UI 与 voicedesign 共用 voice_id 输入框）
//
// 关键约束：
//   - voicedesign/voiceclone 都需要用户先在 MiniMax 平台生成 voice_id 后手动填入
//     （后端不实时调用 voice_design 接口，避免缓存复杂性与额外成本）
//   - 旁白/角色配置中 voicedesign/voiceclone 模式统一使用 voiceConfig.minimax.cloneVoiceId 字段
//
// 音频标签处理：[高兴] 等方括号标签通过 extractExpressionContexts 提取，
//   映射到 voice_setting.emotion（happy/sad/angry/fearful/disgusted/surprised/calm/neutral）。

const logger = require('../../utils/logger');
const settingsService = require('../settingsService');
const audioCache = require('../audioCacheService');
const { TTSError } = require('./ttsError');

// WS 推送分块大小
const CHUNK_SIZE = 15 * 1024;

// 标签 → MiniMax emotion 映射
const EMOTION_MAP = {
  '高兴': 'happy',
  '开心': 'happy',
  '快乐': 'happy',
  '悲伤': 'sad',
  '伤心': 'sad',
  '愤怒': 'angry',
  '生气': 'angry',
  '害怕': 'fearful',
  '恐惧': 'fearful',
  '厌恶': 'disgusted',
  '反感': 'disgusted',
  '惊讶': 'surprised',
  '震惊': 'surprised',
  '平静': 'calm',
  '冷静': 'calm',
  '中性': 'neutral',
};

/**
 * 从文本标签提取第一个匹配的 emotion
 */
function pickEmotion(text) {
  const contexts = audioCache.extractExpressionContexts(text);
  if (!contexts.length) return '';
  for (const ctx of contexts) {
    // 直接匹配关键词
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
  const minimax = (settings.tts && settings.tts.providers && settings.tts.providers.minimax) || {};
  const apiKey = minimax.apiKey;
  if (!apiKey) {
    throw new TTSError('未配置 MiniMax TTS API Key，请在设置页填写', 'NO_API_KEY');
  }
  const baseUrl = minimax.baseUrl || 'https://api.minimaxi.com/v1/t2a_v2';
  const model = minimax.model || 'speech-02-hd';
  const audioFormat = minimax.audioFormat || 'mp3';
  const sampleRate = minimax.sampleRate || 32000;

  if (!speaker) {
    throw new TTSError('MiniMax TTS 缺少 voice_id（speaker）', 'NO_VOICE');
  }

  // 文本预处理
  const cleanText = audioCache.stripExpressionTags(text);
  if (!cleanText) {
    throw new TTSError('MiniMax TTS 文本为空（清理标签后）', 'EMPTY_TEXT');
  }

  // 构造 voice_setting
  const voiceSetting = { voice_id: speaker };
  // speed：项目 -50~100 → MiniMax 0.5~2.0
  if (typeof opts.speed === 'number' && opts.speed !== 0) {
    voiceSetting.speed = Math.max(0.5, Math.min(2.0, 1 + opts.speed / 100));
  }
  // vol：项目 -50~100 → MiniMax 0~10（默认 5）
  if (typeof opts.volume === 'number' && opts.volume !== 0) {
    voiceSetting.vol = Math.max(0, Math.min(10, 5 + opts.volume / 20));
  }
  // emotion：从标签提取
  const emotion = pickEmotion(text);
  if (emotion) voiceSetting.emotion = emotion;

  const payload = {
    model,
    text: cleanText,
    voice_setting: voiceSetting,
    audio_setting: {
      sample_rate: sampleRate,
      format: audioFormat,
    },
    stream: false,
  };

  const logCtx = `[minimax/${model}]`;
  logger.info(`${logCtx} TTS request: voice_id=${speaker}, textLen=${text.length}, emotion=${emotion || '-'}`);

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
    throw new TTSError(`MiniMax 网络请求失败: ${err.message}`, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    logger.warn(`${logCtx} HTTP ${response.status}: ${errText.slice(0, 500)}`);
    throw new TTSError(`MiniMax HTTP ${response.status}: ${errText.slice(0, 300)}`, 'HTTP_ERROR');
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new TTSError(`MiniMax 响应 JSON 解析失败: ${err.message}`, 'BAD_RESPONSE');
  }

  // MiniMax 响应：data.audio 是 hex 编码字符串；额外兼容 data.data.base64 / data.data.audio
  const audioBuffer = extractAudioBuffer(data);
  if (!audioBuffer || audioBuffer.length === 0) {
    logger.warn(`${logCtx} 无音频数据，响应: ${JSON.stringify(data).slice(0, 800)}`);
    throw new TTSError('MiniMax 未返回任何音频数据', 'NO_AUDIO');
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
 *   - data.audio（hex 字符串，MiniMax t2a_v2 标准格式）
 *   - data.data.audio / data.data.base64（hex 或 base64 变体）
 *   - data.extra_info.audio_info 等（不处理）
 */
function extractAudioBuffer(data) {
  // 标准 hex 路径
  if (data && typeof data.audio === 'string' && data.audio.length > 0) {
    try {
      const buf = Buffer.from(data.audio, 'hex');
      if (buf.length > 0) return buf;
    } catch (_) {}
    // 可能是 base64
    try {
      const buf = Buffer.from(data.audio, 'base64');
      if (buf.length > 0) return buf;
    } catch (_) {}
  }
  // 变体
  const inner = data && data.data;
  if (inner && typeof inner === 'object') {
    if (typeof inner.audio === 'string') {
      try {
        const buf = Buffer.from(inner.audio, 'hex');
        if (buf.length > 0) return buf;
      } catch (_) {}
      try {
        const buf = Buffer.from(inner.audio, 'base64');
        if (buf.length > 0) return buf;
      } catch (_) {}
    }
    if (typeof inner.base64 === 'string') {
      try {
        const buf = Buffer.from(inner.base64, 'base64');
        if (buf.length > 0) return buf;
      } catch (_) {}
    }
  }
  return null;
}

module.exports = { synthesizeStream };
