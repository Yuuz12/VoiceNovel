// 播放器：管理 WS 连接、音频队列、自动连播
window.Player = (function () {
  const audio = new Audio();
  audio.preload = 'auto';
  // 从 localStorage 恢复全局音量（默认 1.0）
  try {
    const savedVol = parseFloat(localStorage.getItem('player-volume'));
    if (isFinite(savedVol)) audio.volume = Math.max(0, Math.min(1, savedVol));
  } catch (_) {}

  let ws = null;
  let wsReady = false;
  let currentNovel = null;
  let queue = [];           // [{ id, type, text, characterId, order }]
  let currentIndex = -1;
  let isPlaying = false;
  let isFetching = false;
  let pendingChunks = [];   // 当前段的累积 base64 数据
  let pendingSegmentId = null;
  let pendingMeta = null;
  let gapMs = 300;
  let gapTimer = null;
  let listeners = new Map(); // event -> Set<cb>

  function on(event, cb) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => off(event, cb);
  }
  function off(event, cb) {
    if (listeners.has(event)) listeners.get(event).delete(cb);
  }
  function emit(event, payload) {
    if (listeners.has(event)) {
      for (const cb of listeners.get(event)) {
        try { cb(payload); } catch (e) { console.error(e); }
      }
    }
  }

  function getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws/playback`;
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    try {
      ws = new WebSocket(getWsUrl());
    } catch (err) {
      emit('status', { connected: false, error: err.message });
      return;
    }
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      wsReady = true;
      emit('status', { connected: true });
    };
    ws.onclose = () => {
      wsReady = false;
      emit('status', { connected: false });
      // 自动重连
      setTimeout(connect, 2000);
    };
    ws.onerror = (err) => {
      emit('status', { connected: false, error: '连接错误' });
    };
    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (_) { return; }
      handleMessage(msg);
    };
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'meta':
        pendingMeta = msg;
        pendingSegmentId = msg.segmentId;
        emit('segment-meta', msg);
        if (msg.empty) {
          // 空段直接结束
          handleEnd(msg.segmentId, true);
        }
        break;
      case 'audio':
        pendingChunks.push(msg.data);
        emit('chunk', { segmentId: pendingSegmentId, chunkCount: pendingChunks.length });
        break;
      case 'end':
        handleEnd(msg.segmentId, msg.cached, msg.aborted);
        break;
      case 'error':
        isFetching = false;
        emit('error', { message: msg.message, code: msg.code });
        Utils.toast('播放失败: ' + (msg.message || '未知错误'), 'error');
        break;
      case 'pong':
        break;
    }
  }

  function handleEnd(segmentId, cached, aborted) {
    if (aborted) {
      isFetching = false;
      emit('segment-aborted', { segmentId });
      return;
    }
    if (!pendingChunks.length) {
      isFetching = false;
      emit('error', { message: '未收到音频数据' });
      return;
    }
    // 逐个 chunk 解码 base64（每个切片独立 atob，padding 在末尾被正确处理），
    // 再拼接 Uint8Array。避免 join+atob 在中间切片的 == padding 处提前停止丢数据。
    const parts = pendingChunks.map((s) => {
      const bin = atob(s);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    });
    let totalLen = 0;
    for (const p of parts) totalLen += p.length;
    const bytes = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) { bytes.set(p, offset); offset += p.length; }
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    pendingChunks = [];
    isFetching = false;

    // 释放上一个 URL
    if (audio.src && audio.src.startsWith('blob:')) {
      URL.revokeObjectURL(audio.src);
    }
    audio.src = url;
    audio.playbackRate = currentNovel && currentNovel.playbackRate || 1.0;

    emit('segment-loaded', { segmentId, cached, size: bytes.length });

    if (isPlaying) {
      audio.play().catch((err) => {
        emit('error', { message: '播放失败: ' + err.message });
      });
    }
    emit('state', getState());
  }

  function loadNovel(novel) {
    currentNovel = novel;
    queue = (novel && novel.segments ? novel.segments : []).slice().sort((a, b) => a.order - b.order);
    currentIndex = -1;
    stop();
    emit('state', getState());
  }

  function setQueue(segments) {
    queue = (segments || []).slice().sort((a, b) => a.order - b.order);
    emit('state', getState());
  }

  function playSegmentByIndex(index) {
    if (index < 0 || index >= queue.length) return;
    currentIndex = index;
    const seg = queue[index];
    requestSegment(seg);
    isPlaying = true;
    emit('state', getState());
  }

  function playSegmentById(segmentId) {
    const idx = queue.findIndex((s) => s.id === segmentId);
    if (idx >= 0) playSegmentByIndex(idx);
  }

  function requestSegment(seg, force) {
    if (!currentNovel) return;
    if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
    // 清理正在进行的请求
    pendingChunks = [];
    pendingMeta = null;
    isFetching = true;
    emit('segment-loading', { segmentId: seg.id, segment: seg });
    emit('state', getState());

    const playMsg = { type: 'play', novelId: currentNovel.id, segmentId: seg.id };
    if (force) playMsg.force = true; // 强制重新合成（删缓存走 TTS）
    if (!wsReady) {
      connect();
      // 等连接就绪后再发送
      const waitSend = () => {
        if (wsReady) {
          send(playMsg);
        } else {
          setTimeout(waitSend, 200);
        }
      };
      waitSend();
    } else {
      send(playMsg);
    }
  }

  function togglePlay() {
    if (isFetching) return;
    if (isPlaying) {
      // 暂停
      if (!audio.paused) {
        audio.pause();
      } else {
        // 已暂停 → 继续
        if (currentIndex >= 0) {
          audio.play();
        } else if (queue.length > 0) {
          playSegmentByIndex(0);
        }
      }
      isPlaying = !audio.paused && (currentIndex >= 0);
      // 如果当前没在播放任何段，按 play 表示开始
      if (currentIndex < 0 && queue.length > 0) {
        playSegmentByIndex(0);
      }
    } else {
      // 启动播放
      if (currentIndex < 0 && queue.length > 0) {
        playSegmentByIndex(0);
      } else if (currentIndex >= 0) {
        audio.play();
        isPlaying = true;
      }
    }
    emit('state', getState());
  }

  function stop() {
    if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    isFetching = false;
    pendingChunks = [];
    if (wsReady) send({ type: 'stop' });
    emit('state', getState());
  }

  function next() {
    if (currentIndex + 1 < queue.length) {
      playSegmentByIndex(currentIndex + 1);
    }
  }

  function prev() {
    if (currentIndex > 0) {
      playSegmentByIndex(currentIndex - 1);
    }
  }

  function seekTo(index) {
    if (index >= 0 && index < queue.length) {
      playSegmentByIndex(index);
    }
  }

  /**
   * 重新生成指定段落的音频（删除缓存后强制走 TTS 重新合成）
   */
  function regenerate(segmentId) {
    if (!currentNovel) return;
    const idx = queue.findIndex((s) => s.id === segmentId);
    if (idx < 0) return;
    // 切到目标段并发 force play
    currentIndex = idx;
    const seg = queue[idx];
    requestSegment(seg, true);
    isPlaying = true;
    emit('state', getState());
  }

  function setPlaybackRate(rate) {
    audio.playbackRate = rate;
    // 同步到 currentNovel，让 handleEnd 加载新音频时能读到（修复：原 bug 是下一段倍速恢复 1.0）
    if (currentNovel) currentNovel.playbackRate = rate;
    emit('state', getState());
  }

  /**
   * 设置全局音量（0-1）
   * 持久化到 localStorage，新音频加载时自动恢复
   */
  function setVolume(v) {
    const vol = Math.max(0, Math.min(1, v));
    audio.volume = vol;
    try { localStorage.setItem('player-volume', String(vol)); } catch (_) {}
    emit('state', getState());
  }

  function getVolume() {
    return audio.volume;
  }

  /**
   * 按比例（0-1）跳转到当前音频的指定位置
   */
  function seekRatio(ratio) {
    if (!audio.duration || !isFinite(audio.duration)) return;
    const r = Math.max(0, Math.min(1, ratio));
    audio.currentTime = r * audio.duration;
    emit('progress', {
      currentTime: audio.currentTime,
      duration: audio.duration,
      ratio: audio.currentTime / audio.duration,
    });
  }

  function setGap(ms) {
    gapMs = Math.max(0, Math.min(5000, ms));
  }

  // 音频事件
  audio.addEventListener('timeupdate', () => {
    if (audio.duration && isFinite(audio.duration)) {
      emit('progress', {
        currentTime: audio.currentTime,
        duration: audio.duration,
        ratio: audio.currentTime / audio.duration,
      });
    }
  });

  audio.addEventListener('ended', () => {
    emit('segment-ended', { segmentId: queue[currentIndex] && queue[currentIndex].id });
    if (gapTimer) clearTimeout(gapTimer);
    // 自动连播下一段
    if (currentIndex + 1 < queue.length) {
      gapTimer = setTimeout(() => {
        playSegmentByIndex(currentIndex + 1);
      }, gapMs);
    } else {
      isPlaying = false;
      currentIndex = -1;
      emit('queue-ended', {});
      emit('state', getState());
    }
  });

  audio.addEventListener('error', (e) => {
    emit('error', { message: '音频播放错误' });
  });

  function getState() {
    const seg = currentIndex >= 0 ? queue[currentIndex] : null;
    return {
      isPlaying,
      isFetching,
      currentIndex,
      currentSegment: seg,
      queueLength: queue.length,
      audioPaused: audio.paused,
      audioCurrentTime: audio.currentTime,
      audioDuration: audio.duration,
      playbackRate: audio.playbackRate,
    };
  }

  return {
    connect,
    loadNovel,
    setQueue,
    playSegmentByIndex,
    playSegmentById,
    togglePlay,
    stop,
    next,
    prev,
    seekTo,
    setPlaybackRate,
    setVolume,
    getVolume,
    seekRatio,
    setGap,
    getState,
    on,
    off,
  };
})();
