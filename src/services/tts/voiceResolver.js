// 音色解析：根据 provider + mode 把角色/旁白的音色配置解析为 provider 可理解的 speaker 字符串
// speaker 语义：
//   volcano / openai / *-preset  → voiceId（音色名/音色 id）
//   mimo voicedesign             → voiceConfig.mimo.designDescription（描述文本）
//   mimo voiceclone              → voiceConfig.mimo.cloneSamplePath（样本文件路径）
//   minimax/bailian voicedesign  → voiceConfig.<provider>.cloneVoiceId（设计生成的 voice_id，UI 与 voiceclone 共用输入框）
//   minimax/bailian voiceclone   → voiceConfig.<provider>.cloneVoiceId（复刻获得的 voice_id）
//
// 旁白音色按 provider 独立保存到 narration.perProvider[provider]，切换 provider 不丢。

/**
 * 取当前 provider 与 mode
 * mode 仅对 mimo/minimax/bailian 有意义（preset/voicedesign/voiceclone）；
 * volcano/openai 无 mode 字段，统一回退 'preset'。
 */
function getProviderMode(settings) {
  const tts = settings.tts || {};
  const provider = tts.provider || 'volcano';
  const providers = tts.providers || {};
  const providerCfg = providers[provider] || {};
  const mode = providerCfg.mode || 'preset';
  return { provider, mode };
}

/**
 * 取旁白音色持有者（从 narration.perProvider[provider] 读取）
 * 旁白 speed/volume 仍为全局共享字段（不按 provider），由调用方从 settings.narration 读取。
 */
function getNarrationHolder(settings, provider) {
  const pp = (settings.narration && settings.narration.perProvider) || {};
  return pp[provider] || {};
}

/**
 * 把一个音色持有者（角色或旁白 perProvider 项）解析为 speaker 字符串
 * @param {object} voiceHolder - 角色对象（含 voiceId/voiceConfig）或旁白 perProvider 项（含 voiceId/designDescription/cloneSamplePath/cloneVoiceId）
 * @param {string} provider
 * @param {string} mode
 * @returns {string} speaker
 */
function resolveVoiceSelector(voiceHolder, provider, mode) {
  if (!voiceHolder) return '';
  // 旁白 perProvider 项直接含字段；角色对象需从 voiceConfig[provider] 取
  // 统一兼容两种形态：先尝试 voiceHolder.voiceConfig[provider]，再回退 voiceHolder 本身（旁白 perProvider 项）
  const cfgFromVC = (voiceHolder.voiceConfig && (voiceHolder.voiceConfig[provider] || voiceHolder.voiceConfig.mimo)) || {};
  const designDescription = voiceHolder.designDescription || cfgFromVC.designDescription || '';
  const cloneSamplePath = voiceHolder.cloneSamplePath || cfgFromVC.cloneSamplePath || '';
  const cloneVoiceId = voiceHolder.cloneVoiceId || cfgFromVC.cloneVoiceId || '';

  if (provider === 'mimo') {
    if (mode === 'voicedesign') return designDescription;
    if (mode === 'voiceclone') return cloneSamplePath;
    return voiceHolder.voiceId || '';
  }
  if (provider === 'minimax' || provider === 'bailian') {
    // voicedesign 与 voiceclone 在 UI 上共用 voice_id 输入框，后端统一用 cloneVoiceId
    if (mode === 'voicedesign' || mode === 'voiceclone') return cloneVoiceId;
    return voiceHolder.voiceId || '';
  }
  // volcano / openai：仅用 voiceId
  return voiceHolder.voiceId || '';
}

/**
 * 解析某段的 speaker：dialog 段用角色音色（未配置则 fallback 旁白），narration 段用旁白音色
 * 返回 { speaker, characterName, speed, volume }
 */
function resolveSegmentSpeaker(novel, segment, settings) {
  const { provider, mode } = getProviderMode(settings);
  const narrationHolder = getNarrationHolder(settings, provider);
  const narrationSpeed = (settings.narration && settings.narration.speed) || 0;
  const narrationVolume = (settings.narration && settings.narration.volume) || 0;

  if (segment.type === 'dialog' && segment.characterId) {
    const c = (novel.characters || []).find((x) => x.id === segment.characterId);
    if (c) {
      const speaker = resolveVoiceSelector(c, provider, mode);
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
        speaker: resolveVoiceSelector(narrationHolder, provider, mode),
        characterName: c.name,
        speed: narrationSpeed,
        volume: narrationVolume,
      };
    }
  }
  // 旁白
  return {
    speaker: resolveVoiceSelector(narrationHolder, provider, mode),
    characterName: null,
    speed: narrationSpeed,
    volume: narrationVolume,
  };
}

/**
 * 解析旁白 speaker（用于 /api/tts/test）
 */
function resolveNarrationSpeaker(settings) {
  const { provider, mode } = getProviderMode(settings);
  const holder = getNarrationHolder(settings, provider);
  return resolveVoiceSelector(holder, provider, mode);
}

module.exports = {
  getProviderMode,
  getNarrationHolder,
  resolveVoiceSelector,
  resolveSegmentSpeaker,
  resolveNarrationSpeaker,
};
