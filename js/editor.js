/* -*- coding: utf-8 -*- */
/*
 * editor.js —— 关卡编辑器
 * ========================
 * 画出 reverse_abyss 的一层塔,试玩它、下载成 txt、或者"保存到游戏"。
 * 页面最上面就三个出口:
 *   ▶ 试玩      —— 新标签页里用真引擎玩这一层(play.html),玩完重来或回编辑器
 *   下载 txt    —— 把这一层存成 txt 文件(文件动了,游戏里的关卡池不动)
 *   保存到游戏  —— 写进 levels/ 文件夹 + 把浏览器里的关卡池也换成新的
 *
 * 三条设计原则:
 *   ① 地物表**从引擎推导**,不在这里写死:
 *        · 地块 ← level.js 的 TILE_IMAGES(现在 5 种;画的时候和游戏一样缩放到一格)
 *        · 地物 ← entities/ 的 BY_LETTER 注册表(现在出口 G、弹簧板 S)
 *        · 起点 ← level.js 的 SPAWN_CHARS(现在 P)
 *      所以以后往引擎里加一种地块 / 一个新实体,编辑器里**自动就有**它的笔刷
 *      (图标默认画成带字符的方块,实体可以自己写 drawIcon 画好看点)。
 *   ② 大小不限:画到界外会自动把地图撑大(可以关),也能直接填宽高;
 *      **高度完全不设上限**(向上爬的塔,想画多高画多高,几十万行也行),
 *      宽度留了个安全上限 C.EDITOR_MAX_COLS —— 再宽就不是竖井,是壁纸了。
 *   ③ 必须画起点和出口:没画全就不给试玩 / 不给存,检查面板会盯着你。
 *      新建的层还要有个名字(它同时是 txt 文件名),老关卡沿用原来的名字就行。
 *
 * 页面结构(editor.html)分三块:左边地物+工具、中间画布、右边关卡+检查。
 * 画布只负责画地图,所有输入框 / 按钮都是原生 HTML —— 中文关卡名能用输入法打。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var AIR = RA.EMPTY_CHARS[0];                 // '+'
  var TS = C.TS;
  var MAX_COLS = C.EDITOR_MAX_COLS || 600;     // 宽度上限(格)
  var MAX_ROWS = C.EDITOR_MAX_ROWS === undefined ? 0 : C.EDITOR_MAX_ROWS;  // 0 = 高度不限

  /** 宽度 / 高度各自夹一下(高度默认不限,所以 0 表示"随便") */
  function capCols(n) { return RA.clamp(Math.round(n) || 1, 1, MAX_COLS); }
  function capRows(n) {
    var v = Math.max(1, Math.round(n) || 1);
    return MAX_ROWS > 0 ? Math.min(v, MAX_ROWS) : v;
  }
  function rowLimit() { return MAX_ROWS > 0 ? MAX_ROWS : Infinity; }
  function limitText() {
    return MAX_ROWS > 0
      ? ('宽最多 ' + MAX_COLS + ' 格、高最多 ' + MAX_ROWS + ' 格')
      : ('宽最多 ' + MAX_COLS + ' 格、高度不限');
  }

  // ===================== 工具 =====================
  var TOOLS = [
    { id: 'brush', name: '画笔', key: 'KeyB', hint: '按住左键拖动连续画' },
    { id: 'erase', name: '橡皮', key: 'KeyE', hint: '把地物擦成空气' },
    { id: 'rect', name: '矩形', key: 'KeyR', hint: '拖一个方框,松手填满' },
    { id: 'fill', name: '油漆桶', key: 'KeyF', hint: '点一下,把连成一片的同种地物换掉' },
    { id: 'pick', name: '吸管', key: 'KeyK', hint: '点一下取走那格的地物' }
  ];

  /** 缩得很小的时候,地块用近似色画(新地块没写也有个颜色,不会看不见) */
  var TILE_COLORS = {
    '^': [112, 186, 92], '_': [170, 132, 102], '~': [172, 100, 80],
    '=': [150, 154, 164], '-': [222, 234, 250]
  };

  function hashColor(ch) {
    var h = (String(ch).charCodeAt(0) * 47) % 360;
    return 'hsl(' + h + ',45%,58%)';
  }

  function tileColor(ch) {
    var c = TILE_COLORS[ch];
    return c ? RA.rgba(c) : hashColor(ch);
  }

  // ===================== 地物调色板(从引擎推导) =====================
  var EditorPalette = {
    /** 返回全部可画的"笔刷":空气 + 地块 + 起点标记 + 所有注册的地物 */
    build: function () {
      var out = [];
      out.push({ ch: AIR, name: '空气(橡皮)', kind: 'air' });
      Object.keys(RA.TILE_IMAGES).forEach(function (ch) {
        out.push({
          ch: ch, name: RA.TILE_IMAGES[ch][1], kind: 'tile',
          image: RA.TILE_IMAGES[ch][0]
        });
      });
      RA.SPAWN_CHARS.split('').forEach(function (ch) {
        out.push({ ch: ch, name: '出生点(必须画一个)', kind: 'spawn' });
      });
      Object.keys(RA.BY_LETTER).forEach(function (ch) {
        var cls = RA.BY_LETTER[ch];
        out.push({
          ch: ch, cls: cls, kind: 'entity',
          name: (cls.NAME || cls.name || ch) + '(' + ch + ')'
        });
      });
      return out;
    },

    /** 这个字符是不是"能画的东西"(用来判断文件里有没有不认识的字) */
    known: function (ch) {
      if (ch === AIR || ch === ' ') return true;
      if (RA.SOLID_CHARS.indexOf(ch) >= 0) return true;
      if (RA.ONEWAY_CHARS.indexOf(ch) >= 0) return true;     // 单向云板也是能画的地块
      if (RA.SPAWN_CHARS.indexOf(ch) >= 0) return true;
      return !!RA.BY_LETTER[ch];
    }
  };

  // ===================== 关卡数据(纯逻辑,不开浏览器也能测) =====================
  class EditorModel {
    constructor(cols, rows, name) {
      this.cols = capCols(cols || 15);
      this.rows = capRows(rows || 24);
      this.name = name || '新楼层';
      this.header = [];                       // 原来文件里的 // 注释行(导出时原样放回)
      this.cells = [];
      for (var r = 0; r < this.rows; r++) {
        this.cells.push(new Array(this.cols).fill(AIR));
      }
    }

    static fromText(text, fallbackName) {
      var header = [], body = [];
      String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
        .forEach(function (raw) {
          var line = raw.replace(/\s+$/, '');
          if (line.replace(/^\s+/, '').indexOf('//') === 0) { header.push(line); return; }
          body.push(line);
        });
      while (body.length && !body[0].trim()) body.shift();
      while (body.length && !body[body.length - 1].trim()) body.pop();
      var width = body.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
      width = capCols(width || 1);
      var rows = capRows(body.length || 1);
      var m = new EditorModel(width, rows, RA.LevelPack.levelName(text, fallbackName));
      m.header = header;
      for (var r = 0; r < rows; r++) {
        var line = (body[r] || '').padEnd(width, ' ');
        for (var c = 0; c < width; c++) {
          var ch = line[c];
          if (ch === ' ' || ch === AIR) m.cells[r][c] = AIR;
          else if (ch === RA.LEGACY_EMPTY) m.cells[r][c] = AIR;   // 老地图的 '.' 也当空气
          else m.cells[r][c] = ch;
        }
      }
      return m;
    }

    // ---------- 基本读写 ----------
    inBounds(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }

    get(c, r) { return this.inBounds(c, r) ? this.cells[r][c] : AIR; }

    set(c, r, ch) {
      if (!this.inBounds(c, r)) return false;
      this.cells[r][c] = ch;
      return true;
    }

    /** 想画到界外时先把地图撑大(关掉自动扩展时返回 false) */
    ensure(c, r) {
      var left = c < 0 ? -c : 0;
      var top = r < 0 ? -r : 0;
      var right = Math.max(0, c + 1 - this.cols);
      var bottom = Math.max(0, r + 1 - this.rows);
      if (!left && !right && !top && !bottom) return true;
      return this.grow(left, right, top, bottom);
    }

    grow(left, right, top, bottom) {
      var nc = this.cols + left + right;
      var nr = this.rows + top + bottom;
      if (nc < 1 || nr < 1 || nc > MAX_COLS || nr > rowLimit()) return false;
      var next = [];
      for (var r = 0; r < nr; r++) next.push(new Array(nc).fill(AIR));
      for (r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) next[r + top][c + left] = this.cells[r][c];
      }
      this.cells = next;
      this.cols = nc;
      this.rows = nr;
      return true;
    }

    /** 直接改尺寸(缩小会把外面的内容裁掉) */
    setSize(cols, rows) {
      var nc = capCols(cols);
      var nr = capRows(rows);
      if (nc === this.cols && nr === this.rows) return false;
      var next = [];
      for (var r = 0; r < nr; r++) {
        var row = new Array(nc).fill(AIR);
        for (var c = 0; c < nc; c++) {
          if (r < this.rows && c < this.cols) row[c] = this.cells[r][c];
        }
        next.push(row);
      }
      this.cells = next;
      this.cols = nc;
      this.rows = nr;
      return true;
    }

    fillRect(c0, r0, c1, r1, ch) {
      var a = Math.min(c0, c1), b = Math.max(c0, c1);
      var t = Math.min(r0, r1), d = Math.max(r0, r1);
      for (var r = t; r <= d; r++) {
        for (var c = a; c <= b; c++) {
          if (this.inBounds(c, r)) this.cells[r][c] = ch;
        }
      }
    }

    /** 从 (c,r) 出发把连成一片的同种地物换成 ch(四邻) */
    floodFill(c, r, ch) {
      if (!this.inBounds(c, r)) return 0;
      var from = this.cells[r][c];
      if (from === ch) return 0;
      var stack = [[c, r]], n = 0;
      while (stack.length) {
        var p = stack.pop(), x = p[0], y = p[1];
        if (!this.inBounds(x, y) || this.cells[y][x] !== from) continue;
        this.cells[y][x] = ch;
        n++;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return n;
    }

    clear(ch) {
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) this.cells[r][c] = ch || AIR;
      }
    }

    /** 某个字符都在哪(从上往下、从左往右) */
    findChar(ch) {
      var out = [];
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          if (this.cells[r][c] === ch) out.push({ c: c, r: r });
        }
      }
      return out;
    }

    /** 从 (c,r) 往下找第一块实心在第几行(没有就 null) */
    groundBelow(c, r) {
      if (c < 0 || c >= this.cols) return null;
      for (var y = Math.max(0, r); y < this.rows; y++) {
        // 单向云板也算"有地面"(起点/出口落到它上面是合理的)
        if (RA.isGroundChar(this.cells[y][c])) return y;
      }
      return null;
    }

    // ---------- 元信息(// 键: 值 那一行) ----------
    /** 读一条元信息,比如 getMeta('sky') → '3';没有就返回空串 */
    getMeta(key) {
      var re = new RegExp('^\\s*//\\s*' + key + '\\s*:\\s*(.*)$', 'i');
      for (var i = 0; i < this.header.length; i++) {
        var m = re.exec(this.header[i]);
        if (m) return m[1].trim();
      }
      return '';
    }

    /** 写一条元信息(已经有那行就改,没有就插在 // name: 后面) */
    setMeta(key, value) {
      var re = new RegExp('^\\s*//\\s*' + key + '\\s*:', 'i');
      var line = '// ' + key + ': ' + value;
      for (var i = 0; i < this.header.length; i++) {
        if (re.test(this.header[i])) { this.header[i] = line; return true; }
      }
      var at = 0;
      for (i = 0; i < this.header.length; i++) {
        if (/^\s*\/\/\s*name\s*:/i.test(this.header[i])) { at = i + 1; break; }
      }
      this.header.splice(at, 0, line);
      return true;
    }

    /** 删掉一条元信息(天空选"自动"就是这么干的) */
    removeMeta(key) {
      var re = new RegExp('^\\s*//\\s*' + key + '\\s*:', 'i');
      this.header = this.header.filter(function (l) { return !re.test(l); });
    }

    // ---------- 导出 ----------
    toText() {
      var lines = [];
      var head = this.header.slice();
      var nameIdx = -1;
      head.forEach(function (l, i) {
        if (/^\s*\/\/\s*name\s*:/i.test(l)) nameIdx = i;
      });
      if (nameIdx < 0) head.unshift('// name: ' + this.name);
      else head[nameIdx] = '// name: ' + this.name;
      head.forEach(function (l) { lines.push(l); });

      // 每行去掉尾巴上的空气;再掐掉首尾整行都是空气的行
      var rows = this.cells.map(function (row) {
        return row.join('').replace(/[+ ]+$/, '');
      });
      var top = 0, bot = rows.length - 1;
      while (top <= bot && !rows[top]) top++;
      while (bot >= top && !rows[bot]) bot--;
      rows = (top > bot) ? [] : rows.slice(top, bot + 1);
      rows.forEach(function (l) { lines.push(l); });
      return lines.join('\n') + '\n';
    }

    // ---------- 检查 ----------
    /** 返回 {errors, warnings, notes, spawns, goals, unknown, counts} */
    validate() {
      var v = {
        errors: [], warnings: [], notes: [],
        spawns: [], goals: [], unknown: [], springs: [], counts: {}
      };
      var self = this;
      // 名字是硬要求:它会写进 // name: 注释,也是 txt 文件名
      var nm = String(this.name || '').trim();
      if (!nm) {
        v.errors.push('还没给这一层起名字 —— 导出前必须起一个(会写进 // name: 注释,也是 txt 文件名)。');
      } else if (nm.length > 40) {
        v.warnings.push('名字有 ' + nm.length + ' 个字,短一点更舒服(文件名 / 关卡列表都好看)。');
      }

      // 一次扫完整张图:字符统计 / 不认识的字符 / 特殊标记的位置都在这儿收齐,
      // 免得为每种字符各扫一遍(600×600 的时候差很多)
      var special = {};
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          var ch = this.cells[r][c];
          v.counts[ch] = (v.counts[ch] || 0) + 1;
          if (!EditorPalette.known(ch)) {
            v.unknown.push({ ch: ch, c: c, r: r });
          } else if (ch !== AIR && !RA.isTileChar(ch)) {      // 不是地块的才算特殊地物
            (special[ch] || (special[ch] = [])).push({ c: c, r: r });
          }
        }
      }
      RA.SPAWN_CHARS.split('').forEach(function (ch) {
        if (special[ch]) v.spawns = v.spawns.concat(special[ch]);
      });
      Object.keys(RA.BY_LETTER).forEach(function (ch) {
        var list = special[ch] || [];
        if (RA.BY_LETTER[ch] === RA.Goal) {
          v.goals = v.goals.concat(list);
        } else if (list.length) {
          v.springs = v.springs.concat(list.map(function (p) {
            return { c: p.c, r: p.r, ch: ch };
          }));
        }
      });

      if (v.unknown.length) {
        var names = v.unknown.slice(0, 5).map(function (u) {
          return "'" + u.ch + "'(第 " + (u.r + 1) + " 行第 " + (u.c + 1) + " 列)";
        }).join('、');
        v.errors.push('有不认识的字符:' + names +
          (v.unknown.length > 5 ? ' 等 ' + v.unknown.length + ' 处' : '') +
          '。用橡皮擦掉,或者换成调色板里的地物。');
      }
      if (!v.spawns.length) {
        v.errors.push('还没画出生点 P —— 每层必须有一个,角色从那儿开始爬。');
      } else if (v.spawns.length > 1) {
        v.errors.push('画了 ' + v.spawns.length +
          ' 个起点,引擎只认第一个(从上往下、从左往右)。留一个就够了。');
      }
      if (!v.goals.length) {
        v.errors.push('还没画出出口 G —— 每层必须有一个,碰到它就往上爬一层。');
      } else if (v.goals.length > 1) {
        v.warnings.push('画了 ' + v.goals.length +
          ' 个出口,只有第一个算数(其余的画着好看,不会通到上一层)。');
      }
      if (v.spawns.length) {
        var sp = v.spawns[0];
        if (this.groundBelow(sp.c, sp.r) === null) {
          v.errors.push('起点下面没有地面 —— 角色会一直往下掉。');
        } else if (this.groundBelow(sp.c, sp.r) !== sp.r + 1) {
          v.notes.push('起点不在紧贴地面的那一格,引擎会自动让它落到下面的地面。');
        }
      }
      if (v.goals.length) {
        var g = v.goals[0];
        if (this.groundBelow(g.c, g.r) === null) {
          v.warnings.push('出口下面是空的,它会悬在半空(能碰到就算过,但不好爬上去)。');
        }
        if (v.spawns.length && g.r >= v.spawns[0].r) {
          v.warnings.push('出口在起点下面或者同一行 —— 这是"向上爬"的塔,通常出口要在上面。');
        }
      }
      v.springs.forEach(function (s) {
        if (self.groundBelow(s.c, s.r) !== s.r + 1) {
          v.warnings.push("弹簧板 '" + s.ch + "'(第 " + (s.r + 1) + ' 行第 ' + (s.c + 1) +
            ' 列)悬空了,踩不到 —— 要贴着地面那一格放。');
        }
      });

      var skyMeta = this.getMeta('sky');
      if (skyMeta) {
        var skyN = parseInt(skyMeta, 10);
        if (!(skyN >= 1 && skyN <= (C.SKY_COUNT || 8))) {
          v.warnings.push('// sky: ' + skyMeta + ' 超出范围(天空贴图一共 ' +
            (C.SKY_COUNT || 8) + ' 张),这一层会按默认循环走。');
        } else {
          v.notes.push('这一层固定用 assets/sky/sky' + skyN + '.png。');
        }
      }

      v.notes.push('地图 ' + this.cols + ' × ' + this.rows + ' 格,世界 ' +
        this.worldW() + ' × ' + this.worldH() + ' px' +
        (this.rows > 12 ? '(比屏幕高,镜头会上下跟随)' : '(一屏就放得下)') +
        (this.cols > 21 ? ',比屏幕宽,要横向滚屏' : ''));
      return v;
    }

    worldW() { return this.cols * TS; }
    worldH() { return this.rows * TS; }

    /**
     * 导出用的文件名:就是关卡名去掉不能做文件名的字符(放进 levels/ 用)。
     * 换算规则放在 RA.LevelPack.fileNameOf 里 —— 因为"这一层的文件名"和
     * "它在浏览器里那几把钥匙(custom_xxx / overrides)"必须是同一套算法,
     * 不然就会出现"同一层存了两份"的重复层。
     */
    fileName() {
      return RA.LevelPack.fileNameOf(this.name) + '.txt';
    }
  }

  /**
   * 自动起名:新楼层 1 / 新楼层 2 ……(跳过 taken 里已经用过的)。
   * 编辑器的"新建"和打开页面时的第一层都走它 —— 每层一建出来就有名字。
   */
  function autoLevelName(taken) {
    var used = {};
    (taken || []).forEach(function (n) { used[String(n || '').trim()] = true; });
    for (var i = 1; i <= 9999; i++) {
      var name = '新楼层 ' + i;
      if (!used[name]) return name;
    }
    return '新楼层';
  }

  // ===================== 写进 levels/ 文件夹 =====================
  /*
   * 网页不能自己往项目目录里写文件(浏览器安全限制)。Chromium 系的
   * File System Access API 可以让用户**授权一个文件夹**,之后就能往里面写 txt:
   *     showDirectoryPicker() → dir.getFileHandle(name, {create:true}) →
   *     handle.createWritable() → write(text) → close()
   * 授权句柄存进 IndexedDB,下次打开编辑器还记得(随时能换 / 忘掉)。
   * 没有这个 API 的浏览器(Firefox / Safari)自动退回「下载 txt」——
   * 下载下来的文件名就是关卡名,丢进 levels/ 一样用。
   */
  var IDB_DB = 'reverse_abyss.editor';
  var IDB_STORE = 'handles';
  var HANDLE_KEY = 'levelsDir';

  function idbOpen() {
    return new Promise(function (res, rej) {
      var f = globalThis.indexedDB;
      if (!f) { rej(new Error('这个环境没有 IndexedDB')); return; }
      var req = f.open(IDB_DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (db.objectStoreNames && !db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error || new Error('打不开 IndexedDB')); };
    });
  }

  function idbPut(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error || new Error('写 IndexedDB 失败')); };
      });
    });
  }

  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function () { res(req.result || null); };
        req.onerror = function () { rej(req.error || new Error('读 IndexedDB 失败')); };
      });
    });
  }

  class LevelFolder {
    constructor() {
      this.handle = null;      // 授权的目录句柄
      this.label = '';         // 界面上显示的名字(一般是 levels)
      this.lastFile = '';      // 这次会话刚写过哪个文件(改名时把旧的删掉)
    }

    /** 这个浏览器支不支持"授权一个文件夹"(Chrome / Edge 支持) */
    supported() {
      return typeof globalThis.showDirectoryPicker === 'function';
    }

    /** 让用户选文件夹(就是项目里的 levels/) */
    pick() {
      var self = this;
      if (!this.supported()) return Promise.resolve(false);
      return globalThis.showDirectoryPicker({ id: 'ra-levels', mode: 'readwrite' })
        .then(function (dir) {
          self.handle = dir;
          self.label = (dir && dir.name) || 'levels';
          self.lastFile = '';
          // 记不住也不影响这次用(有些环境不给存句柄)
          return idbPut(HANDLE_KEY, dir).then(function () { return true; })
            .catch(function () { return true; });
        })
        .catch(function () { return false; });     // 用户点了取消
    }

    /** 打开编辑器时把上次授权的文件夹找回来 */
    restore() {
      var self = this;
      if (!this.supported()) return Promise.resolve(false);
      return idbGet(HANDLE_KEY).then(function (h) {
        if (!h) return false;
        self.handle = h;
        self.label = (h && h.name) || 'levels';
        return true;
      }).catch(function () { return false; });
    }

    /** 权限还在不在(重启浏览器之后可能要再点一次"同意") */
    ensurePermission() {
      var h = this.handle;
      if (!h) return Promise.resolve(false);
      if (!h.queryPermission) return Promise.resolve(true);
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') return true;
        if (!h.requestPermission) return false;
        return h.requestPermission({ mode: 'readwrite' }).then(function (p2) {
          return p2 === 'granted';
        });
      }).catch(function () { return false; });
    }

    /** 真的写一个 txt 进去,成功返回 {dir, file, removed} */
    write(fileName, text) {
      var self = this;
      if (!this.handle) return Promise.reject(new Error('还没选 levels/ 文件夹'));
      return this.ensurePermission().then(function (ok) {
        if (!ok) throw new Error('没有这个文件夹的写权限(再点一次「选择 levels 文件夹」)');
        return self.handle.getFileHandle(fileName, { create: true });
      }).then(function (fh) {
        return fh.createWritable();
      }).then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      }).then(function () {
        var old = self.lastFile;
        self.lastFile = fileName;
        // 改过名字:把上次写的那份删掉,别在 levels/ 里留两个同名层
        if (old && old !== fileName && self.handle.removeEntry) {
          return self.handle.removeEntry(old).then(function () { }, function () { })
            .then(function () { return { dir: self.label, file: fileName, removed: old }; });
        }
        return { dir: self.label, file: fileName, removed: '' };
      });
    }

    /** 忘掉授权过的文件夹 */
    forget() {
      this.handle = null;
      this.label = '';
      this.lastFile = '';
      return idbPut(HANDLE_KEY, null).catch(function () { });
    }
  }

  // ===================== 编辑器界面 =====================
  class Editor {
    constructor(canvas) {
      this.canvas = canvas || globalThis.document.getElementById('board');
      if (!this.canvas) throw new Error('找不到 <canvas id="board">');
      this.ctx = this.canvas.getContext('2d');

      this.input = new RA.Input(this.canvas);
      this.input.attach(globalThis, globalThis.document);
      this.assets = new RA.Assets();
      this.snd = new RA.SoundBank();
      this.input.onFirstInput = () => { this.snd.resume(); };

      this.model = new EditorModel(15, 24, '新楼层');
      RA.assets = this.assets;              // 界面层画天空/背景时要用

      this.view = { x: 0, y: 0, zoom: 1 };
      this.tool = 'brush';
      this.brush = 1;
      this.ch = '^';
      this.paletteItems = [];
      this.grid = true;
      this.showEntities = true;
      this.autoGrow = true;

      this.undoStack = [];
      this.redoStack = [];
      this.stroke = null;
      this.mouse = { x: 0, y: 0, outside: true };
      this.prevMouse = null;
      this.prevCodes = {};

      this.playTests = [];                 // 开出去的试玩页:这一层的一份快照 [{name,text}]
      this.lastPlaytest = null;

      this.msg = '';
      this.msgT = 0;
      this.dirty = false;

      this.folder = new LevelFolder();     // 授权过的 levels/ 文件夹(支持的话)
      this.autoSave = false;               // 改完自动写进 levels/
      this.autoSaveDelay = 1500;           // 自动写入的防抖时间(毫秒)
      this.madeNames = [];                 // 这次打开编辑器建过的楼层名(自动起名要避开)
      this.sourceId = '';                  // 这一层是从哪个 txt 打开的('' = 新层,按关卡名存)
      this.lastPoolId = '';                // 这一层上次写进关卡池用的 id(改名时要清掉旧的)
      this._saveTimer = null;

      this.W = this.canvas.width || 800;
      this.H = this.canvas.height || 600;

      this.wire();                          // 接上 HTML 里的按钮 / 输入框
      this.buildPalette();
      this.buildTools();
      this.buildSkySelect();
      this.newLevel(15, 24, true);
      this.resize();
      this.fitView();
      this.syncUI();
      // 贴图都是 assets/ 下独立的 PNG:读进来之后把调色板图标也换成真贴图
      this.assets.loadAll(() => { this.buildPalette(); });
      // 上次授权过的 levels/ 文件夹(浏览器支持的话自动找回来)
      this.folder.restore().then(() => this.syncFolderLabel());
      this.loop();
    }

    $(id) { return globalThis.document.getElementById(id); }

    // ================= DOM 接线 =================
    wire() {
      var self = this;
      var on = function (id, ev, fn) {
        var el = self.$(id);
        if (el && el.addEventListener) el.addEventListener(ev, fn);
      };
      var click = function (id, fn) { on(id, 'click', fn); };

      click('btn-new', () => self.newLevel(15, 24, false));
      click('btn-new-ground', () => self.newLevel(15, 24, true));
      click('btn-open-pool', () => self.openFromPool());
      click('btn-open-file', () => { var f = self.$('file-input'); if (f) f.click(); });
      on('file-input', 'change', (e) => self.openFiles(e.target.files));
      on('pool-select', 'change', () => self.syncUI());

      click('btn-undo', () => self.undo());
      click('btn-redo', () => self.redo());
      click('btn-fit', () => { self.fitView(); self.say('视角已适应窗口'); });
      click('btn-brush-minus', () => self.setBrush(self.brush - 1));
      click('btn-brush-plus', () => self.setBrush(self.brush + 1));

      /*
       * 勾选框一定要听 change(而不是 click):浏览器的勾选框在**派发 click 之前**
       * 就已经把自己的 checked 翻过来了,所以在 click 里再取反一次就等于没变
       * (表现就是"勾了没反应、状态和画面反着来")。change 里直接读 checked 才是对的。
       */
      on('chk-grid', 'change', () => { self.grid = !!self.$('chk-grid').checked; });
      on('chk-entities', 'change', () => { self.showEntities = !!self.$('chk-entities').checked; });
      on('chk-autogrow', 'change', () => { self.autoGrow = !!self.$('chk-autogrow').checked; });

      on('name', 'input', () => {
        // 名字必填:空了就让它空着,导出时会被 requireName 拦住
        self.model.name = self.$('name').value.replace(/\s+/g, ' ').trim();
        self.markDirty();
      });
      on('w-input', 'change', () => self.changeSize(parseInt(self.$('w-input').value, 10), self.model.rows));
      on('h-input', 'change', () => self.changeSize(self.model.cols, parseInt(self.$('h-input').value, 10)));
      // 天空:选了就写进 // sky: N,选"自动"就把那行删掉(变成按层循环)
      on('sky-select', 'change', () => {
        var v = self.$('sky-select').value;
        if (v) self.model.setMeta('sky', v);
        else self.model.removeMeta('sky');
        self.markDirty();
        self.syncUI();
        self.say(v ? ('这一层固定用 assets/sky/sky' + v + '.png')
          : '天空改回自动(爬塔时随层数循环)');
      });

      click('btn-play', () => self.openPlaytest());
      click('btn-download', () => self.download());
      click('btn-copy', () => self.copyText());
      click('btn-view-text', () => self.showText());
      click('btn-save-folder', () => self.saveToFolder());
      click('btn-pick-folder', () => self.pickFolder());
      click('btn-forget-folder', () => self.forgetFolder());
      on('chk-autosave', 'change', () => {
        self.autoSave = !!self.$('chk-autosave').checked;
        self.say(self.autoSave ? '开着:改完 1.5 秒自动写进 levels/ 文件夹' : '关掉自动写入');
        self.autoSaveTick();
      });
      click('modal-close', () => self.closeModal());
      on('modal', 'click', (e) => { if (e.target === self.$('modal')) self.closeModal(); });
      // 左上角「← 回游戏」:有没保存的改动会先问一句(见 leaveForGame)
      click('back-link', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        self.leaveForGame();
      });

      if (globalThis.addEventListener) globalThis.addEventListener('resize', () => self.resize());
    }

    // ================= 调色板 / 工具条 =================
    buildPalette() {
      var host = this.$('palette');
      var self = this;
      this.paletteItems = EditorPalette.build();
      if (host) host.innerHTML = '';
      this.paletteItems.forEach(function (item, i) {
        var b = globalThis.document.createElement('button');
        b.className = 'pitem';
        b.type = 'button';
        b.title = item.name + (i < 10 ? '  [' + ((i + 1) % 10) + ']' : '');
        var icon = globalThis.document.createElement('canvas');
        icon.width = 38;
        icon.height = 38;
        icon.className = 'picon';
        b.appendChild(icon);
        var lab = globalThis.document.createElement('span');
        lab.textContent = item.ch === AIR ? '空' : item.ch;
        b.appendChild(lab);
        b.addEventListener('click', function () { self.selectChar(item.ch); });
        if (host) host.appendChild(b);
        item.btn = b;
        item.icon = icon;
        self.drawPaletteIcon(item);
      });
      this.highlightPalette();
    }

    drawPaletteIcon(item) {
      var ctx = item.icon.getContext('2d');
      var S = item.icon.width;
      ctx.clearRect(0, 0, S, S);
      ctx.imageSmoothingEnabled = false;
      if (item.kind === 'tile') {
        // 和游戏里同一个画法:贴图会被缩放到这一格(云板只画上面一截)
        RA.drawTile(ctx, item.ch, this.assets.image(item.image), 0, 0, S);
      } else if (item.kind === 'air') {
        for (var y = 0; y < 2; y++) {
          for (var x = 0; x < 2; x++) {
            if ((x + y) % 2 === 0) {
              RA.rect(ctx, x * S / 2, y * S / 2, S / 2, S / 2, [44, 50, 70]);
            }
          }
        }
        RA.strokeRect(ctx, 0, 0, S, S, [96, 112, 150], 2, 0);
      } else if (item.kind === 'spawn') {
        RA.rect(ctx, 0, 0, S, S, [30, 36, 54], 6);
        RA.polygon(ctx, [[S / 2, S * 0.18], [S * 0.26, S * 0.46], [S * 0.74, S * 0.46]],
          [240, 150, 100]);
        RA.rect(ctx, S * 0.30, S * 0.52, S * 0.40, S * 0.30, [236, 96, 72], 3);
        RA.text(ctx, 'P', Math.round(S * 0.24), [255, 255, 255], S / 2, S * 0.68,
          { bold: true, shadow: false });
      } else if (item.kind === 'entity' && item.cls) {
        item.cls.prototype.drawIcon(ctx, 0, 0, S);
      }
    }

    highlightPalette() {
      var self = this;
      this.paletteItems.forEach(function (item) {
        if (!item.btn) return;
        var on = item.ch === self.ch;
        item.btn.className = 'pitem' + (on ? ' on' : '');
      });
    }

    buildTools() {
      var host = this.$('tools');
      var self = this;
      if (host) host.innerHTML = '';
      this.toolButtons = {};
      TOOLS.forEach(function (t) {
        var b = globalThis.document.createElement('button');
        b.className = 'titem';
        b.type = 'button';
        b.textContent = t.name;
        b.title = t.hint + '(' + t.key.replace('Key', '') + ')';
        b.addEventListener('click', function () { self.setTool(t.id); });
        if (host) host.appendChild(b);
        self.toolButtons[t.id] = b;
      });
      this.highlightTools();
    }

    highlightTools() {
      var self = this;
      TOOLS.forEach(function (t) {
        var b = self.toolButtons && self.toolButtons[t.id];
        if (b) b.className = 'titem' + (self.tool === t.id ? ' on' : '');
      });
    }

    /** 天空下拉框:自动(按层循环)+ sky1 ~ skyN */
    buildSkySelect() {
      var sel = this.$('sky-select');
      if (!sel) return;
      var n = C.SKY_COUNT || 8;
      sel.innerHTML = '';
      var add = function (value, label) {
        var op = globalThis.document.createElement('option');
        op.value = value;
        op.textContent = label;
        sel.appendChild(op);
      };
      add('', '自动(随层数循环)');
      for (var i = 1; i <= n; i++) add(String(i), '天空 ' + i + ' · sky' + i + '.png');
    }

    setTool(id) {
      this.tool = id;
      this.stroke = null;
      this.highlightTools();
      var t = TOOLS.filter(function (x) { return x.id === id; })[0];
      if (t) this.say(t.name + ':' + t.hint);
    }

    selectChar(ch) {
      this.ch = ch;
      if (this.tool === 'erase' || this.tool === 'pick') this.setTool('brush');
      this.highlightPalette();
      this.syncUI();
      var item = this.paletteItems.filter(function (x) { return x.ch === ch; })[0];
      if (item) this.say('当前地物:' + item.name);
    }

    setBrush(n) {
      this.brush = RA.clamp(Math.round(n) || 1, 1, 9);
      this.syncUI();
    }

    // ================= 关卡操作 =================
    newLevel(cols, rows, withGround) {
      // 自动分配一个名字(跳过内置关卡和浏览器里已经存过的那些)
      var name = autoLevelName(this.takenNames());
      this.madeNames.push(name);
      this.sourceId = '';                  // 新建的还没有对应的 txt 文件
      this.model = new EditorModel(cols, rows, name);
      // 注释头只留一行名字(和 levels/ 里的 txt 一个格式):
      // 关卡名既是 // name: 也是文件名;字符表看编辑器左边的调色板,
      // 或者 node tools/check_levels.mjs 会打印一份。
      this.model.header = ['// name: ' + name];
      if (withGround) {
        var r0 = this.model.rows - 2;
        for (var c = 0; c < this.model.cols; c++) {
          this.model.set(c, r0, '^');
          this.model.set(c, r0 + 1, '=');
        }
        this.model.set(1, r0 - 1, 'P');
        // 顶上给一小块落脚的地方放出口,这样新建出来就是"能通"的一层
        for (c = this.model.cols - 4; c < this.model.cols - 1; c++) this.model.set(c, 2, '^');
        this.model.set(this.model.cols - 3, 1, 'G');
      }
      this.undoStack = [];
      this.redoStack = [];
      this.stroke = null;
      this.fitView();
      this.markDirty();
      this.syncUI();
      this.say(withGround ? '新建了一层(带地面、起点和出口)' : '新建了一层空的');
    }

    openFromText(text, id) {
      // 记住"这一层是从哪儿来的":保存时沿用它原来的文件名,
      // 免得 levels/ 里出现 floor01.txt 和 起攀.txt 两份一样的东西。
      // (浏览器里存的 custom_xxx 没有对应 txt,所以按关卡名另起一个文件名)
      this.sourceId = (id && !RA.LevelPack.isCustomId(id)) ? String(id).trim() : '';
      this.lastPoolId = '';                // 换了一层,上一次的 id 不再代表"这一层"
      try {
        this.model = EditorModel.fromText(text, id || '导入的楼层');
      } catch (e) {
        this.say('这份 txt 读不出来:' + (e && e.message), 'bad');
        return false;
      }
      this.undoStack = [];
      this.redoStack = [];
      this.fitView();
      this.markDirty();
      this.syncUI();
      this.say('已打开「' + this.model.name + '」(' + this.model.cols + '×' + this.model.rows + ')');
      return true;
    }

    /**
     * 「打开选中的」:拿这一层**现在真正在用的**那份文本。
     * 优先级和游戏那边完全一致(都走 RA.LevelPack):
     *   custom_xxx      → 浏览器里存的那份;
     *   有 overrides 的  → 覆盖的那份(这才是游戏里正在爬的!以前会打开旧的内嵌文本);
     *   其余            → levels.js 里的内嵌文本。
     */
    textOfPoolId(id) {
      if (RA.LevelPack.isCustomId(id)) return RA.LevelPack.readCustom()[id] || '';
      var ov = RA.LevelPack.readOverrides()[id];
      if (ov) return ov;
      return (RA.LEVEL_TEXT || {})[id] || '';
    }

    openFromPool() {
      var sel = this.$('pool-select');
      var id = sel ? sel.value : '';
      if (!id) { this.say('先在下拉框里选一层', 'bad'); return; }
      var text = this.textOfPoolId(id);
      if (!text) { this.say('读不到「' + id + '」的内容', 'bad'); return; }
      this.openFromText(text, id);
    }

    openFiles(files) {
      var self = this;
      if (!files || !files.length) return;
      var f = files[0];
      if (!globalThis.FileReader) { self.say('这个浏览器读不了本地文件', 'bad'); return; }
      var r = new globalThis.FileReader();
      r.onload = function () {
        self.openFromText(String(r.result || ''), String(f.name || '').replace(/\.txt$/i, ''));
      };
      r.onerror = function () { self.say('文件读不出来', 'bad'); };
      r.readAsText(f, 'utf-8');
    }

    exportText() {
      return this.model.toText();
    }

    /**
     * 存盘用的文件名:
     *   从关卡池 / txt 打开的 → 用原来的文件名(存回去,别多出一份);
     *   新建的 → 用关卡名(所以"起名"就等于给它一个文件名)。
     */
    saveFileName() {
      return this.sourceId ? this.sourceId + '.txt' : this.model.fileName();
    }

    /** 这一层在关卡池里的 id:从 txt 打开的就用它,新层用关卡名(= txt 文件名) */
    poolId() {
      return this.saveFileName().replace(/\.txt$/i, '');
    }

    /**
     * 把这一层的文本放进**浏览器里的关卡池**(关卡内容这一半,不动文件):
     *   · 从 levels/ 打开的那层 → 覆盖同一个 id(floor01 还是 floor01,塔里那层不会变成两层);
     *   · 新建的层 → 用关卡名当 id 加进去(以后 sync 出来的也是这个名字,不会变成两份)。
     * 这就是"改了 txt 但 file:// 下游戏还是旧地图"的解药:浏览器这份会兜住。
     *
     * 顺手清掉会变成"重复层"的旧副本 —— 不清的话塔结构表里会冒出两个同名的层。
     * 判断"是同一层"用的是 poolOf 那套归一化名字(空格 / 斜杠都算同一个名字),
     * 所以就算你中间换过别的层、或者把名字里的空格改来改去,也认得出来。
     * 返回它在池子里的 id。
     */
    applyToGamePool() {
      var id = this.poolId();
      var name = String(this.model.name || '').trim();
      var custom = RA.LevelPack.readCustom();
      var overrides = RA.LevelPack.readOverrides();
      // ① 上一轮写进去的 id 不算数了(改过名)
      if (this.lastPoolId && this.lastPoolId !== id) {
        RA.LevelPack.removeOverride(this.lastPoolId);
        RA.LevelPack.removeCustom(RA.LevelPack.customId(this.lastPoolId));
      }
      // ② 从关卡池里"浏览器里存的那一份"打开的层:存成正式名字之后旧副本删掉
      if (this.sourceId && RA.LevelPack.isCustomId(this.sourceId)) {
        RA.LevelPack.removeCustom(this.sourceId);
      }
      if (name) {
        // ③ customLevels / overrides 里和这一层同名的旧副本
        //    (游戏设置里「导入关卡」是按关卡名存成 custom_xxx 的,最容易在这儿撞上)
        Object.keys(custom).forEach(function (k) {
          if (k === id || !RA.LevelPack.isCustomId(k)) return;
          if (RA.LevelPack.sameLevelName(RA.LevelPack.levelName(custom[k], k), name)) {
            RA.LevelPack.removeCustom(k);
          }
        });
        Object.keys(overrides).forEach(function (k) {
          if (k === id) return;
          if (RA.LevelPack.sameLevelName(RA.LevelPack.levelName(overrides[k], k), name)) {
            RA.LevelPack.removeOverride(k);
          }
        });
      }
      RA.LevelPack.putOverride(id, this.exportText());
      this.lastPoolId = id;
      this.dirty = false;          // 这一层的内容已经进关卡池了,"未保存"到此为止
      return id;
    }

    /**
     * 新层要写的文件名会不会盖掉**别的**关卡文件?
     * (比如把一个新层命名成 floor01,就会盖掉 levels/floor01.txt —— 拦住)
     */
    fileNameClash() {
      if (this.sourceId) return '';                 // 打开的那层本来就是覆盖它自己
      var id = this.poolId();
      var src = RA.LEVEL_TEXT || {};
      if (!src[id]) return '';
      var theirs = RA.LevelPack.levelName(src[id], id);
      return (theirs === String(this.model.name || '').trim()) ? '' : id;
    }

    /** 导出前必须有个名字(没有就拦住,并把光标送回输入框) */
    requireName(what) {
      if (String(this.model.name || '').trim()) return true;
      var el = this.$('name');
      if (el) {
        if (el.focus) el.focus();
        if (el.select) el.select();
      }
      this.say('先给这一层起个名字,再' + what + ' —— 名字会写进 // name: 注释,也是 txt 文件名', 'bad');
      return false;
    }

    /** 老关卡(从关卡池 / txt 打开的那层)把名字清空了:从原来的文本里把名字找回来 */
    restoreOriginalName() {
      if (String(this.model.name || '').trim()) return this.model.name;
      if (!this.sourceId) return '';
      var files = RA.LEVEL_TEXT || {};
      var text = files[this.sourceId];
      if (text === undefined) text = RA.LevelPack.readOverrides()[this.sourceId];
      var raw = RA.LevelPack.levelName(text || '', this.sourceId);
      var name = String(raw || this.sourceId).replace(/\s+/g, ' ').trim() || this.sourceId;
      this.model.name = name;                  // 注释头也一起找回来(第一行就是它)
      this.model.header = ['// name: ' + name];
      this.syncUI();
      return name;
    }

    /**
     * 「保存到游戏」的名字规则:新建的层必须起名(名字就是 txt 文件名);
     * 从关卡池 / txt 打开的老关卡沿用原来的名字,不用管输入框里是不是空的。
     */
    requireNameToSave() {
      if (String(this.model.name || '').trim()) return true;
      if (this.sourceId) { this.restoreOriginalName(); return true; }
      return this.requireName('保存到游戏');
    }

    /** 现在已经用掉的楼层名(内置的 + 浏览器里存的 + 这次建过的) */
    takenNames() {
      var out = [];
      var custom = RA.LevelPack.readCustom();
      Object.keys(custom).forEach(function (id) {
        out.push(RA.LevelPack.levelName(custom[id], id));
      });
      var src = RA.LEVEL_TEXT || {};
      Object.keys(src).forEach(function (id) {
        out.push(RA.LevelPack.levelName(src[id], id));
      });
      (this.madeNames || []).forEach(function (nm) { out.push(nm); });
      return out;
    }

    /**
     * 「保存到游戏」:写一个真的 txt 进 levels/(文件名 = 关卡名),
     * 同时把浏览器里的关卡池也换成这一份(见 applyToGamePool)。
     * 没授权过文件夹就先让用户选一次;浏览器不支持写文件夹就退回「下载 txt」。
     *
     * opts.quiet    —— 自动写入用:失败不弹提示
     * opts.afterSave —— 存成功之后干什么(「回游戏」就是靠它:存完再离页)。
     *                  只有真存成了才调;被拦住 / 用户取消都不调。
     */
    saveToFolder(opts) {
      var self = this;
      var quiet = !!(opts && opts.quiet);
      var afterSave = (opts && opts.afterSave) || null;
      var finish = function (ok) {
        if (ok && afterSave) afterSave();
        return ok;
      };
      if (!this.requireNameToSave()) return false;
      var v = this.model.validate();
      if (v.errors.length) {
        if (!quiet) this.say('先修好检查里的问题,再保存到游戏:' + v.errors[0], 'bad');
        return false;
      }
      var clash = this.fileNameClash();
      if (clash) {
        this.say('「' + clash + '」这个名字会盖掉 levels/' + clash +
          '.txt(那一层现在叫「' + RA.LevelPack.levelName((RA.LEVEL_TEXT || {})[clash], clash) +
          '」)—— 换个名字再存', 'bad');
        return false;
      }
      // ① 关卡内容:先放进浏览器里的关卡池(这一步一定做得到)
      this.applyToGamePool();
      var text = this.exportText();
      var file = this.saveFileName();
      var folder = this.folder;
      var done = function (res) {
        self.say('已存进游戏:' + res.dir + '/' + res.file +
          (res.removed ? '(顺手删掉了改名前的 ' + res.removed + ')' : '') +
          ' —— 回游戏刷新一下:新的一份按 R 重构塔就有机会刷出来,' +
          '塔里本来就有的那层刷新后就是新地图(想让内嵌副本也更新就跑 node tools/sync_levels.mjs)', 'ok');
        self.syncFolderLabel();
        self.syncPoolLabel();
        return finish(true);
      };
      var fail = function (e) {
        self.say('写不进去:' + ((e && e.message) || e) +
          '(也可以用「下载 txt」,下载下来的文件名就是关卡名)', 'bad');
        return false;
      };
      if (folder.handle) return folder.write(file, text).then(done).catch(fail);
      if (!folder.supported()) {
        if (!quiet) {
          this.say('这个浏览器不给网页写文件夹(Chrome / Edge 支持),改成下载 txt —— ' +
            '把它丢进 levels/ 一样是"存进游戏"。**浏览器里的关卡池已经换成新的了**,刷新就有效果',
            'warn');
        }
        this.syncPoolLabel();
        return finish(this.download({ quiet: true }));
      }
      if (quiet) return false;                    // 自动保存不去骚扰用户要权限
      return folder.pick().then(function (ok) {
        if (!ok) { self.say('没选文件夹,没存', 'warn'); return false; }
        self.syncFolderLabel();
        return folder.write(file, text).then(done).catch(fail);
      });
    }

    // ================= 回游戏(离开编辑器之前先问要不要存) =================
    /**
     * 点左上角「← 回游戏」:
     *   · 这一层**没改过** → 直接回(关掉这一页 / 回原来那一页);
     *   · 有没保存的改动 → 先用 confirm 问一句"要不要先保存到游戏?";
     *       选"是" = 走一遍「保存到游戏」(新层没名字会先让你起名;存失败就留在编辑器);
     *       选"否" = 不保存,直接回。
     *
     * 用浏览器自带的 confirm 是故意的:它一句话就能问清楚,而且用户点"是"的这次手势
     * 还能接着用于「选择 levels 文件夹…」的授权弹窗(async 弹窗会被拦)。
     */
    leaveForGame() {
      var self = this;
      var ask = globalThis.confirm;
      var dirty = !!this.dirty;
      if (dirty && typeof ask === 'function') {
        var yes = ask('这一层有改动还没保存。\n\n要先把「' +
          (this.model.name || '未命名楼层') + '」保存到游戏吗?\n' +
          '(选「是」= 保存到游戏;新建的层还没起名的话会先让你起个名字)\n' +
          '(选「否」= 不保存,直接回游戏)');
        if (yes) {
          this.saveToFolder({ afterSave: function () { self.leavePage(); } });
          return true;
        }
      }
      this.leavePage();
      return true;
    }

    /** 真的离开编辑器:能关标签页就关,关不掉就跳回 index.html */
    leavePage() {
      try {
        if (typeof globalThis.close === 'function') {
          globalThis.close();
          if (globalThis.closed) return true;
        }
      } catch (e) { /* 关不掉就走下面 */ }
      var loc = globalThis.location;
      if (loc && loc.href) {
        try { loc.href = 'index.html'; return true; } catch (e) { /* 有些环境不让改 */ }
      }
      return false;
    }

    /** 点了「选择 levels 文件夹」 */
    pickFolder() {
      var self = this;
      if (!this.folder.supported()) {
        this.say('这个浏览器不支持"授权文件夹"(Chrome / Edge 支持),用「下载 txt」吧 —— ' +
          '文件名就是关卡名,丢进 levels/ 一样用', 'warn');
        return false;
      }
      this.folder.pick().then(function (ok) {
        self.syncFolderLabel();
        if (ok) {
          self.say('记住了文件夹「' + self.folder.label + '」—— 以后「保存到游戏」直接写进去', 'ok');
        } else {
          self.say('没选文件夹', 'warn');
        }
      });
      return true;
    }

    forgetFolder() {
      var self = this;
      this.folder.forget().then(function () {
        self.syncFolderLabel();
        self.say('忘掉了那个文件夹,下次要重新选');
      });
    }

    /** 右侧那行"关卡池里都有什么"的提示 */
    syncPoolLabel() {
      var el = this.$('pool-label');
      if (!el) return;
      var nBuilt = Object.keys(RA.LEVEL_TEXT || {}).length;
      var nOv = Object.keys(RA.LevelPack.readOverrides()).length;
      var nCus = 0;
      Object.keys(RA.LevelPack.readCustom()).forEach(function (id) {
        if (RA.LevelPack.isCustomId(id)) nCus++;
      });
      el.textContent = '关卡池:' + nBuilt + ' 个内置' +
        (nOv ? ' + ' + nOv + ' 个存过 / 改过(✎)' : '') +
        (nCus ? ' + ' + nCus + ' 个只在浏览器里(★)' : '') +
        ' —— 下拉框里选一层,「打开选中的」就能接着改';
    }

    /** 右上角那行"目标文件夹"提示 */
    syncFolderLabel() {
      var el = this.$('folder-label');
      if (!el) return;
      var f = this.folder;
      var want = this.saveFileName();
      if (f.handle) {
        el.textContent = '目标文件夹:' + (f.label || 'levels') + ' → 「保存到游戏」会写成 ' + want +
          (f.lastFile && f.lastFile !== want ? '(上次写了 ' + f.lastFile + ')' : '');
      } else if (f.supported()) {
        el.textContent = '还没选文件夹 —— 点上面那个按钮授权一次,之后「保存到游戏」就直接写进 levels/(' +
          want + ')。';
      } else {
        el.textContent = '这个浏览器不支持写文件夹,用「下载 txt」—— 文件名就是关卡名,丢进 levels/ 一样用。';
      }
    }

    /** 开了"自动写入"就攒一下:改完 1.5 秒没再动就写进 levels/ */
    autoSaveTick() {
      var self = this;
      if (!this.autoSave || !this.folder || !this.folder.handle || !globalThis.setTimeout) return;
      if (this._saveTimer && globalThis.clearTimeout) globalThis.clearTimeout(this._saveTimer);
      this._saveTimer = globalThis.setTimeout(function () {
        self._saveTimer = null;
        self.saveToFolder({ quiet: true });
      }, this.autoSaveDelay === undefined ? 1500 : this.autoSaveDelay);
    }

    download(opts) {
      var quiet = !!(opts && opts.quiet);
      if (!String(this.model.name || '').trim()) this.restoreOriginalName();  // 老关卡:名字在文件里
      if (!this.requireName('下载 txt')) return false;
      var text = this.exportText();
      var v = this.model.validate();
      var name = this.saveFileName();
      var doc = globalThis.document;
      try {
        var blob = new globalThis.Blob([text], { type: 'text/plain;charset=utf-8' });
        var a = doc.createElement('a');
        a.href = globalThis.URL.createObjectURL(blob);
        a.download = name;
        if (doc.body) doc.body.appendChild(a);
        a.click();
        if (doc.body && doc.body.removeChild) doc.body.removeChild(a);
        globalThis.URL.revokeObjectURL(a.href);
        if (quiet) return true;
        this.say('已下载 ' + name + '(只动文件,游戏里的关卡池没变)—— 放进 levels/ 再跑 ' +
          'node tools/sync_levels.mjs;想连游戏一起更新就点「保存到游戏」' +
          (v.errors.length ? '(注意:检查里还有 ' + v.errors.length + ' 个问题)' : ''),
          v.errors.length ? 'warn' : 'ok');
      } catch (e) {
        if (quiet) return false;
        this.showText();
        this.say('这个浏览器不让直接下载,已经把 txt 摊开给你手动复制了', 'warn');
      }
      return true;
    }

    copyText() {
      if (!String(this.model.name || '').trim()) this.restoreOriginalName();  // 老关卡:名字在文件里
      if (!this.requireName('复制')) return false;
      var text = this.exportText();
      var nav = globalThis.navigator;
      if (nav && nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(text).then(() => {
          this.say('已复制这一层的 txt 到剪贴板', 'ok');
        }).catch(() => {
          this.showText();
          this.say('复制不了,已经摊开给你手动复制', 'warn');
        });
      } else {
        this.showText();
        this.say('这个浏览器不支持直接复制,已经摊开给你手动复制', 'warn');
      }
    }

    showText() {
      var box = this.$('modal-text');
      if (box) box.value = this.exportText();
      var m = this.$('modal');
      if (m) m.className = 'show';
    }

    closeModal() {
      var m = this.$('modal');
      if (m) m.className = '';
    }

    // ================= 尺寸 / 检查 =================
    changeSize(cols, rows) {
      if (isNaN(cols) || isNaN(rows)) { this.syncUI(); return; }
      var capped = (cols > MAX_COLS || (MAX_ROWS > 0 && rows > MAX_ROWS));
      this.pushUndo();
      var changed = this.model.setSize(cols, rows);
      if (changed) this.markDirty();
      this.fitView();
      this.syncUI();
      this.say('尺寸改成 ' + this.model.cols + ' × ' + this.model.rows +
        (capped ? '(' + limitText() + ')' : ''));
    }

    // ================= 撤销 / 重做 =================
    snapshot() {
      return {
        cols: this.model.cols, rows: this.model.rows, name: this.model.name,
        header: this.model.header.slice(),
        cells: this.model.cells.map(function (row) { return row.join(''); })
      };
    }

    restore(s) {
      this.model.cols = s.cols;
      this.model.rows = s.rows;
      this.model.name = s.name;
      this.model.header = s.header.slice();
      this.model.cells = s.cells.map(function (line) { return line.split(''); });
      this.syncUI();
    }

    pushUndo() {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 80) this.undoStack.shift();
      this.redoStack = [];
      this.syncUI();
    }

    undo() {
      if (!this.undoStack.length) { this.say('没有可以撤销的了'); return; }
      this.redoStack.push(this.snapshot());
      this.restore(this.undoStack.pop());
      this.say('撤销');
    }

    redo() {
      if (!this.redoStack.length) { this.say('没有可以重做的了'); return; }
      this.undoStack.push(this.snapshot());
      this.restore(this.redoStack.pop());
      this.say('重做');
    }

    markDirty() {
      this.dirty = true;
      this.autoSaveTick();          // 开了自动写入的话,攒 1.5 秒再落盘
    }

    // ================= 坐标换算 / 视角 =================
    cellAt(sx, sy) {
      var z = this.view.zoom;
      var wx = this.view.x + sx / z;
      var wy = this.view.y + sy / z;
      return { c: Math.floor(wx / TS), r: Math.floor(wy / TS) };
    }

    cellToScreen(c, r) {
      var z = this.view.zoom;
      return { x: (c * TS - this.view.x) * z, y: (r * TS - this.view.y) * z };
    }

    zoomAt(sx, sy, factor) {
      var before = this.cellAt(sx, sy);
      var z = RA.clamp(this.view.zoom * factor, 0.06, 3);
      if (z === this.view.zoom) return;
      // 缩放前后鼠标指着同一格
      this.view.zoom = z;
      this.view.x = before.c * TS - sx / z;
      this.view.y = before.r * TS - sy / z;
    }

    fitView() {
      var pad = 28;
      var zx = (this.W - pad * 2) / this.model.worldW();
      var zy = (this.H - pad * 2) / this.model.worldH();
      this.view.zoom = RA.clamp(Math.min(zx, zy), 0.06, 2.2);
      var z = this.view.zoom;
      this.view.x = -(this.W / z - this.model.worldW()) / 2;
      this.view.y = -(this.H / z - this.model.worldH()) / 2;
    }

    resize() {
      var dpr = globalThis.devicePixelRatio || 1;
      var cw = Math.max(240, this.canvas.clientWidth || 800);
      var ch = Math.max(180, this.canvas.clientHeight || 600);
      var w = Math.round(cw * dpr), h = Math.round(ch * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      var first = !this.W || !this.H;
      this.W = w;
      this.H = h;
      this.ctx.imageSmoothingEnabled = false;
      if (first) this.fitView();
    }

    // ================= 每帧 =================
    update(dt) {
      var inp = this.input;
      if (this.msgT > 0) {
        this.msgT -= dt;
        if (this.msgT <= 0) { this.msg = ''; this._lastStatus = null; }
      }
      if (this._needSync) {
        this._syncT = (this._syncT || 0) + dt;
        if (this._syncT >= 0.15) this.syncUI();      // 一笔画完再刷面板,拖动时不卡
      }

      var mouse = inp.mouse || { x: 0, y: 0 };
      var inside = !mouse.outside &&
        mouse.x >= 0 && mouse.y >= 0 && mouse.x <= this.W && mouse.y <= this.H;

      // ---- 键盘 ----
      var just = (code) => !!inp.codes[code] && !this.prevCodes[code];
      var ctrl = !!inp.codes.ControlLeft || !!inp.codes.ControlRight ||
        !!inp.codes.MetaLeft || !!inp.codes.MetaRight;

      if (ctrl && just('KeyZ')) { inp.codes.ShiftLeft ? this.redo() : this.undo(); }
      else if (ctrl && just('KeyY')) this.redo();
      else if (ctrl && just('KeyS')) this.download();
      else if (just('KeyP')) this.openPlaytest();
      else if (just('KeyB')) this.setTool('brush');
      else if (just('KeyE')) this.setTool('erase');
      else if (just('KeyR')) this.setTool('rect');
      else if (just('KeyF')) this.setTool('fill');
      else if (just('KeyK')) this.setTool('pick');
      else if (just('KeyG')) {
        this.grid = !this.grid;
        var cg = this.$('chk-grid');
        if (cg) cg.checked = this.grid;
      } else if (just('BracketLeft')) this.setBrush(this.brush - 1);
      else if (just('BracketRight')) this.setBrush(this.brush + 1);
      else {
        for (var d = 1; d <= 9; d++) {
          if (just('Digit' + d) && this.paletteItems[d - 1]) {
            this.selectChar(this.paletteItems[d - 1].ch);
            break;
          }
        }
        if (just('Digit0') && this.paletteItems[9]) this.selectChar(this.paletteItems[9].ch);
        // 方向键平移
        var step = (inp.codes.ShiftLeft || inp.codes.ShiftRight ? 8 : 2) * TS;
        if (inp.codes.ArrowLeft) this.view.x -= step / this.view.zoom;
        if (inp.codes.ArrowRight) this.view.x += step / this.view.zoom;
        if (inp.codes.ArrowUp) this.view.y -= step / this.view.zoom;
        if (inp.codes.ArrowDown) this.view.y += step / this.view.zoom;
      }

      // ---- 滚轮缩放 ----
      if (inp.wheel && inside) {
        this.zoomAt(mouse.x, mouse.y, Math.pow(1.0016, -inp.wheel));
      }

      // ---- 右键 / 中键 / 空格+左键 = 平移 ----
      var panning = !!inp.buttons[2] || !!inp.buttons[1] ||
        (!!inp.buttons[0] && !!inp.codes.Space);
      if (panning) {
        if (this.prevMouse && !this.prevMouse.outside) {
          this.view.x -= (mouse.x - this.prevMouse.x) / this.view.zoom;
          this.view.y -= (mouse.y - this.prevMouse.y) / this.view.zoom;
        }
        this.stroke = null;
      } else if (!inside) {
        // 鼠标跑到画布外面了(拖出去 / 离开窗口):这一笔就收尾,别在看不见的地方乱画
        if (this.stroke) this.endStroke();
      } else if (inp.buttons[0]) {
        this.paintStep(mouse);
      } else {
        if (this.stroke) this.endStroke();
      }

      this.mouse = { x: mouse.x, y: mouse.y, outside: mouse.outside };
      this.prevMouse = this.mouse;
      this.prevCodes = Object.assign({}, inp.codes);

      if (this.msgT <= 0) this.updateStatus(mouse, inside);
    }

    /**
     * 需要时把地图撑大,返回坐标系的平移量 {dc,dr}(内容整体往右下挪了几格)。
     * 自动扩展时视口跟着补偿,所以画面上不会跳;返回 false = 到上限了。
     */
    growTo(c0, r0, c1, r1) {
      var left = c0 < 0 ? -c0 : 0;
      var top = r0 < 0 ? -r0 : 0;
      var right = Math.max(0, c1 + 1 - this.model.cols);
      var bottom = Math.max(0, r1 + 1 - this.model.rows);
      if (!left && !right && !top && !bottom) return null;
      if (!this.model.grow(left, right, top, bottom)) {
        this.say('画不下去了:' + limitText(), 'bad');
        return false;
      }
      this.view.x += left * TS;
      this.view.y += top * TS;
      return { dc: left, dr: top };
    }

    /** 地图撑大之后,把这一笔里已经记下的格子一起挪过去 */
    shiftStroke(s) {
      if (!this.stroke) return;
      ['start', 'end', 'last'].forEach((k) => {
        var p = this.stroke[k];
        if (p) { p.c += s.dc; p.r += s.dr; }
      });
    }

    /** 鼠标左键按住时的绘画逻辑(一笔 = 一次撤销) */
    paintStep(mouse) {
      var cell = this.cellAt(mouse.x, mouse.y);
      var tool = this.stroke ? this.stroke.tool : this.tool;
      var ch = tool === 'erase' ? AIR : this.ch;

      if (!this.stroke) {
        if (tool === 'pick') {
          var picked = this.model.get(cell.c, cell.r);
          this.selectChar(picked);
          this.say('取到 ' + (picked === AIR ? '空气' : "'" + picked + "'"));
          return;
        }
        this.pushUndo();                 // 整笔拖动算一步撤销
        this.stroke = { tool: tool, start: cell, end: cell, last: cell };
        if (tool === 'fill') {
          if (this.autoGrow) {
            var sf = this.growTo(cell.c, cell.r, cell.c, cell.r);
            this.stroke = null;
            if (sf === false) return;
            if (sf) cell = { c: cell.c + sf.dc, r: cell.r + sf.dr };
          } else {
            this.stroke = null;
          }
          var n = this.model.floodFill(cell.c, cell.r, ch);
          this.afterEdit();
          this.say('填了 ' + n + ' 格');
          return;
        }
      }

      // 自动扩展:把这一笔整段(上一次的点 → 这一次的点,含笔刷大小)都包进来
      if (this.autoGrow) {
        var half = Math.floor((this.brush - 1) / 2);
        var c0 = cell.c, c1 = cell.c, r0 = cell.r, r1 = cell.r;
        if (this.stroke.last) {
          c0 = Math.min(c0, this.stroke.last.c);
          c1 = Math.max(c1, this.stroke.last.c);
          r0 = Math.min(r0, this.stroke.last.r);
          r1 = Math.max(r1, this.stroke.last.r);
        }
        var s = this.growTo(c0 - half, r0 - half,
          c1 + this.brush - 1 - half, r1 + this.brush - 1 - half);
        if (s === false) return;
        if (s) {
          cell = { c: cell.c + s.dc, r: cell.r + s.dr };
          this.shiftStroke(s);
        }
      } else if (!this.model.inBounds(cell.c, cell.r)) {
        return;
      }

      if (tool === 'rect') {
        this.stroke.end = cell;
        return;
      }
      this.paintLine(this.stroke.last, cell, ch);
      this.stroke.last = cell;
    }

    paintLine(a, b, ch) {
      // 两点之间按 Bresenham 补格,拖快了也不会断
      var dx = Math.abs(b.c - a.c), dy = Math.abs(b.r - a.r);
      var sx = a.c < b.c ? 1 : -1, sy = a.r < b.r ? 1 : -1;
      var err = dx - dy, x = a.c, y = a.r, guard = 0;
      while (guard++ < 4000) {
        this.stamp(x, y, ch);
        if (x === b.c && y === b.r) break;
        var e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
      this.afterEdit();
    }

    /** 在 (c,r) 盖一个"笔刷大小"的方块(超出边界的部分自动忽略) */
    stamp(c, r, ch) {
      var n = this.brush;
      var half = Math.floor((n - 1) / 2);
      for (var dr = -half; dr < n - half; dr++) {
        for (var dc = -half; dc < n - half; dc++) {
          this.model.set(c + dc, r + dr, ch);
        }
      }
    }

    endStroke() {
      var s = this.stroke;
      this.stroke = null;
      if (!s) return;
      if (s.tool === 'rect') {
        var ch = s.tool === 'erase' ? AIR : this.ch;
        if (this.autoGrow) {
          var g = this.growTo(Math.min(s.start.c, s.end.c), Math.min(s.start.r, s.end.r),
            Math.max(s.start.c, s.end.c), Math.max(s.start.r, s.end.r));
          if (g === false) return;
          if (g) {
            s.start = { c: s.start.c + g.dc, r: s.start.r + g.dr };
            s.end = { c: s.end.c + g.dc, r: s.end.r + g.dr };
          }
        }
        this.model.fillRect(s.start.c, s.start.r, s.end.c, s.end.r, ch);
        this.say('画了一个矩形(' + ch + ')');
      }
      this.afterEdit();
    }

    afterEdit() {
      this.markDirty();
      this._needSync = true;      // 拖动时别每帧都去校验整张图,攒一下再刷面板
    }

    // ================= 试玩(开新标签页,见 play.html / js/playtest.js) =================
    /**
     * 点「▶ 试玩」/ 按 P:把这一层原样交给新标签页里的真引擎。
     * 页面之间怎么传:① 直接把这份快照挂在 this.playTests[i] 上(试玩页问 opener 要);
     *                 ② sessionStorage 兜底(外面那一页关掉了、或者刷新了也还在)。
     * 为什么不在这一页里玩:编辑器这一页是原生控件 + 地图画布,塞不下全屏游戏;
     * 新标签页玩完关掉就"回到编辑器",原来这一页的撤销栈、视角、光标全都没动。
     */
    openPlaytest() {
      var v = this.model.validate();
      if (v.errors.length) {
        this.say('先修好:' + v.errors[0], 'bad');
        return false;
      }
      var text = this.exportText();
      var i = this.playTests.length;
      var entry = { name: this.model.name, text: text };
      this.playTests.push(entry);
      this.lastPlaytest = entry;
      // 兜底:存一份专门给试玩页用的(不碰关卡池那两把钥匙)
      // 键名和 playtest.js 里共用同一个常量,别在这儿写死字符串
      try {
        var s = globalThis.sessionStorage;
        if (s) s.setItem(RA.PLAYTEST_KEY || 'reverse_abyss.playtest', JSON.stringify(entry));
      } catch (e) { /* 存不了也能靠 opener 传过去 */ }

      var url = 'play.html?i=' + i;
      var opened = null;
      if (typeof globalThis.open === 'function') {
        opened = globalThis.open(url, '_blank');
      }
      if (!opened) {
        this.say('浏览器拦住了新标签页(允许弹窗后再点一次「▶ 试玩」)', 'warn');
        return false;
      }
      this.won = false;                      // 这一页只记"刚开过一次试玩"
      this.say('已在新标签页里试玩「' + (this.model.name || '未命名楼层') +
        '」—— 通关或按 Esc 之后可以「重新开始」或「回编辑器」(关掉那一页)', 'ok');
      return true;
    }

    // ================= 绘制 =================
    draw() {
      var ctx = this.ctx;
      RA.rect(ctx, 0, 0, this.W, this.H, [13, 15, 24]);
      this.drawBoard(ctx);
    }

    drawBoard(ctx) {
      var m = this.model;
      var z = this.view.zoom;
      var ts = TS * z;
      var B = { x: 0, y: 0, w: this.W, h: this.H };

      // 关卡范围(外面那圈深一点,和"空气"区分开)
      var o = this.cellToScreen(0, 0);
      RA.rect(ctx, o.x, o.y, m.worldW() * z, m.worldH() * z, [22, 26, 40]);

      // 空气底纹(棋盘格)
      if (ts >= 4) {
        var c0 = Math.max(0, Math.floor(this.view.x / TS));
        var r0 = Math.max(0, Math.floor(this.view.y / TS));
        var c1 = Math.min(m.cols - 1, Math.floor((this.view.x + B.w / z) / TS));
        var r1 = Math.min(m.rows - 1, Math.floor((this.view.y + B.h / z) / TS));
        for (var r = r0; r <= r1; r++) {
          for (var c = c0; c <= c1; c++) {
            if (((c + r) % 2) === 0) {
              var p = this.cellToScreen(c, r);
              RA.rect(ctx, p.x, p.y, ts + 0.5, ts + 0.5, [27, 31, 46]);
            }
          }
        }
      }

      // 小格子范围(算一次,地块 / 网格 / 地物都用)
      var vc0 = Math.max(0, Math.floor(this.view.x / TS));
      var vr0 = Math.max(0, Math.floor(this.view.y / TS));
      var vc1 = Math.min(m.cols - 1, Math.floor((this.view.x + B.w / z) / TS));
      var vr1 = Math.min(m.rows - 1, Math.floor((this.view.y + B.h / z) / TS));

      // 地块
      var tiny = ts < 8;
      for (r = vr0; r <= vr1; r++) {
        for (c = vc0; c <= vc1; c++) {
          var ch = m.cells[r][c];
          if (!RA.isTileChar(ch)) continue;      // 实心和单向云板都要画
          var q = this.cellToScreen(c, r);
          if (tiny) {
            ctx.fillStyle = tileColor(ch);
            ctx.fillRect(q.x, q.y, ts + 0.5, ts + 0.5);
          } else {
            // 贴图不一定是 45×45(现在用的是 16×16 像素画),交给引擎缩放到这一格
            RA.drawTile(ctx, ch, this.assets.image(RA.TILE_IMAGES[ch][0]), q.x, q.y, ts);
          }
        }
      }

      // 网格
      if (this.grid && ts >= 6) {
        ctx.save();
        ctx.globalAlpha = 0.16;
        for (c = vc0; c <= vc1 + 1; c++) {
          var gx = this.cellToScreen(c, 0).x;
          RA.line(ctx, gx, Math.max(0, o.y), gx, Math.min(this.H, o.y + m.worldH() * z),
            (c % 5 === 0) ? 2 : 1, (c % 5 === 0) ? [255, 255, 255] : [160, 180, 220]);
        }
        for (r = vr0; r <= vr1 + 1; r++) {
          var gy = this.cellToScreen(0, r).y;
          RA.line(ctx, Math.max(0, o.x), gy, Math.min(this.W, o.x + m.worldW() * z), gy,
            (r % 5 === 0) ? 2 : 1, (r % 5 === 0) ? [255, 255, 255] : [160, 180, 220]);
        }
        ctx.restore();
      }

      // 地物(出口 / 弹簧板 / 以后加的任何东西)
      if (this.showEntities) {
        for (r = vr0; r <= vr1; r++) {
          for (c = vc0; c <= vc1; c++) {
            ch = m.cells[r][c];
            var cls = RA.BY_LETTER[ch];
            if (!cls) continue;
            q = this.cellToScreen(c, r);
            if (ts >= 12) {
              cls.prototype.drawIcon(ctx, q.x, q.y, ts);
            } else {
              ctx.fillStyle = hashColor(ch);
              ctx.fillRect(q.x, q.y, ts + 0.5, ts + 0.5);
              RA.text(ctx, ch, Math.max(8, ts * 0.7), [255, 255, 255],
                q.x + ts / 2, q.y + ts / 2, { bold: true, shadow: false });
            }
          }
        }

        // 起点标记也归"地物"这一类(它不是地形,是个位置标记)
        RA.SPAWN_CHARS.split('').forEach((ch) => {
          m.findChar(ch).forEach((p) => {
            var q2 = this.cellToScreen(p.c, p.r);
            if (q2.x + ts < -40 || q2.x > this.W + 40 ||
              q2.y + ts < -40 || q2.y > this.H + 40) return;
            ctx.save();
            ctx.globalAlpha = 0.9;
            RA.strokeRect(ctx, q2.x + 1, q2.y + 1, ts - 2, ts - 2, [240, 150, 100], 2, 4);
            ctx.restore();
            RA.polygon(ctx, [[q2.x + ts / 2, q2.y + ts * 0.18],
              [q2.x + ts * 0.28, q2.y + ts * 0.44],
              [q2.x + ts * 0.72, q2.y + ts * 0.44]], [240, 150, 100]);
            if (ts >= 14) {
              RA.text(ctx, 'P', Math.round(ts * 0.34), [255, 210, 180],
                q2.x + ts / 2, q2.y + ts * 0.68, { bold: true, shadow: false });
            }
          });
        });
      }

      // 矩形预览 / 悬停格
      var hs = this.brush;
      var half = Math.floor((hs - 1) / 2);
      if (this.stroke && this.stroke.tool === 'rect') {
        var a = this.stroke.start, b = this.stroke.end;
        var x0 = Math.min(a.c, b.c), x1 = Math.max(a.c, b.c);
        var y0 = Math.min(a.r, b.r), y1 = Math.max(a.r, b.r);
        var s0 = this.cellToScreen(x0, y0);
        ctx.save();
        ctx.globalAlpha = 0.28;
        RA.rect(ctx, s0.x, s0.y, (x1 - x0 + 1) * ts, (y1 - y0 + 1) * ts,
          this.tool === 'erase' ? [255, 120, 120] : [140, 210, 255]);
        ctx.restore();
      } else if (!this.mouse.outside) {
        var hc = this.cellAt(this.mouse.x, this.mouse.y);
        var hq = this.cellToScreen(hc.c - half, hc.r - half);
        RA.strokeRect(ctx, hq.x, hq.y, ts * hs, ts * hs,
          [255, 205, 110], 2, 3);
      }

      // 关卡外框
      RA.strokeRect(ctx, o.x, o.y, m.worldW() * z, m.worldH() * z, [120, 150, 200], 2, 0);
    }

    // ================= 状态栏 / 检查面板 =================
    updateStatus(mouse, inside) {
      if (!inside) { this.announce('鼠标不在画布上'); return; }
      var cell = this.cellAt(mouse.x, mouse.y);
      var ch = this.model.get(cell.c, cell.r);
      var what = '空气';
      if (RA.isTileChar(ch)) what = RA.TILE_IMAGES[ch][1];
      else if (RA.SPAWN_CHARS.indexOf(ch) >= 0) what = '出生点';
      else if (RA.BY_LETTER[ch]) what = RA.BY_LETTER[ch].NAME || ch;
      var tool = TOOLS.filter((t) => t.id === this.tool)[0];
      this.announce('第 ' + (cell.r + 1) + ' 行 第 ' + (cell.c + 1) + ' 列 · ' +
        what + '   |   ' + (tool ? tool.name : '') + ' 笔刷 ' + this.brush +
        '   |   左键画 · 右键拖动平移 · 滚轮缩放 · Ctrl+Z 撤销');
    }

    /** 状态栏文字(带一点颜色) */
    announce(text, kind) {
      if (text === this._lastStatus) return;
      this._lastStatus = text;
      var el = this.$('status');
      if (el) {
        el.textContent = text || '';
        el.className = kind || '';
      }
    }

    say(text, kind) {
      this.msg = text;
      this.msgT = text ? 4 : 0;
      this._lastStatus = null;          // 强制刷一次
      this.announce(text, kind);
    }

    /** 把关卡列表 / 尺寸 / 检查面板刷成当前状态 */
    syncUI() {
      this._needSync = false;
      this._syncT = 0;
      var self = this;
      this.syncFolderLabel();
      this.syncPoolLabel();
      var set = function (id, prop, val) {
        var el = self.$(id);
        if (el) el[prop] = val;
      };
      set('name', 'value', this.model.name);
      set('w-input', 'value', this.model.cols);
      set('h-input', 'value', this.model.rows);
      var skySel = this.$('sky-select');
      if (skySel) skySel.value = this.model.getMeta('sky') || '';
      set('brush-label', 'textContent', String(this.brush));
      set('size-label', 'textContent',
        this.model.cols + ' × ' + this.model.rows + ' 格');
      set('world-label', 'textContent',
        '世界 ' + this.model.worldW() + ' × ' + this.model.worldH() + ' px · 一格 ' + TS +
        'px' + (MAX_ROWS > 0 ? '' : ' · 高度不限'));
      // 勾选框的状态永远由内部状态说了算(免得勾选/画面反着来)
      set('chk-grid', 'checked', this.grid);
      set('chk-entities', 'checked', this.showEntities);
      set('chk-autogrow', 'checked', this.autoGrow);

      // 关卡下拉框:内嵌的 + 浏览器里存的 + 改过的覆盖
      // 同一个"层"只列一条:内容一样的内嵌层和 custom_ 副本合成一条(见 primaryOf),
      // 名字不同的才算两层不同的关卡。
      var sel = this.$('pool-select');
      if (sel && sel.tagName !== undefined) {
        var ovIds = Object.keys(RA.LevelPack.readOverrides());
        var pool = RA.LevelPack.poolOf(RA.LevelPack.build(RA.LEVEL_TEXT || {})).list;
        var want = pool.map(function (e) { return e.id; }).join(',') +
          '|' + ovIds.sort().join(',');
        if (sel.__want !== want) {
          sel.__want = want;
          sel.innerHTML = '';
          var add = function (id, label) {
            var op = globalThis.document.createElement('option');
            op.value = id;
            op.textContent = label;
            sel.appendChild(op);
          };
          RA.LevelPack.primaryOf(pool).forEach(function (e) {
            var mark = e.overridden ? '✎ ' : (e.custom ? '★ ' : '');
            var tail = e.overridden ? ' · 浏览器里存过/改过'
              : (e.custom ? ' · 浏览器里存的' : '');
            // 列出 id(文件名):同名但来源不同的层也分得清(custom_xxx 那种把名字放前面)
            var label = e.custom ? (e.name + ' · ' + e.id) : (e.id + ' · ' + e.name);
            add(e.id, mark + label + tail);
          });
        }
      }

      // 检查面板
      var v = this.model.validate();
      var html = [];
      v.errors.forEach(function (e) { html.push('<li class="bad">✖ ' + esc(e) + '</li>'); });
      v.warnings.forEach(function (w) { html.push('<li class="warn">⚠ ' + esc(w) + '</li>'); });
      v.notes.forEach(function (n) { html.push('<li class="note">· ' + esc(n) + '</li>'); });
      if (!html.length) html.push('<li class="ok">✔ 没问题</li>');
      var list = this.$('check-list');
      if (list) list.innerHTML = html.join('');

      var badge = this.$('check-badge');
      if (badge) {
        badge.textContent = v.errors.length ? ('✖ ' + v.errors.length + ' 个问题')
          : (v.warnings.length ? ('⚠ ' + v.warnings.length + ' 个提醒') : '✔ 检查通过');
        badge.className = 'badge ' + (v.errors.length ? 'bad' : (v.warnings.length ? 'warn' : 'ok'));
      }
      var bu = this.$('btn-undo');
      if (bu) bu.disabled = !this.undoStack.length;
      var br = this.$('btn-redo');
      if (br) br.disabled = !this.redoStack.length;
      var bs = this.$('btn-save-folder');
      if (bs) bs.disabled = v.errors.length > 0;      // 先修好问题再「保存到游戏」
      this.highlightPalette();
      this.highlightTools();
      this._dirtyDoc = this.dirty;
    }

    // ================= 主循环 =================
    loop() {
      var self = this;
      var last = null;
      function frame(now) {
        if (last === null) last = now;
        var dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        RA.time = (RA.time || 0) + dt;
        self.update(dt);
        self.draw();
        self.input.endFrame();
        globalThis.requestAnimationFrame(frame);
      }
      globalThis.requestAnimationFrame(frame);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  RA.EditorModel = EditorModel;
  RA.EditorPalette = EditorPalette;
  RA.Editor = Editor;
  RA.EDITOR_TOOLS = TOOLS;

  /** 页面加载完自己起来 */
  function boot() {
    var canvas = globalThis.document.getElementById('board');
    if (!canvas) return;
    try {
      RA.editor = new Editor(canvas);
      globalThis.RA_EDITOR_READY = true;
    } catch (e) {
      var st = globalThis.document.getElementById('status');
      if (st) st.textContent = '编辑器起不来:' + (e && e.message);
      if (globalThis.console) globalThis.console.error(e);
    }
  }

  // 自检页面不想自动起编辑器,可以设 window.RA_EDITOR_NO_BOOT = true
  RA.EditorModel.autoName = autoLevelName;
  RA.LevelFolder = LevelFolder;
  RA.EditorBoot = boot;                 // 自检里也能手动走一遍页面加载时的这条路径
  if (!globalThis.RA_EDITOR_NO_BOOT) {
    if (globalThis.document.readyState === 'loading') {
      globalThis.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(globalThis.RA = globalThis.RA || {});