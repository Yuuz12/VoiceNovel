// 音频缓存服务：以 sha256(speaker|text|speed|volume) 为键落盘
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensureDir } = require('../storage/fileStorage');
const logger = require('../utils/logger');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const CACHE_DIR = path.join(DATA_DIR, 'audio_cache');
ensureDir(CACHE_DIR);

/**
 * 从文本中移除表现力标签 [描述]，返回清理后的纯文本
 * 用于缓存键计算和 TTS 文本预处理，保证含/不含标签的同一文本走同一缓存
 * @param {string} text
 * @returns {string}
 */
function stripExpressionTags(text) {
  if (!text || typeof text !== 'string') return text || '';
  if (!/\[[^\]\n]*\]/.test(text)) return text;
  let cleaned = text.replace(/\[[^\]\n]*\]/g, '').replace(/\s+/g, ' ').trim();
  // 极端情况：清理后为空（整段都是标签），回退到去掉方括号但保留内容
  if (!cleaned) {
    cleaned = text.replace(/[\[\]]/g, '').trim();
  }
  return cleaned;
}

/**
 * 提取表现力标签内容作为情感指令数组（供火山 additions.context_texts 使用）
 * @param {string} text
 * @returns {string[]} 情感指令数组（可能为空）
 */
function extractExpressionContexts(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/\[([^\]\n]*)\]/g);
  if (!matches || matches.length === 0) return [];
  return matches
    .map((m) => m.replace(/^\[|\]$/g, '').trim())
    .filter((c) => c);
}

/**
 * 计算缓存键（自动移除表现力标签，保证含/不含标签的同文本走同一缓存）
 * @param {string} speaker
 * @param {string} text
 * @param {object} [params] { speed, volume }
 * @returns {string} 32 字符 hex
 */
function computeKey(speaker, text, params = {}) {
  const normalizedText = stripExpressionTags(text);
  const raw = `${speaker}|${normalizedText}|${params.speed || 0}|${params.volume || 0}`;
  return crypto.createHash('sha256').update(raw, 'utf-8').digest('hex').slice(0, 32);
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${key}.mp3`);
}

/**
 * 查询缓存是否命中
 */
function has(key) {
  return fs.existsSync(cachePath(key));
}

/**
 * 读取缓存的音频 Buffer（同步）
 */
function read(key) {
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p);
  } catch (err) {
    logger.error(`cache read failed: ${key}`, { error: err.message });
    return null;
  }
}

/**
 * 读取缓存的音频流
 */
function readStream(key) {
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  return fs.createReadStream(p);
}

/**
 * 写入缓存
 */
function write(key, buf) {
  const p = cachePath(key);
  try {
    fs.writeFileSync(p, buf);
  } catch (err) {
    logger.error(`cache write failed: ${key}`, { error: err.message });
  }
}

/**
 * 创建写入流（用于流式写入）
 */
function createWriteStream(key) {
  return fs.createWriteStream(cachePath(key));
}

/**
 * 删除单个缓存（force 重新生成时用）。文件不存在不报错。
 */
function remove(key) {
  try {
    fs.unlinkSync(cachePath(key));
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error(`cache remove failed: ${key}`, { error: err.message });
    }
    return false;
  }
}

/**
 * 缓存大小（字节）
 */
function getSize() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    let total = 0;
    for (const f of files) {
      const stat = fs.statSync(path.join(CACHE_DIR, f));
      if (stat.isFile()) total += stat.size;
    }
    return { bytes: total, count: files.length };
  } catch (err) {
    return { bytes: 0, count: 0 };
  }
}

/**
 * 清空缓存
 */
function clear() {
  const files = fs.readdirSync(CACHE_DIR);
  let removed = 0;
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(CACHE_DIR, f));
      removed++;
    } catch (_) {}
  }
  logger.info(`cache cleared: ${removed} files`);
  return removed;
}

module.exports = {
  computeKey,
  stripExpressionTags,
  extractExpressionContexts,
  has,
  read,
  readStream,
  write,
  createWriteStream,
  remove,
  getSize,
  clear,
  CACHE_DIR,
};
