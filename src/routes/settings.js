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

// 掩码所有 provider 的 apiKey + LLM apiKey
function maskSecrets(s) {
  const out = JSON.parse(JSON.stringify(s));
  if (out.tts && out.tts.providers) {
    for (const name of Object.keys(out.tts.providers)) {
      const p = out.tts.providers[name];
      if (p && typeof p.apiKey === 'string' && p.apiKey) {
        p.apiKey = mask(p.apiKey);
      }
    }
  }
  if (out.llm && out.llm.apiKey) out.llm.apiKey = mask(out.llm.apiKey);
  return out;
}

function mask(secret) {
  if (!secret || secret.length < 8) return secret ? '***' : '';
  return secret.slice(0, 4) + '****' + secret.slice(-4);
}

// 还原掩码 apiKey：若提交值含 * 或为空字符串，用原值替换
function restoreSecrets(body, current) {
  if (body.tts && body.tts.providers && current.tts && current.tts.providers) {
    for (const name of Object.keys(body.tts.providers)) {
      const submitted = body.tts.providers[name];
      const original = current.tts.providers[name];
      if (
        submitted &&
        typeof submitted.apiKey === 'string' &&
        (submitted.apiKey.includes('*') || submitted.apiKey === '') &&
        original
      ) {
        submitted.apiKey = original.apiKey;
      }
    }
  }
  if (body.llm && typeof body.llm.apiKey === 'string' && (body.llm.apiKey.includes('*') || body.llm.apiKey === '')) {
    body.llm.apiKey = current.llm.apiKey;
  }
}

module.exports = router;
