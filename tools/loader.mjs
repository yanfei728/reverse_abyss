/* -*- coding: utf-8 -*- */
/*
 * loader.mjs —— 在 Node 里把引擎脚本跑起来
 * ==========================================
 * 引擎是给浏览器写的(普通 <script>,挂在 globalThis.RA 上),想在 Node 里
 * 跑自检就得自己搭一个最小的 DOM / canvas 替身:
 *   · canvas.getContext('2d') 返回一个"什么都接、什么都不做"的 Proxy
 *   · document / Image / requestAnimationFrame 都有,但不连真屏幕
 * 于是所有逻辑(物理、塔、关卡解析、绘制调用)都能在命令行里验证。
 *
 * 这里的脚本顺序必须和 legacy.html 里的 <script> 顺序一致(index.html 只做默认跳转)。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 引擎脚本(不含 main.js —— 那是浏览器入口) */
export const ENGINE = [
  'js/config.js',
  'js/util.js',
  'js/text.js',
  'js/level.js',
  'js/entity-registry.js',
  'js/level-data.js',
  'js/cloud-pipe.js',
  'js/path-geometry.js',
  'js/trial-plan.js',
  'js/legacy-import.js',
  'js/entities/base.js',
  'js/entities/player.js',
  'js/entities/goal.js',
  'js/entities/spring.js',
  'js/entities/ghost.js',
  'js/entities/blink.js',
  'js/monsters.js',
  'js/camera.js',
  'js/assets.js',
  'js/audio.js',
  'js/input.js',
  'js/tower.js',
  'js/levelpack.js',
  'js/content-repository.js',
  'js/rules.js',
  'js/world.js',
  'js/session.js',
  'js/boss.js',
  'js/tower-planner.js',
  'js/reach.js',
  'js/ui.js',
  'js/game.js',
  'js/smoke.js',
  'levels/levels.js',
  'js/dev-samples.js',
  'js/b2-samples.js',
  'js/b4-samples.js'
];

// ---------------- canvas / DOM 替身 ----------------
function makeCtx(canvas) {
  const target = {
    canvas,
    measureText: (s) => ({ width: String(s).length * 8 }),
    createLinearGradient: () => ({ addColorStop() { } }),
    createRadialGradient: () => ({ addColorStop() { } }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => { };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

export function makeCanvas(w = 960, h = 540) {
  const cv = {
    tagName: 'CANVAS',
    width: w, height: h,
    clientWidth: w, clientHeight: h,
    style: {}, className: '', id: '',
    children: [],
    getBoundingClientRect() {
      return { left: 0, top: 0, width: cv.clientWidth, height: cv.clientHeight };
    },
    appendChild(c) { cv.children.push(c); return c; },
    removeChild(c) { return c; },
    setAttribute() { }, getAttribute() { return null; },
    focus() { }, click() { }, remove() { }, select() { }
  };
  cv.getContext = () => (cv.__ctx || (cv.__ctx = makeCtx(cv)));
  return makeEmitter(cv);
}

/** 给一个对象装上 addEventListener / dispatch(自检里要能手动派发事件) */
function makeEmitter(target) {
  const listeners = {};
  target.__listeners = listeners;
  target.addEventListener = (type, fn) => {
    (listeners[type] || (listeners[type] = [])).push(fn);
  };
  target.removeEventListener = (type, fn) => {
    const a = listeners[type];
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  };
  target.dispatch = (type, ev) => {
    const e = Object.assign({
      type, target, currentTarget: target,
      preventDefault() { }, stopPropagation() { }
    }, ev || {});
    (listeners[type] || []).slice().forEach((fn) => fn(e));
    return e;
  };
  return target;
}

/** 通用 DOM 元素替身:属性随便读写,方法都是空的(但事件能派发) */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    style: {}, dataset: {}, children: [],
    id: '', className: '', title: '', value: '', textContent: '', innerHTML: '',
    checked: false, disabled: false, files: [],
    clientWidth: 300, clientHeight: 200,
    appendChild(c) { el.children.push(c); if (c) c.parentNode = el; return c; },
    removeChild(c) {
      const i = el.children.indexOf(c);
      if (i >= 0) el.children.splice(i, 1);
      return c;
    },
    insertBefore(c) { return el.appendChild(c); },
    setAttribute() { }, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: el.clientWidth, height: el.clientHeight };
    },
    focus() { }, blur() { }, select() { }, remove() { }, click() { }
  };
  return makeEmitter(el);
}

