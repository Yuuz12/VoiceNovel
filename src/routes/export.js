// 有声书导出路由
//   POST   /api/export                  创建任务（返回 taskId，后台运行）
//   GET    /api/export                  列出任务（?novelId= 过滤）
//   GET    /api/export/:taskId          查询任务状态
//   GET    /api/export/:taskId/stream   SSE 推送进度
//   POST   /api/export/:taskId/cancel   取消任务
//   DELETE /api/export/:taskId          删除任务（清理文件）
//   GET    /api/export/:taskId/download 下载成品 mp3
//   GET    /api/export/:taskId/chapters 下载 chapters.json
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const exportService = require('../services/exportService');
const logger = require('../utils/logger');

// 创建导出任务并立即开始（后台运行）
router.post('/', async (req, res) => {
  const { novelId, startSegId, endSegId, includeNarration } = req.body || {};
  try {
    const task = exportService.createTask({ novelId, startSegId, endSegId, includeNarration });
    // 后台运行（不 await，立即返回 taskId）
    exportService.runTask(task.id).catch((err) => {
      // 错误已在 runTask 内通过 task.status=error 记录，这里只记日志
      if (err.code !== 'ABORTED') {
        logger.error(`export runTask background error: ${task.id}`, { error: err.message });
      }
    });
    res.status(201).json({ taskId: task.id, status: task.status, total: task.total });
  } catch (err) {
    res.status(err.code === 'NOVEL_NOT_FOUND' || err.code === 'INVALID_ARGS' ? 400 : 500).json({
      error: err.message,
      code: err.code,
    });
  }
});

// 列出任务
router.get('/', (req, res) => {
  const { novelId } = req.query;
  const tasks = exportService.listTasks(novelId);
  res.json({ tasks });
});

// 所有导出任务占用磁盘大小
router.get('/size', (req, res) => {
  res.json(exportService.getExportsSize());
});

// 清空所有导出任务（含成品 mp3 与分段产物）
router.delete('/all', (req, res) => {
  const r = exportService.clearAllTasks();
  res.json(r);
});

// 查询任务状态
router.get('/:taskId', (req, res) => {
  const task = exportService.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'task not found' });
  res.json({ task });
});

// SSE 推送进度
// 客户端: GET /api/export/:taskId/stream
// 服务端推送事件: progress / segment-done / done / error / canceled
router.get('/:taskId/stream', (req, res) => {
  const task = exportService.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'task not found' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    try { res.end(); } catch (_) {}
  };
  const send = (event, data) => {
    if (finished || res.writableEnded) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };

  // 如果任务已结束，直接推一个快照事件后关闭
  if (task.status === 'done') {
    send('done', { type: 'done', taskId: task.id, outputSize: task.outputSize, done: task.done, total: task.total });
    return finish();
  }
  if (task.status === 'error') {
    send('error', { type: 'error', message: task.error || '未知错误' });
    return finish();
  }
  if (task.status === 'canceled') {
    send('canceled', { type: 'canceled', taskId: task.id });
    return finish();
  }

  // 任务正在运行或刚创建：先推当前快照
  send('progress', {
    type: 'snapshot',
    status: task.status,
    done: task.done,
    total: task.total,
    currentIdx: task.currentIdx,
  });

  // 轮询任务文件推进度（每 500ms）
  const interval = setInterval(() => {
    const t = exportService.getTask(req.params.taskId);
    if (!t) {
      send('error', { type: 'error', message: 'task not found' });
      clearInterval(interval);
      return finish();
    }
    if (t.status === 'done') {
      send('progress', {
        type: 'progress',
        done: t.done,
        total: t.total,
        currentIdx: t.currentIdx,
      });
      send('done', { type: 'done', taskId: t.id, outputSize: t.outputSize, done: t.done, total: t.total });
      clearInterval(interval);
      return finish();
    }
    if (t.status === 'error') {
      send('error', { type: 'error', message: t.error || '未知错误' });
      clearInterval(interval);
      return finish();
    }
    if (t.status === 'canceled') {
      send('canceled', { type: 'canceled', taskId: t.id });
      clearInterval(interval);
      return finish();
    }
    // 运行中：推进度
    send('progress', {
      type: 'progress',
      done: t.done,
      total: t.total,
      currentIdx: t.currentIdx,
    });
  }, 500);

  // 客户端断开 -> 清理
  res.on('close', () => {
    clearInterval(interval);
    finish();
  });
});

// 取消任务
router.post('/:taskId/cancel', (req, res) => {
  const ok = exportService.cancelTask(req.params.taskId);
  res.json({ ok });
});

// 删除任务（清理文件）
router.delete('/:taskId', (req, res) => {
  exportService.deleteTask(req.params.taskId);
  res.json({ ok: true });
});

// 下载成品 mp3
router.get('/:taskId/download', (req, res) => {
  const task = exportService.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'task not found' });
  if (task.status !== 'done') return res.status(400).json({ error: 'task not done' });

  const filePath = exportService.outputPath(req.params.taskId);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'output file not found' });

  const safeTitle = (task.novelTitle || 'audiobook').replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.mp3"`);
  res.setHeader('Content-Length', String(fs.statSync(filePath).size));
  fs.createReadStream(filePath).pipe(res);
});

// 下载 chapters.json
router.get('/:taskId/chapters', (req, res) => {
  const task = exportService.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'task not found' });
  if (task.status !== 'done') return res.status(400).json({ error: 'task not done' });

  const filePath = exportService.chaptersPath(req.params.taskId);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'chapters file not found' });

  const safeTitle = (task.novelTitle || 'audiobook').replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.chapters.json"`);
  fs.createReadStream(filePath).pipe(res);
});

// 下载 LRC 字幕
router.get('/:taskId/lrc', (req, res) => {
  const task = exportService.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'task not found' });
  if (task.status !== 'done') return res.status(400).json({ error: 'task not done' });

  const filePath = exportService.lrcPath(req.params.taskId);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'lrc file not found' });

  const safeTitle = (task.novelTitle || 'audiobook').replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.lrc"`);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
