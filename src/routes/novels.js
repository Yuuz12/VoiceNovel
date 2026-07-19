// 小说路由
const express = require('express');
const router = express.Router();
const novelService = require('../services/novelService');

// GET /api/novels
router.get('/', (req, res) => {
  res.json({ novels: novelService.listNovels() });
});

// POST /api/novels
router.post('/', (req, res) => {
  const { title, text, autoSegment } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: '缺少 text 字段' });
  }
  const novel = novelService.createNovel({ title, text, autoSegment });
  res.status(201).json(novel);
});

// GET /api/novels/:id
router.get('/:id', (req, res) => {
  const novel = novelService.getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: 'novel not found' });
  res.json(novel);
});

// PUT /api/novels/:id
router.put('/:id', (req, res) => {
  const novel = novelService.updateNovel(req.params.id, req.body || {});
  if (!novel) return res.status(404).json({ error: 'novel not found' });
  res.json(novel);
});

// DELETE /api/novels/:id
router.delete('/:id', (req, res) => {
  novelService.deleteNovel(req.params.id);
  res.json({ ok: true });
});

// POST /api/novels/:id/move-to-top - 排到第一（更新 updatedAt，按更新时间排序时排最前）
router.post('/:id/move-to-top', (req, res) => {
  const ok = novelService.moveToTop(req.params.id);
  if (!ok) return res.status(404).json({ error: 'novel not found' });
  res.json({ ok: true });
});

// 兼容旧路径 /pin-to-top
router.post('/:id/pin-to-top', (req, res) => {
  const ok = novelService.moveToTop(req.params.id);
  if (!ok) return res.status(404).json({ error: 'novel not found' });
  res.json({ ok: true });
});

// POST /api/novels/:id/segment - 规则分段
router.post('/:id/segment', (req, res) => {
  const novel = novelService.segmentNovelRule(req.params.id);
  if (!novel) return res.status(404).json({ error: 'novel not found' });
  res.json(novel);
});

// PUT /api/novels/:id/segments/:segId - 更新段落（characterId / type / text）
router.put('/:id/segments/:segId', (req, res) => {
  const seg = novelService.updateSegment(req.params.id, req.params.segId, req.body || {});
  if (!seg) return res.status(404).json({ error: 'novel or segment not found, or characterId invalid' });
  res.json(seg);
});

// DELETE /api/novels/:id/segments/:segId - 删除段落
router.delete('/:id/segments/:segId', (req, res) => {
  const ok = novelService.deleteSegment(req.params.id, req.params.segId);
  if (!ok) return res.status(404).json({ error: 'novel or segment not found' });
  res.json({ ok: true });
});

// POST /api/novels/:id/clear-expression-tags - 清除所有段落的表现力标签 [描述]
router.post('/:id/clear-expression-tags', (req, res) => {
  const result = novelService.clearExpressionTags(req.params.id);
  if (!result) return res.status(404).json({ error: 'novel not found' });
  res.json({ ok: true, cleared: result.cleared, novel: result.novel });
});

// POST /api/novels/:id/segments/:segId/move - 移动段落顺序
// body: { targetId: string | null }  把 segId 移动到 targetId 之前；targetId=null 移到末尾
router.post('/:id/segments/:segId/move', (req, res) => {
  const ok = novelService.reorderSegment(req.params.id, req.params.segId, (req.body || {}).targetId);
  if (!ok) return res.status(404).json({ error: 'novel or segment not found, or target not found' });
  res.json({ ok: true });
});

// GET /api/novels/:id/segment-progress - 查询 LLM 分段进度（用于"继续未完成的分段"）
router.get('/:id/segment-progress', (req, res) => {
  const p = novelService.getSegmentProgress(req.params.id);
  res.json({ progress: p });
});

// DELETE /api/novels/:id/segment-progress - 清理分段进度文件
router.delete('/:id/segment-progress', (req, res) => {
  novelService.clearSegmentProgress(req.params.id);
  res.json({ ok: true });
});

// POST /api/novels/:id/segment-llm - LLM 智能分段（SSE 流式进度，可取消，可继续）
// body: { continue?: true, fresh?: true, forceEmpty?: true }
//   - continue: 接着进度文件记录的下一块继续
//   - fresh: 重新开始（清空已有 segments + 进度）
//   - forceEmpty: 角色为空时强制分段（所有段落 characterId=null）
router.post('/:id/segment-llm', async (req, res) => {
  // SSE 响应头：禁缓冲、保持连接
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const controller = new AbortController();
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

  // 客户端断开/关 tab → 取消任务
  // 注意：用 res.on('close') 而非 req.on('close')。
  // Node 16+ 中 req 的 'close' 事件在请求体被消费后就会触发（而非客户端断开），
  // 会导致 signal 被提前 abort，中断正在进行的 LLM 任务。
  // res 的 'close' 事件只在响应连接关闭时触发（正常完成 res.end() 或客户端断开），行为正确。
  res.on('close', () => controller.abort());

  const body = req.body || {};
  try {
    const novel = await novelService.segmentNovelLLM(req.params.id, {
      signal: controller.signal,
      onProgress: (p) => send('progress', p),
      continue: !!body.continue,
      fresh: !!body.fresh,
      forceEmpty: !!body.forceEmpty,
    });
    if (!novel) {
      send('error', { message: 'novel not found', code: 'NOVEL_NOT_FOUND' });
    } else {
      send('done', { novel });
    }
  } catch (err) {
    if (err.code !== 'ABORTED') {
      send('error', { message: err.message, code: err.code || 'INTERNAL_ERROR' });
    }
    // ABORTED：用户主动取消，不发事件直接关闭
  }
  finish();
});

module.exports = router;
