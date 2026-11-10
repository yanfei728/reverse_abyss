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
  var RULES_VERSION = 'b4-16';
  /* 编辑器试玩 = 普通游玩初态(run-v1);standard-v1 只作为旧页面/旧记录的身份保留 */
  var PROFILE = 'run-v1';
  var PROFILE_IDS = ['run-v1', 'standard-v1'];
  var TUNING = {
    hp: 100,
    contactDamage: 20,
    invulnerableSeconds: 1.0,
    haloSeconds: 14,
    haloCooldown: 20,
    haloRadiusTiles: 2.25,        // 33:攻击半径 1.5→2.25 格(101.25px);显示与真实消灭范围同源
    doorDisappearDelaySeconds: 0.10, // 40:门首次 near 接触后保持可见/实体 0.10 秒
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
    'tower=full40-v1/4-buckets/test3-fallback;easy20-v1/2-buckets/enter20',
    'poolEpoch=full40-pool-reset-2026-11-09',
    'monsters=gear340/fireball170/flail4t-2v3',
    'soul=170/contour/dynamic-fly-reattach;sewage=20',
    // 30:金币只被玩家身体拾取;弓箭手静止、170px/s、本体与箭各 20;箭穿墙不跨层
    // 32:弓箭手周期由 2 秒改 4 秒(全关卡统一);三类索敌 10 格只限制新攻击
    'coins=collect/body-only/0.25r;archer=static/4s/170px/20-20/arrow-clip-floor',
    // 32:幽灵 3 秒一次锁向冲 2 格(0.2 秒)、穿墙、扣 20 才自消失;喷火静止、4 秒水平弹
    // 33:幽灵周期改 2 秒、冲刺改 3 格(0.2 秒→675px/s);三类索敌改 20 格;光环半径 2.25 格
    'ghost=2s/dash3t-0.2s/wallpass/20-selfdestruct-on-hit;' +
      'spitter=static/4s/horiz170-20/flame-blocked-by-solid-wall/no-cross-floor',
    'seek=archer+ghost+spitter-center20t;boss=unchanged',
    'halo=2.25t/14-20/formal+trial-shared-draw',
    // 36:两档视野只改显示;正式换层额外回血五档一次/休息叠加;浮石底部不再嵌入1px;箭火显示放大不改判定
    'view=wide2-3/classic1-settings;floorheal=extra0/20/40/60/100-once-per-floor-rest-stack-cap',
    'blink=underside-no-embed-fourway-solid;boltrender=27/27-hit9-arrowhit3',
    // 37:固定场景换新(大厅/休息/小屋)、休息固定40退休、10/30各一次三选一、背景15%
    'fixed=lobby25-22/rest27-20-1-0/resthouse-side-scene;bgdark=0.15',
    'restheal=removed-40;resthouse=10-30-once-milk60/berries-max20-hp40/carrot-max30-hp30-cap',
    'tileskins=visuals.tileSkins/15-authored/tile4-display-only;' +
      'art=authored-33/nearest/anchor-center',
    'score=formal-only/floor20/classic800-easy400/enemy5/coin10/boss-final-once',
    // 40:门统一延迟 0.1 秒(旧 fadeSeconds 只保真,不覆盖);管道内底独立 15% 压暗
    'doorDelay=0.1;pipebg=0.15'
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
