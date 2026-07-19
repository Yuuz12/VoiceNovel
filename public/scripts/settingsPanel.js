// 设置面板：TTS（多 provider 切换）/ LLM / 旁白 / 分段 / 缓存
// 支持火山方舟与小米 MIMO 两家 TTS 配置独立保存，切换不丢；MIMO 三模式：preset/voicedesign/voiceclone
window.SettingsPanel = (function () {
  const DEFAULT_NARRATION_PREVIEW_TEXT = '这是旁白音色的试听示例。沧海一声笑，滔滔两岸潮。';
  const NARRATION_PREVIEW_TEXT_KEY = 'narration-preview-text';

  let voiceGroups = {};          // 当前 provider 的音色分组
  let dialogSymbols = [];
  let lastSettings = {};         // 当前已加载设置（供 fillNarrationVoiceSelect 等读取）
  let cloneSamples = [];         // 已上传复刻样本列表
  let currentProvider = 'volcano';
  let currentMimoMode = 'preset';

  function loadNarrationPreviewText() {
    try {
      const v = localStorage.getItem(NARRATION_PREVIEW_TEXT_KEY);
      return v && v.trim() ? v : DEFAULT_NARRATION_PREVIEW_TEXT;
    } catch (_) {
      return DEFAULT_NARRATION_PREVIEW_TEXT;
    }
  }

  function saveNarrationPreviewText(text) {
    try { localStorage.setItem(NARRATION_PREVIEW_TEXT_KEY, text || ''); } catch (_) {}
  }

  async function init() {
    // 先读一次设置，确定当前 provider/mode，再据此加载音色目录与样本
    try {
      const s = await API.getSettings();
      lastSettings = s || {};
      currentProvider = (s.tts && s.tts.provider) || 'volcano';
      const mimo = (s.tts && s.tts.providers && s.tts.providers.mimo) || {};
      currentMimoMode = mimo.mode || 'preset';
    } catch (err) {
      console.error('load settings failed', err);
    }
    try {
      await loadVoices(currentProvider);
    } catch (err) {
      console.error('load voices failed', err);
    }
    try {
      await loadCloneSamples();
    } catch (err) {
      console.error('load clone samples failed', err);
    }
    bindEvents();
    await load();
    await refreshCache();
  }

  async function loadVoices(provider) {
    const data = await API.listVoices(true, provider || currentProvider);
    voiceGroups = (data && data.groups) || {};
  }

  async function loadCloneSamples() {
    const list = await API.listVoiceSamples();
    // 后端返回 { samples: [...] }，兼容裸数组
    cloneSamples = Array.isArray(list) ? list : (list && list.samples) || [];
  }

  function bindEvents() {
    Utils.$('#btn-save-settings').addEventListener('click', save);
    Utils.$('#btn-test-tts').addEventListener('click', testTts);
    Utils.$('#btn-preview-narration').addEventListener('click', previewNarration);
    Utils.$('#btn-refresh-cache').addEventListener('click', refreshCache);
    Utils.$('#btn-clear-cache').addEventListener('click', clearCache);
    Utils.$('#btn-add-symbol').addEventListener('click', () => addSymbolRow('', ''));

    // provider 切换
    Utils.$$('input[name="tts-provider"]').forEach((radio) => {
      radio.addEventListener('change', () => onProviderChange());
    });
    // MIMO 模式切换
    Utils.$('#set-tts-mimo-mode').addEventListener('change', () => onMimoModeChange());
    // 旁白克隆样本上传/删除
    Utils.$('#btn-narration-clone-upload').addEventListener('click', () => {
      Utils.$('#set-narration-clone-file').click();
    });
    Utils.$('#btn-narration-clone-delete').addEventListener('click', deleteNarrationSample);
    Utils.$('#set-narration-clone-file').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) uploadNarrationSample(file);
      e.target.value = ''; // 允许重复选同一文件
    });

    // 滑块值显示
    const speedSlider = Utils.$('#set-narration-speed');
    const speedVal = Utils.$('#narration-speed-val');
    speedSlider.addEventListener('input', () => speedVal.textContent = speedSlider.value);
    const volumeSlider = Utils.$('#set-narration-volume');
    const volumeVal = Utils.$('#narration-volume-val');
    volumeSlider.addEventListener('input', () => volumeVal.textContent = volumeSlider.value);

    // 试听文本自定义 + 重置
    const previewTextInput = Utils.$('#set-narration-preview-text');
    previewTextInput.value = loadNarrationPreviewText();
    previewTextInput.addEventListener('change', () => {
      const v = previewTextInput.value.trim();
      if (!v) {
        previewTextInput.value = DEFAULT_NARRATION_PREVIEW_TEXT;
        saveNarrationPreviewText(DEFAULT_NARRATION_PREVIEW_TEXT);
      } else {
        saveNarrationPreviewText(v);
      }
    });
    Utils.$('#btn-narration-preview-reset').addEventListener('click', () => {
      previewTextInput.value = DEFAULT_NARRATION_PREVIEW_TEXT;
      saveNarrationPreviewText(DEFAULT_NARRATION_PREVIEW_TEXT);
      Utils.toast('已重置为默认试听文本', 'info');
    });
  }

  async function load() {
    try {
      const s = await API.getSettings();
      fillForm(s);
    } catch (err) {
      Utils.toast('加载设置失败: ' + err.message, 'error');
    }
  }

  function fillForm(s) {
    lastSettings = s || {}; // 关键：先存，供 fillNarrationVoiceSelect/fillNarrationCloneSelect 读取
    const tts = s.tts || {};
    const providers = tts.providers || {};
    const volcano = providers.volcano || {};
    const mimo = providers.mimo || {};

    // 火山方舟面板
    Utils.$('#set-tts-volcano-apikey').value = volcano.apiKey || '';
    Utils.$('#set-tts-volcano-resource').value = volcano.resourceId || 'seed-tts-2.0';
    Utils.$('#set-tts-volcano-baseurl').value = volcano.baseUrl || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';
    Utils.$('#set-tts-volcano-format').value = volcano.audioFormat || 'mp3';
    Utils.$('#set-tts-volcano-samplerate').value = String(volcano.sampleRate || 24000);

    // MIMO 面板
    Utils.$('#set-tts-mimo-apikey').value = mimo.apiKey || '';
    Utils.$('#set-tts-mimo-baseurl').value = mimo.baseUrl || 'https://api.xiaomimimo.com/v1/chat/completions';
    Utils.$('#set-tts-mimo-mode').value = mimo.mode || 'preset';
    Utils.$('#set-tts-mimo-format').value = mimo.audioFormat || 'mp3';
    Utils.$('#set-tts-mimo-style').value = mimo.styleInstruction || '';

    // provider radio
    currentProvider = tts.provider || 'volcano';
    currentMimoMode = mimo.mode || 'preset';
    Utils.$$('input[name="tts-provider"]').forEach((r) => {
      r.checked = (r.value === currentProvider);
    });
    applyProviderPanelVisibility();
    renderNarrationVoiceArea();

    // LLM
    Utils.$('#set-llm-baseurl').value = (s.llm && s.llm.baseUrl) || 'https://api.openai.com/v1';
    Utils.$('#set-llm-apikey').value = (s.llm && s.llm.apiKey) || '';
    Utils.$('#set-llm-model').value = (s.llm && s.llm.model) || 'gpt-4o-mini';
    Utils.$('#set-llm-timeout').value = String((s.llm && s.llm.timeoutSeconds) || 300);

    // 旁白语速/音量
    const speedSlider = Utils.$('#set-narration-speed');
    speedSlider.value = String((s.narration && s.narration.speed) || 0);
    Utils.$('#narration-speed-val').textContent = speedSlider.value;
    const volumeSlider = Utils.$('#set-narration-volume');
    volumeSlider.value = String((s.narration && s.narration.volume) || 0);
    Utils.$('#narration-volume-val').textContent = volumeSlider.value;

    // 对话符号
    dialogSymbols = ((s.parsing && s.parsing.dialogSymbols) || []).map((p) => [p[0], p[1]]);
    renderSymbolList();

    Utils.$('#set-max-seg-len').value = String((s.parsing && s.parsing.maxSegmentLength) || 200);
    Utils.$('#set-llm-chunk-size').value = String((s.parsing && s.parsing.llmChunkSize) || 1000);
    Utils.$('#set-llm-concurrency').value = String((s.parsing && s.parsing.concurrency) || 3);
    Utils.$('#set-auto-seg').checked = !!(s.parsing && s.parsing.autoSegmentOnUpload);
    Utils.$('#set-gap-ms').value = String((s.playback && s.playback.gapBetweenSegments) || 300);
  }

  function applyProviderPanelVisibility() {
    Utils.$('#tts-panel-volcano').hidden = (currentProvider !== 'volcano');
    Utils.$('#tts-panel-mimo').hidden = (currentProvider !== 'mimo');
  }

  // 旁白音色区：按 provider + mimo mode 切换 preset/design/clone 三行
  function renderNarrationVoiceArea() {
    const isMimoDesign = (currentProvider === 'mimo' && currentMimoMode === 'voicedesign');
    const isMimoClone = (currentProvider === 'mimo' && currentMimoMode === 'voiceclone');
    Utils.$('#narration-row-preset').hidden = isMimoDesign || isMimoClone;
    Utils.$('#narration-row-design').hidden = !isMimoDesign;
    Utils.$('#narration-row-clone').hidden = !isMimoClone;

    if (!isMimoDesign && !isMimoClone) {
      fillNarrationVoiceSelect();
    } else if (isMimoDesign) {
      const narrMimo = (lastSettings.narration && lastSettings.narration.voiceConfig && lastSettings.narration.voiceConfig.mimo) || {};
      Utils.$('#set-narration-design').value = narrMimo.designDescription || '';
    } else if (isMimoClone) {
      fillNarrationCloneSelect();
    }
  }

  function fillNarrationVoiceSelect() {
    const voiceSelect = Utils.$('#set-narration-voice');
    voiceSelect.innerHTML = '';
    const currentVoiceId = (lastSettings.narration && lastSettings.narration.voiceId) || '';
    for (const scenario of Object.keys(voiceGroups)) {
      const optgroup = Utils.el('optgroup', { label: scenario });
      for (const v of voiceGroups[scenario]) {
        const opt = Utils.el('option', { value: v.id }, `${v.name} · ${v.style}`);
        if (currentVoiceId === v.id) opt.selected = true;
        optgroup.appendChild(opt);
      }
      voiceSelect.appendChild(optgroup);
    }
  }

  function fillNarrationCloneSelect() {
    const sel = Utils.$('#set-narration-clone-select');
    sel.innerHTML = '';
    const placeholder = Utils.el('option', { value: '' }, '— 选择已上传样本 —');
    sel.appendChild(placeholder);
    const narrMimo = (lastSettings.narration && lastSettings.narration.voiceConfig && lastSettings.narration.voiceConfig.mimo) || {};
    const currentPath = narrMimo.cloneSamplePath || '';
    let selectedName = '未选择';
    for (const s of cloneSamples) {
      const sizeStr = s.size != null ? ` (${Utils.formatBytes(s.size)})` : '';
      const opt = Utils.el('option', { value: s.path }, `${s.name}${sizeStr}`);
      if (currentPath && s.path === currentPath) {
        opt.selected = true;
        selectedName = s.name;
      }
      sel.appendChild(opt);
    }
    Utils.$('#narration-clone-name').textContent = selectedName;
  }

  async function onProviderChange() {
    const checked = Utils.$('input[name="tts-provider"]:checked');
    if (!checked) return;
    currentProvider = checked.value;
    applyProviderPanelVisibility();
    // MIMO 模式可能因切换面板读到默认值，同步一下
    if (currentProvider === 'mimo') {
      currentMimoMode = Utils.$('#set-tts-mimo-mode').value || 'preset';
    }
    try { await loadVoices(currentProvider); } catch (err) { console.error('reload voices failed', err); }
    renderNarrationVoiceArea();
    if (window.CharacterPanel && CharacterPanel.refreshVoices) {
      CharacterPanel.refreshVoices(currentProvider, currentMimoMode);
    }
  }

  function onMimoModeChange() {
    currentMimoMode = Utils.$('#set-tts-mimo-mode').value || 'preset';
    renderNarrationVoiceArea();
    if (window.CharacterPanel && CharacterPanel.refreshVoices) {
      CharacterPanel.refreshVoices(currentProvider, currentMimoMode);
    }
  }

  async function uploadNarrationSample(file) {
    try {
      const base64 = await fileToBase64(file);
      await API.uploadVoiceSample(file.name, base64);
      await loadCloneSamples();
      fillNarrationCloneSelect();
      Utils.toast(`样本 ${file.name} 上传成功`, 'success');
    } catch (err) {
      Utils.toast('样本上传失败: ' + err.message, 'error');
    }
  }

  async function deleteNarrationSample() {
    const sel = Utils.$('#set-narration-clone-select');
    const path = sel.value;
    if (!path) { Utils.toast('请先选择要删除的样本', 'error'); return; }
    const name = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : path;
    if (!confirm(`确定删除样本"${name}"？\n已绑定该样本的旁白/角色将自动清空绑定。`)) return;
    try {
      await API.deleteVoiceSample(path);
      await loadCloneSamples();
      // 若当前旁白绑定的是被删样本，清空选中并保存
      const narrMimo = (lastSettings.narration && lastSettings.narration.voiceConfig && lastSettings.narration.voiceConfig.mimo) || {};
      if (narrMimo.cloneSamplePath === path) {
        sel.value = '';
        try { await ensureSaved(); } catch (err) { console.error('clear narration binding failed', err); }
      }
      fillNarrationCloneSelect();
      // 通知角色面板清空失效的角色样本绑定
      if (window.CharacterPanel && CharacterPanel.clearSampleBindings) {
        await CharacterPanel.clearSampleBindings(path);
      }
      Utils.toast('样本已删除', 'success');
    } catch (err) {
      Utils.toast('删除失败: ' + err.message, 'error');
    }
  }

  // 供角色面板调用：样本已在角色面板删除，此处只负责刷新本面板样本列表并清空旁白失效绑定
  async function handleSampleDeleted(deletedPath) {
    if (!deletedPath) return;
    await loadCloneSamples();
    const sel = Utils.$('#set-narration-clone-select');
    const narrMimo = (lastSettings.narration && lastSettings.narration.voiceConfig && lastSettings.narration.voiceConfig.mimo) || {};
    if (narrMimo.cloneSamplePath === deletedPath) {
      sel.value = '';
      try { await ensureSaved(); } catch (err) { console.error('clear narration binding failed', err); }
    }
    fillNarrationCloneSelect();
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

  function renderSymbolList() {
    const list = Utils.$('#dialog-symbols-list');
    list.innerHTML = '';
    dialogSymbols.forEach((pair, idx) => {
      const row = Utils.el('div', { class: 'symbol-pair' }, [
        Utils.el('input', { type: 'text', value: pair[0], maxlength: '4', dataset: { idx: String(idx), pos: '0' } }),
        Utils.el('span', { class: 'arrow' }, '→'),
        Utils.el('input', { type: 'text', value: pair[1], maxlength: '4', dataset: { idx: String(idx), pos: '1' } }),
        Utils.el('button', {
          class: 'btn btn-danger btn-sm',
          onclick: () => { dialogSymbols.splice(idx, 1); renderSymbolList(); },
        }, '删除'),
      ]);
      list.appendChild(row);
    });
    Utils.$$('#dialog-symbols-list input').forEach((input) => {
      input.addEventListener('input', () => {
        const i = parseInt(input.dataset.idx, 10);
        const p = parseInt(input.dataset.pos, 10);
        if (dialogSymbols[i]) dialogSymbols[i][p] = input.value;
      });
    });
  }

  function addSymbolRow(open, close) {
    dialogSymbols.push([open || '', close || '']);
    renderSymbolList();
  }

  function collectForm() {
    const narrationMimo = {
      designDescription: Utils.$('#set-narration-design').value.trim(),
      cloneSamplePath: Utils.$('#set-narration-clone-select').value,
    };
    // 回填克隆样本显示名
    const sel = Utils.$('#set-narration-clone-select');
    if (sel.selectedIndex > 0) {
      const opt = sel.options[sel.selectedIndex];
      narrationMimo.cloneSampleName = opt ? opt.textContent : '';
    } else {
      narrationMimo.cloneSampleName = '';
    }
    return {
      tts: {
        provider: currentProvider,
        providers: {
          volcano: {
            apiKey: Utils.$('#set-tts-volcano-apikey').value.trim(),
            resourceId: Utils.$('#set-tts-volcano-resource').value.trim() || 'seed-tts-2.0',
            baseUrl: Utils.$('#set-tts-volcano-baseurl').value.trim() || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional',
            audioFormat: Utils.$('#set-tts-volcano-format').value,
            sampleRate: parseInt(Utils.$('#set-tts-volcano-samplerate').value, 10),
          },
          mimo: {
            apiKey: Utils.$('#set-tts-mimo-apikey').value.trim(),
            baseUrl: Utils.$('#set-tts-mimo-baseurl').value.trim() || 'https://api.xiaomimimo.com/v1/chat/completions',
            mode: Utils.$('#set-tts-mimo-mode').value,
            audioFormat: Utils.$('#set-tts-mimo-format').value,
            styleInstruction: Utils.$('#set-tts-mimo-style').value,
          },
        },
      },
      llm: {
        baseUrl: Utils.$('#set-llm-baseurl').value.trim() || 'https://api.openai.com/v1',
        apiKey: Utils.$('#set-llm-apikey').value.trim(),
        model: Utils.$('#set-llm-model').value.trim() || 'gpt-4o-mini',
        timeoutSeconds: (() => {
          const v = parseInt(Utils.$('#set-llm-timeout').value, 10);
          if (!Number.isFinite(v) || v < 10) return 10;
          if (v > 1800) return 1800;
          return v;
        })(),
      },
      narration: {
        voiceId: Utils.$('#set-narration-voice').value,
        speed: parseInt(Utils.$('#set-narration-speed').value, 10),
        volume: parseInt(Utils.$('#set-narration-volume').value, 10),
        voiceConfig: { mimo: narrationMimo },
      },
      parsing: {
        dialogSymbols: dialogSymbols.filter((p) => p[0] && p[1]),
        maxSegmentLength: parseInt(Utils.$('#set-max-seg-len').value, 10) || 200,
        llmChunkSize: parseInt(Utils.$('#set-llm-chunk-size').value, 10) || 1000,
        concurrency: (() => {
          const v = parseInt(Utils.$('#set-llm-concurrency').value, 10);
          if (!Number.isFinite(v) || v < 1) return 1;
          if (v > 10) return 10;
          return v;
        })(),
        autoSegmentOnUpload: Utils.$('#set-auto-seg').checked,
      },
      playback: {
        gapBetweenSegments: parseInt(Utils.$('#set-gap-ms').value, 10) || 300,
      },
    };
  }

  async function save() {
    const btn = Utils.$('#btn-save-settings');
    btn.disabled = true;
    btn.textContent = '保存中...';
    try {
      const s = collectForm();
      await API.saveSettings(s);
      const fresh = await API.getSettings();
      fillForm(fresh);
      if (window.Player) Player.setGap(s.playback.gapBetweenSegments);
      // provider/mode 可能因保存刷新，同步角色面板
      if (window.CharacterPanel && CharacterPanel.refreshVoices) {
        CharacterPanel.refreshVoices(currentProvider, currentMimoMode);
      }
      showHint('#settings-save-result', '已保存', 'ok');
      Utils.toast('设置已保存', 'success');
    } catch (err) {
      showHint('#settings-save-result', '保存失败: ' + err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存设置';
    }
  }

  async function testTts() {
    const btn = Utils.$('#btn-test-tts');
    btn.disabled = true;
    btn.textContent = '测试中...';
    showHint('#tts-test-result', '', '');
    try {
      const s = collectForm();
      await API.saveSettings(s);
      const fresh = await API.getSettings();
      fillForm(fresh);
      const result = await API.testTts();
      if (result.ok) {
        showHint('#tts-test-result', `连接成功（返回 ${Utils.formatBytes(result.size)} 音频）`, 'ok');
      } else {
        showHint('#tts-test-result', (result.error || '未知错误'), 'err');
      }
    } catch (err) {
      showHint('#tts-test-result', err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '测试连接';
    }
  }

  // 静默保存设置（不弹 toast、不切换按钮态），供试听前确保后端读到最新 provider/mode
  async function ensureSaved() {
    const s = collectForm();
    await API.saveSettings(s);
    const fresh = await API.getSettings();
    fillForm(fresh);
    if (window.Player) Player.setGap(s.playback.gapBetweenSegments);
    if (window.CharacterPanel && CharacterPanel.refreshVoices) {
      CharacterPanel.refreshVoices(currentProvider, currentMimoMode);
    }
  }

  async function previewNarration() {
    // 按 provider + mode 算 speaker
    let speaker = '';
    const isMimoDesign = (currentProvider === 'mimo' && currentMimoMode === 'voicedesign');
    const isMimoClone = (currentProvider === 'mimo' && currentMimoMode === 'voiceclone');
    if (isMimoDesign) {
      speaker = Utils.$('#set-narration-design').value.trim();
      if (!speaker) { Utils.toast('请填写音色设计描述', 'error'); return; }
    } else if (isMimoClone) {
      speaker = Utils.$('#set-narration-clone-select').value;
      if (!speaker) { Utils.toast('请选择复刻样本', 'error'); return; }
    } else {
      speaker = Utils.$('#set-narration-voice').value;
      if (!speaker) { Utils.toast('请选择旁白音色', 'error'); return; }
    }
    // 试听前先保存设置，确保后端读到最新 provider/mode（否则切换后不保存无法试听）
    try {
      await ensureSaved();
    } catch (err) {
      Utils.toast('保存设置失败，无法试听: ' + err.message, 'error');
      return;
    }
    const previewText = Utils.$('#set-narration-preview-text').value.trim() || DEFAULT_NARRATION_PREVIEW_TEXT;
    const url = API.previewVoiceUrl(speaker, previewText,
      parseInt(Utils.$('#set-narration-speed').value, 10),
      parseInt(Utils.$('#set-narration-volume').value, 10));
    const a = Utils.$('#preview-narration-audio');
    a.src = url;
    a.play().catch((err) => Utils.toast('试听失败: ' + err.message, 'error'));
  }

  async function refreshCache() {
    try {
      const data = await API.getCacheSize();
      Utils.$('#cache-size-text').textContent = `${Utils.formatBytes(data.bytes)} · ${data.count} 个文件`;
    } catch (err) {
      Utils.$('#cache-size-text').textContent = '查询失败';
    }
  }

  async function clearCache() {
    if (!confirm('确定清空所有音频缓存？下次播放将重新调用 TTS。')) return;
    try {
      const r = await API.clearCache();
      Utils.toast(`已清空 ${r.removed} 个缓存文件`, 'success');
      await refreshCache();
    } catch (err) {
      Utils.toast('清空失败: ' + err.message, 'error');
    }
  }

  function showHint(selector, msg, type) {
    const el = Utils.$(selector);
    if (!el) return;
    el.textContent = msg;
    el.className = 'result-hint' + (type ? ' ' + type : '');
  }

  return { init, load, ensureSaved, handleSampleDeleted, getProvider: () => currentProvider, getMimoMode: () => currentMimoMode };
})();
