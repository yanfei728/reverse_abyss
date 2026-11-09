/* -*- coding: utf-8 -*- */
/*
 * tower-planner.js —— 抽塔(纯函数)
 * =================================
 * short-v1:旧短塔诊断布局(3 普通层,允许重复,仅调试入口使用)。
 * full40-v1:正式完整塔 0–40 共 41 槽。
 *   普通槽 36 个,按 1–9 / 11–19 / 21–29 / 31–39 四档,每档最多 9 张,
 *   同档按 levelId+contentHash 无放回;本档不足才用 fallback(test3 规范运行副本)补齐。
 *   只有 source='fallback' 可以让模板自身 difficulty 与目标档不同;正式图不跨档。
 *   池为空也返回完整清单,不再 EMPTY_POOL。
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
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function hashOf(data) {
    return (data && data.contentHash) || (LD && LD.hashSync ? LD.hashSync(data) : '');
  }
  function keyOf(data) { return String(data.id) + ':' + hashOf(data); }

  /** 旧短塔诊断布局:只给调试入口用,正式入口不走这里。 */
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
    candidates.sort(function (a, b) { return keyOf(a.data || a).localeCompare(keyOf(b.data || b)); });
    var seed = Number(opts.seed) || 1;
    var rand = prng(seed);
    var picks = [];
    for (var i = 0; i < 3; i++) picks.push(candidates[Math.floor(rand() * candidates.length) % candidates.length]);
    var floors = [];
    floors.push({ levelId: fixed.lobby.id, contentHash: hashOf(fixed.lobby), kind: 'lobby', data: clone(fixed.lobby) });
    picks.forEach(function (c) {
      floors.push({ levelId: c.levelId, contentHash: c.contentHash, kind: 'normal', data: clone(c.data) });
    });
    floors.push({ levelId: fixed.rest.id, contentHash: hashOf(fixed.rest), kind: 'rest', data: clone(fixed.rest) });
    floors.push({ levelId: fixed.boss.id, contentHash: hashOf(fixed.boss), kind: 'boss', data: clone(fixed.boss) });
    var manifestId = 'short-' + hashString(seed + '|' + floors.map(function (f) {
      return f.levelId + ':' + f.contentHash;
    }).join(','));
    return {
      ok: true,
      value: {
        manifestId: manifestId,
        layout: 'short-v1',
        profile: 'short-v1',
        gameplayProfile: 'run-v1',
        seed: seed,
        rulesVersion: (RA.RULES && RA.RULES.rulesVersion) || '',
        rulesFingerprint: (RA.RULES && RA.RULES.rulesFingerprint) || '',
        floors: floors
      }
    };
  }

  var DIFF_SLOTS = {
    1: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    2: [11, 12, 13, 14, 15, 16, 17, 18, 19],
    3: [21, 22, 23, 24, 25, 26, 27, 28, 29],
    4: [31, 32, 33, 34, 35, 36, 37, 38, 39]
  };

  /** 每档独立洗牌:同一 seed 下档内顺序稳定,不跨档混洗。 */
  function pickBucket(candidates, difficulty, seed) {
    var seen = {};
    var list = [];
    candidates.forEach(function (c) {
      var d = c && (c.data || c);
      if (!d || Number(d.difficulty) !== difficulty) return;
      var k = keyOf(d);
      if (seen[k]) return;
      seen[k] = true;
      list.push({ levelId: c.levelId || d.id, contentHash: c.contentHash || hashOf(d), data: d });
    });
    list.sort(function (a, b) { return (a.levelId + ':' + a.contentHash).localeCompare(b.levelId + ':' + b.contentHash); });
    var rand = prng((seed ^ parseInt(hashString('difficulty-' + difficulty), 16)) >>> 0);
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list.slice(0, 9);
  }

  function buildFull40(opts) {
    opts = opts || {};
    var fixed = opts.fixedLevels || {};
    var fallback = opts.fallback;
    if (!fixed.lobby || !fixed.rest || !fixed.boss) {
      return { ok: false, error: { code: 'NO_FIXED', message: '缺少大厅/休整/Boss 固定场景' } };
    }
    if (!fallback) {
      return { ok: false, error: { code: 'NO_FALLBACK', message: '缺少 test3 内置补位模板' } };
    }
    var seed = Number(opts.seed) || 1;
    var poolEpoch = String(opts.poolEpoch || (RA.FULL40 && RA.FULL40.poolEpoch) || '');
    var candidates = (opts.candidates || []).slice();
    var buckets = {};
    [1, 2, 3, 4].forEach(function (d) { buckets[d] = pickBucket(candidates, d, seed); });
    var used = { 1: 0, 2: 0, 3: 0, 4: 0 };
    var fallbackHash = hashOf(fallback);
    var floors = [];
    var normalSlots = [];
    for (var f = 1; f <= 39; f++) {
      if (f === 10 || f === 20 || f === 30) continue;
      normalSlots.push(f);
    }
    var slotDifficulty = {};
    Object.keys(DIFF_SLOTS).forEach(function (d) {
      DIFF_SLOTS[d].forEach(function (n) { slotDifficulty[n] = Number(d); });
    });
    var fallbackCount = 0;
    normalSlots.forEach(function (n) {
      var d = slotDifficulty[n];
      var picked = buckets[d][used[d]];
      var entry;
      if (picked) {
        used[d]++;
        entry = {
          floorNumber: n, kind: 'normal', source: 'published', requiredDifficulty: d,
          levelId: picked.levelId, contentHash: picked.contentHash, data: clone(picked.data),
          exitAction: 'pipe'
        };
      } else {
        fallbackCount++;
        entry = {
          floorNumber: n, kind: 'normal', source: 'fallback', requiredDifficulty: d,
          levelId: fallback.id, contentHash: fallbackHash, data: clone(fallback),
          exitAction: 'pipe'
        };
      }
      floors.push(entry);
    });
    // 固定槽(与普通槽按 floorNumber 排序)
    floors.push({ floorNumber: 0, kind: 'lobby', source: 'fixed', requiredDifficulty: null,
      levelId: fixed.lobby.id, contentHash: hashOf(fixed.lobby), data: clone(fixed.lobby),
      exitAction: 'lobby-transfer' });
    floors.push({ floorNumber: 10, kind: 'rest', source: 'fixed', requiredDifficulty: null,
      levelId: fixed.rest.id, contentHash: hashOf(fixed.rest), data: clone(fixed.rest),
      exitAction: 'pipe' });
    floors.push({ floorNumber: 20, kind: 'boss', source: 'fixed', requiredDifficulty: null,
      levelId: fixed.boss.id, contentHash: hashOf(fixed.boss), data: clone(fixed.boss),
      exitAction: 'boss-transfer' });
    floors.push({ floorNumber: 30, kind: 'rest', source: 'fixed', requiredDifficulty: null,
      levelId: fixed.rest.id, contentHash: hashOf(fixed.rest), data: clone(fixed.rest),
      exitAction: 'pipe' });
    floors.push({ floorNumber: 40, kind: 'boss', source: 'fixed', requiredDifficulty: null,
      levelId: fixed.boss.id, contentHash: hashOf(fixed.boss), data: clone(fixed.boss),
      exitAction: 'victory' });
    floors.sort(function (a, b) { return a.floorNumber - b.floorNumber; });
    var manifestId = 'full40-' + hashString([
      'full40-v1', seed, poolEpoch,
      floors.map(function (e) {
        return e.floorNumber + ':' + e.levelId + ':' + e.contentHash + ':' + e.source + ':' + e.exitAction;
      }).join(',')
    ].join('|'));
    return {
      ok: true,
      value: {
        manifestId: manifestId,
        layout: 'full40-v1',
        profile: 'full40-v1',
        gameplayProfile: 'run-v1',
        seed: seed,
        poolEpoch: poolEpoch,
        rulesVersion: (RA.RULES && RA.RULES.rulesVersion) || '',
        rulesFingerprint: (RA.RULES && RA.RULES.rulesFingerprint) || '',
        slotCount: floors.length,
        normalCount: normalSlots.length,
        fallbackCount: fallbackCount,
        perDifficulty: {
          1: { picked: used[1], fallback: 9 - used[1] },
          2: { picked: used[2], fallback: 9 - used[2] },
          3: { picked: used[3], fallback: 9 - used[3] },
          4: { picked: used[4], fallback: 9 - used[4] }
        },
        floors: floors
      }
    };
  }

  RA.TowerPlanner = {
    build: build,
    buildFull40: buildFull40,
    hashString: hashString,
    DIFF_SLOTS: DIFF_SLOTS
  };
})(globalThis.RA = globalThis.RA || {});
