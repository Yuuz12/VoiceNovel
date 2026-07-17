// 设置路由
const express = require('express');
const router = express.Router();
const settingsService = require('../services/settingsService');

// GET /api/settings
router.get('/', (req, res) => {
  const s = settingsService.get();
  // 出于安全考虑，返回时掩码 apiKey（前端仅在用户主动修改时提交明文）
  const masked = maskSecrets(s);
  res.json(masked);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const body = req.body || {};
  // 处理 apiKey 掩码：若提交值为掩码形式（含 *），则保留原值
  const current = settingsService.get();
  restoreSecrets(body, current);
  const next = settingsService.update(body);
  res.json(maskSecrets(next));
});

function maskSecrets(s) {
  const out = JSON.parse(JSON.stringify(s));
  if (out.tts && out.tts.apiKey) out.tts.apiKey = mask(out.tts.apiKey);
  if (out.llm && out.llm.apiKey) out.llm.apiKey = mask(out.llm.apiKey);
  return out;
}

function mask(secret) {
  if (!secret || secret.length < 8) return secret ? '***' : '';
  return secret.slice(0, 4) + '****' + secret.slice(-4);
}

function restoreSecrets(body, current) {
  // 若提交的 apiKey 含 * 或为空字符串，则用原值替换
  if (body.tts && typeof body.tts.apiKey === 'string' && (body.tts.apiKey.includes('*') || body.tts.apiKey === '')) {
    body.tts.apiKey = current.tts.apiKey;
  }
  if (body.llm && typeof body.llm.apiKey === 'string' && (body.llm.apiKey.includes('*') || body.llm.apiKey === '')) {
    body.llm.apiKey = current.llm.apiKey;
  }
}

module.exports = router;
