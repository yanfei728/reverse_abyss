/* -*- coding: utf-8 -*- */
/*
 * boss.js —— 两阶段短塔 Boss(B2)
 * ================================
 * shielded → exposed → resolving → 下一阶段 shielded / defeated。
 * 护盾阶段按轮换放三种有预警的攻击;进入 exposed 时停攻、清掉全部伤害物,
 * 并一直保持到被光环命中。一次 castId 最多打掉一个阶段;命中消耗光环,
 * 但不会重置 20 秒冷却。
 */
(function (RA) {
  'use strict';
  var C = RA.C;
  var TS = C.TS;

  class Boss {
    constructor(floor, opts) {
      opts = opts || {};
      var tuning = (RA.RULES && RA.RULES.tuning) || {};
      this.floor = floor;
      this.phase = 1;
      this.state = 'shielded';
      this.shieldRemaining = tuning.bossShieldSeconds1 || 12;
      this.attackTimer = 2.0;
      this.attackIndex = 0;
      this.hazards = [];
      this.lastHitCast = null;
      this.defeated = false;
      this.resolvingTimer = 0;
      this.w = TS * 2.2;
      this.h = TS * 2.2;
      this.x = floor.origin.x + floor.cols * TS / 2 - this.w / 2;
      this.y = floor.origin.y + TS * 2.5;
      this.contactDamage = tuning.bossContactDamage || 20;
      this.tuning = tuning;
    }

    box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

    clearHazards() { this.hazards.length = 0; }

    /** 护盾阶段轮换三种攻击;exposed 不再生成 */
    spawnAttack(session) {
      var y0 = this.y + this.h;
      var idx = this.attackIndex % 3;
      this.attackIndex++;
      var tuning = this.tuning;
      if (idx === 0) {
        this.hazards.push({
          type: 'laser', x: this.floor.origin.x, y: session.player.y + session.player.h / 2,
          w: this.floor.cols * TS, h: 14,
          warn: tuning.bossLaserWarning || 0.8,
          active: tuning.bossLaserActive || 0.35,
          life: (tuning.bossLaserWarning || 0.8) + (tuning.bossLaserActive || 0.35),
          damage: 30
        });
      } else if (idx === 1) {
        for (var i = 0; i < 3; i++) {
          var dx = session.player.x + session.player.w / 2 - (this.x + this.w / 2);
          var dy = session.player.y + session.player.h / 2 - y0;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          this.hazards.push({
            type: 'orb', x: this.x + this.w / 2, y: y0,
            vx: dx / len * 180 + (i - 1) * 40, vy: Math.max(80, dy / len * 180),
            r: 10, warn: 0.5, life: 3.5, damage: 20
          });
        }
      } else {
        this.hazards.push({
          type: 'fireball', x: this.x + this.w / 2, y: y0,
          vx: -120, vy: 150, r: 14, warn: 0.4, life: 4, damage: 20
        });
      }
    }

    hitByHalo(session, castId) {
      if (this.state !== 'exposed' || this.defeated) return false;
      if (this.lastHitCast === castId) return false;
      this.lastHitCast = castId;
      this.clearHazards();
      if (this.phase === 1) {
        this.pendingPhase = 2;
        this.state = 'resolving';
        this.resolvingTimer = 0.6;
        session._event('bossPhaseChanged', { phase: 2 });
      } else {
        this.state = 'resolving';
        this.resolvingTimer = 0.5;
      }
      return true;
    }

    update(dt, session) {
      if (this.defeated) return;
      var tuning = this.tuning;
      // 伤害物推进与命中
      var p = session.player;
      var pr = { x: p.x, y: p.y, w: p.w, h: p.h };
      this.hazards.forEach(function (h) {
        h.life -= dt;
        h.warn -= dt;
        if (h.type === 'orb' || h.type === 'fireball') {
          if (h.warn <= 0) { h.x += h.vx * dt; h.y += h.vy * dt; }
        }
        var box;
        if (h.type === 'laser') box = { x: h.x, y: h.y, w: h.w, h: h.h };
        else box = { x: h.x - h.r, y: h.y - h.r, w: h.r * 2, h: h.r * 2 };
        if (h.warn <= 0 && overlap(pr, box)) session.damage(h.damage, 'boss-' + h.type);
      });
      this.hazards = this.hazards.filter(function (h) { return h.life > 0; });

      // 接触伤害(护盾阶段;exposed 停攻但仍可被碰到本体?)
      if (this.state === 'shielded' && overlap(pr, this.box())) {
        session.damage(this.contactDamage, 'boss-contact');
      }

      if (this.state === 'shielded') {
        this.shieldRemaining -= dt;
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          this.spawnAttack(session);
          this.attackTimer = 3.0;
        }
        if (this.shieldRemaining <= 0) {
          this.state = 'exposed';
          this.clearHazards();
          session._event('bossPhaseChanged', { phase: this.phase, exposed: true });
        }
      } else if (this.state === 'exposed') {
        this.clearHazards();
      } else if (this.state === 'resolving') {
        this.resolvingTimer -= dt;
        if (this.resolvingTimer <= 0) {
          if (this.pendingPhase === 2) {
            this.phase = 2;
            this.pendingPhase = null;
            this.state = 'shielded';
            this.shieldRemaining = tuning.bossShieldSeconds2 || 8;
            this.attackTimer = 1.5;
          } else {
            this.state = 'defeated';
            this.defeated = true;
            this.clearHazards();
            this.floor.exitOpen = true;
            session.win('bossDefeated');
          }
        }
      }
    }

    snapshot() {
      return {
        phase: this.phase, state: this.state,
        shieldRemaining: Math.max(0, this.shieldRemaining),
        defeated: this.defeated, hazards: this.hazards.length,
        x: this.x, y: this.y, w: this.w, h: this.h
      };
    }
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  RA.Boss = Boss;
})(globalThis.RA = globalThis.RA || {});
