/* -*- coding: utf-8 -*- */
/*
 * entities/player.js —— 玩家角色
 * ================================
 * 一个横版平台角色该有的东西都在这儿:左右加速/摩擦、重力、跳跃
 * (缓冲 + 土狼时间 + 可变跳高 + 二段跳)、瓦片碰撞、动画、脚步音效。
 *
 * ★ 这一段是从 abyss/game/entities/player.py 一比一搬过来的,连注释里
 *   "为什么这么写"的经验也一起搬了(踩地判定的抖动、落脚容错为什么只在上升时生效)。
 *   两处必要的适配:
 *     · 按键从 pygame 键码换成了 input 对象 {left, right, jump},
 *       这样物理自检可以自己造输入,不用开窗口;
 *     · Python 的"类属性"能被实例读到,JS 的 static 不行 —— 所以文件最后
 *       给这些手感数值加了一层"实例也能读/也能改"的访问器,行为和 Python 对齐。
 *
 * 想做一个"新角色":把下面那几个静态数值改掉就能用 —— 碰撞盒、贴图表、脚底对齐点
 * 全是数据,不用碰引擎。改了类上的值就是所有角色都改;写到某个实例上只改那一个
 * (self.MAX_VX = 500 那种写法在 JS 这边一样有效)。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  class Player extends RA.Entity {
    constructor(level) {
      super(level, level.spawnCol || 0, level.spawnRow || 0);
      this.w = this.W;
      this.h = this.H;
      this.frames = {};
      this.reset();
    }

    loadSprites(assets) {
      this.frames = assets.frames(this.SPRITES);
    }

    // ================= 状态 =================
    /** 回到本层的出生点,状态清零 */
    reset() {
      this.x = this.level.startX;
      this.y = this.level.startFeet - this.h;
      this.vx = this.vy = 0;
      this.facing = 1;                    // 1 朝右 / -1 朝左
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpCut = false;
      this.prevJump = false;
      this.jumpsUsed = 0;                 // 这次滞空已经跳了几次(落地清零)
      this.spinT = this.SPIN_TIME;        // 二段跳翻滚进度(>= SPIN_TIME 表示没在转)
      this.ledgeUsed = false;             // 这次滞空有没有用过落脚容错(落地清零)
      this.animT = 0;
      this.stepT = 0;
      this.cur = 'idle';
    }

    /** 二段跳时角色转过的角度。没在转就是 0,最多不超过 SPIN_DEG(一圈)。 */
    get spinAngle() {
      if (this.SPIN_TIME <= 0 || this.spinT >= this.SPIN_TIME) return 0;
      return this.SPIN_DEG * (this.spinT / this.SPIN_TIME);
    }

    /**
     * 身前(direction 方向)那堵墙的顶面 y。够不着、或者压根没墙就返回 null。
     * "只差一点点就能跳上去" = 脚底已经陷到这堵墙的侧面里、但没陷太深。
     */
    _ledgeTopAhead(direction) {
      var lv = this.level;
      var probe = direction > 0
        ? this.x + this.w + C.LEDGE_ASSIST_PROBE
        : this.x - C.LEDGE_ASSIST_PROBE;
      var col = Math.floor(probe / lv.tile);
      var row = Math.floor(this.feet / lv.tile);
      if (!lv.blockedAt(row, col)) return null;     // 脚底这一行不是墙(人已经比墙顶高了)
      while (lv.blockedAt(row - 1, col)) row--;     // 往上爬到这块实心的顶
      var top = row * lv.tile;
      var gap = this.feet - top;                    // 还差多高才够得着
      return (gap > 0 && gap <= this.LEDGE_ASSIST) ? top : null;
    }

    // ================= 每帧 =================
    update(dt, input, game) {
      var lv = this.level;
      input = input || {};

      // ---------- 输入 ----------
      var left = !!input.left, right = !!input.right;
      var move = (right ? 1 : 0) - (left ? 1 : 0);
      if (move) this.facing = move;

      // ---------- 横向加速 / 摩擦 ----------
      if (move) {
        var accel = this.onGround ? this.GROUND_ACCEL : this.AIR_ACCEL;
        this.vx += move * accel * dt;
      } else {
        var k = this.onGround ? this.FRICTION : 0.8;
        this.vx *= Math.max(0, 1 - k * dt);
      }
      var cap = this.onGround ? this.MAX_VX : this.AIR_MAX_VX;
      if (Math.abs(this.vx) > cap) this.vx = this.vx > 0 ? cap : -cap;

      // ---------- 跳跃:缓冲 + 土狼时间 + 可变跳高 + 二段跳 ----------
      var jump = !!input.jump;
      var justPressed = jump && !this.prevJump;
      var released = !jump && this.prevJump;
      this.prevJump = jump;

      if (this.onGround) this.coyote = this.COYOTE_TIME;
      else this.coyote = Math.max(0, this.coyote - dt);
      if (justPressed) this.jumpBuffer = this.JUMP_BUFFER;
      else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

      if (this.jumpBuffer > 0) {
        var onFooting = this.onGround || this.coyote > 0;     // 还踩在地上(或土狼时间内)
        if (onFooting || this.jumpsUsed < this.JUMPS) {
          // 空中、而且这次滞空已经跳过一次 → 这就是二段跳
          var isDouble = !onFooting && this.jumpsUsed >= 1;
          this.vy = this.JUMP_VEL;                            // 初速度与一段跳完全一样
          this.onGround = false;
          this.coyote = 0;
          this.jumpBuffer = 0;
          this.jumpCut = false;                               // 二段跳也能靠松手跳得矮
          this.jumpsUsed = onFooting ? 1 : this.jumpsUsed + 1;
          if (isDouble) this.spinT = 0;                       // 空中翻个身(最多一圈)
          if (game && game.snd) game.snd.play('jump');
        }
      }

      if (released && this.vy < 0 && !this.jumpCut) {
        this.vy *= this.JUMP_CUT;        // 松手就把上升速度砍一刀 → 跳得矮
        this.jumpCut = true;
      }

      // ---------- 移动 + 碰撞 ----------
      var wasAir = !this.onGround;
      this.vy += this.GRAVITY * dt;
      var r = lv.move(this.x, this.y, this.w, this.h, this.vx, this.vy, dt);
      this.x = r.x; this.y = r.y; this.vx = r.vx; this.vy = r.vy;
      var grounded = r.grounded;
      // 关键:静止时重力每帧只推进不到 1px,靠"陷进地面"判断会反复失重,
      // 于是动画会在待机/跑动/空中之间乱闪。所以只要没在上升,
      // 再检查脚底正下方 2px 内有没有实心,稳定地判定为"踩在地上"。
      if (!grounded && this.vy >= 0) grounded = lv.standingOn(this.x, this.feet, this.w);
      this.onGround = grounded;
      if (grounded) {
        this.jumpsUsed = 0;        // 落地 → 二段跳次数重置
        this.spinT = this.SPIN_TIME;
        this.ledgeUsed = false;
      }

      this.x = Math.max(0, Math.min(this.x, lv.worldW - this.w));   // 世界左右边界

      // ---------- 落脚容错:跳得只差一点点 → 自动送上墙 ----------
      // 只在**上升途中**判定:是"跳上去没够着",而不是从上面掉下来擦到墙边
      // (那样会变成磁铁,从平台旁掉下去也会被吸上去)。
      if (!grounded && this.vy < 0 && !this.ledgeUsed) {
        var push = move || (this.vx > 1 ? 1 : (this.vx < -1 ? -1 : 0));
        var top = push ? this._ledgeTopAhead(push) : null;
        if (top !== null) {
          // 照现在这个速度够不着墙顶 → 补一把刚好能站上去的上升速度
          var need = -Math.sqrt(2 * this.GRAVITY *
            (this.feet - top + this.LEDGE_ASSIST_MARGIN));
          if (need < this.vy) {
            this.vy = need;
            this.jumpCut = true;      // 这一下是"保证送上去"的,松手也不削
            this.ledgeUsed = true;    // 一次滞空只补一次,免得贴着墙悬停
          }
        }
      }

      if (grounded && wasAir && game && game.snd) game.snd.play('land');

      // ---------- 动画 ----------
      if (!grounded) {
        this.cur = 'air';
      } else if (Math.abs(this.vx) > 40) {
        this.animT += dt * (9 + Math.abs(this.vx) / this.MAX_VX * 6);
        this.cur = this.RUN_FRAMES[Math.floor(this.animT) % this.RUN_FRAMES.length];
      } else {
        this.cur = 'idle';
      }

      // ---------- 二段跳的翻滚(最多一圈)----------
      if (this.spinT < this.SPIN_TIME) {
        this.spinT = Math.min(this.SPIN_TIME, this.spinT + dt);
      }

      // ---------- 脚步声 ----------
      if (grounded && move && Math.abs(this.vx) > 60) {
        this.stepT -= dt;
        if (this.stepT <= 0) {
          if (game && game.snd) game.snd.play('step');
          this.stepT = Math.max(0.12, 0.30 - Math.abs(this.vx) * 0.0005);
        }
      } else {
        this.stepT = 0;
      }
    }

    // ================= 绘制 =================
    draw(ctx, cam, assets) {
      var img = this.frames[this.cur];
      if (!img) return;
      var w = img.width, h = img.height;
      var sx = this.cx - cam.ox;                     // 贴图按"身体中轴"对齐
      var feet = this.feet - cam.oy;
      var angle = this.spinAngle;
      ctx.save();
      if (angle > 0) {
        // 二段跳翻滚:绕"贴图中心"转,位置才不会甩出去。
        // 朝右时在屏幕上是顺时针(往前滚),朝左反过来 —— 翻转后的图方向也一致。
        ctx.translate(sx, feet - this.FEET_ANCHOR + h / 2);
        ctx.rotate(angle * Math.PI / 180 * (this.facing > 0 ? 1 : -1));
        if (this.facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, -h / 2);
      } else {
        // 贴图底边对齐脚底:脚底在画布的 FEET_ANCHOR 那一行
        var dy = Math.round(feet) - this.FEET_ANCHOR;
        if (this.facing < 0) {
          // 左朝向:以"身体中轴"为镜像轴翻一下(canvas 里没有 pygame.transform.flip)
          ctx.translate(sx, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(img, -w / 2, dy);
        } else {
          ctx.drawImage(img, Math.round(sx - w / 2), dy);
        }
      }
      ctx.restore();
    }
  }

  // ---- 数据(改这些就能换一个角色,不用碰引擎)----
  Player.W = 20;                        // 物理碰撞盒大小
  Player.H = 36;
  Player.SPRITES = {                    // {动画名: assets.js 里的素材名}
    idle: 'player/idle',
    run0: 'player/run0',
    run1: 'player/run1',
    run2: 'player/run2',
    air: 'player/air'
  };
  Player.RUN_FRAMES = ['run0', 'run1', 'run2'];
  Player.FEET_ANCHOR = 80;              // assets.js 里 FEET_Y

  Player.JUMPS = C.JUMP_COUNT;          // 一次滞空最多跳几次(1 = 关掉二段跳)
  Player.SPIN_DEG = C.DOUBLE_JUMP_SPIN;
  Player.SPIN_TIME = C.DOUBLE_JUMP_SPIN_TIME;

  // ---- 手感参数:默认取 config,想给某个角色单独调就改这里 ----
  Player.GRAVITY = C.GRAVITY;
  Player.MAX_VX = C.MAX_VX;
  Player.AIR_MAX_VX = C.AIR_MAX_VX;
  Player.GROUND_ACCEL = C.GROUND_ACCEL;
  Player.AIR_ACCEL = C.AIR_ACCEL;
  Player.FRICTION = C.FRICTION;
  Player.JUMP_VEL = C.JUMP_VEL;
  Player.COYOTE_TIME = C.COYOTE_TIME;
  Player.JUMP_BUFFER = C.JUMP_BUFFER;
  Player.JUMP_CUT = C.JUMP_CUT;
  Player.LEDGE_ASSIST = C.LEDGE_ASSIST;
  Player.LEDGE_ASSIST_MARGIN = C.LEDGE_ASSIST_MARGIN;

  /*
   * 让上面这些"类上的数值"在实例上也能读、也能改(和 Python 的类属性一样)。
   * 读:player.MAX_VX → 拿类上的值;写:player.MAX_VX = 500 → 只改这一个实例,
   * 之后这个实例上的读写都走它自己的那份,类上的值不受影响。
   * 自检(smoke.js)里"临时把落脚容错关掉看看还上不上得去"就是靠这个。
   */
  ['W', 'H', 'SPRITES', 'RUN_FRAMES', 'FEET_ANCHOR', 'JUMPS', 'SPIN_DEG', 'SPIN_TIME',
    'GRAVITY', 'MAX_VX', 'AIR_MAX_VX', 'GROUND_ACCEL', 'AIR_ACCEL', 'FRICTION',
    'JUMP_VEL', 'COYOTE_TIME', 'JUMP_BUFFER', 'JUMP_CUT',
    'LEDGE_ASSIST', 'LEDGE_ASSIST_MARGIN'].forEach(function (name) {
      Object.defineProperty(Player.prototype, name, {
        configurable: true,
        get: function () { return Player[name]; },
        set: function (v) {
          Object.defineProperty(this, name, { value: v, writable: true, configurable: true });
        }
      });
    });

  RA.Player = Player;
})(globalThis.RA = globalThis.RA || {});
