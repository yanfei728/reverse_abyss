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
      implemented: 'none',             // T05 才实现
      interact: '不阻挡;接触伤害;可被光环一击消灭',
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
      implemented: 'none',
      interact: '本格底座实心,伸出的刺只判伤害;不能被击败',
      params: [
        { name: 'warningSeconds', label: '伸出预警', type: 'number', unit: 's' },
        { name: 'activeSeconds', label: '伸出时长', type: 'number', unit: 's' },
        { name: 'cooldownSeconds', label: '回收冷却', type: 'number', unit: 's' },
        { name: 'damage', label: '伤害', type: 'number', unit: '生命' }
      ]
    },
    {
      type: 'gear',
      name: '路径齿轮',
      letter: null,
      scene: 'normal',
      implemented: 'none',
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

  DEFS.forEach(function (def) {
    var entry = {
      type: def.type,
      name: def.name,
      letter: def.letter || null,
      scene: def.scene || 'normal',
      implemented: def.implemented || 'none',
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

  /** 背景资源 id:首版只有内置的 sky1~skyN(null = 按层数循环) */
  function backgroundIds() {
    var n = C.SKY_COUNT || 8;
    var out = [];
    for (var i = 1; i <= n; i++) out.push('sky' + i);
    return out;
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
