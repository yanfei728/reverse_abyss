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

  // ================= 3. 实体贴图(已退役) =================
  /*
   * 35号卡:旧的一格实体贴图(弹簧板/出口/浮石)已由作者图(authored/objects/*)
   * 取代,旧 assets/entities/*.png 与 sky/ui 标题图一并删除;这里不再保留它们的生成/兜底。
   * 弹簧/地刺/门/浮石等绘制在 world.js 里缺图时会退回矢量占位,不依赖旧 PNG。
   */

  // ================= 素材表:名字 → 文件 + 兜底画法 =================
  /*
   * 每个素材一条:
   *   file —— assets/ 下的贴图文件(游戏实际用的就是它,想换风格直接用画图软件改这个 PNG)
   *   draw —— 兜底:文件不存在时(或者还没加载完)现画一张,风格和生成的 PNG 一致,
   *           所以缺图不会崩,也不会变成一块品红占位图
   *
   * 加一种新地块:level.js 的 TILE_IMAGES 加一行 + 往 assets/tiles/ 放一张 PNG
   * (尺寸随意),再可选地像下面 tileXxx() 这样写个兜底画法。
   * 35号卡起不再有天空贴图:旧 sky1..8 值只作为历史元数据保留(按"无小背景"显示)。
   */

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
    'tiles/cloud': tileCloud
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
    // 37:休息小屋固定地物(只读作者图,显式资源键;不进作者 44 张盘点)
    // 40:玩家图集(1536×1024,运行时按固定 sourceRect 分帧)
    'player/atlas': 'assets/player/block-adventurer-v1/spritesheet.png',
    'fixed/rest-house/milk': 'assets/fixed/rest-house/milk.png',
    'fixed/rest-house/berries': 'assets/fixed/rest-house/berries.png',
    'fixed/rest-house/carrot': 'assets/fixed/rest-house/carrot.png',
    // 39:管道内底作者图(64×48,只给 liveStoneLinks 用)
    'background/pipe-bricks': 'assets/background/pipe/pipe-bricks.png'
  };

  // 35:关卡小背景(静态清单 assets/background/catalog.js;键=仓库相对路径)
  (function () {
    var cat = RA.LevelBackgroundCatalog;
    if (!cat || !Array.isArray(cat.entries)) return;
    cat.entries.forEach(function (e) {
      if (e && typeof e.file === 'string') FILES[e.file] = e.file;
    });
  })();

  // 38:三层大背景(独立清单;只登记真实存在的组图,不混入小背景列表)
  (function () {
    var cat = RA.LargeBackgroundCatalog;
    if (!cat || !Array.isArray(cat.groups)) return;
    cat.groups.forEach(function (g) {
      if (!g || !Array.isArray(g.layers)) return;
      g.layers.forEach(function (l) {
        if (l && typeof l.file === 'string') FILES[l.file] = l.file;
      });
    });
  })();

  // 35:小背景的薄查询接口(纯数据,不读目录、不碰 DOM)
  RA.LevelBackgrounds = {
    list: function () {
      var cat = RA.LevelBackgroundCatalog;
      return cat && Array.isArray(cat.entries) ? cat.entries.map(function (e) { return Object.assign({}, e); }) : [];
    },
    get: function (id) {
      var cat = RA.LevelBackgroundCatalog;
      if (!cat || !Array.isArray(cat.entries)) return null;
      for (var i = 0; i < cat.entries.length; i++) if (cat.entries[i].id === id) return Object.assign({}, cat.entries[i]);
      return null;
    },
    has: function (id) { return !!this.get(id); }
  };

  // ================= 4. 作者贴图(33号卡) =================
  /*
   * 来源:C:/Users/beilu/Documents/blcreate/reverse_abyss贴图(只读)。
   * 仓库副本在 assets/authored/**,逐字节等于源文件,不改尺寸/不重采样;
   * 运行期只引用仓库内相对路径。每张的来源/尺寸/透明方式/SHA/可见最远像素半径
   * 由 tools/art_import.mjs 盘点,写入 docs/checks/33-art-map.json。
   *
   * 绘制约定:
   *   · 像素图一律最近邻放大(imageSmoothingEnabled=false),不模糊;
   *   · 尺寸由游戏现有世界尺寸决定(TS45、本体框、金币22.5、弹18……),图片只做缩放;
   *   · 锚点=图片中心,对应对象/格子的中心;不因为图片改变碰撞、判定或轨道;
   *   · 缺图时对象绘制走原来的矢量兜底;地块外观缺图时退回旧石块图。
   */
  var AUTHORED = {
    'authored/objects/cloud': {
      label: '云板(薄板整图)', source: '怪物和地物/云板.png', sourceSize: [16, 3], fit: 'plate'
    },
    'authored/objects/door': {
      label: '门方块', source: '怪物和地物/门.png', sourceSize: [16, 16], fit: 'tile'
    },
    'authored/objects/blink_idle': {
      label: '浮石(正常)', source: '怪物和地物/浮石.png', sourceSize: [16, 16], fit: 'tile'
    },
    'authored/objects/blink_warning': {
      label: '浮石(被踩/快消失)', source: '怪物和地物/被踩了快消失的浮石.png', sourceSize: [16, 16], fit: 'tile'
    },
    'authored/objects/gear': {
      label: '路径齿轮', source: '怪物和地物/齿轮.png', sourceSize: [16, 16], fit: 'box'
    },
    // 34:弹簧板(整格底边锚点)与地刺两状态。bbox 是实测的可见外接框,供按包络裁绘:
    //   地刺未探出=底座一条(16×5),探出=底座+尖刺(16×15);绘制时对齐 spikeGeom,不改判定。
    'authored/objects/spring': {
      label: '弹簧板', source: '怪物和地物/弹簧板.png', sourceSize: [16, 16], fit: 'spring',
      bbox: { x: 0, y: 9, w: 16, h: 7 }
    },
    'authored/objects/spike_idle': {
      label: '地刺(尖刺未探出)', source: '怪物和地物/地刺_尖刺未探出.png', sourceSize: [16, 16],
      fit: 'spike', bbox: { x: 0, y: 11, w: 16, h: 5 }
    },
    'authored/objects/spike_active': {
      label: '地刺(尖刺探出)', source: '怪物和地物/地刺_尖刺探出.png', sourceSize: [16, 16],
      fit: 'spike', bbox: { x: 0, y: 1, w: 16, h: 15 }
    },
    'authored/objects/fireball': {
      label: '火球(静止/移动/喷火共用身体)', source: '怪物和地物/火球.png', sourceSize: [16, 16], fit: 'box'
    },
    'authored/objects/soul': {
      label: '灵魂', source: '怪物和地物/灵魂.png', sourceSize: [8, 8], fit: 'box'
    },
    'authored/objects/ghost': {
      label: '幽灵', source: '怪物和地物/幽灵.png', sourceSize: [8, 8], fit: 'box'
    },
    'authored/objects/archer': {
      label: '弓箭手', source: '怪物和地物/弓箭手.png', sourceSize: [8, 8], fit: 'box'
    },
    'authored/objects/sewage': {
      label: '污水池', source: '怪物和地物/污水.png', sourceSize: [21, 21], fit: 'tile'
    },
    'authored/objects/coin': {
      label: '金币', source: '怪物和地物/金币.png', sourceSize: [16, 16], fit: 'px', px: 22.5
    },
    'authored/objects/flail_head': {
      label: '流星锤锤头', source: '怪物和地物/流星锤锤头.png', sourceSize: [16, 16], fit: 'box'
    },
    'authored/objects/flail_chain': {
      label: '流星锤锁链', source: '怪物和地物/流星锤锁链.png', sourceSize: [16, 16], fit: 'chain'
    },
    'authored/objects/arrow': {
      label: '箭', source: '其它/arrow.png', sourceSize: [16, 16], fit: 'px', px: 18,
      // 源图朝右上(45°):绘制时按 atan2(vy,vx)+45° 旋转对齐速度向量
      sourceAngle: -Math.PI / 4
    },
    'authored/objects/flame_bolt': {
      label: '火焰弹', source: '其它/火焰弹.png', sourceSize: [16, 16], fit: 'px', px: 18
    },
    'authored/objects/halo': {
      label: '玩家周围的光环', source: '其它/玩家周围的光环.png', sourceSize: [50, 50], fit: 'halo',
      // tools/art_import.mjs 实测:可见像素到图心最远 34.65 源像素(50×50 图)
      outerRadiusPx: 34.65
    },
    'authored/objects/track_straight': {
      label: '齿轮路径直线', source: '其它/齿轮路径_直线.png', sourceSize: [16, 16], fit: 'track'
    },
    'authored/objects/track_corner': {
      label: '齿轮路径折线', source: '其它/齿轮路径_折线.png', sourceSize: [16, 16], fit: 'track'
    }
  };
  Object.keys(AUTHORED).forEach(function (k) {
    FILES[k] = AUTHORED[k].path || ('assets/authored/' + k.replace(/^authored\//, '') + '.png');
  });
  // 有"旧画法"可退的:云板退回程序画的薄云板;地块外观缺图时退回旧石块
  BUILDERS['authored/objects/cloud'] = tileCloud;

  /*
   * 新增"地块"分类:23 款普通实心方块(全部只有普通碰撞,没有任何交互)。
   * skinId 是稳定身份,进 visuals.tileSkins;asset 只是显示用的仓库资源键。
   * 前 15 款是 33 批,后 8 款是 34 批新增;旧 skinId/中文名一律不改。
   */
  var TILE_SKINS = [
    { id: 'brick', name: '砖块' },
    { id: 'deepslate', name: '深板岩' },
    { id: 'deepslate_bricks', name: '深板岩砖' },
    { id: 'dirt', name: '泥土' },
    { id: 'grass_top', name: '草顶方块' },
    { id: 'iron_block', name: '铁块' },
    { id: 'leaves', name: '树叶纹方块' },
    { id: 'log', name: '原木' },
    { id: 'planks', name: '木板' },
    { id: 'purpur_block', name: '紫珀块' },
    { id: 'purpur_pillar', name: '紫珀柱' },
    { id: 'sandstone', name: '砂岩' },
    { id: 'stone', name: '石头' },
    { id: 'stone_bricks', name: '石砖' },
    { id: 'trapdoor', name: '活板纹方块' },
    // 34 新增 8 款(全部普通实心;金色方块不是金币、没有奖励;石英柱不是旋转机关)
    { id: 'chiseled_stone_bricks', name: '雕纹石砖' },
    { id: 'diamond_block', name: '钻石纹方块' },
    { id: 'gold_block', name: '金色方块' },
    { id: 'mossy_stone_bricks', name: '苔纹石砖' },
    { id: 'quartz_block', name: '石英纹方块' },
    { id: 'quartz_bricks', name: '石英砖纹方块' },
    { id: 'quartz_pillar', name: '石英柱纹方块' },
    { id: 'red_sandstone', name: '红砂岩纹方块' }
  ].map(function (s) {
    var asset = 'authored/tiles/' + s.id;
    FILES[asset] = 'assets/authored/tiles/' + s.id + '.png';
    BUILDERS[asset] = tileStone;              // 缺图兜底:旧石块
    return { id: s.id, name: s.name, asset: asset };
  });

  var SKIN_BY_ID = Object.create(null);
  TILE_SKINS.forEach(function (s) { SKIN_BY_ID[s.id] = s; });

  RA.TileSkins = {
    list: function () { return TILE_SKINS.map(function (s) { return { id: s.id, name: s.name, asset: s.asset }; }); },
    get: function (id) {
      var s = SKIN_BY_ID[String(id)];
      return s ? { id: s.id, name: s.name, asset: s.asset } : null;
    },
    has: function (id) { return !!SKIN_BY_ID[String(id)]; },
    ids: function () { return TILE_SKINS.map(function (s) { return s.id; }); }
  };

  RA.ArtCatalog = {
    /** 资源键 → 元数据(来源/源尺寸/适配方式) */
    get: function (key) {
      var a = AUTHORED[String(key)];
      if (!a) return null;
      var out = JSON.parse(JSON.stringify(a));
      out.key = String(key);
      out.file = FILES[key];
      return out;
    },
    keys: function () { return Object.keys(AUTHORED); },
    file: function (key) { return FILES[key] || null; },
    /**
     * 取已加载的作者图;没加载到返回 null(调用方走原矢量兜底,不画品红占位)。
     * 测试可以直接放 assets.cache[key] 模拟已加载。
     */
    image: function (assets, key) {
      if (!assets || typeof assets.image !== 'function') return null;
      if (assets.hasFile && assets.hasFile(key)) return assets.image(key);
      if (assets.cache && assets.cache[key] && assets.cache[key].width) return assets.cache[key];
      return null;
    },
    haloOuterRadiusPx: 34.65,
    /** 源朝向:箭朝右上 45° */
    arrowSourceAngle: -Math.PI / 4
  };

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
      // 40:玩家五帧优先从作者图集静态分帧;图集未加载/失败时用 45×54 兜底
      if (RA.PlayerArt && RA.PlayerArt.keys && RA.PlayerArt.keys[name]) {
        var art = RA.PlayerArt.frame(name, this);
        if (art) { this.cache[name] = art; return art; }
        var legacyKey = ':legacy:' + name;
        if (!(legacyKey in this.cache)) {
          var oldFn = BUILDERS[name];
          this.cache[legacyKey] = RA.PlayerArt.normalizeLegacy(oldFn ? oldFn() : this._placeholder(name));
        }
        return this.cache[legacyKey];
      }
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
