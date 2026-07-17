// 缓存管理路由
const express = require('express');
const router = express.Router();
const audioCache = require('../services/audioCacheService');

// GET /api/cache/size
router.get('/size', (req, res) => {
  res.json(audioCache.getSize());
});

// DELETE /api/cache
router.delete('/', (req, res) => {
  const removed = audioCache.clear();
  res.json({ removed });
});

module.exports = router;
