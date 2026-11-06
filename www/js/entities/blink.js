/* -*- coding: utf-8 -*- */
/*
 * entities/blink.js —— 浮石(地图字符 y)
 * =====================================
 * 一块 1×1 的"浮石":有碰撞体积(能挡人、能踩)。玩家**只要踩到它(脚碰到顶面)**
 * 它立刻就消失(默认 0.12 秒的收拢动画之后就完全让开),过一段时间(默认 1.6 秒)
 * 再变回来 —— 反复如此。
 *
 * 变回来之前会先看那块格子空不空:
 *   · 里面有玩家(玩家还站在那儿 / 卡在那儿)→ **不重现**,再等一个周期;
 *   · 空着 → 变回来。
 * 所以它不会把人卡进石头里,但也意味着"站在上面不动"它就永远回不来 ——
 * 想让它回来就得先离开那一格。
 *
 * 用法:当"踩一下就抽走的落脚点" —— 踩上去要赶紧走,不然它消失你就掉下去;
 * 也可以拿它做"节拍平台":等它回来再跳下一块。
 *
 * 注意:它属于"会变的机关",js/reach.js 的静态可达性分析**不把它当平台** ——
 * 一层的进出口别只靠它连着,自己试玩一遍。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  class Blink extends RA.Entity {
    constructor(level, col, row) {
      super(level, col, row);
      this.hidden = 0;          // 还要消失多久(> 0 就是不见了)
      this.step = 0;            // 收拢动画进度:踩到的那一瞬间从 1 掉到 0
    }

    static get GONE() { return C.BLINK_GONE; }        // 一次消失多久

    get hiddenNow() { return this.hidden > 0; }

    /** 还挡人吗:消失的时候完全不挡(玩家能穿过 / 掉下去) */
    solidAt(r, c) {
      if (this.hiddenNow) return false;
      return r === this.row && c === this.col;
    }

    /** 玩家这一帧是不是踩到了它(脚在顶面上、横向有重叠) */
    stoodOn(p) {
      if (!p) return false;
      var near = Math.abs(p.feet - this.y) <= 6;          // 脚底贴着顶面
      return near && p.x + p.w > this.x + 2 && p.x < this.x + this.w - 2;
    }

    /** 踩到 → 立刻消失(不再"站一会儿才消失") */
    vanishFor() {
      this.hidden = this.constructor.GONE;
      this.step = 1;
    }

    update(dt, game) {
      var p = game && game.player;
      if (this.hiddenNow) {
        this.step = Math.max(0, this.step - dt * 6);
        this.hidden -= dt;
        if (this.hidden > 0) return;
        // 该变回来了:格子里还有人就不出现,再等一个周期
        this.hidden = 0;
        if (p && RA.overlap(p.x, p.y, p.w, p.h, this.x, this.y, this.w, this.h)) {
          this.hidden = this.constructor.GONE;
          return;
        }
        this.step = 0;
        if (game && game.snd) game.snd.play('blink');
        return;
      }
      if (this.stoodOn(p)) {
        this.vanishFor();
        if (game && game.snd) game.snd.play('vanish');
      }
    }

    draw(ctx, cam, assets) {
      var sx = this.x - cam.ox, sy = this.y - cam.oy;
      if (sx < -80 || sx > cam.vw + 80 || sy < -80 || sy > cam.vh + 80) return;
      var w = this.w, h = this.h;
      var img = assets.image('entities/blink');
      ctx.save();
      if (this.hiddenNow) {
        // 消失期间:先来一下"收拢"(踩到的瞬间),剩下时间只留一圈虚影
        if (this.step > 0) {
          var k = this.step;                       // 1 → 0
          ctx.globalAlpha = 0.75 * k;
          ctx.drawImage(img, sx + w * (1 - k) / 2, sy + h * (1 - k) / 2, w * k, h * k);
        }
        ctx.globalAlpha = 0.30;
        RA.strokeRect(ctx, sx + 3, sy + 3, w - 6, h - 6, [150, 208, 236], 2, 5);
        ctx.globalAlpha = 0.16;
        RA.rect(ctx, sx + 5, sy + 5, w - 10, h - 10, [150, 208, 236], 4);
        ctx.restore();
        return;
      }
      // 看得见:一块发蓝的石头(踩到就走,所以不抖了)
      ctx.drawImage(img, sx, sy, w, h);
      ctx.restore();
    }

    /** 编辑器调色板里的小图标:一块发蓝的石头,底下加一条"会消失"的横线 */
    drawIcon(ctx, x, y, size) {
      RA.rrect(ctx, x + size * 0.10, y + size * 0.10, size * 0.80, size * 0.68,
        [96, 132, 156], 5, [26, 30, 44], 2);
      RA.rect(ctx, x + size * 0.18, y + size * 0.16, size * 0.64, size * 0.08,
        [226, 240, 250], 3);
      RA.line(ctx, x + size * 0.18, y + size * 0.50, x + size * 0.82, y + size * 0.50,
        1, [206, 224, 236]);
      // 底下那条"虚影"提示:踩一下就没
      RA.strokeRect(ctx, x + size * 0.14, y + size * 0.82, size * 0.72, size * 0.12,
        [150, 208, 236], 2, 3);
    }
  }

  Blink.letter = 'y';
  Blink.NAME = '浮石(踩一下就消失,过一会儿回来)';
  RA.register(Blink);
  RA.Blink = Blink;
})(globalThis.RA = globalThis.RA || {});
