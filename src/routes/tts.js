// TTS 路由：单段试听 / 连接测试 / 复刻样本管理
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const ttsService = require('../services/ttsService');
const audioCache = require('../services/audioCacheService');
const settingsService = require('../services/settingsService');
const { resolveNarrationSpeaker } = require('../services/tts/voiceResolver');
const { VOICE_SAMPLES_DIR } = require('../services/tts/mimoProvider');
const { ensureDir } = require('../storage/fileStorage');
const logger = require('../utils/logger');

const ALLOWED_SAMPLE_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
const MAX_SAMPLE_SIZE = 25 * 1024 * 1024; // 25MB

// 确保样本目录存在
ensureDir(VOICE_SAMPLES_DIR);

// GET /api/tts/preview?speaker=&text=&speed=&volume=
// 返回完整 mp3（适合短文本试听，浏览器 <audio> 直接加载）
// speaker 语义由当前 provider 解释：火山/预置=音色名；voicedesign=描述文本；voiceclone=样本路径
router.get('/preview', async (req, res) => {
  const { speaker, text } = req.query;
  const speed = req.query.speed !== undefined ? Number(req.query.speed) : 0;
  const volume = req.query.volume !== undefined ? Number(req.query.volume) : 0;

  if (!speaker || !text) {
    return res.status(400).json({ error: '缺少 speaker 或 text 参数' });
  }

  // 缓存键含 provider/model/mode 等字段，避免切换 provider 后复用旧缓存（Bug 修复）
  const settings = settingsService.get();
  const keyParams = audioCache.keyParamsFromSettings(settings);
  const key = audioCache.computeKey(speaker, text, { speed, volume, ...keyParams });

  // 命中缓存直接返回
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

// GET /api/tts/test - 测试 TTS 连接（用旁白音色 + 默认文本）
const PROVIDER_LABEL = {
  volcano: '火山方舟',
  mimo: '小米 MIMO',
  openai: 'OpenAI',
  minimax: 'MiniMax',
  bailian: '阿里云百炼',
};
router.get('/test', async (req, res) => {
  const settings = settingsService.get();
  const provider = (settings.tts && settings.tts.provider) || 'volcano';
  const providerCfg = (settings.tts && settings.tts.providers && settings.tts.providers[provider]) || {};
  const label = PROVIDER_LABEL[provider] || provider;
  if (!providerCfg.apiKey) {
    return res.status(400).json({ ok: false, error: `未配置 ${label} TTS API Key` });
  }
  const speaker = resolveNarrationSpeaker(settings);
  if (!speaker) {
    const mode = providerCfg.mode;
    const hint = (provider === 'mimo' || provider === 'minimax' || provider === 'bailian') && mode === 'voicedesign'
      ? '请先在旁白音色处填写音色设计描述/voice_id'
      : (provider === 'mimo' || provider === 'minimax' || provider === 'bailian') && mode === 'voiceclone'
        ? (provider === 'mimo' ? '请先为旁白上传/选择复刻样本' : '请先为旁白填写复刻 voice_id')
        : '请先选择旁白音色';
    return res.status(400).json({ ok: false, error: hint });
  }
  try {
    const buf = await ttsService.synthesize(
      '您好，语音合成服务连接测试成功。',
      speaker,
      {}
    );
    res.json({ ok: true, size: buf.length, provider });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, code: err.code, provider });
  }
});

// ========== 复刻样本管理（MIMO voiceclone 模式）==========

// POST /api/tts/voice-sample - 上传样本（JSON body: { name, base64, mime? }）
router.post('/voice-sample', (req, res) => {
  const body = req.body || {};
  const { name, base64 } = body;
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: '缺少 base64 音频数据' });
  }
  // 解析原始文件名，取扩展名
  const safeName = (name || 'sample').replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
  const ext = path.extname(safeName).toLowerCase();
  if (!ext || !ALLOWED_SAMPLE_EXT.has(ext)) {
    return res.status(400).json({ error: '不支持的音频格式，请上传 ' + Array.from(ALLOWED_SAMPLE_EXT).join('/') });
  }
  let buf;
  try {
    // 去掉可能的 data URI 前缀
    const b64 = base64.startsWith('data:') && base64.includes(',') ? base64.split(',')[1] : base64;
    buf = Buffer.from(b64, 'base64');
  } catch (err) {
    return res.status(400).json({ error: 'base64 解码失败: ' + err.message });
  }
  if (buf.length === 0) {
    return res.status(400).json({ error: '样本数据为空' });
  }
  if (buf.length > MAX_SAMPLE_SIZE) {
    return res.status(400).json({ error: `样本过大（${buf.length} 字节），上限 ${MAX_SAMPLE_SIZE} 字节` });
  }
  const fileName = `${randomUUID()}${ext}`;
  const relPath = fileName; // 相对 voice_samples 的路径（仅文件名）
  const abs = path.join(VOICE_SAMPLES_DIR, fileName);
  try {
    fs.writeFileSync(abs, buf);
  } catch (err) {
    logger.error(`voice-sample write failed: ${err.message}`);
    return res.status(500).json({ error: '样本保存失败: ' + err.message });
  }
  logger.info(`voice-sample saved: ${fileName} (${buf.length} bytes)`);
  res.json({ path: relPath, name: safeName, size: buf.length });
});

// GET /api/tts/voice-samples - 列出已上传样本
router.get('/voice-samples', (req, res) => {
  try {
    const files = fs.readdirSync(VOICE_SAMPLES_DIR).filter((f) => ALLOWED_SAMPLE_EXT.has(path.extname(f).toLowerCase()));
    const list = files.map((f) => {
      const stat = fs.statSync(path.join(VOICE_SAMPLES_DIR, f));
      return { path: f, name: f, size: stat.size, mtime: stat.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
    res.json({ samples: list });
  } catch (err) {
    res.status(500).json({ error: '列出样本失败: ' + err.message });
  }
});

// DELETE /api/tts/voice-sample?path=<fileName> - 删除样本
router.delete('/voice-sample', (req, res) => {
  const relPath = req.query.path;
  if (!relPath || typeof relPath !== 'string') {
    return res.status(400).json({ error: '缺少 path 参数' });
  }
  // 防路径穿越：仅取文件名
  const fileName = path.basename(relPath);
  const abs = path.join(VOICE_SAMPLES_DIR, fileName);
  if (!abs.startsWith(VOICE_SAMPLES_DIR)) {
    return res.status(400).json({ error: '非法路径' });
  }
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ error: '样本不存在' });
  }
  try {
    fs.unlinkSync(abs);
    logger.info(`voice-sample deleted: ${fileName}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败: ' + err.message });
  }
});

module.exports = router;
