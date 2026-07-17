// JSON 文件原子读写工具
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * 确保目录存在
 * @param {string} dir
 */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 读取 JSON 文件，不存在或解析失败返回 null
 * @param {string} filePath
 * @returns {any|null}
 */
function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`readJson failed: ${filePath}`, { error: err.message });
    return null;
  }
}

/**
 * 原子写入 JSON 文件（先写临时文件再 rename）
 * @param {string} filePath
 * @param {any} data
 */
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * 删除文件（不存在不报错）
 * @param {string} filePath
 */
function remove(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logger.error(`remove failed: ${filePath}`, { error: err.message });
  }
}

/**
 * 列出目录下所有文件名
 * @param {string} dir
 * @param {string} [ext] 扩展名过滤，如 '.json'
 * @returns {string[]}
 */
function listFiles(dir, ext) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => (ext ? name.endsWith(ext) : true));
  } catch (err) {
    logger.error(`listFiles failed: ${dir}`, { error: err.message });
    return [];
  }
}

module.exports = { ensureDir, readJson, writeJson, remove, listFiles };
