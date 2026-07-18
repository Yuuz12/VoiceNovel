// 音色目录路由
const express = require('express');
const router = express.Router();
const settingsService = require('../services/settingsService');
const {
  VOICES,
  groupedByScenario,
  findById,
  getVoicesByProvider,
  groupedByScenarioByProvider,
  findByIdAndProvider,
} = require('../config/voices');

// 解析 provider 查询参数：优先 ?provider=，否则取当前 settings.tts.provider
function resolveProvider(req) {
  const q = req.query.provider;
  if (q === 'volcano' || q === 'mimo') return q;
  const settings = settingsService.get();
  return (settings.tts && settings.tts.provider) || 'volcano';
}

// GET /api/voices - 列出所有音色
//   ?grouped=1          按场景分组
//   ?provider=volcano|mimo  指定 provider（默认取当前设置）
router.get('/', (req, res) => {
  const provider = resolveProvider(req);
  if (req.query.grouped === '1') {
    return res.json({ groups: groupedByScenarioByProvider(provider), provider });
  }
  res.json({ voices: getVoicesByProvider(provider), provider });
});

// GET /api/voices/:id
router.get('/:id', (req, res) => {
  const provider = resolveProvider(req);
  const v = findByIdAndProvider(req.params.id, provider);
  if (!v) return res.status(404).json({ error: 'voice not found' });
  res.json(v);
});

module.exports = router;
