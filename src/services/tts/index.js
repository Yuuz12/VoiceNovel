// TTS Provider 调度器
// 读 settings.tts.provider，分发到对应 provider 实现。
// 支持 5 个 provider：volcano / mimo / openai / minimax / bailian
// 导出与旧 TTSService.js 同名的 { TTSError, synthesizeStream, synthesize }，调用方零改动。
const settingsService = require('../settingsService');
const { TTSError } = require('./ttsError');
const volcano = require('./volcanoProvider');
const mimo = require('./mimoProvider');
const openai = require('./openaiProvider');
const minimax = require('./minimaxProvider');
const bailian = require('./bailianProvider');

const PROVIDERS = { volcano, mimo, openai, minimax, bailian };

function getProvider(name) {
  const settings = settingsService.get();
  const providerName = name || (settings.tts && settings.tts.provider) || 'volcano';
  const impl = PROVIDERS[providerName];
  if (!impl) {
    throw new TTSError(`未知的 TTS provider: ${providerName}`, 'UNKNOWN_PROVIDER');
  }
  return impl;
}

/**
 * 流式合成：异步生成器，逐块 yield Buffer
 * 透传给当前 provider 的 synthesizeStream(text, speaker, opts)
 */
async function* synthesizeStream(text, speaker, opts = {}) {
  const impl = getProvider();
  yield* impl.synthesizeStream(text, speaker, opts);
}

/**
 * 一次性合成：返回完整 Buffer（聚合流）
 */
async function synthesize(text, speaker, opts = {}) {
  const chunks = [];
  for await (const chunk of synthesizeStream(text, speaker, opts)) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = {
  TTSError,
  synthesizeStream,
  synthesize,
};
