// 短 ID 生成器
const { randomUUID } = require('crypto');

function shortId(prefix = '') {
  const uuid = randomUUID().replace(/-/g, '');
  return prefix ? `${prefix}_${uuid.slice(0, 8)}` : uuid.slice(0, 12);
}

module.exports = { shortId };
