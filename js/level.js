/* -*- coding: utf-8 -*- */
/*
 * level.js —— 一层塔:地形网格 + 碰撞
 * ===================================
 * 一层 = **一张字符地图(asc)** + **一点元信息(json)**。地图格式与 abyss 一样
 * (用字符画出来的图,老朋友直接拿来就能用):
 *
 *     +++++ +++G++                      + 或空格 = 空气
 *     ++^^__++==+                       ^         = 草地
 *     ++__  __==+                       _         = 泥土
 *                                        ~         = 砖块
 *                                        =         = 石块
 *                                        P         = 出生点(放地面上方那格)
 *                                        G         = 出口(会自动落到下面的地面)
 *  · 行 0 在最上面,列 0 在最左边;一格 = TS(45)px。
 *  · 行尾不用写满,自动补空。
 *  · 想加新东西:js/entities/ 里注册一个字符就行,这里不用改。
 *
 * 关卡数据长这样(levels/floor01.json,也是 levels/levels.js 里内嵌的那份):
 *
 *     {
 *       "id": "floor01",              ← 关卡的固定身份(以前这里是名字,现在没有名字了)
 *       "difficulty": 1,              ← 难度 1~4 档
 *       "verified": true,             ← 是不是"验过能通"的关卡
 *       "size": {"cols": 22, "rows": 32},   ← 关卡大小(和 asc 对不上会提醒,以 asc 为准)
 *       "sky": 0,                     ← 0 = 天空随层数循环;1~8 = 固定用那一张
 *       "objects": [],                ← 带参数的元素(怪物 / 以后的机关):见 _buildObjects
 *       "asc": ["+++++G+++", "+++^^^+", …]  ← 地图本体,一行一格
 *     }
 *
 * "asc" 也可以是一整段带换行的字符串(老 txt 就是这种)。
 * 元信息行 `// name:` 这种老写法仍然认(编辑器现在写出来的还是它),只是关卡内容
 * 一律以 asc 为准 —— 见下面的 parseComments()。
 *
 * 和 abyss 的两点不同(都是为了"向上爬"):
 *   ① 没写 P/G 时的自动兜底反过来了:出生点放**最下面**那块地面,
 *      出口放**最高**那块地面 —— 向上爬的关卡天然长这样。
 *   ② 出口的判定是个方盒子(宽 GOAL_WIDTH / 高 GOAL_HEIGHT),不再用旗杆那套。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  // ---------- 地图语法 ----------
  var META_PREFIX = '//';        // 老格式的元信息行:  // name: 关卡名 / // sky: 3
  var EMPTY_CHARS = '+ ';        // 空气(行尾自动补的就是空格,所以它也算空气)
  var LEGACY_EMPTY = '.';        // 老地图用 '.' 表示空气,现在还能读
  var SPAWN_CHARS = 'P';         // 出生点标记

  // 难度几档(1 = 最容易)。数据里超出范围的会被夹回来。
  var MIN_DIFFICULTY = 1;
  var MAX_DIFFICULTY = 4;

  // 每种地块长什么样:字符 → [素材名, 中文名]
  // 加一种新地块(冰面、沙地……)= 这里加一行 + 往 assets/tiles/ 放一张 PNG
  // (尺寸随意,画的时候会缩放到一格)+ 可选地在 assets.js 里写个兜底画法。
  // 实心判定、绘制、关卡检查器的图例全是从这张表推出来的。
  var TILE_IMAGES = {
    '^': ['tiles/grass_top', '草地'],
    '_': ['tiles/dirt', '泥土'],
    '~': ['tiles/brick', '砖块'],
    '=': ['tiles/stone', '石块'],
    '-': ['tiles/cloud', '云板(单向,下往上能穿)']
  };
  // 单向地块(云板):从下面往上跳能穿过去,从上面掉下来会被接住 —— 只挡"往下踩"。
  // 横向不当墙(能穿过去),也不能像实心那样顶头。以后加更多单向地块就写进这个字符串。
  var ONEWAY_CHARS = '-';
  var TILE_CHAR_LIST = Object.keys(TILE_IMAGES);
  // "实心" = 怎么都挡人的地块(不含单向的)
  var SOLID_CHARS = TILE_CHAR_LIST.filter(function (ch) {
    return ONEWAY_CHARS.indexOf(ch) < 0;
  }).join('');
  var TILE_CHARS = Object.keys(TILE_IMAGES);
  // fromRects(程序造地形)用哪两种地块:表面铺第一种,下面垫第二种
  var DEFAULT_TILE = TILE_CHARS[0];
  var FILL_TILE = TILE_CHARS[1];

  function isSolidChar(ch) {
    return SOLID_CHARS.indexOf(ch) >= 0;
  }

  /** 是不是单向地块(云板) */
  function isOnewayChar(ch) {
    return ONEWAY_CHARS.indexOf(ch) >= 0;
  }

  /** 是不是地块(画的时候用它判断:实心和单向都要画) */
  function isTileChar(ch) {
    return !!TILE_IMAGES[ch];
  }

  /** 脚底下能站的东西:实心或者单向云板都算 */
  function isGroundChar(ch) {
    return isSolidChar(ch) || isOnewayChar(ch);
  }

  // ================= 地块怎么画(贴图尺寸自适应)=================
  /*
   * 地块贴图**不一定是 TS×TS**。现在用的是 textures/block 那套 16×16 的像素画
   * (见 README「贴图」),所以画的时候统一**缩放到一格**:
   *   · 源图比一格小(像素画)→ 放大时关掉平滑,保持硬边,不然糊成一片;
   *   · 源图比一格还大 → 保留平滑再缩小,免得出现摩尔纹。
   * 换成 32×32、64×64 的贴图也不用改代码,走的还是这一条。
   *
   * TILE_PLATE 里那几个字符是"薄平台"(云板):它只占一格的上面一截,
   * 所以只取贴图上面那一截画在这一格的上沿,下面留空 ——
   * 玩家一眼能看出"这是能穿过去的板子",不会当成整块砖。
   */
  var TILE_PLATE = { '-': 0.29 };      // 云板:画上面 29%(一格 45px 里的 13px)

  /**
   * 把一个地块贴图画进 (x, y) 起的 size×size 格子里。
   * 游戏(level.draw)和编辑器(地图 + 调色板)都走这一条,免得两边画得不一样。
   */
  function drawTile(ctx, ch, img, x, y, size) {
    if (!img) return;
    var iw = img.width || size;
    var ih = img.height || size;
    var plate = TILE_PLATE[ch];
    // 源图比格子大 = 要缩小,保留平滑;否则(像素画放大)用硬边
    var shrink = Math.max(iw, ih) > size;
    if (plate) {
      var sh = Math.max(1, Math.min(ih, Math.round(ih * plate)));   // 源图上面这一截
      ctx.imageSmoothingEnabled = shrink;
      ctx.drawImage(img, 0, 0, iw, sh, x, y, size, size * plate);
      return;
    }
    ctx.imageSmoothingEnabled = shrink;
    ctx.drawImage(img, x, y, size, size);
  }

  // ================= 关卡数据(asc + json)=================
  /**
   * 一个值 → 统一的关卡数据对象 {id, asc, …}。三种写法都收:
   *   · 新格式对象(levels/*.json 读出来 / levels.js 里内嵌的)
   *   · JSON 字符串(比如「导入关卡」时拖进来的一个 .json 文件)
   *   · 一整段地图文本(老 txt、编辑器导出的、自定义关卡)—— 当成 asc
   * 读不出来返回 null。
   */
  function dataOf(value, id) {
    if (typeof value === 'string') {
      var s = value.trim();
      if (s.charAt(0) !== '{') return { id: id, asc: value };
      try { value = JSON.parse(s); } catch (e) { return null; }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var data = {};
    Object.keys(value).forEach(function (k) { data[k] = value[k]; });
    if (!data.id) data.id = id;
    if (data.asc === undefined || data.asc === null) data.asc = '';
    return data;
  }

  /** asc 可以是"一行一项的数组",也可以是一整段带换行的文本 */
  function ascLines(asc) {
    if (Array.isArray(asc)) return asc.map(function (l) { return String(l); });
    return String(asc).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  }

  /** 老格式的注释行 → 元信息:// name: xxx / // sky: 3 */
  function parseComments(asc) {
    var meta = {};
    ascLines(asc).forEach(function (raw) {
      var stripped = raw.replace(/^\s+/, '');
      if (stripped.indexOf(META_PREFIX) !== 0) return;
      var kv = stripped.slice(META_PREFIX.length).trim();
      var i = kv.indexOf(':');
      if (i >= 0) meta[kv.slice(0, i).trim().toLowerCase()] = kv.slice(i + 1).trim();
    });
    return meta;
  }

  /** asc → 规整好的地图行:扔掉注释、掐掉前后空行、行尾补空、(可选)左右镜像 */
  function normalizeRows(asc, flipX) {
    var body = ascLines(asc).map(function (l) { return l.replace(/\s+$/, ''); })
      .filter(function (l) { return l.replace(/^\s+/, '').indexOf(META_PREFIX) !== 0; });
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body[body.length - 1].trim()) body.pop();

    var width = body.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
    var lines = body.map(function (l) { return l.padEnd(width, ' '); });   // 行尾自动补空
    if (flipX) lines = lines.map(function (l) { return l.split('').reverse().join(''); });
    return lines;
  }

  class Level {
    // ================= 构造 =================
    constructor(id, chars, meta) {
      this.id = id || '未命名楼层';                    // 固定身份(名字没有,显示就用它)
      this.meta = meta || {};
      this.name = this.meta.name || this.id;           // 老格式里 // name: 的名字,新格式就等于 id
      this.flipX = false;                              // 是不是被镜像过(爬塔"重构"用)
      this.source = this.meta.source || '';            // 来自哪个文件(排查问题用)

      // 难度 1~4 档;没写或者写了怪东西都按 1 算
      var diff = parseInt(this.meta.difficulty, 10);
      this.difficulty = RA.clamp(isNaN(diff) ? MIN_DIFFICULTY : diff,
        MIN_DIFFICULTY, MAX_DIFFICULTY);
      // 验没验过:新格式里是数据的一部分;老格式没有这个概念,当成"验过"(不然控制台全是提醒)
      this.verified = this.meta.verified === undefined ? true : !!this.meta.verified;

      // 天空:关卡可以写 sky: 3 指定用 assets/sky/sky3.png;
      // 不写(或 0)就是自动 —— 爬塔时按层循环,见 game.js 的 skyOf
      var sky = parseInt(this.meta.sky, 10);
      this.sky = (sky >= 1 && sky <= (C.SKY_COUNT || 8)) ? sky : 0;

      this.chars = chars.map(function (row) { return row.split(''); });
      this.rows = this.chars.length;
      this.cols = this.rows ? this.chars[0].length : 0;
      this.tile = C.TS;
      this.worldW = this.cols * C.TS;
      this.worldH = this.rows * C.TS;

      this.grid = this.chars.map(function (row) {
        return row.map(isSolidChar);
      });
      // 单向地块单独存一张表(碰撞的时候要区别对待)
      this.oneway = this.chars.map(function (row) {
        return row.map(isOnewayChar);
      });
      this.entities = [];
      this.objects = [];        // json 的 objects[]:带参数的元素(现在游戏里还没有)
      this.warnings = [];
      this.spawnCol = this.spawnRow = null;

      this._buildEntities();      // 先把地图上的标记变成实体
      this._buildObjects();       // 再摆 objects[] 里那些带参数的元素
      this._checkSize();          // json 里写的大小对不对
      this._finalizeSpawn();      // 再算出生点
      this._finalizeGoal();       // 最后确保一定有一个出口
    }

    /**
     * 读一份关卡数据(新格式对象 / JSON 字符串 / 老格式纯文本都行)。
     * opts.id 关卡 id;opts.flipX 左右镜像;opts.source 来源(排查问题用)
     * opts.fallbackName 是老写法,和 opts.id 一个意思(以前名字就是身份)。
     */
    static fromData(value, opts) {
      opts = opts || {};
      var fallbackId = opts.id || opts.fallbackName;
      var data = dataOf(value, fallbackId) || { id: fallbackId, asc: '' };
      var id = data.id || fallbackId || '未命名楼层';

      // 老格式的注释先垫底,json 里明写的字段再盖上去(明写的一定说了算)
      var meta = parseComments(data.asc);
      Object.keys(data).forEach(function (k) {
        if (k === 'asc' || k === 'id') return;
        if (data[k] !== undefined && data[k] !== null) meta[k] = data[k];
      });
      meta.id = id;
      if (opts.source) meta.source = opts.source;

      var lines = normalizeRows(data.asc, opts.flipX);
      var lv = new Level(id, lines, meta);
      lv.flipX = !!opts.flipX;
      return lv;
    }

    /** 读一段地图文本(老格式:注释 + 地图)。等价于 fromData({asc: text})。 */
    static fromText(text, opts) {
      return Level.fromData({ asc: text }, opts);
    }

    /** 用矩形块拼地形(solids 里每项 = [列起, 列止, 顶行, 底行?])—— 适合测试 / 批量造图 */
    static fromRects(id, rows, cols, solids, meta) {
      var chars = [];
      for (var r = 0; r < rows; r++) {
        chars.push(new Array(cols).fill(EMPTY_CHARS[0]));
      }
      solids.forEach(function (b) {
        var c0 = b[0], c1 = b[1], top = Math.max(0, b[2]);
        var bot = b.length > 3 ? b[3] : rows - 1;
        for (var c = Math.max(0, c0); c <= Math.min(c1, cols - 1); c++) {
          for (var r = Math.max(0, top); r <= Math.min(bot, rows - 1); r++) {
            chars[r][c] = (r === top) ? DEFAULT_TILE : FILL_TILE;
          }
        }
      });
      return new Level(id, chars.map(function (r) { return r.join(''); }), meta);
    }

    // ================= 解析地图上的标记 =================
    _buildEntities() {
      var pending = [], legacy = false, self = this;
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          var ch = this.chars[r][c];
          if (EMPTY_CHARS.indexOf(ch) >= 0 || isTileChar(ch)) continue;   // 实心 + 单向云板都是地块
          if (ch === LEGACY_EMPTY) {                 // 老地图:'.' 以前表示空气
            this.chars[r][c] = EMPTY_CHARS[0];
            legacy = true;
            continue;
          }
          this.chars[r][c] = EMPTY_CHARS[0];         // 标记本身不当地形
          if (SPAWN_CHARS.indexOf(ch) >= 0) {
            if (this.spawnCol === null) {
              this.spawnCol = c;
              this.spawnRow = r;
            } else {
              this.warnings.push('第 ' + r + ' 行第 ' + c + ' 列还有第二个出生点,忽略了');
            }
            continue;
          }
          var cls = RA.BY_LETTER[ch];
          if (!cls) {
            this.warnings.push('第 ' + r + ' 行第 ' + c + " 列的字符 '" + ch + "' 不认识,当成空的处理了");
            continue;
          }
          pending.push([cls, c, r]);
        }
      }
      if (legacy) {
        this.warnings.push("这关还在用老的 '.' 表示空气,现在空气是 '+' 了(这次已按空气处理)");
      }
      // 网格建好之后再实例化,这样实体构造时能查地形
      pending.forEach(function (p) {
        self.entities.push(new p[0](self, p[1], p[2]));
      });
    }

    /**
     * json 的 objects[]:摆"带参数的元素"(怪物 / 以后的机关)。
     * 每条长这样:
     *     {"type": "fireball", "col": 3, "row": 5, "params": {"speed": 120}}
     * 地形和地物(那些单字符的标记)写在 asc 里就够了;只有**要带参数**的东西才写在这儿。
     *
     * type 在 RA.BY_TYPE 里注册过(实体类上写了 `Entity.type = 'fireball'`)就顺便生成实体,
     * 构造签名是 (level, col, row, params);还没实现的(比如现在的火球)只留数据不报错 ——
     * 这样设计者可以先把参数写进关卡,等引擎补上行为就自动生效。
     */
    _buildObjects() {
      var list = this.meta.objects;
      if (!Array.isArray(list)) return;
      var self = this;
      list.forEach(function (o) {
        if (!o || typeof o !== 'object' || !o.type) return;
        var rec = {
          type: String(o.type),
          col: Math.max(0, Math.round(Number(o.col) || 0)),
          row: Math.max(0, Math.round(Number(o.row) || 0)),
          params: (o.params && typeof o.params === 'object') ? o.params : {}
        };
        self.objects.push(rec);
        var cls = RA.BY_TYPE && RA.BY_TYPE[rec.type];
        if (cls) self.entities.push(new cls(self, rec.col, rec.row, rec.params));
      });
    }

    /** json 里写了 size 就拿它和 asc 真正读出来的大小对一遍(以 asc 为准,只提醒) */
    _checkSize() {
      var size = this.meta.size;
      if (!size || typeof size !== 'object') return;
      var cols = Number(size.cols) || 0, rows = Number(size.rows) || 0;
      if ((cols && cols !== this.cols) || (rows && rows !== this.rows)) {
        this.warnings.push('json 里写的大小是 ' + (cols || '?') + '×' + (rows || '?') +
          ',asc 读出来是 ' + this.cols + '×' + this.rows + '(以 asc 为准)');
      }
    }

    /** 第 r 行第 c 列是不是单向云板 */
    onewayAt(r, c) {
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
      return this.oneway[r][c];
    }

    /**
     * 全部"能站人的地面":上面是空的实心格,或者上面是空的单向云板。
     * 返回 [{col,row}],行号小的在上面。向上爬塔的可达性分析也拿它当落脚点。
     */
    surfaces() {
      var out = [];
      for (var c = 0; c < this.cols; c++) {
        for (var r = 1; r < this.rows; r++) {
          var stand = this.grid[r][c] || this.oneway[r][c];
          if (!stand) continue;
          if (this.grid[r - 1][c] || this.oneway[r - 1][c]) continue;
          out.push({ col: c, row: r });
        }
      }
      return out;
    }

    _finalizeSpawn() {
      if (this.spawnCol === null) {                   // 地图里没写 P → 用最下面那块地面
        var lowest = null;
        this.surfaces().forEach(function (s) {
          if (!lowest || s.row > lowest.row) lowest = s;
        });
        if (lowest) {
          this.spawnCol = lowest.col;
          this.spawnRow = lowest.row;
          this.warnings.push('地图里没有 P(出生点),自动用了最下面那块地面');
        }
      }
      if (this.spawnCol === null) {                   // 整张图都是空的
        this.spawnCol = this.spawnRow = 0;
        this.warnings.push('这张地图一块实心地形都没有!');
      }
      var ground = this.groundBelow(this.spawnRow, this.spawnCol);
      if (ground !== null) this.spawnRow = ground;
      this.startX = this.spawnCol * this.tile + 8;
      this.startFeet = this.spawnRow * this.tile;
    }

    _finalizeGoal() {
      var goal = null, self = this;
      this.entities.forEach(function (e) { if (e instanceof RA.Goal) goal = e; });
      if (!goal) {                                    // 地图里没写 G → 用最高那块地面(靠右优先)
        var best = null;
        this.surfaces().forEach(function (s) {
          if (!best || s.row < best.row || (s.row === best.row && s.col > best.col)) best = s;
        });
        var col = best ? best.col : 0;
        goal = new RA.Goal(this, col, 0);
        this.entities.push(goal);
        this.warnings.push('地图里没有 G(出口),自动放在了最高的地面上');
      }
      this.goal = goal;
      void self;
    }

    // ================= 查询 =================
    get goalCol() { return this.goal.col; }
    get goalRow() { return this.goal.row; }
    get goalX() { return this.goal.x; }
    get goalFeet() { return this.goal.y; }

    solid(r, c) {
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
      return this.grid[r][c];
    }

    /** 第 c 列最上面那块实心的行号(整列都空则 null) */
    topAt(c) {
      for (var r = 0; r < this.rows; r++) if (this.grid[r][c]) return r;
      return null;
    }

    /** 从 row 行往下找,第 col 列第一块实心在哪一行(没有则 null)。有碰撞的地物也算。 */
    groundBelow(row, col) {
      if (col < 0 || col >= this.cols) return null;
      for (var r = Math.max(0, row); r < this.rows; r++) {
        if (this.grid[r][col] || this.oneway[r][col] || this.solidEntityAt(r, col)) return r;
      }
      return null;
    }

    win(player) {
      return this.goal.reached(player);
    }

    // ================= 碰撞 =================
    /**
     * 这一格有没有"有碰撞体积的地物"占着(见 Entity.solidAt)。
     * 现在只有会变的机关会返回 true:踩一会儿就消失的浮石、碰到就散的碎影。
     * 扫一遍实体就够了(一层通常没几个),而且它们的挡不挡人是每帧变的,
     * 所以不做缓存 —— 缓存反而要处理"什么时候失效"。
     */
    solidEntityAt(r, c) {
      var list = this.entities;
      for (var i = 0; i < list.length; i++) {
        if (list[i].solidAt && list[i].solidAt(r, c)) return true;
      }
      return false;
    }

    /** 这一格挡不挡人:地形(实心/单向)或者有碰撞体积的地物 */
    blockedAt(r, c) {
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
      if (this.grid[r][c] || this.oneway[r][c]) return true;
      return this.solidEntityAt(r, c);
    }

    /**
     * 和矩形重叠的地块,每项 [行, 列, 是不是单向的]。
     * includeOneway = true 时连单向云板一起返回(往下落的时候要判它们);
     * 默认只返回实心(横向移动 / 往上顶头都只认实心)。
     * 有碰撞体积的地物(会变的机关)按"实心"算,所以横竖顶都能挡。
     */
    _hitTiles(x, y, w, h, includeOneway) {
      var t = this.tile, out = [];
      var c0 = Math.max(0, Math.floor(x / t));
      var c1 = Math.min(this.cols - 1, Math.floor((x + w - 1) / t));
      var r0 = Math.max(0, Math.floor(y / t));
      var r1 = Math.min(this.rows - 1, Math.floor((y + h - 1) / t));
      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          if (this.grid[r][c]) out.push([r, c, false]);
          else if (includeOneway && this.oneway[r][c]) out.push([r, c, true]);
          else if (this.solidEntityAt(r, c)) out.push([r, c, false]);
        }
      }
      return out;
    }

    hits(x, y, w, h) {
      return this._hitTiles(x, y, w, h).length > 0;
    }

    /**
     * 脚底正下方有没有能站的东西:实心,或者"从上面踩得住"的云板。
     * 云板只有脚底还贴在它顶面附近(没陷进去)才算站着 ——
     * 这样从下面往上穿、穿到一半又掉回来的时候,不会被粘在半空。
     */
    standingOn(x, feet, w) {
      if (this.hits(x, feet, w, 2)) return true;        // 实心:脚底下 2px 内有地
      var t = this.tile;
      var c0 = Math.max(0, Math.floor(x / t));
      var c1 = Math.min(this.cols - 1, Math.floor((x + w - 1) / t));
      var r0 = Math.max(0, Math.floor((feet - 1.5) / t));
      var r1 = Math.min(this.rows - 1, Math.floor(feet / t));
      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          if (!this.oneway[r][c]) continue;
          if (feet <= r * t + 1.5) return true;         // 正好踩在顶面上
        }
      }
      return false;
    }

    /**
     * 把一个矩形移动过去并解决碰撞(先横后纵)。
     * 返回 {x, y, vx, vy, grounded}
     */
    move(x, y, w, h, vx, vy, dt) {
      var grounded = false, t = this.tile;
      var oldFeet = y + h;                    // 移动之前的脚底(判云板要用)
      // 1) 横向 + 撞墙:云板横向不当墙,直接穿过去
      var nx = x + vx * dt;
      if (vx > 0 && this.hits(nx, y, w, h)) {
        nx = Math.floor((nx + w) / t) * t - w;
        vx = 0;
      } else if (vx < 0 && this.hits(nx, y, w, h)) {
        nx = (Math.floor(nx / t) + 1) * t;
        vx = 0;
      }
      x = nx;
      // 2) 纵向:往下落时实心和"从上面踩得住"的云板都挡;往上(顶头)只认实心
      var ny = y + vy * dt;
      if (vy > 0) {
        // 探针矩形往下多伸 1.1px:_hitTiles 的末端内缩 1px,而站着不动时每帧
        // 只压过顶面 0.6px —— 不伸出去会漏掉云板,人就一点点沉下去最后穿过去
        var down = this._hitTiles(x, ny, w, h + 1.1, true).filter(function (p) {
          // 云板:只有"动之前脚底就在它顶面之上"才接(从上面踩下来);
          // 从下面穿上来、人已经陷在板子里的时候不接,免得被卡在半空
          return !p[2] || oldFeet <= p[0] * t + 0.01;
        });
        if (down.length) {
          var top = Math.min.apply(null, down.map(function (p) { return p[0]; }));
          ny = top * t - h;
          vy = 0;
          grounded = true;
        }
      } else if (vy < 0) {
        var up = this._hitTiles(x, ny, w, h);          // 只算实心
        if (up.length) {
          var topRow = Math.min.apply(null, up.map(function (p) { return p[0]; }));
          // 碰到的是"有碰撞体积的地物"(会变的机关)时,只把人顶到它下边缘往里 1px ——
          // 正好贴边的话,那个实体的矩形和玩家的矩形会刚好擦边、判不出重叠
          // (浮石就永远踩不湿、碎影撞了也不碎)。贴 1px 进去,重叠判定就稳了。
          var onlyEntity = up.every(function (p) { return this.solidEntityAt(p[0], p[1]); }, this);
          ny = (topRow + 1) * t - (onlyEntity ? 1 : 0);
          vy = 0;
        }
      }
      return { x: x, y: ny, vx: vx, vy: vy, grounded: grounded };
    }

    // ================= 绘制 =================
    /**
     * 画地形(只画镜头看得见的那一块)。
     * 贴图会被缩放到一格大小(规则见上面 drawTile),所以 assets/tiles 里的图
     * 是 16×16 还是 64×64 都行。
     */
    draw(ctx, cam, assets) {
      var t = this.tile;
      var c0 = Math.max(0, Math.floor(cam.ox / t));
      var c1 = Math.min(this.cols - 1, Math.floor((cam.ox + cam.vw) / t));
      var r0 = Math.max(0, Math.floor(cam.oy / t));
      var r1 = Math.min(this.rows - 1, Math.floor((cam.oy + cam.vh) / t));
      ctx.save();
      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          var ch = this.chars[r][c];
          if (!isTileChar(ch)) continue;      // 实心和单向云板都要画
          drawTile(ctx, ch, assets.image(TILE_IMAGES[ch][0]),
            c * t - cam.ox, r * t - cam.oy, t);
        }
      }
      ctx.restore();
    }

    /** 地形的附属装饰:出生点上方的"起点"箭头(往上是前进方向) */
    drawDecor(ctx, cam) {
      var t = this.tile;
      var sx = this.spawnCol * t + t / 2 - cam.ox;
      var sy = this.startFeet - cam.oy;
      if (!(sx > -80 && sx < cam.vw + 80 && sy > -80 && sy < cam.vh + 80)) return;
      ctx.save();
      ctx.globalAlpha = 0.9;
      RA.polygon(ctx, [[sx, sy - 78], [sx - 7, sy - 64], [sx + 7, sy - 64]], [240, 140, 90]);
      ctx.restore();
    }
  }

  Level.dataOf = dataOf;
  Level.parseComments = parseComments;
  Level.ascLines = ascLines;

  RA.Level = Level;
  RA.levelData = dataOf;             // 关卡数据归一化(levelpack / 关卡工具共用一处)
  RA.TILE_IMAGES = TILE_IMAGES;
  RA.TILE_PLATE = TILE_PLATE;        // 哪些地块是"薄平台"(只画上面一截)
  RA.drawTile = drawTile;            // 地块贴图 → 一格(尺寸自适应,编辑器也用它)
  RA.SOLID_CHARS = SOLID_CHARS;
  RA.ONEWAY_CHARS = ONEWAY_CHARS;
  RA.EMPTY_CHARS = EMPTY_CHARS;
  RA.LEGACY_EMPTY = LEGACY_EMPTY;
  RA.SPAWN_CHARS = SPAWN_CHARS;
  RA.MIN_DIFFICULTY = MIN_DIFFICULTY;
  RA.MAX_DIFFICULTY = MAX_DIFFICULTY;
  RA.isSolidChar = isSolidChar;
  RA.isOnewayChar = isOnewayChar;
  RA.isTileChar = isTileChar;
  RA.isGroundChar = isGroundChar;
})(globalThis.RA = globalThis.RA || {});
