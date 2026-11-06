/* -*- coding: utf-8 -*- */
/*
 * lifecycle.js —— 平台生命周期适配
 * ==================================
 * 只把平台事件转换成 background/foreground/back,不直接改 Session。
 * 后台顺序:清输入 → onBackground(页面暂停);前台:onForeground(仍暂停,不自动恢复)。
 * 订阅可 dispose;短塔页面只创建一次。
 */
(function (RA) {
  'use strict';

  function create(opts) {
    opts = opts || {};
    var disposed = false;
    var cleanups = [];

    function clearInput() {
      if (opts.input && typeof opts.input.clearAll === 'function') opts.input.clearAll();
    }
    function background() {
      if (disposed) return;
      clearInput();
      if (typeof opts.onBackground === 'function') opts.onBackground();
    }
    function foreground() {
      if (disposed) return;
      clearInput();
      if (typeof opts.onForeground === 'function') opts.onForeground();
    }
    function back() {
      if (disposed) return false;
      clearInput();
      if (typeof opts.onBack === 'function') return opts.onBack();
      return false;
    }

    if (opts.subscribe && typeof opts.subscribe.addListener === 'function') {
      var offState = opts.subscribe.addListener('appStateChange', function (state) {
        if (!state || state.isActive === false) background();
        else foreground();
      });
      var offBack = opts.subscribe.addListener('backButton', function () { back(); });
      if (offState) cleanups.push(offState);
      if (offBack) cleanups.push(offBack);
    } else if (opts.document && typeof opts.document.addEventListener === 'function') {
      var doc = opts.document;
      var onVis = function () {
        if (doc.hidden) background();
        else foreground();
      };
      doc.addEventListener('visibilitychange', onVis);
      cleanups.push(function () { doc.removeEventListener('visibilitychange', onVis); });
    }

    return {
      triggerBackground: background,
      triggerForeground: foreground,
      triggerBack: back,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
        cleanups = [];
      }
    };
  }

  RA.PlatformLifecycle = { create: create };
})(globalThis.RA = globalThis.RA || {});
