/* -*- coding: utf-8 -*- */
/*
 * tower.js —— 塔:哪几层、每层是哪张图
 * ====================================
 * 这是 reverse_abyss 和 abyss 最大的不同:abyss 是"一条线一路往下",
 * 这里是一座**塔** —— 塔高 N 层,每一层都是从关卡池里现挑的一张独立关卡,
 * 所以每层的结构不固定,玩家可以在开局界面的设置里按 R「重构」换一座塔。
 *
 * 一条铁律:**同一个种子 + 同一批选项 = 同一座塔**。
 * 种子用 mulberry32(可复现的伪随机),所以"重构"能变出新花样,
 * 而把种子抄下来又能把同一座塔原样复现出来(还能发给别人爬同一座塔)。
 *
 * 每层额外有个"镜像"标记:同一张图左右翻一下就是另一种走法,
 * 关卡池不大的时候靠它把结构变化拉开(见 config.MIRROR_DEFAULT)。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  class Tower {
    constructor(pool, opts) {
      this.pool = pool || [];
      this.floors = [];          // [{index, templateIndex, id, name, difficulty, verified, flip}],
                                 // index 0 = 第 1 层(最下面);id 是关卡的固定身份
      this.current = 0;          // 现在站在第几层(0 基)
      this.seedLabel = '';
      this.seedNum = 0;
      this.mirror = C.MIRROR_DEFAULT;
      this._cache = {};          // 已经建好的 Level(过渡要用到两层同时在场)
      if (opts) this.generate(opts);
    }

    get height() { return this.floors.length; }
    get totalMeters() { return this.height * C.FLOOR_METERS; }
    get climbedMeters() { return this.current * C.FLOOR_METERS; }

    /**
     * 重新排一座塔。
     * opts: {floors 层数, seed 种子(标签或数字), mirror 是否允许镜像, pool 换一批模板}
     */
    generate(opts) {
      opts = opts || {};
      var pool = opts.pool || this.pool;
      if (!pool.length) {
        this.floors = [];
        this._cache = {};
        return this;
      }
      var count = RA.clamp(Math.round(opts.floors || this.floors.length || C.TOWER_FLOORS),
        1, C.TOWER_FLOORS_MAX);
      var label = (opts.seed === undefined || opts.seed === null) ? this.seedLabel : opts.seed;
      var seedNum = (typeof label === 'number') ? (label >>> 0) : RA.labelToSeed(label);
      if (seedNum === null || seedNum === undefined) seedNum = RA.randomSeed();
      this.seedNum = seedNum >>> 0;
      this.seedLabel = RA.seedToLabel(this.seedNum);
      this.mirror = opts.mirror === undefined ? this.mirror : !!opts.mirror;

      var gap = opts.noRepeatGap === undefined ? C.TOWER_NO_REPEAT_GAP : opts.noRepeatGap;
      var rng = RA.mulberry32(this.seedNum);
      var out = [], recent = [];
      for (var i = 0; i < count; i++) {
        // 候选 = 不在"最近 gap 层"里的模板(池子太小就退化成全都可选)
        var cand = [];
        for (var k = 0; k < pool.length; k++) {
          if (recent.indexOf(k) < 0) cand.push(k);
        }
        if (!cand.length) {
          for (k = 0; k < pool.length; k++) cand.push(k);
        }
        var pick = cand[Math.floor(rng() * cand.length)];
        var flip = this.mirror ? (rng() < 0.5) : false;
        out.push({
          index: i,
          templateIndex: pick,
          id: pool[pick].id,
          name: pool[pick].name,
          difficulty: pool[pick].difficulty || 1,
          verified: pool[pick].verified !== false,
          flip: flip
        });
        recent.push(pick);
        if (recent.length > gap) recent.shift();
      }
      this.floors = out;
      this.current = 0;
      this._cache = {};
      return this;
    }

    /** 建出第 i 层(i 从 0 数)。同一层只会建一次,过渡动画里要同时拿着两层。 */
    level(i) {
      if (this._cache[i]) return this._cache[i];
      var plan = this.floors[i];
      if (!plan) return null;
      var tpl = this.pool[plan.templateIndex];
      if (!tpl) return null;
      // 优先用池子里的完整关卡数据(asc + 元信息);老格式的池子项只有 text
      var data = tpl.data || { id: tpl.id, asc: tpl.text };
      var lv = RA.Level.fromData(data, {
        id: tpl.id,
        flipX: plan.flip,
        // 只在浏览器里的层(编辑器刚存的、还没写成 levels/*.json)标出来,免得日志里
        // 说"来自 floor03.json"、但磁盘上其实还没有这个文件
        source: (tpl.custom || tpl.overrideOnly) ? tpl.id + '(浏览器里)' : tpl.id + '.json'
      });
      plan.name = tpl.name || lv.name;     // 新格式里没有名字,这里就等于 id
      plan.id = lv.id;
      plan.difficulty = lv.difficulty;
      plan.verified = lv.verified;
      this._cache[i] = lv;
      return lv;
    }

    /** 把建好的楼层扔掉(重新开爬之前调一下,实体状态才会是全新的) */
    clearCache() {
      this._cache = {};
    }

    /** 第 i 层的标题,给 HUD / 设置面板用 */
    title(i) {
      var plan = this.floors[i];
      if (!plan) return '';
      return '第 ' + (i + 1) + ' 层 · ' + (plan.name || plan.id) + (plan.flip ? ' · 镜像' : '');
    }

    /** "第 i 层用的是哪张图" —— 用来在设置面板里标出重复用的模板 */
    templateColorIndex(i) {
      var plan = this.floors[i];
      return plan ? plan.templateIndex : 0;
    }
  }

  RA.Tower = Tower;
})(globalThis.RA = globalThis.RA || {});
