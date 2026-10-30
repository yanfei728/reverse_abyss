/* -*- coding: utf-8 -*- */
/*
 * entities/spring.js —— 弹簧板(地图字符 S)
 * ==========================================
 * 向上爬塔里最有用的一块机关:踩上去直接被顶高一大截(比二段跳还高),
 * 而且顺便把"二段跳次数"补满,所以长得高的楼层靠它才上得去。
 *
 * 顺便它也是"怎么给引擎加一个新东西"的活例子 —— 照着这个文件复制一份,
 * 改改 letter 和 update 就是金币 / 敌人 / 传送门:
 *   1) 新建 js/entities/xxx.js,继承 RA.Entity,写上 letter,调 RA.register
 *   2) 在 index.html 的 script 列表里加一行
 *   3) 地图里写那个字符
 * 引擎代码一行都不用改。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  class Spring extends RA.Entity {
    constructor(level, col, row) {
      super(level, col, row);
      this.cool = 0;        // 冷却:免得贴着板子每帧都触发
      this.squash = 0;      // 压下去多少(0~1),只影响画面
    }

    /** 板面(踩得到的那一块) */
    get pad() {
      return { x: this.x + 3, y: this.y + this.h - 16, w: this.w - 6, h: 16 };
    }

    update(dt, game) {
      this.cool = Math.max(0, this.cool - dt);
      this.squash = Math.max(0, this.squash - dt * 4);
      var p = game && game.player;
      if (!p) return;
      if (this.cool > 0) return;
      var pad = this.pad;
      // 只有"落在板子上"(没在快速上升)才弹,不然从旁边跳过去也会被弹飞
      if (p.vy > -40 && RA.overlap(p.x, p.y, p.w, p.h, pad.x, pad.y, pad.w, pad.h)) {
        p.vy = C.SPRING_VEL;
        p.onGround = false;
        p.jumpsUsed = 0;      // 顺便把二段跳次数补满
        p.ledgeUsed = false;
        p.jumpCut = true;     // 这一下是"保证弹上去"的,松手也不削
        this.cool = C.SPRING_COOLDOWN;
        this.squash = 1;
        if (game.snd) game.snd.play('spring');
      }
    }

    draw(ctx, cam, assets) {
      var sx = this.x - cam.ox;
      var sy = this.y + this.h - cam.oy;
      if (sx < -80 || sx > cam.vw + 80 || sy < -80 || sy > cam.vh + 80) return;
      var w = this.w, h = this.h;
      var img = assets.image('entities/spring');
      // 贴图底边 = 格子底边(assets/entities/spring.png,一格 45×45)。
      // 踩下去的那一下和以前一样:整块往下沉 press 像素,看着就是被压扁了。
      var press = this.squash * 7;
      ctx.save();
      ctx.drawImage(img, sx, sy - h + press, w, h);
      ctx.restore();
    }

    /** 关卡编辑器调色板里的小图标:一块弹簧板 */
    drawIcon(ctx, x, y, size) {
      var cx = x + size / 2;
      var base = y + size * 0.80;
      RA.rrect(ctx, x + size * 0.14, base - size * 0.13, size * 0.72, size * 0.13,
        [70, 76, 104], 3, [26, 28, 40], 2);
      RA.line(ctx, cx - size * 0.18, base - size * 0.18, cx + size * 0.18,
        base - size * 0.22, 3, [150, 158, 186]);
      RA.line(ctx, cx - size * 0.18, base - size * 0.28, cx + size * 0.18,
        base - size * 0.32, 3, [150, 158, 186]);
      RA.rrect(ctx, x + size * 0.10, base - size * 0.46, size * 0.80, size * 0.15,
        [246, 196, 96], 4, [26, 28, 40], 2);
      RA.polygon(ctx, [[cx, base - size * 0.66], [cx - size * 0.13, base - size * 0.52],
        [cx + size * 0.13, base - size * 0.52]], [255, 226, 140, 200]);
    }
  }

  Spring.letter = 'S';
  Spring.NAME = '弹簧板(踩上去弹很高)';
  RA.register(Spring);
  RA.Spring = Spring;
})(globalThis.RA = globalThis.RA || {});
