/* -*- coding: utf-8 -*- */
/*
 * control-layout.js —— 触控按钮布局(独立于模板/RunState)
 * ======================================================
 * schemaVersion 1: { buttons: { left|right|jump|skill: {x,y,size} } }
 * x/y 是安全区域内归一化中心(0..1),size 是参考短边比例。
 * 保存失败返回显式错误;调用方保留旧布局。旋转/尺寸改变后由 resolve() 夹回可见范围。
 */
(function (RA) {
  'use strict';

  var ACTIONS = ['left', 'right', 'jump', 'skill'];
  var DEFAULTS = {
    schemaVersion: 1,
    buttons: {
      left: { x: 0.10, y: 0.80, size: 0.14 },
      right: { x: 0.27, y: 0.80, size: 0.14 },
      jump: { x: 0.86, y: 0.80, size: 0.16 },
      skill: { x: 0.68, y: 0.62, size: 0.12 }
    }
  };
  var MIN_SIZE = 0.08, MAX_SIZE = 0.24;

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function defaults() { return clone(DEFAULTS); }

  function normalize(raw) {
    var out = defaults();
    var buttons = raw && raw.buttons && typeof raw.buttons === 'object' ? raw.buttons : {};
    ACTIONS.forEach(function (action) {
      var src = buttons[action] || {};
      out.buttons[action] = {
        x: num(src.x) ? clamp(src.x, 0.03, 0.97) : out.buttons[action].x,
        y: num(src.y) ? clamp(src.y, 0.03, 0.97) : out.buttons[action].y,
        size: num(src.size) ? clamp(src.size, MIN_SIZE, MAX_SIZE) : out.buttons[action].size
      };
    });
    return out;
  }

  /**
   * 解析成安全区域内的像素框。返回 {action:{left,top,w,h,size,centerX,centerY}}。
   * 这是布局唯一使用的坐标转换;页面只消费结果。
   */
  function resolve(layout, viewport) {
    var vw = Math.max(1, viewport && viewport.width || 1);
    var vh = Math.max(1, viewport && viewport.height || 1);
    var min = Math.min(vw, vh);
    var l = normalize(layout);
    var out = {};
    ACTIONS.forEach(function (action) {
      var b = l.buttons[action];
      var size = clamp(b.size, MIN_SIZE, MAX_SIZE) * min;
      var cx = b.x * vw;
      var cy = b.y * vh;
      var left = clamp(cx - size / 2, 0, Math.max(0, vw - size));
      var top = clamp(cy - size / 2, 0, Math.max(0, vh - size));
      out[action] = {
        left: left, top: top, w: size, h: size,
        centerX: left + size / 2, centerY: top + size / 2,
        size: b.size
      };
    });
    return out;
  }

  /** 拖动后写回归一化中心;夹在 0.03..0.97,不改变 size */
  function moveTo(layout, action, centerX, centerY, viewport) {
    var l = normalize(layout);
    var vw = Math.max(1, viewport.width), vh = Math.max(1, viewport.height);
    if (!l.buttons[action]) return l;
    l.buttons[action].x = clamp(centerX / vw, 0.03, 0.97);
    l.buttons[action].y = clamp(centerY / vh, 0.03, 0.97);
    return l;
  }

  function setSize(layout, action, size) {
    var l = normalize(layout);
    if (!l.buttons[action]) return l;
    l.buttons[action].size = clamp(Number(size), MIN_SIZE, MAX_SIZE);
    return l;
  }

  function load(storage, key) {
    var k = key || 'ra_control_layout_v1';
    try {
      var raw = storage && storage.getItem(k);
      if (!raw) return { ok: true, value: defaults(), recovered: false };
      return { ok: true, value: normalize(JSON.parse(raw)), recovered: false };
    } catch (e) {
      return {
        ok: false, value: defaults(), recovered: true,
        error: { code: 'LAYOUT_LOAD_FAILED', message: '读取按键布局失败,已使用默认值:' + (e && e.message || e) }
      };
    }
  }

  function save(storage, layout, key) {
    var k = key || 'ra_control_layout_v1';
    var l = normalize(layout);
    try {
      if (!storage || typeof storage.setItem !== 'function') throw new Error('存储不可用');
      storage.setItem(k, JSON.stringify(l));
      return { ok: true, value: l };
    } catch (e) {
      return {
        ok: false, value: l,
        error: { code: 'LAYOUT_SAVE_FAILED', message: '按键布局没有保存:' + (e && e.message || e) }
      };
    }
  }

  RA.ControlLayout = {
    ACTIONS: ACTIONS, MIN_SIZE: MIN_SIZE, MAX_SIZE: MAX_SIZE,
    defaults: defaults, normalize: normalize, resolve: resolve,
    moveTo: moveTo, setSize: setSize, load: load, save: save
  };
})(globalThis.RA = globalThis.RA || {});