function installDom() {
  const g = globalThis;
  if (g.__RA_DOM_READY__) return;
  const gameCanvas = makeCanvas();
  const body = makeEl('body');
  const byId = {};
  g.__RA_DOM_READY__ = true;

  const doc = makeEmitter({
    readyState: 'complete',
    hidden: false,
    body: body,
    createElement(tag) {
      return String(tag).toLowerCase() === 'canvas' ? makeCanvas() : makeEl(tag);
    },
    getElementById(id) {
      if (id === 'game') return gameCanvas;
      if (id === 'board') {
        if (!byId[id]) {
          byId[id] = makeCanvas(900, 600);
          byId[id].id = id;
          byId[id].clientWidth = 900;
          byId[id].clientHeight = 600;
        }
        return byId[id];
      }
      if (!byId[id]) { byId[id] = makeEl('div'); byId[id].id = id; }
      return byId[id];
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  });
  g.document = doc;
  g.__RA_EL_BY_ID__ = byId;
  g.window = g;
  // location 是个普通对象(自检里要能假装"跳回 index.html"),href 可读可写
  g.location = { protocol: 'file:', search: '', href: 'file:///reverse_abyss/index.html' };
  g.confirm = () => true;                       // 自检里默认选"是"(要测"否"的自己覆盖)
  g.devicePixelRatio = 2;                       // 故意用 2,好让高分屏的换算问题暴露出来
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => { };
  g.performance = g.performance || { now: () => Date.now() };
  makeEmitter(g);                               // window:事件也能手动派发
  g.__RA_CANVAS__ = gameCanvas;

  // ---- 关卡编辑器要用的那些浏览器 API ----
  // Node 里有些全局是只读的 getter(navigator / localStorage),得用 defineProperty
  const defineGlobal = (name, value) => {
    try { g[name] = value; return true; } catch (e) { /* 只读,换下面那条路 */ }
    try {
      Object.defineProperty(g, name, { value, configurable: true, writable: true });
      return true;
    } catch (e) { return false; }
  };

  // localStorage / sessionStorage:内存版
  const store = {};
  defineGlobal('localStorage', {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach((k) => delete store[k]); },
    __data: store
  });
  const sstore = {};
  defineGlobal('sessionStorage', {
    getItem(k) { return Object.prototype.hasOwnProperty.call(sstore, k) ? sstore[k] : null; },
    setItem(k, v) { sstore[k] = String(v); },
    removeItem(k) { delete sstore[k]; },
    clear() { Object.keys(sstore).forEach((k) => delete sstore[k]); },
    __data: sstore
  });
  // Blob / URL.createObjectURL:把"下载"的内容记下来,自检里能看
  g.__RA_BLOBS__ = [];
  defineGlobal('Blob', function (parts, opts) {
    this.parts = parts || [];
    this.type = (opts && opts.type) || '';
    this.text = this.parts.join('');
  });
  if (!g.URL) defineGlobal('URL', {});
  if (g.URL) {
    g.URL.createObjectURL = (blob) => {
      g.__RA_BLOBS__.push(blob);
      return 'blob:fake/' + (g.__RA_BLOBS__.length - 1);
    };
    g.URL.revokeObjectURL = () => { };
  }
  // navigator.clipboard:记下复制的内容
  g.__RA_CLIPBOARD__ = [];
  const clipboard = {
    writeText(text) {
      g.__RA_CLIPBOARD__.push(String(text));
      return Promise.resolve();
    }
  };
  if (!g.navigator) defineGlobal('navigator', { clipboard });
  else if (!g.navigator.clipboard) {
    try { Object.defineProperty(g.navigator, 'clipboard', { value: clipboard, configurable: true }); }
    catch (e) { defineGlobal('navigator', { clipboard }); }
  }
  // FileReader:自检里几乎用不到,给个空壳免得报错
  if (!g.FileReader) {
    defineGlobal('FileReader', function () { this.readAsText = () => { }; });
  }
}

