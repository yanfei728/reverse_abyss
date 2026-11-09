/* -*- coding: utf-8 -*- */
/*
 * high-score-store.js —— 唯一历史最高分(30号卡)
 * ============================================
 * 只存一个非负整数,独立 key `ra_high_score_v1`:
 *
 *     {"version":1,"bestScore":0}
 *
 * 不存逐局记录/最近分/日期/种子/manifest 快照,不清理其它 key,也不改作者草稿/通过记录。
 * 核心 GameSession 不直接碰 localStorage:本模块只接收一个 storage 适配对象
 * (浏览器 localStorage / 测试里的隔离存储),读/写都返回明确的成功或失败;
 * 写失败、校验失败、记录损坏都如实返回失败,不谎报已保存、不覆盖旧合法最高分。
 */
(function (RA) {
  'use strict';

  var KEY = 'ra_high_score_v1';
  var VERSION = 1;

  function ok(value) { return { ok: true, value: value }; }
  function fail(code, message, value) {
    return { ok: false, error: { code: code, message: message }, value: value };
  }
  function usable(storage) {
    return !!(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function');
  }
  function cleanNumber(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    n = Math.floor(n);
    if (n < 0) n = 0;
    return n;
  }

  /**
   * 读历史最高分。
   *   无记录         → ok, bestScore 0(empty:true)
   *   合法记录       → ok, bestScore
   *   损坏/版本不支持 → 失败(不清理、不改写),value.bestScore 给 0 以免界面崩
   *   存储不可用/抛错 → 失败,value.bestScore 0
   */
  function read(storage) {
    if (!usable(storage)) {
      return fail('STORAGE_UNAVAILABLE', '本地存储不可用,无法读取历史最高分', { bestScore: 0 });
    }
    var raw;
    try { raw = storage.getItem(KEY); }
    catch (e) { return fail('STORAGE_READ_FAILED', '读取本地最高分失败(存储不可用)', { bestScore: 0 }); }
    if (raw === null || raw === undefined || raw === '') return ok({ bestScore: 0, empty: true });
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { return fail('CORRUPT', '本地最高分记录损坏(不是合法 JSON);未清理其它记录', { bestScore: 0 }); }
    if (!parsed || typeof parsed !== 'object' || parsed.version !== VERSION ||
      typeof parsed.bestScore !== 'number' || !isFinite(parsed.bestScore) || parsed.bestScore < 0) {
      return fail('CORRUPT', '本地最高分记录格式不受支持;未清理其它记录', { bestScore: 0 });
    }
    return ok({ bestScore: cleanNumber(parsed.bestScore), empty: false });
  }

  /** 把两个候选最大值取较大者;坏值忽略 */
  function maxOf(a, b) {
    var x = cleanNumber(a), y = cleanNumber(b);
    if (x === null) return y === null ? 0 : y;
    if (y === null) return x;
    return x > y ? x : y;
  }

  /**
   * 提交本局分数:只在超过已保存最高分时写一次(取 max,不做逐局记录)。
   *   {ok:true, value:{bestScore, updated}}
   *   {ok:false, error, value:{bestScore}}  // value.bestScore = 仍可信的已保存值
   */
  function submit(storage, score) {
    var n = cleanNumber(score);
    if (n === null) return fail('INVALID_SCORE', '最高分只能是非负整数', { bestScore: 0 });
    var cur = read(storage);
    if (!cur.ok) {
      // 记录损坏/存储不可读:不写入、不清理,如实失败
      return fail(cur.error.code, cur.error.message, { bestScore: (cur.value && cur.value.bestScore) || 0 });
    }
    var best = cur.value.bestScore;
    if (n <= best) return ok({ bestScore: best, updated: false });
    var text = JSON.stringify({ version: VERSION, bestScore: n });
    try { storage.setItem(KEY, text); }
    catch (e) { return fail('STORAGE_WRITE_FAILED', '最高分写入失败(本地存储不可用或已满);原最高分保留', { bestScore: best }); }
    var back = read(storage);
    if (!back.ok || back.value.bestScore !== n) {
      return fail('STORAGE_VERIFY_FAILED', '最高分写入后回读不一致;按未保存处理', { bestScore: best });
    }
    return ok({ bestScore: n, updated: true });
  }

  /** 直接解析一段文本(给自检/诊断用,不接触 storage) */
  function decode(raw) {
    if (raw === null || raw === undefined || raw === '') return ok({ bestScore: 0, empty: true });
    return read({ getItem: function () { return raw; }, setItem: function () { } });
  }

  RA.HighScoreStore = {
    KEY: KEY,
    VERSION: VERSION,
    read: read,
    submit: submit,
    decode: decode,
    maxOf: maxOf
  };
})(globalThis.RA = globalThis.RA || {});
