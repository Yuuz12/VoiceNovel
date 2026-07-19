// 前端工具函数
window.Utils = (function () {
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return n.toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
  }

  function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function toast(message, type) {
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  /**
   * 自定义确认弹窗（替代浏览器 confirm），返回 Promise<boolean>
   * @param {object} opts { title, message, confirmText, cancelText, danger }
   *   - danger: true 时确认按钮用红色（用于删除等危险操作）
   * @returns {Promise<boolean>} 用户点确认返回 true，点取消/遮罩/Esc 返回 false
   */
  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (val) => {
        if (resolved) return;
        resolved = true;
        mask.remove();
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      };

      const confirmBtn = el('button', {
        class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
        onclick: () => finish(true),
      }, opts.confirmText || '确认');
      const cancelBtn = el('button', {
        class: 'btn btn-secondary',
        onclick: () => finish(false),
      }, opts.cancelText || '取消');

      const card = el('div', { class: 'modal-card', style: 'max-width: 420px;' }, [
        el('div', { class: 'modal-head' }, [
          el('h3', {}, opts.title || '确认操作'),
          el('button', { class: 'btn btn-icon', onclick: () => finish(false) }, '×'),
        ]),
        el('div', { class: 'modal-body' }, [
          el('div', { class: 'confirm-message' }, opts.message || ''),
        ]),
        el('div', { class: 'modal-foot' }, [cancelBtn, confirmBtn]),
      ]);

      const mask = el('div', { class: 'modal confirm-dialog' }, [card]);
      mask.addEventListener('click', (e) => {
        if (e.target === mask) finish(false);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(mask);
      // 确认按钮聚焦（方便回车确认）
      setTimeout(() => confirmBtn.focus(), 0);
    });
  }

  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'dataset') {
          for (const dk of Object.keys(attrs.dataset)) node.dataset[dk] = attrs.dataset[dk];
        } else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] != null) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      for (const c of children) {
        if (c == null) continue;
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      }
    }
    return node;
  }

  // 简易事件总线
  const events = new Map();
  function on(name, cb) {
    if (!events.has(name)) events.set(name, new Set());
    events.get(name).add(cb);
    return () => off(name, cb);
  }
  function off(name, cb) {
    if (events.has(name)) events.get(name).delete(cb);
  }
  function emit(name, payload) {
    if (events.has(name)) {
      for (const cb of events.get(name)) {
        try { cb(payload); } catch (e) { console.error(e); }
      }
    }
  }

  return {
    escapeHtml,
    formatBytes,
    formatTime,
    toast,
    confirmDialog,
    debounce,
    $,
    $$,
    el,
    on,
    off,
    emit,
  };
})();
