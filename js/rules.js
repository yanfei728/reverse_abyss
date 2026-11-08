/* -*- coding: utf-8 -*- */
/*
 * rules.js —— B2 首版规则与数值指纹
 * ==================================
 * 玩法数值集中在这里/ config;认证与发布绑定 rulesVersion + rulesFingerprint。
 * 修改物理、技能、伤害、Boss 节奏或接口规格时必须升版本,否则旧认证会被错误复用。
 */
(function (RA) {
  'use strict';
  var C = RA.C;
  var RULES_VERSION = 'b4-3';
  var PROFILE = 'standard-v1';
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
    'collision=world-v3'
  ].join('|');

  RA.RULES = {
    rulesVersion: RULES_VERSION,
    rulesFingerprint: FINGERPRINT,
    standardProfile: PROFILE,
    tuning: TUNING,
    /** 标准试玩:无光环开局、冷却 20 秒、无作弊;正式开局技能可用 */
    profile(name) {
      if (name === PROFILE) {
        return {
          profile: PROFILE,
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
