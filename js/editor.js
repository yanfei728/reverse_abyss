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
  var MAX_BG_DATA = 9 * 1024 * 1024;           // 自定义关卡背景 data URL 上限
  var INLINE_BG_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  var ID_RE = /^[A-Za-z0-9_-]+$/;
  /*
   * 28/30:直接放置在画布上的运行对象(怪物、金币、弓箭手等)。这些类型只新增自己的记录,
   * 不擦真实地形/机关/出生点,也不删同格异类;同类画笔幂等由 brushObject 处理。
   * coin 是拾取物、archer 是敌对单位 —— 都走"保真放置",但计分/拾取口径分开判断。
   */
  var KEEP_PLACEMENT_TYPES = {
    fireball_static: 1, fireball_moving: 1, gear: 1, flail: 1, spike: 1, soul: 1,
    sewage_pool: 1, coin: 1, archer: 1, ghost_dash: 1, fireball_spitter: 1
  };
  function isKeepPlacementType(t) { return !!KEEP_PLACEMENT_TYPES[t]; }

  /*
   * 32:直接放置(一次左键放一个、无坐标/参数/路径表单)的类型 → 中文名。
   * 与怪物放置共用"不擦真实地形/机关、可同格异类共存、同类幂等"。
   */
  var DIRECT_PLACE_TYPES = {
    coin: '金币', archer: '弓箭手', ghost_dash: '幽灵', fireball_spitter: '喷火火球'
  };
  function isDirectPlaceType(t) {
    return Object.prototype.hasOwnProperty.call(DIRECT_PLACE_TYPES, t);
  }

  // 33:地块外观的画笔字符 ~tile:<skinId>,只在编辑器内部使用,不写进 LevelData
  var SKIN_CHAR_PREFIX = '~tile:';
  function skinChar(id) { return SKIN_CHAR_PREFIX + id; }
  function skinIdOfChar(ch) {
    return (typeof ch === 'string' && ch.indexOf(SKIN_CHAR_PREFIX) === 0)
      ? ch.slice(SKIN_CHAR_PREFIX.length) : null;
  }

  /** 33:调色板图标用的作者图键;没有登记图的类型返回 null,继续原矢量图标 */
  function paletteArtKey(type) {
    switch (type) {
      case 'coin': return 'authored/objects/coin';
      case 'archer': return 'authored/objects/archer';
      case 'ghost_dash': return 'authored/objects/ghost';
      case 'soul': return 'authored/objects/soul';
      case 'fireball_static':
      case 'fireball_moving':
      case 'fireball_spitter': return 'authored/objects/fireball';
      case 'gear': return 'authored/objects/gear';
      case 'flail': return 'authored/objects/flail_head';
      case 'sewage_pool': return 'authored/objects/sewage';
      case 'crumble_door': return 'authored/objects/door';
      case 'blink_platform': return 'authored/objects/blink_idle';
      // 34:弹簧板只有一张;地刺是同一个工具,图标用"探出"帧更好认
      case 'spring': return 'authored/objects/spring';
      case 'spike': return 'authored/objects/spike_active';
      default: return null;
    }
  }

  /**
   * 33:编辑器静态预览用的作者图。坐标是"格中心"的小数格坐标,px 是世界像素尺寸;
   * 没有作者图/未加载完时返回 null,调用方继续用原来的矢量图标。
   * 只做静态预览,不启动 World/AI,也不改对象位置/碰撞。
   */
  function editorArtPieces(obj) {
    if (!obj || !RA.ArtCatalog) return null;
    var T = TS;
    var rad = Number(obj.params && obj.params.radiusTiles);
    if (!isFinite(rad)) rad = 0.5;
    var boxPx = Math.max(4, rad * T * 2);
    var c = obj.col + 0.5, r = obj.row + 0.5;
    function one(key, px) { return [{ key: key, c: c, r: r, px: px }]; }
    switch (obj.type) {
      case 'coin': return obj.collected ? null : one('authored/objects/coin', 22.5);
      case 'archer': return one('authored/objects/archer', boxPx);
      case 'ghost_dash': return one('authored/objects/ghost', boxPx);
      case 'soul': return one('authored/objects/soul', boxPx);
      case 'fireball_static':
      case 'fireball_moving':
      case 'fireball_spitter': return one('authored/objects/fireball', boxPx);
      case 'gear': return one('authored/objects/gear', boxPx);
      case 'sewage_pool': return one('authored/objects/sewage', T);
      case 'crumble_door': return obj.broken ? null : one('authored/objects/door', T);
      case 'blink_platform':
        if (obj.state === 'gone') return null;
        return one(obj.state === 'warning' ? 'authored/objects/blink_warning' : 'authored/objects/blink_idle', T);
      case 'flail': {
        if (!RA.flailHead) return null;
        var fh = RA.flailHead(obj);
        return [
          { key: 'authored/objects/flail_chain', c: fh.anchor.x / T, r: fh.anchor.y / T, px: 0,
            chain: { c: fh.x / T, r: fh.y / T } },
          { key: 'authored/objects/flail_head', c: fh.x / T, r: fh.y / T, px: fh.radius * 2 }
        ];
      }
      // 34:弹簧板整格底边锚点;地刺按 spikeGeom 的底座/尖刺包络画,两帧共用一个工具
      case 'spring': return one('authored/objects/spring', T);
      case 'spike': {
        var active = obj.state === 'active';
        var key = active ? 'authored/objects/spike_active' : 'authored/objects/spike_idle';
        var meta = RA.ArtCatalog && RA.ArtCatalog.get ? RA.ArtCatalog.get(key) : null;
        var M = RA.C.MONSTER || {};
        var baseH = M.spikeBaseHeight || 12, spikeH = M.spikeHeight || 16;
        var rect = active
          ? { x: obj.col + 2 / T, y: obj.row + (T - baseH - spikeH) / T, w: (T - 4) / T, h: (baseH + spikeH) / T }
          : { x: obj.col + 2 / T, y: obj.row + (T - baseH) / T, w: (T - 4) / T, h: baseH / T };
        return [{ key: key, rect: rect, bbox: meta && meta.bbox }];
      }
      default: return null;
    }
  }

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
    { id: 'pick', name: '吸管', key: 'KeyK', hint: '点一下取走那一格的画笔' },
    { id: 'select', name: '选段', key: 'KeyQ', hint: '框选 2×1 云板,再在右侧标记起点/终点' }
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
        // 33:普通实心 1–4 已并入下面「地块」分类的 15 款外观,不再重复摆一排旧笔刷;
        // 云板(id5)没有新外观版本,继续作为唯一笔刷保留。旧图里的 ^ _ ~ = 仍可被吸管选中/原样绘制。
        if (t.id >= 1 && t.id <= 4) return;
        out.push({
          ch: t.ch, name: t.name + '(地块 ' + t.id + ')', kind: 'tile',
          image: (RA.TILE_IMAGES[t.ch] || [])[0], tileId: t.id
        });
      });
      RA.EntityRegistry.list().forEach(function (t) {
        out.push({
          ch: t.letter || ('~' + t.type), name: t.name + (t.letter ? '(' + t.letter + ')' : ''), kind: 'object',
          type: t.type, short: t.letter || t.name, implemented: t.implemented
        });
      });
      // 33:新增「地块」分类 —— 15 款普通实心方块外观(只有普通碰撞,没有交互)
      if (RA.TileSkins) {
        out.push({ kind: 'head', name: '地块(普通实心块外观)', ch: '' });
        RA.TileSkins.list().forEach(function (s) {
          out.push({
            ch: skinChar(s.id), name: s.name + '(地块外观)', kind: 'skin',
            skinId: s.id, image: s.asset, short: s.name
          });
        });
      }
      return out;
    },

    /** 这个字符是不是当前调色板里能选的东西(用于吸管/状态栏) */
    known: function (ch) {
      if (ch === AIR || ch === ' ') return true;
      if (LD.idOf(ch) !== null) return true;
      if (skinIdOfChar(ch)) return !!(RA.TileSkins && RA.TileSkins.has(skinIdOfChar(ch)));
      if (ch && ch.charAt(0) === '~') return !!RA.EntityRegistry;
      return !!(RA.EntityRegistry && RA.EntityRegistry.typeOfLetter(ch));
    }
  };

  /** 编辑器偏好(主题/自动扩图等)统一存 ra_editor_preferences_v1;读失败按默认 */
  function loadPrefs() {
    try {
      var raw = globalThis.localStorage && localStorage.getItem('ra_editor_preferences_v1');
      if (!raw) return null;
      var p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    } catch (e) { return null; }
  }
  function loadTheme() {
    var p = loadPrefs();
    if (!p) return (globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    return p.theme === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    var light = theme !== 'dark';
    if (globalThis.document && document.body) document.body.dataset.theme = light ? 'light' : 'dark';
    var b = globalThis.document && document.getElementById('btn-theme');
    if (b) b.textContent = light ? '◐ 深色' : '◐ 浅色';
  }

  // ===================== 关卡数据(唯一真值) =====================
  class EditorModel {
    /**
     * 直接用一份 LevelData 构造(内部使用,调用方应已确认结构)。
     * 外部输入请用 fromData / fromJSON / fromLegacy,它们会走共用编解码与校验。
     */
    constructor(data) {
      this.data = data;
      this.readOnly = !!(data && (data.kind === 'boss' || data.kind === 'lobby' || data.kind === 'rest' ||
        (data.extensions && data.extensions.fixedScene)));
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
        spawn = null; // B4:起点由云板端点承担,不再自动放旧 P
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

    /**
     * 共享的"候选模型"闸门:decode 之后还要按 draft 用途做结构校验。
     * 有 error 就不构造可提交模型(A2);warning(缺 ports、未知对象、断引用)允许,
     * 这样不完整草稿仍能打开、编辑、备份。
     */
    static checkCandidate(data, opts, source) {
      var issues = LD.validate(data, { purpose: 'draft' });
      var errors = LD.errorsOf(issues);
      if (errors.length) {
        return LD.fail(errors[0].code,
          '这份草稿还有结构错误:' + errors[0].path + ' ' + errors[0].message +
          '(当前图不会被替换)', errors);
      }
      var model = new EditorModel(data);
      model.importWarnings = ((opts && opts.warnings) || []).slice();
      model.importSource = source || '';
      return LD.ok(model);
    }

    /** 从内存 LevelData 构造;深复制 + 共用 decode(含自报 hash 校验)+ draft 结构校验 */
    static fromData(data, opts) {
      opts = opts || {};
      var dec = LD.decode(data, { verifyHash: opts.verifyHash !== false });
      if (!dec.ok) return dec;
      return EditorModel.checkCandidate(dec.value,
        { warnings: dec.warnings }, opts.source || '');
    }

    /** 从 v2 JSON 文本构造 */
    static fromJSON(text, opts) {
      opts = opts || {};
      var dec = LD.decode(text, { verifyHash: opts.verifyHash !== false });
      if (!dec.ok) return dec;
      return EditorModel.checkCandidate(dec.value,
        { warnings: dec.warnings }, opts.source || '');
    }

    /** 旧 TXT / 旧 JSON:只走显式迁移,结果是未认证草稿 */
    static fromLegacy(input, opts) {
      opts = opts || {};
      var mig = RA.LegacyImport.migrate(input, opts);
      if (!mig.ok) return mig;
      return EditorModel.checkCandidate(mig.value.draft,
        { warnings: mig.value.warnings }, opts.source || '');
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
    get backgroundImage() { return this.data.visuals.backgroundImage || null; }
    get backgroundName() { return this.data.visuals.backgroundName || ''; }
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
    /** backgroundId = assets/background/catalog.js 里的小背景 id,或 null(无背景) */
    setBackground(id) {
      var v = id || null;
      if (v !== null && RA.EntityRegistry.backgroundIds().indexOf(v) < 0) return false;
      var hadCustom = !!this.data.visuals.backgroundImage;
      if (this.data.visuals.backgroundId === v && !hadCustom) return true;
      this.data.visuals.backgroundId = v;
      delete this.data.visuals.backgroundImage;
      delete this.data.visuals.backgroundName;
      this.invalidate();
      return true;
    }

    /**
     * 40:每关从文件夹选的自定义背景(data URL);不同关卡各存一份,
     * 写入 visuals.backgroundImage/backgroundName。选中后清空内置 backgroundId。
     */
    setBackgroundImage(dataUrl, name) {
      if (typeof dataUrl !== 'string' || !INLINE_BG_RE.test(dataUrl)) return false;
      if (dataUrl.length > MAX_BG_DATA) return false;
      var n = String(name || '自定义背景').trim().slice(0, 160) || '自定义背景';
      if (this.data.visuals.backgroundImage === dataUrl && this.backgroundName === n) return true;
      this.data.visuals.backgroundId = null;
      this.data.visuals.backgroundImage = dataUrl;
      this.data.visuals.backgroundName = n;
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
      var before = this.data.terrain.tiles[r][c];
      if (before === tileId) {
        // 同值不算变更;但如果这一格残留了非实心格上的外观,顺手清掉(仍是真实修正)
        if (!(tileId >= 1 && tileId <= 4) && this.tileSkinAt(c, r)) return this._setSkin(c, r, null);
        return true;
      }
      this.data.terrain.tiles[r][c] = tileId;
      // 33:地块被换掉时旧外观不再成立(尤其换成空气/云板必须清)
      if (this.tileSkinAt(c, r)) this._setSkin(c, r, null);
      this.invalidate();
      return true;
    }

    // ---------- 33:地块外观(visuals.tileSkins 稀疏表,只影响显示) ----------
    /** 这一格的外观 id;没有返回 null */
    tileSkinAt(c, r) {
      var list = this.data.visuals && this.data.visuals.tileSkins;
      if (!Array.isArray(list)) return null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].col === c && list[i].row === r) return list[i].skinId || null;
      }
      return null;
    }
    /** 写/清一格外观;无变化返回 false(不占撤销、不改 dirty/hash) */
    _setSkin(c, r, skinId) {
      if (!this.inBounds(c, r)) return false;
      var cur = this.tileSkinAt(c, r);
      var want = skinId || null;
      if (cur === want) return false;
      var vis = this.data.visuals;
      if (!vis || typeof vis !== 'object') vis = this.data.visuals = { backgroundId: null, decorations: [] };
      var list = Array.isArray(vis.tileSkins) ? vis.tileSkins : null;
      if (!list) {
        if (!want) return false;
        list = vis.tileSkins = [];
      }
      var idx = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].col === c && list[i].row === r) { idx = i; break; }
      }
      if (want) {
        if (idx >= 0) list[idx].skinId = want;
        else list.push({ col: c, row: r, skinId: want });
      } else if (idx >= 0) {
        list.splice(idx, 1);
        if (!list.length) delete vis.tileSkins;    // 删最后一项:移除可选字段(撤销可恢复原状)
      }
      this.invalidate();
      return true;
    }
    /**
     * 33:画笔写一格"地块外观":terrain=4 + skin,一次完成;外观不是第二份碰撞真值。
     * 同格同款重涂为 no-op(不占撤销/hash/dirty)。
     */
    paintTileSkin(c, r, skinId) {
      if (this.readOnly || !this.inBounds(c, r)) return false;
      if (!RA.TileSkins || !RA.TileSkins.has(skinId)) return false;
      var beforeTile = this.getTile(c, r);
      if (beforeTile === 4 && this.tileSkinAt(c, r) === skinId &&
        !this.objectAt(c, r) && !(this.data.spawn && this.data.spawn.col === c && this.data.spawn.row === r)) {
        return false;
      }
      this.data.terrain.tiles[r][c] = 4;
      this.removeObjectsAt(c, r);
      this.clearSpawnAt(c, r);
      this._setSkin(c, r, skinId);
      this.invalidate();
      return true;
    }
    /** 33:这一格所有要画的东西:基础地形字符 + 外观 id(给编辑器/运行查询共用) */
    tileLook(c, r) {
      return { tile: this.getTile(c, r), skinId: this.tileSkinAt(c, r) };
    }

    // ---------- 画笔适配(字符 ↔ 数据) ----------
    /** 这一格在画笔/状态栏里的显示字符:地形 > 出生点 > 对象 */
    getChar(c, r) {
      if (!this.inBounds(c, r)) return AIR;
      var tile = this.getTile(c, r);
      if (tile !== 0) {
        var skin = this.tileSkinAt(c, r);
        if (skin) return skinChar(skin);
        return LD.charOf(tile);
      }
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
     *   ~tile:<skinId> → 普通实心块 + 地块外观(33);
     *   P → 移动出生点;S/x/y → 放注册对象(默认参数、唯一 id);
     *   返回是否产生了变化。
     */
    applyChar(c, r, ch) {
      if (this.readOnly || !this.inBounds(c, r)) return false;
      if (ch === AIR || ch === ' ') return this.eraseCell(c, r);
      var skinId = skinIdOfChar(ch);
      if (skinId) {
        if (!RA.TileSkins || !RA.TileSkins.has(skinId)) return false;
        return this.paintTileSkin(c, r, skinId);
      }
      var tileId = LD.idOf(ch);
      if (tileId !== null) {
        var before = this.getTile(c, r);
        this.data.terrain.tiles[r][c] = tileId;
        // 33:普通地形/云板覆盖清掉该格旧外观
        this._setSkin(c, r, null);
        var removed = this.removeObjectsAt(c, r);
        var cleared = this.clearSpawnAt(c, r);
        this.invalidate();
        return before !== tileId || removed > 0 || cleared;
      }
      if (ch && ch.charAt(0) === '~') return this.brushObject(ch.slice(1), c, r);
      var type = RA.EntityRegistry.typeOfLetter(ch);
      if (type) return this.brushObject(type, c, r);
      return false;                  // G 与未知字符不再能画
    }

    /**
     * 普通机关画笔(A1):同一格同类型是**幂等**的 —— 已有对象保持原 id、参数、
     * 未知字段,不新增、不重置;换一种机关才覆盖,并且整次操作可撤销。
     * 按住画笔每帧采样、拖动回访同一格、大笔刷重叠都走这里。
     *
     * 显式 placeObject() 仍保留"创建一个记录"的语义(未来对象工具可能允许叠放);
     * 两者不要混用:画笔不能靠删掉旧对象再重建来假装只有一个。
     */
    brushObject(type, c, r) {
      if (!this.inBounds(c, r)) return false;
      var at = this.objectsAt(c, r);
      for (var i = 0; i < at.length; i++) {
        if (at[i].type === type) return false;   // 同格同类:保持原记录,不做任何修改
      }
      var replaced = at.length > 0;
      // 28:怪物可与同格异类共存(包括池/魂);不删除既有地形/机关/怪物
      if (replaced && !isKeepPlacementType(type)) this.removeObjectsAt(c, r);
      var res = this.placeObject(type, c, r);
      return !!res.ok || (replaced && !isKeepPlacementType(type));
    }

    eraseCell(c, r) {
      if (!this.inBounds(c, r)) return false;
      var changed = false;
      if (this.data.terrain.tiles[r][c] !== 0) {
        this.data.terrain.tiles[r][c] = 0;
        changed = true;
      }
      if (this._setSkin(c, r, null)) changed = true;   // 33:同格外观一起清
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
      return this.removeObjectsWhere(function (o) { return o.col === c && o.row === r; });
    }
    removeObject(id) {
      return this.removeObjectsWhere(function (o) { return o.id === id; });
    }
    // 只释放本次删除对象的最后引用；未知类型的引用与历史孤立路径也保真。
    // 与 objects 同属已有整图编辑事务，不另建撤销点。
    removeObjectsWhere(predicate) {
      var removed = this.data.objects.filter(predicate);
      if (!removed.length) return 0;
      var deleted = new Set(removed);
      var candidates = new Set(removed.map(function (o) { return o.pathId; }).filter(Boolean));
      this.data.objects = this.data.objects.filter(function (o) { return !deleted.has(o); });
      this.data.objects.forEach(function (o) { candidates.delete(o.pathId); });
      this.data.paths = this.data.paths.filter(function (p) { return !candidates.has(p.id); });
      this.invalidate();
      return removed.length;
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
      // 27/28:怪物不替换真实地形/机关,也不删同格异类;同类画笔幂等由 brushObject 处理
      if (!isKeepPlacementType(type)) {
        this.data.terrain.tiles[r][c] = 0;
        this._setSkin(c, r, null);        // 33:机关/地块工具清地形时,同格外观一起清
        this.clearSpawnAt(c, r);
      }
      this.invalidate();
      return LD.ok(rec);
    }

    objectById(id) {
      for (var i = 0; i < this.data.objects.length; i++) {
        if (this.data.objects[i].id === id) return this.data.objects[i];
      }
      return null;
    }

    /** 对象属性面板:保留未知字段;pathId 有路径时把初始格对齐路径首点 */
    updateObject(id, fields) {
      var o = this.objectById(id);
      if (!o) return LD.fail('INVALID_FIELD', '找不到对象 ' + id, []);
      fields = fields || {};
      if (fields.type !== undefined) {
        if (!RA.EntityRegistry.has(fields.type)) {
          return LD.fail('UNKNOWN_ENTITY', '未注册的对象类型 "' + fields.type + '"', []);
        }
        o.type = fields.type;
      }
      if (fields.params && typeof fields.params === 'object') {
        Object.keys(fields.params).forEach(function (k) { o.params[k] = fields.params[k]; });
      }
      if (fields.pathId !== undefined) o.pathId = fields.pathId || null;
      if (fields.col !== undefined) o.col = fields.col;
      if (fields.row !== undefined) o.row = fields.row;
      if (o.pathId) {
        var path = this.data.paths.filter(function (pth) { return pth.id === o.pathId; })[0];
        if (path && path.points && path.points.length) {
          o.col = path.points[0].col;
          o.row = path.points[0].row;
        }
      }
      if (!this.inBounds(o.col, o.row)) return LD.fail('INVALID_FIELD', '对象位置在地图外', []);
      this.data.terrain.tiles[o.row][o.col] = 0;
      this._setSkin(o.col, o.row, null);   // 33:清出来变成空气,外观不再成立
      this.clearSpawnAt(o.col, o.row);
      this.invalidate();
      return LD.ok(o);
    }

    /** B4:把一个 2×1 云板锚点设为 start/finish;只写元信息,不改地形真值 */
    setCloudEndpoint(role, col, row) {
      if (this.readOnly) return LD.fail('READ_ONLY', '固定场景只读', []);
      if (role !== 'start' && role !== 'finish') return LD.fail('INVALID_FIELD', '端点角色必须是 start/finish', []);
      if (!isInt(col) || !isInt(row)) return LD.fail('INVALID_FIELD', '端点 col/row 必须是整数', []);
      var cols = this.data.size.cols, rows = this.data.size.rows;
      if (col < 0 || row < 0 || col + 1 >= cols || row >= rows) {
        return LD.fail('INVALID_PORT', role + ' 的 2×1 云板在地图外', []);
      }
      var tiles = this.data.terrain.tiles;
      if (tiles[row][col] !== 5 || tiles[row][col + 1] !== 5) {
        return LD.fail('INVALID_PORT', role + ' 必须从连续两格云板(5)开始', []);
      }
      var support = function (c) { return c >= 0 && c < cols && tiles[row][c] >= 1 && tiles[row][c] <= 4; };
      if (!support(col - 1) || !support(col + 2)) {
        return LD.fail('INVALID_PORT', role + ' 云板左右各一格必须是普通实心地形', []);
      }
      var prev = this.data.ports;
      var next = {};
      if (prev && prev.profile === RA.CloudPipe.CLOUD.profile) {
        Object.keys(prev).forEach(function (k) {
          if (k !== 'start' && k !== 'finish' && k !== 'profile') next[k] = LD.cloneJson(prev[k], '/ports/' + k);
        });
        next.start = prev.start ? LD.cloneJson(prev.start, '/ports/start') : null;
        next.finish = prev.finish ? LD.cloneJson(prev.finish, '/ports/finish') : null;
      }
      next.profile = RA.CloudPipe.CLOUD.profile;
      next[role] = { col: col, row: row };
      if (next.start && next.finish && !(next.start.row > next.finish.row)) {
        return LD.fail('INVALID_PORT', 'start 必须低于 finish(start.row > finish.row)', []);
      }
      this.data.ports = next;
      this.invalidate();
      return LD.ok(this.data.ports);
    }

    clearCloudEndpoint(role) {
      if (this.readOnly) return LD.fail('READ_ONLY', '固定场景只读', []);
      if (!this.data.ports || !RA.CloudPipe || !RA.CloudPipe.isCloud(this.data.ports)) return LD.ok({ changed: false });
      if (!this.data.ports[role]) return LD.ok({ changed: false });
      this.data.ports[role] = null;
      this.invalidate();
      return LD.ok({ changed: true });
    }

    clearCloudPorts() {
      if (this.readOnly) return LD.fail('READ_ONLY', '固定场景只读', []);
      if (!this.data.ports) return LD.ok({ changed: false });
      this.data.ports = null;
      this.invalidate();
      return LD.ok({ changed: true });
    }

    /** 设置 vertical-v1 接口;缺失时创建,已有时只改 col */
    setPorts(entryCol, exitCol) {
      if (this.readOnly) return LD.fail('READ_ONLY', '固定场景只读', []);
      if (!isInt(entryCol) || !isInt(exitCol)) {
        return LD.fail('INVALID_FIELD', '入口/出口 col 必须是整数', []);
      }
      var prev = this.data.ports || {};
      this.data.ports = {
        profile: 'vertical-v1',
        entry: Object.assign({}, prev.entry || {}, { col: entryCol }),
        exit: Object.assign({}, prev.exit || {}, { col: exitCol })
      };
      Object.keys(prev).forEach(function (k) {
        if (k !== 'entry' && k !== 'exit' && k !== 'profile') this.data.ports[k] = prev[k];
      }, this);
      this.invalidate();
      return LD.ok(this.data.ports);
    }

    clearPorts() {
      if (this.readOnly) return LD.fail('READ_ONLY', '固定场景只读', []);
      if (!this.data.ports) return LD.ok({ changed: false });
      this.data.ports = null;
      this.invalidate();
      return LD.ok({ changed: true });
    }

    uniquePathId() {
      var used = {};
      (this.data.paths || []).forEach(function (p) { used[p.id] = true; });
      for (var i = 1; i < 10000; i++) if (!used['path_' + i]) return 'path_' + i;
      return 'path_' + Date.now().toString(36);
    }

    addPath(mode, points) {
      if (mode !== 'loop' && mode !== 'pingpong') {
        return LD.fail('INVALID_FIELD', '路径模式只能是 loop / pingpong', []);
      }
      if (!Array.isArray(points) || points.length < 2) {
        return LD.fail('INVALID_FIELD', '路径至少需要 2 个点', []);
      }
      for (var i = 0; i < points.length; i++) {
        if (!points[i] || !isInt(points[i].col) || !isInt(points[i].row) ||
          !this.inBounds(points[i].col, points[i].row)) {
          return LD.fail('INVALID_FIELD', '路径点必须都在地图内且为整数', []);
        }
      }
      var path = { id: this.uniquePathId(), mode: mode, points: points.map(function (p) { return { col: p.col, row: p.row }; }) };
      this.data.paths.push(path);
      this.invalidate();
      return LD.ok(path);
    }

    updatePath(id, mode, points) {
      var path = this.data.paths.filter(function (p) { return p.id === id; })[0];
      if (!path) return LD.fail('INVALID_FIELD', '找不到路径 ' + id, []);
      if (mode !== 'loop' && mode !== 'pingpong') return LD.fail('INVALID_FIELD', '路径模式只能是 loop / pingpong', []);
      if (!Array.isArray(points) || points.length < 2) return LD.fail('INVALID_FIELD', '路径至少需要 2 个点', []);
      for (var i = 0; i < points.length; i++) {
        if (!points[i] || !isInt(points[i].col) || !isInt(points[i].row) ||
          !this.inBounds(points[i].col, points[i].row)) {
          return LD.fail('INVALID_FIELD', '路径点必须都在地图内且为整数', []);
        }
      }
      path.mode = mode;
      path.points = points.map(function (p) { return { col: p.col, row: p.row }; });
      this.invalidate();
      return LD.ok(path);
    }

    removePath(id) {
      var used = this.data.objects.some(function (o) { return o.pathId === id; });
      if (used) return LD.fail('IN_USE', '路径 ' + id + ' 仍被对象引用,先改掉对象的 pathId', []);
      var before = this.data.paths.length;
      this.data.paths = this.data.paths.filter(function (p) { return p.id !== id; });
      if (this.data.paths.length !== before) this.invalidate();
      return LD.ok({ removed: before !== this.data.paths.length });
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
    /** 接口开口在当前宽度下是否仍然合法(A3);返回失效的端口数(0~2) */
    portsInvalidAt(cols) {
      var ports = this.data.ports;
      if (!ports) return 0;
      var opening = LD.PORT.openingCols;
      var bad = 0;
      ['entry', 'exit'].forEach(function (k) {
        var end = ports[k];
        if (!end || !isInt(end.col) || end.col < 0 || end.col + opening > cols) bad++;
      });
      return bad;
    }

    /**
     * 缩小/平移会丢弃哪些内容(先给用户看,取消则零变更)。
     * 接口开口也算影响:缩小到开口放不下时,端口会失效(A3)。
     */
    resizeImpact(cols, rows) {
      cols = Math.max(1, Math.min(MAX_COLS, Math.round(cols) || 1));
      rows = Math.max(1, Math.min(MAX_ROWS, Math.round(rows) || 1));
      var impact = {
        tiles: 0, objects: 0, paths: 0, pathPoints: 0,
        spawn: 0, decorations: 0, ports: 0, skins: 0, total: 0
      };
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
      // 33:缩图会丢的地块外观也算进确认内容
      (this.data.visuals && this.data.visuals.tileSkins || []).forEach(function (s) {
        if (!s || s.col >= cols || s.row >= rows) impact.skins++;
      });
      impact.ports = this.portsInvalidAt(cols);
      impact.total = impact.tiles + impact.objects + impact.paths + impact.spawn +
        impact.decorations + impact.ports + impact.skins;
      return impact;
    }

    /** 退役记录是否放得下(写入前检查,失败整次不改) */
    retirePortsAllowed() {
      var ext = this.data.extensions;
      if (!ext || typeof ext !== 'object' || Array.isArray(ext)) {
        return LD.fail('INVALID_FIELD', 'extensions 不是对象,无法保存退役接口记录', []);
      }
      if (ext.retiredPorts !== undefined && !Array.isArray(ext.retiredPorts)) {
        return LD.fail('INVALID_FIELD',
          'extensions.retiredPorts 已存在但不是数组,不能覆盖原记录;请先手工处理', []);
      }
      return LD.ok({ allowed: true });
    }

    /**
     * 把失效的接口**完整**搬到待修复记录,再把 ports 置空(A3)。
     * 不夹取 col、不假装接口还有效;原图已有 retiredPorts 时只追加,不覆盖。
     */
    retirePorts(originalPorts, beforeSize) {
      var allowed = this.retirePortsAllowed();
      if (!allowed.ok) return allowed;
      if (!originalPorts) return LD.ok({ retired: false });
      var ext = this.data.extensions;
      if (!Array.isArray(ext.retiredPorts)) ext.retiredPorts = [];
      ext.retiredPorts.push({
        source: 'editor-resize',
        profile: originalPorts.profile || null,
        ports: LD.cloneJson(originalPorts, '/ports'),
        before: {
          cols: beforeSize && isInt(beforeSize.cols) ? beforeSize.cols : this.cols,
          rows: beforeSize && isInt(beforeSize.rows) ? beforeSize.rows : this.rows
        }
      });
      this.data.ports = null;
      this.invalidate();
      return LD.ok({ retired: true, count: ext.retiredPorts.length });
    }

    /**
     * 在完整候选副本上做有损缩图(A3-C):
     * 改变尺寸 → 追加退役接口 → 清派生字段 → 共享 encode。
     * 只有候选本身能导出才返回;原模型、历史、dirty、视角都不动。
     * 容量/结构失败返回原错误(如 LIMIT_EXCEEDED),不截断作者信息。
     */
    resizeCandidate(cols, rows, opts) {
      opts = opts || {};
      cols = Math.max(1, Math.min(MAX_COLS, Math.round(cols) || 1));
      rows = Math.max(1, Math.min(MAX_ROWS, Math.round(rows) || 1));
      if (cols === this.cols && rows === this.rows) {
        return LD.ok({ changed: false, impact: null, model: null });
      }
      var candidate = EditorModel.fromTrusted(this.toData());
      var res = candidate._resizeInPlace(cols, rows, opts);
      if (!res.ok) return res;
      var enc = candidate.toJSON();
      if (!enc.ok) {
        var issues = enc.error.issues || [];
        var code = (issues[0] && issues[0].code) || enc.error.code;
        return LD.fail(code,
          '缩图后的草稿无法导出,已保持原图:' + enc.error.message, issues);
      }
      return LD.ok({
        changed: true, impact: res.value.impact,
        retired: res.value.retired, model: candidate
      });
    }

    /** 显式改尺寸;会丢内容时必须 allowLoss(UI 先确认),否则整次不改。原子提交候选。 */
    resize(cols, rows, opts) {
      var built = this.resizeCandidate(cols, rows, opts);
      if (!built.ok) return built;
      if (!built.value.changed) return LD.ok({ changed: false, impact: null });
      this.data = built.value.model.data;
      return LD.ok({
        changed: true, impact: built.value.impact, retired: built.value.retired
      });
    }

    /** 旧实现:原地改;只允许经 resizeCandidate 在副本上调用 */
    _resizeInPlace(cols, rows, opts) {
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
          '、装饰 ' + impact.decorations + '、地块外观 ' + impact.skins +
          '、接口 ' + impact.ports + ' 个);需要确认', [], impact);
      }
      // 写入前先确认退役接口有地方可放,失败就整次不改
      var originalPorts = null;
      var beforeSize = { cols: this.cols, rows: this.rows };
      if (impact.ports > 0) {
        var probe = this.retirePortsAllowed();
        if (!probe.ok) return probe;
        originalPorts = LD.cloneJson(this.data.ports, '/ports');
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
      this.removeObjectsWhere(function (o) {
        return o.col >= cols || o.row >= rows;
      });
      this.data.paths = this.data.paths.filter(function (p) {
        return (p.points || []).every(function (pt) { return pt.col < cols && pt.row < rows; });
      });
      this.data.visuals.decorations = (this.data.visuals.decorations || []).filter(function (d) {
        return d.col < cols && d.row < rows;
      });
      // 33:缩小后丢掉越界的地块外观;真的丢了才动这个可选字段(不无端改旧图)
      var visOwn = this.data.visuals;
      if (Array.isArray(visOwn.tileSkins)) {
        var keptSkins = visOwn.tileSkins.filter(function (s) {
          return s && isInt(s.col) && isInt(s.row) && s.col >= 0 && s.col < cols && s.row >= 0 && s.row < rows;
        });
        if (keptSkins.length !== visOwn.tileSkins.length) {
          if (keptSkins.length) visOwn.tileSkins = keptSkins;
          else delete visOwn.tileSkins;
        }
      }
      var retired = null;
      if (impact.ports > 0 && originalPorts) {
        var ret = this.retirePorts(originalPorts, beforeSize);
        if (!ret.ok) return ret;          // 预检过,理论上不会失败;失败也不留半改状态
        retired = { count: impact.ports, record: ret.value };
      }
      this.invalidate();
      return LD.ok({ changed: true, impact: impact, retired: retired });
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
      // 33:地块外观和地形一起平移,元数据不偏一格
      (this.data.visuals && this.data.visuals.tileSkins || []).forEach(function (s) {
        if (s && isInt(s.col) && isInt(s.row)) { s.col += dc; s.row += dr; }
      });
      if (this.data.ports) {
        var ports = this.data.ports;
        ['entry', 'exit'].forEach(function (k) {
          if (ports[k] && isInt(ports[k].col)) ports[k].col += dc;
        });
        ['start', 'finish'].forEach(function (k) {
          if (ports[k] && isInt(ports[k].col) && isInt(ports[k].row)) {
            ports[k].col += dc; ports[k].row += dr;
          }
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

    /** 内容包络:地形/对象/路径/端点/出生/装饰;未知对象仍按坐标计入,不静默丢 */
    contentBounds() {
      var unknown = false;
      var minC = this.cols, minR = this.rows, maxC = -1, maxR = -1;
      function add(col, row) {
        if (!isInt(col) || !isInt(row)) return;
        if (col < minC) minC = col; if (col > maxC) maxC = col;
        if (row < minR) minR = row; if (row > maxR) maxR = row;
      }
      for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) if (this.getTile(c, r)) add(c, r);
      (this.data.objects || []).forEach(function (o) {
        var reg = RA.EntityRegistry && RA.EntityRegistry.get(o.type);
        if (!reg) { unknown = true; add(o.col, o.row); return; }
        var rad = Number(o.params && o.params.radiusTiles);
        if (!isFinite(rad)) rad = 0.5;
        if (o.type === 'flail') {
          // 4格轨道是固定规则;包络只算圆周扫掠(含头半径),且不擅自扩出原图
          var orbit = 4;
          add(Math.max(0, o.col - orbit), Math.max(0, o.row - orbit));
          add(Math.min(this.cols - 1, o.col + orbit), Math.min(this.rows - 1, o.row + orbit));
        } else {
          add(o.col - Math.ceil(rad), o.row - Math.ceil(rad));
          add(o.col + Math.ceil(rad), o.row + Math.ceil(rad));
        }
      }, this);
      (this.data.paths || []).forEach(function (p) {
        var b = RA.PathGeometry ? RA.PathGeometry.sweptBounds(p, 0.5) : null;
        if (b && b.ok) { add(b.value.minCol, b.value.minRow); add(b.value.maxCol, b.value.maxRow); }
        else (p.points || []).forEach(function (pt) { add(pt.col, pt.row); });
      });
      (this.data.visuals && this.data.visuals.decorations || []).forEach(function (d) { add(d.col, d.row); });
      if (this.data.spawn) add(this.data.spawn.col, this.data.spawn.row);
      var ports = this.data.ports;
      if (ports && RA.CloudPipe && RA.CloudPipe.isCloud(ports)) {
        ['start', 'finish'].forEach(function (k) {
          if (ports[k]) { add(ports[k].col, ports[k].row); add(ports[k].col + 1, ports[k].row); }
        });
      }
      if (maxC < 0) return { col: 0, row: 0, cols: 1, rows: 1, empty: true };
      return { col: minC, row: minR, cols: maxC - minC + 1, rows: maxR - minR + 1, empty: false, unknown: unknown };
    }

    cropCandidate() {
      var b = this.contentBounds();
      if (b.unknown) return LD.fail('CROP_UNKNOWN', '存在未知对象/空间语义,不能安全自动裁剪;请先处理未知对象', []);
      if (b.empty || (b.col === 0 && b.row === 0 && b.cols === this.cols && b.rows === this.rows)) {
        return LD.ok({ changed: false, bounds: b, offset: { col: 0, row: 0 } });
      }
      var candidate = EditorModel.fromTrusted(this.toData());
      var left = b.col, top = b.row;
      var next = blankTiles(b.cols, b.rows);
      for (var r = 0; r < b.rows; r++) for (var c = 0; c < b.cols; c++) next[r][c] = this.getTile(c + left, r + top);
      candidate.data.size.cols = b.cols; candidate.data.size.rows = b.rows;
      candidate.data.terrain.tiles = next;
      candidate._shiftCoords(-left, -top);
      // 33:裁掉的地块外观不再保留(坐标已随 _shiftCoords 平移)
      var cvis = candidate.data.visuals;
      if (cvis && Array.isArray(cvis.tileSkins)) {
        var keptSkins = cvis.tileSkins.filter(function (s) {
          return s && isInt(s.col) && isInt(s.row) && s.col >= 0 && s.col < b.cols && s.row >= 0 && s.row < b.rows;
        });
        if (keptSkins.length !== cvis.tileSkins.length) {
          if (keptSkins.length) cvis.tileSkins = keptSkins;
          else delete cvis.tileSkins;
        }
      }
      if (candidate.data.ports && RA.CloudPipe && RA.CloudPipe.isCloud(candidate.data.ports)) {
        var ci = RA.CloudPipe.validate(candidate.data, 'play');
        if (ci.length) return LD.fail('CROP_INVALID', '裁剪会破坏云板端点/净空,已取消:' + ci[0].message, ci);
      }
      candidate.invalidate();
      var enc = candidate.toJSON();
      if (!enc.ok) return LD.fail(enc.error.code || 'CROP_ENCODE', '裁剪候选无法编码,已保持原图:' + enc.error.message, enc.error.issues || []);
      return LD.ok({ changed: true, bounds: b, beforeHash: LD.hashSync(this.toData()), offset: { col: left ? -left : 0, row: top ? -top : 0 },
        beforeSize: { cols: this.cols, rows: this.rows }, afterSize: { cols: b.cols, rows: b.rows }, model: candidate });
    }

    applyCrop(plan) {
      if (!plan || !plan.changed) return LD.ok({ changed: false });
      this.data = plan.model.data;
      return LD.ok({ changed: true, offset: plan.offset, afterSize: plan.afterSize });
    }

    /** 只校验单个端点候选(不要求另一端已完成);鼠标/角色卡共用 */
    validatePortAnchor(role, col, row) {
      if (!isInt(col) || !isInt(row)) return { ok: false, message: '需要整数格' };
      var cols = this.cols, rows = this.rows, tiles = this.data.terrain.tiles;
      if (col < 0 || row < 0 || col + 1 >= cols || row >= rows) return { ok: false, message: '2×1 云板在地图外' };
      if (tiles[row][col] !== 5 || tiles[row][col + 1] !== 5) return { ok: false, message: '必须是连续两格云板(5)' };
      var solid = function (c) { return c >= 0 && c < cols && tiles[row][c] >= 1 && tiles[row][c] <= 4; };
      if (!solid(col - 1) || !solid(col + 2)) return { ok: false, message: '云板左右各一格必须是普通实心' };
      var other = role === 'start' ? this.data.ports && this.data.ports.finish : this.data.ports && this.data.ports.start;
      if (other && role === 'start' && !(row > other.row)) return { ok: false, message: '起点必须低于终点' };
      if (other && role === 'finish' && !(other.row > row)) return { ok: false, message: '终点必须高于起点' };
      return { ok: true, anchor: { col: col, row: row } };
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
      // 接口说明必须容错:即使数据里 ports 结构损坏,面板也不能抛异常(A2)
      var ports = this.data.ports;
      var entryCol = ports && ports.entry && isInt(ports.entry.col) ? ports.entry.col : null;
      var exitCol = ports && ports.exit && isInt(ports.exit.col) ? ports.exit.col : null;
      if (ports && entryCol !== null && exitCol !== null) {
        notes.push('接口:vertical-v1 · 入口 col ' + entryCol +
          ' / 出口 col ' + exitCol + '(保护区与端口编辑留 T04)');
      } else if (ports) {
        notes.push('接口结构与 vertical-v1 不一致(缺 entry/exit 或 col 不是整数):' +
          '由共享校验报错,导出会被拒绝;可撤销回上一个版本或等 T04 端口工具');
      } else {
        notes.push('接口:未设置(ports=null)。草稿可编辑/导出;试玩与发布要等 T04 端口工具');
      }
      var retired = this.data.extensions && this.data.extensions.retiredPorts;
      if (Array.isArray(retired) && retired.length) {
        notes.push('有 ' + retired.length + ' 条因缩图退役的接口,完整保存在 ' +
          'extensions.retiredPorts(修复入口留 T04;撤销可还原)');
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
        ' · 背景: ' + (this.backgroundImage ? (this.backgroundName || '自定义图片')
          : (this.backgroundId
            ? ((RA.LevelBackgrounds && RA.LevelBackgrounds.get(this.backgroundId) || {}).label || this.backgroundId)
            : '无')));
      if (this.data.certification) {
        notes.push('这道关卡的认证还在,但第一次编辑后就会失效(需要重新标准试玩)');
      }
      return { errors: errors, warnings: warnings, notes: notes, issues: issues };
    }
  }

  // ===================== 编辑器界面 =====================
  class Editor {
    constructor(canvas, opts) {
      opts = opts || {};
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
      this.ch = (RA.TileSkins && RA.TileSkins.has('grass_top')) ? '~tile:grass_top' : '^';
      this.paletteItems = [];
      this.grid = true;
      this.showEntities = true;
      var bootPrefs = loadPrefs();
      this.autoGrow = !!(bootPrefs && bootPrefs.autoGrow);

      this.undoStack = [];      // [{json, bytes}]
      this.redoStack = [];
      this.undoBytes = 0;
      this.redoBytes = 0;
      this.stroke = null;
      this.selection = null;
      this.portMark = null;
      this.gearGesture = null;
      this.soulGesture = null;
      this.sewageStroke = false;
      this.directStroke = false;
      this.consumeUntilRelease = false;
      this.mouse = { x: 0, y: 0, outside: true };
      this.prevMouse = null;
      this.prevCodes = {};

      this.msg = '';
      this.msgT = 0;
      this.dirty = false;
      this.theme = loadTheme();
      applyTheme(this.theme);

      // 浏览器草稿仓库(IndexedDB;不可用时内存兜底)
      this.repo = opts.repo || (RA.ContentRepository ? RA.ContentRepository.create() : null);
      this.draftId = '';
      this.draftRevision = null;
      this.lastSavedHash = '';
      this._saving = false;
      this.workspaceToken = 0;      // 每次新建/导入/打开草稿都换工作区
      this._openSeq = 0;            // 草稿读取请求序号,防止旧回包覆盖新选择

      this.W = this.canvas.width || 800;
      this.H = this.canvas.height || 600;

      this.wire();
      this.buildPalette();
      this.buildTools();
      this.buildBackgroundSelect();
      this.buildDifficultySelect();
      this.model = null;
      this.newLevel(15, 24, false);
      this.resize();
      this.fitView();
      this.syncUI();
      this.refreshEditorPanels();
      this.assets.loadAll(() => { this.buildPalette(); });
      this.refreshDrafts(true);
      this.openTrialReturn();       // 只有 ?from=trial&draft=... 才自动打开原草稿
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
      click('btn-open-json', () => { var f = self.$('file-json'); if (f) f.click(); });
      click('btn-import-legacy', () => { var f = self.$('file-legacy'); if (f) f.click(); });
      on('file-json', 'change', (e) => self.openFiles(e.target.files, 'json'));
      on('file-legacy', 'change', (e) => self.openFiles(e.target.files, 'legacy'));

      click('btn-undo', () => self.undo());
      click('btn-redo', () => self.redo());
      click('btn-fit', () => { self.fitView(); self.say('视角已适应窗口'); });
      click('btn-brush-minus', () => self.setBrush(self.brush - 1));
      click('btn-brush-plus', () => self.setBrush(self.brush + 1));

      click('btn-theme', () => self.toggleTheme());
      on('chk-grid', 'change', () => { self.grid = !!self.$('chk-grid').checked; });
      on('chk-entities', 'change', () => { self.showEntities = !!self.$('chk-entities').checked; });
      on('chk-autogrow', 'change', () => { self.autoGrow = !!self.$('chk-autogrow').checked; self.savePrefs(); });

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
      on('bg-select', 'change', () => {
        var v = self.$('bg-select').value || null;
        if (v === '__custom__') return;
        if (v === null && self.model.backgroundImage) {
          self.pushUndo();
          if (self.model.setBackground(null)) { self.markDirty(); self.syncUI(); self.say('关卡背景:无(照常可玩)'); }
          else self.popUndo();
          return;
        }
        if (v === self.model.backgroundId && !self.model.backgroundImage) return;
        self.pushUndo();
        if (self.model.setBackground(v)) {
          self.markDirty();
          self.syncUI();
          var reg = v && RA.LevelBackgrounds ? RA.LevelBackgrounds.get(v) : null;
          self.say(v ? ('关卡背景:' + (reg ? reg.label : v) + '(整图铺满地图框并压暗)')
            : '关卡背景:无(照常可玩)');
        } else {
          self.popUndo();
        }
      });

      click('bg-choose', () => { var f = self.$('bg-file'); if (f) f.click(); });
      click('bg-clear', () => {
        if (!self.model.backgroundId && !self.model.backgroundImage) return;
        self.pushUndo();
        if (self.model.setBackground(null)) { self.markDirty(); self.syncUI(); self.say('关卡背景:无(照常可玩)'); }
        else self.popUndo();
      });
      on('bg-file', 'change', (e) => self.importBackgroundFile(e.target.files && e.target.files[0]));

      click('btn-apply-size', () => self.applySizeUI());
      click('btn-crop', () => self.cropUI());
      click('btn-export', () => self.downloadJSON());
      click('btn-copy', () => self.copyJSON());
      click('btn-view-json', () => self.showJSON());
      click('btn-play', () => { self.openPlaytest(); });
      click('btn-export-browser', () => { self.exportToBrowser(); });
      click('btn-export-local', () => { self.exportLocalCurrent(); });
      click('btn-export-batch', () => { self.exportLocalBatch(); });
      click('btn-start-mark', () => self.beginPortMark('start'));
      click('btn-finish-mark', () => self.beginPortMark('finish'));
      click('btn-start-clear', () => self.clearEndpointUI('start'));
      click('btn-finish-clear', () => self.clearEndpointUI('finish'));
      click('btn-draft', () => { self.saveDraft(); });
      click('btn-draft-open', () => self.openSelectedDraft());
      click('btn-draft-refresh', () => self.refreshDrafts());
      on('draft-select', 'change', () => self.syncDraftStatus());
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
      this._skinWrap = null;
      if (host) host.innerHTML = '';
      this.paletteItems.forEach(function (item, i) {
        if (item.kind === 'head') {
          // 33:地块外观子面板标题(可折叠);不参与 1-9/0 快捷键
          var head = globalThis.document.createElement('button');
          head.type = 'button';
          head.className = 'phead';
          head.textContent = item.name + ' ▾';
          head.title = '展开/收起 15 款普通实心块外观(只影响显示,碰撞仍是普通地块)';
          head.addEventListener('click', function () {
            var wrap = self._skinWrap;
            if (!wrap) return;
            var hidden = wrap.style.display === 'none';
            wrap.style.display = hidden ? 'contents' : 'none';
            head.textContent = item.name + (hidden ? ' ▾' : ' ▸');
          });
          if (host) host.appendChild(head);
          var wrap = globalThis.document.createElement('div');
          wrap.className = 'pskins';
          wrap.style.display = 'contents';
          if (host) host.appendChild(wrap);
          self._skinWrap = wrap;
          self._skinHead = head;
          return;
        }
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
        lab.textContent = item.ch === AIR ? '空' : (item.short || item.ch);
        b.appendChild(lab);
        b.addEventListener('click', function () { self.selectChar(item.ch); });
        var target = (item.kind === 'skin' && self._skinWrap) ? self._skinWrap : host;
        if (target) target.appendChild(b);
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
      } else if (item.kind === 'skin') {
        // 33:新"地块"分类的缩略图(缺图时 assets 已回退旧石块)
        RA.drawSkinTile(ctx, this.assets.image(item.image), 0, 0, S);
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
        // 33:有作者图的类型直接用同一张图(与画布/试玩一致);没有图的继续矢量图标
        var artKey = paletteArtKey(item.type);
        var artImg = artKey && RA.ArtCatalog ? RA.ArtCatalog.image(this.assets, artKey) : null;
        var cls = RA.BY_LETTER[item.ch] || (RA.EntityRegistry && RA.EntityRegistry.classFor ? RA.EntityRegistry.classFor(item.type) : null);
        if (artImg && item.type === 'flail') {
          // 流星锤:链在上、锤头在下,和画布上的结构一致(两段都用作者图)
          var chImg = RA.ArtCatalog.image(this.assets, 'authored/objects/flail_chain');
          ctx.imageSmoothingEnabled = false;
          if (chImg) ctx.drawImage(chImg, S * 0.40, S * 0.06, S * 0.20, S * 0.42);
          ctx.drawImage(artImg, S * 0.22, S * 0.46, S * 0.56, S * 0.56);
        } else if (artImg) {
          // 居中、等比、最近邻,留 2px 边
          var pad = 2, box = S - pad * 2;
          var iw = artImg.width || 1, ih = artImg.height || 1;
          var ik = Math.min(box / iw, box / ih);
          var dw = Math.max(1, iw * ik), dh = Math.max(1, ih * ik);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(artImg, pad + (box - dw) / 2, pad + (box - dh) / 2, dw, dh);
        } else if (cls) {
          cls.prototype.drawIcon(ctx, 0, 0, S);
        } else if (item.type === 'fireball_static') {
          RA.rect(ctx, 0, 0, S, S, [44, 30, 26], 6);
          ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.28, 0, Math.PI * 2); ctx.fill();
        } else if (item.type === 'spike') {
          RA.rect(ctx, 0, 0, S, S, [28, 34, 46], 6);
          ctx.fillStyle = '#9aa8c7';
          for (var k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(S * (0.2 + k * 0.22), S * 0.75); ctx.lineTo(S * (0.3 + k * 0.22), S * 0.3); ctx.lineTo(S * (0.4 + k * 0.22), S * 0.75); ctx.fill(); }
        } else if (item.type === 'gear') {
          RA.rect(ctx, 0, 0, S, S, [36, 32, 20], 6);
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.26, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.18); ctx.lineTo(S * 0.5, S * 0.82); ctx.stroke();
        } else if (item.type === 'fireball_moving') {
          RA.rect(ctx, 0, 0, S, S, [44, 30, 26], 6);
          ctx.strokeStyle = 'rgba(255,209,102,.75)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(S * 0.18, S * 0.78); ctx.lineTo(S * 0.5, S * 0.78);
          ctx.lineTo(S * 0.5, S * 0.25); ctx.lineTo(S * 0.82, S * 0.25); ctx.stroke();
          ctx.fillStyle = '#ff5e3a'; ctx.beginPath(); ctx.arc(S * 0.5, S * 0.25, S * 0.16, 0, Math.PI * 2); ctx.fill();
        } else if (item.type === 'flail') {
          RA.rect(ctx, 0, 0, S, S, [30, 36, 54], 6);
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(S / 2, S * 0.3); ctx.lineTo(S / 2, S * 0.68); ctx.stroke();
          ctx.fillStyle = '#c7d2fe'; ctx.beginPath(); ctx.arc(S / 2, S * 0.3, S * 0.07, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(S / 2, S * 0.68, S * 0.16, 0, Math.PI * 2); ctx.fill();
        } else if (item.type === 'soul') {
          RA.rect(ctx, 0, 0, S, S, [16, 30, 46], 6);
          ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.24, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.lineTo(S * 0.76, S / 2); ctx.stroke();
        } else if (item.type === 'sewage_pool') {
          RA.rect(ctx, 0, 0, S, S, [18, 34, 20], 6);
          ctx.fillStyle = 'rgba(79,143,69,.85)'; ctx.fillRect(S * 0.18, S * 0.18, S * 0.64, S * 0.64);
          ctx.strokeStyle = '#9dd47a'; ctx.lineWidth = 2; ctx.strokeRect(S * 0.18, S * 0.18, S * 0.64, S * 0.64);
        } else if (item.type === 'coin') {
          RA.rect(ctx, 0, 0, S, S, [34, 30, 16], 6);
          ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.26, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.8)';
          ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.13, 0, Math.PI * 2); ctx.stroke();
        } else if (item.type === 'archer') {
          RA.rect(ctx, 0, 0, S, S, [16, 34, 28], 6);
          ctx.fillStyle = '#8ef0c0'; ctx.beginPath(); ctx.arc(S * 0.44, S * 0.5, S * 0.18, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#1f7a5a'; ctx.lineWidth = 2; ctx.stroke();
          ctx.strokeStyle = '#f4f7ff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(S * 0.44, S * 0.5); ctx.lineTo(S * 0.86, S * 0.5); ctx.stroke();
          ctx.fillStyle = '#c9f7e4';
          ctx.beginPath(); ctx.moveTo(S * 0.92, S * 0.5); ctx.lineTo(S * 0.72, S * 0.4); ctx.lineTo(S * 0.72, S * 0.6);
          ctx.closePath(); ctx.fill();
        } else if (item.type === 'ghost_dash') {
          // 32:幽灵:漂浮的半透明圆 + 冲刺箭尾
          RA.rect(ctx, 0, 0, S, S, [24, 20, 40], 6);
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#c9b6ff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(S * 0.16, S * 0.5); ctx.lineTo(S * 0.5, S * 0.5); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#d9ccff'; ctx.beginPath(); ctx.arc(S * 0.6, S * 0.5, S * 0.24, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#f3edff'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#4b3f78';
          ctx.beginPath(); ctx.arc(S * 0.52, S * 0.46, S * 0.05, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(S * 0.68, S * 0.46, S * 0.05, 0, Math.PI * 2); ctx.fill();
        } else if (item.type === 'fireball_spitter') {
          // 32:喷火火球:火球本体 + 水平炮口
          RA.rect(ctx, 0, 0, S, S, [44, 30, 26], 6);
          ctx.fillStyle = '#ff8f3a'; ctx.beginPath(); ctx.arc(S * 0.42, S * 0.5, S * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#ff7a1a';
          ctx.fillRect(S * 0.58, S * 0.44, S * 0.24, S * 0.12);
        } else {
          RA.rect(ctx, 0, 0, S, S, [30, 36, 54], 6);
          RA.text(ctx, (item.short || '?').slice(0, 1), Math.round(S * 0.5), [255, 255, 255], S / 2, S / 2,
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

    /**
     * 40:从文件夹选择一张图片作为本关背景。先读成 data URL 并确认图片可解码,
     * 再一次性写入 visuals.backgroundImage;失败不写模型/不占撤销。
     * 上限:文件 6 MiB(data URL 8 MiB),支持 PNG/JPEG/WebP。
     */
    importBackgroundFile(file) {
      var self = this;
      if (!file) return;
      var type = String(file.type || '');
      if (!/^image\/(png|jpeg|webp)$/.test(type)) {
        this.say('关卡背景只支持 PNG/JPEG/WebP 图片', 'bad');
        return;
      }
      if (file.size > 6 * 1024 * 1024) {
        this.say('图片超过 6 MiB,请先压缩后再选(避免关卡 JSON 过大)', 'bad');
        return;
      }
      if (!globalThis.FileReader) { this.say('这个浏览器读不了本地图片', 'bad'); return; }
      var r = new globalThis.FileReader();
      r.onerror = function () { self.say('读取图片失败', 'bad'); };
      r.onload = function () {
        var data = String(r.result || '');
        if (!INLINE_BG_RE.test(data) || data.length > MAX_BG_DATA) {
          self.say('图片编码超出限制,请换一张更小的图片', 'bad');
          return;
        }
        var probe = new globalThis.Image();
        probe.onerror = function () { self.say('图片无法解码,未写入背景', 'bad'); };
        probe.onload = function () {
          if (!(probe.width > 0 && probe.height > 0)) { self.say('图片尺寸无效,未写入背景', 'bad'); return; }
          self.pushUndo();
          if (self.model.setBackgroundImage(data, file.name)) {
            self.markDirty();
            self.syncUI();
            self.say('关卡背景:自定义 ' + file.name + '(' + probe.width + '×' + probe.height + ')');
          } else {
            self.popUndo();
            self.say('写入关卡背景失败(数据超限或格式不支持)', 'bad');
          }
          if (self.$('bg-file')) self.$('bg-file').value = '';
        };
        probe.src = data;
      };
      r.readAsDataURL(file);
    }

    /**
     * 35:关卡背景下拉框 — 「无背景」+ assets/background/catalog.js 里的小背景。
     * 旧 sky1..8 / 未知 id 不偷偷改值:打开时保留原值并单列一条"已停用/缺失"选项。
     */
    buildBackgroundSelect() {
      var sel = this.$('bg-select');
      if (!sel) return;
      sel.innerHTML = '';
      var add = function (value, label) {
        var op = globalThis.document.createElement('option');
        op.value = value;
        op.textContent = label;
        sel.appendChild(op);
      };
      add('', '无背景(照常可玩)');
      var custom = this.model && this.model.backgroundImage;
      if (custom) add('__custom__', '自定义图片:' + (this.model.backgroundName || '已选择'));
      (RA.LevelBackgrounds ? RA.LevelBackgrounds.list() : []).forEach(function (e) {
        add(e.id, e.label + ' · ' + e.width + '×' + e.height);
      });
      var cur = this.model ? (this.model.backgroundId || '') : '';
      if (!custom && cur && RA.LevelBackgrounds && !RA.LevelBackgrounds.has(cur)) {
        add(cur, '已停用/缺失:' + cur + '(按无背景显示,保留原值)');
      }
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
      if (this.soulGesture) this.cancelSoulGesture();
      this.sewageStroke = false;
      this.directStroke = false;
      this.tool = id;
      this.stroke = null;
      this.highlightTools();
      var t = TOOLS.filter(function (x) { return x.id === id; })[0];
      if (t) this.say(t.name + ':' + t.hint);
    }

    selectChar(ch) {
      if (this.soulGesture && this.ch !== ch) this.cancelSoulGesture();
      this.ch = ch;
      if (this.tool === 'erase' || this.tool === 'pick') this.setTool('brush');
      this.highlightPalette();
      this.syncUI();
      var item = this.paletteItems.filter(function (x) { return x.ch === ch; })[0];
      if (item) this.say('当前地物:' + item.name);
      else if (LD.idOf(ch) !== null) {
        // 33:旧基础地块(^ _ ~ =)仍可被吸管选中/原样绘制,但笔刷里不再重复摆一排
        var t = LD.TILES.filter(function (x) { return x.ch === ch; })[0];
        this.say('旧基础地块' + (t ? '「' + t.name + '」' : '') +
          '(笔刷已并入「地块」分类;此格仍按旧图原样保留)');
      }
    }

    setBrush(n) {
      this.brush = RA.clamp(Math.round(n) || 1, 1, 9);
      this.syncUI();
    }

    // ================= 关卡操作 =================
    takenTitles() {
      var out = [];
      if (this.model) out.push(this.model.title);
      return out;
    }

    newLevel(cols, rows, withGround) {
      this.model = EditorModel.create({
        cols: cols, rows: rows, withGround: withGround,
        title: autoTitle(this.takenTitles())
      });
      this.draftId = '';
      this.draftRevision = null;
      this.lastSavedHash = '';
      this.workspaceToken++;
      this.resetHistory();
      this.dirty = false;
      this.fitView();
      this.syncUI();
      this.say(withGround ? '新建了一层(带地面、出生点;接口留空)' : '新建了一层空的');
    }

    /** 打开 v2 JSON 文本;失败(解码或结构)不替换当前图、不清历史 */
    openJSONText(text, sourceLabel) {
      var res;
      try {
        res = EditorModel.fromJSON(text, { source: sourceLabel || '' });
      } catch (e) {
        this.say('这份 JSON 打不开:' + (e && e.message) + '(当前图没有被替换)', 'bad');
        return false;
      }
      if (!res.ok) {
        var at = res.error.issues && res.error.issues[0] ? res.error.issues[0].path : '';
        this.say('这份 JSON 打不开:[' + res.error.code + ']' + (at ? ' ' + at : '') +
          ' ' + res.error.message, 'bad');
        return false;
      }
      if (!this.replaceModel(res.value)) return false;
      this.say('已打开 JSON「' + (this.model.title || this.model.id) + '」(' +
        this.model.cols + '×' + this.model.rows + ',' + this.model.objects.length + ' 个对象)');
      return true;
    }

    /** 旧 TXT / 旧 JSON:显式迁移成未认证草稿 */
    importLegacyText(text, opts) {
      opts = opts || {};
      var res;
      try {
        res = EditorModel.fromLegacy(text, {
          id: opts.id, fallbackId: opts.fallbackId || opts.id,
          source: opts.source || ''
        });
      } catch (e) {
        this.say('旧图迁移失败:' + (e && e.message) + '(当前图没有被替换)', 'bad');
        return false;
      }
      if (!res.ok) {
        var at = res.error.issues && res.error.issues[0] ? res.error.issues[0].path : '';
        this.say('旧图迁移失败:[' + res.error.code + ']' + (at ? ' ' + at : '') +
          ' ' + res.error.message, 'bad');
        return false;
      }
      if (!this.replaceModel(res.value)) return false;
      this.say('已把旧图迁移成草稿「' + (this.model.title || this.model.id) +
        '」—— 保留警告 ' + this.model.importWarnings.length +
        ' 条,ports 留空,不能直接试玩/发布', 'warn');
      return true;
    }

    /**
     * 提交候选模型:只有候选已经通过 decode + 结构校验才会进来。
     * 万一 UI 渲染仍失败,完整回滚模型、历史、dirty 与视角,绝不留下替换了一半的状态(A2)。
     */
    replaceModel(model) {
      var prev = {
        model: this.model,
        undo: this.undoStack, redo: this.redoStack,
        undoBytes: this.undoBytes, redoBytes: this.redoBytes,
        dirty: this.dirty,
        view: { x: this.view.x, y: this.view.y, zoom: this.view.zoom }
      };
      try {
        this.model = model;
        this.gearGesture = null;
        this.soulGesture = null;
        this.sewageStroke = false;
        this.directStroke = false;
        this.portMark = null;
        this.stroke = null;
        this.draftId = '';
        this.draftRevision = null;
        this.lastSavedHash = '';
        this.resetHistory();
        this.dirty = true;             // 导入的是工作副本,还没导出
        this.fitView();
        this.syncUI();
        this.refreshEditorPanels();
        this.workspaceToken++;         // UI 成功提交后才算进入新工作区
        return true;
      } catch (e) {
        this.model = prev.model;
        this.undoStack = prev.undo;
        this.redoStack = prev.redo;
        this.undoBytes = prev.undoBytes;
        this.redoBytes = prev.redoBytes;
        this.dirty = prev.dirty;
        this.view = prev.view;
        try { this.syncUI(); } catch (e2) { /* 旧模型本来能显示 */ }
        this.say('打开失败:模型无法显示(' + (e && e.message) + '),当前图没有被替换', 'bad');
        return false;
      }
    }

    // ================= 浏览器草稿(T02B) =================
    setDraftStatus(text, kind) {
      var el = this.$('draft-status');
      if (el) {
        el.textContent = text;
        el.className = 'draft-status ' + (kind || '');
      }
    }

    syncDraftStatus() {
      if (!this.repo) {
        this.setDraftStatus('草稿仓库不可用;请用「导出 JSON」保存文件', 'bad');
        return;
      }
      var mode = this.repo.persistent ? 'IndexedDB' : '内存(刷新会丢)';
      var bits = ['存储:' + mode];
      if (this.draftId) bits.push('草稿 ' + this.draftId);
      if (this.draftRevision) bits.push('revision ' + this.draftRevision);
      bits.push(this.dirty ? '有未保存改动' : '与上次保存一致');
      this.setDraftStatus(bits.join(' · '), this.repo.persistent ? 'dim' : 'warn');
    }

    /** 刷新草稿列表;开了界面就按 updatedAt 倒序显示 */
    async refreshDrafts(initial, keepStatus) {
      if (!this.repo) { this.syncDraftStatus(); return []; }
      if (this._listing) return [];
      this._listing = true;
      try {
        var res = await this.repo.listDrafts();
        if (!res.ok) {
          this.setDraftStatus('读取草稿列表失败:[' + res.error.code + '] ' +
            res.error.message, 'bad');
          return [];
        }
        var sel = this.$('draft-select');
        var keep = sel ? sel.value : '';
        if (sel) {
          sel.innerHTML = '';
          var opt0 = globalThis.document.createElement('option');
          opt0.value = '';
          opt0.textContent = res.value.length ? '(选择草稿,共 ' + res.value.length + ' 份)'
            : '(还没有浏览器草稿)';
          sel.appendChild(opt0);
          res.value.forEach(function (d) {
            var op = globalThis.document.createElement('option');
            op.value = d.draftId;
            op.textContent = (d.title || '(无标题)') + ' · rev ' + d.revision +
              ' · ' + String(d.updatedAt || '').replace('T', ' ').slice(0, 16);
            sel.appendChild(op);
          });
          if (keep && res.value.some(function (d) { return d.draftId === keep; })) {
            sel.value = keep;
          }
        }
        this._drafts = res.value;
        if (!keepStatus) this.syncDraftStatus();
        if (initial && res.value.length) {
          this.setDraftStatus('浏览器里有 ' + res.value.length +
            ' 份草稿;选一份再点「打开草稿」', 'dim');
        }
        return res.value;
      } finally {
        this._listing = false;
      }
    }

    /**
     * 保存发起时的快照;成功且当前内容没再变才清 dirty。
     * 失败/冲突保留 dirty 与 revision,不覆盖别人。
     */
    async saveDraft(opts) {
      opts = opts || {};
      if (this.soulGesture) { this.say('灵魂方向还未确认;先左键确认或右键/Esc取消,再保存', 'warn'); return false; }
      if (!this.repo) { this.say('这个环境没有草稿仓库;请导出 JSON', 'bad'); return false; }
      if (this._saving) { this.say('正在保存上一份草稿,请稍候', 'warn'); return false; }
      var token = this.workspaceToken;
      var snapshot = this.model.toData();
      var snapshotHash = LD.hashSync(snapshot);
      var draftId = this.draftId || this.model.data.id;
      var expected = this.draftRevision || 0;
      this._saving = true;
      var btn = this.$('btn-draft');
      if (btn) btn.disabled = true;
      this.setDraftStatus('保存中…', 'warn');
      try {
        var res = await this.repo.saveDraft(draftId, snapshot, expected);
        if (!res.ok) {
          this.setDraftStatus('保存失败:[' + res.error.code + '] ' + res.error.message, 'bad');
          if (!opts.silent) this.say('草稿没有保存:[' + res.error.code + '] ' + res.error.message, 'bad');
          return false;
        }
        // 旧保存可以写进旧草稿,但不能改写已经切换过去的新工作区
        if (token !== this.workspaceToken) {
          this.refreshDrafts(false, true);
          this.setDraftStatus('发起保存的旧图已保存为 ' + draftId + ' revision ' +
            res.value.revision + ';当前图没有被改动', 'warn');
          if (!opts.silent) {
            this.say('保存完成的是发起时那张图(已切走);当前图状态保持不变', 'warn');
          }
          return false;
        }
        this.draftId = draftId;
        this.draftRevision = res.value.revision;
        this.lastSavedHash = snapshotHash;
        var currentHash = LD.hashSync(this.model.toData());
        if (currentHash === snapshotHash) {
          this.dirty = false;
          this.setDraftStatus('已保存草稿 revision ' + res.value.revision, 'ok');
        } else {
          this.dirty = true;
          this.setDraftStatus('已保存 revision ' + res.value.revision +
            ';保存期间又有改动,当前仍未保存', 'warn');
        }
        this.refreshDrafts(false, true);
        if (!opts.silent) {
          this.say('草稿已保存(revision ' + res.value.revision +
            (currentHash === snapshotHash ? ')' : ';但保存期间又改了,记得再存一次)'));
        }
        return true;
      } finally {
        this._saving = false;
        if (btn) btn.disabled = false;
        this.syncUI();
      }
    }

    async openSelectedDraft() {
      var sel = this.$('draft-select');
      var id = sel ? sel.value : '';
      if (!id) { this.say('先在草稿列表里选一份', 'bad'); return false; }
      return this.openDraftById(id);
    }

    async openDraftById(id) {
      if (!this.repo) { this.say('这个环境没有草稿仓库', 'bad'); return false; }
      if (this.dirty) {
        var ask = globalThis.confirm;
        if (typeof ask === 'function' &&
          !ask('当前有未保存改动,打开草稿会丢掉它们,继续吗?')) {
          this.say('已取消打开草稿', 'warn');
          return false;
        }
      }
      var token = this.workspaceToken;
      var seq = ++this._openSeq;
      var startHash = LD.hashSync(this.model.toData());
      var res = await this.repo.loadDraft(id);
      // 只允许最新一次读取生效;旧回包不能覆盖后选的草稿
      if (seq !== this._openSeq) return false;
      if (token !== this.workspaceToken) {
        this.say('读取完成时当前图已经切换,已取消这次草稿替换', 'warn');
        return false;
      }
      if (LD.hashSync(this.model.toData()) !== startHash) {
        this.say('读取草稿期间又有新改动;已保留当前工作,没有替换', 'warn');
        return false;
      }
      if (!res.ok) {
        this.say('打开草稿失败:[' + res.error.code + '] ' + res.error.message, 'bad');
        return false;
      }
      if (!res.value) { this.say('找不到草稿「' + id + '」', 'bad'); return false; }
      var model = EditorModel.fromData(res.value.data);
      if (!model.ok) {
        this.say('草稿内容打不开:[' + model.error.code + '] ' + model.error.message, 'bad');
        return false;
      }
      if (!this.replaceModel(model.value)) return false;
      this.draftId = id;
      this.draftRevision = res.value.revision;
      this.lastSavedHash = LD.hashSync(this.model.toData());
      this.dirty = false;
      this.syncDraftStatus();
      this.refreshDrafts();
      this.say('已打开草稿「' + (this.model.title || id) + '」revision ' +
        res.value.revision + ';之后保存会检查这个 revision');
      return true;
    }

    /**
     * 24号卡:只有从试玩结果页"返回编辑器"时才按 ?from=trial&draft=<id> 打开;
     * 这时打开该草稿**最新已保存版本**——试玩写回的通过记录就在这一 revision 里。
     * 普通直接打开 editor.html 不读任何历史 handoff,保持原来的新建行为。
     */
    openTrialReturn() {
      var loc = globalThis.location;
      if (!loc || typeof loc.search !== 'string') return false;
      if (!/[?&]from=trial(?:&|$)/.test(loc.search)) return false;
      var m = loc.search.match(/[?&]draft=([^&]+)/);
      if (!m) return false;
      var draftId = '';
      try { draftId = decodeURIComponent(m[1]); } catch (e) { draftId = m[1]; }
      if (!draftId) return false;
      this._trialReturnDraft = draftId;
      this.setDraftStatus('从试玩返回,正在打开原草稿「' + draftId + '」的最新保存版本…');
      var self = this;
      this.openDraftById(draftId).then(function (opened) {
        if (opened) {
          self.setDraftStatus('已打开试玩返回的原草稿 revision ' + self.draftRevision +
            ';通过记录随草稿读入,可直接点「发布」');
          // 清掉查询串,之后刷新/直接打开不再自动载入,避免覆盖新工作
          try {
            if (globalThis.history && typeof globalThis.history.replaceState === 'function') {
              globalThis.history.replaceState(null, '', 'editor.html');
            }
          } catch (e) { /* 清不掉也不影响当前本地工作 */ }
        } else {
          self.say('打开试玩返回的草稿「' + draftId + '」失败;当前工作保留,可手动从草稿列表选择', 'bad');
        }
      }).catch(function (e) {
        self.say('打开试玩返回的草稿失败:' + (e && e.message) + ';当前工作保留', 'bad');
      });
      return true;
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
      if (this.soulGesture) { this.say('灵魂方向还未确认;先左键确认或右键/Esc取消,再导出', 'warn'); return false; }
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

    // ================= 41:正式导出(浏览器/本地) =================
    async exportToBrowser() {
      return this.publishCurrent();
    }

    async chooseLevelsDir() {
      if (!globalThis.showDirectoryPicker) return undefined;
      try {
        var h = await globalThis.showDirectoryPicker({ mode: 'readwrite' });
        if (h && h.queryPermission) {
          var st = await h.queryPermission({ mode: 'readwrite' });
          if (st !== 'granted' && h.requestPermission) {
            st = await h.requestPermission({ mode: 'readwrite' });
          }
          if (st !== 'granted') { this.say('目录未授权读写,没有写入', 'bad'); return null; }
        }
        return h;
      } catch (e) {
        if (e && e.name === 'AbortError') { this.say('已取消选择目录,没有写入'); return null; }
        this.say('打不开目录:' + (e && e.message || e), 'bad');
        return null;
      }
    }

    downloadBundle(entries, name) {
      try {
        var bundle = globalThis.RA.LevelExport.bundle(entries);
        var text = JSON.stringify(bundle, null, 2);
        var blob = new globalThis.Blob([text], { type: 'application/json;charset=utf-8' });
        var a = globalThis.document.createElement('a');
        a.href = globalThis.URL.createObjectURL(blob);
        a.download = name || 'reverse-abyss-levels-bundle.json';
        if (globalThis.document.body) globalThis.document.body.appendChild(a);
        a.click();
        if (globalThis.document.body && globalThis.document.body.removeChild) globalThis.document.body.removeChild(a);
        globalThis.URL.revokeObjectURL(a.href);
        this.say('已下载关卡包(尚未写入 levels/);把包放到仓库后运行 node tools/import_level_bundle.mjs <包路径>', 'ok');
        return true;
      } catch (e) { this.say('生成关卡包失败:' + (e && e.message || e), 'bad'); return false; }
    }

    async exportLocalCurrent() {
      if (!globalThis.RA.LevelExport) { this.say('缺少本地导出模块', 'bad'); return false; }
      var res = globalThis.RA.LevelExport.current(this.model.data, {
        draftId: this.draftId, revision: this.draftRevision
      });
      if (!res.ok) { this.say('不能导出到本地:[' + res.error.code + '] ' + res.error.message, 'bad'); return false; }
      var handle = await this.chooseLevelsDir();
      if (handle === undefined) { this.downloadBundle([res.value], 'reverse-abyss-level-' + res.value.levelId + '.json'); return false; }
      if (handle === null) return false;
      var out = await globalThis.RA.LevelExport.writeDirectory(handle, [res.value]);
      if (!out.ok) { this.say('本地导出失败:[' + out.error.code + '] ' + out.error.message, 'bad'); return false; }
      this.say('已写入 ' + out.value.written.length + ' 个 JSON,并更新 levels.js(' +
        out.value.entries + ' 张内置普通图)' + (out.value.skipped.length ? ';跳过 ' + out.value.skipped.length + ' 个已存在版本' : ''), 'ok');
      return true;
    }

    async exportLocalBatch() {
      if (!globalThis.RA.LevelExport) { this.say('缺少本地导出模块', 'bad'); return false; }
      var list = await globalThis.RA.LevelExport.list(this.repo);
      if (!list.ok) { this.say('读取导出候选失败:[' + list.error.code + '] ' + list.error.message, 'bad'); return false; }
      var v = list.value;
      if (!v.entries.length) { this.say('没有可导出的有效已发布版本或已通过草稿', 'bad'); return false; }
      var preview = '批量导出预览:' + v.entries.length + ' 个有效版本(id/hash 去重),跳过 ' +
        v.skipped.length + ' 项' + (v.duplicates ? '(重复 ' + v.duplicates + ')' : '') + '。\n' +
        v.entries.slice(0, 12).map(function (e) {
          return '  · ' + e.levelId + ' · ' + e.difficulty + '档 · ' + String(e.contentHash).slice(0, 18) + '…';
        }).join('\n') + (v.entries.length > 12 ? '\n  …' : '') + '\n继续选择 levels 目录?';
      if (globalThis.confirm && !globalThis.confirm(preview)) { this.say('已取消批量导出', 'ok'); return false; }
      var handle = await this.chooseLevelsDir();
      if (handle === undefined) { this.downloadBundle(v.entries, 'reverse-abyss-levels-bundle.json'); return false; }
      if (handle === null) return false;
      var out = await globalThis.RA.LevelExport.writeDirectory(handle, v.entries);
      if (!out.ok) { this.say('批量导出失败:[' + out.error.code + '] ' + out.error.message, 'bad'); return false; }
      this.say('批量导出完成:新写 ' + out.value.written.length + ' 个 JSON,levels.js 共 ' +
        out.value.entries + ' 张;跳过 ' + out.value.skipped.length + ' 项', 'ok');
      return true;
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

    /**
     * 24号卡:旧「对象 / 参数 / 路径」表单已移除,这里只保留端点只读显示与
     * 画布工具状态,不再依赖已删除的 DOM。对象/路径数据与模型方法不受影响。
     */
    refreshEditorPanels() {
      if (this._syncingPanels) return;
      this._syncingPanels = true;
      try {
        var model = this.model;
        var ports = model.data.ports;
        var cloud = ports && RA.CloudPipe && RA.CloudPipe.isCloud(ports);
        var sc = cloud && ports.start ? ports.start.col : null;
        var sr = cloud && ports.start ? ports.start.row : null;
        var fc = cloud && ports.finish ? ports.finish.col : null;
        var fr = cloud && ports.finish ? ports.finish.row : null;
        [['port-start-col', sc], ['port-start-row', sr], ['port-finish-col', fc], ['port-finish-row', fr]].forEach(function (pair) {
          var inp = document.getElementById(pair[0]);
          if (inp && document.activeElement !== inp) inp.value = pair[1] === null ? '' : pair[1];
        });
        var scEl = this.$('start-coord'), fcEl = this.$('finish-coord');
        if (scEl) scEl.textContent = cloud && ports.start ? '(' + ports.start.col + ',' + ports.start.row + ')' : '未标记';
        if (fcEl) fcEl.textContent = cloud && ports.finish ? '(' + ports.finish.col + ',' + ports.finish.row + ')' : '未标记';
        var note = this.$('ports-note');
        if (note) note.textContent = cloud
          ? 'cloud-pipe-v2:起点 ' + (sc === null ? '未设' : '(' + sc + ',' + sr + ')') +
            ' / 终点 ' + (fc === null ? '未设' : '(' + fc + ',' + fr + ')') + ';管内 2×3,两端顶面差 4 格。'
          : (ports ? '旧接口/' + (ports.profile || '未知') + ' 仅保真;请重新标记两格云板。' : '未设置云板端点;草稿可保存,试玩/发布会被拦截。');
      } finally {
        this._syncingPanels = false;
      }
    }

    /** 齿轮专属画布工具:往返/闭合在工具栏,默认沿用 pingpong */
    gearRouteMode() {
      var sel = this.$('gear-mode');
      return sel && sel.value === 'loop' ? 'loop' : 'pingpong';
    }

    /** 齿轮/移动火球共用的路径类工具 */
    pathToolType() {
      if (this.ch === '~gear') return 'gear';
      if (this.ch === '~fireball_moving') return 'fireball_moving';
      return '';
    }

    beginGearGesture(cell, type) {
      if (this.model.readOnly) return false;
      var objType = type || 'gear';
      if (objType !== 'gear' && objType !== 'fireball_moving') return false;
      // 事务边界:先记住开始前的数据、dirty 与整个撤销上下文,再放齿轮/建路径。
      // 取消只能恢复到开始前,不能把放置后的状态当"开始前",也不能弹掉用户之前的撤销。
      var before = {
        json: this.snapshotJSON(),
        dirty: this.dirty,
        undo: this.undoStack.slice(),
        redo: this.redoStack.slice(),
        undoBytes: this.undoBytes,
        redoBytes: this.redoBytes
      };
      this.pushUndo();
      var res = this.model.placeObject(objType, cell.c, cell.r);
      if (!res.ok) {
        this.undoStack = before.undo; this.redoStack = before.redo;
        this.undoBytes = before.undoBytes; this.redoBytes = before.redoBytes;
        this.say('放置' + (objType === 'gear' ? '齿轮' : '移动火球') + '失败:' + res.error.message, 'bad'); return false;
      }
      var gear = res.value;
      var pathId = this.model.uniquePathId();
      var mode = this.gearRouteMode();
      gear.pathId = pathId;
      this.model.data.paths.push({ id: pathId, mode: mode, points: [{ col: cell.c, row: cell.r }] });
      this.model.invalidate();
      this.gearGesture = { type: objType, gearId: gear.id, pathId: pathId, mode: mode, before: before };
      this.markDirty(); this.syncUI();
      this.say('已放' + (objType === 'gear' ? '齿轮' : '移动火球') + '并开始画路线(' + mode + '):左键加节点,右键完成,Esc 取消');
      return true;
    }

    /** 28:编辑器预览用的方块几何(terrain/云板 + 初始门/浮石/弹簧;不含怪物) */
    editorBlockGeometry() {
      var m = this.model;
      return RA.BlockGeometry ? RA.BlockGeometry.create({
        cols: m.cols, rows: m.rows, revision: function () { return 0; },
        isBlock: function (r, c) {
          if (!m.inBounds(c, r)) return false;
          var tile = m.getTile(c, r);
          if (tile >= 1 && tile <= 5) return true;
          var at = m.objectsAt(c, r);
          for (var i = 0; i < at.length; i++) {
            var o = at[i];
            if (o.type === 'crumble_door' && !o.broken) return true;
            if (o.type === 'blink_platform' && o.state !== 'gone') return true;
            if (o.type === 'spring') return true;
          }
          return false;
        }
      }) : null;
    }

    beginSoulGesture(cell) {
      if (this.model.readOnly) return false;
      var geom = this.editorBlockGeometry();
      if (!geom || !RA.SoulMotion) { this.say('当前环境缺少灵魂运动模块', 'bad'); return false; }
      var dirs = RA.SoulMotion.availableDirections(geom, cell.c, cell.r, 0.5);
      if (!dirs.length) {
        this.consumeUntilRelease = true;
        this.say('灵魂必须放在与真实方块相邻的空格,且该位置有可贴边方向', 'bad');
        return false;
      }
      this.soulGesture = { col: cell.c, row: cell.r, directions: dirs, dir: dirs[0] };
      this.consumeUntilRelease = true; // 同一次按压不能立刻当第二次确认
      this.updateSoulDirection(this.mouse);
      this.say('已锁定灵魂位置;移动鼠标选择合法箭头,左键确认,右键/Esc取消', 'warn');
      return true;
    }

    updateSoulDirection(mouse) {
      var g = this.soulGesture; if (!g || !mouse || mouse.outside) return;
      var q = this.cellToScreen(g.col + 0.5, g.row + 0.5);
      var dx = mouse.x - q.x, dy = mouse.y - q.y;
      if (Math.abs(dx) + Math.abs(dy) < 2) return;
      var best = g.dir, bestDot = -Infinity;
      var dirsV = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
      g.directions.forEach(function (d) {
        var v = dirsV[d];
        var dot = dx * v.x + dy * v.y;
        if (dot > bestDot) { bestDot = dot; best = d; }
      });
      g.dir = best;
    }

    commitSoulGesture() {
      var g = this.soulGesture; if (!g) return false;
      this.pushUndo();
      var res = this.model.placeObject('soul', g.col, g.row);
      if (!res.ok) {
        this.popUndo();
        this.say('放置灵魂失败:' + res.error.message, 'bad');
        return false;
      }
      res.value.params.initialDirection = g.dir;
      this.model.invalidate();
      this.soulGesture = null;
      this.consumeUntilRelease = true;
      this.markDirty(); this.syncUI();
      this.say('已放灵魂:初始方向 ' + g.dir + '(0上1右2下3左);沿真实方块外轮廓运动', 'ok');
      return true;
    }

    cancelSoulGesture() {
      if (!this.soulGesture) return false;
      this.soulGesture = null;
      this.consumeUntilRelease = true;
      this.syncUI();
      this.say('已取消灵魂放置;没有写入对象/dirty/撤销', 'warn');
      return true;
    }

    placeSewage(cell) {
      if (this.model.readOnly) return false;
      var at = this.model.objectsAt(cell.c, cell.r);
      for (var i = 0; i < at.length; i++) if (at[i].type === 'sewage_pool') return false;
      if (!this.sewageStroke) {
        this.pushUndo();
        this.sewageStroke = true;
      }
      var res = this.model.placeObject('sewage_pool', cell.c, cell.r);
      if (!res.ok) {
        if (this.sewageStroke) { this.popUndo(); this.sewageStroke = false; }
        this.say('放置污水池失败:' + res.error.message, 'bad');
        return false;
      }
      this.model.invalidate(); this.markDirty(); this.syncUI();
      return true;
    }

    /** 流星锤:只点一个端点,不建 path、不填半径。 */
    placeFlail(cell) {
      if (this.model.readOnly) return false;
      this.pushUndo();
      var res = this.model.placeObject('flail', cell.c, cell.r);
      if (!res.ok) {
        this.popUndo();
        this.say('放置流星锤失败:' + res.error.message, 'bad');
        return false;
      }
      this.model.invalidate();
      this.markDirty();
      this.syncUI();
      this.consumeUntilRelease = true;
      this.say('已放流星锤端点 (' + cell.c + ',' + cell.r + ');半径4格、正下方顺时针、约5秒一圈;单击只放一个端点', 'ok');
      return true;
    }

    /**
     * 30/32:金币/弓箭手/幽灵/喷火火球的直接放置。一次左键放一个;同一拖动内只记一步撤销。
     * 同格同 type 幂等(已有同类不新增);不擦真实地形/机关/出生点,不删同格异类。
     */
    placeDirectObject(type, cell) {
      if (this.model.readOnly) return false;
      if (!isDirectPlaceType(type)) return false;
      var at = this.model.objectsAt(cell.c, cell.r);
      for (var i = 0; i < at.length; i++) if (at[i].type === type) return false;
      if (!this.directStroke) { this.pushUndo(); this.directStroke = true; }
      var res = this.model.placeObject(type, cell.c, cell.r);
      if (!res.ok) {
        if (this.directStroke) { this.popUndo(); this.directStroke = false; }
        this.say('放置' + DIRECT_PLACE_TYPES[type] + '失败:' + res.error.message, 'bad');
        return false;
      }
      this.model.invalidate();
      this.markDirty();
      this.syncUI();
      return true;
    }

    appendGearNode(cell) {
      var g = this.gearGesture; if (!g) return false;
      var path = this.model.data.paths.filter(function (p) { return p.id === g.pathId; })[0];
      if (!path) { this.say('路线状态丢失,已结束;可撤销重来', 'bad'); this.gearGesture = null; return false; }
      var r = RA.PathGeometry.appendOrthogonal(path.points, { col: cell.c, row: cell.r });
      if (!r.ok) { this.say('不能这样连接:' + r.error.message, 'warn'); return false; }
      path.points = r.value.points;
      this.model.invalidate(); this.markDirty(); this.syncUI();
      this.say('已加节点 (' + cell.c + ',' + cell.r + ');总 ' + path.points.length + ' 点');
      return true;
    }

    finishGearGesture() {
      var g = this.gearGesture; if (!g) return false;
      var path = this.model.data.paths.filter(function (p) { return p.id === g.pathId; })[0];
      if (!path) { this.gearGesture = null; return false; }
      if (path.mode === 'loop') {
        var c = RA.PathGeometry.closeOrthogonal(path.points);
        if (!c.ok) { this.say('还不能闭合:' + c.error.message + ';继续加点或切回往返', 'warn'); return false; }
        path.points = c.value.points; path.mode = 'loop';
      }
      this.model.invalidate(); this.gearGesture = null; this.markDirty(); this.syncUI();
      // 右键完成也要吃掉这次按压,避免同一次操作顺势平移/涂画
      this.consumeUntilRelease = true;
      this.say('路线完成:' + path.points.length + ' 点 · ' + path.mode + ';右键结束不追加节点', 'ok');
      return true;
    }
    cancelGearGesture() {
      var g = this.gearGesture; if (!g) return false;
      var before = g.before || {};
      // 只回滚本次事务:数据/dirty/撤销/重做都回到开始前,不能留下齿轮或路径
      if (before.json !== undefined) {
        this.model = EditorModel.fromTrusted(JSON.parse(before.json));
        this.model.importWarnings = [];
        this.model.invalidate();
      }
      if (before.undo) { this.undoStack = before.undo; this.undoBytes = before.undoBytes; }
      if (before.redo) { this.redoStack = before.redo; this.redoBytes = before.redoBytes; }
      this.dirty = !!before.dirty;
      this.gearGesture = null;
      this.consumeUntilRelease = true;      // 同一次左键按下不能紧接着再放齿轮
      this.syncUI();
      this.say('已取消本次' + (g.type === 'fireball_moving' ? '移动火球' : '齿轮') +
        '路线:数据回到开始前,之前的撤销还在', 'warn'); return true;
    }

    beginPortMark(role) {
      if (this.model.readOnly) { this.say('固定场景只读', 'warn'); return false; }
      this.selection = null;
      this.setTool('brush');
      this.ch = '-';
      this.brush = 1;
      this.consumeUntilRelease = false;
      this.portMark = { role: role, anchor: null, valid: false, reason: '把鼠标移到云板上' };
      this.say(role === 'start' ? '标记出口/起点:左键点 2×1 云板;右键/Esc 取消' : '标记入口/终点:左键点 2×1 云板;右键/Esc 取消');
      return true;
    }

    updatePortMark(mouse) {
      if (!this.portMark) return;
      var cell = this.cellAt(mouse.x, mouse.y);
      var c = cell.c, r = cell.r, tiles = this.model.data.terrain.tiles;
      if (this.model.inBounds(c, r) && tiles[r][c] === 5) {
        if (c > 0 && tiles[r][c - 1] === 5) c = c - 1;
        else if (c + 1 < this.model.cols && tiles[r][c + 1] === 5) c = c;
      }
      var v = this.model.validatePortAnchor(this.portMark.role, c, r);
      this.portMark.anchor = v.ok ? v.anchor : { col: c, row: r };
      this.portMark.valid = v.ok;
      this.portMark.reason = v.ok ? '左键确认' : v.message;
    }

    cancelPortMark() {
      if (!this.portMark) return false;
      this.portMark = null; this.say('已取消标记,端点没有改动', 'warn'); return true;
    }

    commitPortMark() {
      if (!this.portMark) return false;
      if (!this.portMark.valid) { this.say('这个位置不能标记:' + this.portMark.reason, 'bad'); return false; }
      var role = this.portMark.role, anchor = this.portMark.anchor;
      this.pushUndo();
      var res = this.model.setCloudEndpoint(role, anchor.col, anchor.row);
      if (!res.ok) { this.popUndo(); this.say('端点保存失败:[' + res.error.code + '] ' + res.error.message, 'bad'); return false; }
      this.portMark = null; this.selection = null; this.consumeUntilRelease = true; this.markDirty(); this.syncUI();
      this.say((role === 'start' ? '出口/起点' : '入口/终点') + ' 已标为 (' + anchor.col + ',' + anchor.row + ')', 'ok');
      return true;
    }

    clearEndpointUI(role) {
      if (this.model.readOnly) return false;
      this.pushUndo();
      var r = this.model.clearCloudEndpoint(role);
      if (!r.ok) { this.popUndo(); this.say(r.error.message, 'bad'); return false; }
      this.markDirty(); this.syncUI(); this.say('已清除端点', 'warn'); return true;
    }

    applyCloudEndpoint(role) {
      var c = this.portMark && this.portMark.anchor ? this.portMark.anchor.col : NaN;
      var r = this.portMark && this.portMark.anchor ? this.portMark.anchor.row : NaN;
      this.pushUndo();
      if (this.model.readOnly) { this.say('固定场景只读,不能修改端点', 'warn'); return false; }
      var res = this.model.setCloudEndpoint(role, c, r);
      if (!res.ok) { this.popUndo(); this.say('端点保存失败:[' + res.error.code + '] ' + res.error.message, 'bad'); return false; }
      this.markDirty(); this.syncUI();
      this.say(role === 'start' ? '起点/出口已标记;保存草稿后可试玩' : '终点/入口已标记;试玩前共享检查', 'ok');
      return true;
    }

    clearPortsUI() {
      if (!this.model.data.ports) { this.say('本来就没有接口', 'warn'); return false; }
      this.pushUndo(); this.model.clearPorts(); this.markDirty(); this.syncUI();
      this.say('接口已清空(可撤销)', 'warn');
      return true;
    }

    async publishCurrent() {
      if (this.soulGesture) { this.say('灵魂方向还未确认;先左键确认或右键/Esc取消,再发布', 'warn'); return false; }
      if (!this.repo) { this.say('没有草稿/发布库', 'bad'); return false; }
      if (!this.draftId) { this.say('先保存草稿并试玩通过', 'bad'); return false; }
      if (!(this.model.data.kind === 'normal' &&
        [1, 2, 3, 4].indexOf(Number(this.model.data.difficulty)) >= 0)) {
        this.say('发布前先在「难度」选择 1–4 档(正式池按 1–9/11–19/21–29/31–39 分档抽选);改难度后要重新试玩', 'bad');
        return false;
      }
      var cert = this.model.data.certification;
      if (!cert) { this.say('还没有本图的试玩通过记录;先点「试玩」实际走到 finish', 'bad'); return false; }
      var res = await this.repo.publish({ draftId: this.draftId, expectedRevision: this.draftRevision, receipt: cert });
      if (!res.ok) { this.say('发布失败:[' + res.error.code + '] ' + res.error.message, 'bad'); return false; }
      var ps = this.$('publish-status');
      if (ps) ps.textContent = '已发布 ' + res.value.levelId + ' @ ' + res.value.contentHash.slice(0, 18) + '…(难度 ' +
        this.model.data.difficulty + ' 档)';
      this.say('已发布到本地正式池(难度 ' + this.model.data.difficulty + ' 档);完整塔按对应层段抽选');
      return true;
    }

    async openPlaytest() {
      if (this.soulGesture) {
        this.say('灵魂方向还未确认;先左键确认或右键/Esc取消,再试玩', 'warn');
        return false;
      }
      // 只检查"能不能读/跑起来":结构 + 云板 start/finish + 对象参数/引用。
      // 几何、净空、最高行、可达性等不再作为试玩门槛,关卡能不能过由作者实际试玩决定。
      var readErr = RA.TrialSession && RA.TrialSession.readableIssues
        ? RA.TrialSession.readableIssues(this.model.data)
        : LD.errorsOf(LD.validate(this.model.data, { purpose: 'load' }));
      if (readErr.length) {
        var first = readErr[0];
        this.say('现在不能试玩:[' + first.code + '] ' + first.path + ' ' + first.message +
          '(共 ' + readErr.length + ' 个读取/运行必需问题;几何能否通过以实际试玩为准)', 'bad');
        return false;
      }
      if (!(this.model.data.kind === 'normal' &&
        [1, 2, 3, 4].indexOf(Number(this.model.data.difficulty)) >= 0)) {
        this.say('试玩前先在「难度」选择 1–4 档(正式池按档抽选);难度改动会让旧通过记录失效', 'bad');
        return false;
      }
      // 试玩会离开当前页面:先把发起时的快照写进草稿,避免未保存工作丢失
      var token = this.workspaceToken;
      var snapshot = this.model.toData();
      var snapshotHash = LD.hashSync(snapshot);
      var saved = await this.saveDraft({ silent: true });
      if (token !== this.workspaceToken) {
        this.say('保存期间已经新建/导入/打开别的图;已取消试玩,当前工作保留', 'warn');
        return false;
      }
      if (!saved) {
        this.say('草稿保存失败,没有离开编辑器;先解决保存问题再试玩', 'bad');
        return false;
      }
      if (this.dirty || LD.hashSync(this.model.toData()) !== snapshotHash) {
        this.say('保存期间又有改动;先再保存一次,再启动试玩(当前工作没有离开)', 'warn');
        return false;
      }
      // handoff 使用刚保存的规范快照,不把保存后的新编辑带走
      var enc = LD.encode(snapshot);
      if (!enc.ok) {
        this.say('试玩快照无法编码:[' + enc.error.code + '] ' + enc.error.message, 'bad');
        return false;
      }
      var handoffTemplate = JSON.parse(enc.value);
      var playIssues = RA.TrialSession && RA.TrialSession.readableIssues
        ? RA.TrialSession.readableIssues(handoffTemplate)
        : LD.errorsOf(LD.validate(handoffTemplate, { purpose: 'load' }));
      if (playIssues.length) {
        this.say('试玩快照有读取问题:[' + playIssues[0].code + '] ' + playIssues[0].message + ',已留在编辑器', 'bad');
        return false;
      }
      var handoff = {
        version: 3,
        kind: 'editor-validation',
        // 试玩就是普通游玩初态(run-v1):满血、技能开局可用;只有当前一张图
        profileId: 'run-v1',
        template: handoffTemplate,
        subjectRef: { levelId: handoffTemplate.id, contentHash: handoffTemplate.contentHash || null },
        draftRef: { draftId: this.draftId, revision: this.draftRevision },
        rules: { rulesVersion: RA.RULES && RA.RULES.rulesVersion, rulesFingerprint: RA.RULES && RA.RULES.rulesFingerprint },
        requestId: 'trial_' + Date.now().toString(36)
      };
      var planCheck = RA.TrialSession && RA.TrialSession.build(handoff);
      if (!planCheck || !planCheck.ok) {
        this.say('单张图试玩数据无效:' + (planCheck && planCheck.error ? planCheck.error.message : '缺少 TrialSession'), 'bad');
        return false;
      }
      try {
        globalThis.sessionStorage.setItem('RA_TRIAL_V3', JSON.stringify(handoff));
      } catch (e) {
        this.say('浏览器不允许暂存试玩数据(' + (e && e.message) +
          ');请检查隐私模式后重试', 'bad');
        return false;
      }
      this.say('已保存草稿 revision ' + this.draftRevision + ',正在打开当前图试玩…');
      var loc = globalThis.location;
      if (loc) loc.href = 'trial.html?from=editor';
      return true;
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

    applySizeUI() {
      var c = parseInt(this.$('w-input') ? this.$('w-input').value : '', 10);
      var r = parseInt(this.$('h-input') ? this.$('h-input').value : '', 10);
      if (isNaN(c) || isNaN(r)) { this.say('宽/高必须是整数', 'bad'); this.syncUI(); return false; }
      return this.changeSize(c, r);
    }

    cropUI() {
      if (this.model.readOnly) { this.say('固定场景只读,不能裁剪', 'warn'); return false; }
      var plan = this.model.cropCandidate();
      if (!plan.ok) { this.say('裁剪预检失败:[' + plan.error.code + '] ' + plan.error.message, 'bad'); return false; }
      var p = plan.value;
      if (!p.changed) { this.say('没有可安全裁掉的外侧空白', 'warn'); return false; }
      var msg = '裁去外侧空白:\n原尺寸 ' + p.beforeSize.cols + '×' + p.beforeSize.rows +
        ' → ' + p.afterSize.cols + '×' + p.afterSize.rows +
        '\n偏移 (' + p.offset.col + ',' + p.offset.row + ');端点/对象/路径同步,认证失效。\n确定应用吗?(可撤销)';
      if (typeof globalThis.confirm === 'function' && !globalThis.confirm(msg)) {
        this.say('已取消裁剪,地图没有改动', 'warn'); return false;
      }
      if (LD.hashSync(this.model.toData()) !== p.beforeHash) { this.say('裁剪预览已过期,当前工作没有改动', 'warn'); return false; }
      this.pushUndo();
      var res = this.model.applyCrop(p);
      this.selection = null; this.portMark = null; this.gearGesture = null;
      if (!res.ok) { this.popUndo(); this.say('裁剪失败:' + res.error.message, 'bad'); return false; }
      this.markDirty(); this.fitView(); this.syncUI();
      this.say('已裁到 ' + p.afterSize.cols + '×' + p.afterSize.rows + '(可撤销)');
      return true;
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
          '· 装饰 ' + impact.decorations + '\n' +
          '· 地块外观 ' + impact.skins + ' 格\n' +
          '· 接口 ' + impact.ports + ' 个' +
          (impact.ports ? '(会完整存进 extensions.retiredPorts,再把 ports 置空)' : '') +
          '\n\n确定继续吗?(可以撤销)';
        if (typeof ask === 'function' && !ask(msg)) {
          this.syncUI();
          this.say('已取消缩小,地图没有任何改动', 'warn');
          return false;
        }
      }
      // 先完整预演候选(含退役接口与容量编码),失败不碰历史 / dirty / 视角(A3-C)
      var built = this.model.resizeCandidate(nc, nr, { allowLoss: true });
      if (!built.ok) {
        this.syncUI();
        this.say('改尺寸失败:[' + built.error.code + '] ' + built.error.message, 'bad');
        return false;
      }
      this.pushUndo();
      if (built.value.changed) {
        this.model.data = built.value.model.data;
      }
      var res = built;
      this.markDirty();
      this.fitView();
      this.syncUI();
      this.say('尺寸改成 ' + this.model.cols + ' × ' + this.model.rows +
        (lossy ? '(已按确认丢弃界外内容,可撤销)' : '') +
        (res.value && res.value.retired ? ';失效接口已完整保存到 retiredPorts' : ''));
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
      if (this.consumeUntilRelease) {
        if (!inp.buttons[0]) this.consumeUntilRelease = false;
        this.prevMouse = { x: mouse.x, y: mouse.y, outside: mouse.outside };
        this.mouse = { x: mouse.x, y: mouse.y, outside: mouse.outside };
        this.prevCodes = Object.assign({}, inp.codes);
        return;
      }
      if (this.gearGesture) {
        if (just('Escape')) this.cancelGearGesture();
        else if (inp.buttons[2]) this.finishGearGesture();
      }
      if (this.soulGesture) {
        this.updateSoulDirection(mouse);
        if (just('Escape') || inp.buttons[2]) this.cancelSoulGesture();
      }
      if (this.portMark) {
        this.updatePortMark(mouse);
        if (just('Escape') || inp.buttons[2]) this.cancelPortMark();
      }
      if (!inp.buttons[0]) { this.sewageStroke = false; this.directStroke = false; }
      var panning = !this.portMark && !this.gearGesture && !this.soulGesture &&
        (!!inp.buttons[2] || !!inp.buttons[1] ||
        (!!inp.buttons[0] && !!inp.codes.Space));
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
        if (this.sewageStroke) this.sewageStroke = false;
        if (this.directStroke) this.directStroke = false;
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
      if (this.portMark) { this.updatePortMark(mouse); this.commitPortMark(); return; }
      var pathType = this.pathToolType();
      if (pathType && this.tool === 'brush') {
        if (!this.gearGesture) this.beginGearGesture(cell, pathType); else this.appendGearNode(cell);
        return;
      }
      if (this.ch === '~soul' && this.tool === 'brush') {
        if (this.soulGesture) this.commitSoulGesture(); else this.beginSoulGesture(cell);
        return;
      }
      if (this.ch === '~sewage_pool' && this.tool === 'brush') {
        this.placeSewage(cell);
        return;
      }
      if (this.ch === '~flail' && this.tool === 'brush') {
        this.placeFlail(cell);
        return;
      }
      // 30/32:金币/弓箭手/幽灵/喷火火球直接放置工具 —— 一次左键放一个,无方向/参数/路径二次确认;
      // 连续拖画仍按同类幂等笔刷(同格同 type 不重复,不擦地形/机关/异类)
      if (this.ch && this.ch.charAt(0) === '~' && isDirectPlaceType(this.ch.slice(1)) &&
        this.tool === 'brush') {
        this.placeDirectObject(this.ch.slice(1), cell);
        return;
      }
      if (tool === 'select') {
        if (!this.stroke) this.stroke = { tool: 'select', start: cell, end: cell, last: cell };
        this.stroke.end = cell;
        return;
      }

      if (!this.stroke) {
        if (tool === 'pick') {
          var picked = this.model.getChar(cell.c, cell.r);
          var obj = this.model.objectAt(cell.c, cell.r);
          if (picked === null && obj) {
            // 注册了但没有字符画笔的类型(金币/弓箭手/幽灵/喷火火球等)不是"未知对象":
            // 要用调色板里对应的直接放置工具,而不是说它未注册。
            var regObj = RA.EntityRegistry.get(obj.type);
            this.say(regObj
              ? '这一格是「' + regObj.name + '」,没有字符画笔;用调色板里对应的工具放置/擦除'
              : '这一格是未注册对象 "' + obj.type + '",画笔不能取它(位置会保留)', 'warn');
            return;
          }
          this.selectChar(picked === null ? AIR : picked);
          var pickedItem = this.paletteItems.filter(function (x) {
            return x.ch === (picked === null ? AIR : picked);
          })[0];
          this.say('取到 ' + (picked === AIR ? '空气' : (pickedItem ? pickedItem.name : "'" + picked + "'")));
          return;
        }
        var priorRedo = this.redoStack, priorRedoBytes = this.redoBytes;
        var priorUndo = this.undoStack.slice(), priorUndoBytes = this.undoBytes, priorDirty = this.dirty;
        this.pushUndo();                 // 整笔拖动算一步撤销
        this.stroke = { tool: tool, start: cell, end: cell, last: cell,
          beforeJSON: this.undoStack[this.undoStack.length - 1].json,
          priorRedo: priorRedo, priorRedoBytes: priorRedoBytes,
          priorUndo: priorUndo, priorUndoBytes: priorUndoBytes, priorDirty: priorDirty };
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
      var err = dx - dy, x = a.c, y = a.r, guard = 0, changed = false;
      while (guard++ < 4000) {
        if (this.stamp(x, y, ch)) changed = true;
        if (x === b.c && y === b.r) break;
        var e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
      if (changed) this.afterEdit();
    }

    stamp(c, r, ch) {
      var n = this.brush;
      var half = Math.floor((n - 1) / 2);
      var changed = false;
      for (var dr = -half; dr < n - half; dr++) {
        for (var dc = -half; dc < n - half; dc++) {
          if (this.model.applyChar(c + dc, r + dr, ch)) changed = true;
        }
      }
      return changed;
    }

    endStroke() {
      var s = this.stroke;
      this.stroke = null;
      if (!s) return;
      if (s.tool === 'select') {
        this.selection = { c0: Math.min(s.start.c, s.end.c), r0: Math.min(s.start.r, s.end.r),
          c1: Math.max(s.start.c, s.end.c), r1: Math.max(s.start.r, s.end.r) };
        this.say('已选 ' + (this.selection.c1 - this.selection.c0 + 1) + '×' + (this.selection.r1 - this.selection.r0 + 1) + ';右侧标记端点');
        return;
      }
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
      if (s.beforeJSON && s.beforeJSON === this.snapshotJSON()) {
        this.undoStack = s.priorUndo; this.undoBytes = s.priorUndoBytes;
        this.redoStack = s.priorRedo; this.redoBytes = s.priorRedoBytes;
        this.dirty = s.priorDirty;
      } else this.afterEdit();
    }

    afterEdit() {
      this.markDirty();
      this._needSync = true;
    }

    // ================= 绘制 =================
    draw() {
      var ctx = this.ctx;
      var light = globalThis.document && document.body && document.body.dataset.theme === 'light';
      RA.rect(ctx, 0, 0, this.W, this.H, light ? [243, 244, 246] : [9, 13, 19]);
      this.drawBoard(ctx);
    }

    drawBoard(ctx) {
      var m = this.model;
      var z = this.view.zoom;
      var ts = TS * z;
      var B = { x: 0, y: 0, w: this.W, h: this.H };

      var o = this.cellToScreen(0, 0);
      var light = globalThis.document && document.body && document.body.dataset.theme === 'light';
      RA.rect(ctx, o.x, o.y, m.worldW() * z, m.worldH() * z, light ? [249, 250, 251] : [22, 26, 40]);

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
              RA.rect(ctx, p.x, p.y, ts + 0.5, ts + 0.5, light ? [243, 244, 246] : [27, 31, 46]);
            }
          }
        }
      }

      var vc0 = Math.max(0, Math.floor(this.view.x / TS));
      var vr0 = Math.max(0, Math.floor(this.view.y / TS));
      var vc1 = Math.min(m.cols - 1, Math.floor((this.view.x + B.w / z) / TS));
      var vr1 = Math.min(m.rows - 1, Math.floor((this.view.y + B.h / z) / TS));

      // 35:关卡小背景 — 与正式/Trial 同一份绘制,先画背景再画地形;
      // 矩形=地图框(随平移/缩放只变换一次),不参与裁空白/占用扫描
      var bgVis = m.data.visuals || {};
      var bgId = bgVis.backgroundId;
      var bgInline = bgVis.backgroundImage;
      if ((bgId || bgInline) && RA.drawLevelBackground) {
        var bg0 = this.cellToScreen(0, 0);
        RA.drawLevelBackground(ctx, bgId,
          { x: bg0.x, y: bg0.y, w: m.cols * ts, h: m.rows * ts }, this.assets, bgInline);
      }

      // 地块(直接读 LevelData.terrain.tiles,没有第二份字符地图)
      var tiny = ts < 8;
      for (r = vr0; r <= vr1; r++) {
        for (c = vc0; c <= vc1; c++) {
          var tileId = m.getTile(c, r);
          if (!tileId) continue;
          var ch = LD.charOf(tileId);
          if (!ch) continue;
          var q = this.cellToScreen(c, r);
          // 33:有地块外观就整格换图(不在旧石块上叠加),缺图回退基础地块
          var skinId = m.tileSkinAt(c, r);
          var skinReg = skinId && RA.TileSkins ? RA.TileSkins.get(skinId) : null;
          if (tiny) {
            ctx.fillStyle = tileColor(ch);
            ctx.fillRect(q.x, q.y, ts + 0.5, ts + 0.5);
          } else if (skinReg) {
            RA.drawSkinTile(ctx, this.assets.image(skinReg.asset), q.x, q.y, ts);
          } else {
            var tileAsset = RA.TILE_IMAGES[ch][0];
            RA.drawTile(ctx, ch, this.assets.image(tileAsset), q.x, q.y, ts,
              tileAsset.indexOf('authored/') === 0 ? { nearest: true } : null);
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
          var fh = obj.type === 'flail' && RA.flailHead ? RA.flailHead(obj) : null;
          var headScreen = fh ? self.cellToScreen(fh.x / TS, fh.y / TS) : null;
          if (fh) {
            var anchorScreen = self.cellToScreen(fh.anchor.x / TS, fh.anchor.y / TS);
            var pad = Math.max(4, ts * 0.5);
            if (Math.max(anchorScreen.x, headScreen.x) + pad < 0 ||
                Math.min(anchorScreen.x, headScreen.x) - pad > self.W ||
                Math.max(anchorScreen.y, headScreen.y) + pad < 0 ||
                Math.min(anchorScreen.y, headScreen.y) - pad > self.H) return;
          } else if (obj.col < vc0 || obj.col > vc1 || obj.row < vr0 || obj.row > vr1) return;
          var q2 = self.cellToScreen(obj.col, obj.row);
          // 33:有作者图的对象在编辑器里也画同一张图(静态预览,不启动 AI),再叠小标签方便辨认
          var pieces = editorArtPieces(obj);
          if (pieces) {
            var allImgs = [];
            for (var pi = 0; pi < pieces.length; pi++) {
              var pimg = RA.ArtCatalog.image(self.assets, pieces[pi].key);
              if (!pimg) { allImgs = null; break; }
              allImgs.push(pimg);
            }
            if (allImgs) {
              for (var pj = 0; pj < pieces.length; pj++) {
                var piece = pieces[pj];
                var pimg2 = allImgs[pj];
                if (piece.chain) {
                  // 流星锤锁链:端点→锤头重复铺,不拉伸
                  var a0 = self.cellToScreen(piece.c, piece.r);
                  var b0 = self.cellToScreen(piece.chain.c, piece.chain.r);
                  var dx0 = b0.x - a0.x, dy0 = b0.y - a0.y;
                  var len0 = Math.hypot(dx0, dy0), ang0 = Math.atan2(dy0, dx0);
                  var unit0 = ts * 0.42, step0 = unit0 * 0.62;
                  ctx.save();
                  ctx.translate(a0.x, a0.y);
                  ctx.rotate(ang0 - Math.PI / 2);
                  ctx.imageSmoothingEnabled = false;
                  for (var dpos = unit0 * 0.5; dpos < len0 - unit0 * 0.35; dpos += step0) {
                    ctx.drawImage(pimg2, -unit0 / 2, dpos - unit0 / 2, unit0, unit0);
                  }
                  ctx.restore();
                } else if (piece.rect) {
                  // 34:地刺按可见包络裁绘(底座/探出两种),矩形与判定几何同源
                  var rq = self.cellToScreen(piece.rect.x, piece.rect.y);
                  if (RA.drawSpriteBBox) {
                    RA.drawSpriteBBox(ctx, pimg2, piece.bbox, rq.x, rq.y,
                      piece.rect.w * ts, piece.rect.h * ts);
                  }
                } else {
                  var pc = self.cellToScreen(piece.c, piece.r);
                  var psz = (piece.px / TS) * ts;
                  if (psz >= 3) {
                    ctx.save();
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(pimg2, pc.x - psz / 2, pc.y - psz / 2, psz, psz);
                    ctx.restore();
                  }
                }
              }
              var regA = RA.EntityRegistry.get(obj.type);
              if (ts >= 12 && regA) {
                RA.text(ctx, (regA.name || obj.type).slice(0, 2), Math.max(7, ts * 0.26), [214, 232, 255],
                  q2.x + ts / 2, q2.y - 3, { bold: true, shadow: false });
              }
              return;
            }
          }
          var reg = RA.EntityRegistry.get(obj.type);
          var letter = reg && reg.letter;
          var cls = letter ? RA.BY_LETTER[letter] : null;
          if (cls && ts >= 12) {
            cls.prototype.drawIcon(ctx, q2.x, q2.y, ts);
          } else if (cls) {
            ctx.fillStyle = hashColor(letter);
            ctx.fillRect(q2.x, q2.y, ts + 0.5, ts + 0.5);
          } else {
            // 注册了但没有旧字符的机关用具体图形;未注册对象仍用紫色占位
            var knownNoLetter = !!reg;
            if (obj.type === 'fireball_moving') {
              RA.rect(ctx, q2.x + 1, q2.y + 1, ts - 2, ts - 2, [50, 30, 26], 4);
              ctx.fillStyle = '#ff5e3a';
              ctx.beginPath(); ctx.arc(q2.x + ts / 2, q2.y + ts / 2, Math.max(3, ts * 0.24), 0, Math.PI * 2); ctx.fill();
              if (ts >= 12) RA.text(ctx, '移动火球', Math.max(7, ts * 0.26), [255, 210, 190],
                q2.x + ts / 2, q2.y - 3, { bold: true, shadow: false });
            } else if (obj.type === 'flail') {
              var ax = q2.x + ts / 2, ay = q2.y + ts / 2;
              ctx.fillStyle = '#c7d2fe';
              ctx.beginPath(); ctx.arc(ax, ay, Math.max(3, ts * 0.1), 0, Math.PI * 2); ctx.fill();
              if (fh) {
                var hx = headScreen.x, hy = headScreen.y;
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke();
                ctx.fillStyle = '#f97316';
                ctx.beginPath(); ctx.arc(hx, hy, Math.max(4, ts * 0.18), 0, Math.PI * 2); ctx.fill();
              }
              if (ts >= 12) RA.text(ctx, '锤', Math.max(7, ts * 0.3), [255, 210, 190],
                ax, ay - ts * 0.18, { bold: true, shadow: false });
            } else if (obj.type === 'soul') {
              var sx0 = q2.x + ts / 2, sy0 = q2.y + ts / 2;
              ctx.fillStyle = 'rgba(159,216,255,.8)';
              ctx.beginPath(); ctx.arc(sx0, sy0, Math.max(4, ts * 0.22), 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 2;
              var sd = Number(obj.params && obj.params.initialDirection);
              var sv2 = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][sd] || { x: 0, y: -1 };
              ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 + sv2.x * ts * 0.38, sy0 + sv2.y * ts * 0.38); ctx.stroke();
              if (ts >= 12) RA.text(ctx, '魂', Math.max(7, ts * 0.26), [210, 240, 255],
                sx0, q2.y - 3, { bold: true, shadow: false });
            } else if (obj.type === 'sewage_pool') {
              ctx.globalAlpha = 0.55; ctx.fillStyle = '#4f8f45';
              ctx.fillRect(q2.x + 1, q2.y + 1, ts - 2, ts - 2);
              ctx.globalAlpha = 1; ctx.strokeStyle = '#9dd47a'; ctx.lineWidth = 2;
              ctx.strokeRect(q2.x + 1, q2.y + 1, ts - 2, ts - 2);
              if (ts >= 12) RA.text(ctx, '污', Math.max(7, ts * 0.26), [225, 255, 205],
                q2.x + ts / 2, q2.y + ts / 2, { bold: true, shadow: false });
            } else if (obj.type === 'coin') {
              // 30:金币是拾取物;编辑器里画成金币图标,不当敌对单位占位
              ctx.fillStyle = '#ffd166';
              ctx.beginPath(); ctx.arc(q2.x + ts / 2, q2.y + ts / 2, Math.max(4, ts * 0.26), 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
              ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(q2.x + ts / 2, q2.y + ts / 2, Math.max(2, ts * 0.12), 0, Math.PI * 2); ctx.stroke();
              if (ts >= 12) RA.text(ctx, '币', Math.max(7, ts * 0.26), [255, 240, 200],
                q2.x + ts / 2, q2.y - 3, { bold: true, shadow: false });
            } else if (obj.type === 'archer') {
              // 30:弓静止不动;编辑器显示本体与朝右的弓,方便看清位置
              var ax0 = q2.x + ts / 2, ay0 = q2.y + ts / 2;
              ctx.fillStyle = '#8ef0c0';
              ctx.beginPath(); ctx.arc(ax0, ay0, Math.max(4, ts * 0.26), 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#1f7a5a'; ctx.lineWidth = 2; ctx.stroke();
              ctx.strokeStyle = '#f4f7ff'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax0 + ts * 0.4, ay0); ctx.stroke();
              ctx.fillStyle = '#c9f7e4';
              ctx.beginPath(); ctx.moveTo(ax0 + ts * 0.46, ay0);
              ctx.lineTo(ax0 + ts * 0.26, ay0 - ts * 0.1);
              ctx.lineTo(ax0 + ts * 0.26, ay0 + ts * 0.1);
              ctx.closePath(); ctx.fill();
              if (ts >= 12) RA.text(ctx, '弓', Math.max(7, ts * 0.26), [205, 255, 235],
                ax0, q2.y - 3, { bold: true, shadow: false });
            } else if (obj.type === 'ghost_dash') {
              // 32:幽灵在编辑器里是静态图标(不启动冲刺 AI),朝右显示
              var gx0 = q2.x + ts / 2, gy0 = q2.y + ts / 2;
              ctx.globalAlpha = 0.35;
              ctx.strokeStyle = '#c9b6ff'; ctx.lineWidth = Math.max(2, ts * 0.06);
              ctx.beginPath(); ctx.moveTo(q2.x + ts * 0.14, gy0); ctx.lineTo(gx0, gy0); ctx.stroke();
              ctx.globalAlpha = 0.9;
              ctx.fillStyle = '#d9ccff';
              ctx.beginPath(); ctx.arc(gx0, gy0, Math.max(4, ts * 0.26), 0, Math.PI * 2); ctx.fill();
              ctx.globalAlpha = 1;
              ctx.strokeStyle = '#f3edff'; ctx.lineWidth = 2; ctx.stroke();
              if (ts >= 12) RA.text(ctx, '幽', Math.max(7, ts * 0.26), [235, 228, 255],
                gx0, q2.y - 3, { bold: true, shadow: false });
            } else if (obj.type === 'fireball_spitter') {
              // 32:喷火火球:本体 + 朝右炮口(静态预览;运行时再朝玩家翻面)
              var fx0 = q2.x + ts * 0.42, fy0 = q2.y + ts / 2;
              ctx.fillStyle = '#ff8f3a';
              ctx.beginPath(); ctx.arc(fx0, fy0, Math.max(4, ts * 0.22), 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke();
              ctx.fillStyle = '#ff7a1a';
              ctx.fillRect(fx0 + ts * 0.16, fy0 - ts * 0.06, Math.max(4, ts * 0.24), Math.max(2, ts * 0.12));
              if (ts >= 12) RA.text(ctx, '喷', Math.max(7, ts * 0.26), [255, 226, 190],
                q2.x + ts / 2, q2.y - 3, { bold: true, shadow: false });
            } else {
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

      // 33:齿轮轨道换作者图(只换显示,不改 paths/模式/节点/运动);移动火球仍只有创作辅助线
      var gearPaths = {};
      (m.data.objects || []).forEach(function (o) { if (o.type === 'gear' && o.pathId) gearPaths[o.pathId] = true; });
      Object.keys(gearPaths).forEach(function (pid) {
        if (!RA.trackPieces || !RA.ArtCatalog) return;
        var gp = (m.data.paths || []).filter(function (p) { return p.id === pid; })[0];
        var pieces = RA.trackPieces(gp);
        if (!pieces) return;
        pieces.forEach(function (piece) {
          var key = piece.kind === 'corner' ? 'authored/objects/track_corner' : 'authored/objects/track_straight';
          var timg = RA.ArtCatalog.image(this.assets, key);
          if (!timg) return;
          var tpt = this.cellToScreen(piece.c, piece.r);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.translate(tpt.x, tpt.y);
          if (piece.rot) ctx.rotate(piece.rot);
          ctx.drawImage(timg, -ts / 2, -ts / 2, ts, ts);
          ctx.restore();
        }, this);
      }, this);

      // 齿轮直角路径:与运行共享同一 segments
      (m.data.paths || []).forEach(function (path) {
        var c = RA.PathGeometry && RA.PathGeometry.compile(path);
        if (!c || !c.ok) return;
        ctx.save();
        ctx.strokeStyle = path.mode === 'loop' ? '#f59e0b' : '#60a5fa';
        ctx.lineWidth = Math.max(2, ts * 0.08);
        c.value.segments.forEach(function (s) {
          var a = this.cellToScreen(s.a.col + 0.5, s.a.row + 0.5);
          var b = this.cellToScreen(s.b.col + 0.5, s.b.row + 0.5);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }, this);
        (path.points || []).forEach(function (pt, idx) {
          var q = this.cellToScreen(pt.col + 0.5, pt.row + 0.5);
          ctx.fillStyle = idx === 0 ? '#ef4444' : '#e5e7eb';
          ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(3, ts * 0.12), 0, Math.PI * 2); ctx.fill();
        }, this);
        ctx.restore();
      }, this);
      // 流星锤悬停预览:端点、4格轨道辅助圆、初始正下方链条;不创建第二份路径真值
      if (!this.mouse.outside && this.ch === '~flail' && this.tool === 'brush' && !m.readOnly) {
        var fc = this.cellAt(this.mouse.x, this.mouse.y);
        var cq = this.cellToScreen(fc.c, fc.r);
        var ccx = cq.x + ts / 2, ccy = cq.y + ts / 2;
        var orbit = 4 * ts;
        ctx.save();
        ctx.strokeStyle = 'rgba(148,163,184,.65)'; ctx.setLineDash && ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(ccx, ccy, orbit, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash && ctx.setLineDash([]);
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = Math.max(2, ts * 0.06);
        ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(ccx, ccy + orbit); ctx.stroke();
        ctx.fillStyle = '#c7d2fe';
        ctx.beginPath(); ctx.arc(ccx, ccy, Math.max(3, ts * 0.12), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.arc(ccx, ccy + orbit, Math.max(4, ts * 0.18), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (this.soulGesture) {
        var sg = this.soulGesture;
        var qs = this.cellToScreen(sg.col + 0.5, sg.row + 0.5);
        ctx.save();
        ctx.fillStyle = 'rgba(159,216,255,.22)';
        ctx.beginPath(); ctx.arc(qs.x, qs.y, ts * 0.28, 0, Math.PI * 2); ctx.fill();
        var sv = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
        sg.directions.forEach(function (d) {
          var v = sv[d], chosen = d === sg.dir;
          var ex = qs.x + v.x * ts * 0.85, ey = qs.y + v.y * ts * 0.85;
          ctx.strokeStyle = chosen ? '#9fd8ff' : 'rgba(159,216,255,.38)';
          ctx.lineWidth = chosen ? 3 : 2;
          ctx.beginPath(); ctx.moveTo(qs.x, qs.y); ctx.lineTo(ex, ey); ctx.stroke();
          if (chosen) {
            ctx.fillStyle = '#d8f1ff';
            ctx.beginPath(); ctx.arc(ex, ey, Math.max(3, ts * 0.09), 0, Math.PI * 2); ctx.fill();
          }
        });
        ctx.restore();
      }
      if (this.portMark && this.portMark.anchor) {
        var pa = this.portMark.anchor;
        var pq = this.cellToScreen(pa.col, pa.row);
        ctx.save();
        ctx.fillStyle = this.portMark.valid ? 'rgba(52,211,153,.22)' : 'rgba(248,113,113,.22)';
        ctx.strokeStyle = this.portMark.valid ? '#34d399' : '#f87171';
        ctx.lineWidth = 2;
        ctx.fillRect(pq.x, pq.y, ts * 2, ts);
        ctx.strokeRect(pq.x, pq.y, ts * 2, ts);
        if (ctx.setLineDash) ctx.setLineDash([5, 4]);
        ctx.strokeRect(pq.x, pq.y, ts * 2, ts);
        ctx.restore();
        if (ts >= 16) RA.text(ctx, (pa.col) + ',' + pa.row, Math.max(8, ts * 0.26),
          this.portMark.valid ? [220, 255, 240] : [255, 220, 220], pq.x + ts, pq.y - 2, { bold: true, shadow: false });
      }

      if (this.selection) {
        var q0 = this.cellToScreen(this.selection.c0, this.selection.r0);
        var q1 = this.cellToScreen(this.selection.c1 + 1, this.selection.r1 + 1);
        ctx.save(); ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]); ctx.strokeRect(q0.x, q0.y, q1.x - q0.x, q1.y - q0.y); ctx.restore();
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

    /**
     * 合并写回编辑器偏好:保留已有字段(如 autoGrow 之外将来加的偏好),
     * 只覆盖当前主题/自动扩图。返回是否真的写成功。
     */
    savePrefs() {
      var prefs = loadPrefs() || { schemaVersion: 1 };
      prefs = Object.assign({}, prefs, { theme: this.theme, autoGrow: !!this.autoGrow });
      if (!prefs.schemaVersion) prefs.schemaVersion = 1;
      try {
        if (!globalThis.localStorage) return false;
        localStorage.setItem('ra_editor_preferences_v1', JSON.stringify(prefs));
        return true;
      } catch (e) { return false; }
    }

    /**
     * 主题按钮只有一个接线(Editor.wire 的 click;HTML 里不再有内联 onclick),
     * 所以键盘激活(Enter/Space)和鼠标点击都只切一次。
     * 主题是编辑器偏好:只写 ra_editor_preferences_v1,不碰 LevelData/hash/dirty/通过记录;
     * 合并保存时保留已有字段,保存失败仍临时切换但不谎报"已保存"。
     */
    toggleTheme() {
      var next = this.theme === 'dark' ? 'light' : 'dark';
      this.theme = next;
      applyTheme(next);
      var saved = this.savePrefs();
      this.syncUI();
      this.say(saved ? ('已切换到' + (next === 'dark' ? '深色' : '浅色') + '主题') : '本次已切换,但偏好保存失败(刷新后可能回退)', saved ? 'ok' : 'warn');
      return saved;
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

      // 24号卡:齿轮的往返/闭合只作为齿轮专属工具显示,不占用别的元素
      var gearRow = this.$('gear-mode-row'), gearNote = this.$('gear-mode-note');
      var showGear = this.ch === '~gear' || this.ch === '~fireball_moving';
      if (gearRow) gearRow.style.display = showGear ? 'flex' : 'none';
      if (gearNote) gearNote.style.display = showGear ? 'block' : 'none';

      var bgSel = this.$('bg-select');
      if (bgSel) {
        var wantLen = 1 + (RA.LevelBackgrounds ? RA.LevelBackgrounds.list().length : 0) +
          (this.model.backgroundImage ? 1 : 0) +
          (this.model.backgroundId && !(RA.LevelBackgrounds && RA.LevelBackgrounds.has(this.model.backgroundId)) ? 1 : 0);
        // 清单条数变了(或首次值不在选项里)才重建;测试替身没有 .options 时跳过
        if (bgSel.options && bgSel.options.length !== wantLen) this.buildBackgroundSelect();
        bgSel.value = this.model.backgroundImage ? '__custom__' : (this.model.backgroundId || '');
        var bgStatus = this.$('bg-file-status');
        if (bgStatus) {
          bgStatus.textContent = this.model.backgroundImage
            ? ('当前自定义图片:' + (this.model.backgroundName || '已选择') + '(写入 visuals.backgroundImage,跟随本关 JSON)')
            : '内置背景写在 visuals.backgroundId;自定义图片写入 visuals.backgroundImage,不同关卡可各选一张。';
        }
      }
      var diffSel = this.$('difficulty-select');
      if (diffSel) diffSel.value = String(this.model.difficulty === null ? 1 : this.model.difficulty);

      var ro = this.model.readOnly;
      var banner = this.$('readonly-banner');
      if (banner) banner.hidden = !ro;
      ['name', 'w-input', 'h-input', 'btn-apply-size', 'btn-crop', 'btn-play', 'btn-start-mark', 'btn-finish-mark', 'btn-start-clear', 'btn-finish-clear', 'btn-undo', 'btn-redo'].forEach(function (id) {
        var el = self.$(id); if (el) el.disabled = ro;
      });
      if (ro) {
        var note = this.$('ports-note');
        if (note) note.textContent = '固定场景只读;导出保留原 Boss/出生/未知信息,不转普通图。';
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
