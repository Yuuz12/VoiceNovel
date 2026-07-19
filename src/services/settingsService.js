// 设置服务：读写 data/settings.json
// 支持多 TTS provider 并存独立保存：tts.provider 切换，tts.providers.* 各自保留配置
const path = require('path');
const { readJson, writeJson, ensureDir } = require('../storage/fileStorage');
const { DEFAULT_NARRATION_VOICE } = require('../config/voices');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// 默认设置（与 .env 中环境变量做融合，前端配置优先于 .env）
function defaultSettings() {
  return {
    tts: {
      // 当前生效的 provider：'volcano' | 'mimo'
      provider: process.env.TTS_PROVIDER || 'volcano',
      // 各 provider 配置独立保存，切换时互不影响
      providers: {
        // 火山方舟（原「方舟 Agent Plan」豆包 seed-tts-2.0）
        volcano: {
          apiKey: process.env.ARK_TTS_API_KEY || '',
          resourceId: process.env.ARK_TTS_RESOURCE_ID || 'seed-tts-2.0',
          baseUrl: process.env.ARK_TTS_BASE_URL || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional',
          audioFormat: 'mp3',
          sampleRate: 24000,
        },
        // 小米 MIMO（MiMo-V2.5-TTS 系列，OpenAI 兼容）
        mimo: {
          apiKey: process.env.MIMO_API_KEY || '',
          baseUrl: 'https://api.xiaomimimo.com/v1/chat/completions',
          mode: 'preset',             // 'preset' | 'voicedesign' | 'voiceclone'
          audioFormat: 'mp3',
          styleInstruction: '',        // 可选全局风格指令（role:user 消息）
        },
      },
    },
    llm: {
      baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      timeoutSeconds: parseInt(process.env.LLM_TIMEOUT_SECONDS, 10) || 300, // 单次请求超时（秒），默认 5 分钟
    },
    narration: {
      voiceId: DEFAULT_NARRATION_VOICE,
      speed: 0,    // -50 ~ 100
      volume: 0,   // -50 ~ 100
      // MIMO 模式下的每旁白独立音色配置（预置模式用 voiceId）
      voiceConfig: {
        mimo: {
          designDescription: '',   // voicedesign 模式
          cloneSamplePath: '',     // voiceclone 模式（相对 data/voice_samples 的路径）
          cloneSampleName: '',     // 样本显示名
        },
      },
    },
    parsing: {
      dialogSymbols: [
        ['"', '"'],
        ['「', '」'],
        ['『', '』'],
        ['“', '”'],
      ],
      maxSegmentLength: 200,
      autoSegmentOnUpload: true,
      llmChunkSize: 1000, // LLM 智能分段每块字数（长文分块，避免单次请求超时）
      concurrency: 3, // LLM 智能分段并行处理块数（按 LLM 接口速率限制填写）
      characterConcurrency: 3, // LLM 提取角色 / 智能匹配音色 的并行数（按 LLM 接口速率限制填写）
      enhanceExpression: false, // 增强语音表现力：LLM 分段时在合适句子前加 [心理活动/表情/动作] 标签
    },
    playback: {
      defaultSpeed: 1.0,
      gapBetweenSegments: 300,
    },
  };
}

let cache = null;

/**
 * 迁移旧版扁平 tts 结构到新 provider 结构。
 * 旧：tts.{apiKey, resourceId, baseUrl, audioFormat, sampleRate}
 * 新：tts.provider + tts.providers.{volcano, mimo}
 * 迁移后写回磁盘（仅在检测到旧结构时）。
 */
function migrate(persisted) {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const tts = persisted.tts;
  if (!tts || typeof tts !== 'object') return persisted;
  // 已是新结构
  if (tts.providers && typeof tts.providers === 'object') return persisted;
  // 旧扁平结构 → 提升到 volcano provider
  const oldVolcano = {
    apiKey: tts.apiKey || '',
    resourceId: tts.resourceId || 'seed-tts-2.0',
    baseUrl: tts.baseUrl || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional',
    audioFormat: tts.audioFormat || 'mp3',
    sampleRate: tts.sampleRate || 24000,
  };
  persisted.tts = {
    provider: 'volcano',
    providers: {
      volcano: oldVolcano,
      mimo: defaultSettings().tts.providers.mimo,
    },
  };
  return persisted;
}

function load() {
  if (cache) return cache;
  let persisted = readJson(SETTINGS_FILE);
  if (persisted) {
    persisted = migrate(persisted);
    // 迁移后若结构变了，写回磁盘
    writeJson(SETTINGS_FILE, persisted);
  }
  const defaults = defaultSettings();
  // 深合并：persisted 覆盖 defaults
  cache = deepMerge(defaults, persisted || {});
  return cache;
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }
  if (typeof base === 'object' && base !== null && typeof override === 'object' && override !== null) {
    const out = { ...base };
    for (const k of Object.keys(override)) {
      out[k] = deepMerge(base[k], override[k]);
    }
    return out;
  }
  return override !== undefined ? override : base;
}

function save(settings) {
  cache = settings;
  writeJson(SETTINGS_FILE, settings);
  return settings;
}

function init() {
  ensureDir(DATA_DIR);
  load();
  // 首次启动写入默认设置文件
  const fs = require('fs');
  if (!fs.existsSync(SETTINGS_FILE)) {
    save(cache);
  }
}

function get() {
  return load();
}

function update(partial) {
  const current = load();
  const next = deepMerge(current, partial);
  return save(next);
}

module.exports = { init, get, update, save };
