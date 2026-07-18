// 角色面板：显示角色列表、配置音色（按 provider + mimo mode 动态渲染）、LLM 提取/匹配
window.CharacterPanel = (function () {
  let currentNovel = null;
  let voiceGroups = {};
  let cloneSamples = [];
  let currentProvider = 'volcano';
  let currentMimoMode = 'preset';

  async function init() {
    // 自取设置确定 provider/mode（app.js 用 Promise.all 并行 init，不能依赖 SettingsPanel 先完成）
    try {
      const s = await API.getSettings();
      currentProvider = (s.tts && s.tts.provider) || 'volcano';
      const mimo = (s.tts && s.tts.providers && s.tts.providers.mimo) || {};
      currentMimoMode = mimo.mode || 'preset';
    } catch (err) {
      console.error('load settings failed', err);
    }
    try { await loadVoices(); } catch (err) { console.error('load voices failed', err); }
    try { await loadCloneSamples(); } catch (err) { console.error('load clone samples failed', err); }
    bindActions();
  }

  async function loadVoices() {
    const data = await API.listVoices(true, currentProvider);
    voiceGroups = (data && data.groups) || {};
  }

  async function loadCloneSamples() {
    const list = await API.listVoiceSamples();
    // 后端返回 { samples: [...] }，兼容裸数组
    cloneSamples = Array.isArray(list) ? list : (list && list.samples) || [];
  }

  // 供 SettingsPanel 在 provider/mode 切换后调用，刷新音色目录与角色卡渲染
  async function refreshVoices(provider, mimoMode) {
    if (provider) currentProvider = provider;
    if (mimoMode) currentMimoMode = mimoMode;
    try { await loadVoices(); } catch (err) { console.error('reload voices failed', err); }
    if (currentMimoMode === 'voiceclone') {
      try { await loadCloneSamples(); } catch (err) { console.error('reload clone samples failed', err); }
    }
    render();
  }

  function bindActions() {
    // 顶部操作按钮在 setNovel 时插入
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
    const modeLabel = currentProvider === 'mimo' ? ` · MIMO/${currentMimoMode}` : '';
    head.innerHTML = `<h2>角色音色 (${chars.length}${modeLabel})</h2>`;

    const actions = Utils.el('div', { class: 'panel-actions' }, [
      Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => extractCharacters() }, 'LLM 提取角色'),
      Utils.el('button', { class: 'btn btn-primary btn-sm', onclick: () => autoMatch() }, '一键智能匹配音色'),
      Utils.el('button', { class: 'btn btn-secondary btn-sm', onclick: () => addCharacter() }, '添加角色'),
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
    if (!confirm(`确定删除角色"${c.name}"？\n绑定到该角色的段落将变为未绑定，可在段落列表手动重绑。`)) return;
    try {
      await API.deleteCharacter(currentNovel.id, c.id);
      currentNovel.characters = (currentNovel.characters || []).filter((x) => x.id !== c.id);
      for (const seg of currentNovel.segments || []) {
        if (seg.characterId === c.id) seg.characterId = null;
      }
      Player.loadNovel(currentNovel);
      render();
      NovelManager.refreshCurrent();
      Utils.toast('已删除角色', 'success');
    } catch (err) {
      Utils.toast('删除失败: ' + err.message, 'error');
    }
  }

  // 取角色的 mimo 子对象（容错）
  function getCharMimo(c) {
    return (c.voiceConfig && c.voiceConfig.mimo) || {};
  }

  function renderCard(c) {
    const card = Utils.el('div', { class: 'character-card', dataset: { cid: c.id } });

    // 角色名
    const nameEl = makeEditable(c.name, (v) => {
      c.name = v;
      updateCharacter(c.id, { name: v });
      NovelManager.refreshCurrent();
    });

    const head = Utils.el('div', { class: 'char-head' }, [
      nameEl,
      (() => {
        // 性别下拉：可切换，变化后立即保存并刷新音色候选
        const sel = Utils.el('select', { class: `char-gender ${c.gender || 'unknown'}`, title: '角色性别' });
        for (const [v, label] of [['unknown', '未知'], ['male', '男'], ['female', '女']]) {
          const o = Utils.el('option', { value: v }, label);
          if ((c.gender || 'unknown') === v) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
          const g = sel.value;
          sel.className = `char-gender ${g}`;
          c.gender = g;
          updateCharacter(c.id, { gender: g });
          render(); // 性别变化后音色候选需重新过滤（女角色不分配男声）
        });
        sel.addEventListener('click', (e) => e.stopPropagation());
        return sel;
      })(),
      Utils.el('button', {
        class: 'btn btn-danger btn-sm btn-del-char',
        title: '删除角色',
        onclick: (e) => { e.stopPropagation(); deleteCharacter(c); },
      }, '删除'),
    ]);

    const descEl = makeEditable(c.description, (v) => {
      c.description = v;
      updateCharacter(c.id, { description: v });
    }, { multiline: true, placeholder: '(无描述，点击编辑)' });
    const desc = Utils.el('div', { class: 'char-desc' }, [descEl]);
    const stats = Utils.el('div', { class: 'char-stats' }, `出现 ${c.appearances || 0} 次`);

    // 音色区：按 provider + mimo mode 分支
    const voiceArea = renderVoiceArea(c);
    const previewBtn = Utils.el('button', { class: 'btn btn-secondary btn-preview' }, '试听');
    previewBtn.addEventListener('click', () => previewVoice(c));

    // select 与试听按钮同行；design/clone 块较大，试听按钮单独成行
    let voiceBlock;
    if (voiceArea.tagName === 'SELECT') {
      voiceBlock = Utils.el('div', { class: 'char-voice-row' }, [voiceArea, previewBtn]);
    } else {
      voiceBlock = Utils.el('div', {}, [voiceArea, Utils.el('div', { class: 'char-voice-row' }, [previewBtn])]);
    }

    // 语速 / 音量
    const speedVal = Utils.el('span', { class: 'value-tag' },
      String((c.voiceConfig && c.voiceConfig.speed) || 0));
    const speedSlider = Utils.el('input', { type: 'range', min: '-50', max: '100', value: String((c.voiceConfig && c.voiceConfig.speed) || 0) });
    speedSlider.addEventListener('input', () => speedVal.textContent = speedSlider.value);
    speedSlider.addEventListener('change', Utils.debounce(() => {
      const speed = parseInt(speedSlider.value, 10);
      c.voiceConfig = c.voiceConfig || {};
      c.voiceConfig.speed = speed;
      updateCharacter(c.id, { voiceConfig: { speed } });
    }, 400));

    const volumeVal = Utils.el('span', { class: 'value-tag' },
      String((c.voiceConfig && c.voiceConfig.volume) || 0));
    const volumeSlider = Utils.el('input', { type: 'range', min: '-50', max: '100', value: String((c.voiceConfig && c.voiceConfig.volume) || 0) });
    volumeSlider.addEventListener('input', () => volumeVal.textContent = volumeSlider.value);
    volumeSlider.addEventListener('change', Utils.debounce(() => {
      const volume = parseInt(volumeSlider.value, 10);
      c.voiceConfig = c.voiceConfig || {};
      c.voiceConfig.volume = volume;
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
    card.appendChild(voiceBlock);
    card.appendChild(sliders);
    return card;
  }

  // 按 provider + mode 渲染角色音色配置区
  function renderVoiceArea(c) {
    const isMimoDesign = (currentProvider === 'mimo' && currentMimoMode === 'voicedesign');
    const isMimoClone = (currentProvider === 'mimo' && currentMimoMode === 'voiceclone');

    if (isMimoDesign) {
      // 文本描述定制音色：textarea
      const mimo = getCharMimo(c);
      const ta = Utils.el('textarea', {
        class: 'char-mimo-design-input',
        rows: '2',
        placeholder: '描述音色特征，例：低沉沙哑的老前辈，语气里带点由衷的敬佩',
      }, mimo.designDescription || '');
      ta.addEventListener('change', Utils.debounce(() => {
        const v = ta.value.trim();
        c.voiceConfig = c.voiceConfig || {};
        c.voiceConfig.mimo = c.voiceConfig.mimo || {};
        c.voiceConfig.mimo.designDescription = v;
        updateCharacter(c.id, { voiceConfig: { mimo: { designDescription: v } } });
      }, 400));
      const wrap = Utils.el('div', { class: 'char-mimo-design' }, [ta]);
      return wrap;
    }

    if (isMimoClone) {
      // 音频样本复刻：select + 上传按钮 + 样本名
      const mimo = getCharMimo(c);
      const sel = Utils.el('select', { class: 'char-clone-select' });
      sel.appendChild(Utils.el('option', { value: '' }, '— 选择样本 —'));
      for (const s of cloneSamples) {
        const sizeStr = s.size != null ? ` (${Utils.formatBytes(s.size)})` : '';
        const opt = Utils.el('option', { value: s.path }, `${s.name}${sizeStr}`);
        if (mimo.cloneSamplePath && s.path === mimo.cloneSamplePath) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        const path = sel.value;
        const opt = sel.options[sel.selectedIndex];
        const name = opt ? opt.textContent : '';
        c.voiceConfig = c.voiceConfig || {};
        c.voiceConfig.mimo = c.voiceConfig.mimo || {};
        c.voiceConfig.mimo.cloneSamplePath = path;
        c.voiceConfig.mimo.cloneSampleName = name;
        nameSpan.textContent = path ? name : '未选择';
        updateCharacter(c.id, { voiceConfig: { mimo: { cloneSamplePath: path, cloneSampleName: name } } });
      });

      const uploadBtn = Utils.el('button', { class: 'btn btn-secondary btn-sm' }, '上传');
      const fileInput = Utils.el('input', { type: 'file', accept: 'audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/aac', hidden: true });
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          try {
            const base64 = await fileToBase64(file);
            await API.uploadVoiceSample(file.name, base64);
            await loadCloneSamples();
            render(); // 重渲染所有卡，新样本出现在下拉
            Utils.toast(`样本 ${file.name} 上传成功`, 'success');
          } catch (err) {
            Utils.toast('样本上传失败: ' + err.message, 'error');
          }
        }
        e.target.value = '';
      });

      const nameSpan = Utils.el('span', { class: 'char-clone-name' },
        mimo.cloneSampleName || (mimo.cloneSamplePath ? '已绑定' : '未选择'));

      const wrap = Utils.el('div', { class: 'char-clone-row' }, [sel, uploadBtn, fileInput, nameSpan]);
      return wrap;
    }

    // preset / volcano：现有 <select>
    const voiceSelect = Utils.el('select', { class: 'char-voice-select' });
    voiceSelect.appendChild(Utils.el('option', { value: '' }, '— 未指定（用旁白音色）—'));
    for (const scenario of Object.keys(voiceGroups)) {
      const optgroup = Utils.el('optgroup', { label: scenario });
      for (const v of voiceGroups[scenario]) {
        if (c.gender && c.gender !== 'unknown' && v.gender !== c.gender) continue;
        const opt = Utils.el('option', { value: v.id }, `${v.name} · ${v.style}`);
        if (c.voiceId === v.id) opt.selected = true;
        optgroup.appendChild(opt);
      }
      if (optgroup.children.length) voiceSelect.appendChild(optgroup);
    }
    voiceSelect.addEventListener('change', () => {
      c.voiceId = voiceSelect.value;
      updateCharacter(c.id, { voiceId: voiceSelect.value });
    });
    return voiceSelect;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }

  async function updateCharacter(cid, partial) {
    if (!currentNovel) return;
    try {
      const updated = await API.updateCharacter(currentNovel.id, cid, partial);
      const idx = currentNovel.characters.findIndex((x) => x.id === cid);
      if (idx >= 0) currentNovel.characters[idx] = { ...currentNovel.characters[idx], ...updated };
      Player.loadNovel(currentNovel);
      Utils.toast('已保存', 'success');
    } catch (err) {
      Utils.toast('保存失败: ' + err.message, 'error');
    }
  }

  function previewVoice(c) {
    // 按 provider + mode 算 speaker
    let speaker = '';
    const isMimoDesign = (currentProvider === 'mimo' && currentMimoMode === 'voicedesign');
    const isMimoClone = (currentProvider === 'mimo' && currentMimoMode === 'voiceclone');
    if (isMimoDesign) {
      speaker = getCharMimo(c).designDescription || '';
      if (!speaker) { Utils.toast('请先填写音色设计描述', 'error'); return; }
    } else if (isMimoClone) {
      speaker = getCharMimo(c).cloneSamplePath || '';
      if (!speaker) { Utils.toast('请先选择复刻样本', 'error'); return; }
    } else {
      speaker = c.voiceId;
      if (!speaker) { Utils.toast('请先选择音色', 'error'); return; }
    }
    const text = c.description
      ? `你好，我是${c.name}。${c.description}`
      : `你好，我是${c.name}，这是我的音色试听。`;
    const url = API.previewVoiceUrl(speaker, text,
      (c.voiceConfig && c.voiceConfig.speed) || 0,
      (c.voiceConfig && c.voiceConfig.volume) || 0);
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
        currentNovel = data.novel;
        Player.loadNovel(currentNovel);
        render();
        NovelManager.refreshCurrent();
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

  return { init, setNovel, render, refreshVoices };
})();
