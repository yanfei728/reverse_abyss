/* -*- coding: utf-8 -*- */
/*
 * entities/base.js —— 所有实体的父类 + 字符注册表
 * ================================================
 * 实体 = 一层塔里除了"地形"以外的东西:角色、出口,以后的道具 / 敌人 / 机关。
 *
 * 坐标约定
 * --------
 *  · 地图里一格 = TS(45)px;实例化时告诉你"我在第几列第几行"。
 *  · 自己的位置用 x y(世界像素坐标),y 是"上边缘"。
 *  · 想拿脚底 / 中心,用 feet / cx / cy。
 *
 * 加一个新东西(金币、敌人、弹簧、门……):
 *   1) 在这个文件夹里新建 xxx.js,继承 Entity,写上 letter,加 @register
 *   2) 在 index.html 的 script 列表里加上这个文件
 *   3) 地图里写那个字符
 * 引擎代码一行都不用改。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  /** "字符 → 实体类"的注册表。关卡地图里写那个字符就会自动生成一个实例。 */
  var BY_LETTER = {};

  /**
   * "类型名 → 实体类"的注册表。关卡 json 的 objects[] 里按 type 找类
   * (见 level.js 的 _buildObjects),构造签名是 (level, col, row, params) ——
   * 给"要带参数的东西"(怪物 / 机关)用:实体类上写一行 `Xxx.type = 'fireball'` 就行。
   */
  var BY_TYPE = {};

  function register(cls) {
    var letter = cls.letter;
    if (letter) {
      if (BY_LETTER[letter]) {
        throw new Error("字符 '" + letter + "' 被 " + BY_LETTER[letter].name +
          ' 和 ' + cls.name + ' 抢占了');
      }
      BY_LETTER[letter] = cls;
    }
    if (cls.type) BY_TYPE[cls.type] = cls;
    return cls;
  }

  class Entity {
    constructor(level, col, row) {
      this.level = level;
      this.col = col;
      this.row = row;
      this.w = this.h = C.TS;
      this.x = col * C.TS;
      this.y = row * C.TS;
      this.alive = true;
    }

    // ---------- 常用坐标 ----------
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    get feet() { return this.y + this.h; }          // 脚底(下边缘)

    // ---------- 生命周期(子类按需覆盖)----------
    loadSprites(assets) {}                          // 从 assets 取自己的贴图
    update(dt, game) {}                             // 每帧逻辑;game 里有 .level / .player / .snd
    draw(ctx, cam, assets) {}                       // 把自己画到画布上

    /**
     * 这一格现在挡不挡人?(默认不挡 —— 出口、弹簧板这些都能穿过去)
     *
     * 返回 true 的实体会被 level 当成一块**实心地形**参与碰撞:横向挡人、能站上去、
     * 从下面顶头,一格 = 一块砖。会变的机关(踩一会儿就消失的浮石之类)
     * 只要在这里按自己的状态返回 true / false,碰撞就跟着一起变。
     *
     * 两件事注意:
     *   · 出生点 / 出口会自动落到"下面第一块能站的地方",实体也算数;
     *   · js/reach.js 的静态可达性分析**不查实体** —— 会消失的机关本来也没法静态算,
     *     靠它上下的层请自己试玩确认。
     */
    solidAt(r, c) { return false; }

    /**
     * 画一个"图标"(不依赖镜头):关卡编辑器的调色板、以后可能的图鉴都用它。
     * 默认画一个带自己字符的方块 —— 所以**新加的实体不用写这个方法**,
     * 编辑器里就自动有一个能认出来的图标(想更好看就在子类里覆盖)。
     * 注意:这个方法可能被挂在原型上、没有实例地调用(编辑器就是这么干的),
     * 所以里面只能用 cls 上的静态值和传入的参数,别读 this.x 之类。
     */
    drawIcon(ctx, x, y, size) {
      var letter = (this.constructor && this.constructor.letter) || '?';
      var hue = (letter.charCodeAt(0) * 47) % 360;
      RA.rect(ctx, x, y, size, size, [38, 44, 64], 7);
      RA.strokeRect(ctx, x, y, size, size, 'hsl(' + hue + ',55%,62%)', 2, 7);
      RA.text(ctx, letter, Math.round(size * 0.58), [236, 244, 255],
        x + size / 2, y + size / 2, { bold: true, shadow: false });
    }
  }

  Entity.letter = null;      // 地图里用哪个字符表示我
  Entity.type = null;        // json 的 objects[] 里用哪个 type 表示我(要带参数的才需要)
  Entity.NAME = '地物';      // 中文名(关卡编辑器里显示这个)
  Entity.marker = false;     // true = 只标个位置、不生成实体(比如出生点)

  RA.BY_LETTER = BY_LETTER;
  RA.BY_TYPE = BY_TYPE;
  RA.register = register;
  RA.Entity = Entity;
})(globalThis.RA = globalThis.RA || {});
