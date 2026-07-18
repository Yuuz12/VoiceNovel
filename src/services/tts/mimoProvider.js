// 小米 MIMO TTS 服务（MiMo-V2.5-TTS 系列）
// OpenAI 兼容 chat/completions 端点，非流式 mp3
// 文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
//
// 三种模式（settings.tts.providers.mimo.mode）：
//   preset       → mimo-v2.5-tts            使用预置精品音色（speaker=音色名，如 冰糖/Chloe）
//   voicedesign  → mimo-v2.5-tts-voicedesign 通过文本描述定制音色（speaker=描述文本，放 role:user）
//   voiceclone   → mimo-v2.5-tts-voiceclone  基于音频样本复刻（speaker=样本文件路径，读文件转 base64 放 audio.voice）
//
// 关键规则（来自官方文档）：
//   - 目标文本放 role:assistant 的 content
//   - 风格指令/设计描述放 role:user 的 content（voicedesign 时必填）
//   - audio.voice：preset=音色名；voicedesign=不传；voiceclone=data:{mime};base64,{b64}
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const settingsService = require('../settingsService');
const { TTSError } = require('./ttsError');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const VOICE_SAMPLES_DIR = path.join(DATA_DIR, 'voice_samples');

const MODEL_BY_MODE = {
  preset: 'mimo-v2.5-tts',
  voicedesign: 'mimo-v2.5-tts-voicedesign',
  voiceclone: 'mimo-v2.5-tts-voiceclone',
};

// 扩展名 → MIME 映射（voiceclone 的 audio.voice 需带 data URI 前缀）
const MIME_BY_EXT = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};

// WS 推送分块大小（与缓存命中路径一致：15KB，且为 3 的倍数以保证 base64 无 padding 拼接问题）
const CHUNK_SIZE = 15 * 1024;

/**
 * 流式合成（实际为非流式请求，结果按 15KB 切片 yield，以兼容 WS 分块推送协议）
 * @param {string} text 待合成文本（放 role:assistant）
 * @param {string} speaker voice 选择器（preset=音色名 / voicedesign=描述 / voiceclone=样本路径）
 * @param {object} [opts] { signal }
 * @yields {Buffer}
 */
async function* synthesizeStream(text, speaker, opts = {}) {
  const settings = settingsService.get();
  const mimo = (settings.tts && settings.tts.providers && settings.tts.providers.mimo) || {};
  const apiKey = mimo.apiKey;
  if (!apiKey) {
    throw new TTSError('未配置小米 MIMO TTS API Key，请在设置页填写', 'NO_API_KEY');
  }
  const baseUrl = mimo.baseUrl || 'https://api.xiaomimimo.com/v1/chat/completions';
  const mode = mimo.mode || 'preset';
  const model = MODEL_BY_MODE[mode];
  if (!model) {
    throw new TTSError(`未知的 MIMO 模式: ${mode}`, 'BAD_MODE');
  }
  const audioFormat = mimo.audioFormat || 'mp3';
  const styleInstruction = (mimo.styleInstruction || '').trim();

  // 构造 messages
  const messages = [];
  if (mode === 'voicedesign') {
    // voicedesign：speaker 即描述文本，必填，放 role:user
    if (!speaker || !String(speaker).trim()) {
      throw new TTSError('音色设计模式缺少描述文本（role:user 必填）', 'NO_VOICE_DESC');
    }
    messages.push({ role: 'user', content: String(speaker) });
  } else {
    // preset / voiceclone：可选全局风格指令放 role:user
    if (styleInstruction) {
      messages.push({ role: 'user', content: styleInstruction });
    }
  }
  // 目标文本放 role:assistant
  messages.push({ role: 'assistant', content: text });

  // 构造 audio 参数
  const audio = { format: audioFormat };
  if (mode === 'preset') {
    if (!speaker) {
      throw new TTSError('预置音色模式缺少音色名（speaker）', 'NO_VOICE');
    }
    audio.voice = String(speaker);
  } else if (mode === 'voiceclone') {
    // speaker = 样本文件路径（相对 voice_samples 目录的文件名）
    const sampleData = readVoiceSample(speaker);
    audio.voice = `data:${sampleData.mime};base64,${sampleData.base64}`;
  }
  // voicedesign: 不传 audio.voice

  const payload = {
    model,
    messages,
    audio,
    stream: false,
  };

  const logCtx = `[mimo/${mode}]`;
  logger.info(`${logCtx} TTS request: model=${model}, textLen=${text.length}, voice=${mode === 'voicedesign' ? '(design)' : mode === 'voiceclone' ? '(clone)' : speaker}`);

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
    throw new TTSError(`MIMO 网络请求失败: ${err.message}`, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    logger.warn(`${logCtx} HTTP ${response.status}: ${errText.slice(0, 500)}`);
    throw new TTSError(`MIMO HTTP ${response.status}: ${errText.slice(0, 300)}`, 'HTTP_ERROR');
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new TTSError(`MIMO 响应 JSON 解析失败: ${err.message}`, 'BAD_RESPONSE');
  }

  const audioBuffer = extractAudioBuffer(data);
  if (!audioBuffer || audioBuffer.length === 0) {
    logger.warn(`${logCtx} 无音频数据，响应: ${JSON.stringify(data).slice(0, 800)}`);
    throw new TTSError('MIMO 未返回任何音频数据', 'NO_AUDIO');
  }

  logger.info(`${logCtx} TTS ok: ${audioBuffer.length} bytes`);

  // 按 15KB 切片 yield（与缓存命中路径一致，便于 WS 分块推送 + base64 拼接）
  for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
    if (opts.signal && opts.signal.aborted) {
      throw new TTSError('TTS 请求被取消', 'ABORTED');
    }
    yield audioBuffer.subarray(i, Math.min(i + CHUNK_SIZE, audioBuffer.length));
  }
}

