/* -*- coding: utf-8 -*- */
/*
 * entity-registry.js —— 首版参数对象的注册表(只描述,不含运行时行为)
 * ================================================================
 * docs/design/data-and-interfaces.md 要求:对象参数有类型、范围、单位、默认值
 * 和中文显示名,编辑器只暴露注册过的参数,校验器与运行时用同一份默认值。
 * 这张表就是那份描述。数值(默认值/上下限)统一放在 config.js 的 C.OBJECT_PARAMS,
 * 这里只写"这些数值是什么意思"。
 *
 * 重要边界:注册了参数不等于行为已经实现。首版六个对象里,
 *   · spring          —— 旧引擎已有相同行为(js/entities/spring.js);
 *   · crumble_door    —— 对应旧的 'x'(ghost.js,触之即散);
 *   · blink_platform  —— 对应旧的 'y'(blink.js,踩到消失),预警延迟待 T05;
 *   · fireball_static / spike / gear —— 只有数据与描述,行为在 T05 才实现。
 * 没有实现的类型不能被当作"已完成敌人";T01 只保证它们能被无损保存、校验和迁移。
 *
 * 想加一个新对象:在这里加一条描述(数值写进 config.js),再在 T05/T06 补行为与编辑 UI。
 * 未注册的 type 不会被静默忽略 —— 草稿保留并警告,试玩/发布直接报错。
 */
