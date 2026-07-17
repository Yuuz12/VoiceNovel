// 简易日志器：控制台 + 文件（按日切割由系统日志工具处理，这里仅控制台+追加文件）
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(process.cwd(), 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (_) {
  // 忽略目录已存在
}

function stamp() {
  return new Date().toISOString();
}

function write(level, msg, extra) {
  const line = `[${stamp()}] [${level}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`;
  // 控制台
  const fn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  fn(line);
  // 文件（异步、不阻塞）
  fs.appendFile(LOG_FILE, line + '\n', () => {});
}

module.exports = {
  info: (msg, extra) => write('INFO', msg, extra),
  warn: (msg, extra) => write('WARN', msg, extra),
  error: (msg, extra) => write('ERROR', msg, extra),
  debug: (msg, extra) => {
    if (process.env.NODE_ENV !== 'production') write('DEBUG', msg, extra);
  },
};
