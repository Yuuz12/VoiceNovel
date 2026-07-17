// TTS 路由：单段试听
const express = require('express');
const router = express.Router();
const ttsService = require('../services/ttsService');
const audioCache = require('../services/audioCacheService');
const settingsService = require('../services/settingsService');

// GET /api/tts/preview?speaker=&text=&speed=&volume=
// 返回完整 mp3（适合短文本试听，浏览器 <audio> 直接加载）
router.get('/preview', async (req, res) => {
  const { speaker, text } = req.query;
  const speed = req.query.speed !== undefined ? Number(req.query.speed) : 0;
  const volume = req.query.volume !== undefined ? Number(req.query.volume) : 0;

  if (!speaker || !text) {
    return res.status(400).json({ error: '缺少 speaker 或 text 参数' });
  }

  // 命中缓存直接返回
  const key = audioCache.computeKey(speaker, text, { speed, volume });
  if (audioCache.has(key)) {
    const buf = audioCache.read(key);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(buf);
  }

  try {
    const buf = await ttsService.synthesize(text, speaker, { speed, volume });
    audioCache.write(key, buf);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(buf);
  } catch (err) {
    res.status(err.code === 'NO_API_KEY' ? 400 : 500).json({
      error: err.message,
      code: err.code,
    });
  }
});

// GET /api/tts/test - 测试 TTS 连接（用默认文本+音色）
router.get('/test', async (req, res) => {
  const settings = settingsService.get();
  if (!settings.tts.apiKey) {
    return res.status(400).json({ ok: false, error: '未配置 TTS API Key' });
  }
  try {
    const buf = await ttsService.synthesize(
      '您好，语音合成服务连接测试成功。',
      settings.narration.voiceId,
      {}
    );
    res.json({ ok: true, size: buf.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, code: err.code });
  }
});

module.exports = router;
