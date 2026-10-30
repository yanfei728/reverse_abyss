/* -*- coding: utf-8 -*- */
/*
 * monsters.js —— 怪物参数表
 * ==========================
 * 关卡 json 里摆一只怪物长这样(写在 objects[] 里,不是写在地图的字符里):
 *
 *     "objects": [
 *       {"type": "fireball", "col": 3, "row": 5, "params": {}}
 *     ]
 *
 * 为什么怪物走 objects 而不是地图字符:它们**要带参数**(速度、方向、血量……),
 * 一个字符带不了这些。地形和那些没参数的地物(出口 / 弹簧板)照旧写在 asc 地图里。
 *
 * 这张表现在只记两件事:
 *   · 有哪些怪物(现在只有火球)
 *   · 每种怪物有哪些参数、默认值是多少(现在都还空着)
 * 行为还没有 —— 等要真的动起来的时候,在 js/entities/ 里写一个实体类、
 * 类上写一行 `Fireball.type = 'fireball'`,再 RA.register 一下,关卡里那些
 * objects 立刻就会生成实体(见 level.js 的 _buildObjects)。
 *
 * 想加一种怪物:照 fireball 加一条,参数写进 params(默认值也写这儿)。
 */
(function (RA) {
  'use strict';

  var MONSTERS = {
    // 火球:会飞 / 会烧人的小球。参数先空着,以后往 params 里加(速度、半径、伤害……)
    fireball: {
      type: 'fireball',
      NAME: '火球',
      params: {}
    }
  };

  /** 按 type 取一种怪物的定义(没有就 null) */
  function get(type) {
    return MONSTERS[String(type)] || null;
  }

  /** 现在有哪些怪物 */
  function ids() {
    return Object.keys(MONSTERS);
  }

  /** 一种怪物的参数默认值(null = 没这种怪物) */
  function defaults(type) {
    var m = get(type);
    if (!m) return null;
    var out = {};
    Object.keys(m.params || {}).forEach(function (k) { out[k] = m.params[k]; });
    return out;
  }

  /** 把关卡 objects 里写的参数补全成"默认值 + 关卡里写的"(关卡里写的说了算) */
  function paramsOf(type, params) {
    var out = defaults(type) || {};
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) { out[k] = params[k]; });
    }
    return out;
  }

  RA.MONSTERS = MONSTERS;
  RA.Monsters = { get: get, ids: ids, defaults: defaults, paramsOf: paramsOf };
})(globalThis.RA = globalThis.RA || {});
