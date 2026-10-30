/* -*- coding: utf-8 -*- */
/*
 * text.js —— 中文字渲染(所有界面文字都从这里走)
 * ===============================================
 * 游戏里没有一张 UI 图,标题、HUD、面板、按钮全是代码画的字和方块,
 * 所以加一层塔不用配任何界面素材。
 */
(function (RA) {
  'use strict';

  RA.FONT_STACK = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", ' +
    '"Noto Sans CJK SC", "Source Han Sans SC", "Segoe UI", sans-serif';

  /** 字号 → canvas 的 font 字符串 */
  RA.font = function (size, bold) {
    return (bold ? '700 ' : '500 ') + size + 'px ' + RA.FONT_STACK;
  };

  /**
   * 画一行字。
   * opts: align(left/center/right) / baseline / bold / alpha / shadow
   */
  RA.text = function (ctx, s, size, color, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = RA.font(size, opts.bold);
    ctx.fillStyle = RA.rgba(color, opts.alpha);
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'middle';
    if (opts.shadow !== false) {
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
    }
    ctx.fillText(s, x, y);
    ctx.restore();
  };

  RA.textWidth = function (ctx, s, size, bold) {
    ctx.save();
    ctx.font = RA.font(size, bold);
    var w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  };

  /**
   * 半透明白底的小标签(HUD 用)。大小按文字量自适应。
   * opts.anchor: topleft / topright / center / bottomleft …
   */
  RA.chip = function (ctx, s, pos, opts) {
    opts = opts || {};
    var size = opts.size || 16;
    var padX = opts.padX === undefined ? 12 : opts.padX;
    var padY = opts.padY === undefined ? 6 : opts.padY;
    var w = RA.textWidth(ctx, s, size, opts.bold) + padX * 2;
    var h = Math.max(size + padY * 2, 28);
    var x = pos[0], y = pos[1];
    var anchor = opts.anchor || 'topleft';
    if (anchor.indexOf('right') >= 0) x -= w;
    else if (anchor.indexOf('center') >= 0) x -= w / 2;
    if (anchor.indexOf('bottom') >= 0) y -= h;
    else if (anchor.indexOf('middle') >= 0) y -= h / 2;

    var bg = opts.bg || RA.C.CHIP_BG;
    ctx.save();
    ctx.globalAlpha = opts.alpha === undefined ? 0.62 : opts.alpha;
    RA.pathRoundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = RA.rgba(bg);
    ctx.fill();
    ctx.restore();
    RA.text(ctx, s, size, opts.color || RA.C.INK, x + w / 2, y + h / 2, { bold: opts.bold });
    return { x: x, y: y, w: w, h: h };
  };
})(globalThis.RA = globalThis.RA || {});
