// 播放 WebSocket：把 TTS 分块音频透传给浏览器
// 消息协议：
//   客户端 → 服务端：
//     { type: "play", novelId, segmentId }      请求播放某段
//     { type: "stop" }                          停止当前段播放
//     { type: "ping" }
//   服务端 → 客户端：
//     { type: "meta", segmentId, cached, speaker, characterName }
//     { type: "audio", data: "<base64>" }       分块音频
//     { type: "end", segmentId }
//     { type: "error", message, code }
//     { type: "pong" }
const { randomUUID } = require('crypto');
const novelService = require('../services/novelService');
const settingsService = require('../services/settingsService');
const ttsService = require('../services/ttsService');
const audioCache = require('../services/audioCacheService');
const { resolveSegmentSpeaker } = require('../services/tts/voiceResolver');
const logger = require('../utils/logger');

function send(ws, obj) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch (err) {
    logger.error(`WS send failed: ${err.message}`);
  }
}

function sendError(ws, message, code) {
  send(ws, { type: 'error', message, code: code || null });
}

/**
 * 处理一个 WS 连接
 */
function handlePlaybackConnection(ws, req) {
  const connId = randomUUID().slice(0, 8);
  logger.info(`WS playback connected: ${connId}`);

  // 当前正在进行的播放任务（用于 stop 取消）
  let currentTask = null;

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      return sendError(ws, 'invalid json');
    }

    if (msg.type === 'ping') {
      return send(ws, { type: 'pong' });
    }

    if (msg.type === 'stop') {
      if (currentTask && currentTask.controller) {
        currentTask.controller.abort();
      }
      return;
    }

    if (msg.type === 'play') {
      const { novelId, segmentId, force } = msg;
      if (!novelId || !segmentId) {
        return sendError(ws, '缺少 novelId 或 segmentId');
      }
      // 取消上一个任务
      if (currentTask && currentTask.controller) {
        currentTask.controller.abort();
      }
      const controller = new AbortController();
      currentTask = { novelId, segmentId, controller };
      try {
        await streamSegment(ws, connId, novelId, segmentId, controller, force);
      } catch (err) {
        if (err.name === 'AbortError' || err.code === 'ABORTED') {
          send(ws, { type: 'end', segmentId, aborted: true });
        } else {
          logger.error(`streamSegment error: ${err.message}`);
          sendError(ws, err.message, err.code);
        }
      } finally {
        if (currentTask && currentTask.segmentId === segmentId) {
          currentTask = null;
        }
      }
      return;
    }

    sendError(ws, `unknown message type: ${msg.type}`);
  });

  ws.on('close', () => {
    if (currentTask && currentTask.controller) {
      currentTask.controller.abort();
    }
    logger.info(`WS playback closed: ${connId}`);
  });

  ws.on('error', (err) => {
    logger.error(`WS playback error: ${connId} ${err.message}`);
  });
}

/**
 * 流式播放单段
 * @param {boolean} [force] 强制重新合成（删缓存走 TTS）
 */
async function streamSegment(ws, connId, novelId, segmentId, controller, force) {
  const novel = novelService.getNovel(novelId);
  if (!novel) {
    return sendError(ws, 'novel not found');
  }
  const segment = (novel.segments || []).find((s) => s.id === segmentId);
  if (!segment) {
    return sendError(ws, 'segment not found');
  }
  if (!segment.text || !segment.text.trim()) {
    // 空段直接 end
    send(ws, { type: 'meta', segmentId, cached: false, speaker: null, characterName: null, empty: true });
    return send(ws, { type: 'end', segmentId });
  }

  const settings = settingsService.get();
  const { speaker, characterName, speed, volume } = resolveSegmentSpeaker(novel, segment, settings);
  const key = audioCache.computeKey(speaker, segment.text, { speed, volume });

  // force：删除缓存，强制走 TTS 重新合成
  if (force) {
    audioCache.remove(key);
  }

  // 发送 meta
  send(ws, {
    type: 'meta',
    segmentId,
    cached: audioCache.has(key),
    speaker,
    characterName,
    textPreview: segment.text.slice(0, 80),
    force: !!force,
  });

  // 校验 API Key（按当前 provider 取对应配置）
  const provider = (settings.tts && settings.tts.provider) || 'volcano';
  const providerCfg = (settings.tts && settings.tts.providers && settings.tts.providers[provider]) || {};
  if (!providerCfg.apiKey) {
    const label = provider === 'mimo' ? '小米 MIMO' : '火山方舟';
    return sendError(ws, `未配置 ${label} TTS API Key，请在设置页填写`, 'NO_API_KEY');
  }
  // voicedesign/voiceclone 模式下 speaker 必填（描述/样本），缺失则提示
  if (!speaker) {
    const mimoMode = providerCfg.mode;
    const hint = provider === 'mimo' && mimoMode === 'voicedesign'
      ? '音色设计模式需填写描述文本'
      : provider === 'mimo' && mimoMode === 'voiceclone'
        ? '音色复刻模式需上传/选择样本'
        : '未配置音色';
    return sendError(ws, hint, 'NO_VOICE');
  }

  // 缓存命中：分块读取并发送
  if (audioCache.has(key)) {
    const buf = audioCache.read(key);
    if (buf) {
      // CHUNK 必须是 3 的倍数（15360=15*1024，15360%3=0），
      // 否则每个字节切片的 base64 末尾会带 == padding，前端拼接解码会丢数据。
      const CHUNK = 15 * 1024;
      for (let i = 0; i < buf.length; i += CHUNK) {
        if (controller.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        const slice = buf.slice(i, Math.min(i + CHUNK, buf.length));
        send(ws, { type: 'audio', data: slice.toString('base64') });
      }
      send(ws, { type: 'end', segmentId, cached: true });
      return;
    }
  }

  // 未命中：调用 TTS，边收边写缓存 + 边推送
  const writeStream = audioCache.createWriteStream(key);
  let writeClosed = false;
  const safeWrite = (chunk) => {
    if (writeClosed) return;
    if (!writeStream.write(chunk)) {
      // 背压：等待 drain
      return new Promise((resolve) => writeStream.once('drain', resolve));
    }
  };
  const closeWrite = (err) => {
    if (writeClosed) return;
    writeClosed = true;
    try {
      if (err) writeStream.destroy();
      else writeStream.end();
    } catch (_) {}
  };

  try {
    for await (const chunk of ttsService.synthesizeStream(segment.text, speaker, {
      speed,
      volume,
      signal: controller.signal,
    })) {
      if (controller.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      await safeWrite(chunk);
      send(ws, { type: 'audio', data: chunk.toString('base64') });
    }
    closeWrite();
    send(ws, { type: 'end', segmentId, cached: false });
  } catch (err) {
    closeWrite(err);
    // 删除可能的半成品缓存
    if (audioCache.has(key)) {
      try { require('fs').unlinkSync(audioCache.CACHE_DIR + '/' + key + '.mp3'); } catch (_) {}
    }
    throw err;
  }
}

module.exports = { handlePlaybackConnection };
