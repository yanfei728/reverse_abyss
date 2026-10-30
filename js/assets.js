/* -*- coding: utf-8 -*- */
/*
 * assets.js —— 素材总管
 * =====================
 * abyss 的素材是 build_assets.py 用 pygame 现画成 PNG 的;这里是同一套画法
 * 用 canvas 现画在离屏画布上 —— **一个图片文件都不需要**,双击 index.html
 * 就能跑,不存在"少了哪张图"的问题。
 *
 * 画法是从 abyss/build_assets.py 一比一搬过来的(角色每帧的姿势、四种瓦片、
 * 配色都对齐了),所以搬过来的关卡在地形上和 abyss 看起来是一套东西。
 *
 * 想换成自己的图:把 PNG 丢进 assets/images/<同名>.png(比如
 * assets/images/player/idle.png),main.js 启动时会自动换成你的图;
 * 图不存在就继续用程序画的。素材名见下面 BUILDERS 的键。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var TS = C.TS;

  // ================= 通用配色(与 build_assets.py 一致) =================
  var C_OUT = [30, 30, 40, 255];
  var C_SKIN = [255, 208, 168], C_SKIN_S = [226, 176, 138];
  var C_HAIR = [126, 88, 50], C_HAIR_S = [92, 62, 32];
  var C_SHIRT = [236, 96, 72], C_SHIRT_S = [186, 70, 52], C_SHIRT_L = [255, 150, 112];
  var C_PANTS = [82, 88, 138], C_PANTS_S = [58, 62, 104];
  var C_BOOT = [98, 64, 46], C_BOOT_S = [70, 44, 32];
  var C_BAG = [210, 148, 86], C_BAG_S = [170, 116, 62];
  var C_EYE_W = [255, 255, 255], C_EYE_P = [30, 30, 40];

  var PLAYER_W = 64, PLAYER_H = 84, FEET_Y = 80;   // 每帧画布大小 / 脚底高度

  // ================= 1. 角色逐帧 =================
  /** 按 pose(腿的落点等)画一帧朝右的角色 */
  function drawPlayer(pose) {
    var cv = RA.makeCanvas(PLAYER_W, PLAYER_H);
    var ctx = cv.getContext('2d');
    var cx = 30;                                   // 身体中轴
    var flx = pose.foot_l[0], fly = pose.foot_l[1];
    var frx = pose.foot_r[0], fry = pose.foot_r[1];
    var armB = pose.arm_b, armF = pose.arm_f;

    // ===== 先画"背后"层:背包 =====
    RA.circle(ctx, cx - 13, 46, 11, C_OUT);
    RA.circle(ctx, cx - 13, 46, 9, C_BAG);
    RA.circle(ctx, cx - 13, 49, 6, C_BAG_S);        // 背包下半暗部

    // ===== 腿(会被上衣盖住胯部)=====
    [[flx, fly], [frx, fry]].forEach(function (f) {
      var fx = f[0], fy = f[1];
      RA.capsule(ctx, [fx, 56], [fx, fy - 6], 9, C_PANTS, C_OUT, 2);
      RA.capsule(ctx, [fx, fy - 5], [fx, fy], 10, C_BOOT, C_OUT, 2);
      RA.capsule(ctx, [fx, fy - 2], [fx + 3, fy], 8, C_BOOT_S, C_OUT, 1);
    });
    RA.line(ctx, flx, 56, flx, fly - 6, 3, C_PANTS_S);   // 两腿之间的暗线

    // ===== 后手臂 =====
    RA.capsule(ctx, [cx - 7, 41], armB, 8, C_SHIRT_S, C_OUT, 2);
    RA.circle(ctx, armB[0], armB[1], 4, C_SKIN);

    // ===== 上衣 =====
    RA.rrect(ctx, cx - 11, 34, 22, 25, C_SHIRT, 6, C_OUT, 2);
    RA.rrect(ctx, cx - 8, 35, 6, 23, C_SHIRT_L, 3, C_OUT, 2);     // 高光带
    RA.rrect(ctx, cx - 11, 34, 22, 6, C_SHIRT_S, 6, C_OUT, 2);    // 领口
    RA.rect(ctx, cx - 11, 52, 22, 4, [46, 42, 58], 2);            // 腰带

    // ===== 前手臂 =====
    RA.capsule(ctx, [cx + 8, 40], armF, 8, C_SHIRT, C_OUT, 2);
    RA.circle(ctx, armF[0], armF[1], 4, C_SKIN);

    // ===== 头 =====
    RA.circle(ctx, cx, 18, 16, C_OUT);
    RA.circle(ctx, cx, 17, 14, C_HAIR);
    RA.circle(ctx, cx + 2, 22, 11, C_HAIR_S);                     // 发梢暗部
    RA.circle(ctx, cx, 17, 12, C_OUT);
    RA.circle(ctx, cx, 17, 10, C_SKIN);
    RA.circle(ctx, cx + 3, 21, 7, C_SKIN_S);                      // 脸部阴影
    RA.rect(ctx, cx - 9, 6, 22, 9, C_OUT, 5);                     // 刘海
    RA.rect(ctx, cx - 8, 6, 20, 8, C_HAIR, 5);
    RA.polygon(ctx, [[cx - 8, 13], [cx - 13, 8], [cx - 8, 17]], C_HAIR);  // 前翘发尖
    RA.ellipse(ctx, cx + 3, 15, 7, 6, C_EYE_W);                   // 眼白
    RA.circle(ctx, cx + 7, 18, 2, C_EYE_P);                       // 瞳孔
    RA.circle(ctx, cx + 8, 17, 1, C_EYE_W);                       // 高光
    RA.rect(ctx, cx + 8, 24, 3, 2, [150, 70, 50], 1);             // 嘴
    if (pose.face === 'jump') RA.circle(ctx, cx + 8, 23, 1, [150, 70, 50]);

    return cv;
  }

  function playerPoses() {
    var cx = 30;
    return {
      // 待机:两脚并拢,手臂自然下垂
      idle: { foot_l: [cx, FEET_Y], foot_r: [cx + 1, FEET_Y],
        arm_b: [cx - 13, 60], arm_f: [cx + 13, 60], face: 'normal' },
      // 跑步三帧:交替抬腿 + 手臂前后摆
      run0: { foot_l: [22, FEET_Y - 5], foot_r: [38, FEET_Y],
        arm_b: [cx - 15, 52], arm_f: [cx + 15, 66], face: 'normal' },
      run1: { foot_l: [26, FEET_Y], foot_r: [34, FEET_Y - 2],
        arm_b: [cx - 13, 64], arm_f: [cx + 13, 56], face: 'normal' },
      run2: { foot_l: [38, FEET_Y], foot_r: [22, FEET_Y - 5],
        arm_b: [cx - 15, 66], arm_f: [cx + 15, 52], face: 'normal' },
      // 空中:收腿蜷起,手臂张开
      air: { foot_l: [22, FEET_Y - 18], foot_r: [40, FEET_Y - 16],
        arm_b: [cx - 16, 50], arm_f: [cx + 16, 50], face: 'jump' }
    };
  }

  // ================= 2. 地面瓦片 =================
  function tileGrass() {                            // 草地:顶上一茬草,底下垫土
    var cv = RA.makeCanvas(TS, TS), ctx = cv.getContext('2d');
    RA.rect(ctx, 0, 0, TS, TS, [176, 138, 106]);                  // 土
    RA.rect(ctx, 0, TS - 14, TS, 14, [140, 106, 78]);             // 下方暗一点
    [[7, 14], [30, 24], [16, 33], [37, 11], [9, 40]].forEach(function (g) {
      RA.rect(ctx, g[0], g[1], 5, 4, [124, 92, 66], 2);
    });
    RA.rect(ctx, 0, 0, TS, 9, [112, 186, 92]);                    // 草皮
    RA.rect(ctx, 0, 9, TS, 5, [96, 168, 80]);                     // 草过渡
    for (var gx = 0; gx < TS; gx += 7) RA.rect(ctx, gx, 14, 7, 3, [96, 168, 80]);
    RA.rect(ctx, 2, 1, 12, 3, [150, 214, 118]);                   // 草尖高光
    RA.rect(ctx, 24, 1, 9, 2, [150, 214, 118]);
    RA.strokeRect(ctx, 0, 0, TS, TS, [36, 34, 44], 2);
    return cv;
  }

  function tileDirt() {                             // 泥土:纯土,没有草
    var cv = RA.makeCanvas(TS, TS), ctx = cv.getContext('2d');
    RA.rect(ctx, 0, 0, TS, TS, [170, 132, 102]);
    RA.rect(ctx, 0, 0, TS, 4, [140, 106, 78]);
    [[5, 9], [28, 16], [12, 30], [34, 37], [20, 22], [8, 40]].forEach(function (g) {
      RA.rect(ctx, g[0], g[1], 5, 4, [126, 94, 70], 2);
    });
    RA.strokeRect(ctx, 0, 0, TS, TS, [36, 34, 44], 2);
    return cv;
  }

  function tileBrick() {                            // 砖块:三层错缝的红砖
    var cv = RA.makeCanvas(TS, TS), ctx = cv.getContext('2d');
    RA.rect(ctx, 0, 0, TS, TS, [172, 100, 80]);
    var mortar = [120, 64, 54];
    for (var row = 0; row < 3; row++) {
      var y = row * 15;
      RA.rect(ctx, 0, y, TS, 2, mortar);                          // 横缝
      var off = (row % 2 === 0) ? 0 : 7;
      for (var k = 0; k < 3; k++) {
        RA.rect(ctx, (off + k * 15) % TS, y, 2, 15, mortar);      // 竖缝
      }
      RA.rect(ctx, 0, y + 2, TS, 2, [206, 132, 108]);             // 砖面高光
    }
    RA.strokeRect(ctx, 0, 0, TS, TS, [36, 34, 44], 2);
    return cv;
  }

  function tileCloud() {                            // 云板:只有上面一条,下面是空的(能从下往上穿)
    var cv = RA.makeCanvas(TS, TS), ctx = cv.getContext('2d');
    RA.rect(ctx, 0, 0, TS, 13, [222, 234, 250], 6);
    RA.circle(ctx, 12, 7, 6, [236, 244, 255]);
    RA.circle(ctx, 24, 6, 7, [242, 248, 255]);
    RA.circle(ctx, 35, 8, 5, [232, 242, 254]);
    RA.rect(ctx, 3, 1, TS - 6, 3, [255, 255, 255, 200], 2);
    RA.rect(ctx, 2, 9, TS - 4, 3, [176, 196, 226], 2);
    RA.strokeRect(ctx, 1, 0, TS - 2, 13, [120, 140, 176], 2, 6);
    return cv;
  }

  function tileStone() {                            // 石块:灰色石面 + 裂纹
    var cv = RA.makeCanvas(TS, TS), ctx = cv.getContext('2d');
    RA.rect(ctx, 0, 0, TS, TS, [150, 154, 164]);
    RA.rect(ctx, 0, 0, TS, 11, [170, 174, 184]);
    RA.rect(ctx, 0, TS - 11, TS, 11, [130, 134, 144]);
    var crack = [112, 116, 126];
    [[[8, 12], [14, 20]], [[14, 20], [11, 30]],
      [[30, 8], [36, 16]], [[21, 32], [33, 36]]].forEach(function (p) {
      RA.line(ctx, p[0][0], p[0][1], p[1][0], p[1][1], 2, crack);
    });
    [[24, 14], [7, 24], [30, 27], [17, 38]].forEach(function (g) {
      RA.rect(ctx, g[0], g[1], 6, 4, [166, 170, 180], 2);
      RA.rect(ctx, g[0], g[1] + 4, 6, 2, [136, 140, 150], 1);
    });
    RA.strokeRect(ctx, 0, 0, TS, TS, [36, 34, 44], 2);
    return cv;
  }

  // ================= 3. 实体贴图(弹簧板 / 出口光柱 / 浮石) =================
  /*
   * 这三张原来是 js/entities/*.js 里现画的,现在挪到 assets/entities/*.png
   * (由 tools/build_assets.mjs 生成),下面这套画法就是它们的兜底:
   * 贴图没读到(或者还没加载完)的时候,画出来和 PNG 一模一样。
   * 坐标都以贴图左上角为原点 —— 实体那边按"贴图底边 = 格子底边"贴上去。
   */
  function entitySpring() {                         // 弹簧板 S:底座 + 弹簧 + 黄板 + 箭头
    var W = TS, H = TS;
    var cv = RA.makeCanvas(W, H), ctx = cv.getContext('2d');
    var sy = H;                                     // 贴图底边 = 格子底边
    RA.rrect(ctx, 2, sy - 10, W - 4, 10, [70, 76, 104], 3, [26, 28, 40], 2);  // 底座
    RA.line(ctx, W / 2 - 8, sy - 14, W / 2 + 8, sy - 17, 3, [150, 158, 186]); // 弹簧圈
    RA.line(ctx, W / 2 - 8, sy - 20, W / 2 + 8, sy - 23, 3, [150, 158, 186]);
    RA.rrect(ctx, 1, sy - 26, W - 2, 9, [246, 196, 96], 4, [26, 28, 40], 2);  // 板面
    RA.rect(ctx, 4, sy - 25, W - 8, 3, [255, 232, 160], 2);                   // 板面高光
    RA.polygon(ctx, [[W / 2, sy - 34], [W / 2 - 6, sy - 28], [W / 2 + 6, sy - 28]],
      [255, 226, 140, 190]);                                               // 往上顶的箭头
    return cv;
  }

  function entityGoal() {                           // 出口光柱 G(存的是"中间亮度"那一帧)
    var W = C.GOAL_WIDTH, H = C.GOAL_HEIGHT;
    var cv = RA.makeCanvas(W, H), ctx = cv.getContext('2d');
    var pulse = 0.5;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,235,170,' + (0.05 + 0.14 * pulse) + ')');
    g.addColorStop(0.65, 'rgba(255,210,120,' + (0.20 + 0.16 * pulse) + ')');
    g.addColorStop(1, 'rgba(255,190,90,0.55)');
    RA.pathRoundRect(ctx, 0, 0, W, H, 10);
    ctx.fillStyle = g;
    ctx.fill();
    RA.pathRoundRect(ctx, 0, 0, W, H, 10);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,232,168,' + (0.35 + 0.4 * pulse) + ')';
    ctx.stroke();
    var cx = W / 2;
    var ay = H * 0.45 - (1 - pulse) * 6;
    RA.polygon(ctx, [[cx, ay], [cx - 11, ay + 13], [cx + 11, ay + 13]], [255, 240, 190, 200]);
    RA.polygon(ctx, [[cx, ay + 15], [cx - 11, ay + 28], [cx + 11, ay + 28]], [255, 240, 190, 120]);
    return cv;
  }

  function entityBlink() {                          // 浮石 y:一块发蓝的石头
    var W = TS, H = TS;
    var cv = RA.makeCanvas(W, H), ctx = cv.getContext('2d');
    RA.rrect(ctx, 1, 1, W - 2, H - 2, [96, 132, 156], 5, [26, 30, 44], 2);
    RA.rect(ctx, 5, 4, W - 10, 3, [226, 240, 250], 2);
    RA.line(ctx, 6, H * 0.55, W - 6, H * 0.55, 1, [206, 224, 236]);
    return cv;
  }

  // ================= 素材表:名字 → 文件 + 兜底画法 =================
  /*
   * 每个素材一条:
   *   file —— assets/ 下的贴图文件(游戏实际用的就是它,想换风格直接用画图软件改这个 PNG)
   *   draw —— 兜底:文件不存在时(或者还没加载完)现画一张,风格和生成的 PNG 一致,
   *           所以缺图不会崩,也不会变成一块品红占位图
   *
   * 加一种新地块:level.js 的 TILE_IMAGES 加一行 + 往 assets/tiles/ 放一张 PNG
   * (尺寸随意),再可选地像下面 tileXxx() 这样写个兜底画法。
   * 天空贴图 sky/1 ~ sky/8 是爬塔时循环用的,数量见 config.SKY_COUNT。
   */
  function skyFallback(i) {
    return function () {
      var cv = RA.makeCanvas(960, 540), ctx = cv.getContext('2d');
      var g = ctx.createLinearGradient(0, 0, 0, 540);
      var t = (i - 1) / Math.max(1, (C.SKY_COUNT || 8) - 1);
      g.addColorStop(0, RA.rgba(RA.mixColor(C.DEEP_TOP, C.SKY_TOP, t)));
      g.addColorStop(1, RA.rgba(RA.mixColor(C.DEEP_BOTTOM, C.SKY_BOTTOM, t)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 960, 540);
      return cv;
    };
  }

  function titleFallback() {
    return function () {
      var cv = RA.makeCanvas(960, 540), ctx = cv.getContext('2d');
      var g = ctx.createLinearGradient(0, 0, 0, 540);
      g.addColorStop(0, 'rgba(6,8,24,1)');
      g.addColorStop(0.5, 'rgba(22,22,58,1)');
      g.addColorStop(1, 'rgba(74,46,92,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 960, 540);
      RA.circle(ctx, 768, 92, 33, [250, 250, 236, 240]);
      return cv;
    };
  }

  var BUILDERS = {
    'player/idle': function () { return drawPlayer(playerPoses().idle); },
    'player/run0': function () { return drawPlayer(playerPoses().run0); },
    'player/run1': function () { return drawPlayer(playerPoses().run1); },
    'player/run2': function () { return drawPlayer(playerPoses().run2); },
    'player/air': function () { return drawPlayer(playerPoses().air); },
    'tiles/grass_top': tileGrass,
    'tiles/dirt': tileDirt,
    'tiles/brick': tileBrick,
    'tiles/stone': tileStone,
    'tiles/cloud': tileCloud,
    'entities/spring': entitySpring,
    'entities/goal': entityGoal,
    'entities/blink': entityBlink
  };

  // 文件版的素材(有 PNG 的):名字 → 相对 assets/ 的路径
  /*
   * 地块贴图**不是**代码画的:它们来自 textures/block 那套 16×16 的像素画
   * (第七轮换的,对应关系就写在这儿):
   *
   *     tiles/grass_top  ← grass_block_side.png   (草地:上面一条草,下面泥土)
   *     tiles/dirt       ← dirt.png               (泥土)
   *     tiles/brick      ← bricks.png             (砖块)
   *     tiles/stone      ← stone.png              (石块)
   *     tiles/cloud      ← snow.png               (云板:只画上面一截,见 level.js 的 TILE_PLATE)
   *
   * 贴图尺寸随便(16×16 / 32×32 / 64×64 都行),画的时候由 level.js 的 drawTile()
   * 缩放到一格。想换风格:直接替换这几个 PNG(文件名不用改)。
   * 上面 BUILDERS 里那五个 tile 画法是"文件读不到时"的兜底,不参与生成。
   */
  var FILES = {
    'tiles/grass_top': 'assets/tiles/grass_top.png',
    'tiles/dirt': 'assets/tiles/dirt.png',
    'tiles/brick': 'assets/tiles/brick.png',
    'tiles/stone': 'assets/tiles/stone.png',
    'tiles/cloud': 'assets/tiles/cloud.png',
    'entities/spring': 'assets/entities/spring.png',
    'entities/goal': 'assets/entities/goal.png',
    'entities/blink': 'assets/entities/blink.png',
    'ui/title': 'assets/ui/title.png'
  };
  (function () {
    var n = C.SKY_COUNT || 8;
    for (var i = 1; i <= n; i++) {
      FILES['sky/' + i] = 'assets/sky/sky' + i + '.png';
      BUILDERS['sky/' + i] = skyFallback(i);
    }
  })();
  BUILDERS['ui/title'] = titleFallback();

  // ================= 总管 =================
  class Assets {
    constructor() {
      this.cache = {};
      this._warned = {};
      this.loaded = 0;
      this.missing = [];
      this.fromFile = {};        // 哪些素材是真的从 PNG 读进来的
      this.ready = false;
    }

    /** 按素材名取一张图(带缓存),没有的就现画一张兜底 */
    image(name) {
      if (!(name in this.cache)) {
        var fn = BUILDERS[name];
        this.cache[name] = fn ? fn() : this._placeholder(name);
      }
      return this.cache[name];
    }

    /** 一次取一组图:{名字: 素材名} → {名字: 画布} */
    frames(mapping) {
      var out = {}, self = this;
      Object.keys(mapping).forEach(function (k) { out[k] = self.image(mapping[k]); });
      return out;
    }

    clearCache() {
      this.cache = {};
    }

    /** 有文件版的素材名 */
    names() {
      return Object.keys(FILES);
    }

    /**
     * 把所有贴图文件加载进来。加载完(或者超时/没有 Image 可用)调 done(this)。
     * 文件路径前面可以加前缀 window.RA_ASSET_ROOT(tests/ 下的自检页就设成 '../')。
     * 文件缺失不会失败:那个素材继续用"现画"的兜底,只是会在控制台提一句。
     */
    loadAll(done) {
      var self = this;
      var names = Object.keys(FILES);
      var left = names.length;
      var settled = false;
      var timer = null;
      var finish = function () {
        if (settled) return;
        settled = true;
        if (timer && globalThis.clearTimeout) globalThis.clearTimeout(timer);
        self.ready = true;
        if (done) done(self);
      };
      if (!names.length || typeof globalThis.Image !== 'function') { finish(); return; }
      if (globalThis.setTimeout) timer = globalThis.setTimeout(finish, 4000);   // 卡住也不干等

      names.forEach(function (n) {
        var img = new globalThis.Image();
        var settle = function () {
          left--;
          if (left <= 0) finish();
        };
        img.onload = function () {
          if (img.width) { self.cache[n] = img; self.loaded++; self.fromFile[n] = true; }
          settle();
        };
        img.onerror = function () {
          self.missing.push(n);
          if (globalThis.console) console.warn('[assets] 读不到 ' + FILES[n] + ',先用现画的兜底');
          settle();
        };
        img.src = (globalThis.RA_ASSET_ROOT || '') + FILES[n];
      });
    }

    /** 这个素材有没有真的从文件加载到(兜底现画的不算) */
    hasFile(name) {
      return !!this.fromFile[name];
    }

    _placeholder(name) {
      if (!this._warned[name]) {
        this._warned[name] = true;
        if (globalThis.console) console.warn('[assets] 没有这个素材:', name);
      }
      var s = RA.makeCanvas(TS, TS);
      var ctx = s.getContext('2d');
      RA.rect(ctx, 0, 0, TS, TS, [230, 60, 200, 210]);
      RA.strokeRect(ctx, 0, 0, TS, TS, [40, 40, 40], 2);
      RA.line(ctx, 0, 0, TS - 1, TS - 1, 2, [40, 40, 40]);
      RA.line(ctx, TS - 1, 0, 0, TS - 1, 2, [40, 40, 40]);
      return s;
    }
  }

  Assets.FILES = FILES;
  RA.Assets = Assets;
})(globalThis.RA = globalThis.RA || {});
