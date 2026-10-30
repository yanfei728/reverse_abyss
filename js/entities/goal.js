/* -*- coding: utf-8 -*- */
/*
 * entities/goal.js —— 出口(上一层)
 * ==================================
 * 地图里写 G 就摆一个(写在要站的那格**上方的空格**里就行,它会自动往下
 * 找到地面站上去;就算正好写在实心格里也不会出错)。
 *
 * 向上爬塔里它就是"通往上一层的口子":角色碰到它,这一层就算爬完了,
 * 镜头会往上滚进下一层(见 game.js 的 beginClimb)。
 *
 * 判定是一个方盒子(宽 GOAL_WIDTH / 高 GOAL_HEIGHT,从落脚地面往上算),
 * 比 abyss 的旗杆简单,也不会出现"从下面经过就误判"的问题。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  class Goal extends RA.Entity {
    constructor(level, col, row) {
      super(level, col, row);
      // 自己往下找地面站上去
      var ground = level.groundBelow(row, col);
      if (ground !== null) {
        this.row = ground;
        this.y = ground * level.tile;
      }
    }

    /** 判定盒:脚下地面往上一段,水平方向以这一格为中心 */
    get box() {
      return {
        x: this.x + (C.TS - C.GOAL_WIDTH) / 2,
        y: this.y - C.GOAL_HEIGHT,
        w: C.GOAL_WIDTH,
        h: C.GOAL_HEIGHT
      };
    }

    /** 角色碰到出口 → 通关本层 */
    reached(player) {
      var b = this.box;
      return RA.overlap(player.x, player.y, player.w, player.h, b.x, b.y, b.w, b.h);
    }

    // ---------- 绘制:一道往上的光柱 ----------
    /*
     * 光柱本体是 assets/entities/goal.png(正好是判定盒那么大,
     * 由 tools/build_assets.mjs 生成),贴图上存的是"中间亮度"那一帧;
     * 一明一暗的呼吸靠 globalAlpha。
     * 底座比光柱宽、贴图塞不下,「上一层」要跟字体走 —— 这两个还是代码画。
     */
    draw(ctx, cam, assets) {
      var b = this.box;
      var sx = b.x - cam.ox, sy = b.y - cam.oy;
      if (sx < -120 || sx > cam.vw + 120 || sy < -160 || sy > cam.vh + 160) return;

      var t = RA.time || 0;
      var pulse = 0.5 + 0.5 * Math.sin(t * 3.0);
      var cx = b.x + b.w / 2 - cam.ox;

      ctx.save();
      // 光柱(呼吸:0.75 ~ 1.00)
      ctx.globalAlpha = 0.75 + 0.25 * pulse;
      ctx.drawImage(assets.image('entities/goal'), sx, sy);
      ctx.globalAlpha = 1;
      // 底座
      RA.rrect(ctx, sx - 4, sy + b.h - 6, b.w + 8, 8, [86, 96, 128], 3, [26, 28, 40], 2);
      ctx.restore();

      if (RA.text) RA.text(ctx, '上一层', 14, [255, 236, 180], cx, sy - 12, { bold: true });
    }

    /** 关卡编辑器调色板里的小图标:一道往上的光柱 */
    drawIcon(ctx, x, y, size) {
      var w = size * 0.55;
      var bx = x + (size - w) / 2;
      var g = ctx.createLinearGradient(0, y + size * 0.12, 0, y + size * 0.88);
      g.addColorStop(0, 'rgba(255,235,170,0.20)');
      g.addColorStop(1, 'rgba(255,195,95,0.85)');
      RA.pathRoundRect(ctx, bx, y + size * 0.12, w, size * 0.76, 4);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,232,168,0.9)';
      ctx.stroke();
      RA.polygon(ctx, [[x + size / 2, y + size * 0.30],
        [x + size / 2 - size * 0.16, y + size * 0.50],
        [x + size / 2 + size * 0.16, y + size * 0.50]], [255, 244, 210]);
      RA.polygon(ctx, [[x + size / 2, y + size * 0.50],
        [x + size / 2 - size * 0.16, y + size * 0.70],
        [x + size / 2 + size * 0.16, y + size * 0.70]], [255, 244, 210, 150]);
    }
  }

  Goal.letter = 'G';
  Goal.NAME = '出口「上一层」';
  RA.register(Goal);
  RA.Goal = Goal;
})(globalThis.RA = globalThis.RA || {});
