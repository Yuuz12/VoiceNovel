// 设置服务：读写 data/settings.json
const path = require('path');
const { readJson, writeJson, ensureDir } = require('../storage/fileStorage');
const { DEFAULT_NARRATION_VOICE } = require('../config/voices');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// 默认设置（与 .env 中环境变量做融合，前端配置优先于 .env）
function defaultSettings() {
  return {
    tts: {
      apiKey: process.env.ARK_TTS_API_KEY || '',
      resourceId: process.env.ARK_TTS_RESOURCE_ID || 'seed-tts-2.0',
      baseUrl: process.env.ARK_TTS_BASE_URL || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional',
      audioFormat: 'mp3',
      sampleRate: 24000,
    },
    llm: {
      baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
    },
    narration: {
      voiceId: DEFAULT_NARRATION_VOICE,
      speed: 0,    // -50 ~ 100
      volume: 0,   // -50 ~ 100
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
      llmChunkSize: 2000, // LLM 智能分段每块字数（长文分块，避免单次请求超时）
    },
    playback: {
      defaultSpeed: 1.0,
      gapBetweenSegments: 300,
    },
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  const persisted = readJson(SETTINGS_FILE);
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