(function (RA) {
  'use strict';

  var C = RA.C || {};
  var NUMS = C.OBJECT_PARAMS || {};

  /** 参数描述:name 是数据里的键;label/unit 给编辑器和报错信息用 */
  var DEFS = [
    {
      type: 'spring',
      name: '弹簧板',
      letter: 'S',
      scene: 'normal',                 // 允许出现在普通层模板里
      implemented: 'legacy',           // legacy = 旧引擎已有同样行为
      interact: '踩上去弹起;保留现有弹簧手感',
      params: [
        { name: 'bounceVel', label: '弹力', type: 'number', unit: 'px/s', optional: true }
      ]
    },
    {
      type: 'crumble_door',
      name: '门方块(触之即散)',
      letter: 'x',
      scene: 'normal',
      implemented: 'legacy',
      interact: '接触后淡出消失,本局不恢复',
      params: [
        { name: 'fadeSeconds', label: '淡出时间', type: 'number', unit: 's' }
      ]
    },
    {
      type: 'blink_platform',
      name: '浮石(踩踏预警后消失)',
      letter: 'y',
      scene: 'normal',
      implemented: 'partial',          // 旧 'y' 是踩到立刻消失,预警/安全恢复在 T05
      interact: '踩踏预警后失去碰撞,安全恢复;不能把玩家夹住',
      params: [
        { name: 'warningSeconds', label: '踩踏预警', type: 'number', unit: 's' },
        { name: 'goneSeconds', label: '消失时长', type: 'number', unit: 's' }
      ]
    },
    {
      type: 'fireball_static',
      name: '静止火球',
      letter: null,                    // 只能用 objects 摆放,不占地图字符
      scene: 'normal',
      implemented: 'legacy',
      interact: '不阻挡;接触伤害;可被光环一击消灭',
      params: [
        { name: 'radiusTiles', label: '判定半径', type: 'number', unit: '格' },
        { name: 'damage', label: '伤害', type: 'number', unit: '生命' }
      ]
    },
    {
      type: 'fireball_moving',
      name: '移动火球',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      requiresPath: true,
      interact: '沿路径固定 V/2 移动,不阻挡;接触伤害;可被光环消灭',
      params: [
        { name: 'radiusTiles', label: '判定半径', type: 'number', unit: '格' },
        { name: 'damage', label: '伤害', type: 'number', unit: '生命' }
      ]
    },
    {
      type: 'spike',
      name: '地刺',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      interact: '底座不阻挡,只有伸出尖刺的区域造成伤害;不能被击败',
      params: [
        { name: 'warningSeconds', label: '伸出预警', type: 'number', unit: 's' },
        { name: 'activeSeconds', label: '伸出时长', type: 'number', unit: 's' },
        { name: 'cooldownSeconds', label: '回收冷却', type: 'number', unit: 's' },
        { name: 'damage', label: '伤害', type: 'number', unit: '生命' }
      ]
    },
    {
      type: 'flail',
      name: '流星锤',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      requiresPath: false,
      interact: '端点固定,半径4格顺时针旋转;只有锤头伤害,不可消灭',
      params: [
        { name: 'radiusTiles', label: '锤头半径', type: 'number', unit: '格' },
        { name: 'damage', label: '伤害', type: 'number', unit: '生命' }
      ]
    },
    {
      type: 'soul',
      name: '灵魂',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      requiresPath: false,
      interact: '沿真实方块外轮廓170px/s贴边;失去依附直飞再贴边;可被光环消灭',
      params: [
        { name: 'radiusTiles', label: '判定半径', type: 'number', unit: '格' },
        { name: 'damage', label: '伤害', type: 'number', unit: '生命' },
        { name: 'initialDirection', label: '初始方向(0上1右2下3左)', type: 'integer', unit: '',
          min: 0, max: 3, optional: true, values: [0, 1, 2, 3] }
      ]
    },
    {
      type: 'sewage_pool',
      name: '污水池',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      category: 'hazard',              // 伤害物:不可击败,不算敌对单位
      requiresPath: false,
      interact: '单格;接触伤害20、不可消灭、无实体阻挡',
      params: []
    },
    {
      type: 'coin',
      name: '金币',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      category: 'collectible',         // 30:拾取物,不是怪物/敌对单位
      requiresPath: false,
      interact: '无实体阻挡;玩家身体接触一次即消失;光环不代捡;试玩只捡不计分',
      params: []
    },
    {
      type: 'archer',
      name: '弓箭手',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      category: 'hostile',             // 30:固定敌人,可被光环一击消灭
      requiresPath: false,
      interact: '静止不移动、无实体阻挡;入层4秒后每4秒朝玩家直线射170px/s箭;本体接触与箭各20',
      params: []
    },
    {
      type: 'ghost_dash',
      name: '幽灵',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      category: 'hostile',             // 32:敌对单位,可被光环一击消灭
      requiresPath: false,
      interact: '漂浮不移动寻路;每3秒锁定玩家当刻方向直冲2格(0.2秒),穿墙;' +
        '接触20,真正扣血后才自消失;可被光环消灭',
      params: []
    },
    {
      type: 'fireball_spitter',
      name: '喷火火球',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      category: 'hostile',             // 32:敌对单位,可被光环一击消灭
      requiresPath: false,
      interact: '静止、始终左右朝玩家;每4秒水平发射一枚170px/s/20火焰弹;' +
        '弹不穿实体墙、不跨楼层、不可被光环清;本体接触20、可被光环消灭',
      params: []
    },
    {
      type: 'gear',
      name: '路径齿轮',
      letter: null,
      scene: 'normal',
      implemented: 'legacy',
      requiresPath: true,              // pathId 必填
      interact: '沿路径格中心移动,不阻挡,不能被击败',
      params: [
        { name: 'speedTilesPerSecond', label: '速度', type: 'number', unit: '格/秒' },
        { name: 'radiusTiles', label: '判定半径', type: 'number', unit: '格' },
        { name: 'damage', label: '伤害', type: 'number', unit: '生命' }
      ]
    }
  ];

  /** 数值表 → 合并成完整参数描述;数值缺失直接报错(不允许偷偷给个默认) */
  function buildParams(def) {
    var nums = NUMS[def.type] || {};
    return (def.params || []).map(function (p) {
      var n = nums[p.name];
      if (!n) {
        throw new Error('config.OBJECT_PARAMS.' + def.type + '.' + p.name +
          ' 没有数值范围,但 entity-registry 声明了这个参数');
      }
      var out = {
        name: p.name,
        label: p.label || p.name,
        type: p.type || 'number',
        unit: p.unit || '',
        optional: !!p.optional,
        min: n.min,
        max: n.max,
        def: n.def
      };
      if (p.values) out.values = p.values.slice();
      return out;
    });
  }

  var BY_TYPE = Object.create(null);
  var BY_LETTER = Object.create(null);
  var ORDER = [];

  /*
   * 30:对象类别只用于编辑器/运行时的最小分流(不能把金币当怪物):
   *   hostile      = 敌对单位,可被击败(静止/移动火球、灵魂、弓箭手、幽灵、喷火火球)
   *   hazard       = 伤害机关/轨迹物,不可击败,不算击杀、不能拾取
   *   collectible  = 拾取物(金币)
   *   mechanism    = 可交互机关(弹簧/门/浮石)
   */
  var HOSTILE = { fireball_static: 1, fireball_moving: 1, soul: 1, archer: 1,
    ghost_dash: 1, fireball_spitter: 1 };
  var HAZARD = { spike: 1, gear: 1, flail: 1, sewage_pool: 1 };
  function categoryOf(def) {
    if (def.category) return def.category;
    if (HOSTILE[def.type]) return 'hostile';
    if (HAZARD[def.type]) return 'hazard';
    return 'mechanism';
  }

  DEFS.forEach(function (def) {
    var entry = {
      type: def.type,
      name: def.name,
      letter: def.letter || null,
      scene: def.scene || 'normal',
      implemented: def.implemented || 'none',
      category: categoryOf(def),
      interact: def.interact || '',
      requiresPath: !!def.requiresPath,
      params: buildParams(def)
    };
    BY_TYPE[entry.type] = entry;
    if (entry.letter) BY_LETTER[entry.letter] = entry;
    ORDER.push(entry.type);
  });

  function copy(entry) {
    return entry ? JSON.parse(JSON.stringify(entry)) : null;
  }

  /** 全部注册类型(顺序稳定,编辑器按这个顺序排) */
  function list() {
    return ORDER.map(function (t) { return copy(BY_TYPE[t]); });
  }

  function get(type) { return copy(BY_TYPE[String(type)]); }

  function has(type) { return !!BY_TYPE[String(type)]; }

  /** 旧图的字符 → 对象类型(S/x/y);没有对应就 null */
  function typeOfLetter(letter) {
    var e = BY_LETTER[String(letter)];
    return e ? e.type : null;
  }

  /** 必填参数的默认值(可选参数不补,运行时用默认) */
  function defaults(type) {
    var e = BY_TYPE[String(type)];
    if (!e) return null;
    var out = {};
    e.params.forEach(function (p) {
      if (!p.optional) out[p.name] = p.def;
    });
    return out;
  }

  function param(type, name) {
    var e = BY_TYPE[String(type)];
    if (!e) return null;
    for (var i = 0; i < e.params.length; i++) {
      if (e.params[i].name === name) return copy(e.params[i]);
    }
    return null;
  }

  /**
   * 关卡小背景资源 id(35):来自 assets/background/catalog.js 的静态清单。
   * null = 无小背景(照常可玩)。旧 sky1..8 不再注册:值原样保留,但按无背景显示。
   */
  function backgroundIds() {
    var cat = RA.LevelBackgroundCatalog;
    if (!cat || !Array.isArray(cat.entries)) return [];
    return cat.entries.map(function (e) { return e.id; });
  }

  RA.EntityRegistry = {
    list: list,
    get: get,
    has: has,
    typeOfLetter: typeOfLetter,
    defaults: defaults,
    param: param,
    backgroundIds: backgroundIds,
    letters: function () { return Object.keys(BY_LETTER); },
    types: function () { return ORDER.slice(); }
  };
})(globalThis.RA = globalThis.RA || {});
