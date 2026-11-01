/* -*- coding: utf-8 -*- */
/*
 * editor.js —— 关卡编辑器(T02A:完整 LevelData 模型 + JSON 文件往返)
 * ================================================================
 *
 * 这一版的数据真值只有一份:EditorModel.data(完整 LevelData,schemaVersion=2)。
 * 地形、对象、路线、出生点、背景、装饰、extensions、未知字段都在这一份数据里;
 * 画布上的"字符"只是画笔和显示用的适配层,**不再有第二份可编辑的字符地图**。
 *
 * 三条出口(本卡只做前两条):
 *   ① 导出 JSON —— LevelCodec.encode() 的同步结果;浏览器下载只报"已发起",
 *      不声称已写进 levels/,也不清除未持久状态;
 *   ② 导入 —— v2 JSON 走 LevelCodec;旧 TXT / 旧 JSON 只走显式 LegacyImport,
 *      迁移成未认证草稿(保留警告和待修复引用);
 *   ③ 草稿仓库、正式试玩、发布 —— 尚未接入(T02B / T03 / T06),按钮明确禁用。
 *
 * 与旧编辑器的差别(都是目标契约要求,不是顺手改玩法):
 *   · 旧 TXT 导出、`保存到游戏`(先改浏览器池再写盘)整条移除;
 *   · 出口 G 不再是可画笔刷,旧 G 只作为迁移信息显示;spawn 是显式数据;
 *   · 撤销/重做保存整份 LevelData(对象/路线/元信息一起),有 100 步 / 32MiB 预算;
 *   · 首次内容编辑清除认证;undo/redo 不恢复旧通关资格。
 *
 * 坐标约定:格坐标 (col,row),X 向右、Y 向下;spawn 的 row 表示脚底所在格的底边
 * (feet=(row+1)*TS,见 docs/design/data-and-interfaces.md 第 2 节)。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var LD = RA.LevelData;
  var AIR = RA.EMPTY_CHARS[0];                 // '+'
  var TS = C.TS;
  var MAX_COLS = LD.LIMITS.COLS;               // 600
  var MAX_ROWS = LD.LIMITS.ROWS;               // 4096(新契约上限,不再是"无限")
  var MAX_TILES = LD.LIMITS.TILES;
  var MAX_OBJECTS = LD.LIMITS.OBJECTS;
  var MAX_TITLE = LD.LIMITS.TITLE;
  var MAX_ID = LD.LIMITS.ID;
  var HISTORY_STEPS = 100;
  var HISTORY_BYTES = 32 * 1024 * 1024;        // 32 MiB(可调技术提案)

  var ID_RE = /^[A-Za-z0-9_-]+$/;

  // ===================== 小工具 =====================
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function capCols(n) { return RA.clamp(Math.round(n) || 1, 1, MAX_COLS); }
  function capRows(n) { return RA.clamp(Math.round(n) || 1, 1, MAX_ROWS); }
  function limitsText() {
    return '宽最多 ' + MAX_COLS + ' 格、高最多 ' + MAX_ROWS + ' 格、' +
      MAX_TILES + ' 格以内(JSON 导入上限)';
  }
  function byteLength(str) {
    if (typeof globalThis.TextEncoder === 'function') {
      try { return new globalThis.TextEncoder().encode(str).length; } catch (e) { /* 手算 */ }
    }
    return String(str).length * 2;
  }
  function blankTiles(cols, rows) {
    var out = [];
    for (var r = 0; r < rows; r++) out.push(new Array(cols).fill(0));
    return out;
  }
  function newLevelId() {
    var rand = Math.floor(Math.random() * 1296).toString(36);
    return 'level_' + Date.now().toString(36) + '_' + rand;
  }
  function autoTitle(taken) {
    var used = {};
    (taken || []).forEach(function (n) { used[String(n || '').trim()] = true; });
    for (var i = 1; i <= 9999; i++) {
      var name = '新楼层 ' + i;
      if (!used[name]) return name;
    }
    return '新楼层';
  }
  /** 校验问题的展示文本:带 code 与 path,便于定位格子/字段 */
  function fmtIssue(i) {
    return '[' + i.code + '] ' + (i.path || '/') + ' ' + i.message;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ===================== 工具 =====================
  var TOOLS = [
    { id: 'brush', name: '画笔', key: 'KeyB', hint: '按住左键拖动连续画' },
    { id: 'erase', name: '橡皮', key: 'KeyE', hint: '把地形擦成空气,同时移除这一格的对象/出生点' },
    { id: 'rect', name: '矩形', key: 'KeyR', hint: '拖一个方框,松手填满' },
    { id: 'fill', name: '油漆桶', key: 'KeyF', hint: '点一下,把连成一片的同种内容换掉' },
    { id: 'pick', name: '吸管', key: 'KeyK', hint: '点一下取走那一格的画笔' }
  ];

  /** 缩得很小的时候,地块用近似色画 */
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

  // ===================== 地物调色板 =====================
  /*
   * 调色板从"新契约"推导:地块来自 LevelCodec 的整数字典,对象来自 EntityRegistry
   * 里带旧字符的类型(S / x / y)。出口 G 不再是可画笔刷 —— 旧 G 只作为迁移信息显示;
   * 新格式的出口是顶边接口 ports,由图层的端口工具(T04)负责,不能随手画。
   */
  var EditorPalette = {
    build: function () {
      var out = [];
      out.push({ ch: AIR, name: '空气(橡皮)', kind: 'air' });
      LD.TILES.forEach(function (t) {
        if (t.id === 0) return;
        out.push({
          ch: t.ch, name: t.name + '(地块 ' + t.id + ')', kind: 'tile',
          image: (RA.TILE_IMAGES[t.ch] || [])[0], tileId: t.id
        });
      });
      out.push({ ch: 'P', name: '出生点(每层一个)', kind: 'spawn' });
      RA.EntityRegistry.list().forEach(function (t) {
        if (!t.letter) return;
        out.push({
          ch: t.letter, name: t.name + '(' + t.letter + ')', kind: 'object',
          type: t.type, implemented: t.implemented
        });
      });
      return out;
    },

    /** 这个字符是不是当前调色板里能选的东西(用于吸管/状态栏) */
    known: function (ch) {
      if (ch === AIR || ch === ' ') return true;
      if (LD.idOf(ch) !== null) return true;
      if ('P'.indexOf(ch) >= 0) return true;
      return !!(RA.EntityRegistry && RA.EntityRegistry.typeOfLetter(ch));
    }
  };

  // ===================== 关卡数据(唯一真值) =====================
  class EditorModel {
    /**
     * 直接用一份 LevelData 构造(内部使用,调用方应已确认结构)。
     * 外部输入请用 fromData / fromJSON / fromLegacy,它们会走共用编解码与校验。
     */
    constructor(data) {
      this.data = data;
      this.importWarnings = [];      // 迁移/导入时的说明,只展示,不写回数据
      this.importSource = '';        // 来源说明(文件名 / 内置关卡 id)
    }

    // ---------- 构造 / 导入 ----------
    /** 新建一份空白(v2)关卡;withGround=true 时铺一层地面并放好出生点 */
    static create(opts) {
      opts = opts || {};
      var cols = capCols(opts.cols || 15);
      var rows = capRows(opts.rows || 24);
      if (cols * rows > MAX_TILES) rows = Math.max(1, Math.floor(MAX_TILES / cols));
      var tiles = blankTiles(cols, rows);
      var spawn = null;
      if (opts.withGround) {
        var ground = rows - 2;
        for (var c = 0; c < cols; c++) {
          tiles[ground][c] = 1;       // 草
          tiles[ground + 1][c] = 4;   // 石
        }
        spawn = { col: 1, row: ground - 1 };
      }
      var data = {
        schemaVersion: LD.SCHEMA_VERSION,
        id: opts.id || newLevelId(),
        title: opts.title || autoTitle(opts.taken),
        kind: 'normal',
        difficulty: isInt(opts.difficulty) ? opts.difficulty : 1,
        size: { cols: cols, rows: rows },
        terrain: { tiles: tiles },
        ports: null,
        spawn: spawn,
        objects: [],
        paths: [],
        visuals: { backgroundId: null, decorations: [] },
        extensions: {},
        contentHash: null,
        certification: null
      };
      var model = new EditorModel(data);
      if (opts.source) model.importSource = opts.source;
      return model;
    }

    /** 从内存 LevelData 构造;深复制 + 共用 decode(含自报 hash 校验) */
    static fromData(data, opts) {
      opts = opts || {};
      var dec = LD.decode(data, { verifyHash: opts.verifyHash !== false });
      if (!dec.ok) return dec;
      var model = new EditorModel(dec.value);
      model.importWarnings = (dec.warnings || []).slice();
      model.importSource = opts.source || '';
      return LD.ok(model);
    }

    /** 从 v2 JSON 文本构造 */
    static fromJSON(text, opts) {
      opts = opts || {};
      var dec = LD.decode(text, { verifyHash: opts.verifyHash !== false });
      if (!dec.ok) return dec;
      var model = new EditorModel(dec.value);
      model.importWarnings = (dec.warnings || []).slice();
      model.importSource = opts.source || '';
      return LD.ok(model);
    }

    /** 旧 TXT / 旧 JSON:只走显式迁移,结果是未认证草稿 */
    static fromLegacy(input, opts) {
      opts = opts || {};
      var mig = RA.LegacyImport.migrate(input, opts);
      if (!mig.ok) return mig;
      var model = new EditorModel(mig.value.draft);
      model.importWarnings = (mig.value.warnings || []).slice();
      model.importSource = opts.source || '';
      return LD.ok(model);
    }

    /** 撤销/重做等内部恢复:数据来自本编辑器的快照,不再重复 decode */
    static fromTrusted(data) {
      return new EditorModel(LD.cloneJson(data));
    }

    // ---------- 导出 ----------
    /** 完整快照(深复制),调用方拿不到内部可变引用 */
    toData() { return LD.cloneJson(this.data); }

    /** 走共用编码器;失败返回 code/path/message */
    toJSON() { return LD.encode(this.data); }

    fileName() { return this.data.id + '.json'; }

    // ---------- 只读几何 ----------
    get cols() { return this.data.size.cols; }
    get rows() { return this.data.size.rows; }
    get title() { return this.data.title; }
    get id() { return this.data.id; }
    get kind() { return this.data.kind; }
    get difficulty() { return this.data.difficulty; }
    get backgroundId() { return this.data.visuals.backgroundId; }
    get spawn() { return this.data.spawn; }
    get objects() { return this.data.objects; }
    get paths() { return this.data.paths; }
    worldW() { return this.cols * TS; }
    worldH() { return this.rows * TS; }

    inBounds(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }

    // ---------- 元信息 ----------
    setTitle(title) {
      var t = String(title === undefined || title === null ? '' : title);
      if (t.length > MAX_TITLE) t = t.slice(0, MAX_TITLE);
      if (t === this.data.title) return false;
      this.data.title = t;
      this.invalidate();
      return true;
    }
    setDifficulty(n) {
      if (!isInt(n) || n < 1 || n > 4) return false;
      if (this.data.difficulty === n) return true;
      this.data.difficulty = n;
      this.invalidate();
      return true;
    }
    /** backgroundId = 'skyN' 或 null(按层循环) */
    setBackground(id) {
      var v = id || null;
      if (v !== null && RA.EntityRegistry.backgroundIds().indexOf(v) < 0) return false;
      if (this.data.visuals.backgroundId === v) return true;
      this.data.visuals.backgroundId = v;
      this.invalidate();
      return true;
    }
    /** 逻辑身份只在新模板/导入时确定;改名不改 id */
    setId(id) {
      var v = String(id || '').trim();
      if (!v || v.length > MAX_ID || !ID_RE.test(v)) return false;
      if (v === this.data.id) return true;
      this.data.id = v;
      this.invalidate();
      return true;
    }
    /** 派生字段:任何内容编辑后立即失效(首版保守策略) */
    invalidate() {
      this.data.contentHash = null;
      this.data.certification = null;
    }

    // ---------- 地形 ----------
    getTile(c, r) {
      if (!this.inBounds(c, r)) return 0;
      return this.data.terrain.tiles[r][c];
    }
    setTile(c, r, tileId) {
      if (!this.inBounds(c, r) || !isInt(tileId) || tileId < 0 || tileId > 5) return false;
      if (this.data.terrain.tiles[r][c] === tileId) return true;
      this.data.terrain.tiles[r][c] = tileId;
      this.invalidate();
      return true;
    }

    // ---------- 画笔适配(字符 ↔ 数据) ----------
    /** 这一格在画笔/状态栏里的显示字符:地形 > 出生点 > 对象 */
    getChar(c, r) {
      if (!this.inBounds(c, r)) return AIR;
      var tile = this.getTile(c, r);
      if (tile !== 0) return LD.charOf(tile);
      var sp = this.data.spawn;
      if (sp && sp.col === c && sp.row === r) return 'P';
      var obj = this.objectAt(c, r);
      if (obj) {
        var reg = RA.EntityRegistry.get(obj.type);
        return (reg && reg.letter) ? reg.letter : null;
      }
      return AIR;
    }

    /**
     * 统一画一格(T02A 的画笔入口):
     *   空气 → 擦掉地形/对象/出生点;地块 → 铺地并移除这一格的对象/出生点;
     *   P → 移动出生点;S/x/y → 放注册对象(默认参数、唯一 id)。
     * 返回是否产生了变化。
     */
    applyChar(c, r, ch) {
      if (!this.inBounds(c, r)) return false;
      if (ch === AIR || ch === ' ') return this.eraseCell(c, r);
      var tileId = LD.idOf(ch);
      if (tileId !== null) {
        var before = this.getTile(c, r);
        this.data.terrain.tiles[r][c] = tileId;
        var removed = this.removeObjectsAt(c, r);
        var cleared = this.clearSpawnAt(c, r);
        this.invalidate();
        return before !== tileId || removed > 0 || cleared;
      }
      if ('P'.indexOf(ch) >= 0) return this.setSpawn(c, r);
      var type = RA.EntityRegistry.typeOfLetter(ch);
      if (type) {
        var res = this.placeObject(type, c, r);
        return !!res.ok;
      }
      return false;                  // G 与未知字符不再能画
    }

    eraseCell(c, r) {
      if (!this.inBounds(c, r)) return false;
      var changed = false;
      if (this.data.terrain.tiles[r][c] !== 0) {
        this.data.terrain.tiles[r][c] = 0;
        changed = true;
      }
      if (this.removeObjectsAt(c, r) > 0) changed = true;
      if (this.clearSpawnAt(c, r)) changed = true;
      if (changed) this.invalidate();
      return changed;
    }

    // ---------- 出生点 ----------
    setSpawn(c, r) {
      if (!this.inBounds(c, r)) return false;
      var sp = this.data.spawn;
      if (sp && sp.col === c && sp.row === r) return false;
      this.data.spawn = { col: c, row: r };
      this.removeObjectsAt(c, r);
      this.invalidate();
      return true;
    }
    clearSpawnAt(c, r) {
      var sp = this.data.spawn;
      if (!sp || sp.col !== c || sp.row !== r) return false;
      this.data.spawn = null;
      this.invalidate();
      return true;
    }
    clearSpawn() {
      if (!this.data.spawn) return false;
      this.data.spawn = null;
      this.invalidate();
      return true;
    }

    // ---------- 对象 ----------
    objectsAt(c, r) {
      return this.data.objects.filter(function (o) { return o.col === c && o.row === r; });
    }
    objectAt(c, r) {
      var list = this.objectsAt(c, r);
      return list.length ? list[0] : null;
    }
    removeObjectsAt(c, r) {
      var before = this.data.objects.length;
      this.data.objects = this.data.objects.filter(function (o) {
        return !(o.col === c && o.row === r);
      });
      var n = before - this.data.objects.length;
      if (n) this.invalidate();
      return n;
    }
    removeObject(id) {
      var before = this.data.objects.length;
      this.data.objects = this.data.objects.filter(function (o) { return o.id !== id; });
      var n = before - this.data.objects.length;
      if (n) this.invalidate();
      return n;
    }
    uniqueObjectId(type) {
      var base = String(type || 'obj').replace(/[^A-Za-z0-9_-]+/g, '_') || 'obj';
      var used = {};
      this.data.objects.forEach(function (o) { used[o.id] = true; });
      for (var i = 1; i < 100000; i++) {
        var id = base + '_' + i;
        if (!used[id]) return id;
      }
      return base + '_' + Date.now().toString(36);
    }
    placeObject(type, c, r) {
      if (!RA.EntityRegistry || !RA.EntityRegistry.has(type)) {
        return LD.fail('UNKNOWN_ENTITY', '未注册的对象类型 "' + type + '"', [
          LD.issue('UNKNOWN_ENTITY', '/objects', '调色板里没有这个类型')
        ]);
      }
      if (!this.inBounds(c, r)) {
        return LD.fail('INVALID_FIELD', '位置 (' + c + ',' + r + ') 在地图外', []);
      }
      if (this.data.objects.length >= MAX_OBJECTS) {
        return LD.fail('LIMIT_EXCEEDED', '对象数已达到上限 ' + MAX_OBJECTS, []);
      }
      var params = RA.EntityRegistry.defaults(type) || {};
      var rec = {
        id: this.uniqueObjectId(type),
        type: type,
        col: c, row: r,
        params: params,
        pathId: null
      };
      this.data.objects.push(rec);
      // 对象占的格子必须是空的(和旧编辑器"用字符替换地块"一致)
      this.data.terrain.tiles[r][c] = 0;
      this.clearSpawnAt(c, r);
      this.invalidate();
      return LD.ok(rec);
    }

    // ---------- 批量绘制 ----------
    fillRect(c0, r0, c1, r1, ch) {
      var a = Math.min(c0, c1), b = Math.max(c0, c1);
      var t = Math.min(r0, r1), d = Math.max(r0, r1);
      var n = 0;
      for (var r = t; r <= d; r++) {
        for (var c = a; c <= b; c++) {
          if (this.inBounds(c, r) && this.applyChar(c, r, ch)) n++;
        }
      }
      return n;
    }

    floodFill(c, r, ch) {
      if (!this.inBounds(c, r)) return 0;
      var from = this.getChar(c, r);
      if (from === ch) return 0;
      var stack = [[c, r]], n = 0, seen = {};
      while (stack.length) {
        var p = stack.pop(), x = p[0], y = p[1];
        var key = x + ',' + y;
        if (seen[key] || !this.inBounds(x, y)) continue;
        if (this.getChar(x, y) !== from) continue;
        seen[key] = true;
        this.applyChar(x, y, ch);
        n++;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return n;
    }

    findChar(ch) {
      var out = [];
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          if (this.getChar(c, r) === ch) out.push({ c: c, r: r });
        }
      }
      return out;
    }

    /** 从 (c,r) 往下找第一块可站立地形(含单向云板) */
    groundBelow(c, r) {
      if (c < 0 || c >= this.cols) return null;
      for (var y = Math.max(0, r); y < this.rows; y++) {
        var ch = LD.charOf(this.data.terrain.tiles[y][c]);
        if (ch && RA.isGroundChar(ch)) return y;
      }
      return null;
    }

    // ---------- 尺寸 / 平移 ----------
    /** 缩小/平移会丢弃哪些内容(先给用户看,取消则零变更) */
    resizeImpact(cols, rows) {
      cols = Math.max(1, Math.min(MAX_COLS, Math.round(cols) || 1));
      rows = Math.max(1, Math.min(MAX_ROWS, Math.round(rows) || 1));
      var impact = { tiles: 0, objects: 0, paths: 0, pathPoints: 0, spawn: 0, decorations: 0, total: 0 };
      for (var r = rows; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) if (this.getTile(c, r) !== 0) impact.tiles++;
      }
      for (var c2 = cols; c2 < this.cols; c2++) {
        for (var r2 = 0; r2 < Math.min(rows, this.rows); r2++) {
          if (this.getTile(c2, r2) !== 0) impact.tiles++;
        }
      }
      this.data.objects.forEach(function (o) {
        if (o.col >= cols || o.row >= rows) impact.objects++;
      });
      this.data.paths.forEach(function (p) {
        var lost = (p.points || []).some(function (pt) { return pt.col >= cols || pt.row >= rows; });
        if (lost) {
          impact.paths++;
          impact.pathPoints += (p.points || []).length;
        }
      });
      if (this.data.spawn && (this.data.spawn.col >= cols || this.data.spawn.row >= rows)) impact.spawn = 1;
      (this.data.visuals.decorations || []).forEach(function (d) {
        if (d.col >= cols || d.row >= rows) impact.decorations++;
      });
      impact.total = impact.tiles + impact.objects + impact.paths + impact.spawn + impact.decorations;
      return impact;
    }

    /** 显式改尺寸;会丢内容时必须 allowLoss(UI 先确认),否则整次不改 */
    resize(cols, rows, opts) {
      opts = opts || {};
      cols = Math.max(1, Math.min(MAX_COLS, Math.round(cols) || 1));
      rows = Math.max(1, Math.min(MAX_ROWS, Math.round(rows) || 1));
      if (cols * rows > MAX_TILES) {
        return LD.fail('LIMIT_EXCEEDED',
          '新尺寸 ' + cols + '×' + rows + ' 有 ' + (cols * rows) + ' 格,超过上限 ' + MAX_TILES, []);
      }
      if (cols === this.cols && rows === this.rows) return LD.ok({ changed: false, impact: null });
      var impact = this.resizeImpact(cols, rows);
      if (impact.total > 0 && !opts.allowLoss) {
        return LD.fail('NEEDS_CONFIRM',
          '缩小会丢弃 ' + impact.total + ' 项内容(地形 ' + impact.tiles + ' 格、对象 ' +
          impact.objects + ' 个、路径 ' + impact.paths + ' 条、出生点 ' + impact.spawn +
          '、装饰 ' + impact.decorations + ');需要确认', [], impact);
      }
      var next = blankTiles(cols, rows);
      for (var r = 0; r < Math.min(rows, this.rows); r++) {
        for (var c = 0; c < Math.min(cols, this.cols); c++) next[r][c] = this.getTile(c, r);
      }
      this.data.size.cols = cols;
      this.data.size.rows = rows;
      this.data.terrain.tiles = next;
      if (this.data.spawn && (this.data.spawn.col >= cols || this.data.spawn.row >= rows)) {
        this.data.spawn = null;
      }
      this.data.objects = this.data.objects.filter(function (o) {
        return o.col < cols && o.row < rows;
      });
      this.data.paths = this.data.paths.filter(function (p) {
        return (p.points || []).every(function (pt) { return pt.col < cols && pt.row < rows; });
      });
      this.data.visuals.decorations = (this.data.visuals.decorations || []).filter(function (d) {
        return d.col < cols && d.row < rows;
      });
      this.invalidate();
      return LD.ok({ changed: true, impact: impact });
    }

    /**
     * 向四周扩展,并把现有内容整体平移 (left, top)。
     * 只扩大、不丢内容;返回 Result。
     */
    grow(left, right, top, bottom) {
      left = Math.max(0, Math.round(left) || 0);
      right = Math.max(0, Math.round(right) || 0);
      top = Math.max(0, Math.round(top) || 0);
      bottom = Math.max(0, Math.round(bottom) || 0);
      var cols = this.cols + left + right;
      var rows = this.rows + top + bottom;
      if (cols < 1 || rows < 1 || cols > MAX_COLS || rows > MAX_ROWS || cols * rows > MAX_TILES) {
        return LD.fail('LIMIT_EXCEEDED', '扩展后超出上限:' + limitsText(), []);
      }
      if (!left && !right && !top && !bottom) return LD.ok({ changed: false });
      var next = blankTiles(cols, rows);
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) next[r + top][c + left] = this.getTile(c, r);
      }
      this.data.size.cols = cols;
      this.data.size.rows = rows;
      this.data.terrain.tiles = next;
      this._shiftCoords(left, top);
      this.invalidate();
      return LD.ok({ changed: true, dc: left, dr: top });
    }

    /** 把对象/路线/出生点/装饰/接口 col 一起平移(不碰 extensions 里的历史坐标) */
    _shiftCoords(dc, dr) {
      if (!dc && !dr) return;
      var sp = this.data.spawn;
      if (sp) { sp.col += dc; sp.row += dr; }
      this.data.objects.forEach(function (o) { o.col += dc; o.row += dr; });
      this.data.paths.forEach(function (p) {
        (p.points || []).forEach(function (pt) { pt.col += dc; pt.row += dr; });
      });
      (this.data.visuals.decorations || []).forEach(function (d) {
        d.col += dc; d.row += dr;
      });
      if (this.data.ports) {
        var ports = this.data.ports;
        ['entry', 'exit'].forEach(function (k) {
          if (ports[k] && isInt(ports[k].col)) ports[k].col += dc;
        });
      }
    }

    /** 保证 (c,r) 在界内:不够就往左上/右下扩;返回 {dc,dr} 或 false */
    ensure(c, r) {
      var left = c < 0 ? -c : 0;
      var top = r < 0 ? -r : 0;
      var right = Math.max(0, c + 1 - this.cols);
      var bottom = Math.max(0, r + 1 - this.rows);
      if (!left && !right && !top && !bottom) return { dc: 0, dr: 0 };
      var res = this.grow(left, right, top, bottom);
      if (!res.ok) return false;
      return { dc: left, dr: top };
    }

    // ---------- 检查 ----------
    /**
     * 面向编辑器面板的校验:共用 LevelData.validate(purpose=draft),
     * 把问题拆成 errors / warnings / notes;errors 会让导出/发布失败。
     */
    validate() {
      var issues = LD.validate(this.data, { purpose: 'draft' });
      var errors = [], warnings = [], notes = [];
      issues.forEach(function (i) {
        if (i.severity === 'warning') warnings.push(fmtIssue(i));
        else errors.push(fmtIssue(i));
      });
      this.importWarnings.forEach(function (w) { warnings.push('导入: ' + w); });

      if (!String(this.data.title || '').trim()) {
        warnings.push('标题为空:显示名不影响逻辑 id,导出后仍可读,但列表里不好认');
      }
      if (this.data.ports) {
        notes.push('接口:vertical-v1 · 入口 col ' + this.data.ports.entry.col +
          ' / 出口 col ' + this.data.ports.exit.col + '(保护区与端口编辑留 T04)');
      } else {
        notes.push('接口:未设置(ports=null)。草稿可编辑/导出;试玩与发布要等 T04 端口工具');
      }
      var legacy = this.data.extensions && this.data.extensions.legacy;
      if (legacy && legacy.exit) {
        notes.push('旧出口 G 在 (' + legacy.exit.col + ',' + legacy.exit.row +
          '):只作为迁移信息显示,不代表合格接口');
      }
      if (this.data.spawn) {
        var below = this.groundBelow(this.data.spawn.col, this.data.spawn.row + 1);
        if (below === null) {
          warnings.push('出生点下面没有可站立地形,角色会一直往下掉');
        } else if (below !== this.data.spawn.row + 1) {
          notes.push('出生点不贴着下面的地面,游戏会把角色落到地面');
        }
      }
      notes.push('地图 ' + this.cols + ' × ' + this.rows + ' 格,世界 ' +
        this.worldW() + ' × ' + this.worldH() + ' px' +
        (this.rows > 12 ? '(比屏幕高,镜头会上下跟随)' : '(一屏就放得下)') +
        (this.cols > 21 ? ',比屏幕宽,要横向滚屏' : ''));
      notes.push('id: ' + this.data.id + ' · 类型: ' + this.data.kind +
        ' · 难度: ' + (this.data.difficulty === null ? '(未设置)' : this.data.difficulty) +
        ' · 背景: ' + (this.backgroundId || '自动(随层数循环)'));
      if (this.data.certification) {
        notes.push('这道关卡的认证还在,但第一次编辑后就会失效(需要重新标准试玩)');
      }
      return { errors: errors, warnings: warnings, notes: notes, issues: issues };
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
      RA.assets = this.assets;

      this.view = { x: 0, y: 0, zoom: 1 };
      this.tool = 'brush';
      this.brush = 1;
      this.ch = '^';
      this.paletteItems = [];
      this.grid = true;
      this.showEntities = true;
      this.autoGrow = true;

      this.undoStack = [];      // [{json, bytes}]
      this.redoStack = [];
      this.undoBytes = 0;
      this.redoBytes = 0;
      this.stroke = null;
      this.mouse = { x: 0, y: 0, outside: true };
      this.prevMouse = null;
      this.prevCodes = {};

      this.msg = '';
      this.msgT = 0;
      this.dirty = false;

      this.W = this.canvas.width || 800;
      this.H = this.canvas.height || 600;

      this.wire();
      this.buildPalette();
      this.buildTools();
      this.buildSkySelect();
      this.buildDifficultySelect();
      this.model = null;
      this.newLevel(15, 24, false);
      this.resize();
      this.fitView();
      this.syncUI();
      this.assets.loadAll(() => { this.buildPalette(); });
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
      click('btn-open-json', () => { var f = self.$('file-json'); if (f) f.click(); });
      click('btn-import-legacy', () => { var f = self.$('file-legacy'); if (f) f.click(); });
      on('file-json', 'change', (e) => self.openFiles(e.target.files, 'json'));
      on('file-legacy', 'change', (e) => self.openFiles(e.target.files, 'legacy'));
      on('pool-select', 'change', () => self.syncUI());

      click('btn-undo', () => self.undo());
      click('btn-redo', () => self.redo());
      click('btn-fit', () => { self.fitView(); self.say('视角已适应窗口'); });
      click('btn-brush-minus', () => self.setBrush(self.brush - 1));
      click('btn-brush-plus', () => self.setBrush(self.brush + 1));

      on('chk-grid', 'change', () => { self.grid = !!self.$('chk-grid').checked; });
      on('chk-entities', 'change', () => { self.showEntities = !!self.$('chk-entities').checked; });
      on('chk-autogrow', 'change', () => { self.autoGrow = !!self.$('chk-autogrow').checked; });

      on('name', 'input', () => {
        // 一次连续输入算一步撤销:第一次按键前记快照,失焦/回车后重新武装
        if (!self._nameUndoArmed) {
          self.pushUndo();
          self._nameUndoArmed = true;
        }
        if (self.model.setTitle(self.$('name').value.replace(/\s+/g, ' ').trim())) {
          self.markDirty();
          self._needSync = true;
        }
      });
      on('name', 'change', () => { self._nameUndoArmed = false; self.syncUI(); });
      on('name', 'blur', () => { self._nameUndoArmed = false; });
      on('w-input', 'change', () => self.changeSize(parseInt(self.$('w-input').value, 10), self.model.rows));
      on('h-input', 'change', () => self.changeSize(self.model.cols, parseInt(self.$('h-input').value, 10)));
      on('difficulty-select', 'change', () => {
        var nv = parseInt(self.$('difficulty-select').value, 10);
        if (nv === self.model.difficulty) return;
        self.pushUndo();
        if (self.model.setDifficulty(nv)) {
          self.markDirty();
          self.syncUI();
          self.say('难度改成 ' + self.model.difficulty + ' 档');
        } else {
          self.popUndo();
        }
      });
      on('sky-select', 'change', () => {
        var v = self.$('sky-select').value || null;
        if (v === self.model.backgroundId) return;
        self.pushUndo();
        if (self.model.setBackground(v)) {
          self.markDirty();
          self.syncUI();
          self.say(v ? ('这一层固定用 assets/sky/' + v + '.png') : '背景改回自动(随层数循环)');
        } else {
          self.popUndo();
        }
      });

      click('btn-export', () => self.downloadJSON());
      click('btn-copy', () => self.copyJSON());
      click('btn-view-json', () => self.showJSON());
      click('btn-play', () => self.openPlaytest());
      click('modal-close', () => self.closeModal());
      on('modal', 'click', (e) => { if (e.target === self.$('modal')) self.closeModal(); });
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
        b.title = item.name + (i < 10 ? '  [' + ((i + 1) % 10) + ']' : '') +
          (item.implemented === 'none' ? '(行为在 T05 实现)' : '');
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
        // 和游戏里同一个画法:贴图缩放到这一格(云板只画上面一截)
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
      } else if (item.kind === 'object') {
        var cls = RA.BY_LETTER[item.ch];
        if (cls) {
          cls.prototype.drawIcon(ctx, 0, 0, S);
        } else {
          RA.rect(ctx, 0, 0, S, S, [30, 36, 54], 6);
          RA.text(ctx, item.ch, Math.round(S * 0.5), [255, 255, 255], S / 2, S / 2,
            { bold: true, shadow: false });
        }
      }
    }

    highlightPalette() {
      var self = this;
      this.paletteItems.forEach(function (item) {
        if (!item.btn) return;
        item.btn.className = 'pitem' + (item.ch === self.ch ? ' on' : '');
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
      sel.innerHTML = '';
      var add = function (value, label) {
        var op = globalThis.document.createElement('option');
        op.value = value;
        op.textContent = label;
        sel.appendChild(op);
      };
      add('', '自动(随层数循环)');
      RA.EntityRegistry.backgroundIds().forEach(function (id) {
        add(id, id + ' · assets/sky/' + id + '.png');
      });
    }

    buildDifficultySelect() {
      var sel = this.$('difficulty-select');
      if (!sel) return;
      sel.innerHTML = '';
      for (var i = 1; i <= 4; i++) {
        var op = globalThis.document.createElement('option');
        op.value = String(i);
        op.textContent = i + ' 档' + (i === 1 ? '(最容易)' : '');
        sel.appendChild(op);
      }
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
    takenTitles() {
      var out = [];
      Object.keys(RA.LEVEL_TEXT || {}).forEach(function (id) {
        out.push(RA.LevelPack.levelName(RA.LEVEL_TEXT[id], id));
      });
      if (this.model) out.push(this.model.title);
      return out;
    }

    newLevel(cols, rows, withGround) {
      this.model = EditorModel.create({
        cols: cols, rows: rows, withGround: withGround,
        title: autoTitle(this.takenTitles())
      });
      this.resetHistory();
      this.dirty = false;
      this.fitView();
      this.syncUI();
      this.say(withGround ? '新建了一层(带地面、出生点;接口留空)' : '新建了一层空的');
    }

    /** 打开 v2 JSON 文本;失败不替换当前图 */
    openJSONText(text, sourceLabel) {
      var res = EditorModel.fromJSON(text, { source: sourceLabel || '' });
      if (!res.ok) {
        this.say('这份 JSON 打不开:[' + res.error.code + '] ' + res.error.message, 'bad');
        return false;
      }
      this.replaceModel(res.value);
      this.say('已打开 JSON「' + (this.model.title || this.model.id) + '」(' +
        this.model.cols + '×' + this.model.rows + ',' + this.model.objects.length + ' 个对象)');
      return true;
    }

    /** 旧 TXT / 旧 JSON:显式迁移成未认证草稿 */
    importLegacyText(text, opts) {
      opts = opts || {};
      var res = EditorModel.fromLegacy(text, {
        id: opts.id, fallbackId: opts.fallbackId || opts.id,
        source: opts.source || ''
      });
      if (!res.ok) {
        this.say('旧图迁移失败:[' + res.error.code + '] ' + res.error.message, 'bad');
        return false;
      }
      this.replaceModel(res.value);
      this.say('已把旧图迁移成草稿「' + (this.model.title || this.model.id) +
        '」—— 保留警告 ' + this.model.importWarnings.length +
        ' 条,ports 留空,不能直接试玩/发布', 'warn');
      return true;
    }

    replaceModel(model) {
      this.model = model;
      this.resetHistory();
      this.dirty = true;             // 导入的是工作副本,还没导出
      this.fitView();
      this.syncUI();
    }

    /** 打开下拉框里的内置旧关卡(只读复制,不回写 levels/) */
    openFromPool() {
      var sel = this.$('pool-select');
      var id = sel ? sel.value : '';
      if (!id) { this.say('先在下拉框里选一张内置关卡', 'bad'); return; }
      var text = (RA.LEVEL_TEXT || {})[id];
      if (!text) { this.say('读不到内置关卡「' + id + '」', 'bad'); return; }
      this.importLegacyText(text, { id: id, fallbackId: id, source: '内置关卡 ' + id });
    }

    /** 文件输入:json = v2 直接读;legacy = 旧 TXT/旧 JSON 显式迁移 */
    openFiles(files, kind) {
      var self = this;
      if (!files || !files.length) return;
      var f = files[0];
      if (!globalThis.FileReader) { self.say('这个浏览器读不了本地文件', 'bad'); return; }
      var r = new globalThis.FileReader();
      r.onload = function () {
        var text = String(r.result || '');
        var base = String(f.name || '').replace(/\.(txt|json)$/i, '');
        if (kind === 'legacy') {
          self.importLegacyText(text, { id: base, fallbackId: base, source: f.name });
        } else {
          self.openJSONText(text, f.name);
        }
      };
      r.onerror = function () { self.say('文件读不出来', 'bad'); };
      r.readAsText(f, 'utf-8');
    }

    // ================= 导出 / 复制 / 查看 =================
    exportJSON() {
      return this.model.toJSON();
    }

    downloadJSON() {
      var res = this.model.toJSON();
      if (!res.ok) {
        this.say('导出失败:[' + res.error.code + '] ' + res.error.message +
          (res.error.issues && res.error.issues[0] ? '(' + res.error.issues[0].path + ')' : ''), 'bad');
        return false;
      }
      var text = res.value;
      var name = this.model.fileName();
      try {
        var blob = new globalThis.Blob([text], { type: 'application/json;charset=utf-8' });
        var a = globalThis.document.createElement('a');
        a.href = globalThis.URL.createObjectURL(blob);
        a.download = name;
        if (globalThis.document.body) globalThis.document.body.appendChild(a);
        a.click();
        if (globalThis.document.body && globalThis.document.body.removeChild) {
          globalThis.document.body.removeChild(a);
        }
        globalThis.URL.revokeObjectURL(a.href);
        this.say('已发起导出 ' + name + '(浏览器下载;没有写进 levels/,也没有清掉未持久状态)', 'ok');
        return true;
      } catch (e) {
        this.showJSON();
        this.say('这个浏览器不让直接下载,已经把 JSON 摊开给你手动复制', 'warn');
        return false;
      }
    }

    copyJSON() {
      var res = this.model.toJSON();
      if (!res.ok) { this.say('导出失败:[' + res.error.code + '] ' + res.error.message, 'bad'); return false; }
      var nav = globalThis.navigator;
      if (nav && nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(res.value).then(() => {
          this.say('已复制这一层的 JSON 到剪贴板(文件系统没有变化)', 'ok');
        }).catch(() => {
          this.showJSON();
          this.say('复制不了,已经摊开给你手动复制', 'warn');
        });
      } else {
        this.showJSON();
        this.say('这个浏览器不支持直接复制,已经摊开给你手动复制', 'warn');
      }
      return true;
    }

    showJSON() {
      var res = this.model.toJSON();
      var box = this.$('modal-text');
      if (box) box.value = res.ok ? res.value : ('导出失败:[' + res.error.code + '] ' + res.error.message);
      var m = this.$('modal');
      if (m) m.className = 'show';
    }

    closeModal() {
      var m = this.$('modal');
      if (m) m.className = '';
    }

    /** 新格式试玩要等 T03/T04 接通共用会话;不能转成旧 TXT 偷跑 */
    openPlaytest() {
      this.say('新格式试玩还没接入(需要 T03 共用会话 + T04 连续世界);' +
        '现在不会把这一层转成旧 TXT 偷跑', 'warn');
      return false;
    }

    // ================= 回游戏 =================
    leaveForGame() {
      var dirty = !!this.dirty;
      var ask = globalThis.confirm;
      if (dirty && typeof ask === 'function') {
        var yes = ask('这一层有改动还没导出 JSON。\n\n确定要离开编辑器吗?\n' +
          '(选「否」= 留下继续;导出请用「导出 JSON」)');
        if (!yes) return false;
      }
      this.leavePage();
      return true;
    }

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

    // ================= 尺寸 =================
    changeSize(cols, rows) {
      if (isNaN(cols) || isNaN(rows)) { this.syncUI(); return false; }
      var nc = capCols(cols);
      var nr = capRows(rows);
      var impact = this.model.resizeImpact(nc, nr);
      var lossy = impact.total > 0;
      if (lossy) {
        var ask = globalThis.confirm;
        var msg = '缩小到 ' + nc + '×' + nr + ' 会丢弃:\n' +
          '· 地形 ' + impact.tiles + ' 格\n' +
          '· 对象 ' + impact.objects + ' 个\n' +
          '· 路径 ' + impact.paths + ' 条(共 ' + impact.pathPoints + ' 点)\n' +
          '· 出生点 ' + impact.spawn + '\n' +
          '· 装饰 ' + impact.decorations + '\n\n确定继续吗?(可以撤销)';
        if (typeof ask === 'function' && !ask(msg)) {
          this.syncUI();
          this.say('已取消缩小,地图没有任何改动', 'warn');
          return false;
        }
      }
      this.pushUndo();
      var res = this.model.resize(nc, nr, { allowLoss: true });
      if (!res.ok) {
        this.popUndo();
        this.say('改尺寸失败:[' + res.error.code + '] ' + res.error.message, 'bad');
        this.syncUI();
        return false;
      }
      this.markDirty();
      this.fitView();
      this.syncUI();
      this.say('尺寸改成 ' + this.model.cols + ' × ' + this.model.rows +
        (lossy ? '(已按确认丢弃界外内容,可撤销)' : ''));
      return true;
    }

    // ================= 撤销 / 重做 =================
    /**
     * 快照保存整份 LevelData(不是只有地形)。预算:最多 100 步 / 32 MiB,
     * 估算方式是真实 JSON 的 UTF-8 字节数;超出先淘汰最旧的。
     */
    snapshotJSON() {
      return JSON.stringify(this.model.toData());
    }

    pushUndo() {
      var json = this.snapshotJSON();
      var bytes = byteLength(json);
      this.undoStack.push({ json: json, bytes: bytes });
      this.undoBytes += bytes;
      this.redoStack = [];
      this.redoBytes = 0;
      while (this.undoStack.length > HISTORY_STEPS ||
        (this.undoBytes > HISTORY_BYTES && this.undoStack.length > 1)) {
        var old = this.undoStack.shift();
        this.undoBytes -= old.bytes;
      }
    }

    popUndo() {
      var old = this.undoStack.pop();
      if (old) this.undoBytes -= old.bytes;
    }

    restoreSnapshot(json) {
      var data = JSON.parse(json);
      this.model = EditorModel.fromTrusted(data);
      this.model.importWarnings = [];
      // 首版保守策略:undo/redo 不恢复旧通关资格
      this.model.invalidate();
      this.syncUI();
    }

    undo() {
      if (!this.undoStack.length) { this.say('没有可以撤销的了'); return; }
      var cur = this.snapshotJSON();
      var bytes = byteLength(cur);
      this.redoStack.push({ json: cur, bytes: bytes });
      this.redoBytes += bytes;
      var prev = this.undoStack.pop();
      this.undoBytes -= prev.bytes;
      this.restoreSnapshot(prev.json);
      this.dirty = true;
      this.say('撤销');
    }

    redo() {
      if (!this.redoStack.length) { this.say('没有可以重做的了'); return; }
      var cur = this.snapshotJSON();
      var bytes = byteLength(cur);
      this.undoStack.push({ json: cur, bytes: bytes });
      this.undoBytes += bytes;
      var next = this.redoStack.pop();
      this.redoBytes -= next.bytes;
      this.restoreSnapshot(next.json);
      this.dirty = true;
      this.say('重做');
    }

    resetHistory() {
      this.undoStack = [];
      this.redoStack = [];
      this.undoBytes = 0;
      this.redoBytes = 0;
    }

    markDirty() {
      this.dirty = true;
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
        if (this._syncT >= 0.15) this.syncUI();
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
      else if (ctrl && just('KeyS')) this.downloadJSON();
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

    /** 需要时把地图撑大,返回坐标平移量 {dc,dr};false = 到上限 */
    growTo(c0, r0, c1, r1) {
      var left = c0 < 0 ? -c0 : 0;
      var top = r0 < 0 ? -r0 : 0;
      var right = Math.max(0, c1 + 1 - this.model.cols);
      var bottom = Math.max(0, r1 + 1 - this.model.rows);
      if (!left && !right && !top && !bottom) return null;
      var res = this.model.grow(left, right, top, bottom);
      if (!res.ok) {
        this.say('画不下去了:' + res.error.message, 'bad');
        return false;
      }
      this.view.x += left * TS;
      this.view.y += top * TS;
      return { dc: left, dr: top };
    }

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
          var picked = this.model.getChar(cell.c, cell.r);
          var obj = this.model.objectAt(cell.c, cell.r);
          if (picked === null && obj) {
            this.say('这一格是未注册对象 "' + obj.type + '",画笔不能取它(位置会保留)', 'warn');
            return;
          }
          this.selectChar(picked === null ? AIR : picked);
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

    stamp(c, r, ch) {
      var n = this.brush;
      var half = Math.floor((n - 1) / 2);
      for (var dr = -half; dr < n - half; dr++) {
        for (var dc = -half; dc < n - half; dc++) {
          this.model.applyChar(c + dc, r + dr, ch);
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
      this._needSync = true;
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

      var vc0 = Math.max(0, Math.floor(this.view.x / TS));
      var vr0 = Math.max(0, Math.floor(this.view.y / TS));
      var vc1 = Math.min(m.cols - 1, Math.floor((this.view.x + B.w / z) / TS));
      var vr1 = Math.min(m.rows - 1, Math.floor((this.view.y + B.h / z) / TS));

      // 地块(直接读 LevelData.terrain.tiles,没有第二份字符地图)
      var tiny = ts < 8;
      for (r = vr0; r <= vr1; r++) {
        for (c = vc0; c <= vc1; c++) {
          var tileId = m.getTile(c, r);
          if (!tileId) continue;
          var ch = LD.charOf(tileId);
          if (!ch) continue;
          var q = this.cellToScreen(c, r);
          if (tiny) {
            ctx.fillStyle = tileColor(ch);
            ctx.fillRect(q.x, q.y, ts + 0.5, ts + 0.5);
          } else {
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

      if (this.showEntities) {
        // 对象:注册类型画自己的图标;未注册类型画占位并标出来
        var self = this;
        m.data.objects.forEach(function (obj) {
          if (obj.col < vc0 || obj.col > vc1 || obj.row < vr0 || obj.row > vr1) return;
          var q2 = self.cellToScreen(obj.col, obj.row);
          var reg = RA.EntityRegistry.get(obj.type);
          var letter = reg && reg.letter;
          var cls = letter ? RA.BY_LETTER[letter] : null;
          if (cls && ts >= 12) {
            cls.prototype.drawIcon(ctx, q2.x, q2.y, ts);
          } else if (cls) {
            ctx.fillStyle = hashColor(letter);
            ctx.fillRect(q2.x, q2.y, ts + 0.5, ts + 0.5);
          } else {
            // 注册了但没有旧字符的机关(火球/地刺/齿轮)用蓝灰占位;
            // 完全未注册的对象用紫色占位 —— 文件和画面里都不会消失
            var knownNoLetter = !!reg;
            RA.rect(ctx, q2.x + 1, q2.y + 1, ts - 2, ts - 2,
              knownNoLetter ? [34, 48, 78] : [72, 40, 96], 4);
            RA.strokeRect(ctx, q2.x + 1, q2.y + 1, ts - 2, ts - 2,
              knownNoLetter ? [120, 176, 236] : [206, 130, 255], 2, 4);
            if (ts >= 12) {
              var mark = knownNoLetter ? (obj.type || '?').slice(0, 2) : '?';
              RA.text(ctx, mark, Math.max(7, ts * 0.3),
                knownNoLetter ? [198, 224, 255] : [238, 214, 255],
                q2.x + ts / 2, q2.y + ts / 2, { bold: true, shadow: false });
            }
          }
        });

        // 出生点
        var sp = m.data.spawn;
        if (sp) {
          var q3 = this.cellToScreen(sp.col, sp.row);
          ctx.save();
          ctx.globalAlpha = 0.9;
          RA.strokeRect(ctx, q3.x + 1, q3.y + 1, ts - 2, ts - 2, [240, 150, 100], 2, 4);
          ctx.restore();
          RA.polygon(ctx, [[q3.x + ts / 2, q3.y + ts * 0.18],
            [q3.x + ts * 0.28, q3.y + ts * 0.44],
            [q3.x + ts * 0.72, q3.y + ts * 0.44]], [240, 150, 100]);
          if (ts >= 14) {
            RA.text(ctx, 'P', Math.round(ts * 0.34), [255, 210, 180],
              q3.x + ts / 2, q3.y + ts * 0.68, { bold: true, shadow: false });
          }
        }

        // 旧出口 G:只显示迁移信息,不是可编辑接口
        var legacy = m.data.extensions && m.data.extensions.legacy;
        if (legacy && legacy.exit) {
          var g = legacy.exit;
          if (!(g.col < vc0 || g.col > vc1 || g.row < vr0 || g.row > vr1)) {
            var q4 = this.cellToScreen(g.col, g.row);
            ctx.save();
            ctx.globalAlpha = 0.5;
            if (ctx.setLineDash) ctx.setLineDash([5, 4]);
            RA.strokeRect(ctx, q4.x + 2, q4.y + 2, ts - 4, ts - 4, [200, 160, 255], 2, 3);
            if (ctx.setLineDash) ctx.setLineDash([]);
            ctx.restore();
            if (ts >= 14) {
              RA.text(ctx, 'G旧', Math.round(ts * 0.26), [210, 180, 255],
                q4.x + ts / 2, q4.y + ts / 2, { bold: true, shadow: false });
            }
          }
        }
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

      RA.strokeRect(ctx, o.x, o.y, m.worldW() * z, m.worldH() * z, [120, 150, 200], 2, 0);
    }

    // ================= 状态栏 / 检查面板 =================
    updateStatus(mouse, inside) {
      if (!inside) { this.announce('鼠标不在画布上'); return; }
      var cell = this.cellAt(mouse.x, mouse.y);
      var what = '空气';
      var tileId = this.model.getTile(cell.c, cell.r);
      var obj = this.model.objectAt(cell.c, cell.r);
      var sp = this.model.spawn;
      if (tileId !== 0) {
        var info = LD.tileInfo(tileId);
        what = info ? info.name + '(地块 ' + tileId + ')' : '地块 ' + tileId;
      } else if (sp && sp.col === cell.c && sp.row === cell.r) {
        what = '出生点';
      } else if (obj) {
        var reg = RA.EntityRegistry.get(obj.type);
        what = (reg ? reg.name : '未注册对象') + ' · ' + obj.type + ' · id ' + obj.id;
      }
      var tool = TOOLS.filter((t) => t.id === this.tool)[0];
      this.announce('第 ' + (cell.r + 1) + ' 行 第 ' + (cell.c + 1) + ' 列 · ' +
        what + '   |   ' + (tool ? tool.name : '') + ' 笔刷 ' + this.brush +
        '   |   左键画 · 右键拖动平移 · 滚轮缩放 · Ctrl+Z 撤销');
    }

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
      this._lastStatus = null;
      this.announce(text, kind);
    }

    /** 把关卡列表 / 尺寸 / 检查面板刷成当前状态 */
    syncUI() {
      this._needSync = false;
      this._syncT = 0;
      var self = this;
      var set = (id, prop, val) => {
        var el = self.$(id);
        if (el) el[prop] = val;
      };
      // 正在输入标题时不要回写输入框(否则光标会跳)
      var active = globalThis.document.activeElement;
      if (!(active && active.id === 'name')) set('name', 'value', this.model.title);
      set('w-input', 'value', this.model.cols);
      set('h-input', 'value', this.model.rows);
      set('size-label', 'textContent', this.model.cols + ' × ' + this.model.rows + ' 格');
      set('id-label', 'textContent', 'id: ' + this.model.id);
      set('world-label', 'textContent',
        '世界 ' + this.model.worldW() + ' × ' + this.model.worldH() + ' px · 一格 ' + TS +
        'px · ' + limitsText());
      set('brush-label', 'textContent', String(this.brush));
      set('chk-grid', 'checked', this.grid);
      set('chk-entities', 'checked', this.showEntities);
      set('chk-autogrow', 'checked', this.autoGrow);

      var skySel = this.$('sky-select');
      if (skySel) skySel.value = this.model.backgroundId || '';
      var diffSel = this.$('difficulty-select');
      if (diffSel) diffSel.value = String(this.model.difficulty === null ? 1 : this.model.difficulty);

      // 内置关卡下拉框:只读副本
      var sel = this.$('pool-select');
      if (sel && sel.tagName !== undefined) {
        var ids = Object.keys(RA.LEVEL_TEXT || {});
        var want = ids.join(',');
        if (sel.__want !== want) {
          sel.__want = want;
          sel.innerHTML = '';
          ids.forEach(function (id) {
            var op = globalThis.document.createElement('option');
            op.value = id;
            op.textContent = id + ' · ' + RA.LevelPack.levelName(RA.LEVEL_TEXT[id], id);
            sel.appendChild(op);
          });
        }
      }
      var pl = this.$('pool-label');
      if (pl) {
        pl.textContent = '内置关卡 ' + Object.keys(RA.LEVEL_TEXT || {}).length +
          ' 张:打开后是可编辑的迁移副本;导出为新的 JSON,不回写 levels/';
      }

      // 检查面板:直接来自共用 LevelData.validate(draft)
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
  RA.EditorBoot = boot;
  if (!globalThis.RA_EDITOR_NO_BOOT) {
    if (globalThis.document.readyState === 'loading') {
      globalThis.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(globalThis.RA = globalThis.RA || {});
