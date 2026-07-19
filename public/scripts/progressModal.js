// 进度模态框：流式显示 LLM 任务进度，支持手动取消
// 用法：ProgressModal.run({ title, streamFn:(onEvent,signal)=>Promise<data>, onComplete, onError, onCancel })
//   - streamFn 通常封装 API.streamXxx(novelId, onEvent, signal)
//   - onEvent 收到 { event:'progress'|'done'|'error', data }
//   - 支持 chunkCount > 1 的分块标签页（与 LLM 智能分段样式一致）
window.ProgressModal = (function () {
  let modal = null;
  let titleEl, statusEl, barEl, fillEl, chunkLabelEl, logEl, cancelBtn, closeBtn;
  let chunkTabsWrap, chunkTabsEl, chunkLogsEl; // 分块标签页容器
  let state = 'idle'; // idle | running | done | error | cancelled
  let currentController = null;
  let autoCloseTimer = null;
  let escHandler = null;
  let currentOnComplete, currentOnError, currentOnCancel;

  const LOG_MAX_LINES = 300;

  // 分块标签页状态
  let chunkTabs = {};      // { idx: { tab, log, currentLine, currentRole, completed } }
  let activeChunkIdx = 0;
  let hasChunkTabs = false; // 当前任务是否有多个 chunk（决定是否显示标签页）

  // 当前正在流式追加的 token 行（同 role 的 delta 追加到同一行，role 切换或新段开始时新建行）
  // 仅用于无分块标签页模式的单日志区
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

    // 分块标签页容器（默认隐藏，仅 chunkCount > 1 时显示）
    chunkTabsEl = Utils.el('div', { id: 'pm-chunk-tabs', class: 'seg-chunk-tabs' });
    chunkLogsEl = Utils.el('div', { id: 'pm-chunk-logs', class: 'seg-chunk-logs' });
    chunkTabsWrap = Utils.el('div', { id: 'pm-chunk-wrap', class: 'seg-chunk-wrap hidden' });
    chunkTabsWrap.appendChild(chunkTabsEl);
    chunkTabsWrap.appendChild(chunkLogsEl);

    const body = Utils.el('div', { class: 'modal-body' }, [statusEl, barWrap, chunkLabelEl, chunkTabsWrap, logEl]);

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
   * 流式追加一个 token delta 到当前行（无分块标签页模式）。
   * role 切换或首次调用时新建行：
   *   reasoning -> [思考] 灰色斜体
   *   content   -> [输出] 正常色
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

  // === 分块标签页操作 ===

  // 初始化分块标签页：创建"总览" + 每个 chunk 一个标签
  function initChunkTabs(total) {
    chunkTabsEl.innerHTML = '';
    chunkLogsEl.innerHTML = '';
    chunkTabs = {};
    activeChunkIdx = 0;

    // 总览标签
    const overviewTab = Utils.el('button', { class: 'seg-chunk-tab active', dataset: { idx: '0' } }, '总览');
    overviewTab.addEventListener('click', () => switchChunkTab(0));
    chunkTabsEl.appendChild(overviewTab);
    const overviewLog = Utils.el('div', { class: 'seg-log active', dataset: { idx: '0' } });
    chunkLogsEl.appendChild(overviewLog);
    chunkTabs[0] = { tab: overviewTab, log: overviewLog, currentLine: null, currentRole: null, completed: false };

    // 每个 chunk 一个标签
    for (let i = 1; i <= total; i++) {
      const tab = Utils.el('button', { class: 'seg-chunk-tab', dataset: { idx: String(i) } }, `块 ${i}`);
      tab.addEventListener('click', () => switchChunkTab(i));
      chunkTabsEl.appendChild(tab);
      const log = Utils.el('div', { class: 'seg-log', dataset: { idx: String(i) } });
      chunkLogsEl.appendChild(log);
      chunkTabs[i] = { tab, log, currentLine: null, currentRole: null, completed: false };
    }
    chunkTabsWrap.classList.remove('hidden');
    // 隐藏单日志区（避免重复显示）
    logEl.classList.add('hidden');
    hasChunkTabs = true;
  }

  function clearChunkTabs() {
    if (chunkTabsEl) chunkTabsEl.innerHTML = '';
    if (chunkLogsEl) chunkLogsEl.innerHTML = '';
    chunkTabs = {};
    activeChunkIdx = 0;
    if (chunkTabsWrap) chunkTabsWrap.classList.add('hidden');
    if (logEl) logEl.classList.remove('hidden');
    hasChunkTabs = false;
  }

  function switchChunkTab(idx) {
    activeChunkIdx = idx;
    for (const t of chunkTabsEl.children) {
      t.classList.toggle('active', parseInt(t.dataset.idx, 10) === idx);
    }
    for (const l of chunkLogsEl.children) {
      l.classList.toggle('active', parseInt(l.dataset.idx, 10) === idx);
    }
    const activeLog = chunkLogsEl.querySelector('.seg-log.active');
    if (activeLog) activeLog.scrollTop = activeLog.scrollHeight;
  }

  // 向指定分块追加 token
  function appendChunkToken(chunkIdx, role, delta) {
    if (!delta) return;
    const entry = chunkTabs[chunkIdx];
    if (!entry) return;
    const log = entry.log;
    if (!log) return;
    if (!entry.currentLine || entry.currentRole !== role) {
      const prefix = role === 'reasoning' ? '[思考] ' : '[输出] ';
      entry.currentLine = Utils.el('div', { class: 'seg-log-line ' + role }, prefix);
      log.appendChild(entry.currentLine);
      entry.currentRole = role;
      while (log.childNodes.length > LOG_MAX_LINES) log.removeChild(log.firstChild);
    }
    entry.currentLine.textContent += delta;
    if (activeChunkIdx === chunkIdx) log.scrollTop = log.scrollHeight;
  }

  // 重置某块的当前 token 行
  function resetChunkTokenLine(chunkIdx) {
    const entry = chunkTabs[chunkIdx];
    if (!entry) return;
    entry.currentLine = null;
    entry.currentRole = null;
  }

  // 标记某块完成（变绿）
  function markChunkDone(chunkIdx) {
    const entry = chunkTabs[chunkIdx];
    if (!entry) return;
    if (entry.completed) return;
    entry.completed = true;
    entry.tab.classList.add('done');
    appendChunkLog(chunkIdx, '── 该块 LLM 处理完成 ──', 'ok');
    // 更新总览：记录完成进度
    let completedCount = 0;
    let total = 0;
    for (const k of Object.keys(chunkTabs)) {
      if (k === '0') continue; // 跳过总览
      total++;
      if (chunkTabs[k].completed) completedCount++;
    }
    appendOverviewLog(`块 ${chunkIdx} 完成（${completedCount}/${total}）`, 'ok');
  }

  // 向指定分块日志追加一行
  function appendChunkLog(chunkIdx, text, kind) {
    const entry = chunkTabs[chunkIdx];
    if (!entry || !entry.log) return;
    const line = Utils.el('div', { class: 'seg-log-line' + (kind ? ' ' + kind : '') }, text);
    entry.log.appendChild(line);
    entry.currentLine = null;
    entry.currentRole = null;
    while (entry.log.childNodes.length > LOG_MAX_LINES) entry.log.removeChild(entry.log.firstChild);
    if (activeChunkIdx === chunkIdx) entry.log.scrollTop = entry.log.scrollHeight;
  }

  // 向总览日志追加一行
  function appendOverviewLog(text, kind) {
    const entry = chunkTabs[0];
    if (!entry || !entry.log) return;
    const line = Utils.el('div', { class: 'seg-log-line' + (kind ? ' ' + kind : '') }, text);
    entry.log.appendChild(line);
    while (entry.log.childNodes.length > LOG_MAX_LINES) entry.log.removeChild(entry.log.firstChild);
    if (activeChunkIdx === 0) entry.log.scrollTop = entry.log.scrollHeight;
  }

  function resetUI(title) {
    titleEl.textContent = title;
    setStatus('准备中...', '');
    setProgress(0);
    chunkLabelEl.textContent = '';
    logEl.innerHTML = '';
    currentTokenLine = null;
    currentTokenRole = null;
    clearChunkTabs();
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

  async function requestCancel() {
    if (state !== 'running') return;
    if (!await Utils.confirmDialog({
      title: '取消任务',
      message: '取消任务？已处理的进度将丢失。',
      confirmText: '取消任务',
      danger: true,
    })) return;
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
            // auto-match 的 chunkCount > 1 表示分批并行
            if (p.chunkCount && p.chunkCount > 1) {
              initChunkTabs(p.chunkCount);
              appendOverviewLog(`开始为 ${p.characterCount || 0} 个角色匹配音色（分 ${p.chunkCount} 批并行）`, 'info');
              setProgress(0);
              setStatus(`并行匹配中...（${p.chunkCount} 批，共 ${p.characterCount || 0} 角色）`, '');
            } else {
              setIndeterminate();
              setStatus(`正在为 ${p.characterCount || 0} 个角色匹配音色...`, '');
            }
          } else {
            // extract：chunkCount > 1 时启用分块标签页
            if (p.chunkCount && p.chunkCount > 1) {
              initChunkTabs(p.chunkCount);
              appendOverviewLog(`开始提取角色（共 ${p.chunkCount} 段，并行 ${p.concurrency || 3}）`, 'info');
              setProgress(0);
              setStatus(`并行提取中...（共 ${p.chunkCount} 段）`, '');
            } else {
              setProgress(0);
              setStatus(`开始处理，共 ${p.chunkCount || 0} 段...`, '');
            }
          }
          break;
        case 'token':
          if (hasChunkTabs && p.chunkIndex) {
            appendChunkToken(p.chunkIndex, p.role, p.delta || '');
            // 仅更新当前选中块的信息，避免多块并行时标签闪烁
            if (p.chunkCount > 1 && activeChunkIdx === p.chunkIndex) {
              chunkLabelEl.textContent = `块 ${p.chunkIndex}/${p.chunkCount} · 生成中(${p.role === 'reasoning' ? '思考' : '输出'} ${p.accumulated.length} 字)`;
            }
          } else {
            appendToken(p.role, p.delta || '');
            if (p.chunkCount > 1) {
              chunkLabelEl.textContent = `段 ${p.chunkIndex}/${p.chunkCount} · 生成中(${p.role === 'reasoning' ? '思考' : '输出'} ${p.accumulated.length} 字)`;
            } else {
              chunkLabelEl.textContent = `生成中(${p.role === 'reasoning' ? '思考' : '输出'} ${p.accumulated.length} 字)`;
            }
          }
          break;
        case 'chunk-done':
          // 某块 LLM 调用完成（变绿）
          if (hasChunkTabs && p.chunkIndex) {
            resetChunkTokenLine(p.chunkIndex);
            markChunkDone(p.chunkIndex);
            // 更新进度条
            if (p.chunkCount > 0) {
              let done = 0;
              for (const k of Object.keys(chunkTabs)) {
                if (k !== '0' && chunkTabs[k].completed) done++;
              }
              setProgress(done / p.chunkCount);
            }
          }
          break;
        case 'chunk':
          // 一段 LLM 调用结束
          if (hasChunkTabs && p.chunkIndex) {
            resetChunkTokenLine(p.chunkIndex);
            const extra = p.parsedCount != null ? ` · 解析到 ${p.parsedCount} 个角色` : '';
            if (p.chunkCount > 0) {
              let done = 0;
              for (const k of Object.keys(chunkTabs)) {
                if (k !== '0' && chunkTabs[k].completed) done++;
              }
              setProgress(done / p.chunkCount);
              // 仅更新当前选中块的信息，避免多块并行时标签闪烁
              if (activeChunkIdx === p.chunkIndex) {
                chunkLabelEl.textContent = `块 ${p.chunkIndex}/${p.chunkCount}${extra}`;
              }
            }
            appendChunkLog(p.chunkIndex, `[LLM 返回] ${(p.content || '').slice(0, 200)}`);
          } else {
            currentTokenLine = null;
            currentTokenRole = null;
            if (p.chunkCount > 0) {
              setProgress(p.chunkIndex / p.chunkCount);
              const extra = p.partialSegments != null ? ` · 已生成 ${p.partialSegments} 段`
                : p.parsedCount != null ? ` · 解析到 ${p.parsedCount} 个角色` : '';
              chunkLabelEl.textContent = `段 ${p.chunkIndex}/${p.chunkCount}${extra}`;
            }
            appendLog(`[段 ${p.chunkIndex}/${p.chunkCount}] ${(p.content || '').slice(0, 200)}`);
          }
          break;
        case 'llm-done':
          currentTokenLine = null;
          currentTokenRole = null;
          setStatus('LLM 返回，校验中...', '');
          if (hasChunkTabs) {
            appendOverviewLog('所有块 LLM 调用完成，校验中...', 'info');
          } else {
            appendLog(`[LLM 返回] ${(p.content || '').slice(0, 200)}`);
          }
          break;
        case 'warn':
          if (hasChunkTabs) {
            appendOverviewLog(p.message || '警告', 'warn');
          } else {
            appendLog(p.message || '警告', 'warn');
          }
          break;
        case 'fallback':
          setStatus(p.message || '降级规则匹配', 'warn');
          // 降级后规则匹配是同步瞬间完成，把进度条填满并停止 indeterminate 动画
          setProgress(1);
          if (hasChunkTabs) {
            appendOverviewLog(p.message || '降级规则匹配', 'warn');
          } else {
            appendLog(p.message || '降级规则匹配', 'fallback');
          }
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
    if (hasChunkTabs) {
      appendOverviewLog('任务完成', 'ok');
    }
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
      if (hasChunkTabs) appendOverviewLog('任务已取消', 'cancel');
      else appendLog('任务已取消', 'cancel');
      cancelBtn.textContent = '关闭';
      cancelBtn.className = 'btn btn-secondary';
      const cb = currentOnCancel;
      autoCloseTimer = setTimeout(() => { close(); if (cb) cb(); }, 1500);
    } else {
      state = 'error';
      setStatus('失败：' + ((err && err.message) || '未知错误'), 'err');
      if (hasChunkTabs) appendOverviewLog((err && err.message) || '未知错误', 'error');
      else appendLog((err && err.message) || '未知错误', 'error');
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