/**
 * 防御性解析音频 base64：兼容多种响应形态
 *   - choices[0].message.audio.data  (标准 OpenAI audio 形态)
 *   - choices[0].message.audio       (直接为 base64 字符串)
 *   - choices[0].message.audio       (为 { id, data, format } 等，取 data/b64)
 *   - data.audio / data.b64          (顶层变体)
 */
function extractAudioBuffer(data) {
  const candidates = [];
  const choice = data && data.choices && data.choices[0];
  const msg = choice && choice.message;
  const audioObj = msg && msg.audio;
  if (audioObj && typeof audioObj === 'object') {
    if (typeof audioObj.data === 'string') candidates.push(audioObj.data);
    if (typeof audioObj.b64_json === 'string') candidates.push(audioObj.b64_json);
  } else if (typeof audioObj === 'string') {
    candidates.push(audioObj);
  }
  if (msg && typeof msg.audio_data === 'string') candidates.push(msg.audio_data);
  if (typeof data.data === 'string') candidates.push(data.data);
  if (typeof data.audio === 'string') candidates.push(data.audio);
  if (typeof data.b64 === 'string') candidates.push(data.b64);

  for (const raw of candidates) {
    // 去掉可能的 data URI 前缀
    const b64 = raw.indexOf(',') >= 0 && raw.startsWith('data:') ? raw.split(',')[1] : raw;
    try {
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 0) return buf;
    } catch (_) {}
  }
  return null;
}

/**
 * 读取 voiceclone 样本文件 → { base64, mime }
 * @param {string} relPath 相对 voice_samples 目录的文件名（或已含目录的相对路径）
 */
function readVoiceSample(relPath) {
  if (!relPath || typeof relPath !== 'string') {
    throw new TTSError('音色复刻模式缺少样本文件', 'NO_SAMPLE');
  }
  // 防路径穿越：解析后必须仍在 VOICE_SAMPLES_DIR 内
  const abs = path.resolve(VOICE_SAMPLES_DIR, path.basename(relPath));
  if (!abs.startsWith(VOICE_SAMPLES_DIR) || !fs.existsSync(abs)) {
    throw new TTSError(`音色样本文件不存在: ${relPath}`, 'SAMPLE_NOT_FOUND');
  }
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'audio/mpeg';
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch (err) {
    throw new TTSError(`读取音色样本失败: ${err.message}`, 'SAMPLE_READ_ERROR');
  }
  return { base64: buf.toString('base64'), mime };
}

module.exports = { synthesizeStream, VOICE_SAMPLES_DIR };
