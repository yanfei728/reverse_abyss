/* -*- coding: utf-8 -*- */
/*
 * session.js —— 共用 GameSession(T03 的核心)
 * ============================================
 * 编辑器开发试玩与(后续)正式游戏共用这一份模拟:
 *   · 固定 1/60 秒步长,渲染帧只提供真实时间;
 *   · 输入是语义动作,不依赖具体键盘;
 *   · 暂停冻结模拟,恢复不追算后台时间;
 *   · 世界、玩家、楼层生命周期都在这里驱动,页面只负责显示和适配。
 *
 * B1 只有移动/跳跃/连续楼层/暂停;没有伤害、敌人、Boss、技能。
 */
(function (RA) {
  'use strict';

  var LD = RA.LevelData;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var MAX_FRAME = 0.25;

  function ok(value) { return { ok: true, value: value }; }
  function fail(code, message, issues) {
    return { ok: false, error: { code: code, message: message, issues: issues || [] } };
  }

  class GameSession {
    constructor(world, player, opts) {
      opts = opts || {};
      this.world = world;
      this.player = player;
      this.actions = {
        left: false, right: false, jumpHeld: false,
        skillPressed: false, interactPressed: false
      };
      this.paused = false;
      this.disposed = false;
      this.time = 0;
      this.accumulator = 0;
      this.events = [];
      this.rules = opts.rules || null;
    }

    /**
     * floors: 完整 LevelData 数组(按从下到上)。每一层都按 play 用途校验,
     * 有任何结构错误都拒绝启动,不会"带病跑"。
     */
    static create(opts) {
      opts = opts || {};
      var floors = opts.floors;
      if (!Array.isArray(floors) || !floors.length) {
        return fail('NO_FLOORS', '连续世界至少需要一层');
      }
      for (var i = 0; i < floors.length; i++) {
        var issues = LD.validate(floors[i], { purpose: 'play' });
        var errors = LD.errorsOf(issues);
        if (errors.length) {
          return fail(errors[0].code,
            '第 ' + (i + 1) + ' 层不能运行:' + errors[0].path + ' ' + errors[0].message,
            errors);
        }
      }
      var world = new RA.World(floors, { startFloor: 0 });
      var player = new RA.Player(world.currentFloor.view);
      world.attachPlayer(player);
      return ok(new GameSession(world, player, opts));
    }

    setActions(next) {
      if (!next) return;
      ['left', 'right', 'jumpHeld', 'skillPressed', 'interactPressed'].forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(next, k)) {
          this.actions[k] = !!next[k];
        }
      }, this);
    }

    get floorIndex() { return this.world.current; }
    get floorCount() { return this.world.floorCount; }

    pause() {
      if (this.paused) return false;
      this.paused = true;
      this.accumulator = 0;             // 恢复后不补算暂停期间
      this.events.push({ type: 'paused', simTime: this.time });
      return true;
    }

    resume() {
      if (!this.paused) return false;
      this.paused = false;
      this.accumulator = 0;
      this.events.push({ type: 'resumed', simTime: this.time });
      return true;
    }

    /** 真实帧时间 → 固定步;暂停/销毁时不推进 */
    update(realDt) {
      if (this.paused || this.disposed) return 0;
      var dt = Number(realDt);
      if (!isFinite(dt) || dt <= 0) dt = 0;
      dt = Math.min(dt, MAX_FRAME);
      this.accumulator += dt;
      var steps = 0;
      while (this.accumulator >= STEP && steps < MAX_STEPS && !this.paused && !this.disposed) {
        this.stepOnce();
        this.accumulator -= STEP;
        steps++;
      }
      return steps;
    }

    /** 单个固定步(自检/调试直接调用,不经过累加器) */
    stepOnce() {
      if (this.paused || this.disposed) return;
      this.time += STEP;
      this.world.simTime = this.time;
      this.world.tick(STEP);
      var prevFeet = this.player.feet;
      this.player.update(STEP, {
        left: this.actions.left,
        right: this.actions.right,
        jump: this.actions.jumpHeld
      }, { snd: null });
      this.world.afterPlayerStep(this.player, prevFeet);
      // 保险:如果将来没有底边梯板,掉出当前层时回当前层出生点
      var floor = this.world.currentFloor;
      if (floor && this.player.y > floor.bottomY + 240) {
        this.respawn();
      }
      this._syncEvents();
    }

    respawn() {
      var floor = this.world.currentFloor;
      if (!floor) return;
      this.player.x = floor.view.startX;
      this.player.y = floor.view.startFeet - this.player.h;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.onGround = false;
      this.events.push({ type: 'respawn', floor: this.world.current, simTime: this.time });
    }

    _syncEvents() {
      var evs = this.world.drainEvents();
      for (var i = 0; i < evs.length; i++) this.events.push(evs[i]);
    }

    drainEvents() {
      this._syncEvents();
      var out = this.events.slice();
      this.events.length = 0;
      return out;
    }

    snapshot() {
      var f = this.world.currentFloor;
      return {
        floorIndex: this.world.current,
        floorCount: this.world.floorCount,
        time: this.time,
        paused: this.paused,
        player: {
          x: this.player.x, y: this.player.y, feet: this.player.feet,
          vx: this.player.vx, vy: this.player.vy,
          onGround: this.player.onGround,
          jumpsUsed: this.player.jumpsUsed,
          facing: this.player.facing
        },
        floor: f ? {
          index: f.index, state: f.state,
          cols: f.cols, rows: f.rows,
          origin: { x: f.origin.x, y: f.origin.y },
          activeTime: f.activeTime
        } : null,
        live: this.world.liveStates()
      };
    }

    dispose() {
      this.disposed = true;
      this.events.length = 0;
    }
  }

  GameSession.STEP = STEP;
  GameSession.MAX_STEPS = MAX_STEPS;
  RA.GameSession = GameSession;
})(globalThis.RA = globalThis.RA || {});
