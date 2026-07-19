// OpenAI TTS 服务（tts-1 / tts-1-hd / gpt-4o-mini-tts）
// 文档：https://platform.openai.com/docs/guides/text-to-speech
//
// 特性：
//   - 13 个固定预制音色（alloy/echo/fable/onyx/nova/shimmer/ash/coral/sage/ballad/verse/marin/cedar）
//   - gpt-4o-mini-tts 支持 instructions 指令式音色设计（自然语言描述音色风格/情感）
//   - 不支持复刻（API 限制）
//   - 不支持流式返回（response 直接是音频二进制流），按 15KB 切片 yield 以兼容 WS 分块推送协议
//
// 音频标签处理：[高兴] 等方括号标签通过 extractExpressionContexts 提取为情感指令，
//   拼入 instructions（仅 gpt-4o-mini-tts 生效）；stripExpressionTags 清理后作为 input 文本。

const logger = require('../../utils/logger');
const settingsService = require('../settingsService');
const audioCache = require('../audioCacheService');
const { TTSError } = require('./ttsError');

// WS 推送分块大小（与缓存命中路径一致：15KB）
const CHUNK_SIZE = 15 * 1024;

// 支持 instructions 的模型
const INSTRUCTIONS_MODELS = new Set(['gpt-4o-mini-tts']);

/**
 * 流式合成（实际为非流式请求，结果按 15KB 切片 yield）
 * @param {string} text 待合成文本
 * @param {string} speaker 音色 id（如 onyx/alloy/nova）
 * @param {object} [opts] { speed, volume, signal }
 * @yields {Buffer}
 */
async function* synthesizeStream(text, speaker, opts = {}) {
  const settings = settingsService.get();
  const openai = (settings.tts && settings.tts.providers && settings.tts.providers.openai) || {};
  const apiKey = openai.apiKey;
  if (!apiKey) {
    throw new TTSError('未配置 OpenAI TTS API Key，请在设置页填写', 'NO_API_KEY');
  }
  const baseUrl = openai.baseUrl || 'https://api.openai.com/v1/audio/speech';
  const model = openai.model || 'gpt-4o-mini-tts';
  const audioFormat = openai.audioFormat || 'mp3';

  if (!speaker) {
    throw new TTSError('OpenAI TTS 缺少音色 id（speaker）', 'NO_VOICE');
  }

  // 文本预处理：清理方括号标签（标签内容会拼入 instructions）
  const cleanText = audioCache.stripExpressionTags(text);
  if (!cleanText) {
    throw new TTSError('OpenAI TTS 文本为空（清理标签后）', 'EMPTY_TEXT');
  }

  // 构造 payload
  const payload = {
    model,
    input: cleanText,
    voice: speaker,
    response_format: audioFormat,
  };

  // speed：项目 -50~100 → OpenAI 0.25~4.0（用 1 + speed/100 映射到 0.5~2.0，更安全）
  if (typeof opts.speed === 'number' && opts.speed !== 0) {
    const s = 1 + opts.speed / 100;
    payload.speed = Math.max(0.25, Math.min(4.0, s));
  }

  // instructions：仅 gpt-4o-mini-tts 生效
  // 拼接顺序：全局指令 + 标签提取的情感指令
  if (INSTRUCTIONS_MODELS.has(model)) {
    const parts = [];
    const globalInstr = (openai.instructions || '').trim();
    if (globalInstr) parts.push(globalInstr);
    const contexts = audioCache.extractExpressionContexts(text);
    if (contexts.length > 0) {
      parts.push(`情感/表现力指令：${contexts.join('；')}。`);
    }
    if (parts.length > 0) {
      payload.instructions = parts.join('\n');
    }
  }

  const logCtx = `[openai/${model}]`;
  logger.info(`${logCtx} TTS request: voice=${speaker}, textLen=${text.length}, hasInstr=${!!payload.instructions}`);

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
    throw new TTSError(`OpenAI 网络请求失败: ${err.message}`, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    logger.warn(`${logCtx} HTTP ${response.status}: ${errText.slice(0, 500)}`);
    throw new TTSError(`OpenAI HTTP ${response.status}: ${errText.slice(0, 300)}`, 'HTTP_ERROR');
  }

  // 响应直接是音频二进制流
  let audioBuffer;
  try {
    const arrayBuf = await response.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuf);
  } catch (err) {
    if (err.name === 'AbortError') throw new TTSError('TTS 请求被取消', 'ABORTED');
    throw new TTSError(`OpenAI 读取音频流失败: ${err.message}`, 'BAD_RESPONSE');
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new TTSError('OpenAI 未返回任何音频数据', 'NO_AUDIO');
  }

  logger.info(`${logCtx} TTS ok: ${audioBuffer.length} bytes`);

  // 按 15KB 切片 yield
  for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
    if (opts.signal && opts.signal.aborted) {
      throw new TTSError('TTS 请求被取消', 'ABORTED');
    }
    yield audioBuffer.subarray(i, Math.min(i + CHUNK_SIZE, audioBuffer.length));
  }
}

module.exports = { synthesizeStream };
