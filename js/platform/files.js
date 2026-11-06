/* -*- coding: utf-8 -*- */
/*
 * files.js —— 系统文件选择 / 导出边界
 * ===================================
 * 纯平台边界:不解析、不校验 LevelData。返回显式 Result:
 *   pickJSON -> {name,text} | CANCELLED / READ_FAILED
 *   exportJSON -> status: 'download-started' | 'written' | 'share-opened'
 * Web 下载只表示已发起,不表示磁盘写入完成。Android 写入 Documents 后才报 written;
 * 系统分享打开只额外标 shareOpened,不把“分享面板打开”说成已保存。
 */
(function (RA) {
  'use strict';

  function ok(value) { return { ok: true, value: value }; }
  function fail(code, message) { return { ok: false, error: { code: code, message: message } }; }
  function safeName(name) {
    var n = String(name || 'level.json').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    if (!/\.json$/i.test(n)) n += '.json';
    return n.slice(0, 120);
  }

  function bridgeOf(opts) {
    return opts && opts.bridge || globalThis.RA_CAP_BRIDGE || null;
  }

  function isNative(opts) {
    var b = bridgeOf(opts);
    try { return !!(b && b.Capacitor && b.Capacitor.isNativePlatform && b.Capacitor.isNativePlatform()); }
    catch (e) { return false; }
  }

  function pickJSON(opts) {
    opts = opts || {};
    var doc = opts.document || globalThis.document;
    if (!doc || !doc.createElement) return Promise.resolve(fail('UNSUPPORTED', '当前环境没有系统文件选择器'));
    return new Promise(function (resolve) {
      var input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      var settled = false;
      var timer = null;
      function done(res) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try { input.remove(); } catch (e) {}
        try { globalThis.removeEventListener('focus', onFocus); } catch (e) {}
        resolve(res);
      }
      function onFocus() {
        // 某些 WebView 不触发 cancel:返回焦点后延迟判定取消
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          if (!settled && (!input.files || !input.files.length)) done(fail('CANCELLED', '没有选择文件'));
        }, 500);
      }
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) { done(fail('CANCELLED', '没有选择文件')); return; }
        if (f.size > 8 * 1024 * 1024) { done(fail('TOO_LARGE', '文件超过 8 MiB')); return; }
        var reader = new FileReader();
        reader.onload = function () {
          done(ok({ name: f.name || 'level.json', text: String(reader.result || '') }));
        };
        reader.onerror = function () { done(fail('READ_FAILED', '读取文件失败')); };
        reader.readAsText(f, 'utf-8');
      });
      input.addEventListener('cancel', function () { done(fail('CANCELLED', '已取消选择')); });
      if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('focus', onFocus);
      doc.body.appendChild(input);
      input.click();
    });
  }

  async function exportJSON(meta, opts) {
    meta = meta || {};
    opts = opts || {};
    var text = String(meta.text || '');
    var name = safeName(meta.name);
    if (!text) return fail('EMPTY', '没有可导出的内容');
    var b = bridgeOf(opts);
    if (isNative(opts)) {
      try {
        var path = 'reverse_abyss/' + name;
        var wrote = await b.Filesystem.writeFile({
          path: path,
          data: text,
          directory: b.Directory.Documents,
          encoding: b.Encoding.UTF8,
          recursive: true
        });
        var value = { status: 'written', name: name, location: (wrote && wrote.uri) || path, shareOpened: false };
        try {
          await b.Share.share({
            title: 'reverse_abyss 关卡导出',
            text: name,
            url: (wrote && wrote.uri) || undefined,
            dialogTitle: '导出关卡 JSON'
          });
          value.shareOpened = true;
          value.status = 'share-opened';
        } catch (e) { /* 写入成功但分享取消/失败,仍算 written */ }
        return ok(value);
      } catch (e) {
        return fail('EXPORT_FAILED', '写入系统文档失败:' + (e && e.message || e));
      }
    }
    // Web:只发起下载,不声称写入磁盘
    try {
      var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = (opts.document || globalThis.document).createElement('a');
      a.href = url; a.download = name;
      a.style.display = 'none';
      (opts.document || globalThis.document).body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { a.remove(); } catch (e) {}
        try { URL.revokeObjectURL(url); } catch (e) {}
      }, 1000);
      return ok({ status: 'download-started', name: name, location: null });
    } catch (e) {
      return fail('EXPORT_FAILED', '发起下载失败:' + (e && e.message || e));
    }
  }

  RA.PlatformFiles = { pickJSON: pickJSON, exportJSON: exportJSON, isNative: isNative, safeName: safeName };
})(globalThis.RA = globalThis.RA || {});
