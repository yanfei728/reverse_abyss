/* -*- coding: utf-8 -*- */
/*
 * config.js —— 全局可调参数
 * ==========================
 * 手感 / 窗口 / 镜头 / 爬塔 这些"数值"全集中在 RA.C 里。
 * 单位都是"像素 / 秒",与帧率无关:60 帧和 30 帧跑起来手感一样。
 *
 * 前半段(窗口 / 物理 / 镜头)是从 abyss/game/config.py **一比一搬过来的**,
 * 数值没有改 —— 迁移的第一步就是先让手感完全一致。
 * 后半段(出口 / 弹簧 / 爬塔)是 reverse_abyss 新加的。
 */
(function (RA) {
  'use strict';

  RA.C = {
    // ===================== 窗口 =====================
    WIDTH: 960,               // 画布内部尺寸(游戏坐标)。窗口由 CSS 等比缩放
    HEIGHT: 540,
    FPS: 60,
    TITLE: 'reverse_abyss · 向上爬塔',

    // ===================== 瓦片 =====================
    TS: 45,                   // 瓦片边长(改这个要同步改 tools/check_levels.mjs 的假设)

    // ===================== 角色物理(与 abyss 完全一致) =====================
    GRAVITY: 2300.0,          // 重力(越大掉得越快、跳得越"实")
    MAX_VX: 340.0,            // 地面最大速度
    AIR_MAX_VX: 300.0,        // 空中最大速度
    GROUND_ACCEL: 3000.0,     // 地面加速度
    AIR_ACCEL: 2300.0,        // 空中加速度
    FRICTION: 13.0,           // 地面摩擦
    JUMP_VEL: -830.0,         // 起跳初速度(负 = 向上)
    COYOTE_TIME: 0.10,        // 土狼时间:走出边缘后还能跳的宽限
    JUMP_BUFFER: 0.12,        // 跳跃缓冲:落地前一点按跳也算数
    JUMP_CUT: 0.50,           // 松手时把上升速度乘这个数 → 按得短跳得低

    // ---- 二段跳 ----
    JUMP_COUNT: 2,            // 一次滞空最多跳几次(1 = 关掉二段跳)
    DOUBLE_JUMP_SPIN: 360.0,  // 二段跳转多少度(360 = 整一圈)
    DOUBLE_JUMP_SPIN_TIME: 0.45,

    // ---- 落脚容错(跳得只差一点点就自动送上墙)----
    LEDGE_ASSIST: 22.0,       // 脚底离墙顶多近以内算"只差一点点"(px,约半格)
    LEDGE_ASSIST_MARGIN: 10.0,// 补的时候多送出这么高(px)
    LEDGE_ASSIST_PROBE: 2.0,  // 往身前探多远去找那堵墙(px)

    // ===================== 出口(上一层)/ 坠落 =====================
    GOAL_WIDTH: 34,           // 出口判定盒宽度(px,比一格窄一点,免得擦着就算过)
    GOAL_HEIGHT: 96,          // 出口判定盒高度:从落脚地面往上这么高都算"够得着"
    FALL_MARGIN: 60,          // 掉到本层世界底部以下这么多像素 → 重生回本层起点

    // ===================== 镜头 =====================
    /*
     * 32:正式游玩与独立试玩共用同一个镜头缩放。zoom = 2/3 时,
     * 同样 CSS 视口看到的世界宽/高各变成 1.5 倍(面积 2.25 倍);
     * 地图尺寸、碰撞、角色移速/跳跃、技能半径、索敌距离仍是原世界单位,
     * HUD/按钮/编辑器的 zoom 不受影响。屏幕坐标 = (世界 - 相机) * zoom。
     */
    VIEW: {
      // 36:两档视野。宽=当前 zoom=2/3(默认),标准=旧 zoom=1;
      // 只影响世界渲染/相机可见范围,不改 CSS/canvas/DPR/HUD/物理/索敌。
      zoom: 2 / 3,
      wideZoom: 2 / 3,
      classicZoom: 1,
      defaultMode: 'wide'
    },
    // 垂直镜头带"死区":角色在这个范围内活动时镜头不动,原地起跳画面就不会上下抖。
    CAM_MARGIN_TOP: 90,       // 角色离屏幕上边多近 → 镜头开始强制跟(px)
    CAM_MARGIN_BOTTOM: 110,
    CAM_FOLLOW_LERP: 12.0,    // 落地后镜头归位的平滑速度
    CAM_FAST_LERP: 25.0,      // 强制跟随时的平滑速度

    // ===================== 弹簧板(实体 S) =====================
    SPRING_VEL: -1180.0,      // 踩上去弹起来的初速度(比一段跳高不少)
    SPRING_COOLDOWN: 0.12,    // 连弹的冷却,免得贴着板子每帧都触发

    // ===================== 会变的机关(x = 触之即散 / y = 浮石) =====================
    GHOST_FADE: 0.12,         // x:碰到之后多久散完(秒)—— 散完这一局就不再出现
    BLINK_GONE: 1.6,          // y:踩到之后消失多久(秒);格子里有人就再等一个周期

    // ===================== 爬塔 =====================
    TOWER_FLOORS: 8,          // 默认塔高(几层)
    TOWER_FLOORS_MIN: 3,
    TOWER_FLOORS_MAX: 24,
    TOWER_NO_REPEAT_GAP: 2,   // 相邻这么多层之内不重复同一个模板(关卡池够大时)
    MIRROR_DEFAULT: true,     // 重构时是否允许把模板左右镜像 → 同一张图两种走法
    FLOOR_METERS: 3,          // 一层算多少米(纯显示,给"已爬高度"用)
    // ===================== 关卡编辑器(editor.html) =====================
    EDITOR_MAX_COLS: 600,     // 宽度上限(格):比这更宽的就不是竖井了
    EDITOR_MAX_ROWS: 0,       // 高度上限:0 = **不限**(向上爬的塔,想画多高画多高)
    CLIMB_TIME: 0.85,         // 关卡切换(渐入渐出)动画时长(秒)
    CLIMB_FADE_SPLIT: 0.5,    // 切到一半的进度:之前是"旧层渐出",之后是"新层渐入"
    CLIMB_DIM: 0.92,          // 切换中间那层暗场最浓时的透明度(0 = 不压暗)

    // ===================== 关卡数据 schemaVersion=2 =====================
    /*
     * 导入字节数 / 尺寸 / 数量上限。T01 的保守初始值:保证浏览器和 Node 都能
     * 当场解析,不会因为一张畸形文件把内存吃光。可变尺寸 ≠ 无限分配内存;
     * 安卓真机导入(T10)要按实测调整,不能偷偷把地图改成固定大小。
     * 依据:2MB 文本 ≈ 单次 FileReader/JSON.parse 的安全量;600 列与编辑器宽度
     * 上限一致;250000 格 ≈ 600×416,超过这个量级的小样需要先在真机测内存。
     */
    DATA_LIMITS: {
      MAX_IMPORT_BYTES: 2 * 1024 * 1024,   // 一份关卡 JSON 文件的字节上限
      MAX_COLS: 600,                        // 单层宽度上限(与编辑器一致)
      MAX_ROWS: 4096,                       // 单层高度上限(旧编辑器高度不限,新契约要上限)
      MAX_TILES: 250000,                    // 单层地块总数上限
      MAX_OBJECTS: 400,                     // 一层的参数对象上限
      MAX_PATHS: 200,                       // 一层的路径上限
      MAX_PATH_POINTS: 128,                 // 一条路径的点数上限
      MAX_DECORATIONS: 200,                 // 一层的装饰上限
      MAX_ID_LEN: 64,                       // 关卡 id / 对象 id / 路径 id 的字符上限
      MAX_TITLE_LEN: 120,                   // 显示名上限
      MAX_STRING_LEN: 256,                  // 单个字符串字段(类型名、资源 id)上限
      MAX_EXTENSIONS_BYTES: 32 * 1024        // extensions 序列化后的字节上限
    },

    // 楼层接口 v1(提案值,见 docs/design/world-and-gameplay.md):
    // 开口 4 格、上下各 3 格安全带、开口与左右外墙至少隔 1 格。
    // T01 只校验结构;真正的接缝几何、梯板生成与编辑器可视化在 T04 冻结。
    PORT: {
      PROFILE: 'vertical-v1',
      CLOUD_PROFILE: 'cloud-pipe-v2',
      OPENING_COLS: 4,
      SAFE_ROWS: 3,
      SIDE_MARGIN_COLS: 1,
      CLOUD_BOARD_WIDTH: 2,
      CLOUD_BOARD_HEIGHT: 1,
      CLOUD_INNER_HEIGHT: 3,
      CLOUD_WALL: 1,
      CLOUD_GAP: 4,
      CLOUD_CLEARANCE: 2
    },

    /*
     * 首版参数对象的数值(默认值 / 允许范围)。中文名、单位、类型说明在
     * js/entity-registry.js —— 编辑器、校验器和运行时共用同一份描述,
     * 不允许三处各写一套默认值。这些是首版提案值,不是用户确认的平衡数值;
     * 正式认证会绑定实际采用的数值指纹(rulesFingerprint,见 T06)。
     * spring 的 -1180 与 SPRING_VEL 保持一致(显式覆盖时才写进 params)。
     */
    OBJECT_PARAMS: {
      spring: {
        bounceVel: { def: -1180, min: -4000, max: 0 }
      },
      crumble_door: {
        fadeSeconds: { def: 0.12, min: 0, max: 2 }          // 与 GHOST_FADE 一致
      },
      blink_platform: {
        warningSeconds: { def: 0.5, min: 0, max: 5 },
        goneSeconds: { def: 1.6, min: 0.1, max: 10 }        // 与 BLINK_GONE 一致
      },
      fireball_static: {
        radiusTiles: { def: 0.5, min: 0.1, max: 4 },
        damage: { def: 20, min: 0, max: 100 }
      },
      spike: {
        warningSeconds: { def: 0.5, min: 0, max: 5 },
        activeSeconds: { def: 0.8, min: 0.1, max: 5 },
        cooldownSeconds: { def: 1.0, min: 0, max: 10 },
        damage: { def: 20, min: 0, max: 100 }
      },
      gear: {
        // 兼容字段:旧作者数据里可能仍有 speedTilesPerSecond;运行时实际速度固定为 C.MAX_VX,
        // 该字段只读/原样保存,不再覆盖速度。新对象默认写成 V/TS,与实际一致。
        speedTilesPerSecond: { def: 340 / 45, min: 0.1, max: 20 },
        radiusTiles: { def: 0.5, min: 0.1, max: 4 },
        damage: { def: 20, min: 0, max: 100 }
      },
      fireball_moving: {
        radiusTiles: { def: 0.5, min: 0.1, max: 4 },
        damage: { def: 20, min: 0, max: 100 }
      },
      flail: {
        // radiusTiles 是锤头本体判定半径,不是 4 格轨道半径;轨道由固定规则派生。
        radiusTiles: { def: 0.5, min: 0.1, max: 4 },
        damage: { def: 20, min: 0, max: 100 }
      },
      soul: {
        radiusTiles: { def: 0.5, min: 0.1, max: 4 },
        damage: { def: 20, min: 0, max: 100 },
        // 必填但由方向箭头显式写入;def 只用于注册表结构,defaults() 因 optional 不补
        initialDirection: { def: 0, min: 0, max: 3 }
      },
      sewage_pool: {},
      // 30:金币是拾取物、弓箭手是固定敌人;都直接放置,无参数面板,params 保持 {}
      coin: {},
      archer: {},
      // 32:幽灵与喷火火球同样直接放置、无参数,数值固定在 C.GHOST / C.SPITTER
      ghost_dash: {},
      fireball_spitter: {}
    },

    /*
     * 30: 金币 / 弓箭手 / 正式塔计分。数值只在这里声明一次,
     * 编辑器、运行时、校验器共用;不引入货币钱包/商店/排行榜。
     */
    COLLECT: {
      coinRadiusTiles: 0.25          // 金币判定半径(0.5 格直径);只被玩家身体拾取
    },
    /*
     * 32/33: 三类主动索敌怪(弓箭手 / 幽灵 / 喷火火球)共用的中心直线索敌距离。
     * 世界单位(格),与镜头缩放无关;超距只限制"发起新攻击",不清已发出的弹。
     * 33号卡按用户要求由 10 格放宽到 20 格(900px)。
     */
    SEEK: {
      rangeTiles: 20
    },
    ARCHER: {
      fireIntervalSeconds: 4,        // 32:入层后完整 4 秒射第一箭,之后每 4 秒(全关卡统一)
      arrowSpeedPx: 170,             // 固定 V/2,不取玩家当前速度
      arrowDamage: 20,               // 箭命中伤害(沿用受伤无敌时间)
      contactDamage: 20,             // 本体接触伤害
      arrowHitRadiusPx: 3,           // 箭命中框半宽(细长占位图,与实际朝向一致)
      arrowLengthPx: 18,             // 箭可见长度
      arrowMaxAgeSeconds: 30         // 安全上限:正常情况下先被本层边界裁掉
    },
    /*
     * 32/33: 幽灵(ghost_dash)。漂浮、无重力;每 2 秒锁定玩家当刻方向直冲 3 格,
     * 沿用 0.2 秒完成(135px / 0.2s = 675px/s),穿墙;接触伤害 20,真的扣血后才自消失。
     * 33号卡按用户要求:周期 3→2 秒、冲刺 2→3 格。
     */
    GHOST: {
      dashIntervalSeconds: 2,
      dashTiles: 3,
      dashSeconds: 0.2,
      radiusTiles: 0.5,              // 本体判定/显示半径(沿用普通火球尺寸)
      contactDamage: 20
    },
    /*
     * 32: 喷火火球(fireball_spitter)。静止;左右始终朝玩家;每 4 秒水平弹;
     * 弹 170px/s、20 伤害、不穿实体墙、不跨楼层、不可被光环清。
     */
    SPITTER: {
      fireIntervalSeconds: 4,
      contactDamage: 20,
      radiusTiles: 0.5,              // 本体判定/显示半径
      boltSpeedPx: 170,              // = V/2
      boltDamage: 20,
      boltRadiusPx: 9,               // 火焰弹半径 0.2 格:显示与判定一致
      boltMaxAgeSeconds: 30          // 安全上限:正常情况下先被本层域/墙裁掉
    },
    SCORE: {
      // 只有正式完整塔启用;试玩不创建/显示/保存分数
      formalMode: 'full40-formal',
      formalModes: ['full40-formal', 'easy20-formal'],
      floorEnter: 20,                // 首次进入真实层号 1…40(共 800)
      enemyDefeat: 5,                // 敌对单位真的被击败(含 Boss 最终一次)
      coin: 10                       // 拾取金币
    },

    // 怪物运动/几何固定值(由正常地面移速 V=C.MAX_VX 派生,集中在此)
    MONSTER: {
      gearSpeedPx: 340,                 // = C.MAX_VX
      movingFireballSpeedPx: 170,       // = C.MAX_VX / 2
      flailOrbitTiles: 4,               // 端点→锤头中心 180px
      flailHeadSpeedPx: 226.6666666667, // = C.MAX_VX * 2 / 3
      sewageDamage: 20,                 // 单格池固定接触伤害
      spikeBaseHeight: 12,              // 地刺底座显示高度
      spikeHeight: 16                   // 伸出尖刺高度;只这段伤害
    },

    // 34:纯视觉旋转速度(转/秒),不影响碰撞/攻击/技能时间或路径运动。
    //   gearSpinRps:齿轮绕自身中心默认顺时针自转(独立于轨道移动,单点也转);
    //   haloSpinRps:用户指定的光环转速(施法期间每秒一圈)。
    // 35:关卡小背景固定只压暗图片可见像素,alpha 不变(离屏合成,不在主画布盖黑框)。
    // 36:压暗 55%→25%(可见 RGB ≈ 原图 75%);箭/火焰弹只放大显示,判定半径不变。
    VISUAL: {
      gearSpinRps: 1,
      haloSpinRps: 1,
      levelBackgroundDarkenAlpha: 0.15,
      // 40:管道内底独立压暗(只作用 liveStoneLinks 的管底图;石砖/云板/玩家不压)
      pipeBackgroundDarkenAlpha: 0.15,
      arrowRenderSizePx: 27,
      flameBoltRenderSizePx: 27,
      // 38:三层大背景(只第一组有图);横向视差幅度/响应距离与塔楼初始布局
      largeBackground: {
        frontPanPct: 0.04, midPanPct: 0.03, backPanPct: 0.02,
        responseTiles: 12,
        towerMaxH: 0.80, towerMaxW: 0.28,
        towerCenterX: 0.22, edgeMarginPx: 2
      }
    },

    // ===================== 界面配色 =====================
    INK: [232, 240, 252],
    INK_DIM: [168, 182, 206],
    PANEL_BG: [24, 30, 52],
    PANEL_EDGE: [104, 126, 178],
    BTN_COL: [70, 88, 130],
    BTN_HOVER: [110, 140, 200],
    BTN_ON: [88, 168, 132],
    ACCENT: [255, 205, 110],
    CHIP_BG: [18, 22, 38],

    // 背景兜底渐变(历史天空图已退役,保留给旧格式/历史页面兜底)
    SKY_TOP: [86, 156, 220],
    SKY_BOTTOM: [214, 238, 250],
    DEEP_TOP: [10, 12, 26],
    DEEP_BOTTOM: [46, 34, 66],

    // ===================== 贴图 =====================
    // 贴图都是 assets/ 下独立的 PNG(可以直接换;地块由 tools/build_assets.mjs 生成):
    //   assets/tiles/       关卡基础地块(一格一种,尺寸随意 —— 现在用的是 16×16 像素画,
    //                       画的时候缩放到一格 TS×TS,见 level.js 的 drawTile)
    //   assets/authored/    作者贴图(33/34:对象/轨道/技能/23 款地块,见 js/assets.js)
    //   assets/background/level/  关卡小背景(35:静态清单 assets/background/catalog.js)
    //   assets/background/large/  大背景占位(下一轮)
    // 35起 assets/sky 与 entities/ui 旧图已删除;旧 sky1..8 只是历史值,按"无小背景"显示。
    SKY_COUNT: 8,             // 历史遗留:旧 JSON/历史页面里的 sky1..8 元数据仍按这个范围解释

    // ===================== 音频 =====================
    MIX_GAIN: 0.5             // 总音量(0~1)
  };
})(globalThis.RA = globalThis.RA || {});
