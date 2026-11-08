/* -*- coding: utf-8 -*- */
/*
 * trial-session.js —— 独立单图试玩(不经过 GameSession/World/换层)
 * ================================================================
 * 只复用 Level/FloorInstance/Player/实体基础规则;一张图从 start 云板出生,
 * 完整身体从下上穿 finish 云板即通过;通过后冻结。
 */
(function (RA) {
  'use strict';
  var STEP = 1 / 60, TS = RA.C.TS;

  function build(handoff) {
    if (!handoff || handoff.version !== 3 || handoff.kind !== 'editor-validation' || !handoff.template) {
      return { ok: false, error: { code: 'TRIAL_HANDOFF', message: '缺少单图试玩数据;请从编辑器重新开始' } };
    }
    if (handoff.profileId !== 'standard-v1') return { ok: false, error: { code: 'TRIAL_PROFILE', message: '试玩验证必须使用 standard-v1' } };
    var t = handoff.template;
    if (t.kind !== 'normal' || !RA.CloudPipe || !RA.CloudPipe.isCloud(t.ports) || !t.ports.start || !t.ports.finish) {
      return { ok: false, error: { code: 'TRIAL_PORTS', message: '当前图不是带 start/finish 的普通云板关卡' } };
    }
    var errs = RA.LevelData.errorsOf(RA.LevelData.validate(t, { purpose: 'play' }));
    if (errs.length) return { ok: false, error: { code: errs[0].code, message: errs[0].path + ' ' + errs[0].message } };
    return { ok: true, value: {
      template: t, subjectRef: handoff.subjectRef, draftRef: handoff.draftRef,
      rules: handoff.rules, requestId: handoff.requestId, profileId: 'standard-v1',
      spawn: { col: t.ports.start.col, row: t.ports.start.row },
      finish: { col: t.ports.finish.col, row: t.ports.finish.row }
    } };
  }

  class TrialSession {
    constructor(plan) {
      this.plan = plan;
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
      this.run = { hp: 100, maxHp: 100, invulnerableRemaining: 0, haloActiveRemaining: 0, haloCooldownRemaining: 20, castId: 0 };
      this.events = [];
      this.passedAt = null;
      this._guard = 0;
    }
    setActions(a) {
      if (!a) return;
      ['left', 'right', 'jumpHeld'].forEach(function (k) { if (Object.prototype.hasOwnProperty.call(a, k)) this.actions[k] = !!a[k]; }, this);
      if (a.skillPressed) this.pressSkill();
    }
    pressSkill() {
      if (this.status !== 'running' || this.run.haloCooldownRemaining > 0) return false;
      this.run.haloActiveRemaining = 14;
      this.run.haloCooldownRemaining = 20;
      this.run.castId++;
      return true;
    }
    pause() { if (this.status === 'running') this.status = 'paused'; }
    resume() { if (this.status === 'paused') this.status = 'running'; }
    dispose() { this.status = 'disposed'; }
    _event(type, data) { this.events.push(Object.assign({ type: type, trialId: this.trialId }, data || {})); }
    drainEvents() { var e = this.events.slice(); this.events.length = 0; return e; }
    _damage(amount) {
      if (this.run.invulnerableRemaining > 0 || this.status !== 'running') return;
      this.run.hp = Math.max(0, this.run.hp - amount);
      this.run.invulnerableRemaining = 1;
      if (this.run.hp <= 0) { this.status = 'failed'; this._event('trialFailed', { reason: 'hp' }); }
    }
    _objects(dt) {
      var self = this;
      this.inst.moveObjects(dt);
      this.inst.objects.forEach(function (o) {
        if (o.type === 'fireball_static' && o.alive !== false) {
          var r = (o.params.radiusTiles || 0.5) * TS;
          var cx = self.player.x + self.player.w / 2, cy = self.player.y + self.player.h / 2;
          if (Math.abs(cx - o.rx) < r + self.player.w / 2 && Math.abs(cy - o.ry) < r + self.player.h / 2) {
            self._damage(o.params.damage || 20);
          }
        }
        if (o.type === 'spike' && o.cycle !== undefined) {
          var span = ((o.params.warningSeconds || 0.5) + (o.params.activeSeconds || 0.8) + (o.params.cooldownSeconds || 1));
          var ph = o.cycle % span;
          if (ph > (o.params.warningSeconds || 0.5) && ph < (o.params.warningSeconds || 0.5) + (o.params.activeSeconds || 0.8)) {
            if (Math.abs((self.player.x + self.player.w / 2) - o.rx) < TS / 2 + self.player.w / 2 &&
              Math.abs((self.player.y + self.player.h / 2) - o.ry) < TS / 2 + self.player.h / 2) self._damage(o.params.damage || 20);
          }
        }
      });
    }
    update(dt) {
      if (this.status !== 'running') return;
      this.time += dt;
      this.run.invulnerableRemaining = Math.max(0, this.run.invulnerableRemaining - dt);
      this.run.haloActiveRemaining = Math.max(0, this.run.haloActiveRemaining - dt);
      this.run.haloCooldownRemaining = Math.max(0, this.run.haloCooldownRemaining - dt);
      var p = this.player, prev = { x: p.x, feet: p.feet };
      p.update(STEP, { left: this.actions.left, right: this.actions.right, jump: this.actions.jumpHeld }, { snd: null });
      this._guard++;
      this._objects(dt);
      // 过线判定:严格用本图坐标,身体完整在两格开口内
      var top = this.plan.finish.row * TS;
      if (this.status === 'running' && prev.feet >= top && p.feet < top) {
        var dx = p.x - prev.x;
        var t = (prev.feet - top) / Math.max(0.0001, prev.feet - p.feet);
        var x = prev.x + dx * t;
        var left = this.plan.finish.col * TS, right = left + 2 * TS;
        if (x >= left - 0.01 && x + p.w <= right + 0.01) {
          this.status = 'passed'; this.passedAt = this.time;
          this._event('trialPassed', { mode: 'standard-v1', status: 'passed' });
          return;
        }
      }
      if (p.x < -TS * 4 || p.x > this.data.size.cols * TS + TS * 4 || p.feet > this.data.size.rows * TS + TS * 2) {
        this.status = 'failed'; this._event('trialFailed', { reason: 'outOfBounds' });
      }
    }
    snapshot() {
      return { status: this.status, time: this.time, hp: this.run.hp, maxHp: this.run.maxHp,
        haloActiveRemaining: this.run.haloActiveRemaining, haloCooldownRemaining: this.run.haloCooldownRemaining,
        player: { x: this.player.x, y: this.player.y, feet: this.player.feet, onGround: this.player.onGround },
        trialId: this.trialId };
    }
  }

  RA.TrialSession = { build: build, create: function (plan) { return new TrialSession(plan); }, TrialSession: TrialSession };
})(globalThis.RA = globalThis.RA || {});
