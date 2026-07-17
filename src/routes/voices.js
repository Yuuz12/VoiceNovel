// 音色目录路由
const express = require('express');
const router = express.Router();
const { VOICES, groupedByScenario, findById } = require('../config/voices');

// GET /api/voices - 列出所有音色（支持 ?grouped=1 按场景分组）
router.get('/', (req, res) => {
  if (req.query.grouped === '1') {
    return res.json({ groups: groupedByScenario() });
  }
  res.json({ voices: VOICES });
});

// GET /api/voices/:id
router.get('/:id', (req, res) => {
  const v = findById(req.params.id);
  if (!v) return res.status(404).json({ error: 'voice not found' });
  res.json(v);
});

module.exports = router;
