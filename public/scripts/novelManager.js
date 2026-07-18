// 小说管理器：列表、详情、段落显示、分段操作
window.NovelManager = (function () {
  let currentNovel = null;
  let voiceCatalog = [];
  let voiceGroups = {};

  async function init() {
    bindEvents();
    await refreshList();
    await loadVoiceCatalog();
  }

  async function loadVoiceCatalog() {
    try {
      const data = await API.listVoices(true);
      voiceGroups = (data && data.groups) || {};
      voiceCatalog = Object.values(voiceGroups).flat();
    } catch (err) {
      console.error('load voice catalog failed', err);
    }
  }

  function bindEvents() {
    // 新建小说按钮
    Utils.$('#btn-new-novel').addEventListener('click', () => openNewNovelModal());

    // 模态框关闭
    Utils.$$('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', closeNewNovelModal);
    });
    Utils.$('#modal-new-novel').addEventListener('click', (e) => {
      if (e.target.id === 'modal-new-novel') closeNewNovelModal();
    });

    // 文件上传
    Utils.$('#new-novel-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      Utils.$('#new-novel-text').value = text;
      if (!Utils.$('#new-novel-title').value) {
        Utils.$('#new-novel-title').value = file.name.replace(/\.[^.]+$/, '');
      }
    });

    // 创建小说
    Utils.$('#btn-create-novel').addEventListener('click', handleCreateNovel);
  }

  async function refreshList() {
    try {
      const data = await API.listNovels();
      renderList(data.novels || []);
    } catch (err) {
      Utils.toast('加载小说列表失败: ' + err.message, 'error');
    }
  }

  function renderList(novels) {
    const ul = Utils.$('#novel-list');
    ul.innerHTML = '';
    if (!novels.length) {
      ul.innerHTML = '<li class="empty-hint">暂无小说，点击"新建"上传</li>';
      return;
    }
    for (const n of novels) {
      const li = Utils.el('li', {
        dataset: { id: n.id },
        class: currentNovel && currentNovel.id === n.id ? 'active' : '',
        onclick: () => openNovel(n.id),
      }, [
        Utils.el('div', { class: 'novel-title' }, n.title),
        Utils.el('div', { class: 'novel-meta' },
          `${n.segmentCount || 0} 段 · ${n.characterCount || 0} 角色 · ${n.rawTextLength || 0} 字`),
      ]);
      ul.appendChild(li);
    }
  }

  async function openNovel(id) {
    try {
      const novel = await API.getNovel(id);
      currentNovel = novel;
      Player.loadNovel(novel);
      CharacterPanel.setNovel(novel);
      renderDetail(novel);
      // 高亮列表项
      Utils.$$('#novel-list li').forEach((li) => {
        li.classList.toggle('active', li.dataset.id === id);
      });
      // 检查是否有未完成的 LLM 分段进度，提示用户可继续
      checkSegmentProgress(id);
    } catch (err) {
      Utils.toast('打开小说失败: ' + err.message, 'error');
    }
  }

  async function checkSegmentProgress(id) {
    try {
      const r = await API.getSegmentProgress(id);
      if (r.progress && !r.progress.completed) {
        showSegStatusBar(
          `有未完成的分段：已完成 ${r.progress.chunkIndex}/${r.progress.chunkTotal} 块`,
          { showContinue: true }
        );
      } else {
        hideSegStatusBar();
      }
    } catch (_) { /* 忽略进度查询错误 */ }
  }

  function renderDetail(novel) {
    const root = Utils.$('#novel-content');
    // 保护分段状态条（增量分段时 renderDetail 会被频繁调用，避免销毁状态条与实时输出日志）
    const savedBar = Utils.$('#seg-status-bar');
    if (savedBar) savedBar.remove();

    root.innerHTML = '';

    const detail = Utils.el('div', { class: 'novel-detail' });

    // 头部
    const head = Utils.el('div', { class: 'novel-detail-head' }, [
      Utils.el('h2', {}, novel.title),
      Utils.el('div', { class: 'novel-actions' }, [
        Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => resegment('rule') }, '规则分段'),
        Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => resegment('llm') }, 'LLM 智能分段'),
        Utils.el('button', { class: 'btn btn-danger btn-sm', onclick: () => deleteNovel(novel.id) }, '删除'),
      ]),
    ]);

    // 分段工具条
    const toolbar = Utils.el('div', { class: 'segment-toolbar' }, [
      Utils.el('span', {}, '段落列表（点击段落可跳转播放）'),
      Utils.el('span', { class: 'seg-count' }, `共 ${(novel.segments || []).length} 段`),
    ]);

    // 播放器条
    const playerBar = renderPlayerBar(novel);

    // 段落文本视图
    const segView = Utils.el('div', { class: 'segment-view', id: 'segment-view' });
    const segments = (novel.segments || []).slice().sort((a, b) => a.order - b.order);
    for (const seg of segments) {
      const char = seg.characterId ? (novel.characters || []).find((c) => c.id === seg.characterId) : null;
      const unbound = seg.type === 'dialog' && !seg.characterId;
      const regenBtn = Utils.el('button', {
        class: 'btn btn-icon seg-regen',
        title: '重新生成此段音频',
        onclick: (e) => {
          e.stopPropagation();
          if (!confirm('重新生成此段音频？将删除缓存并重新合成。')) return;
          Player.regenerate(seg.id);
          Utils.toast('正在重新生成音频...', 'info');
        },
      }, '↻');
      // 对话段：可编辑的角色选择下拉；旁白段：无需绑定（不显示下拉）
      const charSelect = seg.type === 'dialog'
        ? (() => {
            const sel = Utils.el('select', { class: 'seg-char-select' });
            sel.appendChild(Utils.el('option', { value: '' }, '— 未绑定 —'));
            for (const c of (novel.characters || [])) {
              const opt = Utils.el('option', { value: c.id }, c.name);
              if (seg.characterId === c.id) opt.selected = true;
              sel.appendChild(opt);
            }
            sel.addEventListener('change', async () => {
              const newVal = sel.value;
              const oldVal = seg.characterId;
              try {
                await API.updateSegment(novel.id, seg.id, { characterId: newVal });
                // 同步闭包 seg + currentNovel 段落数据
                seg.characterId = newVal || null;
                const segIdx = currentNovel.segments.findIndex((s) => s.id === seg.id);
                if (segIdx >= 0) currentNovel.segments[segIdx].characterId = newVal || null;
                // 局部更新绑定高亮（不重新渲染列表，保留滚动位置）
                updateSegBlockBindingDOM(seg.id);
                Utils.toast('已换绑角色', 'success');
              } catch (err) {
                // 回滚 select 到原值（不重新渲染，保留滚动位置）
                sel.value = oldVal || '';
                Utils.toast('换绑失败: ' + err.message, 'error');
              }
            });
            sel.addEventListener('click', (e) => e.stopPropagation()); // 防止触发段落跳转
            return sel;
          })()
        : null;
      const block = Utils.el('div', {
        class: `seg-block ${seg.type}` + (seg.id === currentPlayingId() ? ' current' : '') + (unbound ? ' unbound' : ''),
        dataset: { segId: seg.id },
        onclick: () => Player.seekTo(segments.findIndex((s) => s.id === seg.id)),
      }, [
        Utils.el('div', { class: 'seg-tag' }, [
          seg.type === 'dialog'
            ? Utils.el('span', { class: 'seg-type dialog' }, '对话')
            : Utils.el('span', { class: 'seg-type narration' }, '旁白'),
          unbound ? Utils.el('span', { class: 'seg-unbound-flag' }, '未绑定') : null,
          charSelect,
          regenBtn,
        ]),
        Utils.el('div', { class: 'seg-text' }, seg.text),
      ]);
      segView.appendChild(block);
    }

    detail.appendChild(head);
    detail.appendChild(toolbar);
    detail.appendChild(playerBar);
    detail.appendChild(segView);
    root.appendChild(detail);

    // 重新插入状态条到 toolbar 之后（保留实时输出日志内容）
    if (savedBar) {
      const toolbarEl = Utils.$('.segment-toolbar');
      if (toolbarEl) toolbarEl.after(savedBar);
    }

    // 绑定播放器事件
    bindPlayerEvents();
  }

  /**
   * 局部更新单个段落 block 的绑定状态（不重建列表，保留滚动位置）
   * 用于换绑角色后更新 unbound 高亮 + 未绑定标记
   */
  function updateSegBlockBindingDOM(segId) {
    const block = Utils.$(`#segment-view .seg-block[data-seg-id="${segId}"]`);
    if (!block) return;
    const seg = (currentNovel.segments || []).find((s) => s.id === segId);
    if (!seg) return;
    const unbound = seg.type === 'dialog' && !seg.characterId;
    block.classList.toggle('unbound', unbound);
    // 添加/移除 未绑定 标记（位于 seg-type 之后）
    let flag = block.querySelector('.seg-unbound-flag');
    if (unbound && !flag) {
      const segType = block.querySelector('.seg-type');
      flag = Utils.el('span', { class: 'seg-unbound-flag' }, '未绑定');
      if (segType && segType.nextSibling) segType.parentNode.insertBefore(flag, segType.nextSibling);
      else if (segType) segType.parentNode.appendChild(flag);
    } else if (!unbound && flag) {
      flag.remove();
    }
  }

  /**
   * 保存滚动位置（window + #segment-view），供 renderDetail 前后保持视图不跳动
   */
  function saveScrollPos() {
    const sv = Utils.$('#segment-view');
    return {
      window: window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
      segView: sv ? sv.scrollTop : 0,
    };
  }
  function restoreScrollPos(pos) {
    if (!pos) return;
    if (pos.window) {
      window.scrollTo(0, pos.window);
    }
    if (pos.segView) {
      const sv = Utils.$('#segment-view');
      if (sv) sv.scrollTop = pos.segView;
    }
  }

  function currentPlayingId() {
    const s = Player.getState();
    return s.currentSegment ? s.currentSegment.id : null;
  }

  function renderPlayerBar(novel) {
    const bar = Utils.el('div', { class: 'player-bar' });

    const controls = Utils.el('div', { class: 'player-controls' }, [
      Utils.el('button', { class: 'player-btn', id: 'btn-prev', onclick: () => Player.prev() }, '◄◄'),
      Utils.el('button', { class: 'player-btn play-btn', id: 'btn-play', onclick: () => Player.togglePlay() }, '►'),
      Utils.el('button', { class: 'player-btn', id: 'btn-next', onclick: () => Player.next() }, '►►'),
      Utils.el('button', { class: 'player-btn', id: 'btn-stop', onclick: () => Player.stop() }, '■'),
    ]);

    const info = Utils.el('div', { class: 'player-info' }, [
      Utils.el('div', { class: 'player-segment-info', id: 'player-segment-info' }, [
        Utils.el('span', {}, '准备就绪'),
      ]),
      Utils.el('div', { class: 'player-progress' }, [
        Utils.el('span', { id: 'player-time-cur' }, '00:00'),
        Utils.el('div', { class: 'player-progress-bar' }, [
          Utils.el('div', { class: 'player-progress-fill', id: 'player-progress-fill' }),
        ]),
        Utils.el('span', { id: 'player-time-dur' }, '00:00'),
      ]),
    ]);

    const speed = Utils.el('div', { class: 'player-speed' }, [
      Utils.el('span', {}, '速率'),
      (() => {
        const sel = Utils.el('select', { id: 'player-speed-select' });
        [0.75, 1.0, 1.25, 1.5, 1.75, 2.0].forEach((r) => {
          const opt = Utils.el('option', { value: r }, String(r));
          if (r === 1.0) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => Player.setPlaybackRate(parseFloat(sel.value)));
        return sel;
      })(),
    ]);

    bar.appendChild(controls);
    bar.appendChild(info);
    bar.appendChild(speed);
    return bar;
  }

  function bindPlayerEvents() {
    Player.on('state', updatePlayerUI);
    Player.on('progress', updateProgress);
    Player.on('segment-loading', onSegmentLoading);
    Player.on('segment-meta', onSegmentMeta);
    Player.on('error', onPlayerError);
  }

  function updatePlayerUI(state) {
    const playBtn = Utils.$('#btn-play');
    if (!playBtn) return;
    if (state.isFetching) {
      playBtn.textContent = '…';
      playBtn.disabled = true;
    } else if (state.isPlaying && !state.audioPaused) {
      playBtn.textContent = '‖';
      playBtn.disabled = false;
    } else {
      playBtn.textContent = '►';
      playBtn.disabled = false;
    }

    // 高亮当前段
    Utils.$$('#segment-view .seg-block').forEach((b) => {
      b.classList.toggle('current', state.currentSegment && b.dataset.segId === state.currentSegment.id);
    });

    // 滚动到当前段
    if (state.currentSegment) {
      const cur = Utils.$(`#segment-view .seg-block[data-seg-id="${state.currentSegment.id}"]`);
      if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 段信息
    const info = Utils.$('#player-segment-info');
    if (info) {
      if (state.isFetching) {
        info.innerHTML = '<span class="spinner"></span> 加载音频中...';
      } else if (state.currentSegment) {
        const seg = state.currentSegment;
        const typeLabel = seg.type === 'dialog' ? '对话' : '旁白';
        const typeClass = seg.type === 'dialog' ? 'dialog' : 'narration';
        const charName = seg.characterId && currentNovel
          ? ((currentNovel.characters || []).find((c) => c.id === seg.characterId) || {}).name
          : null;
        info.innerHTML = `
          <span class="seg-type ${typeClass}">${typeLabel}</span>
          ${charName ? `<span class="char-name">${Utils.escapeHtml(charName)}</span>` : ''}
          <span>第 ${state.currentIndex + 1} / ${state.queueLength} 段</span>
        `;
      } else {
        info.innerHTML = '<span>准备就绪</span>';
      }
    }
  }

  function updateProgress(p) {
    const fill = Utils.$('#player-progress-fill');
    if (fill) {
      fill.classList.remove('loading');
      fill.style.width = (p.ratio * 100).toFixed(1) + '%';
    }
    const cur = Utils.$('#player-time-cur');
    const dur = Utils.$('#player-time-dur');
    if (cur) cur.textContent = Utils.formatTime(p.currentTime);
    if (dur) dur.textContent = Utils.formatTime(p.duration);
  }

  function onSegmentLoading(payload) {
    const fill = Utils.$('#player-progress-fill');
    if (fill) {
      fill.classList.add('loading');
      fill.style.width = '100%';
    }
    const cur = Utils.$('#player-time-cur');
    const dur = Utils.$('#player-time-dur');
    if (cur) cur.textContent = '加载中';
    if (dur) dur.textContent = '...';
  }

  function onSegmentMeta(meta) {
    if (meta.cached) {
      Utils.toast('命中缓存，秒播', 'success');
    }
  }

  function onPlayerError(err) {
    const fill = Utils.$('#player-progress-fill');
    if (fill) fill.classList.remove('loading');
  }

  function openNewNovelModal() {
    Utils.$('#modal-new-novel').classList.remove('hidden');
    Utils.$('#new-novel-title').focus();
  }

  function closeNewNovelModal() {
    Utils.$('#modal-new-novel').classList.add('hidden');
    Utils.$('#new-novel-title').value = '';
    Utils.$('#new-novel-text').value = '';
    Utils.$('#new-novel-file').value = '';
  }

  async function handleCreateNovel() {
    const title = Utils.$('#new-novel-title').value.trim();
    const text = Utils.$('#new-novel-text').value;
    const autoSegment = Utils.$('#new-novel-autoseg').checked;
    if (!text || !text.trim()) {
      Utils.toast('请输入小说正文', 'error');
      return;
    }
    const btn = Utils.$('#btn-create-novel');
    btn.disabled = true;
    btn.textContent = '创建中...';
    try {
      const novel = await API.createNovel({ title: title || '未命名小说', text, autoSegment });
      Utils.toast('小说创建成功', 'success');
      closeNewNovelModal();
      await refreshList();
      await openNovel(novel.id);
    } catch (err) {
      Utils.toast('创建失败: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '创建';
    }
  }

  async function resegment(mode) {
    if (!currentNovel) return;
    const btnLabel = mode === 'llm' ? 'LLM 智能分段' : '规则分段';

    // LLM 模式：走非阻塞状态条 + 增量分段（startLLMSegmentation 自身会做角色为空检查与 confirm）
    if (mode === 'llm') {
      startLLMSegmentation('start');
      return;
    }

    if (!confirm(`确定要重新${btnLabel}吗？这将覆盖当前段落与角色配置（已配置的音色会保留）。`)) return;
    // 规则模式：保持原样（同步快速完成，无需进度框）
    Utils.toast(`正在执行${btnLabel}...`);
    try {
      const novel = await API.segmentNovelRule(currentNovel.id);
      currentNovel = novel;
      Player.loadNovel(novel);
      CharacterPanel.setNovel(novel);
      renderDetail(novel);
      Utils.toast(`${btnLabel}完成: ${(novel.segments || []).length} 段, ${(novel.characters || []).length} 角色`, 'success');
    } catch (err) {
      Utils.toast(`${btnLabel}失败: ` + err.message, 'error');
    }
  }

  // === LLM 增量分段（非阻塞状态条 + 可取消可继续 + 实时输出日志）===
  let segController = null;
  // 当前正在流式追加的 token 行（同 role 的 delta 追加到同一行，role 切换或新块开始时新建行）
  let segLogCurrentLine = null;
  let segLogCurrentRole = null;
  const SEG_LOG_MAX_LINES = 300;

  async function startLLMSegmentation(mode) {
    // mode: 'start' | 'continue' | 'fresh'
    if (!currentNovel) return;
    if (segController) {
      Utils.toast('已有分段任务进行中', 'info');
      return;
    }
    const hasChars = (currentNovel.characters || []).length > 0;
    // 角色为空时提示先提取/新建；执意继续则 forceEmpty（所有段落 characterId=null）
    if (!hasChars) {
      const choice = confirm(
        '当前没有角色，LLM 分段将无法绑定角色（所有对话段将标记为未绑定）。\n\n' +
        '建议先点"LLM 提取角色"或"添加角色"建立角色列表。\n\n' +
        '点"确定"仍要继续分段（全部不绑定）；点"取消"返回。'
      );
      if (!choice) return;
    }
    // start 模式：若已有段落，确认覆盖
    if (mode === 'start' && (currentNovel.segments || []).length > 0) {
      if (!confirm('确定要重新 LLM 智能分段吗？这将清空当前段落并重新分段（角色列表与音色配置保留）。')) return;
    }

    const body = mode === 'continue'
      ? { continue: true }
      : mode === 'fresh'
        ? { fresh: true }
        : {};
    if (!hasChars) body.forceEmpty = true; // 执意继续

    segController = new AbortController();
    // 创建/重置状态条（含日志区），默认展开实时输出
    showSegStatusBar('分块分段中：准备中...', { cancellable: true, showLog: true });
    resetSegLog();

    try {
      const data = await API.streamSegmentLLM(currentNovel.id, body, (evt) => {
        const p = evt.data || {};
        if (evt.event === 'progress') {
          if (p.type === 'chunk-persisted') {
            // 保存滚动位置（renderDetail 会重建列表导致回顶）
            const savedScroll = saveScrollPos();
            // 增量刷新：用后端返回的 novel 直接更新视图
            currentNovel = p.novel;
            renderDetail(currentNovel);
            // 恢复滚动位置
            restoreScrollPos(savedScroll);
            updateSegStatusBar(
              `分块分段中：第 ${p.chunkIndex}/${p.chunkTotal} 大段，已生成 ${p.segmentsSoFar} 段`,
              { cancellable: true }
            );
            // 块持久化后加分隔线到日志
            appendSegLogLine(`── 第 ${p.chunkIndex}/${p.chunkTotal} 块完成，已持久化 ──`, 'chunk');
          } else if (p.type === 'start') {
            const startIdx = p.startChunkIndex || 0;
            updateSegStatusBar(
              startIdx > 0 ? `从第 ${startIdx + 1} 块继续，共 ${p.chunkTotal} 块...` : `开始处理，共 ${p.chunkTotal} 块...`,
              { cancellable: true }
            );
            appendSegLogLine(
              startIdx > 0 ? `── 从第 ${startIdx + 1} 块继续，共 ${p.chunkTotal} 块 ──` : `── 开始处理，共 ${p.chunkTotal} 块 ──`,
              'chunk'
            );
          } else if (p.type === 'token') {
            // 实时追加 LLM token 到日志区（reasoning 灰色斜体，content 正常色）
            appendSegLogToken(p.role, p.delta || '');
          } else if (p.type === 'chunk') {
            // 单块 LLM 返回完成：重置 token 行，下块新建
            segLogCurrentLine = null;
            segLogCurrentRole = null;
          } else if (p.type === 'warn') {
            appendSegLogLine('警告: ' + (p.message || '警告'), 'warn');
          }
        } else if (evt.event === 'error') {
          if (p.code === 'NO_CHARACTERS') {
            Utils.toast(p.message, 'error');
          } else {
            Utils.toast('分段错误: ' + (p.message || '未知错误'), 'error');
          }
          appendSegLogLine('错误: ' + (p.message || '未知错误'), 'error');
        }
      }, segController.signal);
      // done
      if (data && data.novel) {
        currentNovel = data.novel;
        Player.loadNovel(currentNovel);
        CharacterPanel.setNovel(currentNovel);
        renderDetail(currentNovel);
      }
      appendSegLogLine('分段完成', 'ok');
      updateSegStatusBar('分段完成', { done: true });
      const unbound = (currentNovel.segments || []).filter((s) => s.type === 'dialog' && !s.characterId).length;
      const tip = unbound > 0
        ? `LLM 分段完成: ${(currentNovel.segments || []).length} 段，${unbound} 个对话段未绑定角色（标记为未绑定）`
        : `LLM 智能分段完成: ${(currentNovel.segments || []).length} 段`;
      Utils.toast(tip, unbound > 0 ? 'info' : 'success');
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.code === 'ABORTED')) {
        appendSegLogLine('已取消', 'cancel');
        // 取消：刷新已分段数据，显示继续按钮
        await refreshCurrent();
        try {
          const prog = await API.getSegmentProgress(currentNovel.id);
          if (prog.progress && !prog.progress.completed) {
            updateSegStatusBar(
              `已取消：完成 ${prog.progress.chunkIndex}/${prog.progress.chunkTotal} 块`,
              { showContinue: true }
            );
          } else {
            updateSegStatusBar('已取消', { done: true });
          }
        } catch (_) { updateSegStatusBar('已取消', { done: true }); }
      } else {
        appendSegLogLine('失败: ' + (err && err.message), 'error');
        Utils.toast('分段失败: ' + (err && err.message), 'error');
        updateSegStatusBar('分段失败', { done: true });
      }
    } finally {
      segController = null;
    }
  }

  /**
   * 显示/更新分段状态条。结构：
   *   #seg-status-bar
   *     #seg-status-line  （状态行：文字 + 按钮，可重建）
   *     #seg-status-log   （实时输出日志区，持久不重建）
   * opts: { cancellable, showContinue, done, showLog }
   */
  function showSegStatusBar(text, opts) {
    opts = opts || {};
    let bar = Utils.$('#seg-status-bar');
    if (!bar) {
      bar = Utils.el('div', { id: 'seg-status-bar', class: 'seg-status-bar' });
      const line = Utils.el('div', { id: 'seg-status-line', class: 'seg-status-line' });
      const log = Utils.el('div', { id: 'seg-status-log', class: 'seg-status-log hidden' });
      bar.appendChild(line);
      bar.appendChild(log);
      const toolbar = Utils.$('.segment-toolbar');
      if (toolbar) toolbar.after(bar);
      else Utils.$('#novel-content').appendChild(bar);
    }
    // 只重建状态行（保留日志区内容）
    const line = Utils.$('#seg-status-line');
    line.innerHTML = '';
    line.appendChild(Utils.el('span', { class: 'seg-status-text' }, text));

    // 实时输出切换按钮（日志区有内容或 showLog 时显示）
    const log = Utils.$('#seg-status-log');
    const hasLog = log && log.children.length > 0;
    if (hasLog || opts.showLog) {
      const toggleBtn = Utils.el('button', { class: 'btn btn-link btn-sm seg-log-toggle' },
        (log && !log.classList.contains('hidden')) ? '隐藏输出' : '实时输出');
      toggleBtn.addEventListener('click', () => {
        const lg = Utils.$('#seg-status-log');
        if (!lg) return;
        lg.classList.toggle('hidden');
        toggleBtn.textContent = lg.classList.contains('hidden') ? '实时输出' : '隐藏输出';
        if (!lg.classList.contains('hidden')) lg.scrollTop = lg.scrollHeight;
      });
      line.appendChild(toggleBtn);
    }

    if (opts.cancellable) {
      const cancelBtn = Utils.el('button', { class: 'btn btn-danger btn-sm' }, '取消分段');
      cancelBtn.addEventListener('click', () => {
        if (segController) {
          segController.abort();
          Utils.toast('正在取消...', 'info');
        }
      });
      line.appendChild(cancelBtn);
    }
    if (opts.showContinue) {
      const contBtn = Utils.el('button', { class: 'btn btn-primary btn-sm' }, '继续分段');
      contBtn.addEventListener('click', () => startLLMSegmentation('continue'));
      const freshBtn = Utils.el('button', { class: 'btn btn-secondary btn-sm' }, '重新开始');
      freshBtn.addEventListener('click', () => {
        if (!confirm('重新开始将清空已分段的段落，确定吗？')) return;
        startLLMSegmentation('fresh');
      });
      line.appendChild(contBtn);
      line.appendChild(freshBtn);
    }
    if (opts.done) {
      const closeBtn = Utils.el('button', { class: 'btn btn-secondary btn-sm' }, '关闭');
      closeBtn.addEventListener('click', () => hideSegStatusBar());
      line.appendChild(closeBtn);
    }
    // showLog 时默认展开日志区
    if (opts.showLog && log) log.classList.remove('hidden');
    bar.classList.remove('hidden');
  }

  function updateSegStatusBar(text, opts) {
    // 复用 showSegStatusBar 重建状态行（保留日志区）
    showSegStatusBar(text, opts);
  }

  function hideSegStatusBar() {
    const bar = Utils.$('#seg-status-bar');
    if (bar) bar.remove();
    segLogCurrentLine = null;
    segLogCurrentRole = null;
  }

  // === 实时输出日志区操作 ===
  function resetSegLog() {
    const log = Utils.$('#seg-status-log');
    if (!log) return;
    log.innerHTML = '';
    segLogCurrentLine = null;
    segLogCurrentRole = null;
  }

  function appendSegLogToken(role, delta) {
    if (!delta) return;
    const log = Utils.$('#seg-status-log');
    if (!log) return;
    if (!segLogCurrentLine || segLogCurrentRole !== role) {
      const prefix = role === 'reasoning' ? '[思考] ' : '[输出] ';
      segLogCurrentLine = Utils.el('div', { class: 'seg-log-line ' + role }, prefix);
      log.appendChild(segLogCurrentLine);
      segLogCurrentRole = role;
      while (log.childNodes.length > SEG_LOG_MAX_LINES) log.removeChild(log.firstChild);
    }
    segLogCurrentLine.textContent += delta;
    if (!log.classList.contains('hidden')) log.scrollTop = log.scrollHeight;
  }

  function appendSegLogLine(text, kind) {
    const log = Utils.$('#seg-status-log');
    if (!log) return;
    const line = Utils.el('div', { class: 'seg-log-line' + (kind ? ' ' + kind : '') }, text);
    log.appendChild(line);
    segLogCurrentLine = null;
    segLogCurrentRole = null;
    while (log.childNodes.length > SEG_LOG_MAX_LINES) log.removeChild(log.firstChild);
    if (!log.classList.contains('hidden')) log.scrollTop = log.scrollHeight;
  }

  async function deleteNovel(id) {
    if (!confirm('确定删除这本小说？此操作不可撤销。')) return;
    try {
      await API.deleteNovel(id);
      Utils.toast('已删除', 'success');
      currentNovel = null;
      Player.loadNovel(null);
      CharacterPanel.setNovel(null);
      Utils.$('#novel-content').innerHTML = `
        <div class="empty-state">
          <p>选择一本小说，或新建一本开始聆听</p>
        </div>`;
      await refreshList();
    } catch (err) {
      Utils.toast('删除失败: ' + err.message, 'error');
    }
  }

  function getCurrentNovel() {
    return currentNovel;
  }

  function refreshCurrent() {
    if (currentNovel) openNovel(currentNovel.id);
  }

  return { init, refreshList, openNovel, refreshCurrent, getCurrentNovel };
})();
