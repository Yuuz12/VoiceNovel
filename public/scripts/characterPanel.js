// 角色面板：显示角色列表、配置音色（按 provider + mimo mode 动态渲染）、LLM 提取/匹配
window.CharacterPanel = (function () {
  let currentNovel = null;
  let voiceGroups = {};
  let voiceCatalog = [];   // 扁平化的音色列表，用于 O(1) 查找音色名
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
    voiceCatalog = Object.values(voiceGroups).flat();
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
   * 行为：
   *   - 输入框初始值 = 之前的 text（包括空）
   *   - 失焦时若值与之前相同（包括都为空），不触发 onSave，只恢复显示
   *   - 失焦时若值变化（包括清空），触发 onSave 并更新显示
   *   - 空值显示 placeholder（仅视觉提示，数据仍是空字符串）
   */
  function makeEditable(text, onSave, opts) {
    opts = opts || {};
    const initialText = text || '';
    const span = Utils.el('span', {
      class: 'editable' + (opts.multiline ? ' editable-multiline' : ''),
      title: '点击编辑',
    }, initialText || (opts.placeholder || ''));
    if (!initialText && opts.placeholder) span.classList.add('placeholder');
    span.addEventListener('click', () => {
      // 输入框初始值 = 之前的 text（用户不修改就保持原值）
      const input = Utils.el(opts.multiline ? 'textarea' : 'input', { type: 'text', value: initialText });
      input.style.width = '100%';
      if (opts.multiline) { input.rows = 2; input.style.resize = 'vertical'; }
      span.replaceWith(input);
      input.focus();
      if (!opts.multiline) input.select();
      let committed = false;
      const commit = () => {
        if (committed) return; // 防止 blur + keydown 重复触发
        committed = true;
        const v = input.value.trim();
        input.replaceWith(span);
        // 值未变化（包括都为空）：不触发 onSave，恢复原显示
        if (v === initialText) {
          span.textContent = initialText || (opts.placeholder || '');
          if (!initialText && opts.placeholder) span.classList.add('placeholder');
          else span.classList.remove('placeholder');
          return;
        }
        // 值变化：更新显示 + 触发 onSave（包括清空）
        if (v) {
          span.textContent = v;
          span.classList.remove('placeholder');
        } else if (opts.placeholder) {
          span.textContent = opts.placeholder;
          span.classList.add('placeholder');
        } else {
          span.textContent = '';
        }
        onSave(v);
      };
      const cancel = () => {
        if (committed) return;
        committed = true;
        input.replaceWith(span);
      };
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
    if (!await Utils.confirmDialog({
      title: '删除角色',
      message: `确定删除角色"${c.name}"？\n绑定到该角色的段落将变为未绑定，可在段落列表手动重绑。`,
      confirmText: '删除',
      danger: true,
    })) return;
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

    // select/trigger（preset/volcano）与试听按钮同行；design/clone 块较大，试听按钮单独成行
    let voiceBlock;
    const isInline = voiceArea.tagName === 'SELECT' || voiceArea.tagName === 'BUTTON';
    if (isInline) {
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

      // 删除当前选中的样本（全局删除，会清空所有角色/旁白对该样本的绑定）
      const deleteBtn = Utils.el('button', { class: 'btn btn-danger btn-sm' }, '删除样本');
      deleteBtn.addEventListener('click', async () => {
        const path = sel.value;
        if (!path) { Utils.toast('请先选择要删除的样本', 'error'); return; }
        const opt = sel.options[sel.selectedIndex];
        const name = opt ? opt.textContent : path;
        if (!await Utils.confirmDialog({
          title: '删除样本',
          message: `确定删除样本"${name}"？\n已绑定该样本的角色/旁白将自动清空绑定。`,
          confirmText: '删除',
          danger: true,
        })) return;
        deleteCloneSample(path);
      });

      const nameSpan = Utils.el('span', { class: 'char-clone-name' },
        mimo.cloneSampleName || (mimo.cloneSamplePath ? '已绑定' : '未选择'));

      const wrap = Utils.el('div', { class: 'char-clone-row' }, [sel, uploadBtn, fileInput, deleteBtn, nameSpan]);
      return wrap;
    }

    // preset / volcano：懒加载触发按钮（点击才创建 select，避免 100 角色 × 100 音色 = 1 万 option）
    return renderVoiceTrigger(c);
  }

  /**
   * 渲染音色选择触发按钮（懒加载）。
   * 平时显示当前音色名（按钮），点击时才创建含所有音色的 select，选择后恢复为按钮。
   * 避免每个角色卡都生成 N 个 option。
   */
  function renderVoiceTrigger(c) {
    const current = c.voiceId ? (voiceCatalog.find((v) => v.id === c.voiceId)) : null;
    const label = current ? `${current.name}` : '— 未指定（用旁白音色）—';
    const trigger = Utils.el('button', {
      class: 'char-voice-trigger' + (c.voiceId ? '' : ' unbound'),
      title: '点击切换音色',
    }, label);
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // 懒创建 select
      const sel = Utils.el('select', { class: 'char-voice-select' });
      sel.appendChild(Utils.el('option', { value: '' }, '— 未指定（用旁白音色）—'));
      for (const scenario of Object.keys(voiceGroups)) {
        const optgroup = Utils.el('optgroup', { label: scenario });
        for (const v of voiceGroups[scenario]) {
          if (c.gender && c.gender !== 'unknown' && v.gender !== c.gender) continue;
          const opt = Utils.el('option', { value: v.id }, `${v.name} · ${v.style}`);
          if (c.voiceId === v.id) opt.selected = true;
          optgroup.appendChild(opt);
        }
        if (optgroup.children.length) sel.appendChild(optgroup);
      }
      trigger.replaceWith(sel);
      sel.focus();
      // 尝试自动展开下拉
      try { if (sel.showPicker) sel.showPicker(); } catch (_) {}
      let changed = false;
      sel.addEventListener('change', () => {
        changed = true;
        c.voiceId = sel.value;
        updateCharacter(c.id, { voiceId: sel.value });
        // 重建 trigger 显示新音色名
        sel.replaceWith(renderVoiceTrigger(c));
      });
      // 失焦时若未变更，恢复为 trigger
      sel.addEventListener('blur', () => {
        if (!changed) sel.replaceWith(renderVoiceTrigger(c));
      });
    });
    return trigger;
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

  async function updateCharacter(cid, partial, opts) {
    if (!currentNovel) return;
    try {
      const updated = await API.updateCharacter(currentNovel.id, cid, partial);
      const idx = currentNovel.characters.findIndex((x) => x.id === cid);
      if (idx >= 0) currentNovel.characters[idx] = { ...currentNovel.characters[idx], ...updated };
      Player.loadNovel(currentNovel);
      if (!opts || !opts.silent) Utils.toast('已保存', 'success');
    } catch (err) {
      Utils.toast('保存失败: ' + err.message, 'error');
    }
  }

  // 删除一个复刻样本文件，并清空所有角色对该样本的绑定；旁白绑定由 SettingsPanel 负责
  async function deleteCloneSample(path) {
    if (!path) return;
    try {
      await API.deleteVoiceSample(path);
      await loadCloneSamples();
      await clearSampleBindings(path);
      // 通知设置面板刷新样本列表，并清空旁白失效绑定
      if (window.SettingsPanel && SettingsPanel.handleSampleDeleted) {
        try { await SettingsPanel.handleSampleDeleted(path); } catch (err) { console.error('sync settings after delete failed', err); }
      }
      render();
      Utils.toast('样本已删除', 'success');
    } catch (err) {
      Utils.toast('删除失败: ' + err.message, 'error');
    }
  }

  // 清空所有角色对某样本的绑定（样本被删后失效路径需清理）
  // 并发清理：先收集所有需清理的角色，再用 Promise.all 并发调用 API
  // 避免角色多时串行 await 累加延迟（N 个角色 × 单次 API 延迟）
  async function clearSampleBindings(deletedPath) {
    if (!currentNovel || !deletedPath) return;
    const chars = currentNovel.characters || [];
    const toClear = chars.filter((c) => {
      const mimo = (c.voiceConfig && c.voiceConfig.mimo) || {};
      return mimo.cloneSamplePath === deletedPath;
    });
    if (toClear.length === 0) return;
    // 本地状态先清空，再并发调 API 持久化
    toClear.forEach((c) => {
      c.voiceConfig = c.voiceConfig || {};
      c.voiceConfig.mimo = c.voiceConfig.mimo || {};
      c.voiceConfig.mimo.cloneSamplePath = '';
      c.voiceConfig.mimo.cloneSampleName = '';
    });
    await Promise.all(toClear.map((c) =>
      updateCharacter(c.id, { voiceConfig: { mimo: { cloneSamplePath: '', cloneSampleName: '' } } }, { silent: true })
        .catch((err) => console.error('clear sample binding failed for', c.id, err))
    ));
    render();
    Utils.toast(`已清空 ${toClear.length} 个角色的失效样本绑定`, 'info');
  }

  async function previewVoice(c) {
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
    // 试听前先保存设置，确保后端读到最新 provider/mode（否则切换后不保存无法试听）
    if (window.SettingsPanel && SettingsPanel.ensureSaved) {
      try { await SettingsPanel.ensureSaved(); } catch (err) {
        Utils.toast('保存设置失败，无法试听: ' + err.message, 'error');
        return;
      }
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

  return { init, setNovel, render, refreshVoices, clearSampleBindings };
})();
