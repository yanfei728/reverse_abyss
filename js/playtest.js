/* -*- coding: utf-8 -*- */
/*
 * playtest.js —— 编辑器「试玩」页:在新标签页里玩编辑器里的那一层
 * ==========================================================
 * 为什么单独开一页:
 *   · 编辑器页面上有原生 HTML 控件、画布只画地图,塞不下一个"真游戏"的全屏画面;
 *   · 新标签页里可以铺满窗口玩,玩完关掉它就等于"回编辑器",原来那一页一点没变。
 *
 * 这一层从哪儿来(按顺序试,哪个通用哪个):
 *   ① window.opener.RA.editor.playTests[i]  —— 编辑器开这个标签页时现取的,最直接;
 *   ② sessionStorage['reverse_abyss.playtest'] —— 跨窗口的兜底;
 *   ③ localStorage 里同一把钥匙 —— 再兜一层。
 * 所以就算外面那一页已经关掉了,刷新这个试玩页照样能接着玩(`?i=0&t=…`)。
 *
 * 玩的内容:
 *   就是引擎本体 —— 真物理、真手感、真贴图。走到「上一层」的出口算通关。
 *   结束(通关 / 中途按 Esc)之后给两个选择:重新开始、回编辑器(关掉本页)。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var W = C.WIDTH, H = C.HEIGHT;
  var LS_KEY = 'reverse_abyss.playtest';         // 兜底存的那一份(不进关卡池)

  /** 从 URL 上取一个参数(不支持 URLSearchParams 的老环境就手抠) */
  function query(name) {
    var loc = globalThis.location || {};
    var s = String(loc.search || '');
    if (!s || s.length < 2) return '';
    if (typeof globalThis.URLSearchParams === 'function') {
      try { return new globalThis.URLSearchParams(s).get(name) || ''; } catch (e) { /* 手抠 */ }
    }
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(s);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  function storage(kind) {
    try {
      var s = globalThis[kind];
      if (s) { s.getItem(LS_KEY); return s; }    // 试探一下(某些环境直接抛)
    } catch (e) { /* 用不了 */ }
    return null;
  }

  /**
   * 这一层是谁:优先问开着我们的编辑器页,再退到 sessionStorage / localStorage。
   * 拿不到就返回 {id:'', name:'', text:''} —— 页面会画一句"没拿到关卡"。
   */
  function resolveStage(index) {
    var id = index === undefined || index === null ? '' : String(index);
    var op = globalThis.opener;
    if (op && op !== globalThis) {
      try {
        var arr = op.RA && op.RA.editor && op.RA.editor.playTests;
        var hit = arr && arr[parseInt(id, 10) || 0];
        if (hit && hit.text) return { id: id, name: hit.name || '', text: hit.text };
      } catch (e) { /* 跨窗口读不到(有些浏览器 file:// 下会拦)→ 走下面的兜底 */ }
    }
    var raw = null;
    var s = storage('sessionStorage') || storage('localStorage');
    if (s) {
      try { raw = JSON.parse(s.getItem(LS_KEY) || 'null'); } catch (e) { raw = null; }
    }
    if (raw && typeof raw === 'object') {
      if (raw.text) return { id: id, name: raw.name || '', text: raw.text };
      var entry = raw[parseInt(id, 10) || 0];     // 也支持 {0:{name,text}} 这种
      if (entry && entry.text) return { id: id, name: entry.name || '', text: entry.text };
    }
    return { id: id, name: '', text: '' };
  }

  /** 「回编辑器」:外面那一页还在就把它拉到前面,然后关掉自己 */
  function backToEditor() {
    var op = null;
    try { op = globalThis.opener; } catch (e) { op = null; }
    var closed = false;
    try {
      if (typeof globalThis.close === 'function') {
        globalThis.close();
        closed = !!globalThis.closed;
      }
    } catch (e) { /* 关不掉 */ }
    if (closed) return true;
    // 关不掉(不是脚本开的标签页):把原页面拉到前面,让用户自己关这一页
    try {
      if (op && op !== globalThis && typeof op.focus === 'function') {
        op.focus();
        return true;
      }
    } catch (e) { /* 跨窗口 focus 也可能被拦 */ }
    return false;
  }

  class Playtest {
    /**
     * opts: {text, name, index, canvas}
     *   text 不给就自己去 opener / sessionStorage 里找。
     */
    constructor(opts) {
      opts = opts || {};
      this.canvas = opts.canvas || this.findCanvas();
      if (!this.canvas || !this.canvas.getContext) throw new Error('找不到 <canvas id="game">');
      this.ctx = this.canvas.getContext('2d');
      this.sizeCanvas();

      this.assets = new RA.Assets();
      this.snd = new RA.SoundBank();
      this.input = new RA.Input(this.canvas);
      this.input.onFirstInput = () => { this.snd.resume(); };
      if (globalThis.document && globalThis.document.addEventListener) {
        this.input.attach(globalThis, globalThis.document);
      }
      this.prevCodes = {};

      this.index = opts.index === undefined || opts.index === null ? query('i') : opts.index;
      var stage = (opts.text === undefined || opts.text === null)
        ? resolveStage(this.index)
        : { text: opts.text, name: opts.name || '', id: this.index };
      this.stage = stage;
      this.text = stage.text || '';
      this.name = stage.name || '';
      this.fail = '';
      this.won = false;
      this.menu = false;
      this.forcedBack = false;                 // 浏览器不让关标签页时给的提示
      this.level = null;
      this.player = null;
      this.camera = null;

      this.build();
      // 切到别的标签页再回来时别把积攒的时间一次性算掉(也顺便清掉按键状态)
      var self = this;
      if (globalThis.addEventListener) {
        globalThis.addEventListener('blur', function () { self.prevCodes = {}; });
      }
      if (globalThis.requestAnimationFrame) {
        var last = null;
        var frame = function (now) {
          if (last === null) last = now;
          var dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          RA.time = (RA.time || 0) + dt;
          self.update(dt);
          self.draw();
          self.input.endFrame();
          globalThis.requestAnimationFrame(frame);
        };
        globalThis.requestAnimationFrame(frame);
      }
    }

    findCanvas() {
      var doc = globalThis.document;
      return doc && doc.getElementById ? doc.getElementById('game') : null;
    }

    /** 画布按窗口大小和 devicePixelRatio 定尺寸(和编辑器同一套做法) */
    sizeCanvas() {
      var dpr = globalThis.devicePixelRatio || 1;
      var cw = this.canvas.clientWidth || 0;
      var ch = this.canvas.clientHeight || 0;
      var rw = globalThis.innerWidth || 0, rh = globalThis.innerHeight || 0;
      var aspect = W / H;
      if (rw && rh) {
        // 窗口里等比放进一个 16:9 的画面;元素还没排版好(clientWidth = 0)时也适用
        cw = Math.min(rw, rh * aspect);
        ch = cw / aspect;
      } else {
        if (!cw) cw = W;
        if (!ch) ch = H;
      }
      var w = Math.round(cw * dpr), h = Math.round(ch * dpr);
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
      this.W = w;
      this.H = h;
      this.ctx.imageSmoothingEnabled = false;
    }

    /** 把这一层的文本变成可以玩的关卡(重开也走这里) */
    build() {
      this.won = false;
      this.menu = false;
      this.forcedBack = false;
      this.level = null;
      this.player = null;
      this.camera = null;
      if (!String(this.text || '').trim()) {
        this.fail = '没拿到关卡内容 —— 请从编辑器里点「▶ 试玩」打开这个页面。';
        return false;
      }
      var lv;
      try {
        lv = RA.Level.fromText(this.text, { fallbackName: this.name || '编辑器试玩', source: '编辑器' });
      } catch (e) {
        this.fail = '这一层读不出来:' + ((e && e.message) || e);
        return false;
      }
      if (!lv.rows || !lv.cols) {
        this.fail = '这一层是空的 —— 回去画点地形再来试玩。';
        return false;
      }
      lv.entities.forEach((e) => e.loadSprites(this.assets));
      var p = new RA.Player(lv);
      p.loadSprites(this.assets);
      var cam = new RA.Camera(lv, this.W, this.H);
      cam.snapTo(p);
      this.level = lv;
      this.player = p;
      this.camera = cam;
      this.name = lv.name || this.name;
      this.fail = '';
      return true;
    }

    /** 重新开始:同一份文本重新建一遍关卡和角色 */
    restart() {
      this.build();
      this.snd.play('jump');
      return !!this.level;
    }

    // ================= 每帧 =================
    update(dt) {
      var inp = this.input;
      var just = (code) => !!inp.codes[code] && !this.prevCodes[code];
      var lv = this.level;

      if (this.menu) {
        this.updateMenu();
      } else if (lv) {
        lv.entities.forEach((e) => e.update(dt, { player: this.player, snd: this.snd }));
        this.player.update(dt, inp.down, { player: this.player, snd: this.snd });
        // 掉出世界 → 回本层起点(正式爬塔里这也只是一次"坠落")
        if (this.player.y > lv.worldH + C.FALL_MARGIN) {
          this.player.reset();
          this.camera.snapTo(this.player);
          this.snd.play('land');
        }
        this.camera.update(dt, this.player);
        if (!this.won && lv.win(this.player)) {
          this.won = true;
          this.menu = true;
          this.snd.play('floor');
        } else if (inp.pressed('back')) {
          this.menu = true;                       // 中途按 Esc:也进结束面板(可以继续)
        }
      } else if (inp.pressed('back')) {
        this.forcedBack = !backToEditor();        // 没关卡可玩时,Esc 就是"回编辑器"
      }

      this.prevCodes = Object.assign({}, inp.codes);
    }

    /** 结束面板:重新开始 / 继续玩(没通关才有)/ 回编辑器 */
    updateMenu() {
      var L = this.layout();
      var inp = this.input;
      if (inp.pressed('confirm') || inp.clickedIn(L.again)) { this.restart(); return; }
      if (!this.won && L.cont && inp.clickedIn(L.cont)) { this.menu = false; return; }
      if (inp.pressed('back') || inp.clickedIn(L.back)) {
        this.forcedBack = !backToEditor();
        if (this.forcedBack) this.menu = false;   // 关不掉就回画面,顺便提示一句
      }
    }

    openerAlive() {
      try {
        var op = globalThis.opener;
        return !!(op && op !== globalThis && !op.closed);
      } catch (e) { return false; }
    }

    layout() {
      var cx = this.W / 2, cy = this.H / 2;
      var bw = Math.min(320, Math.max(200, this.W * 0.38));
      var bh = Math.max(42, Math.round(this.H * 0.09));
      var gap = 14;
      var n = this.won ? 2 : 3;
      var totalH = n * bh + (n - 1) * gap;
      var y0 = cy - totalH / 2 + 12;
      var out = {
        panel: { x: cx - Math.min(380, this.W * 0.46), y: cy - totalH / 2 - 76,
          w: Math.min(760, this.W * 0.92), h: totalH + 150 },
        again: { x: cx - bw / 2, y: y0, w: bw, h: bh }
      };
      var y = y0 + bh + gap;
      if (!this.won) { out.cont = { x: out.again.x, y: y, w: bw, h: bh }; y += bh + gap; }
      out.back = { x: out.again.x, y: y, w: bw, h: bh };
      out.quit = out.back;
      return out;
    }

    // ================= 绘制 =================
    draw() {
      var ctx = this.ctx;
      RA.rect(ctx, 0, 0, this.W, this.H, [13, 15, 24]);
      if (this.fail) { this.drawFail(ctx); return; }

      var lv = this.level;
      RA.UI.drawBackground(ctx, lv.sky || 1, this.W, this.H);
      lv.draw(ctx, this.camera, this.assets);
      lv.drawDecor(ctx, this.camera);
      lv.entities.forEach((e) => e.draw(ctx, this.camera, this.assets));
      if (this.player) this.player.draw(ctx, this.camera, this.assets);

      RA.chip(ctx, '试玩 · ' + (this.name || '未命名楼层') + (this.won ? '   ✔ 已通关' : ''),
        [12, 12], { size: 15 });
      // 操作提示画在右上角(页面上不放 HTML 提示,免得和画面压在一起)
      if (!this.menu) {
        RA.chip(ctx, '←→ / A D 移动   Space 跳   Esc 结束', [this.W - 12, 12],
          { size: 13, alpha: 0.4, anchor: 'topright' });
      }
      if (this.forcedBack) {
        RA.chip(ctx, '浏览器不让网页关标签页 —— 自己关掉这一页就回编辑器了',
          [12, this.H - 76], { size: 13, alpha: 0.8, color: [255, 210, 150] });
      }
      if (this.menu) this.drawMenu(ctx);
    }

    drawMenu(ctx) {
      var L = this.layout();
      var inp = this.input;
      RA.UI.shade(ctx, 0.58);
      RA.UI.panel(ctx, L.panel, '');
      var cx = L.panel.x + L.panel.w / 2;
      RA.text(ctx, this.won ? '通 关 !' : '结 束', 30,
        this.won ? [150, 240, 180] : C.ACCENT, cx, L.panel.y + 44, { bold: true });
      RA.text(ctx, '编辑器试玩页面 · ' + (this.name || '未命名楼层'), 13, C.INK_DIM,
        cx, L.panel.y + 74);
      RA.UI.button(ctx, L.again, '重 新 开 始  (Enter)',
        { hover: inp.hovering(L.again), size: 19 });
      if (L.cont) {
        RA.UI.button(ctx, L.cont, '继 续 玩',
          { hover: inp.hovering(L.cont), size: 17, alpha: 0.85 });
      }
      RA.UI.button(ctx, L.back, '回 编 辑 器  (关掉本页)',
        { hover: inp.hovering(L.back), size: 19 });
      RA.text(ctx, this.won ? '走到出口了 —— 再玩一次,还是回编辑器接着改?'
        : '还没走到出口 —— 继续玩,还是回编辑器接着改?',
        12.5, C.INK_DIM, cx, L.back.y + L.back.h + (L.cont ? 14 : 36), {});
    }

    drawFail(ctx) {
      RA.text(ctx, '试玩页', 26, C.ACCENT, this.W / 2, this.H / 2 - 40, { bold: true });
      RA.text(ctx, this.fail || '这一层读不出来', 15, C.INK, this.W / 2, this.H / 2, {});
      RA.text(ctx, '回编辑器改一改,再点一次「▶ 试玩」', 13, C.INK_DIM, this.W / 2,
        this.H / 2 + 32);
    }
  }

  RA.Playtest = Playtest;
  RA.PlaytestStage = resolveStage;
  RA.PLAYTEST_KEY = LS_KEY;

  /** 页面加载完自己起来(自检里可以设 window.RA_PLAYTEST_NO_BOOT = true 拦掉) */
  function boot() {
    if (globalThis.RA_PLAYTEST_NO_BOOT) return null;
    try {
      RA.play = new Playtest();
      globalThis.RA_PLAYTEST_READY = true;
      return RA.play;
    } catch (e) {
      var doc = globalThis.document;
      var st = doc && doc.getElementById ? doc.getElementById('status') : null;
      if (st) st.textContent = '试玩页起不来:' + (e && e.message);
      if (globalThis.console) globalThis.console.error(e);
      return null;
    }
  }

  RA.PlaytestBoot = boot;
  if (!globalThis.RA_PLAYTEST_NO_BOOT) {
    if (globalThis.document && globalThis.document.readyState === 'loading') {
      globalThis.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(globalThis.RA = globalThis.RA || {});
