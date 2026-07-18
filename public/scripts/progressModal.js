// 进度模态框：流式显示 LLM 任务进度，支持手动取消
// 用法：ProgressModal.run({ title, streamFn:(onEvent,signal)=>Promise<data>, onComplete, onError, onCancel })
//   - streamFn 通常封装 API.streamXxx(novelId, onEvent, signal)
//   - onEvent 收到 { event:'progress'|'done'|'error', data }
window.ProgressModal = (function () {
  let modal = null;
  let titleEl, statusEl, barEl, fillEl, chunkLabelEl, logEl, cancelBtn, closeBtn;
  let state = 'idle'; // idle | running | done | error | cancelled
  let currentController = null;
  let autoCloseTimer = null;
  let escHandler = null;
  let currentOnComplete, currentOnError, currentOnCancel;

  const LOG_MAX_LINES = 300;

  // 当前正在流式追加的 token 行（同 role 的 delta 追加到同一行，role 切换或新段开始时新建行）
  let currentTokenLine = null;
  let currentTokenRole = null;

  function ensureDOM() {
    if (modal) return;
    fillEl = Utils.el('div', { class: 'pm-fill' });
    barEl = Utils.el('div', { class: 'pm-bar' }, [fillEl]);
    const barWrap = Utils.el('div', { class: 'pm-bar-wrap' }, [barEl]);
    statusEl = Utils.el('div', { class: 'pm-status' }, '');
    chunkLabelEl = Utils.el('div', { class: 'pm-chunk-label' }, '');
    logEl = Utils.el('div', { class: 'pm-log' });
    const body = Utils.el('div', { class: 'modal-body' }, [statusEl, barWrap, chunkLabelEl, logEl]);

    titleEl = Utils.el('h3', {}, '');
    closeBtn = Utils.el('button', { class: 'btn btn-icon', title: '关闭' }, '×');
    const head = Utils.el('div', { class: 'modal-head' }, [titleEl, closeBtn]);

    cancelBtn = Utils.el('button', { class: 'btn btn-danger' }, '取消任务');
    const foot = Utils.el('div', { class: 'modal-foot' }, [cancelBtn]);

    const card = Utils.el('div', { class: 'modal-card' }, [head, body, foot]);
    modal = Utils.el('div', { class: 'modal hidden', id: 'modal-progress' }, [card]);
    document.body.appendChild(modal);

    cancelBtn.addEventListener('click', requestCancel);
    closeBtn.addEventListener('click', onCloseClick);
    modal.addEventListener('click', onOverlayClick);
    escHandler = (e) => { if (e.key === 'Escape') onEsc(); };
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'pm-status' + (kind ? ' ' + kind : '');
  }

  function setProgress(ratio) {
    barEl.classList.remove('indeterminate');
    fillEl.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(1) + '%';
  }

  function setIndeterminate() {
    barEl.classList.add('indeterminate');
    fillEl.style.width = '';
  }

  function appendLog(text, kind) {
    const line = Utils.el('div', { class: 'pm-log-line' + (kind ? ' ' + kind : '') }, text);
    logEl.appendChild(line);
    // 截断：保留最近 LOG_MAX_LINES 行，防止超长文本撑爆 DOM
    while (logEl.childNodes.length > LOG_MAX_LINES) {
      logEl.removeChild(logEl.firstChild);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  /**
   * 流式追加一个 token delta 到当前行。role 切换或首次调用时新建行：
   *   reasoning → [思考] 灰色斜体
   *   content   → [输出] 正常色
   */
  function appendToken(role, delta) {
    if (!delta) return;
    if (!currentTokenLine || currentTokenRole !== role) {
      const prefix = role === 'reasoning' ? '[思考] ' : '[输出] ';
      currentTokenLine = Utils.el('div', { class: 'pm-log-line ' + role }, prefix);
      logEl.appendChild(currentTokenLine);
      currentTokenRole = role;
      while (logEl.childNodes.length > LOG_MAX_LINES) {
        logEl.removeChild(logEl.firstChild);
      }
    }
    currentTokenLine.textContent += delta;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function resetUI(title) {
    titleEl.textContent = title;
    setStatus('准备中...', '');
    setProgress(0);
    chunkLabelEl.textContent = '';
    logEl.innerHTML = '';
    currentTokenLine = null;
    currentTokenRole = null;
    cancelBtn.textContent = '取消任务';
    cancelBtn.className = 'btn btn-danger';
    cancelBtn.disabled = false;
    closeBtn.style.display = '';
  }

  function open() {
    modal.classList.remove('hidden');
    document.addEventListener('keydown', escHandler);
  }

  function close() {
    if (!modal) return;
    modal.classList.add('hidden');
    document.removeEventListener('keydown', escHandler);
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
    state = 'idle';
  }

  function requestCancel() {
    if (state !== 'running') return;
    if (!confirm('取消任务？已处理的进度将丢失。')) return;
    if (currentController) currentController.abort();
  }

  function onCloseClick() {
    if (state === 'running') requestCancel();
    else close();
  }

  function onOverlayClick(e) {
    if (e.target !== modal) return;
    // running 时遮罩点击不关闭，防止误触
    if (state === 'running') return;
    close();
  }

  function onEsc() {
    if (state === 'running') requestCancel();
    else if (state !== 'idle') close();
  }

  function handleEvent(evt) {
    const { event, data } = evt || {};
    if (event === 'progress') {
      const p = data || {};
      switch (p.type) {
        case 'start':
          currentTokenLine = null;
          currentTokenRole = null;
          if (p.task === 'auto-match') {
            setIndeterminate();
            setStatus(`正在为 ${p.characterCount || 0} 个角色匹配音色...`, '');
          } else {
            setProgress(0);
            setStatus(`开始处理，共 ${p.chunkCount || 0} 段...`, '');
          }
          break;
        case 'token':
          appendToken(p.role, p.delta || '');
          // chunkLabel 实时显示当前累积长度，让用户感知进度
          if (p.chunkCount > 1) {
            chunkLabelEl.textContent = `段 ${p.chunkIndex}/${p.chunkCount} · 生成中(${p.role === 'reasoning' ? '思考' : '输出'} ${p.accumulated.length} 字)`;
          } else {
            chunkLabelEl.textContent = `生成中(${p.role === 'reasoning' ? '思考' : '输出'} ${p.accumulated.length} 字)`;
          }
          break;
        case 'chunk':
          // 一段 LLM 调用结束：重置 token 行，下一段会新建行
          currentTokenLine = null;
          currentTokenRole = null;
          if (p.chunkCount > 0) {
            setProgress(p.chunkIndex / p.chunkCount);
            const extra = p.partialSegments != null ? ` · 已生成 ${p.partialSegments} 段`
              : p.parsedCount != null ? ` · 解析到 ${p.parsedCount} 个角色` : '';
            chunkLabelEl.textContent = `段 ${p.chunkIndex}/${p.chunkCount}${extra}`;
          }
          appendLog(`[段 ${p.chunkIndex}/${p.chunkCount}] ${(p.content || '').slice(0, 200)}`);
          break;
        case 'llm-done':
          currentTokenLine = null;
          currentTokenRole = null;
          setStatus('LLM 返回，校验中...', '');
          appendLog(`[LLM 返回] ${(p.content || '').slice(0, 200)}`);
          break;
        case 'warn':
          appendLog(p.message || '警告', 'warn');
          break;
        case 'fallback':
          setStatus(p.message || '降级规则匹配', 'warn');
          // 降级后规则匹配是同步瞬间完成，把进度条填满并停止 indeterminate 动画
          setProgress(1);
          appendLog(p.message || '降级规则匹配', 'fallback');
          break;
      }
    } else if (event === 'error') {
      // 服务端发的 error 事件：当作错误处理（若已被取消则 handleError 内部忽略）
      handleError({ message: (data && data.message) || '未知错误', code: data && data.code });
    }
  }

  function handleDone(data) {
    if (state !== 'running') return;
    state = 'done';
    setProgress(1);
    setStatus('完成', 'ok');
    chunkLabelEl.textContent = '';
    cancelBtn.textContent = '关闭';
    cancelBtn.className = 'btn btn-secondary';
    const cb = currentOnComplete;
    autoCloseTimer = setTimeout(() => {
      close();
      if (cb) cb(data);
    }, 1500);
  }

  function handleError(err) {
    if (state !== 'running') return;
    // 区分用户取消 vs 真错误
    const isAbort = err && (err.name === 'AbortError' || err.code === 'ABORTED' ||
      (currentController && currentController.signal.aborted));
    if (isAbort) {
      state = 'cancelled';
      setStatus('已取消', 'cancelled');
      appendLog('任务已取消', 'cancel');
      cancelBtn.textContent = '关闭';
      cancelBtn.className = 'btn btn-secondary';
      const cb = currentOnCancel;
      autoCloseTimer = setTimeout(() => { close(); if (cb) cb(); }, 1500);
    } else {
      state = 'error';
      setStatus('失败：' + ((err && err.message) || '未知错误'), 'err');
      appendLog((err && err.message) || '未知错误', 'error');
      cancelBtn.textContent = '关闭';
      cancelBtn.className = 'btn btn-secondary';
      const cb = currentOnError;
      // 错误多停留几秒方便用户看清
      autoCloseTimer = setTimeout(() => { close(); if (cb) cb(err); }, 5000);
    }
  }

  /**
   * 运行一个流式任务
   * @param {object} opts
   * @param {string} opts.title 模态框标题
   * @param {function} opts.streamFn (onEvent, signal) => Promise<doneData>
   * @param {function} [opts.onComplete] (doneData) => void
   * @param {function} [opts.onError] (err) => void
   * @param {function} [opts.onCancel] () => void
   */
  function run(opts) {
    ensureDOM();
    resetUI(opts.title);
    state = 'running';
    currentOnComplete = opts.onComplete;
    currentOnError = opts.onError;
    currentOnCancel = opts.onCancel;
    currentController = new AbortController();
    open();

    Promise.resolve()
      .then(() => opts.streamFn(handleEvent, currentController.signal))
      .then((data) => handleDone(data))
      .catch((err) => handleError(err));

    return currentController;
  }

  return { run };
})();
