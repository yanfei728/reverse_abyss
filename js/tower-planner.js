/* -*- coding: utf-8 -*- */
/*
 * tower-planner.js —— 短塔抽选(纯函数)
 * =====================================
 * 只用"已发布 + 已认证"的 normal 候选;固定大厅/休整/Boss 场景来自内置模板。
 * 同一候选列表 + seed 结果稳定;候选不足 3 个时允许重复(卡内明确允许)。
 */
(function (RA) {
  'use strict';
  var LD = RA.LevelData;

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function prng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a += 0x6D2B79F5;
      var t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function build(opts) {
    opts = opts || {};
    var fixed = opts.fixedLevels || {};
    var candidates = (opts.candidates || []).slice();
    if (!fixed.lobby || !fixed.rest || !fixed.boss) {
      return { ok: false, error: { code: 'NO_FIXED', message: '缺少大厅/休整/Boss 固定场景' } };
    }
    if (!candidates.length) {
      return { ok: false, error: { code: 'EMPTY_POOL', message: '正式池还没有已认证并发布的普通层' } };
    }
    candidates.sort(function (a, b) {
      return (a.levelId + ':' + a.contentHash).localeCompare(b.levelId + ':' + b.contentHash);
    });
    var seed = Number(opts.seed) || 1;
    var rand = prng(seed);
    var picks = [];
    for (var i = 0; i < 3; i++) picks.push(candidates[Math.floor(rand() * candidates.length) % candidates.length]);
    var floors = [];
    floors.push({ levelId: fixed.lobby.id, contentHash: fixed.lobby.contentHash, kind: 'lobby', data: clone(fixed.lobby) });
    picks.forEach(function (c) {
      floors.push({ levelId: c.levelId, contentHash: c.contentHash, kind: 'normal', data: clone(c.data) });
    });
    floors.push({ levelId: fixed.rest.id, contentHash: fixed.rest.contentHash, kind: 'rest', data: clone(fixed.rest) });
    floors.push({ levelId: fixed.boss.id, contentHash: fixed.boss.contentHash, kind: 'boss', data: clone(fixed.boss) });
    var manifestId = 'short-' + hashString(seed + '|' + floors.map(function (f) {
      return f.levelId + ':' + f.contentHash;
    }).join(','));
    return {
      ok: true,
      value: {
        manifestId: manifestId,
        profile: 'short-v1',
        seed: seed,
        rulesVersion: (RA.RULES && RA.RULES.rulesVersion) || '',
        rulesFingerprint: (RA.RULES && RA.RULES.rulesFingerprint) || '',
        floors: floors
      }
    };
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  RA.TowerPlanner = { build: build, hashString: hashString };
})(globalThis.RA = globalThis.RA || {});
