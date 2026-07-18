// 音色解析：根据 provider + mimo.mode 把角色/旁白的音色配置解析为 provider 可理解的 speaker 字符串
// speaker 语义：
//   volcano / mimo-preset       → voiceId（音色名）
//   mimo voicedesign            → voiceConfig.mimo.designDescription（描述文本）
//   mimo voiceclone             → voiceConfig.mimo.cloneSamplePath（样本文件路径）

/**
 * 取当前 provider 与 mimo 模式
 */
function getProviderMode(settings) {
  const tts = settings.tts || {};
  const provider = tts.provider || 'volcano';
  const mimoMode = (tts.providers && tts.providers.mimo && tts.providers.mimo.mode) || 'preset';
  return { provider, mimoMode };
}

/**
 * 把一个音色持有者（角色或旁白 settings.narration）解析为 speaker 字符串
 * @param {object} voiceHolder - 含 voiceId 与 voiceConfig.mimo
 * @param {string} provider
 * @param {string} mimoMode
 * @returns {string} speaker
 */
function resolveVoiceSelector(voiceHolder, provider, mimoMode) {
  if (!voiceHolder) return '';
  if (provider === 'mimo') {
    if (mimoMode === 'voicedesign') {
      return (voiceHolder.voiceConfig && voiceHolder.voiceConfig.mimo && voiceHolder.voiceConfig.mimo.designDescription) || '';
    }
    if (mimoMode === 'voiceclone') {
      return (voiceHolder.voiceConfig && voiceHolder.voiceConfig.mimo && voiceHolder.voiceConfig.mimo.cloneSamplePath) || '';
    }
    // preset
    return voiceHolder.voiceId || '';
  }
  // volcano
  return voiceHolder.voiceId || '';
}

/**
 * 解析某段的 speaker：dialog 段用角色音色（未配置则 fallback 旁白），narration 段用旁白音色
 * 与原 playbackSocket.resolveSegmentSpeaker 行为一致，返回 { speaker, characterName, speed, volume }
 */
function resolveSegmentSpeaker(novel, segment, settings) {
  const { provider, mimoMode } = getProviderMode(settings);
  if (segment.type === 'dialog' && segment.characterId) {
    const c = (novel.characters || []).find((x) => x.id === segment.characterId);
    if (c) {
      const speaker = resolveVoiceSelector(c, provider, mimoMode);
      if (speaker) {
        return {
          speaker,
          characterName: c.name,
          speed: (c.voiceConfig && c.voiceConfig.speed) || 0,
          volume: (c.voiceConfig && c.voiceConfig.volume) || 0,
        };
      }
      // 角色未配置音色 → 退化到旁白音色
      return {
        speaker: resolveVoiceSelector(settings.narration, provider, mimoMode),
        characterName: c.name,
        speed: settings.narration.speed,
        volume: settings.narration.volume,
      };
    }
  }
  // 旁白
  return {
    speaker: resolveVoiceSelector(settings.narration, provider, mimoMode),
    characterName: null,
    speed: settings.narration.speed,
    volume: settings.narration.volume,
  };
}

/**
 * 解析旁白 speaker（用于 /api/tts/test）
 */
function resolveNarrationSpeaker(settings) {
  const { provider, mimoMode } = getProviderMode(settings);
  return resolveVoiceSelector(settings.narration, provider, mimoMode);
}

module.exports = {
  getProviderMode,
  resolveVoiceSelector,
  resolveSegmentSpeaker,
  resolveNarrationSpeaker,
};
