// 应用主入口：标签切换、初始化各模块
(function () {
  function switchView(name) {
    Utils.$$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    Utils.$$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  }

  function bindTabs() {
    Utils.$$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
  }

  function bindPlayerStatus() {
    const dot = Utils.$('#status-dot');
    const text = Utils.$('#status-text');
    Player.on('status', (s) => {
      dot.classList.toggle('ok', s.connected);
      dot.classList.toggle('err', !s.connected && s.error);
      text.textContent = s.connected ? '已连接' : (s.error || '未连接');
    });
    Player.on('error', (e) => {
      if (e.code === 'NO_API_KEY') {
        Utils.toast('请先在设置页配置 TTS API Key', 'error');
      }
    });
  }

  async function bootstrap() {
    bindTabs();
    bindPlayerStatus();
    Player.connect();
    await Promise.all([
      SettingsPanel.init(),
      CharacterPanel.init(),
      NovelManager.init(),
    ]);
    // 应用播放间隔设置
    try {
      const s = await API.getSettings();
      if (s.playback && s.playback.gapBetweenSegments != null) {
        Player.setGap(s.playback.gapBetweenSegments);
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
