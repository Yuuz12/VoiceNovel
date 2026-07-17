// 角色面板：显示角色列表、配置音色、LLM 提取/匹配
window.CharacterPanel = (function () {
  let currentNovel = null;
  let voiceGroups = {};

  async function init() {
    try {
      const data = await API.listVoices(true);
      voiceGroups = (data && data.groups) || {};
    } catch (err) {
      console.error('load voices failed', err);
    }
    bindActions();
  }

  function bindActions() {
    // 顶部操作按钮（在 setNovel 时插入）
  }

  function setNovel(novel) {
    currentNovel = novel;
    render();
  }

  function render() {
    const root = Utils.$('#character-list');
    const head = Utils.$('#character-panel .panel-head');
    if (!currentNovel) {
      head.innerHTML = '<h2>角色音色</h2>';
      root.innerHTML = '<p class="empty-hint">打开小说后，角色列表在此显示</p>';
      return;
    }

    const chars = (currentNovel.characters || []).slice().sort((a, b) => b.appearances - a.appearances);
    head.innerHTML = `<h2>角色音色 (${chars.length})</h2>`;

    // 操作按钮
    const actions = Utils.el('div', { class: 'panel-actions' }, [
      Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => extractCharacters() }, '🔍 LLM 提取角色'),
      Utils.el('button', { class: 'btn btn-primary btn-sm', onclick: () => autoMatch() }, '🎭 一键智能匹配音色'),
      Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => addCharacter() }, '➕ 添加角色'),
    ]);

    root.innerHTML = '';
    root.appendChild(actions);

    if (!chars.length) {
      root.appendChild(Utils.el('p', { class: 'empty-hint' }, '暂无角色，可使用"LLM 提取角色"或"添加角色"'));
      return;
    }

    for (const c of chars) {
      root.appendChild(renderCard(c));
    }
  }

  /**
   * inline 编辑 helper：点击 span 变 input，失焦/回车提交，Esc 取消
   * onSave(v) 仅在值变化时调用
   */
  function makeEditable(text, onSave, opts) {
    opts = opts || {};
    const span = Utils.el('span', {
      class: 'editable' + (opts.multiline ? ' editable-multiline' : ''),
      title: '点击编辑',
    }, text || (opts.placeholder || ''));
    if (!text && opts.placeholder) span.classList.add('placeholder');
    span.addEventListener('click', () => {
      const input = Utils.el(opts.multiline ? 'textarea' : 'input', { type: 'text', value: text || '' });
      input.style.width = '100%';
      if (opts.multiline) { input.rows = 2; input.style.resize = 'vertical'; }
      span.replaceWith(input);
      input.focus();
      if (!opts.multiline) input.select();
      const commit = () => {
        const v = input.value.trim();
        input.replaceWith(span);
        if (v && v !== text) {
          span.textContent = v;
          span.classList.remove('placeholder');
          onSave(v);
        } else if (!v && opts.placeholder) {
          span.textContent = opts.placeholder;
          span.classList.add('placeholder');
        }
      };
      const cancel = () => { input.replaceWith(span); };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !opts.multiline) { e.preventDefault(); commit(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
    });
    return span;
  }

  async function addCharacter() {
    if (!currentNovel) return;
    try {
      const c = await API.addCharacter(currentNovel.id, { name: '新角色', description: '' });
      currentNovel.characters = currentNovel.characters || [];
      currentNovel.characters.push(c);
      Player.loadNovel(currentNovel);
      render();
      Utils.toast('已添加角色，点击角色名/描述可编辑', 'success');
    } catch (err) {
      Utils.toast('添加失败: ' + err.message, 'error');
    }
  }

  async function deleteCharacter(c) {
    if (!currentNovel) return;
    if (!confirm(`确定删除角色"${c.name}"？\n绑定到该角色的段落将变为未绑定（⚠ 标记），可在段落列表手动重绑。`)) return;
    try {
      await API.deleteCharacter(currentNovel.id, c.id);
      currentNovel.characters = (currentNovel.characters || []).filter((x) => x.id !== c.id);
      // 清空段落绑定（与后端同步）
      for (const seg of currentNovel.segments || []) {
        if (seg.characterId === c.id) seg.characterId = null;
      }
      Player.loadNovel(currentNovel);
      render();
      NovelManager.refreshCurrent(); // 刷新段落视图（被删角色的段落显示 ⚠）
      Utils.toast('已删除角色', 'success');
    } catch (err) {
      Utils.toast('删除失败: ' + err.message, 'error');
    }
  }

  function renderCard(c) {
    const card = Utils.el('div', { class: 'character-card', dataset: { cid: c.id } });

    // 角色名：inline 编辑
    const nameEl = makeEditable(c.name, (v) => {
      // 同步本地 + 保存到后端
      c.name = v;
      updateCharacter(c.id, { name: v });
      // 名字变了，段落列表的角色下拉也要刷新
      NovelManager.refreshCurrent();
    });

    const head = Utils.el('div', { class: 'char-head' }, [
      nameEl,
      Utils.el('span', { class: `char-gender ${c.gender || 'unknown'}` },
        c.gender === 'female' ? '女' : c.gender === 'male' ? '男' : '未知'),
      Utils.el('button', {
        class: 'btn btn-link btn-icon btn-del-char',
        title: '删除角色',
        onclick: (e) => { e.stopPropagation(); deleteCharacter(c); },
      }, '🗑'),
    ]);

    // 描述：inline 编辑（多行）
    const descEl = makeEditable(c.description, (v) => {
      c.description = v;
      updateCharacter(c.id, { description: v });
    }, { multiline: true, placeholder: '(无描述，点击编辑)' });

    const desc = Utils.el('div', { class: 'char-desc' }, [descEl]);

    const stats = Utils.el('div', { class: 'char-stats' }, `出现 ${c.appearances || 0} 次`);

    // 音色选择
    const voiceSelect = Utils.el('select', { class: 'char-voice-select' });
    const emptyOpt = Utils.el('option', { value: '' }, '— 未指定（用旁白音色）—');
    voiceSelect.appendChild(emptyOpt);
    for (const scenario of Object.keys(voiceGroups)) {
      const optgroup = Utils.el('optgroup', { label: scenario });
      for (const v of voiceGroups[scenario]) {
        if (c.gender && c.gender !== 'unknown' && v.gender !== c.gender) continue;
        const opt = Utils.el('option', { value: v.id },
          `${v.name} · ${v.style}`);
        if (c.voiceId === v.id) opt.selected = true;
        optgroup.appendChild(opt);
      }
      if (optgroup.children.length) voiceSelect.appendChild(optgroup);
    }
    voiceSelect.addEventListener('change', () => {
      c.voiceId = voiceSelect.value; // 同步本地引用，让 previewVoice 立即读到新值
      updateCharacter(c.id, { voiceId: voiceSelect.value });
    });

    const previewBtn = Utils.el('button', { class: 'btn btn-secondary btn-preview' }, '试听');
    previewBtn.addEventListener('click', () => previewVoice(c));

    const voiceRow = Utils.el('div', { class: 'char-voice-row' }, [voiceSelect, previewBtn]);

    // 语速 / 音量
    const speedVal = Utils.el('span', { class: 'value-tag' },
      String((c.voiceConfig && c.voiceConfig.speed) || 0));
    const speedSlider = Utils.el('input', { type: 'range', min: '-50', max: '100', value: String((c.voiceConfig && c.voiceConfig.speed) || 0) });
    speedSlider.addEventListener('input', () => speedVal.textContent = speedSlider.value);
    speedSlider.addEventListener('change', Utils.debounce(() => {
      const speed = parseInt(speedSlider.value, 10);
      c.voiceConfig = c.voiceConfig || {};
      c.voiceConfig.speed = speed; // 同步本地引用，让 previewVoice 立即读到新值
      updateCharacter(c.id, { voiceConfig: { speed } });
    }, 400));

    const volumeVal = Utils.el('span', { class: 'value-tag' },
      String((c.voiceConfig && c.voiceConfig.volume) || 0));
    const volumeSlider = Utils.el('input', { type: 'range', min: '-50', max: '100', value: String((c.voiceConfig && c.voiceConfig.volume) || 0) });
    volumeSlider.addEventListener('input', () => volumeVal.textContent = volumeSlider.value);
    volumeSlider.addEventListener('change', Utils.debounce(() => {
      const volume = parseInt(volumeSlider.value, 10);
      c.voiceConfig = c.voiceConfig || {};
      c.voiceConfig.volume = volume; // 同步本地引用，让 previewVoice 立即读到新值
      updateCharacter(c.id, { voiceConfig: { volume } });
    }, 400));

    const sliders = Utils.el('div', { class: 'char-sliders' }, [
      Utils.el('div', { class: 'char-slider' }, [
        Utils.el('label', {}, ['语速', speedVal]),
        speedSlider,
      ]),
      Utils.el('div', { class: 'char-slider' }, [
        Utils.el('label', {}, ['音量', volumeVal]),
        volumeSlider,
      ]),
    ]);

    card.appendChild(head);
    card.appendChild(desc);
    card.appendChild(stats);
    card.appendChild(voiceRow);
    card.appendChild(sliders);
    return card;
  }

  async function updateCharacter(cid, partial) {
    if (!currentNovel) return;
    try {
      const updated = await API.updateCharacter(currentNovel.id, cid, partial);
      // 就地更新 currentNovel 中的角色
      const idx = currentNovel.characters.findIndex((x) => x.id === cid);
      if (idx >= 0) currentNovel.characters[idx] = { ...currentNovel.characters[idx], ...updated };
      Player.loadNovel(currentNovel);
      Utils.toast('已保存', 'success');
    } catch (err) {
      Utils.toast('保存失败: ' + err.message, 'error');
    }
  }

  function previewVoice(c) {
    const voiceId = c.voiceId;
    if (!voiceId) {
      Utils.toast('请先选择音色', 'error');
      return;
    }
    const text = c.description
      ? `你好，我是${c.name}。${c.description}`
      : `你好，我是${c.name}，这是我的音色试听。`;
    const url = API.previewVoiceUrl(voiceId, text,
      (c.voiceConfig && c.voiceConfig.speed) || 0,
      (c.voiceConfig && c.voiceConfig.volume) || 0);
    // 用临时 audio 元素播放
    let a = document.getElementById('char-preview-audio');
    if (!a) {
      a = Utils.el('audio', { id: 'char-preview-audio', hidden: true });
      document.body.appendChild(a);
    }
    a.src = url;
    a.play().catch((err) => Utils.toast('试听失败: ' + err.message, 'error'));
  }

  function extractCharacters() {
    if (!currentNovel) return;
    ProgressModal.run({
      title: 'LLM 提取角色',
      streamFn: (onEvent, signal) => API.streamExtractCharacters(currentNovel.id, onEvent, signal),
      onComplete: (data) => {
        // 后端返回整个 novel（含新段落 characterId + 新角色列表）
        currentNovel = data.novel;
        Player.loadNovel(currentNovel);
        render();
        NovelManager.refreshCurrent(); // 刷新段落视图（段落 characterId 变了）
        const unbound = (currentNovel.segments || []).filter((s) => s.type === 'dialog' && !s.characterId).length;
        const tip = unbound > 0
          ? `提取完成，共 ${currentNovel.characters.length} 个角色；${unbound} 个对话段未匹配到角色，请在段落列表手动绑定`
          : `提取完成，共 ${currentNovel.characters.length} 个角色`;
        Utils.toast(tip, unbound > 0 ? 'info' : 'success');
      },
      onError: (err) => {
        Utils.toast('提取失败: ' + err.message, 'error');
      },
    });
  }

  function autoMatch() {
    if (!currentNovel) return;
    ProgressModal.run({
      title: 'LLM 智能匹配音色',
      streamFn: (onEvent, signal) => API.streamAutoMatchVoices(currentNovel.id, onEvent, signal),
      onComplete: (data) => {
        currentNovel = { ...currentNovel, characters: data.characters };
        Player.loadNovel(currentNovel);
        render();
        Utils.toast('音色匹配完成', 'success');
      },
      onError: (err) => {
        Utils.toast('匹配失败: ' + err.message, 'error');
      },
    });
  }

  return { init, setNovel, render };
})();