/**
 * 装好 DOM 替身,按顺序跑一遍引擎脚本,返回 globalThis.RA。
 * opts.canvas 可以指定自己的 canvas 替身。
 */
export function loadEngine(opts = {}) {
  installDom();
  if (opts.canvas) globalThis.__RA_CANVAS__ = opts.canvas;
  if (!globalThis.RA || opts.reload) {
    globalThis.RA = opts.reload ? {} : (globalThis.RA || {});
    for (const rel of ENGINE) {
      const code = readFileSync(join(ROOT, rel), 'utf8');
      vm.runInThisContext(code, { filename: rel });
    }
  }
  globalThis.RA.__canvas = globalThis.__RA_CANVAS__;
  return globalThis.RA;
}

/** 在已装好的 DOM/引擎上下文里加载 B3 平台适配(测试用) */
export function loadPlatform() {
  for (const rel of PLATFORM) {
    const code = readFileSync(join(ROOT, rel), 'utf8');
    vm.runInThisContext(code, { filename: rel });
  }
  return globalThis.RA;
}

/** 内嵌的关卡数据 → 关卡池 */
export function buildPack(RA, extra) {
  const src = Object.assign({}, RA.LEVEL_DATA || {}, extra || {});
  return RA.LevelPack.build(src);
}

/** 编辑器页面的脚本 = 引擎 + js/editor.js(顺序和 editor.html 里一致) */
export const EDITOR_SCRIPTS = ENGINE.concat(['js/editor.js']);

/** 试玩页面的脚本 = 引擎 + js/playtest.js(顺序和 play.html 里一致) */
export const PLAYTEST_SCRIPTS = ENGINE.concat(['js/playtest.js']);

/** 开发试玩页 = 引擎 + js/devplay.js(顺序和 devplay.html 一致) */
export const DEVPLAY_SCRIPTS = ENGINE.concat(['js/devplay.js']);

/** B3 平台适配(短塔页面加载;核心引擎不依赖 Capacitor/DOM) */
export const PLATFORM = [
  'js/platform/action-input.js',
  'js/platform/control-layout.js',
  'js/platform/files.js',
  'js/platform/lifecycle.js'
];

/** PC/安卓短塔 = 引擎 + 平台适配 + js/short.js */
export const SHORT_SCRIPTS = ENGINE.concat(PLATFORM, ['js/short.js']);

/** 标准试玩 = 引擎 + js/standard.js */
export const STANDARD_SCRIPTS = ENGINE.concat(['js/standard.js']);

/**
 * 额外把关卡编辑器也装进来(自检编辑器用)。
 * 会把 RA_EDITOR_NO_BOOT 打开,免得 editor.js 自己就去起一个界面 —— 自检里
 * 我们要拿自己的 canvas 手动 new 一个。
 */
export function loadEditor(opts = {}) {
  globalThis.RA_EDITOR_NO_BOOT = true;
  const RA = loadEngine(opts);
  if (!RA.Editor) {
    const code = readFileSync(join(ROOT, 'js/editor.js'), 'utf8');
    vm.runInThisContext(code, { filename: 'js/editor.js' });
  }
  return RA;
}

/**
 * 额外把试玩页(js/playtest.js)也装进来。它和编辑器是一对:编辑器负责开这个页面,
 * 页面负责把这一层玩起来 —— 自检里两头都要能单独走一遍。
 */
export function loadPlaytest(opts = {}) {
  globalThis.RA_PLAYTEST_NO_BOOT = true;
  const RA = loadEngine(opts);
  if (!RA.Playtest) {
    const code = readFileSync(join(ROOT, 'js/playtest.js'), 'utf8');
    vm.runInThisContext(code, { filename: 'js/playtest.js' });
  }
  return RA;
}
