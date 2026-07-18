// 应用入口：Express HTTP 服务器 + WebSocket 播放透传
require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const logger = require('./src/utils/logger');
const settingsService = require('./src/services/settingsService');
const { ensureDir } = require('./src/storage/fileStorage');

// 路由
const voicesRoutes = require('./src/routes/voices');
const settingsRoutes = require('./src/routes/settings');
const novelsRoutes = require('./src/routes/novels');
const charactersRoutes = require('./src/routes/characters');
const ttsRoutes = require('./src/routes/tts');
const cacheRoutes = require('./src/routes/cache');

// WebSocket
const { handlePlaybackConnection } = require('./src/ws/playbackSocket');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');

// 初始化数据目录
ensureDir(DATA_DIR);
ensureDir(path.join(DATA_DIR, 'novels'));
ensureDir(path.join(DATA_DIR, 'audio_cache'));
ensureDir(path.join(DATA_DIR, 'voice_samples')); // MIMO 音色复刻样本

// 初始化默认设置
settingsService.init();

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// 静态托管前端
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.use('/api/voices', voicesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/novels', novelsRoutes);
app.use('/api/novels', charactersRoutes); // /api/novels/:id/characters/*
app.use('/api/tts', ttsRoutes);
app.use('/api/cache', cacheRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// SPA fallback：非 /api 路径返回 index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${req.method} ${req.url}`, { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

const server = http.createServer(app);

// WebSocket 服务
const wss = new WebSocketServer({ server, path: '/ws/playback' });
wss.on('connection', (ws, req) => {
  handlePlaybackConnection(ws, req);
});

server.listen(PORT, () => {
  logger.info(`VoiceNovel server listening on http://localhost:${PORT}`);
  logger.info(`Data dir: ${DATA_DIR}`);
});
