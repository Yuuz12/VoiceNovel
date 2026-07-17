// 设置面板：TTS / LLM / 旁白 / 分段 / 缓存
window.SettingsPanel = (function () {
  let voiceGroups = {};
  let dialogSymbols = [];

  async function init() {
    try {
      const data = await API.listVoices(true);
      voiceGroups = (data && data.groups) || {};
    } catch (err) {
      console.error('load voices failed', err);
    }
    bindEvents();
    await load();
    await refreshCache();
  }

  function bindEvents() {
    Utils.$('#btn-save-settings').addEventListener('click', save);
    Utils.$('#btn-test-tts').addEventListener('click', testTts);
    Utils.$('#btn-preview-narration').addEventListener('click', previewNarration);
    Utils.$('#btn-refresh-cache').addEventListener('click', refreshCache);
    Utils.$('#btn-clear-cache').addEventListener('click', clearCache);
    Utils.$('#btn-add-symbol').addEventListener('click', () => addSymbolRow('', ''));

    // 滑块值显示
    const speedSlider = Utils.$('#set-narration-speed');
    const speedVal = Utils.$('#narration-speed-val');
    speedSlider.addEventListener('input', () => speedVal.textContent = speedSlider.value);
    const volumeSlider = Utils.$('#set-narration-volume');
    const volumeVal = Utils.$('#narration-volume-val');
    volumeSlider.addEventListener('input', () => volumeVal.textContent = volumeSlider.value);
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
    Utils.$('#set-tts-apikey').value = (s.tts && s.tts.apiKey) || '';
    Utils.$('#set-tts-resource').value = (s.tts && s.tts.resourceId) || 'seed-tts-2.0';
    Utils.$('#set-tts-baseurl').value = (s.tts && s.tts.baseUrl) || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';
    Utils.$('#set-tts-format').value = (s.tts && s.tts.audioFormat) || 'mp3';
    Utils.$('#set-tts-samplerate').value = String((s.tts && s.tts.sampleRate) || 24000);

    Utils.$('#set-llm-baseurl').value = (s.llm && s.llm.baseUrl) || 'https://api.openai.com/v1';
    Utils.$('#set-llm-apikey').value = (s.llm && s.llm.apiKey) || '';
    Utils.$('#set-llm-model').value = (s.llm && s.llm.model) || 'gpt-4o-mini';

    // 旁白音色下拉
    const voiceSelect = Utils.$('#set-narration-voice');
    voiceSelect.innerHTML = '';
    for (const scenario of Object.keys(voiceGroups)) {
      const optgroup = Utils.el('optgroup', { label: scenario });
      for (const v of voiceGroups[scenario]) {
        const opt = Utils.el('option', { value: v.id }, `${v.name} · ${v.style}`);
        if ((s.narration && s.narration.voiceId) === v.id) opt.selected = true;
        optgroup.appendChild(opt);
      }
      voiceSelect.appendChild(optgroup);
    }

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
    Utils.$('#set-llm-chunk-size').value = String((s.parsing && s.parsing.llmChunkSize) || 2000);
    Utils.$('#set-auto-seg').checked = !!(s.parsing && s.parsing.autoSegmentOnUpload);
    Utils.$('#set-gap-ms').value = String((s.playback && s.playback.gapBetweenSegments) || 300);
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
          class: 'btn btn-link btn-remove',
          onclick: () => { dialogSymbols.splice(idx, 1); renderSymbolList(); },
        }, '✕ 删除'),
      ]);
      list.appendChild(row);
    });
    // 监听输入
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
    return {
      tts: {
        apiKey: Utils.$('#set-tts-apikey').value.trim(),
        resourceId: Utils.$('#set-tts-resource').value.trim() || 'seed-tts-2.0',
        baseUrl: Utils.$('#set-tts-baseurl').value.trim() || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional',
        audioFormat: Utils.$('#set-tts-format').value,
        sampleRate: parseInt(Utils.$('#set-tts-samplerate').value, 10),
      },
      llm: {
        baseUrl: Utils.$('#set-llm-baseurl').value.trim() || 'https://api.openai.com/v1',
        apiKey: Utils.$('#set-llm-apikey').value.trim(),
        model: Utils.$('#set-llm-model').value.trim() || 'gpt-4o-mini',
      },
      narration: {
        voiceId: Utils.$('#set-narration-voice').value,
        speed: parseInt(Utils.$('#set-narration-speed').value, 10),
        volume: parseInt(Utils.$('#set-narration-volume').value, 10),
      },
      parsing: {
        dialogSymbols: dialogSymbols.filter((p) => p[0] && p[1]),
        maxSegmentLength: parseInt(Utils.$('#set-max-seg-len').value, 10) || 200,
        llmChunkSize: parseInt(Utils.$('#set-llm-chunk-size').value, 10) || 2000,
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
      // 重新加载（应用 apiKey 掩码）
      const fresh = await API.getSettings();
      fillForm(fresh);
      // 更新播放器间隔
      if (window.Player) Player.setGap(s.playback.gapBetweenSegments);
      showHint('#settings-save-result', '已保存', 'ok');
      Utils.toast('设置已保存', 'success');
    } catch (err) {
      showHint('#settings-save-result', '保存失败: ' + err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 保存设置';
    }
  }

  async function testTts() {
    const btn = Utils.$('#btn-test-tts');
    btn.disabled = true;
    btn.textContent = '测试中...';
    showHint('#tts-test-result', '', '');
    // 先保存当前 TTS 配置（让后端用最新的 key 测试）
    try {
      const s = collectForm();
      await API.saveSettings(s);
      const fresh = await API.getSettings();
      fillForm(fresh);
      const result = await API.testTts();
      if (result.ok) {
        showHint('#tts-test-result', `✓ 连接成功（返回 ${Utils.formatBytes(result.size)} 音频）`, 'ok');
      } else {
        showHint('#tts-test-result', '✗ ' + (result.error || '未知错误'), 'err');
      }
    } catch (err) {
      showHint('#tts-test-result', '✗ ' + err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '测试连接';
    }
  }

  function previewNarration() {
    const voiceId = Utils.$('#set-narration-voice').value;
    if (!voiceId) {
      Utils.toast('请选择旁白音色', 'error');
      return;
    }
    const url = API.previewVoiceUrl(voiceId, '这是旁白音色的试听示例。沧海一声笑，滔滔两岸潮。',
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

  return { init, load };
})();
