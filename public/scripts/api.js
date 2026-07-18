// 后端 API 封装
window.API = (function () {
  const base = '/api';

  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(base + path, opts);
    let data;
    const text = await resp.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { raw: text };
    }
    if (!resp.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${resp.status}`;
      const err = new Error(msg);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /**
   * SSE 流式 POST：读取 event:/data: 帧，调 onEvent({event,data})。
   * 捕获 done 事件的 data 作为返回值；signal abort → fetch reject（AbortError）。
   */
  async function streamPost(path, body, opts) {
    const { onEvent, signal } = opts || {};
    const resp = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal,
    });
    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try { const t = await resp.text(); if (t) msg = t; } catch (_) {}
      const err = new Error(msg);
      err.status = resp.status;
      throw err;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let doneData = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // 按 \n\n 切帧
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        // 解析帧内 event:/data: 行
        const lines = frame.split('\n');
        let eventName = 'message';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr += line.slice(5).trim();
          }
        }
        let parsed = dataStr;
        if (dataStr) {
          try { parsed = JSON.parse(dataStr); } catch (_) {}
        }
        if (eventName === 'done') doneData = parsed;
        if (onEvent) onEvent({ event: eventName, data: parsed });
      }
    }
    return doneData;
  }

  return {
    // 音色（?provider=volcano|mimo，默认取后端当前 provider）
    listVoices: (grouped, provider) => {
      const params = [];
      if (grouped) params.push('grouped=1');
      if (provider) params.push('provider=' + encodeURIComponent(provider));
      return request('GET', '/voices' + (params.length ? '?' + params.join('&') : ''));
    },
    previewVoiceUrl: (speaker, text, speed, volume) => {
      const q = new URLSearchParams({ speaker, text });
      if (speed !== undefined && speed !== 0) q.set('speed', speed);
      if (volume !== undefined && volume !== 0) q.set('volume', volume);
      return base + '/tts/preview?' + q.toString();
    },
    testTts: () => request('GET', '/tts/test'),

    // 复刻样本管理（MIMO voiceclone）
    uploadVoiceSample: (name, base64) => request('POST', '/tts/voice-sample', { name, base64 }),
    listVoiceSamples: () => request('GET', '/tts/voice-samples'),
    deleteVoiceSample: (path) => request('DELETE', '/tts/voice-sample?path=' + encodeURIComponent(path)),

    // 设置
    getSettings: () => request('GET', '/settings'),
    saveSettings: (s) => request('PUT', '/settings', s),

    // 缓存
    getCacheSize: () => request('GET', '/cache/size'),
    clearCache: () => request('DELETE', '/cache'),

    // 小说
    listNovels: () => request('GET', '/novels'),
    createNovel: (data) => request('POST', '/novels', data),
    getNovel: (id) => request('GET', '/novels/' + id),
    updateNovel: (id, data) => request('PUT', '/novels/' + id, data),
    deleteNovel: (id) => request('DELETE', '/novels/' + id),
    // 更新段落（如换绑角色 characterId）
    updateSegment: (novelId, segId, data) => request('PUT', '/novels/' + novelId + '/segments/' + segId, data),
    segmentNovelRule: (id) => request('POST', '/novels/' + id + '/segment'),
    // LLM 智能分段（SSE 流式）：onEvent({event,data}) 接收 progress/done/error，signal 可取消
    // body: { continue?, fresh?, forceEmpty? } 控制继续/重新开始/角色为空时强制
    streamSegmentLLM: (id, body, onEvent, signal) =>
      streamPost('/novels/' + id + '/segment-llm', body || {}, { onEvent, signal }),
    // 分段进度查询/清理（用于"继续未完成的分段"）
    getSegmentProgress: (id) => request('GET', '/novels/' + id + '/segment-progress'),
    clearSegmentProgress: (id) => request('DELETE', '/novels/' + id + '/segment-progress'),

    // 角色
    listCharacters: (novelId) => request('GET', '/novels/' + novelId + '/characters'),
    addCharacter: (novelId, data) => request('POST', '/novels/' + novelId + '/characters', data),
    updateCharacter: (novelId, cid, data) => request('PUT', '/novels/' + novelId + '/characters/' + cid, data),
    deleteCharacter: (novelId, cid) => request('DELETE', '/novels/' + novelId + '/characters/' + cid),
    // LLM 提取角色 / 自动匹配音色（SSE 流式）
    streamExtractCharacters: (novelId, onEvent, signal) =>
      streamPost('/novels/' + novelId + '/characters/extract', {}, { onEvent, signal }),
    streamAutoMatchVoices: (novelId, onEvent, signal) =>
      streamPost('/novels/' + novelId + '/characters/auto-match', {}, { onEvent, signal }),
  };
})();
