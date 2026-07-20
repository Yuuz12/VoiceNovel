// 小说管理器：列表、详情、段落显示、分段操作
window.NovelManager = (function () {
  let currentNovel = null;
  let voiceCatalog = [];
  let voiceGroups = {};

  // === 分页状态（翻页模式：每次只渲染一页 100 条，点击工具条按钮翻页）===
  const PAGE_SIZE = 100;
  const pagination = {
    page: 1,            // 当前页码（1-based）
    total: 0,           // 总段数
  };
  let sortedSegments = [];      // 排序缓存（避免每次 renderDetail 都 sort）
  let segIndexMap = new Map();  // segId -> 在 sortedSegments 中的索引（O(1) 查找）
  let lastCurrentSegId = null;  // 上次播放的段 id（用于增量更新 .current）
  let renderedSegIds = new Set(); // 当前 DOM 中已渲染的段 id（增量分段去重）

  // 播放器 SVG 图标（Material Design 风格，fill=currentColor 自动跟随按钮颜色）
  const ICONS = {
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4-0.91 7-4.49 7-8.77s-3-7.86-7-8.77z"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
  };

  // === 分页工具函数 ===
  function totalPages() {
    return Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));
  }
  function clampPage() {
    const tp = totalPages();
    if (pagination.page > tp) pagination.page = tp;
    if (pagination.page < 1) pagination.page = 1;
  }
  // 重建排序缓存与索引（openNovel/删除/换序/分段后调用）
  function rebuildSegIndex() {
    sortedSegments = (currentNovel.segments || []).slice().sort((a, b) => a.order - b.order);
    segIndexMap = new Map();
    sortedSegments.forEach((s, i) => segIndexMap.set(s.id, i));
    pagination.total = sortedSegments.length;
  }
  // 渲染当前页的段落（只渲染 100 条）
  function renderSegView() {
    const sv = Utils.$('#segment-view');
    if (!sv) return;
    sv.innerHTML = '';
    renderedSegIds.clear();
    if (sortedSegments.length === 0) return;
    const start = (pagination.page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, sortedSegments.length);
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const seg = sortedSegments[i];
      const block = renderSegBlock(seg, segIndexMap, currentNovel);
      frag.appendChild(block);
      renderedSegIds.add(seg.id);
    }
    sv.appendChild(frag);
    bindSegDragDrop(sv);
  }
  // 更新工具条上的"共 X 段，正在显示 A-B 段"标签 + 翻页按钮禁用态
  function updateSegCountLabel() {
    const label = Utils.$('.segment-toolbar .seg-count');
    const total = sortedSegments.length;
    const tp = totalPages();
    if (label) {
      if (total === 0) {
        label.textContent = '共 0 段';
      } else {
        const start = (pagination.page - 1) * PAGE_SIZE + 1;
        const end = Math.min(pagination.page * PAGE_SIZE, total);
        label.textContent = `共 ${total} 段，正在显示 ${start}-${end} 段`;
      }
    }
    // 翻页按钮禁用态
    const prevBtn = Utils.$('.segment-toolbar .seg-prev');
    const nextBtn = Utils.$('.segment-toolbar .seg-next');
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= tp;
  }
  // 切换到指定页
  function gotoPage(page, opts) {
    opts = opts || {};
    if (page < 1 || page > totalPages()) return;
    if (page === pagination.page && !opts.scrollToSegId) return;
    const isPrev = page < pagination.page;
    pagination.page = page;
    renderSegView();
    updateSegCountLabel();
    requestAnimationFrame(() => {
      const sv = Utils.$('#segment-view');
      if (!sv) return;
      if (opts.scrollToSegId) {
        const cur = Utils.$(`#segment-view .seg-block[data-seg-id="${opts.scrollToSegId}"]`);
        if (cur) cur.scrollIntoView({ behavior: 'auto', block: 'center' });
      } else if (isPrev) {
        sv.scrollTop = sv.scrollHeight;
      } else {
        sv.scrollTop = 0;
      }
    });
  }
  // 确保指定段在可见区域（播放器跳转时调用）
  function ensureSegmentVisible(segId) {
    if (!segId) return;
    const idx = segIndexMap.get(segId);
    if (idx == null) return;
    const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
    if (targetPage !== pagination.page) {
      gotoPage(targetPage, { scrollToSegId: segId });
    } else {
      const cur = Utils.$(`#segment-view .seg-block[data-seg-id="${segId}"]`);
      if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

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

  /**
   * inline 编辑小说标题：点击 h2 变 input，失焦/回车提交，Esc 取消
   */
  function editNovelTitle(novel, titleEl) {
    const input = Utils.el('input', {
      type: 'text',
      class: 'novel-title-input',
      value: novel.title,
    });
    input.style.width = '100%';
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const v = input.value.trim();
      if (v === novel.title || !v) {
        input.replaceWith(titleEl);
        return;
      }
      try {
        await API.updateNovel(novel.id, { title: v });
        novel.title = v;
        currentNovel = currentNovel || {};
        currentNovel.title = v;
        titleEl.textContent = v;
        input.replaceWith(titleEl);
        await refreshList();
        Utils.toast('已修改标题', 'success');
      } catch (err) {
        input.replaceWith(titleEl);
        Utils.toast('修改标题失败: ' + err.message, 'error');
      }
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      input.replaceWith(titleEl);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
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
        // 排到第一按钮（不触发 openNovel）：双箭头向上 SVG 图标
        (() => {
          const btn = Utils.el('button', {
            class: 'btn btn-icon novel-pin-btn',
            title: '排到第一',
            'aria-label': '排到第一',
            onclick: async (e) => {
              e.stopPropagation();
              try {
                await API.moveToTop(n.id);
                await refreshList();
                Utils.toast('已排到第一', 'success');
              } catch (err) {
                Utils.toast('操作失败: ' + err.message, 'error');
              }
            },
          });
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 11h3v10h2V11h3l-4-4-4 4zM4 3v2h16V3H4z"/></svg>';
          return btn;
        })(),
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
      // 重置分页状态：打开新小说时回到第 1 页
      rebuildSegIndex();
      pagination.page = 1;
      lastCurrentSegId = null;
      renderedSegIds.clear();
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

    // 头部（标题可点击编辑）
    const titleEl = Utils.el('h2', { class: 'novel-title-editable', title: '点击编辑标题' }, novel.title);
    titleEl.addEventListener('click', () => editNovelTitle(novel, titleEl));
    const head = Utils.el('div', { class: 'novel-detail-head' }, [
      titleEl,
      Utils.el('div', { class: 'novel-actions' }, [
        Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => resegment('rule') }, '规则分段'),
        Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => resegment('llm') }, 'LLM 智能分段'),
        Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => clearExpressionTags(novel) }, '清除表现力标签'),
        Utils.el('button', { class: 'btn btn-danger btn-sm', onclick: () => deleteNovel(novel.id) }, '删除'),
      ]),
    ]);

    // 分段工具条（.seg-count 文本由 updateSegCountLabel 填充）
    const toolbar = Utils.el('div', { class: 'segment-toolbar' }, [
      Utils.el('span', { class: 'seg-title' }, '段落列表（点击段落可跳转播放）'),
      Utils.el('button', {
        class: 'btn btn-secondary btn-sm seg-prev',
        title: '上一页',
        onclick: () => gotoPage(pagination.page - 1),
      }, '上一页'),
      Utils.el('button', {
        class: 'btn btn-secondary btn-sm seg-next',
        title: '下一页',
        onclick: () => gotoPage(pagination.page + 1),
      }, '下一页'),
      Utils.el('span', { class: 'seg-count' }, ''),
    ]);

    // 播放器条
    const playerBar = renderPlayerBar(novel);

    // 段落文本视图（空容器，由 renderSegView 填充当前页）
    const segView = Utils.el('div', { class: 'segment-view', id: 'segment-view' });

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

    // 渲染当前页段 block（分页加载，只渲染 100 条）
    renderSegView();
    // 更新"共 X 段，正在显示 A-B 段"标签 + 翻页按钮禁用态
    updateSegCountLabel();

    // 绑定播放器事件
    bindPlayerEvents();
  }

  /**
   * 把段落文本渲染为 HTML：方括号 [描述] 标签包裹 <span class="seg-expr-tag"> 显示为红色半透明
   * 先转义防止 XSS，再用正则把 [非] 替换为 span
   * @param {string} text
   * @returns {string} HTML 字符串
   */
  function renderSegTextHtml(text) {
    if (!text) return '';
    const escaped = Utils.escapeHtml(text);
    // 匹配 [...] 中的内容（不含换行，避免误匹配跨段）
    return escaped.replace(/\[([^\]\n]*)\]/g, '<span class="seg-expr-tag">[$1]</span>');
  }

  /**
   * 渲染单个段落 block（含拖拽手柄、类型切换、角色换绑、重新生成、删除、点击文本编辑）
   * @param {object} seg 段落对象
   * @param {Map<string, number>} segIdxMap segId -> 全局索引（O(1) 查找）
   * @param {object} novel 当前小说
   */
  function renderSegBlock(seg, segIdxMap, novel) {
    const unbound = seg.type === 'dialog' && !seg.characterId;
    const segIdx = segIdxMap.has(seg.id) ? segIdxMap.get(seg.id) : 0;

    // 拖拽手柄
    const dragHandle = Utils.el('span', { class: 'seg-drag-handle', title: '拖动调整顺序' }, '⠿');
    dragHandle.addEventListener('click', (e) => e.stopPropagation());

    // 类型切换：旁白/对话
    const typeSelect = Utils.el('select', { class: 'seg-type-select', title: '段落类型' });
    const optNarration = Utils.el('option', { value: 'narration' }, '旁白');
    const optDialog = Utils.el('option', { value: 'dialog' }, '对话');
    if (seg.type === 'dialog') optDialog.selected = true;
    else optNarration.selected = true;
    typeSelect.appendChild(optNarration);
    typeSelect.appendChild(optDialog);
    typeSelect.addEventListener('change', async () => {
      const newType = typeSelect.value;
      if (newType === seg.type) return;
      try {
        await API.updateSegment(currentNovel.id, seg.id, { type: newType });
        seg.type = newType;
        const idx = segIndexMap.get(seg.id);
        if (idx != null && currentNovel.segments[idx]) {
          currentNovel.segments[idx].type = newType;
          if (newType === 'narration') currentNovel.segments[idx].characterId = null;
        }
        // 局部重建该 block（只重渲染 1 个，避免全量 renderDetail）
        const oldBlock = Utils.$(`#segment-view .seg-block[data-seg-id="${seg.id}"]`);
        if (oldBlock) {
          const newBlock = renderSegBlock(seg, segIdxMap, currentNovel);
          oldBlock.replaceWith(newBlock);
        }
        Utils.toast('已修改段落类型', 'success');
      } catch (err) {
        Utils.toast('修改类型失败: ' + err.message, 'error');
        typeSelect.value = seg.type; // 回滚
      }
    });
    typeSelect.addEventListener('click', (e) => e.stopPropagation());

    // 重新生成按钮
    const regenBtn = Utils.el('button', {
      class: 'btn btn-icon seg-regen',
      title: '重新生成此段音频',
      onclick: async (e) => {
        e.stopPropagation();
        const ok = await Utils.confirmDialog({
          title: '重新生成音频',
          message: '重新生成此段音频？将删除缓存并重新合成。',
          confirmText: '重新生成',
        });
        if (!ok) return;
        Player.regenerate(seg.id);
        Utils.toast('正在重新生成音频...', 'info');
      },
    }, '↻');

    // 角色选择触发按钮（懒加载：点击才创建 select，避免每个对话段都生成 N 个 option）
    const charTrigger = seg.type === 'dialog' ? renderCharTrigger(seg, novel) : null;

    // 删除段落按钮
    const delBtn = Utils.el('button', {
      class: 'btn btn-danger btn-sm seg-del-btn',
      title: '删除此段',
      onclick: async (e) => {
        e.stopPropagation();
        const ok = await Utils.confirmDialog({
          title: '删除段落',
          message: '确定删除此段？删除后顺序自动重排，无法撤销。',
          confirmText: '删除',
          danger: true,
        });
        if (!ok) return;
        deleteSegment(seg);
      },
    }, '删除');

    // 段落文本（点击进入编辑模式）
    // 方括号 [心理活动/表情/动作] 标签渲染为红色半透明，增强表现力标签可视
    const textDiv = Utils.el('div', { class: 'seg-text' });
    textDiv.innerHTML = renderSegTextHtml(seg.text);
    textDiv.addEventListener('click', (e) => {
      if (e.target !== textDiv) return;
      e.stopPropagation();
      editSegmentText(seg, textDiv);
    });

    const block = Utils.el('div', {
      class: `seg-block ${seg.type}` + (seg.id === currentPlayingId() ? ' current' : '') + (unbound ? ' unbound' : ''),
      dataset: { segId: seg.id },
      onclick: () => Player.seekTo(segIdx),
    }, [
      Utils.el('div', { class: 'seg-tag' }, [
        dragHandle,
        typeSelect,
        unbound ? Utils.el('span', { class: 'seg-unbound-flag' }, '未绑定') : null,
        charTrigger,
        regenBtn,
        delBtn,
      ]),
      textDiv,
    ]);
    // 拖拽策略：只有按住手柄才允许拖整块，避免 select/button 误触发
    dragHandle.addEventListener('mousedown', () => { block.draggable = true; });
    dragHandle.addEventListener('mouseup', () => { block.draggable = false; });
    block.addEventListener('dragend', () => { block.draggable = false; });
    return block;
  }

  /**
   * 渲染角色选择触发按钮（懒加载）。
   * 平时显示当前角色名（按钮），点击时才创建含所有角色的 select，选择后恢复为按钮。
   * 避免每个对话段都生成 N 个 option（100 角色 × 1000 对话段 = 10 万 option）。
   */
  function renderCharTrigger(seg, novel) {
    const chars = novel.characters || [];
    const current = seg.characterId ? chars.find((c) => c.id === seg.characterId) : null;
    const label = current ? current.name : '— 未绑定 —';
    const trigger = Utils.el('button', {
      class: 'seg-char-trigger' + (seg.characterId ? '' : ' unbound'),
      title: '点击切换角色',
    }, label);
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // 懒创建 select
      const sel = Utils.el('select', { class: 'seg-char-select' });
      sel.appendChild(Utils.el('option', { value: '' }, '— 未绑定 —'));
      for (const c of chars) {
        const opt = Utils.el('option', { value: c.id }, c.name);
        if (seg.characterId === c.id) opt.selected = true;
        sel.appendChild(opt);
      }
      trigger.replaceWith(sel);
      sel.focus();
      // 尝试自动展开下拉（部分浏览器支持 showPicker）
      try { if (sel.showPicker) sel.showPicker(); } catch (_) {}
      let changed = false;
      sel.addEventListener('change', async () => {
        changed = true;
        const newVal = sel.value;
        const oldVal = seg.characterId;
        try {
          await API.updateSegment(novel.id, seg.id, { characterId: newVal });
          seg.characterId = newVal || null;
          const idx = segIndexMap.get(seg.id);
          if (idx != null && currentNovel.segments[idx]) {
            currentNovel.segments[idx].characterId = newVal || null;
          }
          updateSegBlockBindingDOM(seg.id);
          // 重建 trigger 显示新角色名
          sel.replaceWith(renderCharTrigger(seg, novel));
          Utils.toast('已换绑角色', 'success');
        } catch (err) {
          sel.value = oldVal || '';
          Utils.toast('换绑失败: ' + err.message, 'error');
        }
      });
      sel.addEventListener('click', (e) => e.stopPropagation());
      // 失焦时若未变更，恢复为 trigger
      sel.addEventListener('blur', () => {
        if (!changed) sel.replaceWith(renderCharTrigger(seg, novel));
      });
    });
    return trigger;
  }

  /**
   * 编辑段落文本（点击文本变 textarea，失焦/Ctrl+Enter 提交，Esc 取消）
   */
  function editSegmentText(seg, textDiv) {
    const ta = Utils.el('textarea', { class: 'seg-text-editor' });
    ta.value = seg.text;
    ta.rows = Math.max(2, Math.ceil(seg.text.length / 50));
    ta.style.width = '100%';
    ta.style.resize = 'vertical';
    textDiv.replaceWith(ta);
    ta.focus();
    ta.select();
    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const v = ta.value.trim();
      if (v === seg.text) {
        ta.replaceWith(textDiv);
        return;
      }
      if (!v) {
        ta.replaceWith(textDiv);
        Utils.toast('段落文本不能为空', 'error');
        return;
      }
      try {
        await API.updateSegment(currentNovel.id, seg.id, { text: v });
        seg.text = v;
        const idx = segIndexMap.get(seg.id);
        if (idx != null && currentNovel.segments[idx]) {
          currentNovel.segments[idx].text = v;
        }
        textDiv.innerHTML = renderSegTextHtml(v);
        ta.replaceWith(textDiv);
        Utils.toast('已修改段落文本', 'success');
      } catch (err) {
        ta.replaceWith(textDiv);
        Utils.toast('修改失败: ' + err.message, 'error');
      }
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      ta.replaceWith(textDiv);
    };
    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    ta.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * 删除段落（调 API + 本地重排 order + 局部更新 DOM）
   */
  async function deleteSegment(seg) {
    try {
      await API.deleteSegment(currentNovel.id, seg.id);
      currentNovel.segments = (currentNovel.segments || []).filter((s) => s.id !== seg.id);
      currentNovel.segments.forEach((s, i) => { s.order = i; });
      rebuildSegIndex();
      Player.loadNovel(currentNovel);

      // 保留滚动位置
      const savedScroll = saveScrollPos();
      // 若删除后当前页会空（删的是本页最后一条）且不是第 1 页，回退一页
      const start = (pagination.page - 1) * PAGE_SIZE;
      const willEmpty = start >= sortedSegments.length && pagination.page > 1;
      if (willEmpty) pagination.page--;
      // 重渲染当前页（成本 ≤ 100 block，比全量 renderDetail 快得多）
      renderSegView();
      restoreScrollPos(savedScroll);
      updateSegCountLabel();
      Utils.toast('已删除段落', 'success');
    } catch (err) {
      Utils.toast('删除失败: ' + err.message, 'error');
    }
  }

  /**
   * 绑定段落拖拽（HTML5 drag & drop）
   */
  function bindSegDragDrop(segView) {
    let dragSrcId = null;
    let dropPosition = null; // 'before' | 'after'，记录鼠标在 target block 的上/下半部分
    segView.addEventListener('dragstart', (e) => {
      const block = e.target.closest('.seg-block');
      if (!block) return;
      dragSrcId = block.dataset.segId;
      block.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragSrcId); } catch (_) {}
    });
    segView.addEventListener('dragend', (e) => {
      const block = e.target.closest('.seg-block');
      if (block) block.classList.remove('dragging');
      segView.querySelectorAll('.seg-block.drag-over, .seg-block.drag-over-after').forEach((b) => {
        b.classList.remove('drag-over', 'drag-over-after');
      });
      dragSrcId = null;
      dropPosition = null;
    });
    segView.addEventListener('dragover', (e) => {
      const block = e.target.closest('.seg-block');
      if (!block || !dragSrcId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // 根据鼠标 Y 坐标在 block 的上/下半部分判断插入位置
      const rect = block.getBoundingClientRect();
      const isAfter = (e.clientY - rect.top) > rect.height / 2;
      dropPosition = isAfter ? 'after' : 'before';
      // 清除其他 block 的高亮
      segView.querySelectorAll('.seg-block.drag-over, .seg-block.drag-over-after').forEach((b) => {
        if (b !== block) b.classList.remove('drag-over', 'drag-over-after');
      });
      if (block.dataset.segId !== dragSrcId) {
        block.classList.toggle('drag-over', !isAfter);       // before: 上边框高亮
        block.classList.toggle('drag-over-after', isAfter);  // after: 下边框高亮
      }
    });
    segView.addEventListener('dragleave', (e) => {
      const block = e.target.closest('.seg-block');
      if (block) block.classList.remove('drag-over', 'drag-over-after');
    });
    segView.addEventListener('drop', async (e) => {
      e.preventDefault();
      const block = e.target.closest('.seg-block');
      if (!block || !dragSrcId) return;
      // 关键：dragend 会在 drop 之后的同步阶段触发并把 dragSrcId 置 null，
      // 而 await 之后的代码还需要用它，所以先存到局部变量
      const srcId = dragSrcId;
      const targetId = block.dataset.segId;
      const position = dropPosition || 'before';
      segView.querySelectorAll('.seg-block.drag-over, .seg-block.drag-over-after').forEach((b) => {
        b.classList.remove('drag-over', 'drag-over-after');
      });
      if (targetId === srcId) return;
      // 计算实际传给后端的 targetId：
      //   before -> 直接用 targetId（插入到 target 之前）
      //   after  -> 用 target 的下一个 segment.id（插入到它之前 = 插入到 target 之后）；
      //             若 target 是最后一个，传 null（移到末尾）
      let apiTargetId = targetId;
      if (position === 'after') {
        const targetIdx = segIndexMap.get(targetId);
        if (targetIdx != null && targetIdx + 1 < sortedSegments.length) {
          apiTargetId = sortedSegments[targetIdx + 1].id;
        } else {
          apiTargetId = null; // target 是最后一个，移到末尾
        }
      }
      try {
        await API.moveSegment(currentNovel.id, srcId, apiTargetId);
        const segs = currentNovel.segments || [];
        const fromIdx = segs.findIndex((s) => s.id === srcId);
        if (fromIdx < 0) return;
        const [moved] = segs.splice(fromIdx, 1);
        let toIdx;
        if (apiTargetId === null || apiTargetId === undefined) {
          toIdx = segs.length;
        } else {
          toIdx = segs.findIndex((s) => s.id === apiTargetId);
          if (toIdx < 0) { segs.splice(fromIdx, 0, moved); return; }
        }
        segs.splice(toIdx, 0, moved);
        segs.forEach((s, i) => { s.order = i; });
        rebuildSegIndex();
        Player.loadNovel(currentNovel);

        // 重渲染当前页（src 和 target 在同页时成本 ≤ 100 block）
        renderSegView();
        updateSegCountLabel();
        Utils.toast('已调整段落顺序', 'success');
      } catch (err) {
        Utils.toast('调整顺序失败: ' + err.message, 'error');
      }
    });
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
    // 添加/移除 未绑定 标记（位于 seg-type-select 之后）
    let flag = block.querySelector('.seg-unbound-flag');
    if (unbound && !flag) {
      const segType = block.querySelector('.seg-type-select');
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

    const prevBtn = Utils.el('button', { class: 'player-btn', id: 'btn-prev', onclick: () => Player.prev(), title: '上一段' });
    prevBtn.innerHTML = ICONS.prev;
    const playBtn = Utils.el('button', { class: 'player-btn play-btn', id: 'btn-play', onclick: () => Player.togglePlay(), title: '播放/暂停' });
    playBtn.innerHTML = ICONS.play;
    const nextBtn = Utils.el('button', { class: 'player-btn', id: 'btn-next', onclick: () => Player.next(), title: '下一段' });
    nextBtn.innerHTML = ICONS.next;
    const stopBtn = Utils.el('button', { class: 'player-btn', id: 'btn-stop', onclick: () => Player.stop(), title: '停止' });
    stopBtn.innerHTML = ICONS.stop;

    const controls = Utils.el('div', { class: 'player-controls' }, [prevBtn, playBtn, nextBtn, stopBtn]);

    // 可拖动进度条：mousedown 开始拖动，mousemove 实时预览，mouseup 提交 seek
    const progressFill = Utils.el('div', { class: 'player-progress-fill', id: 'player-progress-fill' });
    const progressBar = Utils.el('div', { class: 'player-progress-bar', id: 'player-progress-bar' }, [progressFill]);
    let dragging = false;
    let dragRatio = 0;
    const ratioFromEvent = (e) => {
      const rect = progressBar.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      return Math.max(0, Math.min(1, x / rect.width));
    };
    progressBar.addEventListener('mousedown', (e) => {
      // 仅在有有效时长时允许拖动
      const st = Player.getState();
      if (!st.audioDuration || !isFinite(st.audioDuration)) return;
      dragging = true;
      dragRatio = ratioFromEvent(e);
      progressFill.style.width = (dragRatio * 100).toFixed(1) + '%';
      progressBar.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      dragRatio = ratioFromEvent(e);
      progressFill.style.width = (dragRatio * 100).toFixed(1) + '%';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      progressBar.classList.remove('dragging');
      Player.seekRatio(dragRatio);
    });
    // 触屏支持
    progressBar.addEventListener('touchstart', (e) => {
      const st = Player.getState();
      if (!st.audioDuration || !isFinite(st.audioDuration)) return;
      dragging = true;
      dragRatio = ratioFromEvent(e);
      progressFill.style.width = (dragRatio * 100).toFixed(1) + '%';
      progressBar.classList.add('dragging');
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      dragRatio = ratioFromEvent(e);
      progressFill.style.width = (dragRatio * 100).toFixed(1) + '%';
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      progressBar.classList.remove('dragging');
      Player.seekRatio(dragRatio);
    });

    const info = Utils.el('div', { class: 'player-info' }, [
      Utils.el('div', { class: 'player-segment-info', id: 'player-segment-info' }, [
        Utils.el('span', {}, '准备就绪'),
      ]),
      Utils.el('div', { class: 'player-progress' }, [
        Utils.el('span', { id: 'player-time-cur' }, '00:00'),
        progressBar,
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

    // 全局音量控制：滑块 + 静音按钮，值持久化到 localStorage（player.js 内部处理）
    const updateMuteIcon = (btn, vol) => {
      btn.innerHTML = vol === 0 ? ICONS.mute : ICONS.volume;
    };
    const volume = Utils.el('div', { class: 'player-volume' }, [
      Utils.el('span', {}, '音量'),
      (() => {
        const slider = Utils.el('input', {
          type: 'range', id: 'player-volume-slider',
          min: '0', max: '100', step: '1',
        });
        slider.value = String(Math.round(Player.getVolume() * 100));
        slider.addEventListener('input', () => {
          const vol = parseFloat(slider.value) / 100;
          Player.setVolume(vol);
          updateMuteIcon(muteBtn, vol);
        });
        return slider;
      })(),
    ]);
    let lastMuted = false;
    const muteBtn = Utils.el('button', {
      class: 'btn btn-icon player-mute-btn',
      id: 'player-mute-btn',
      title: '静音/恢复',
      onclick: () => {
        const cur = Player.getVolume();
        if (cur > 0) {
          lastMuted = cur;
          Player.setVolume(0);
          Utils.$('#player-volume-slider').value = '0';
          updateMuteIcon(muteBtn, 0);
        } else {
          const restore = lastMuted || 1;
          Player.setVolume(restore);
          Utils.$('#player-volume-slider').value = String(Math.round(restore * 100));
          updateMuteIcon(muteBtn, restore);
        }
      },
    });
    updateMuteIcon(muteBtn, Player.getVolume());

    bar.appendChild(controls);
    bar.appendChild(info);
    bar.appendChild(speed);
    bar.appendChild(volume);
    bar.appendChild(muteBtn);
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
      playBtn.innerHTML = '<span class="spinner"></span>';
      playBtn.disabled = true;
    } else if (state.isPlaying && !state.audioPaused) {
      playBtn.innerHTML = ICONS.pause;
      playBtn.disabled = false;
    } else {
      playBtn.innerHTML = ICONS.play;
      playBtn.disabled = false;
    }

    // 高亮当前段（增量更新：只动上一个和当前 block，避免 O(N) 遍历）
    const curId = state.currentSegment ? state.currentSegment.id : null;
    if (curId !== lastCurrentSegId) {
      if (lastCurrentSegId) {
        const old = Utils.$(`#segment-view .seg-block[data-seg-id="${lastCurrentSegId}"]`);
        if (old) old.classList.remove('current');
      }
      if (curId) {
        const cur = Utils.$(`#segment-view .seg-block[data-seg-id="${curId}"]`);
        if (cur) cur.classList.add('current');
        // 自动切页 + 滚动到当前段（若不在可见页则切换到对应页）
        ensureSegmentVisible(curId);
      }
      lastCurrentSegId = curId;
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

  async function openNewNovelModal() {
    // 从设置读取 autoSegmentOnUpload，同步 checkbox 状态
    // 修复 bug：原 HTML 写死 checked，导致用户在设置页取消勾选后仍默认打开
    try {
      const s = await API.getSettings();
      const auto = !!(s && s.parsing && s.parsing.autoSegmentOnUpload);
      Utils.$('#new-novel-autoseg').checked = auto;
    } catch (err) {
      // 读取失败时保留 HTML 默认 checked，不阻塞用户创建
      console.error('load settings for autoseg failed', err);
    }
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

    if (!await Utils.confirmDialog({
      title: `重新${btnLabel}`,
      message: `确定要重新${btnLabel}吗？这将覆盖当前段落与角色配置（已配置的音色会保留）。`,
      confirmText: '确定',
      danger: true,
    })) return;
    // 规则模式：保持原样（同步快速完成，无需进度框）
    Utils.toast(`正在执行${btnLabel}...`);
    try {
      const novel = await API.segmentNovelRule(currentNovel.id);
      currentNovel = novel;
      Player.loadNovel(novel);
      CharacterPanel.setNovel(novel);
      // 重置分页状态（规则分段后段落数完全变化）
      rebuildSegIndex();
      pagination.page = 1;
      lastCurrentSegId = null;
      renderedSegIds.clear();
      renderDetail(novel);
      Utils.toast(`${btnLabel}完成: ${(novel.segments || []).length} 段, ${(novel.characters || []).length} 角色`, 'success');
    } catch (err) {
      Utils.toast(`${btnLabel}失败: ` + err.message, 'error');
    }
  }

  // === LLM 增量分段（非阻塞状态条 + 可取消可继续 + 分块标签页实时输出）===
  let segController = null;
  const SEG_LOG_MAX_LINES = 300;
  // 分块标签页状态：chunkIndex(1-based) -> { tab, log, currentLine, currentRole, completed }
  let chunkTabs = {};
  let activeChunkIdx = 0; // 当前显示的分块（1-based，0=总览）
  let chunkTotal = 0;

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
      const choice = await Utils.confirmDialog({
        title: '角色列表为空',
        message: '当前没有角色，LLM 分段将无法绑定角色（所有对话段将标记为未绑定）。\n\n建议先点"LLM 提取角色"或"添加角色"建立角色列表。\n\n点"继续"仍要继续分段（全部不绑定）；点"取消"返回。',
        confirmText: '继续',
      });
      if (!choice) return;
    }
    // start 模式：若已有段落，确认覆盖
    if (mode === 'start' && (currentNovel.segments || []).length > 0) {
      if (!await Utils.confirmDialog({
        title: '重新 LLM 智能分段',
        message: '确定要重新 LLM 智能分段吗？这将清空当前段落并重新分段（角色列表与音色配置保留）。',
        confirmText: '确定',
        danger: true,
      })) return;
    }

    // 需求4：点击 LLM 智能分段始终清空段落列表并重新开始（start/fresh 都发 fresh）
    const body = mode === 'continue'
      ? { continue: true }
      : { fresh: true };
    if (!hasChars) body.forceEmpty = true; // 执意继续

    // 立即清空前端段落列表（不等后端），让用户感知到"已清空，等待新分段"
    if (mode !== 'continue') {
      currentNovel.segments = [];
      // 重置分页状态
      rebuildSegIndex();
      pagination.page = 1;
      lastCurrentSegId = null;
      renderedSegIds.clear();
      renderDetail(currentNovel);
    }

    segController = new AbortController();
    // 重置分块标签页状态
    chunkTabs = {};
    activeChunkIdx = 0;
    chunkTotal = 0;
    // 创建/重置状态条（含分块标签页），默认展开
    showSegStatusBar('分块分段中：准备中...', { cancellable: true, showLog: true });

    try {
      const data = await API.streamSegmentLLM(currentNovel.id, body, (evt) => {
        const p = evt.data || {};
        if (evt.event === 'progress') {
          if (p.type === 'chunk-persisted') {
            // 保存滚动位置
            const savedScroll = saveScrollPos();
            currentNovel = p.novel;
            rebuildSegIndex();
            clampPage();  // 总段数变化后夹紧页码
            // 仅当用户在最后一页时，增量追加新段（避免打断用户浏览其他页）
            const isLastPage = pagination.page === totalPages();
            if (isLastPage) {
              const sv = Utils.$('#segment-view');
              if (sv) {
                const start = (pagination.page - 1) * PAGE_SIZE;
                const end = Math.min(start + PAGE_SIZE, sortedSegments.length);
                const frag = document.createDocumentFragment();
                for (let i = start; i < end; i++) {
                  const s = sortedSegments[i];
                  if (!renderedSegIds.has(s.id)) {
                    frag.appendChild(renderSegBlock(s, segIndexMap, currentNovel));
                    renderedSegIds.add(s.id);
                  }
                }
                if (frag.children.length > 0) sv.appendChild(frag);
              }
            }
            updateSegCountLabel();
            restoreScrollPos(savedScroll);
            updateSegStatusBar(
              `分块分段中：第 ${p.chunkIndex}/${p.chunkTotal} 大段已持久化，已生成 ${p.segmentsSoFar} 段`,
              { cancellable: true }
            );
          } else if (p.type === 'start') {
            const startIdx = p.startChunkIndex || 0;
            chunkTotal = p.chunkTotal || 0;
            initChunkTabs(chunkTotal, startIdx);
            updateSegStatusBar(
              startIdx > 0 ? `从第 ${startIdx + 1} 块继续，共 ${chunkTotal} 块...` : `开始处理，共 ${chunkTotal} 块...`,
              { cancellable: true }
            );
            appendOverviewLog(startIdx > 0
              ? `── 从第 ${startIdx + 1} 块继续，共 ${chunkTotal} 块 ──`
              : `── 开始处理，共 ${chunkTotal} 块 ──`, 'chunk');
          } else if (p.type === 'token') {
            // 实时追加 LLM token 到对应分块的日志区
            appendChunkToken(p.chunkIndex, p.role, p.delta || '');
          } else if (p.type === 'chunk') {
            // 单块 LLM 返回完成：重置该块 token 行
            resetChunkTokenLine(p.chunkIndex);
          } else if (p.type === 'chunk-done') {
            // 某分块完成：标记为绿色
            markChunkDone(p.chunkIndex);
          } else if (p.type === 'warn') {
            appendOverviewLog('警告: ' + (p.message || '警告'), 'warn');
            if (p.chunkIndex) appendChunkLog(p.chunkIndex, '警告: ' + (p.message || '警告'), 'warn');
          }
        } else if (evt.event === 'error') {
          if (p.code === 'NO_CHARACTERS') {
            Utils.toast(p.message, 'error');
          } else {
            Utils.toast('分段错误: ' + (p.message || '未知错误'), 'error');
          }
          appendOverviewLog('错误: ' + (p.message || '未知错误'), 'error');
        }
      }, segController.signal);
      // done
      if (data && data.novel) {
        currentNovel = data.novel;
        Player.loadNovel(currentNovel);
        CharacterPanel.setNovel(currentNovel);
        // 全新分段结果：回到第 1 页
        rebuildSegIndex();
        pagination.page = 1;
        lastCurrentSegId = null;
        renderedSegIds.clear();
        renderDetail(currentNovel);
      }
      appendOverviewLog('分段完成', 'ok');
      updateSegStatusBar('分段完成', { done: true });
      const unbound = (currentNovel.segments || []).filter((s) => s.type === 'dialog' && !s.characterId).length;
      const tip = unbound > 0
        ? `LLM 分段完成: ${(currentNovel.segments || []).length} 段，${unbound} 个对话段未绑定角色（标记为未绑定）`
        : `LLM 智能分段完成: ${(currentNovel.segments || []).length} 段`;
      Utils.toast(tip, unbound > 0 ? 'info' : 'success');
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.code === 'ABORTED')) {
        appendOverviewLog('已取消', 'cancel');
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
        appendOverviewLog('失败: ' + (err && err.message), 'error');
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
   *     #seg-chunk-wrap   （分块标签页容器：标签栏 + 日志区，持久不重建）
   *       #seg-chunk-tabs （标签栏：总览 + 每块一个标签）
   *       #seg-chunk-logs （日志区：每个块一个 div，切换显示）
   * opts: { cancellable, showContinue, done, showLog }
   */
  function showSegStatusBar(text, opts) {
    opts = opts || {};
    let bar = Utils.$('#seg-status-bar');
    if (!bar) {
      bar = Utils.el('div', { id: 'seg-status-bar', class: 'seg-status-bar' });
      const line = Utils.el('div', { id: 'seg-status-line', class: 'seg-status-line' });
      const wrap = Utils.el('div', { id: 'seg-chunk-wrap', class: 'seg-chunk-wrap hidden' });
      const tabs = Utils.el('div', { id: 'seg-chunk-tabs', class: 'seg-chunk-tabs' });
      const logs = Utils.el('div', { id: 'seg-chunk-logs', class: 'seg-chunk-logs' });
      wrap.appendChild(tabs);
      wrap.appendChild(logs);
      bar.appendChild(line);
      bar.appendChild(wrap);
      const toolbar = Utils.$('.segment-toolbar');
      if (toolbar) toolbar.after(bar);
      else Utils.$('#novel-content').appendChild(bar);
    }
    // 只重建状态行（保留标签页内容）
    const line = Utils.$('#seg-status-line');
    line.innerHTML = '';
    line.appendChild(Utils.el('span', { class: 'seg-status-text' }, text));

    // 实时输出切换按钮
    const wrap = Utils.$('#seg-chunk-wrap');
    const isHidden = wrap && wrap.classList.contains('hidden');
    const toggleBtn = Utils.el('button', { class: 'btn btn-link btn-sm seg-log-toggle' },
      isHidden ? '实时输出' : '隐藏输出');
    toggleBtn.addEventListener('click', () => {
      const w = Utils.$('#seg-chunk-wrap');
      if (!w) return;
      w.classList.toggle('hidden');
      toggleBtn.textContent = w.classList.contains('hidden') ? '实时输出' : '隐藏输出';
      if (!w.classList.contains('hidden')) {
        const activeLog = Utils.$('#seg-chunk-logs .seg-log.active');
        if (activeLog) activeLog.scrollTop = activeLog.scrollHeight;
      }
    });
    line.appendChild(toggleBtn);

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
      freshBtn.addEventListener('click', async () => {
        if (!await Utils.confirmDialog({
          title: '重新开始分段',
          message: '重新开始将清空已分段的段落，确定吗？',
          confirmText: '重新开始',
          danger: true,
        })) return;
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
    // showLog 时默认展开
    if (opts.showLog && wrap) wrap.classList.remove('hidden');
    bar.classList.remove('hidden');
  }

  function updateSegStatusBar(text, opts) {
    showSegStatusBar(text, opts);
  }

  function hideSegStatusBar() {
    const bar = Utils.$('#seg-status-bar');
    if (bar) bar.remove();
    chunkTabs = {};
    activeChunkIdx = 0;
    chunkTotal = 0;
  }

  // === 分块标签页操作 ===

  // 初始化分块标签页：创建"总览" + 每个 chunk 一个标签
  function initChunkTabs(total, startIdx) {
    const tabsEl = Utils.$('#seg-chunk-tabs');
    const logsEl = Utils.$('#seg-chunk-logs');
    if (!tabsEl || !logsEl) return;
    tabsEl.innerHTML = '';
    logsEl.innerHTML = '';
    chunkTabs = {};

    // 总览标签
    const overviewTab = Utils.el('button', { class: 'seg-chunk-tab active', dataset: { idx: '0' } }, '总览');
    overviewTab.addEventListener('click', () => switchChunkTab(0));
    tabsEl.appendChild(overviewTab);
    const overviewLog = Utils.el('div', { class: 'seg-log active', dataset: { idx: '0' } });
    logsEl.appendChild(overviewLog);
    chunkTabs[0] = { tab: overviewTab, log: overviewLog, completed: false };

    // 每个 chunk 一个标签
    for (let i = 1; i <= total; i++) {
      const tab = Utils.el('button', { class: 'seg-chunk-tab', dataset: { idx: String(i) } }, `块 ${i}`);
      if (i <= startIdx) tab.classList.add('done'); // 已完成的块（继续模式）
      tab.addEventListener('click', () => switchChunkTab(i));
      tabsEl.appendChild(tab);
      const log = Utils.el('div', { class: 'seg-log', dataset: { idx: String(i) } });
      if (i <= startIdx) {
        log.appendChild(Utils.el('div', { class: 'seg-log-line ok' }, '该块已完成（继续模式）'));
      }
      logsEl.appendChild(log);
      chunkTabs[i] = { tab, log, currentLine: null, currentRole: null, completed: i <= startIdx };
    }
    activeChunkIdx = 0;
  }

  // 切换到指定分块标签
  function switchChunkTab(idx) {
    activeChunkIdx = idx;
    const tabsEl = Utils.$('#seg-chunk-tabs');
    const logsEl = Utils.$('#seg-chunk-logs');
    if (!tabsEl || !logsEl) return;
    for (const t of tabsEl.children) {
      t.classList.toggle('active', parseInt(t.dataset.idx, 10) === idx);
    }
    for (const l of logsEl.children) {
      l.classList.toggle('active', parseInt(l.dataset.idx, 10) === idx);
    }
    const activeLog = logsEl.querySelector('.seg-log.active');
    if (activeLog) activeLog.scrollTop = activeLog.scrollHeight;
  }

  // 向指定分块追加 token（自动切换到该块第一次输出）
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
      while (log.childNodes.length > SEG_LOG_MAX_LINES) log.removeChild(log.firstChild);
    }
    entry.currentLine.textContent += delta;
    if (activeChunkIdx === chunkIdx && !log.classList.contains('hidden')) {
      log.scrollTop = log.scrollHeight;
    }
  }

  // 重置某块的当前 token 行（chunk LLM 返回完成时调用）
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
    entry.completed = true;
    entry.tab.classList.add('done');
    appendChunkLog(chunkIdx, '── 该块 LLM 处理完成 ──', 'ok');
  }

  // 向指定分块日志追加一行
  function appendChunkLog(chunkIdx, text, kind) {
    const entry = chunkTabs[chunkIdx];
    if (!entry || !entry.log) return;
    const line = Utils.el('div', { class: 'seg-log-line' + (kind ? ' ' + kind : '') }, text);
    entry.log.appendChild(line);
    entry.currentLine = null;
    entry.currentRole = null;
    while (entry.log.childNodes.length > SEG_LOG_MAX_LINES) entry.log.removeChild(entry.log.firstChild);
    if (activeChunkIdx === chunkIdx) entry.log.scrollTop = entry.log.scrollHeight;
  }

  // 向总览日志追加一行
  function appendOverviewLog(text, kind) {
    const entry = chunkTabs[0];
    if (!entry || !entry.log) return;
    const line = Utils.el('div', { class: 'seg-log-line' + (kind ? ' ' + kind : '') }, text);
    entry.log.appendChild(line);
    while (entry.log.childNodes.length > SEG_LOG_MAX_LINES) entry.log.removeChild(entry.log.firstChild);
    if (activeChunkIdx === 0) entry.log.scrollTop = entry.log.scrollHeight;
  }

  async function deleteNovel(id) {
    if (!await Utils.confirmDialog({
      title: '删除小说',
      message: '确定删除这本小说？此操作不可撤销。',
      confirmText: '删除',
      danger: true,
    })) return;
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

  /**
   * 清除所有段落文本中的表现力标签 [描述]
   * 调后端批量接口，再更新本地数据 + 重渲染当前页
   */
  async function clearExpressionTags(novel) {
    if (!novel) return;
    if (!await Utils.confirmDialog({
      title: '清除表现力标签',
      message: '将移除所有段落文本中的方括号 [描述] 标签，原文保留。确定继续？',
      confirmText: '清除',
      danger: true,
    })) return;
    try {
      const r = await API.clearExpressionTags(novel.id);
      // 用后端返回的最新 novel 替换本地
      currentNovel = r.novel;
      Player.loadNovel(currentNovel);
      CharacterPanel.setNovel(currentNovel);
      rebuildSegIndex();
      renderSegView();
      updateSegCountLabel();
      Utils.toast(`已清除 ${r.cleared} 段的表现力标签`, 'success');
    } catch (err) {
      Utils.toast('清除失败: ' + err.message, 'error');
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
