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
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  var FLOOR_HEAL_AMOUNTS = [0, 20, 40, 60, 100];
  /** 36:正式换层额外回血只接受五档;其它值按 0(显示/设置在页面侧负责提示) */
  function sanFloorHeal(v) {
    var n = Number(v);
    return FLOOR_HEAL_AMOUNTS.indexOf(n) >= 0 ? n : 0;
  }

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
      // 36:正式换层额外回血(只五档,默认0).只影响 full40-formal;Trial 不读这项.
      this.floorHealAmount = sanFloorHeal(opts.floorHealAmount);
      this.run = {
        status: 'running',                 // running / dead / won
        hp: profile.hp,
        maxHp: profile.hp || 100,
        invulnerableRemaining: 0,
        haloActiveRemaining: num(profile.haloActive, 0),
        haloCooldownRemaining: num(profile.haloCooldown, 0),
        castId: 0,
        visited: new Set(),
        // 37:10/30 各一次三选一(choice id 或 null),本局唯一真值
        restChoices: {},
        floorHealGranted: new Set(),       // 36:已结算过额外回血的真实槽号(0 也记录)
        defeatedBosses: new Set(),
        elapsed: 0
      };
      this._damagedThisStep = false;
      this.boss = null;
      // 37:固定休息小屋是同一 Session/Player 的独立静态场景,不是第四层/World/Trial。
      // 模板由页面从 FULL40.restHouse 显式注入;核心不读外部路径/DOM,试玩不读。
      this.restHouseTemplate = opts.restHouseTemplate || null;
      this.sceneKind = 'tower';
      this.restHouse = null;
      this.houseOwner = null;
      /*
       * 30:只有正式完整塔计分(现有正式身份 mode:'full40-formal',由 short.startFormal 传入)。
       * 不能用“有 run-v1”判断 —— 试玩也用 run-v1。试玩/开发短塔的 score 保持 null,
       * 不创建计分状态、不发 scoreChanged、不写最高分。
       */
      var formalModes = (RA.C.SCORE && RA.C.SCORE.formalModes) ||
        [(RA.C.SCORE && RA.C.SCORE.formalMode) || 'full40-formal'];
      this.formal = formalModes.indexOf(this.mode) >= 0;
      this.score = this.formal ? 0 : null;
      this._scoredFloors = new Set();
      this._scoredEnemies = new Set();
      this._scoredCoins = new Set();
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
        // 正式加载只保留"能不能读/能不能装配"的检查;几何/净空/可达性不再否决人工通过
        var issues = LD.readableIssues ? LD.readableIssues(floors[i]) : LD.errorsOf(LD.validate(floors[i], { purpose: 'load' }));
        if (issues.length) {
          return fail(issues[0].code,
            '第 ' + (i + 1) + ' 层不能运行:' + issues[0].path + ' ' + issues[0].message,
            issues);
        }
      }
      var world = new RA.World(floors, { startFloor: 0 });
      var player = new RA.Player(world.currentFloor.view);
      world.attachPlayer(player);
      var s = new GameSession(world, player, opts);
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

    /** 大厅 F 提示 + 20 层 Boss 击败后的 F 传送提示;其他层没有可交互物 */
    interactionPrompt() {
      if (!this.world || this.run.status !== 'running') return null;
      if (this.sceneKind === 'rest-house') {
        return this.restHouse ? this.restHouse.prompt(this.player) : null;
      }
      var f = this.world.currentFloor;
      if (!f) return null;
      if (this.world.current === 0) {
        if (!f.fixedLobby) return null;
        var fs = f.data.extensions && f.data.extensions.fixedScene;
        var p = fs && fs.playerSpawn;
        if (!p) return null;
        var cx = f.origin.x + p.centerCol * RA.C.TS;
        var cy = f.origin.y + (p.feetRow - 0.5) * RA.C.TS;
        var dx = (this.player.x + this.player.w / 2) - cx;
        var dy = (this.player.feet - cy);
        if (Math.abs(dx) > RA.C.TS * 1.5 || Math.abs(dy) > RA.C.TS * 1.5) return null;
        return { kind: 'start-tower', text: '按 F 开始挑战', action: 'transfer' };
      }
      if (f.data.kind === 'boss' && this.world.exitActionAt(this.world.current) === 'boss-transfer') {
        if (this.boss && this.boss.floor === f && this.boss.defeated) {
          return { kind: 'boss-transfer', text: '按 F 进入21层', action: 'transfer' };
        }
      }
      // 37:只有真实10/30休息槽 + 固定入口元数据才提示进屋
      if (f.data.kind === 'rest' && (this.world.current === 10 || this.world.current === 30)) {
        var fs = f.data.extensions && f.data.extensions.fixedScene;
        var he = fs && fs.houseEntrance;
        if (he && he.region && this._overlapsWorldRect(f, he.region)) {
          return { kind: 'enter-rest-house', text: '按 F 进入休息小屋', action: 'enter-rest-house' };
        }
      }
      return null;
    }

    /** 37:玩家身体是否与世界坐标的区域(层内列/行)重叠 */
    _overlapsWorldRect(floor, region) {
      var t = RA.C.TS;
      var x = floor.origin.x + region.col * t;
      var y = floor.origin.y + region.row * t;
      var p = this.player;
      return p.x < x + region.cols * t && p.x + p.w > x &&
        p.y < y + region.rows * t && p.y + p.h > y;
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
      /*
       * 37:一个 F 边沿只分派一次动作(传送/进屋/出屋/领奖),消费后本步不再重复。
       * 进屋与出屋都改活动场景,不能在进屋同一步继续用新门位置再判一次出屋。
       */
      if (this.actions.interactPressed) {
        this.actions.interactPressed = false;
        this._dispatchInteract();
        if (this.paused || this.disposed || this.run.status !== 'running') return;
      }
      this.time += STEP;
      this.run.elapsed += STEP;
      this._damagedThisStep = false;
      var run = this.run;
      run.invulnerableRemaining = Math.max(0, run.invulnerableRemaining - STEP);
      run.haloActiveRemaining = Math.max(0, run.haloActiveRemaining - STEP);
      run.haloCooldownRemaining = Math.max(0, run.haloCooldownRemaining - STEP);

      var skillPressed = this.actions.skillPressed;
      this.actions.skillPressed = false;
      if (skillPressed) this.castSkill();

      // 37:小屋内只用局部静态 Level 跑 Player/技能/计时;外部塔 World 完全暂停
      if (this.sceneKind === 'rest-house') {
        this._stepRestHouse();
        this._syncEvents();
        return;
      }

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
      if (this.run.status !== 'running') { this._syncEvents(); return; }

      var active = this.world.currentFloor;
      if (active) active.updateActiveObjects(STEP, this);
      if (this.boss && this.run.status === 'running' && active && active.data.kind === 'boss') {
        this.boss.update(STEP, this);
      }

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

    // ---------------- 37:固定场景交互 / 休息小屋 ----------------
    _dispatchInteract() {
      if (this.sceneKind === 'rest-house') {
        var hp = this.restHouse ? this.restHouse.prompt(this.player) : null;
        if (!hp) return false;
        if (hp.action === 'leave-rest-house') return this.leaveRestHouse().ok;
        if (hp.action === 'choose-rest-reward') return this.chooseRestReward(hp.choice).ok;
        return false;
      }
      var prompt = this.interactionPrompt();
      if (!prompt) return false;
      if (prompt.action === 'transfer') {
        var tr = this.world.transferNext(this.player);
        if (!tr.ok) return false;
        this._transferEntry = true;
        this._onFloorEntered(tr.value);
        this._transferEntry = false;
        this._event(prompt.kind === 'start-tower' ? 'towerStarted' : 'bossTransfer', { floor: this.world.current });
        this.transferredThisStep = true;
        return true;
      }
      if (prompt.action === 'enter-rest-house') return this.enterRestHouse().ok;
      return false;
    }

    /** 37:进入10/30休息小屋;成功前不移动玩家/不改run */
    enterRestHouse() {
      if (this.run.status !== 'running') return fail('NOT_RUNNING', '当前不能进入休息小屋');
      if (this.sceneKind !== 'tower') return fail('NOT_TOWER', '已经在休息小屋里');
      if (!this.formal) return fail('NOT_FORMAL', '只有正式完整塔能进入休息小屋');
      if (!this.restHouseTemplate) return fail('NO_TEMPLATE', '本局没有固定休息小屋模板');
      var slot = this.world.current;
      if (slot !== 10 && slot !== 30) return fail('NOT_REST_SLOT', '只有第10/30层休息区能进入小屋');
      var floor = this.world.currentFloor;
      if (!floor || floor.data.kind !== 'rest') return fail('NOT_REST', '当前不是休息区');
      var fs = floor.data.extensions && floor.data.extensions.fixedScene;
      var he = fs && fs.houseEntrance;
      if (!he || !he.region || !he.returnPose) return fail('NO_ENTRANCE', '休息区缺少小屋入口元数据');
      if (!this._overlapsWorldRect(floor, he.region)) return fail('NOT_AT_DOOR', '角色没有站在小屋门口');
      var used = !!this.run.restChoices[String(slot)];
      var created = RA.RestHouseScene.create(this.restHouseTemplate, {
        ownerFloorSlot: slot, ownerInstanceId: floor.instanceId, used: used
      });
      if (!created.ok) return created;
      this.restHouse = created.value;
      this.sceneKind = 'rest-house';
      this.houseOwner = { slot: slot, instanceId: floor.instanceId, returnPose: clone(he.returnPose) };
      var p = this.player;
      p.level = this.restHouse.level;
      p.x = this.restHouse.startPose.x;
      p.y = this.restHouse.startPose.feet - p.h;
      p.vx = 0; p.vy = 0; p.onGround = false;
      p.coyote = 0; p.jumpBuffer = 0; p.jumpsUsed = 0; p.prevJump = false; p.jumpCut = false;
      p.spinT = p.SPIN_TIME; p.ledgeUsed = false;
      this._event('sceneChanged', { from: 'tower', to: 'rest-house', ownerFloorSlot: slot });
      return ok({ sceneKind: this.sceneKind, ownerFloorSlot: slot });
    }

    /** 37:离开小屋回到休息区门口;不算换层/不加分/不回血 */
    leaveRestHouse() {
      if (this.sceneKind !== 'rest-house' || !this.restHouse || !this.houseOwner) {
        return fail('NOT_IN_HOUSE', '当前不在休息小屋里');
      }
      if (this.run.status !== 'running') return fail('NOT_RUNNING', '当前不能离开休息小屋');
      var owner = this.houseOwner;
      var floor = this.world.currentFloor;
      if (this.world.current !== owner.slot || !floor || floor.instanceId !== owner.instanceId) {
        return fail('OWNER_CHANGED', '休息区已变化,不能恢复原门位置');
      }
      this.restHouse.dispose();
      this.restHouse = null;
      this.sceneKind = 'tower';
      this.houseOwner = null;
      var p = this.player;
      p.level = floor.view;
      p.x = floor.origin.x + owner.returnPose.centerCol * RA.C.TS - p.w / 2;
      p.y = floor.origin.y + owner.returnPose.feetRow * RA.C.TS - p.h;
      p.vx = 0; p.vy = 0; p.onGround = false;
      p.coyote = 0; p.jumpBuffer = 0; p.jumpsUsed = 0; p.prevJump = false; p.jumpCut = false;
      p.spinT = p.SPIN_TIME; p.ledgeUsed = false;
      this._event('sceneChanged', { from: 'rest-house', to: 'tower', ownerFloorSlot: owner.slot });
      return ok({ sceneKind: this.sceneKind, ownerFloorSlot: owner.slot });
    }

    /** 37:领取三选一;同一事务写 choice 与 hp/maxHp,并隐藏本轮全部道具 */
    chooseRestReward(choiceId) {
      if (this.sceneKind !== 'rest-house' || !this.restHouse || !this.houseOwner) {
        return fail('NOT_IN_HOUSE', '只有在小屋里才能领取奖励');
      }
      if (this.run.status !== 'running') return fail('NOT_RUNNING', '当前不能领取奖励');
      var slot = this.houseOwner.slot;
      var key = String(slot);
      if (this.run.restChoices[key]) return fail('ALREADY_CHOSEN', '本层休息奖励已经领取');
      if (this.restHouse.used) return fail('ALREADY_CHOSEN', '本轮道具已使用');
      var at = this.restHouse.choiceAt(this.player);
      if (!at || at.id !== choiceId) return fail('NOT_AT_REWARD', '角色没有站在这件道具前');
      var r = RA.RestHouseScene.REWARDS[choiceId];
      if (!r) return fail('UNKNOWN_REWARD', '未知奖励 ' + choiceId);
      var oldHp = this.run.hp, oldMax = this.run.maxHp;
      var newMax = oldMax + r.maxDelta;
      var newHp = Math.min(newMax, oldHp + r.heal + r.maxDelta);
      this.run.maxHp = newMax;
      this.run.hp = newHp;
      this.run.restChoices[key] = choiceId;
      this.restHouse.used = true;
      this._event('restRewardChosen', {
        floor: slot, choice: choiceId, maxDelta: newMax - oldMax, hpDelta: newHp - oldHp,
        hp: newHp, maxHp: newMax
      });
      return ok({ choice: choiceId, hp: newHp, maxHp: newMax });
    }

    /** 37:调试跳层/死亡/退出时丢弃场景(不恢复门位置,不刷新奖励) */
    closeRestHouse() {
      if (this.restHouse) this.restHouse.dispose();
      this.restHouse = null;
      this.sceneKind = 'tower';
      this.houseOwner = null;
    }

    _stepRestHouse() {
      var scene = this.restHouse;
      if (!scene) { this.closeRestHouse(); return; }
      var prev = { x: this.player.x, feet: this.player.feet };
      this.player.update(STEP, {
        left: this.actions.left, right: this.actions.right, jump: this.actions.jumpHeld
      }, { snd: null });
      var t = RA.C.TS;
      if (this.player.y > scene.rows * t + 60 ||
        this.player.x < -4 * t || this.player.x > scene.cols * t + 4 * t) {
        this.die('outOfBounds');
        this._event('outOfBounds', { floor: this.houseOwner ? this.houseOwner.slot : this.world.current, scene: 'rest-house' });
      }
    }

    _onFloorEntered(ev) {
      var floor = this.world.currentFloor;
      if (!floor) return;
      this.run.visited.add(floor.instanceId);
      // 39:显式标记 F 传送(0→1/20→21),页面据此直接切组而不播放管道换组动画
      this._event('floorEntered', { from: ev.from, to: ev.to, transfer: !!(ev.transfer || this._transferEntry) });
      // 30:首次进入真实层号 1…40 各 +20(含 10/30 休息、20/40 Boss、F 传送;0 出生不加)。
      // 去重按本局槽号,重复的 floorEntered/调试跳层不会重复加分。
      this._awardFloorOnce();
      // 36:正式局真实换层时额外回血一次(0→1/管道/休息/Boss/20→21 F 都算;0 也记录已入槽)。
      // 只在 running 且确属当前新槽时结算;休息层原 40 另算并叠加;cap=maxHp;死亡不复活。
      this._grantFloorHealOnce();
      if (this._completionReached()) { this.win('enterFloor'); return; }
      if (floor.data.kind === 'boss') {
        floor.exitOpen = false;
        // 20 与 40 都用同一 Boss 模板,但必须是独立实例;离开后不再复用旧状态
        if (!this.boss || this.boss.floor !== floor) {
          this.boss = new RA.Boss(floor);
          this.run.defeatedBosses = this.run.defeatedBosses || new Set();
          this._event('bossEntered', { floor: this.world.current, instanceId: floor.instanceId });
        }
      } else if (this.boss) {
        // 离开 Boss 层:旧 Boss 不再 update/被光环命中;进 40 会创建全新实例
        this.boss = null;
      }
    }

    /** 41:简单模式完成条件由 manifest.completion 明确指定(进入20层)。 */
    _completionReached() {
      var c = this.manifest && this.manifest.completion;
      return !!(c && c.type === 'enter-floor' && this.world.current === Number(c.floorNumber) &&
        this.run.status === 'running');
    }

    // ---------------- 30:正式塔计分(唯一真值) ----------------
    /** 一个最小的集中入口:只在正式局、running 状态加分,并发 scoreChanged 给 UI 读 */
    _award(delta, reason, extra) {
      if (!this.formal || this.run.status !== 'running') return false;
      var n = Math.max(0, Math.round(Number(delta) || 0));
      if (!n) return false;
      this.score = (this.score || 0) + n;
      this._event('scoreChanged', Object.assign({
        score: this.score, delta: n, reason: reason
      }, extra || {}));
      return true;
    }

    /** 首次进入真实层号 1…40:按本局槽号去重;0 层出生不加,40 胜利不重复 */
    _awardFloorOnce() {
      if (!this.formal || this.run.status !== 'running') return false;
      var n = this.world.current;
      if (!(n >= 1 && n <= 40)) return false;
      var key = String(n);
      if (this._scoredFloors.has(key)) return false;
      this._scoredFloors.add(key);
      return this._award((RA.C.SCORE && RA.C.SCORE.floorEnter) || 20, 'floor', { floor: n });
    }

    /**
     * 36:正式换层的额外回血。每次真实进入新槽只结算一次(0 也记录已入槽,避免改设置后补发);
     * 只加血、cap 到 maxHp,不碰无敌/技能/CD;设置值在进入时读取,所以修改只影响下一次换层。
     */
    _grantFloorHealOnce() {
      if (!this.formal || this.run.status !== 'running') return false;
      var n = this.world.current;
      if (!(n >= 1 && n <= 40)) return false;
      var key = String(n);
      if (this.run.floorHealGranted.has(key)) return false;
      this.run.floorHealGranted.add(key);
      var amount = sanFloorHeal(this.floorHealAmount);
      if (!amount) return false;
      var before = this.run.hp;
      this.run.hp = Math.min(this.run.maxHp, this.run.hp + amount);
      var gained = this.run.hp - before;
      if (gained > 0) this._event('floorHealed', { floor: n, requested: amount, amount: gained });
      return gained > 0;
    }

    /** 36:暂停/首页设置改额外回血;只接受五档,返回当前有效值(非法值不改) */
    setFloorHealAmount(v) {
      var n = Number(v);
      if (FLOOR_HEAL_AMOUNTS.indexOf(n) < 0) return this.floorHealAmount;
      this.floorHealAmount = n;
      return this.floorHealAmount;
    }

    /** 敌对单位真的被击败:按本局 instanceId + objectId 去重;机械/池/箭/弹幕不在此列 */
    _awardEnemyKill(floor, objectId, type) {
      if (!this.formal || this.run.status !== 'running') return false;
      if (!floor || !objectId) return false;
      var key = floor.instanceId + '|' + objectId;
      if (this._scoredEnemies.has(key)) return false;
      this._scoredEnemies.add(key);
      return this._award((RA.C.SCORE && RA.C.SCORE.enemyDefeat) || 5, 'enemy',
        { instanceId: floor.instanceId, sourceId: objectId, enemyType: type || '' });
    }

    /** 金币被玩家身体拾取(由 FloorInstance 的成功状态变化调用;试玩没有这个方法) */
    onCoinCollected(o) {
      if (!this.formal || this.run.status !== 'running') return false;
      var floor = this.world.currentFloor;
      if (!floor || !o) return false;
      var key = floor.instanceId + '|' + o.id;
      if (this._scoredCoins.has(key)) return false;
      this._scoredCoins.add(key);
      return this._award((RA.C.SCORE && RA.C.SCORE.coin) || 10, 'coin',
        { instanceId: floor.instanceId, sourceId: o.id });
    }

    /** Boss 击败回报:按槽位决定 20 只停攻给 F、40 才胜利 */
    onBossDefeated(boss) {
      var floor = this.world.currentFloor;
      if (!floor || !boss || boss.floor !== floor) return false;
      this.run.defeatedBosses = this.run.defeatedBosses || new Set();
      if (this.run.defeatedBosses.has(floor.instanceId)) return false;
      this.run.defeatedBosses.add(floor.instanceId);
      floor.exitOpen = true;
      // 30:Boss 整只最终击败一次 +5;先入账,再决定 F 传送或胜利(阶段切换不加分)
      this._awardEnemyKill(floor, 'boss', 'boss');
      this._event('bossDefeated', { floor: this.world.current, instanceId: floor.instanceId });
      if (this.world.exitActionAt(this.world.current) === 'victory') {
        this.win('bossDefeated');
        return true;
      }
      this._event('bossCleared', { floor: this.world.current, next: 'boss-transfer' });
      return true;
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
      var radius = (t.haloRadiusTiles || 2.25) * RA.C.TS;
      var cx = this.player.x + this.player.w / 2;
      var cy = this.player.y + this.player.h / 2;
      var floor = this.world.currentFloor;
      if (!floor) return;
      // 只杀活动层的可消灭怪物(静止/移动火球);机械类不消灭
      floor.objects.forEach(function (o) {
        if (!o.alive || !RA.MonsterRules || !RA.MonsterRules.haloDestroyable(o.type)) return;
        var dx = o.rx - (cx - floor.origin.x);
        var dy = o.ry - (cy - floor.origin.y);
        if (dx * dx + dy * dy <= radius * radius) {
          o.alive = false;
          // 30:真正的活体→死亡状态变化处加击杀分;持续光环/重复帧不会重复加
          this._awardEnemyKill(floor, o.id, o.type);
          this._event('fireballDestroyed', { objectId: o.id, castId: run.castId, enemyType: o.type });
        }
      }, this);
      // Boss:命中消耗本次光环,不重置冷却;一次 castId 只掉一阶段
      if (this.boss && this.boss.floor === floor && !this.boss.defeated) {
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
      this.closeRestHouse();
      if (this.world && this.world.clearArrows) this.world.clearArrows();
      this._event('dead', { reason: reason || 'hp', floor: this.world.current });
      return true;
    }

    win(reason) {
      if (this.run.status !== 'running') return false;
      this.run.status = 'won';
      this.accumulator = 0;
      this.closeRestHouse();
      if (this.world && this.world.clearArrows) this.world.clearArrows();
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
        score: this.formal ? this.score : null,
        floorIndex: this.world.current,
        floorCount: this.world.floorCount,
        floorNumber: this.world.current,
        exitAction: this.world.exitActionAt(this.world.current),
        bossDefeated: !!(this.boss && this.boss.defeated),
        time: this.time,
        paused: this.paused,
        sceneKind: this.sceneKind,
        ownerFloorSlot: this.houseOwner ? this.houseOwner.slot : null,
        restChoices: clone(this.run.restChoices || {}),
        activeScene: this.activeSceneView ? {
          kind: this.sceneKind,
          cols: this.activeSceneView().cols, rows: this.activeSceneView().rows,
          backgroundId: this.activeSceneView().backgroundId || null
        } : null,
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
          activeTime: f.activeTime, exitOpen: f.exitOpen !== false,
          easyFinish: !!(f.data.extensions && f.data.extensions.fixedScene && f.data.extensions.fixedScene.role === 'easy-finish')
        } : null,
        boss: this.boss ? this.boss.snapshot() : null,
        live: this.world.liveStates()
      };
    }

    /** 37:正式渲染/相机只读活动场景,不猜 world.currentFloor */
    activeSceneView() {
      if (this.sceneKind === 'rest-house' && this.restHouse) {
        return {
          kind: 'rest-house', level: this.restHouse.level, cols: this.restHouse.cols,
          rows: this.restHouse.rows, origin: { x: 0, y: 0 },
          backgroundId: this.restHouse.backgroundId, slot: this.houseOwner ? this.houseOwner.slot : null
        };
      }
      var f = this.world.currentFloor;
      return {
        kind: 'tower', level: f ? f.level : null, cols: f ? f.cols : 0,
        rows: f ? f.rows : 0, origin: f ? f.origin : { x: 0, y: 0 },
        backgroundId: f && f.data.visuals ? f.data.visuals.backgroundId : null, floor: f
      };
    }

    dispose() {
      this.disposed = true;
      this.events.length = 0;
      this.closeRestHouse();
      if (this.world && this.world.clearArrows) this.world.clearArrows();
    }
  }

  GameSession.STEP = STEP;
  GameSession.MAX_STEPS = MAX_STEPS;
  RA.GameSession = GameSession;
})(globalThis.RA = globalThis.RA || {});
