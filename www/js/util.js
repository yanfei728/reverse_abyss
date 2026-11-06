/* -*- coding: utf-8 -*- */
/*
 * util.js —— 到处都在用的小工具
 * ===============================
 *  · 数学:clamp / 矩形相交
 *  · 随机:可复现的种子随机数(爬塔"重构"要用同一个种子变出同一座塔)
 *  · 画图:canvas 版的圆角矩形 / 圆 / 胶囊线 / 多边形 —— 对应 abyss 里
 *          build_assets.py 用 pygame.draw 画素材时用的那几个形状函数
 */
(function (RA) {
  'use strict';

  // ===================== 数学 =====================
  RA.clamp = function (v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  };

  RA.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  /** 平滑过渡(两端速度都是 0),过渡动画用它比线性好看 */
  RA.smoothstep = function (t) {
    t = RA.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };

  /** 两个矩形(AABB)有没有重叠 */
  RA.overlap = function (ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  };

  // ===================== 随机 =====================
  /** 字符串 → 32 位种子(FNV-1a),同一个字符串永远得到同一个数 */
  RA.hashSeed = function (str) {
    var h = 0x811c9dc5, i;
    str = String(str);
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  /** mulberry32:小而稳的可复现伪随机数发生器,返回 [0,1) */
  RA.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** 种子数字 → 给人看的短标签,比如 RA-3F7QK */
  RA.seedToLabel = function (n) {
    return 'RA-' + (n >>> 0).toString(36).toUpperCase().padStart(6, '0');
  };

  /** 标签 → 种子数字("RA-3F7QK" / "3f7qk" / 纯数字都能吃) */
  RA.labelToSeed = function (s) {
    var t = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (t.indexOf('RA') === 0) t = t.slice(2);
    if (!t) return null;
    var n = parseInt(t, 36);
    return isNaN(n) ? null : (n >>> 0);
  };

  RA.randomSeed = function () {
    return (Math.random() * 0xFFFFFFFF) >>> 0;
  };

  // ===================== 画图小工具 =====================
  /** 颜色:支持 [r,g,b] 或 [r,g,b,a(0~255)] */
  RA.rgba = function (c, alpha) {
    var a = (c.length > 3 ? c[3] / 255 : 1) * (alpha === undefined ? 1 : alpha);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };

  /** 两个颜色按 t 混合(0 = a,1 = b),数组可以是 3 或 4 位 */
  RA.mixColor = function (a, b, t) {
    t = RA.clamp(t, 0, 1);
    return [
      Math.round(RA.lerp(a[0], b[0], t)),
      Math.round(RA.lerp(a[1], b[1], t)),
      Math.round(RA.lerp(a[2], b[2], t))
    ];
  };

  /** 圆角矩形路径(不填充,调用方自己 fill/stroke) */
  RA.pathRoundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    return ctx;
  };

  // 下面这几个形状函数是 pygame.draw 的一比一替身,
  // assets.js 用它们把 abyss 的 build_assets.py 重画一遍。
  RA.circle = function (ctx, x, y, r, col) {
    ctx.beginPath();
    ctx.arc(x, y, Math.abs(r), 0, Math.PI * 2);
    ctx.fillStyle = RA.rgba(col);
    ctx.fill();
  };

  RA.rect = function (ctx, x, y, w, h, col, radius) {
    RA.pathRoundRect(ctx, x, y, w, h, radius || 0);
    ctx.fillStyle = RA.rgba(col);
    ctx.fill();
  };

  /** 只描边不填充(重画 pygame.draw.rect(..., width)) */
  RA.strokeRect = function (ctx, x, y, w, h, col, width, radius) {
    var wd = width || 1;
    RA.pathRoundRect(ctx, x + wd / 2, y + wd / 2, w - wd, h - wd, Math.max(0, (radius || 0) - wd / 2));
    ctx.lineWidth = wd;
    ctx.strokeStyle = RA.rgba(col);
    ctx.stroke();
  };

  /** 带描边的圆角矩形(重画 abyss 的 rrect) */
  RA.rrect = function (ctx, x, y, w, h, col, radius, outline, outW) {
    if (outline) {
      RA.pathRoundRect(ctx, x - outW, y - outW, w + outW * 2, h + outW * 2,
        (radius || 0) + outW);
      ctx.fillStyle = RA.rgba(outline);
      ctx.fill();
    }
    RA.rect(ctx, x, y, w, h, col, radius || 0);
  };

  RA.polygon = function (ctx, pts, col) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = RA.rgba(col);
    ctx.fill();
  };

  RA.ellipse = function (ctx, x, y, w, h, col) {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    ctx.fillStyle = RA.rgba(col);
    ctx.fill();
  };

  RA.line = function (ctx, x1, y1, x2, y2, w, col) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = Math.max(1, w);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = RA.rgba(col);
    ctx.stroke();
  };

  /** 两端圆头的"胶囊"线段(先深色描边再填主色,重画 abyss 的 capsule) */
  RA.capsule = function (ctx, p1, p2, width, col, outline, outW) {
    var x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    ctx.lineCap = 'round';
    if (outline) {
      var wo = width + outW * 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = wo;
      ctx.strokeStyle = RA.rgba(outline);
      ctx.stroke();
      RA.circle(ctx, x1, y1, Math.floor(wo / 2), outline);
      RA.circle(ctx, x2, y2, Math.floor(wo / 2), outline);
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = width;
    ctx.strokeStyle = RA.rgba(col);
    ctx.stroke();
    RA.circle(ctx, x1, y1, Math.floor(width / 2), col);
    RA.circle(ctx, x2, y2, Math.floor(width / 2), col);
  };

  /** 新建一张离屏画布(素材都是程序画在这些画布上的) */
  RA.makeCanvas = function (w, h) {
    var c = globalThis.document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  /** 把秒数格式化成 00:00 / 12:34 */
  RA.clock = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };
})(globalThis.RA = globalThis.RA || {});
