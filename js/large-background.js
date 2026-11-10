/* -*- coding: utf-8 -*- */
/*
 * large-background.js —— 38:三层大背景(纯视觉)
 * =============================================
 * 第一组:落日(后) → 塔楼(中) → 丛林(前);全部画在关卡小背景/地形/角色之后、
 * ViewZoom 之前(CSS 屏幕坐标)。组选择/布局是纯函数;视差状态由页面持有,
 * 不读写 storage、不修改 Session/模板。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  function cfg() {
    var v = (C.VISUAL && C.VISUAL.largeBackground) || {};
    return {
      frontPanPct: v.frontPanPct !== undefined ? v.frontPanPct : 0.04,
      midPanPct: v.midPanPct !== undefined ? v.midPanPct : 0.03,
      backPanPct: v.backPanPct !== undefined ? v.backPanPct : 0.02,
      responseTiles: v.responseTiles || 12,
      towerMaxH: v.towerMaxH || 0.80,
      towerMaxW: v.towerMaxW || 0.28,
      towerCenterX: v.towerCenterX || 0.22,
      edgeMarginPx: v.edgeMarginPx || 2
    };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function catalog() { return RA.LargeBackgroundCatalog || null; }

  /** 正式塔/固定场景:按真实槽号;10/30休息区、所有小屋、大厅都是第一组 */
  function groupForTower(opts) {
    opts = opts || {};
    if (opts.sceneKind === 'rest-house') return 'difficulty-1';
    var n = Number(opts.floorNumber);
    if (!isFinite(n) || n <= 0 || n <= 10) return 'difficulty-1';
    if (n === 30) return 'difficulty-1';
    if (n >= 11 && n <= 20) return 'difficulty-2';
    if (n >= 21 && n <= 29) return 'difficulty-3';
    if (n >= 31 && n <= 40) return 'difficulty-4';
    return 'difficulty-1';
  }
  /** 独立 Trial:只看本图 difficulty 1..4 */
  function groupForTrial(difficulty) {
    var d = Math.round(Number(difficulty) || 1);
    if (d < 1) d = 1;
    if (d > 4) d = 4;
    return 'difficulty-' + d;
  }
  function layersFor(groupId) {
    var cat = catalog();
    if (!cat || !Array.isArray(cat.groups)) return [];
    for (var i = 0; i < cat.groups.length; i++) {
      if (cat.groups[i] && cat.groups[i].group === groupId) return cat.groups[i].layers || [];
    }
    return [];
  }
  function hasGroup(groupId) { return layersFor(groupId).length === 3; }

  function createParallaxState() { return { u: 0, prevX: null, groupId: null }; }

  /**
   * 只在实际水平位移时累计 u;换组/传送/场景切换/discontinuity 先重置参考。
   * 返回同一 state(便于页面持有),不产生副作用到 Session。
   */
  function update(state, opts) {
    opts = opts || {};
    if (!state) return state;
    var groupId = opts.groupId || null;
    var x = Number(opts.playerX);
    if (!isFinite(x)) x = 0;
    if (state.groupId !== groupId) {
      state.groupId = groupId;
      state.u = 0;
      state.prevX = x;
      return state;
    }
    if (opts.discontinuity || state.prevX === null) {
      state.prevX = x;
      return state;
    }
    var dx = x - state.prevX;
    state.prevX = x;
    if (!dx) return state;
    var unit = (C.TS || 45) * cfg().responseTiles;
    state.u = clamp(state.u + dx / unit, -1, 1);
    return state;
  }

  /** 图组/视口大小变化时只重算布局;u 作为相位保留 */
  function layoutLayer(layer, opts) {
    opts = opts || {};
    var W = Math.max(1, Number(opts.width) || 1);
    var H = Math.max(1, Number(opts.height) || 1);
    var u = clamp(Number(opts.u) || 0, -1, 1);
    var sw = Number(layer && layer.width) || 0;
    var sh = Number(layer && layer.height) || 0;
    if (!sw || !sh) return null;
    var c = cfg();
    var l = (layer && layer.layout) || {};
    var fit = l.fit || (layer.layer === 'mid' ? 'contain' : 'cover');
    var anchorX = l.anchorX !== undefined ? l.anchorX : (fit === 'contain' ? c.towerCenterX : 0.5);
    var anchorY = l.anchorY !== undefined ? l.anchorY : (layer.layer === 'front' ? 1 : (fit === 'contain' ? 1 : 0.5));
    var pct = l.panPct !== undefined ? l.panPct
      : (layer.layer === 'front' ? c.frontPanPct : (layer.layer === 'mid' ? c.midPanPct : c.backPanPct));
    var A = pct * W;
    if (fit === 'contain') {
      var maxH = (l.maxHeightPct !== undefined ? l.maxHeightPct : c.towerMaxH) * H;
      var maxW = (l.maxWidthPct !== undefined ? l.maxWidthPct : c.towerMaxW) * W;
      var scale = Math.min(maxH / sh, maxW / sw);
      var dw = sw * scale, dh = sh * scale;
      return {
        x: W * anchorX - dw / 2 - u * A,
        y: H * anchorY - dh,
        w: dw, h: dh, scale: scale
      };
    }
    var M = A + c.edgeMarginPx;
    var cover = Math.max((W + 2 * M) / sw, H / sh);
    var cw = sw * cover, ch = sh * cover;
    return {
      x: (W - cw) * anchorX - u * A,
      y: (H - ch) * anchorY,
      w: cw, h: ch, scale: cover
    };
  }

  /** 单组完整面板:原渐变底 + 组内三层,整组可纵向 offset(换组动画) */
  function drawScene(ctx, opts, assets) {
    opts = opts || {};
    var W = Math.max(1, Number(opts.width) || 1);
    var H = Math.max(1, Number(opts.height) || 1);
    var offsetY = Number(opts.offsetY) || 0;
    if (!ctx) return false;
    ctx.save();
    if (offsetY) {
      ctx.beginPath();
      ctx.rect(0, offsetY, W, H);
      ctx.clip();
      ctx.translate(0, offsetY);
    }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0f1e');
    g.addColorStop(1, '#05060c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    var drew = draw(ctx, { groupId: opts.groupId, width: W, height: H, u: opts.u }, assets);
    ctx.restore();
    return drew || !!opts.groupId;
  }

  // ---------------- 39:管道换组滑动过渡(纯页面视觉) ----------------
  function createTransitionState() {
    return { active: false, fromGroup: null, toGroup: null, elapsed: 0, duration: 0.5, fromU: 0 };
  }
  function beginTransition(state, opts) {
    if (!state) return state;
    opts = opts || {};
    state.active = true;
    state.fromGroup = opts.fromGroup || null;
    state.toGroup = opts.toGroup || null;
    state.fromU = clamp(Number(opts.fromU) || 0, -1, 1);
    state.elapsed = 0;
    state.duration = opts.duration > 0 ? opts.duration : 0.5;
    return state;
  }
  function stepTransition(state, dt) {
    if (!state || !state.active) return state;
    var step = Number(dt) || 0;
    if (step <= 0) return state;
    state.elapsed = Math.min(state.duration, state.elapsed + step);
    if (state.elapsed >= state.duration) state.active = false;
    return state;
  }
  function resetTransition(state) {
    if (!state) return state;
    state.active = false;
    state.fromGroup = null;
    state.toGroup = null;
    state.elapsed = 0;
    state.fromU = 0;
    return state;
  }
  function transitionEase(p) {
    p = clamp(p, 0, 1);
    return 1 - Math.pow(1 - p, 3);
  }
  /**
   * 画两组完整面板:旧组整体下移,新组从上方补入;每面板独立 clip,
   * 缺图组仅渐变面板。返回是否绘制;不推进状态。
   */
  function drawTransition(ctx, opts, assets) {
    opts = opts || {};
    var st = opts.state;
    if (!st || !st.active || !ctx) return false;
    var W = Math.max(1, Number(opts.width) || 1);
    var H = Math.max(1, Number(opts.height) || 1);
    var p = clamp(st.elapsed / Math.max(0.001, st.duration), 0, 1);
    var e = transitionEase(p);
    var oldY = e * H;
    var newY = (e - 1) * H;
    drawScene(ctx, { groupId: st.fromGroup, width: W, height: H, u: st.fromU, offsetY: oldY }, assets);
    drawScene(ctx, { groupId: st.toGroup, width: W, height: H, u: opts.toU, offsetY: newY }, assets);
    return true;
  }

  /** 纯绘制:按层序画组内图片;缺组/缺图返回 false 保留渐变 */
  function draw(ctx, opts, assets) {
    opts = opts || {};
    var layers = layersFor(opts.groupId);
    if (!layers.length || !ctx || !assets) return false;
    var order = { back: 0, mid: 1, front: 2 };
    var list = layers.slice().sort(function (a, b) {
      return (order[a.layer] !== undefined ? order[a.layer] : 9) - (order[b.layer] !== undefined ? order[b.layer] : 9);
    });
    var drew = false;
    ctx.save();
    list.forEach(function (layer) {
      var img = assets.image(layer.file);
      if (!img) return;
      var r = layoutLayer(layer, opts);
      if (!r) return;
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      drew = true;
    });
    ctx.restore();
    return drew;
  }

  RA.LargeBackground = {
    groupForTower: groupForTower,
    groupForTrial: groupForTrial,
    layersFor: layersFor,
    hasGroup: hasGroup,
    createParallaxState: createParallaxState,
    update: update,
    layoutLayer: layoutLayer,
    draw: draw,
    drawScene: drawScene,
    createTransitionState: createTransitionState,
    beginTransition: beginTransition,
    stepTransition: stepTransition,
    resetTransition: resetTransition,
    transitionEase: transitionEase,
    drawTransition: drawTransition,
    config: cfg
  };
})(globalThis.RA = globalThis.RA || {});
