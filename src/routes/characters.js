// 角色路由（挂在 /api/novels 下）
const express = require('express');
const router = express.Router();
const novelService = require('../services/novelService');

/**
 * 建立 SSE 流：设响应头 + flush + 返回 {controller, send, finish}。
 * 客户端断开（关 tab / 取消 fetch）时自动 abort controller，中断下层 LLM 任务。
 */
function createSSEStream(req, res) {
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

  // 注意：用 res.on('close') 而非 req.on('close')。
  // Node 16+ 中 req 的 'close' 事件在请求体被消费后就会触发（而非客户端断开），
  // 会导致 signal 被提前 abort，中断正在进行的 LLM 任务。
  // res 的 'close' 事件只在响应连接关闭时触发（正常完成 res.end() 或客户端断开），行为正确。
  res.on('close', () => controller.abort());

  return { controller, send, finish };
}

// GET /api/novels/:id/characters
router.get('/:id/characters', (req, res) => {
  const novel = novelService.getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: 'novel not found' });
  res.json({ characters: novel.characters || [] });
});

// POST /api/novels/:id/characters - 新增角色（手动添加）
router.post('/:id/characters', (req, res) => {
  const c = novelService.addCharacter(req.params.id, req.body || {});
  if (!c) return res.status(404).json({ error: 'novel not found' });
  res.json(c);
});

// PUT /api/novels/:id/characters/:cid - 更新角色（名字/描述/音色等）
router.put('/:id/characters/:cid', (req, res) => {
  const c = novelService.updateCharacter(req.params.id, req.params.cid, req.body || {});
  if (!c) return res.status(404).json({ error: 'novel or character not found' });
  res.json(c);
});

// DELETE /api/novels/:id/characters/:cid - 删除角色（清空绑定到该角色的段落 characterId）
router.delete('/:id/characters/:cid', (req, res) => {
  const ok = novelService.deleteCharacter(req.params.id, req.params.cid);
  if (!ok) return res.status(404).json({ error: 'novel or character not found' });
  res.json({ ok: true });
});

// POST /api/novels/:id/characters/extract - LLM 提取角色清单（覆盖模式 + 段落换绑，SSE 流式进度，可取消）
router.post('/:id/characters/extract', async (req, res) => {
  const { controller, send, finish } = createSSEStream(req, res);
  try {
    // extractCharacters 现在返回整个 novel（含新段落 characterId + 新角色列表）
    const novel = await novelService.extractCharacters(req.params.id, {
      signal: controller.signal,
      onProgress: (p) => send('progress', p),
    });
    if (novel === null) {
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

// POST /api/novels/:id/characters/auto-match - LLM 一键自动匹配音色（SSE 流式进度，可取消）
router.post('/:id/characters/auto-match', async (req, res) => {
  const { controller, send, finish } = createSSEStream(req, res);
  try {
    const chars = await novelService.autoMatchVoices(req.params.id, {
      signal: controller.signal,
      onProgress: (p) => send('progress', p),
    });
    if (chars === null) {
      send('error', { message: 'novel not found', code: 'NOVEL_NOT_FOUND' });
    } else {
      send('done', { characters: chars });
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
