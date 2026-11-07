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
        speedTilesPerSecond: { def: 2, min: 0.1, max: 20 },
        radiusTiles: { def: 0.5, min: 0.1, max: 4 },
        damage: { def: 20, min: 0, max: 100 }
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

    // 背景兜底渐变(天空贴图读不到时才用):越往上越亮
    SKY_TOP: [86, 156, 220],
    SKY_BOTTOM: [214, 238, 250],
    DEEP_TOP: [10, 12, 26],
    DEEP_BOTTOM: [46, 34, 66],

    // ===================== 贴图 =====================
    // 贴图都是 assets/ 下独立的 PNG(可以直接换;实体 / 天空 / 界面由 tools/build_assets.mjs 生成):
    //   assets/tiles/  关卡地块(一格一种,尺寸随意 —— 现在用的是 16×16 像素画,
    //                  画的时候缩放到一格 TS×TS,见 level.js 的 drawTile)
    //   assets/sky/    天空背景 sky1~sky8 —— 爬塔时**按层循环**;
    //                  关卡也能用 json 里的 sky 固定用某一张(见 level.js)
    //   assets/ui/     界面贴图(开局界面背景 title.png)
    SKY_COUNT: 8,             // assets/sky/ 里有几张天空贴图

    // ===================== 音频 =====================
    MIX_GAIN: 0.5             // 总音量(0~1)
  };
})(globalThis.RA = globalThis.RA || {});
