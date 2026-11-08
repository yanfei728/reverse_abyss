/* -*- coding: utf-8 -*- */
/*
 * session.js —— 共用 GameSession(B1 核心 + B2 战斗/短塔)
 * ========================================================
 * 固定 1/60 步;World/Player 复用现有物理;RunState 是唯一可变真值:
 * 生命、无敌、光环、跑图状态、Boss 与事件都在这里,页面只显示/输入。
 *
 * B2 规则:100 血、接触伤害 20、无敌 1 秒;光环 14 秒/冷却 20 秒、开局可用
 * (standard-v1 例外:开局冷却 20 秒、无光环);死亡/异常越界回大厅,重试同一塔。
 */
(function (RA) {
  'use strict';

  var LD = RA.LevelData;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var MAX_FRAME = 0.25;
  var seq = 0;

  function ok(value) { return { ok: true, value: value }; }
  function fail(code, message, issues) {
    return { ok: false, error: { code: code, message: message, issues: issues || [] } };
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

  class GameSession {
    constructor(world, player, opts) {
      opts = opts || {};
      var rules = RA.RULES || {};
      var tuning = rules.tuning || {};
      var profileName = opts.profile || 'run-v1';
      var profile = rules.profile ? rules.profile(profileName) : {
        profile: profileName, hp: 100, haloActive: 0, haloCooldown: 0,
        allowRest: true, allowSkill: true, allowCheat: false
      };
      this.world = world;
      this.player = player;
      this.mode = opts.mode || 'dev';
      this.manifest = opts.manifest || null;
      this.trialPlan = opts.trialPlan || null;
      this.trialCompleted = null;
      this.profile = profile;
      this.rules = {
        rulesVersion: rules.rulesVersion || 'b2-1',
        rulesFingerprint: rules.rulesFingerprint || 'b2-fingerprint'
      };
      this.actions = {
        left: false, right: false, jumpHeld: false,
        skillPressed: false, interactPressed: false
      };
      this.paused = false;
      this.disposed = false;
      this.time = 0;
      this.accumulator = 0;
      this.events = [];
      this.eventSeq = 0;
      this.runId = opts.runId || ('run_' + Date.now().toString(36) + '_' + (++seq));
      this.manifestId = (opts.manifest && opts.manifest.manifestId) || opts.manifestId || null;
      this.run = {
        status: 'running',                 // running / dead / won
        hp: profile.hp,
        maxHp: profile.hp || 100,
        invulnerableRemaining: 0,
        haloActiveRemaining: num(profile.haloActive, 0),
        haloCooldownRemaining: num(profile.haloCooldown, 0),
        castId: 0,
        visited: new Set(),
        claimedRest: new Set(),
        elapsed: 0
      };
      this._damagedThisStep = false;
      this.boss = null;
    }

    /** B1 兼容入口:floors 数组。B2 页面用 manifest/templates 适配后也走这里。 */
    static create(opts) {
      opts = opts || {};
      var floors = opts.floors;
      if (!Array.isArray(floors) || !floors.length) {
        return fail('NO_FLOORS', '连续世界至少需要一层');
      }
      if (opts.requireCloud) {
        for (var ci = 0; ci < floors.length; ci++) {
          var cf = floors[ci];
          var lobbyFixed = cf.kind === 'lobby' && !cf.ports && cf.extensions && cf.extensions.fixedScene;
          if (!lobbyFixed && !(RA.CloudPipe && RA.CloudPipe.isCloud(cf.ports))) {
            return fail('LEGACY_PORT', '第 ' + (ci + 1) + ' 层不是 cloud-pipe-v2;新短塔不接受旧 vertical-v1 接口');
          }
        }
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
      var s = new GameSession(world, player, opts);
      world.instances.forEach(function (inst) { inst.instanceId = inst.index + ':' + inst.data.id; });
      return ok(s);
    }

    setActions(next) {
      if (!next) return;
      ['left', 'right', 'jumpHeld'].forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(next, k)) this.actions[k] = !!next[k];
      }, this);
      // 技能/交互是边沿:页面按一次真,固定步只消费一次
      if (next.skillPressed) this.actions.skillPressed = true;
      if (next.interactPressed) this.actions.interactPressed = true;
    }

    /** 大厅固定入口提示:靠近作者出生锚点才显示;F 一次进入第1层 */
    interactionPrompt() {
      if (!this.world || this.world.current !== 0 || this.run.status !== 'running') return null;
      var f = this.world.currentFloor;
      if (!f || !f.fixedLobby) return null;
      var fs = f.data.extensions && f.data.extensions.fixedScene;
      var p = fs && fs.playerSpawn;
      if (!p) return null;
      var cx = f.origin.x + p.centerCol * RA.C.TS;
      var cy = f.origin.y + (p.feetRow - 0.5) * RA.C.TS;
      var dx = (this.player.x + this.player.w / 2) - cx;
      var dy = (this.player.feet - cy);
      if (Math.abs(dx) > RA.C.TS * 1.5 || Math.abs(dy) > RA.C.TS * 1.5) return null;
      return { kind: 'start-tower', text: '按 F 开始挑战', action: 'interact' };
    }

    pressSkill() { this.actions.skillPressed = true; }
    pressInteract() { this.actions.interactPressed = true; }

    get floorIndex() { return this.world.current; }
    get floorCount() { return this.world.floorCount; }
    get status() { return this.run.status; }
    get hp() { return this.run.hp; }

    pause() {
      if (this.paused) return false;
      this.paused = true;
      this.accumulator = 0;
      this._event('paused', {});
      return true;
    }

    resume() {
      if (!this.paused) return false;
      this.paused = false;
      this.accumulator = 0;
      this._event('resumed', {});
      return true;
    }

    update(realDt) {
      if (this.paused || this.disposed || this.run.status !== 'running') return 0;
      var dt = Number(realDt);
      if (!isFinite(dt) || dt <= 0) dt = 0;
      dt = Math.min(dt, MAX_FRAME);
      this.accumulator += dt;
      var steps = 0;
      while (this.accumulator >= STEP && steps < MAX_STEPS &&
        !this.paused && !this.disposed && this.run.status === 'running') {
        this.stepOnce();
        this.accumulator -= STEP;
        steps++;
      }
      return steps;
    }

    stepOnce() {
      if (this.paused || this.disposed || this.run.status !== 'running') return;
      if (this.actions.interactPressed && this.interactionPrompt()) {
        this.actions.interactPressed = false;
        var tr = this.world.enterFirstFloor(this.player);
        if (tr.ok) {
          this.events.push(tr.value);
          this._event('towerStarted', { floor: 1 });
        }
      }
      this.time += STEP;
      this.run.elapsed += STEP;
      this._damagedThisStep = false;
      var run = this.run;
      run.invulnerableRemaining = Math.max(0, run.invulnerableRemaining - STEP);
      run.haloActiveRemaining = Math.max(0, run.haloActiveRemaining - STEP);
      run.haloCooldownRemaining = Math.max(0, run.haloCooldownRemaining - STEP);

      var skillPressed = this.actions.skillPressed;
      var interactPressed = this.actions.interactPressed;
      this.actions.skillPressed = false;
      this.actions.interactPressed = false;
      if (skillPressed) this.castSkill();
      if (interactPressed) this.interact();

      var activeFloor = this.world.currentFloor;
      if (activeFloor && this._outOfBounds(activeFloor)) { this.die('outOfBounds'); this._event('outOfBounds', { floor: this.world.current }); this._syncEvents(); return; }
      this.world.simTime = this.time;
      this.world.tick(STEP);
      var prevFeet = this.player.feet;
      this.player.update(STEP, {
        left: this.actions.left,
        right: this.actions.right,
        jump: this.actions.jumpHeld
      }, { snd: null });
      var entered = this.world.afterPlayerStep(this.player, prevFeet);
      if (entered) this._onFloorEntered(entered);

      var active = this.world.currentFloor;
      if (active) active.updateActiveObjects(STEP, this);
      if (this.boss && this.run.status === 'running') this.boss.update(STEP, this);

      this._applyHalo();

      // 异常越界:不再本层无伤重生,按用户确认判死亡回大厅
      if (this.run.status === 'running' && active) {
        if (this.player.y > active.bottomY + 60 ||
          this.player.x < active.origin.x - 4 * RA.C.TS ||
          this.player.x > active.origin.x + active.cols * RA.C.TS + 4 * RA.C.TS) {
          this.die('outOfBounds');
          this._event('outOfBounds', { floor: this.world.current });
        }
      }
      this._syncEvents();
    }

    _onFloorEntered(ev) {
      var floor = this.world.currentFloor;
      if (!floor) return;
      this.run.visited.add(floor.instanceId);
      this._event('floorEntered', { from: ev.from, to: ev.to });
      if (floor.data.kind === 'rest' && this.profile.allowRest !== false &&
        !this.run.claimedRest.has(floor.instanceId)) {
        this.run.claimedRest.add(floor.instanceId);
        var before = this.run.hp;
        this.run.hp = Math.min(this.run.maxHp, this.run.hp + ((RA.RULES && RA.RULES.tuning.restHeal) || 40));
        this._event('restHealed', { floor: this.world.current, amount: this.run.hp - before });
      }
      if (floor.data.kind === 'boss' && !this.boss) {
        floor.exitOpen = false;
        this.boss = new RA.Boss(floor);
        this._event('bossEntered', { floor: this.world.current });
      }
    }

    castSkill() {
      if (this.run.status !== 'running') return false;
      if (this.profile.allowSkill === false) return false;
      if (this.run.haloActiveRemaining > 0 || this.run.haloCooldownRemaining > 0) return false;
      var t = (RA.RULES && RA.RULES.tuning) || {};
      this.run.castId++;
      this.run.haloActiveRemaining = t.haloSeconds || 14;
      this.run.haloCooldownRemaining = t.haloCooldown || 20;
      this._event('skillCast', { castId: this.run.castId });
      return true;
    }

    interact() {
      // 首版没有可交互物;保留动作边界,不再造隐藏行为
      this._event('interact', {});
    }

    _applyHalo() {
      var run = this.run;
      if (run.haloActiveRemaining <= 0 || run.status !== 'running') return;
      var t = (RA.RULES && RA.RULES.tuning) || {};
      var radius = (t.haloRadiusTiles || 1.5) * RA.C.TS;
      var cx = this.player.x + this.player.w / 2;
      var cy = this.player.y + this.player.h / 2;
      var floor = this.world.currentFloor;
      if (!floor) return;
      // 只杀活动层的火球;preview 层不可能在 currentFloor
      floor.objects.forEach(function (o) {
        if (!o.alive || o.type !== 'fireball_static') return;
        var dx = o.rx - (cx - floor.origin.x);
        var dy = o.ry - (cy - floor.origin.y);
        if (dx * dx + dy * dy <= radius * radius) {
          o.alive = false;
          this._event('fireballDestroyed', { objectId: o.id, castId: run.castId });
        }
      }, this);
      // Boss:命中消耗本次光环,不重置冷却;一次 castId 只掉一阶段
      if (this.boss && !this.boss.defeated) {
        var b = this.boss.box();
        var near = cx < b.x + b.w + radius && cx + 0 > b.x - radius &&
          cy < b.y + b.h + radius && cy + 0 > b.y - radius;
        if (near && this.boss.hitByHalo(this, run.castId)) {
          run.haloActiveRemaining = 0;
          this._event('haloHitBoss', { castId: run.castId, phase: this.boss.phase });
        }
      }
    }

    _outOfBounds(floor) {
      var margin = 4 * RA.C.TS;
      return this.player.y > floor.bottomY + 60 ||
        this.player.x < floor.origin.x - margin ||
        this.player.x > floor.origin.x + floor.cols * RA.C.TS + margin;
    }

    damage(amount, source) {
      if (this.run.status !== 'running') return false;
      if (this.run.invulnerableRemaining > 0 || this._damagedThisStep) return false;
      amount = Math.max(0, Number(amount) || 0);
      if (!amount) return false;
      this._damagedThisStep = true;
      this.run.invulnerableRemaining = (RA.RULES && RA.RULES.tuning.invulnerableSeconds) || 1;
      this.run.hp -= amount;
      this._event('playerDamaged', { amount: amount, source: source || '', hp: Math.max(0, this.run.hp) });
      if (this.run.hp <= 0) this.die('hp');
      return true;
    }

    die(reason) {
      if (this.run.status !== 'running') return false;
      this.run.hp = Math.max(0, this.run.hp);
      this.run.status = 'dead';
      this.accumulator = 0;
      this._event('dead', { reason: reason || 'hp', floor: this.world.current });
      return true;
    }

    win(reason) {
      if (this.run.status !== 'running') return false;
      this.run.status = 'won';
      this.accumulator = 0;
      this._event('won', { reason: reason || 'bossDefeated' });
      return true;
    }

    _event(type, data) {
      this.eventSeq++;
      this.events.push(Object.assign({
        type: type, runId: this.runId, sequence: this.eventSeq, simTime: this.time
      }, data || {}));
    }

    _syncEvents() {
      var evs = this.world.drainEvents();
      for (var i = 0; i < evs.length; i++) {
        if (evs[i].type === 'floorEntered') continue;  // session 已转成带 runId 的事件
        this.events.push(Object.assign({
          runId: this.runId, sequence: ++this.eventSeq, simTime: this.time
        }, evs[i]));
      }
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
        runId: this.runId,
        mode: this.mode,
        manifestId: this.manifestId,
        status: this.run.status,
        hp: this.run.hp,
        maxHp: this.run.maxHp,
        invulnerableRemaining: this.run.invulnerableRemaining,
        haloActiveRemaining: this.run.haloActiveRemaining,
        haloCooldownRemaining: this.run.haloCooldownRemaining,
        castId: this.run.castId,
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
          index: f.index, state: f.state, kind: f.data.kind || 'normal',
          cols: f.cols, rows: f.rows,
          origin: { x: f.origin.x, y: f.origin.y },
          activeTime: f.activeTime, exitOpen: f.exitOpen !== false
        } : null,
        boss: this.boss ? this.boss.snapshot() : null,
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
