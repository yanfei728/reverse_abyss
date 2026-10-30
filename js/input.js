/* -*- coding: utf-8 -*- */
/*
 * input.js —— 键盘 / 鼠标输入
 * ============================
 * abyss 里角色直接读 pygame 的按键序列;网页这边把按键先翻译成**动作**,
 * 这样"跳跃"这种动作同时绑 Space / W / ↑ 就只在下面这张表里写一遍。
 *
 * 给游戏用的东西:
 *   input.down.left / .right / .jump   按住状态(角色物理读这个)
 *   input.pressed('reroll')            这一帧刚按下的动作(菜单读这个)
 *   input.clicks                       这一帧的点击 [{x,y}](画布坐标)
 *   input.mouse                        {x,y}
 *   input.typed / input.backspace      种子输入框用的字符
 *
 * 每帧末尾由主循环调 input.endFrame() 把"这一帧的边沿"清掉。
 */
(function (RA) {
  'use strict';

  // 动作 → 键码(e.code)。要加键位就改这里。
  var ACTIONS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump: ['Space', 'KeyW', 'ArrowUp'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    confirm: ['Enter', 'NumpadEnter', 'Space'],
    reroll: ['KeyR'],
    mirror: ['KeyM'],
    importer: ['KeyI'],
    editor: ['KeyE'],
    back: ['Escape'],
    tab: ['Tab']
  };
  var HELD = ['left', 'right', 'jump'];      // 这些动作要维护"按住"状态

  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.codes = {};          // e.code → 按住
      this.edge = {};           // 动作 → 这一帧刚按下
      this.down = { left: false, right: false, jump: false };
      this.mouse = { x: 0, y: 0 };
      this.clicks = [];
      this.buttons = {};        // 鼠标键 → 是否按住(0 左 / 1 中 / 2 右),关卡编辑器要用
      this.wheel = 0;           // 这一帧滚轮累计
      this.typed = '';
      this.backspace = 0;
      this.textMode = false;    // 种子输入框激活时,字母键不再当快捷键
      this.onFirstInput = null;
      this._touched = false;
    }

    /** 把监听挂到 window(键盘)和 canvas(鼠标)上 */
    attach(win, doc) {
      var self = this;
      this._win = win || globalThis;
      this._doc = doc || globalThis.document;

      this._win.addEventListener('keydown', function (e) { self._key(e, true); });
      this._win.addEventListener('keyup', function (e) { self._key(e, false); });
      this._win.addEventListener('blur', function () {
        self.codes = {};
        self.buttons = {};
        self._syncHeld();
      });
      // 鼠标松开可能发生在画布外面,所以挂在 window 上
      this._win.addEventListener('mouseup', function (e) { self.buttons[e.button] = false; });

      if (this.canvas) {
        this.canvas.addEventListener('mousemove', function (e) {
          self.mouse = self._pos(e);
          self.mouse.outside = false;
        });
        this.canvas.addEventListener('mousedown', function (e) {
          self.buttons[e.button] = true;
          var p = self._pos(e);
          self.mouse = p;
          self.mouse.outside = false;
          if (e.button === 0) self.clicks.push(p);
          self._touch();
        });
        this.canvas.addEventListener('mouseleave', function () {
          if (self.mouse) self.mouse.outside = true;
        });
        this.canvas.addEventListener('wheel', function (e) {
          self.wheel += e.deltaY;
          if (e.preventDefault) e.preventDefault();
        }, { passive: false });
        this.canvas.addEventListener('contextmenu', function (e) {
          if (e.preventDefault) e.preventDefault();      // 右键用来平移,别弹菜单
        });
        // 触屏:点一下 = 点一下鼠标(菜单能用,移动还是得键盘)
        this.canvas.addEventListener('touchstart', function (e) {
          if (e.touches && e.touches.length) {
            var p = self._pos(e.touches[0]);
            self.clicks.push(p);
            self.mouse = p;
            e.preventDefault();
          }
          self._touch();
        }, { passive: false });
      }
      return this;
    }

    // ---------- 查询 ----------
    pressed(action) {
      return !!this.edge[action];
    }

    /** 这一帧有没有点在 rect 里 */
    clickedIn(rect) {
      for (var i = 0; i < this.clicks.length; i++) {
        var c = this.clicks[i];
        if (c.x >= rect.x && c.x <= rect.x + rect.w && c.y >= rect.y && c.y <= rect.y + rect.h) {
          return true;
        }
      }
      return false;
    }

    /** 鼠标是不是悬在 rect 上(给按钮做高亮) */
    hovering(rect) {
      var m = this.mouse;
      return m.x >= rect.x && m.x <= rect.x + rect.w &&
        m.y >= rect.y && m.y <= rect.y + rect.h;
    }

    /** 每帧末尾清掉边沿信息 */
    endFrame() {
      this.edge = {};
      this.clicks = [];
      this.typed = '';
      this.backspace = 0;
      this.wheel = 0;
    }

    // ---------- 内部 ----------
    _key(e, isDown) {
      var code = e.code || '';
      if (isDown) {
        if (code === 'Space' || code.indexOf('Arrow') === 0 || code === 'Tab' ||
          ((e.ctrlKey || e.metaKey) && code === 'KeyS')) {
          if (e.preventDefault) e.preventDefault();       // Ctrl+S 在编辑器里是"下载 txt"
        }
        // 输入框激活时:只收能被种子用的字符,不触发快捷键
        if (this.textMode) {
          if (e.key === 'Backspace') {
            this.backspace++;
          } else if (e.key && e.key.length === 1 && /[0-9a-zA-Z-]/.test(e.key)) {
            this.typed += e.key;
          }
          if (code !== 'Enter' && code !== 'NumpadEnter' && code !== 'Escape' &&
            code !== 'Backspace') {
            this._touch();
            return;
          }
        }
        if (e.repeat) { this._touch(); return; }
        if (!this.codes[code]) {
          this.codes[code] = true;
          this._edgesFor(code);
          this._syncHeld();
        }
      } else {
        this.codes[code] = false;
        this._syncHeld();
      }
      this._touch();
    }

    _edgesFor(code) {
      var self = this;
      Object.keys(ACTIONS).forEach(function (action) {
        if (ACTIONS[action].indexOf(code) >= 0) self.edge[action] = true;
      });
    }

    _syncHeld() {
      var self = this, codes = this.codes;
      HELD.forEach(function (action) {
        self.down[action] = ACTIONS[action].some(function (code) { return !!codes[code]; });
      });
    }

    _pos(e) {
      var x = e.clientX === undefined ? 0 : e.clientX;
      var y = e.clientY === undefined ? 0 : e.clientY;
      var rect = this.canvas && this.canvas.getBoundingClientRect
        ? this.canvas.getBoundingClientRect()
        : null;
      if (rect && rect.width) {
        var sx = this.canvas.width / rect.width;
        var sy = this.canvas.height / rect.height;
        return { x: (x - rect.left) * sx, y: (y - rect.top) * sy };
      }
      return { x: x, y: y };
    }

    _touch() {
      if (this._touched) return;
      this._touched = true;
      if (this.onFirstInput) {
        try { this.onFirstInput(); } catch (e) { /* 忽略 */ }
      }
    }
  }

  RA.Input = Input;
})(globalThis.RA = globalThis.RA || {});
