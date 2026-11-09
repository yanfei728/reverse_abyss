/* -*- coding: utf-8 -*-
/*
 * seed-text.js —— 29号卡:正式塔种子文本的规范解析/格式化
 * =========================================================
 * 只保存文本,不保存塔快照。有效数值 1..0xFFFFFFFF;0/空/非法/越界明确拒绝,
 * 不使用 parseInt 部分解析,也不使用 Number(seed)||1 把 0 静默换成 1。
 */
(function (RA) {
  'use strict';
  var MAX = 0xFFFFFFFF;
  var RE = /^RA-([0-9A-Z]{1,7})$/i;
  function parse(text) {
    var s = String(text == null ? '' : text).trim().toUpperCase();
    if (!s) return { ok: false, code: 'EMPTY', message: '种子为空' };
    var m = RE.exec(s);
    if (!m) return { ok: false, code: 'FORMAT', message: '种子格式应为 RA-加1~7位36进制字符' };
    var n = parseInt(m[1], 36);
    if (!isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX) {
      return { ok: false, code: 'RANGE', message: '种子必须在 RA-1 ~ RA-1Z141Z3 之间' };
    }
    return { ok: true, value: n, text: format(n) };
  }
  function format(n) {
    n = Number(n);
    if (!isFinite(n) || Math.floor(n) !== n || n < 1 || n > MAX) throw new Error('种子数值越界');
    return 'RA-' + n.toString(36).toUpperCase();
  }
  function random(notValue) {
    for (var i = 0; i < 20; i++) {
      var n = 1 + Math.floor(Math.random() * MAX);
      if (n !== notValue) return { value: n, text: format(n) };
    }
    return { value: 1, text: format(1) };
  }
  RA.SeedText = { MAX: MAX, parse: parse, format: format, random: random };
})(globalThis.RA = globalThis.RA || {});
