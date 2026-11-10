/* -*- coding: utf-8 -*- */
/*
 * trial-session.js —— 单图试玩(不经过 GameSession/World/换层)
 * ===========================================================
 * 试玩就是普通游玩的当前一张图:复用 Level/FloorInstance/Player/实体基础规则与
 * run-v1 初态(满血、技能开局可用),没有上下关/石管/F/休整/Boss 装配。
 * 一张图从 start 云板出生,完整身体从下上穿 finish 云板即通过;通过后冻结。
 * 启动只做只读检查(文件/网格/起终点数值),不做几何/可达性合规裁决。
 */
(function (RA) {
  'use strict';
  var STEP = 1 / 60, TS = RA.C.TS;

  function endpointIssue(t, role) {
    var p = t.ports && t.ports[role];
    if (!p || !Number.isInteger(p.col) || !Number.isInteger(p.row)) {
      return role + ' 需要整数 col/row;运行时出生/终点要用(不是几何合规判断)';
    }
    if (p.col < 0 || p.row < 0 || p.col + 2 > t.size.cols || p.row >= t.size.rows) {
      return role + ' (' + p.col + ',' + p.row + ') 在 ' + t.size.cols + '×' + t.size.rows + ' 的地图外';
    }
    return null;
  }

  /**
   * 当前图能不能启动试玩的只读检查(编辑器发起前与试玩页共用)。
   * 只拦"读不出来/跑不起来":结构、缺 start/finish、对象参数/引用。
   * 不做几何/净空/最高行/侧支撑/可达性判断 —— 那些由作者实际试玩决定。
   */
  function readableIssues(t) {
    var out = [];
    if (!t || t.kind !== 'normal') {
      out.push({ code: 'TRIAL_KIND', path: '/kind', message: '试玩只运行普通层(kind=normal)的当前一张图' });
      return out;
    }
    if (!RA.CloudPipe || !RA.CloudPipe.isCloud(t.ports)) {
      out.push({ code: 'INVALID_PORT', path: '/ports',
        message: '当前图没有云板 start/finish 端点:试玩必须从本图 start 出生、完整上穿 finish 结束' });
      return out;
    }
    ['start', 'finish'].forEach(function (role) {
      var e = endpointIssue(t, role);
      if (e) out.push({ code: 'INVALID_PORT', path: '/ports/' + role, message: e });
    });
    if (out.length) return out;
    var errs = RA.LevelData.readableIssues(t);
    errs.forEach(function (e) { out.push({ code: e.code, path: e.path, message: e.message }); });
    return out;
  }

  function build(handoff) {
    if (!handoff || handoff.version !== 3 || handoff.kind !== 'editor-validation' || !handoff.template) {
      return { ok: false, error: { code: 'TRIAL_HANDOFF', message: '缺少单图试玩数据;请从编辑器重新开始' } };
    }
    var t = handoff.template;
    var issues = readableIssues(t);
    if (issues.length) {
      return { ok: false, error: { code: issues[0].code, message: issues[0].path + ' ' + issues[0].message, issues: issues } };
    }
    var rules = RA.RULES || {};
    var profileId = rules.acceptsProfile && rules.acceptsProfile(handoff.profileId) ? handoff.profileId : 'run-v1';
    var profile = rules.profile ? rules.profile(profileId) : { hp: 100, haloActive: 0, haloCooldown: 0 };
    return { ok: true, value: {
      template: t, subjectRef: handoff.subjectRef, draftRef: handoff.draftRef,
      rules: handoff.rules, requestId: handoff.requestId, profileId: profileId, profile: profile,
      spawn: { col: t.ports.start.col, row: t.ports.start.row },
      finish: { col: t.ports.finish.col, row: t.ports.finish.row }
    } };
  }

  class TrialSession {
    constructor(plan) {
      var rules = RA.RULES || {};
      var profile = plan.profile || (rules.profile ? rules.profile(plan.profileId || 'run-v1') : {});
      this.plan = plan;
      this.profileId = plan.profileId || profile.profile || 'run-v1';
      this.trialId = 'trial_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
      this.data = JSON.parse(JSON.stringify(plan.template));
      this.inst = new RA.FloorInstance(this.data, 0, { hasNext: false });
      this.inst.origin = { x: 0, y: 0 };
      this.inst.world = null;
      this.inst.state = 'active';
      this.player = new RA.Player(this.inst.view);
      this.status = 'running';
      this.time = 0;
      this.actions = { left: false, right: false, jumpHeld: false, skillPressed: false };
      this.run = {
        hp: Number(profile.hp) || 100,
        maxHp: Number(profile.hp) || 100,
        invulnerableRemaining: 0,
        haloActiveRemaining: Number(profile.haloActive) || 0,
        haloCooldownRemaining: Number(profile.haloCooldown) || 0,
        castId: 0
      };
      this.events = [];
      this.passedAt = null;
      this.accumulator = 0;
      this._damagedThisStep = false;
      this._guard = 0;
    }
    setActions(a) {
      if (!a) return;
      ['left', 'right', 'jumpHeld'].forEach(function (k) { if (Object.prototype.hasOwnProperty.call(a, k)) this.actions[k] = !!a[k]; }, this);
      if (a.skillPressed) this.pressSkill();
    }
    pressSkill() {
      if (this.status !== 'running' || this.run.haloCooldownRemaining > 0) return false;
      var tuning = RA.RULES && RA.RULES.tuning || {};
      this.run.haloActiveRemaining = tuning.haloSeconds || 14;
      this.run.haloCooldownRemaining = tuning.haloCooldown || 20;
      this.run.castId++;
      this._event('skillCast', { castId: this.run.castId });
      return true;
    }
    pause() {
      if (this.status !== 'running') return false;
      this.status = 'paused';
      this.accumulator = 0;
      this._event('paused', {});
      return true;
    }
    resume() {
      if (this.status !== 'paused') return false;
      this.status = 'running';
      this.accumulator = 0;
      this.actions.left = this.actions.right = this.actions.jumpHeld = false;
      this._event('resumed', {});
      return true;
    }
    dispose() {
      this.status = 'disposed';
      if (this.inst && this.inst.clearArrows) this.inst.clearArrows();
    }
    _event(type, data) { this.events.push(Object.assign({ type: type, trialId: this.trialId }, data || {})); }
    drainEvents() { var e = this.events.slice(); this.events.length = 0; return e; }
    damage(amount, source) {
      if (this._damagedThisStep || this.run.invulnerableRemaining > 0 || this.status !== 'running') return false;
      amount = Math.max(0, Number(amount) || 0);
      if (!amount) return false;
      this._damagedThisStep = true;
      var tuning = RA.RULES && RA.RULES.tuning || {};
      this.run.hp = Math.max(0, this.run.hp - amount);
      this.run.invulnerableRemaining = tuning.invulnerableSeconds || 1.0;
      this._event('damaged', { amount: amount, source: source || 'object', hp: this.run.hp });
      if (this.run.hp <= 0) {
        this.status = 'failed';
        this.accumulator = 0;
        if (this.inst && this.inst.clearArrows) this.inst.clearArrows();
        this._event('trialFailed', { reason: 'hp' });
        return true;
      }
      return true;
    }
    _applyHalo() {
      if (this.run.haloActiveRemaining <= 0 || this.status !== 'running') return;
      var t = RA.RULES && RA.RULES.tuning || {};
      var radius = (t.haloRadiusTiles || 2.25) * TS;
      var cx = this.player.x + this.player.w / 2, cy = this.player.y + this.player.h / 2;
      var self = this;
      this.inst.objects.forEach(function (o) {
        if (!o.alive || !RA.MonsterRules || !RA.MonsterRules.haloDestroyable(o.type)) return;
        var dx = o.rx - (cx - self.inst.origin.x), dy = o.ry - (cy - self.inst.origin.y);
        if (dx * dx + dy * dy <= radius * radius) {
          o.alive = false;
          self._event('fireballDestroyed', { objectId: o.id, castId: self.run.castId });
        }
      });
    }
    update(dt) {
      if (this.status !== 'running') return 0;
      var raw = Number(dt);
      if (!isFinite(raw) || raw <= 0) return 0;
      raw = Math.min(0.25, raw);
      this.accumulator += raw;
      var steps = 0;
      while (this.accumulator >= STEP && steps < 5 && this.status === 'running') {
        this.stepOnce();
        this.accumulator -= STEP;
        steps++;
      }
      if (this.status !== 'running') { this.accumulator = 0; this.actions.left = this.actions.right = this.actions.jumpHeld = false; }
      return steps;
    }
    stepOnce() {
      if (this.status !== 'running') return;
      this.time += STEP;
      this._damagedThisStep = false;
      this.run.invulnerableRemaining = Math.max(0, this.run.invulnerableRemaining - STEP);
      this.run.haloActiveRemaining = Math.max(0, this.run.haloActiveRemaining - STEP);
      this.run.haloCooldownRemaining = Math.max(0, this.run.haloCooldownRemaining - STEP);
      if (this.actions.skillPressed) { this.actions.skillPressed = false; this.pressSkill(); }
      var p = this.player, prev = { x: p.x, feet: p.feet };
      p.update(STEP, { left: this.actions.left, right: this.actions.right, jump: this.actions.jumpHeld }, { snd: null });
      this.inst.updateAmbient(STEP);
      this.inst.updateActiveObjects(STEP, this);
      this._applyHalo();
      if (this.status !== 'running') return;
      var top = this.plan.finish.row * TS;
      if (prev.feet >= top && p.feet < top) {
        var dx = p.x - prev.x;
        var k = (prev.feet - top) / Math.max(0.0001, prev.feet - p.feet);
        var x = prev.x + dx * k;
        var left = this.plan.finish.col * TS, right = left + 2 * TS;
        if (x >= left - 0.01 && x + p.w <= right + 0.01) {
          this.status = 'passed'; this.passedAt = this.time;
          this.accumulator = 0;
          this.actions.left = this.actions.right = this.actions.jumpHeld = false;
          if (this.inst.clearArrows) this.inst.clearArrows();
          this._event('trialPassed', { mode: this.profileId, profileId: this.profileId, status: 'passed' });
          return;
        }
      }
      if (p.x < -TS * 4 || p.x > this.data.size.cols * TS + TS * 4 || p.feet > this.data.size.rows * TS + TS * 2) {
        this.status = 'failed';
        this.accumulator = 0;
        if (this.inst.clearArrows) this.inst.clearArrows();
        this._event('trialFailed', { reason: 'outOfBounds' });
      }
    }
    snapshot() {
      return { status: this.status, time: this.time, hp: this.run.hp, maxHp: this.run.maxHp,
        profileId: this.profileId,
        haloActiveRemaining: this.run.haloActiveRemaining, haloCooldownRemaining: this.run.haloCooldownRemaining,
        player: { x: this.player.x, y: this.player.y, feet: this.player.feet, onGround: this.player.onGround },
        trialId: this.trialId };
    }
  }

  RA.TrialSession = {
    build: build,
    readableIssues: readableIssues,
    create: function (plan) { return new TrialSession(plan); },
    TrialSession: TrialSession
  };
})(globalThis.RA = globalThis.RA || {});
