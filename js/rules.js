/* -*- coding: utf-8 -*- */
/*
 * rules.js —— B2 首版规则与数值指纹
 * ==================================
 * 玩法数值集中在这里/ config;认证与发布绑定 rulesVersion + rulesFingerprint,
 * 版本字段只用于记录当次条件,不作为关卡合规裁决,也不批量作废已有作者通过。
 * 修改物理、技能、伤害、Boss 节奏或接口规格时必须升版本,方便追溯。
 */
(function (RA) {
  'use strict';
  var C = RA.C;
  var RULES_VERSION = 'b4-10';
  /* 编辑器试玩 = 普通游玩初态(run-v1);standard-v1 只作为旧页面/旧记录的身份保留 */
  var PROFILE = 'run-v1';
  var PROFILE_IDS = ['run-v1', 'standard-v1'];
  var TUNING = {
    hp: 100,
    contactDamage: 20,
    invulnerableSeconds: 1.0,
    haloSeconds: 14,
    haloCooldown: 20,
    haloRadiusTiles: 1.5,
    restHeal: 40,
    bossShieldSeconds1: 12,
    bossShieldSeconds2: 8,
    bossLaserWarning: 0.8,
    bossLaserActive: 0.35,
    bossOrbInterval: 0.6,
    bossContactDamage: 20
  };
  var FINGERPRINT = [
    'rules=' + RULES_VERSION,
    'ts=' + C.TS,
    'gravity=' + C.GRAVITY,
    'jump=' + C.JUMP_VEL,
    'hp=' + TUNING.hp,
    'halo=' + TUNING.haloSeconds + '/' + TUNING.haloCooldown,
    'radius=' + TUNING.haloRadiusTiles,
    'boss=' + TUNING.bossShieldSeconds1 + '/' + TUNING.bossShieldSeconds2,
    'objects=' + Object.keys(C.OBJECT_PARAMS || {}).sort().join(','),
    'interface=cloud-pipe-v2/2x3/gap4',
    'fixed=short-fixed-v1',
    'collision=world-v3',
    'path=orth-v1',
    'trial=manual-single-map-v3',
    'profile=run-v1',
    'tower=full40-v1/4-buckets/test3-fallback',
    'poolEpoch=full40-pool-reset-2026-11-09',
    'monsters=gear340/fireball170/flail4t-2v3',
    'soul=170/contour/dynamic-fly-reattach;sewage=20',
    // 30:金币只被玩家身体拾取;弓箭手静止、入层2秒/170px/s/本体与箭各20;箭穿墙不跨层
    'coins=collect/body-only/0.25r;archer=static/2s/170px/20-20/arrow-clip-floor',
    'score=formal-only/floor20/enemy5/coin10/boss-final-once'
  ].join('|');

  RA.RULES = {
    rulesVersion: RULES_VERSION,
    rulesFingerprint: FINGERPRINT,
    playProfile: PROFILE,
    profileIds: PROFILE_IDS.slice(),
    /** 认证/通过记录接受的身份:普通游玩 run-v1;旧 standard-v1 只作历史记录 */
    acceptsProfile(id) { return PROFILE_IDS.indexOf(id) >= 0; },
    tuning: TUNING,
    /**
     * 运行初态。run-v1 = 普通游玩(试玩也用这个):满血、技能开局可用。
     * standard-v1 是旧标准试玩页的身份,保留它原来的“无光环、冷却 20 秒”语义,
     * 不再作为试玩/发布必须匹配的固定值。
     */
    profile(name) {
      if (name === 'standard-v1') {
        return {
          profile: 'standard-v1',
          hp: TUNING.hp,
          haloActive: 0,
          haloCooldown: TUNING.haloCooldown,
          allowRest: false,
          allowSkill: true,
          allowCheat: false
        };
      }
      return {
        profile: 'run-v1',
        hp: TUNING.hp,
        haloActive: 0,
        haloCooldown: 0,
        allowRest: true,
        allowSkill: true,
        allowCheat: false
      };
    }
  };
})(globalThis.RA = globalThis.RA || {});
