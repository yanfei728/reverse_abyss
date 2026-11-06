/* -*- coding: utf-8 -*- */
/*
 * entities/ghost.js —— 触之即散(地图字符 x)
 * ==========================================
 * 一块 1×1 的"碎影":有碰撞体积(挡人、能站),玩家**从任何方向**碰到它的那一瞬间
 * 就很快散掉(默认 0.12 秒),散掉之后就彻底让开 —— 同一局游戏里不会再出现。
 *
 * 用法:拿它当"一次性的墙 / 一次性的落脚点" ——
 *   · 堵住一条近路,撞开就通;
 *   · 当一段只能踩一次的台阶(踩上去就没了,回头路也断了);
 *   · 配合别的机关做成"先撞左边那块、再走右边"这种顺序题。
 *
 * 注意:它属于"会变的机关",所以 js/reach.js 的静态可达性分析**不把它当平台** ——
 * 一层的进出口别只靠它连着,自己试玩一遍(reach 的结论只覆盖死地形)。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  class Ghost extends RA.Entity {
    constructor(level, col, row) {
      super(level, col, row);
      this.gone = false;        // 玩家碰过 → 正在散
      this.life = 0;            // 散开还剩多久(秒)
      this.phase = 0;           // 画面用:飘一飘
    }

    /** 散开用多久:很短,但留一点"看得见它碎掉"的时间 */
    static get FADE() { return C.GHOST_FADE; }

    /** 还挡人吗:碰到之后、还没散完之前就已经让开了(0.12 秒足够看明白) */
    solidAt(r, c) {
      if (this.gone) return false;
      return r === this.row && c === this.col;
    }

    update(dt, game) {
      this.phase += dt;
      if (this.gone) {
        this.life -= dt;
        if (this.life <= 0) this.alive = false;         // 散完了,这一局不再出现
        return;
      }
      var p = game && game.player;
      if (!p) return;
      if (RA.overlap(p.x, p.y, p.w, p.h, this.x, this.y, this.w, this.h)) {
        this.gone = true;
        this.life = this.constructor.FADE;
        if (game.snd) game.snd.play('vanish');
      }
    }

    draw(ctx, cam, assets) {
      var sx = this.x - cam.ox, sy = this.y - cam.oy;
      if (sx < -80 || sx > cam.vw + 80 || sy < -80 || sy > cam.vh + 80) return;
      var w = this.w, h = this.h;
      var a = this.gone ? RA.clamp(this.life / this.constructor.FADE, 0, 1) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      // 一块歪歪扭扭的"碎影":底色 + 两片裂缝 + 一点点抖动
      var jit = this.gone ? (1 - a) * 5 : Math.sin(this.phase * 3) * 1.2;
      RA.rrect(ctx, sx + 2 + jit, sy + 2, w - 4, h - 4, [78, 66, 122], 6, [30, 26, 48], 2);
      RA.line(ctx, sx + w * 0.30 + jit, sy + 5, sx + w * 0.46 + jit, sy + h - 6,
        2, [168, 150, 226]);
      RA.line(ctx, sx + w * 0.62 + jit, sy + 4, sx + w * 0.52 + jit, sy + h * 0.55,
        2, [150, 132, 208]);
      RA.line(ctx, sx + w * 0.52 + jit, sy + h * 0.55, sx + w * 0.68 + jit, sy + h - 5,
        2, [150, 132, 208]);
      ctx.restore();
    }

    /** 编辑器调色板里的小图标:一块带裂缝的紫色方块 */
    drawIcon(ctx, x, y, size) {
      RA.rrect(ctx, x + size * 0.10, y + size * 0.10, size * 0.80, size * 0.80,
        [78, 66, 122], 6, [30, 26, 48], 2);
      RA.line(ctx, x + size * 0.32, y + size * 0.18, x + size * 0.48, y + size * 0.82,
        2, [186, 170, 240]);
      RA.line(ctx, x + size * 0.66, y + size * 0.16, x + size * 0.54, y + size * 0.52,
        2, [168, 150, 226]);
      RA.line(ctx, x + size * 0.54, y + size * 0.52, x + size * 0.72, y + size * 0.84,
        2, [168, 150, 226]);
    }
  }

  Ghost.letter = 'x';
  Ghost.NAME = '触之即散(碰一下就消失)';
  RA.register(Ghost);
  RA.Ghost = Ghost;
})(globalThis.RA = globalThis.RA || {});
