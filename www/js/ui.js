/* -*- coding: utf-8 -*- */
/*
 * ui.js —— 界面层(标题界面 / HUD / 塔进度条 / 结算面板)
 * =====================================================
 * abyss 的界面全是 pygame 画的;这边一样:**一张 UI 图都不用**,
 * 全部是 canvas 上的字和圆角方块,所以加楼层、加选项都不用配素材。
 *
 * 布局统一由 *_layout() 函数算出来,画的时候和点鼠标判定的时候用同一份,
 * 换分辨率不用手改两遍。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var W = C.WIDTH, H = C.HEIGHT;
  var UI = {};

  // ===================== 通用 =====================
  UI.panel = function (ctx, rect, title) {
    ctx.save();
    ctx.globalAlpha = 0.88;
    RA.pathRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fillStyle = RA.rgba(C.PANEL_BG);
    ctx.fill();
    ctx.restore();
    RA.strokeRect(ctx, rect.x, rect.y, rect.w, rect.h, C.PANEL_EDGE, 2, 14);
    if (title) {
      RA.text(ctx, title, 15, C.INK_DIM, rect.x + 18, rect.y + 22, { align: 'left', bold: true });
    }
  };

  UI.button = function (ctx, rect, label, opts) {
    opts = opts || {};
    var col = opts.on ? C.BTN_ON : (opts.hover ? C.BTN_HOVER : C.BTN_COL);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    RA.pathRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fillStyle = RA.rgba(col, opts.alpha === undefined ? 1 : opts.alpha);
    ctx.fill();
    ctx.restore();
    RA.strokeRect(ctx, rect.x, rect.y, rect.w, rect.h,
      opts.on ? [150, 220, 190] : [190, 208, 236], 2, 10);
    RA.text(ctx, label, opts.size || 19, [255, 255, 255],
      rect.x + rect.w / 2, rect.y + rect.h / 2, { bold: true });
  };

  /** 加宽字距的大标题(手动画,兼容性比 ctx.letterSpacing 好) */
  UI.spaced = function (ctx, s, size, color, cx, y, gap) {
    var widths = [];
    var total = 0, i;
    for (i = 0; i < s.length; i++) {
      var w = RA.textWidth(ctx, s[i], size, true);
      widths.push(w);
      total += w + gap;
    }
    total -= gap;
    var x = cx - total / 2;
    for (i = 0; i < s.length; i++) {
      RA.text(ctx, s[i], size, color, x + widths[i] / 2, y, { bold: true });
      x += widths[i] + gap;
    }
  };

  UI.paletteColor = function (i) {
    return 'hsl(' + ((i * 47) % 360) + ',58%,64%)';
  };

  UI.shade = function (ctx, alpha) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,8,16,' + alpha + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  // ===================== 背景(拍照:assets/sky/skyN.png) =====================
  /** 全局素材池:Game / 编辑器启动时会把它挂到 RA.assets 上,这里兜一个默认的 */
  function assets() {
    if (!RA.assets) RA.assets = new RA.Assets();
    return RA.assets;
  }

  /** 把一张图按"铺满"的方式画到一块区域(多出来的裁掉,不拉伸变形) */
  UI.drawCover = function (ctx, img, x, y, w, h) {
    var iw = img.width || img.naturalWidth || 1;
    var ih = img.height || img.naturalHeight || 1;
    var s = Math.max(w / iw, h / ih);
    var dw = iw * s, dh = ih * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  };

  /**
   * 画背景。
   *   skyIndex —— 用第几张天空贴图(1 ~ config.SKY_COUNT);越界会夹回去。
   *   w / h    —— 画多大,不给就是游戏画布大小(编辑器试玩时画布更大)。
   * 天空是贴图,塔身剪影和竖井柔光还是现画的 —— 那是"塔"的框架,和天空无关。
   */
  UI.drawBackground = function (ctx, skyIndex, w, h) {
    var W = w || C.WIDTH, H = h || C.HEIGHT;
    var n = C.SKY_COUNT || 8;
    var i = RA.clamp(Math.round(skyIndex) || 1, 1, n);

    UI.drawCover(ctx, assets().image('sky/' + i), 0, 0, W, H);

    // 两侧塔身:越上面(天空越亮)越浅
    var wallW = 46;
    var bright = (i - 1) / Math.max(1, n - 1);
    var wall = RA.mixColor([20, 22, 38], [116, 140, 176], bright * 0.75);
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = RA.rgba(wall);
    ctx.fillRect(0, 0, wallW, H);
    ctx.fillRect(W - wallW, 0, wallW, H);
    ctx.restore();
    // 塔身砖缝(随时间缓慢上移,给一点"在上升"的暗示)
    var off = (RA.time || 0) * 10 % C.TS;
    ctx.save();
    ctx.globalAlpha = 0.20;
    for (var y = -C.TS + off; y < H + C.TS; y += C.TS) {
      RA.line(ctx, 0, y, wallW, y, 3, [0, 0, 0]);
      RA.line(ctx, W - wallW, y, W, y, 3, [0, 0, 0]);
    }
    ctx.globalAlpha = 0.14;
    for (var y2 = -C.TS + off + C.TS / 2; y2 < H + C.TS; y2 += C.TS * 2) {
      RA.line(ctx, wallW - 14, y2 - C.TS / 2, wallW - 14, y2 + C.TS / 2, 2, [0, 0, 0]);
      RA.line(ctx, W - wallW + 14, y2 - C.TS / 2, W - wallW + 14, y2 + C.TS / 2, 2, [0, 0, 0]);
    }
    ctx.restore();

    // 竖井里的一层柔光
    var gl = ctx.createLinearGradient(0, 0, W, 0);
    gl.addColorStop(0, 'rgba(255,255,255,0)');
    gl.addColorStop(0.5, 'rgba(255,255,255,' + (0.04 + bright * 0.05) + ')');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(wallW, 0, W - wallW * 2, H);
  };

  /** 开局界面/告别页专用的背景贴图(assets/ui/title.png) */
  UI.drawMenuBackground = function (ctx, w, h) {
    var W = w || C.WIDTH, H = h || C.HEIGHT;
    UI.drawCover(ctx, assets().image('ui/title'), 0, 0, W, H);
  };


  // ============ 开局界面(极简:开始 / 退出 + 右下角齿轮) ============
  // 别的功能(种子、重构、塔高、镜像、导入、关卡编辑器)全收进「设置」里了。
  UI.titleLayout = function () {
    return {
      start: { x: 330, y: 268, w: 300, h: 62 },
      quit: { x: 330, y: 346, w: 300, h: 48 },
      gear: { x: 868, y: 470, w: 44, h: 44 }
    };
  };

  /** 右下角的设置齿轮 */
  UI.drawGear = function (ctx, rect, hover) {
    var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    var col = hover ? [255, 236, 180] : [206, 218, 240];
    ctx.save();
    ctx.globalAlpha = hover ? 1 : 0.78;
    RA.circle(ctx, cx, cy, rect.w * 0.46, hover ? [40, 48, 72] : [24, 28, 42]);
    RA.pathRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.w * 0.46);
    ctx.lineWidth = 2;
    ctx.strokeStyle = RA.rgba(col, hover ? 1 : 0.65);
    ctx.stroke();
    var r0 = rect.w * 0.20, r1 = rect.w * 0.36;
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      RA.line(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0,
        cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, rect.w * 0.15, col);
    }
    RA.circle(ctx, cx, cy, r0 * 1.5, col);
    RA.circle(ctx, cx, cy, r0 * 0.65, hover ? [40, 48, 72] : [24, 28, 42]);
    ctx.restore();
  };

  /** 开局界面:只有标题、开始、退出、右下角设置 */
  UI.drawTitle = function (ctx, game) {
    var L = UI.titleLayout();
    var inp = game.input;
    var t = game.tower;
    var hasPool = game.pool().length > 0;

    UI.drawMenuBackground(ctx);
    UI.spaced(ctx, 'REVERSE ABYSS', 50, C.ACCENT, W / 2, 132, 8);
    RA.text(ctx, '向 上 爬 塔', 19, C.INK, W / 2, 180);

    if (!hasPool) {
      RA.text(ctx, '关卡池是空的 —— 把 levels/*.json 放好,再跑 node tools/sync_levels.mjs',
        14, [255, 180, 160], W / 2, 218);
    } else {
      ctx.save();
      ctx.globalAlpha = 0.7;
      RA.text(ctx, '这座塔 ' + t.height + ' 层 · 关卡池 ' + game.pool().length +
        ' 个模板 · 种子 ' + t.seedLabel, 13, C.INK_DIM, W / 2, 218);
      ctx.restore();
    }

    UI.button(ctx, L.start, '开 始 攀 爬',
      { hover: inp.hovering(L.start), size: 24, on: hasPool });
    UI.button(ctx, L.quit, '退 出 游 戏', { hover: inp.hovering(L.quit), size: 19 });
    UI.drawGear(ctx, L.gear, inp.hovering(L.gear));

    RA.text(ctx, 'Space / Enter 开始 · Esc 或点右下角齿轮打开设置',
      13, C.INK_DIM, W / 2, 524);

    if (game.importMsg && game.importT < 6) {
      var a = game.importT > 5 ? (6 - game.importT) : 1;
      ctx.save();
      ctx.globalAlpha = RA.clamp(a, 0, 1);
      RA.text(ctx, game.importMsg, 13, [150, 240, 180], W / 2, 246);
      ctx.restore();
    }
  };

  // ===================== 设置(以前的那些选项都挪进来了) =====================
  UI.settingsLayout = function () {
    var p = { x: 118, y: 52, w: 724, h: 436 };
    var rx = p.x + 374, rw = 330;
    return {
      panel: p,
      close: { x: p.x + p.w - 96, y: p.y + 14, w: 78, h: 30 },
      list: { x: p.x + 20, y: p.y + 56, w: 336, h: p.h - 96 },
      seed: { x: rx, y: p.y + 56, w: rw, h: 40 },
      floorsMinus: { x: rx, y: p.y + 104, w: 40, h: 40 },
      floorsPlus: { x: rx + rw - 40, y: p.y + 104, w: 40, h: 40 },
      mirror: { x: rx, y: p.y + 152, w: rw, h: 40 },
      reroll: { x: rx, y: p.y + 200, w: rw, h: 42 },
      importer: { x: rx, y: p.y + 250, w: 159, h: 42 },
      editor: { x: rx + 171, y: p.y + 250, w: 159, h: 42 },
      info: { x: rx, y: p.y + 300, w: rw, h: 76 }
    };
  };

  UI.drawSettings = function (ctx, game) {
    var L = UI.settingsLayout();
    var inp = game.input;
    var t = game.tower;
    var P = L.panel;

    UI.shade(ctx, 0.55);
    UI.panel(ctx, P, '');
    RA.text(ctx, '设  置', 24, C.ACCENT, P.x + 24, P.y + 30, { align: 'left', bold: true });
    UI.button(ctx, L.close, '关闭 (Esc)', { hover: inp.hovering(L.close), size: 14 });

    // ---------- 塔的结构 ----------
    UI.panel(ctx, L.list, '塔的结构(最上面那行就是塔顶)');
    var inner = { x: L.list.x + 18, y: L.list.y + 44, w: L.list.w - 36 };
    var innerH = L.list.h - 56;
    var n = Math.max(1, t.height);
    var rowH = RA.clamp(Math.floor(innerH / n), 11, 22);
    var fsize = RA.clamp(rowH - 4, 10, 15);
    if (!t.floors.length) {
      RA.text(ctx, '关卡池是空的 —— 把 levels/*.json 放好,', 14, [255, 180, 160],
        L.list.x + L.list.w / 2, L.list.y + 140);
      RA.text(ctx, '然后运行 node tools/sync_levels.mjs', 14, [255, 180, 160],
        L.list.x + L.list.w / 2, L.list.y + 166);
    }
    for (var i = t.height - 1; i >= 0; i--) {
      var row = t.height - 1 - i;
      var y = inner.y + row * rowH + rowH / 2;
      var plan = t.floors[i];
      RA.circle(ctx, inner.x + 7, y, Math.min(4.5, rowH / 3.2),
        UI.paletteColor(plan.templateIndex));
      RA.text(ctx, String(i + 1), Math.max(10, fsize - 1), C.INK_DIM, inner.x + 22, y,
        { align: 'left' });
      // 层的身份就是它的 id(名字已经去掉了);难度和"验没验过"都来自关卡数据
      var label = (plan.name || plan.id) + (plan.flip ? '  ·镜像' : '') +
        (plan.verified === false ? '  ·未验证' : '');
      RA.text(ctx, label, fsize, plan.verified === false ? [236, 168, 130] : C.INK,
        inner.x + 52, y, { align: 'left' });
      var tag = i === t.height - 1 ? '塔顶' : ('难度 ' + (plan.difficulty || 1));
      RA.text(ctx, tag, Math.max(9, fsize - 2),
        i === t.height - 1 ? C.ACCENT : C.INK_DIM,
        inner.x + inner.w, y, { align: 'right', bold: i === t.height - 1 });
    }

    // ---------- 种子 ----------
    var editing = game.seedEditing;
    ctx.save();
    ctx.globalAlpha = editing ? 0.95 : 0.6;
    RA.pathRoundRect(ctx, L.seed.x, L.seed.y, L.seed.w, L.seed.h, 10);
    ctx.fillStyle = RA.rgba(C.CHIP_BG);
    ctx.fill();
    ctx.restore();
    RA.strokeRect(ctx, L.seed.x, L.seed.y, L.seed.w, L.seed.h,
      editing ? C.ACCENT : [190, 208, 236], 2, 10);
    RA.text(ctx, '种子', 15, C.INK, L.seed.x + 16, L.seed.y + L.seed.h / 2, { align: 'left' });
    var seedText = editing ? (game.seedBuffer + '▏') : t.seedLabel;
    RA.text(ctx, seedText, 16, editing ? C.ACCENT : C.INK, L.seed.x + L.seed.w - 16,
      L.seed.y + L.seed.h / 2, { align: 'right', bold: true });

    // ---------- 塔高 ----------
    RA.text(ctx, '塔高', 15, C.INK, L.floorsMinus.x + 16, L.floorsMinus.y + 21,
      { align: 'left' });
    UI.button(ctx, L.floorsMinus, '−', { hover: inp.hovering(L.floorsMinus), size: 22 });
    UI.button(ctx, L.floorsPlus, '＋', { hover: inp.hovering(L.floorsPlus), size: 20 });
    var midX = (L.floorsMinus.x + L.floorsMinus.w + L.floorsPlus.x) / 2;
    RA.text(ctx, t.height + ' 层', 19, C.ACCENT, midX, L.floorsMinus.y + 17, { bold: true });
    RA.text(ctx, '↑↓ 也能调(共 ' + t.totalMeters + ' 米)', 11, C.INK_DIM,
      midX, L.floorsMinus.y + 34);

    // ---------- 镜像 ----------
    RA.pathRoundRect(ctx, L.mirror.x, L.mirror.y, L.mirror.w, L.mirror.h, 10);
    ctx.fillStyle = RA.rgba(C.BTN_COL, game.mirror ? 0.9 : 0.45);
    ctx.fill();
    RA.strokeRect(ctx, L.mirror.x, L.mirror.y, L.mirror.w, L.mirror.h,
      game.mirror ? [150, 220, 190] : [190, 208, 236], 2, 10);
    RA.text(ctx, '镜像变体(同一张图两种走法)', 14, C.INK, L.mirror.x + 16,
      L.mirror.y + L.mirror.h / 2, { align: 'left' });
    RA.text(ctx, game.mirror ? '开 (M)' : '关 (M)', 14,
      game.mirror ? [150, 235, 190] : C.INK_DIM,
      L.mirror.x + L.mirror.w - 16, L.mirror.y + L.mirror.h / 2,
      { align: 'right', bold: true });

    // ---------- 按钮 ----------
    UI.button(ctx, L.reroll, '重 构 塔 (R)', { hover: inp.hovering(L.reroll), size: 18 });
    UI.button(ctx, L.importer, '导入关卡 (I)', { hover: inp.hovering(L.importer), size: 15 });
    UI.button(ctx, L.editor, '关卡编辑器 (E)', { hover: inp.hovering(L.editor), size: 15 });

    // ---------- 信息 ----------
    var cxInfo = L.info.x + L.info.w / 2;
    if (game.importMsg && game.importT < 6) {
      var a2 = game.importT > 5 ? (6 - game.importT) : 1;
      ctx.save();
      ctx.globalAlpha = RA.clamp(a2, 0, 1);
      RA.text(ctx, game.importMsg, 13, [150, 240, 180], cxInfo, L.info.y + 12);
      ctx.restore();
    } else {
      var bad = (game.pack && game.pack.bad) || [];
      var line = '关卡池:' + game.pool().length + ' 个模板';
      if (bad.length) line += ' · ' + bad.length + ' 个有问题(看控制台)';
      RA.text(ctx, line, 13, bad.length ? [255, 190, 150] : C.INK_DIM, cxInfo, L.info.y + 8);
      RA.text(ctx, '一层 ' + C.FLOOR_METERS + ' 米 · 这座塔高 ' + t.totalMeters + ' 米',
        13, C.INK_DIM, cxInfo, L.info.y + 30);
      RA.text(ctx, '重构塔(R)会重新抽层 · 编辑器新存的层也会进场', 12, C.INK_DIM,
        cxInfo, L.info.y + 54);
    }

    RA.text(ctx, 'R 重构 · M 镜像 · ↑↓ 塔高 · I 导入关卡 · E 关卡编辑器 · Esc 关闭',
      13, C.INK_DIM, P.x + P.w / 2, P.y + P.h - 16);
  };

  // ===================== 退出之后的告别页 =====================
  UI.drawBye = function (ctx) {
    UI.drawMenuBackground(ctx);
    UI.shade(ctx, 0.66);
    RA.text(ctx, '已 经 退 出', 46, C.ACCENT, W / 2, H / 2 - 34, { bold: true });
    RA.text(ctx, '浏览器一般不让网页自己关标签页,直接关掉这个标签页就行', 18, C.INK,
      W / 2, H / 2 + 16);
    RA.text(ctx, 'Esc 或点一下回到开局界面', 14, C.INK_DIM, W / 2, H / 2 + 54);
  };

  // ===================== 对局中的 HUD =====================
  UI.drawTowerBar = function (ctx, game) {
    var t = game.tower;
    var n = t.height;
    if (n <= 0) return;
    var x = W - 40, w = 14, top = 104, bot = H - 92;
    var seg = (bot - top) / n;
    var gap = seg > 8 ? 2 : 1;
    var floor = game.floor;

    ctx.save();
    ctx.globalAlpha = 0.55;
    RA.pathRoundRect(ctx, x - 6, top - 10, w + 12, (bot - top) + 20, 10);
    ctx.fillStyle = RA.rgba(C.CHIP_BG);
    ctx.fill();
    ctx.restore();

    for (var i = 0; i < n; i++) {
      var y = bot - (i + 1) * seg;
      var h = Math.max(2, seg - gap);
      var col;
      if (i < floor) col = [104, 208, 152];
      else if (i === floor) col = C.ACCENT;
      else col = [72, 86, 118];
      RA.rect(ctx, x, y + gap / 2, w, h, col, Math.min(4, h / 2));
    }

    // 当前层的指针
    if (floor < n) {
      var cy = bot - (floor + 0.5) * seg;
      RA.polygon(ctx, [[x - 13, cy - 5], [x - 13, cy + 5], [x - 7, cy]], [255, 236, 180]);
    }
    RA.text(ctx, t.totalMeters + ' m', 11, C.INK_DIM, x + w / 2, top - 22);
    RA.text(ctx, t.climbedMeters + ' m', 12, C.ACCENT, x + w / 2, bot + 16, { bold: true });
  };

  UI.drawHud = function (ctx, game) {
    var t = game.tower;
    // 登顶那一帧 floor 会等于层数(表示"全爬完了"),显示时夹一下,别出现"第 9 / 8 层"
    var shown = Math.min(game.floor + 1, t.height);
    var cur = t.floors[Math.min(game.floor, t.height - 1)];
    var name = cur ? cur.name : '';
    var flip = cur && cur.flip ? ' ·镜像' : '';
    RA.chip(ctx, '第 ' + shown + ' / ' + t.height + ' 层 · ' + name + flip,
      [12, 12]);
    RA.chip(ctx, RA.clock(game.stats.time) + '   坠落 ' + game.stats.falls,
      [W - 52, 12], { anchor: 'topright' });
    RA.chip(ctx, '←→ 移动   Space 跳跃(空中再按 = 二段跳)   踩到「上一层」就往上爬一层',
      [12, H - 42], { size: 13, alpha: 0.5 });
    UI.drawTowerBar(ctx, game);
  };

  // 刚到一层时飘一下的层名
  UI.drawToast = function (ctx, game) {
    if (!game.toast) return;
    var t = game.toast.t, total = 2.6;
    if (t > total) return;
    var a = t < 0.25 ? t / 0.25 : (t > total - 0.7 ? (total - t) / 0.7 : 1);
    ctx.save();
    ctx.globalAlpha = RA.clamp(a, 0, 1);
    RA.text(ctx, game.toast.text, 27, C.ACCENT, W / 2, 128, { bold: true });
    ctx.restore();
  };

  // 爬升过渡时中间那行字
  UI.drawClimbOverlay = function (ctx, game) {
    var c = game.climb;
    if (!c) return;
    var t = RA.clamp(c.t / C.CLIMB_TIME, 0, 1);
    var a = Math.sin(Math.PI * t);
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    if (c.final) {
      RA.text(ctx, '登  顶', 52, [255, 240, 200], W / 2, H / 2 - 10, { bold: true });
      RA.text(ctx, '上面没有楼层了', 18, C.INK_DIM, W / 2, H / 2 + 34);
    } else {
      RA.text(ctx, '第 ' + (c.to + 1) + ' 层', 46, [255, 255, 255], W / 2, H / 2 - 14,
        { bold: true });
      RA.text(ctx, c.name, 19, C.ACCENT, W / 2, H / 2 + 28);
    }
    ctx.restore();
  };

  // ===================== 结算面板 =====================
  UI.victoryLayout = function () {
    var w = 620, h = 344;
    var x = (W - w) / 2, y = 98;
    var bw = 176, gap = 24;
    var x0 = x + (w - (bw * 3 + gap * 2)) / 2;
    return {
      panel: { x: x, y: y, w: w, h: h },
      again: { x: x0, y: y + 232, w: bw, h: 52 },
      reroll: { x: x0 + bw + gap, y: y + 232, w: bw, h: 52 },
      title: { x: x0 + (bw + gap) * 2, y: y + 232, w: bw, h: 52 }
    };
  };

  UI.drawVictory = function (ctx, game) {
    var L = UI.victoryLayout();
    var inp = game.input;
    UI.shade(ctx, 0.62);
    UI.panel(ctx, L.panel, '');

    RA.text(ctx, '登 顶 成 功', 46, C.ACCENT,
      L.panel.x + L.panel.w / 2, L.panel.y + 62, { bold: true });
    RA.text(ctx, '你从塔底一路爬到了第 ' + game.tower.height + ' 层', 20, C.INK,
      L.panel.x + L.panel.w / 2, L.panel.y + 108);

    var cx = L.panel.x + L.panel.w / 2;
    RA.text(ctx, '用时 ' + RA.clock(game.stats.time) + '    坠落 ' + game.stats.falls +
      ' 次    塔高 ' + game.tower.totalMeters + ' 米', 17, C.INK_DIM, cx,
      L.panel.y + 150);
    RA.text(ctx, '种子 ' + game.tower.seedLabel + '(抄下来就能让别人爬同一座塔)',
      14, C.INK_DIM, cx, L.panel.y + 178);

    UI.button(ctx, L.again, '再爬一次', { hover: inp.hovering(L.again), size: 19 });
    UI.button(ctx, L.reroll, '换一座塔 (R)', { hover: inp.hovering(L.reroll), size: 18 });
    UI.button(ctx, L.title, '回开局 (Esc)', { hover: inp.hovering(L.title), size: 18 });
    RA.text(ctx, 'Enter = 再爬一次    R = 换一座塔    Esc = 回开局界面',
      13, C.INK_DIM, cx, L.panel.y + 306);
  };

  RA.UI = UI;
})(globalThis.RA = globalThis.RA || {});
