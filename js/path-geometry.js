/* -*- coding: utf-8 -*- */
/*
 * path-geometry.js —— 齿轮直角折线路径的共享几何
 * ================================================
 * 单点静止;2点以上只允许水平/垂直段;loop 末点→首点也必须是水平/垂直。
 * 编辑器预览、裁剪包络、校验与 World 共用,不生成斜线/平滑曲线。
 */
(function (RA) {
  'use strict';

  function same(a, b) { return a.col === b.col && a.row === b.row; }
  function isInt(v) { return Number.isInteger(v); }
  function issue(code, path, message) { return { code: code, path: path, message: message, severity: 'error' }; }
  function segment(a, b) {
    var dx = b.col - a.col, dy = b.row - a.row;
    return { a: a, b: b, horizontal: dy === 0, vertical: dx === 0, lenTiles: Math.abs(dx) + Math.abs(dy) };
  }
  function lastSegments(points) {
    if (points.length < 2) return [];
    return [segment(points[points.length - 2], points[points.length - 1])];
  }
  function isReversal(a, b, c) {
    // b 处是否 180° 原路折返
    var d1c = b.col - a.col, d1r = b.row - a.row;
    var d2c = c.col - b.col, d2r = c.row - b.row;
    return (d1c === -d2c && d1r === -d2r) || (d1c && d2c && d1c === -d2c && d1r === 0 && d2r === 0);
  }
  function validate(path) {
    var out = [], pts = path && path.points;
    if (!Array.isArray(pts) || pts.length < 1) return [issue('INVALID_FIELD', '/paths/points', '路径至少要有 1 个点')];
    for (var i = 0; i < pts.length; i++) {
      if (!pts[i] || !isInt(pts[i].col) || !isInt(pts[i].row)) {
        out.push(issue('INVALID_FIELD', '/paths/points/' + i, '路径点必须是整数 col/row'));
      }
    }
    if (out.length) return out;
    if (pts.length === 1) return out;
    for (var j = 1; j < pts.length; j++) {
      var s = segment(pts[j - 1], pts[j]);
      if (!s.horizontal && !s.vertical) out.push(issue('INVALID_PATH', '/paths/points/' + j, '路径段只能水平或垂直(90°)'));
      if (s.lenTiles === 0) out.push(issue('INVALID_PATH', '/paths/points/' + j, '路径段不能为零长度'));
      if (j >= 2 && isReversal(pts[j - 2], pts[j - 1], pts[j])) out.push(issue('INVALID_PATH', '/paths/points/' + j, '路径内部不能 180° 原路折返'));
    }
    if (path.mode === 'loop') {
      if (pts.length < 3) out.push(issue('INVALID_PATH', '/paths', '闭合路径至少需要 3 个不同转角'));
      var close = segment(pts[pts.length - 1], pts[0]);
      if (!close.horizontal && !close.vertical) out.push(issue('INVALID_PATH', '/paths', '闭合边只能水平或垂直'));
      if (close.lenTiles === 0) out.push(issue('INVALID_PATH', '/paths', '闭合边不能为零长度'));
    }
    return out;
  }
  function compile(path) {
    var issues = validate(path); if (issues.length) return { ok: false, error: { code: issues[0].code, message: issues[0].message, issues: issues } };
    var pts = path.points, segs = [];
    for (var i = 1; i < pts.length; i++) segs.push(segment(pts[i - 1], pts[i]));
    if (path.mode === 'loop' && pts.length > 1) segs.push(segment(pts[pts.length - 1], pts[0]));
    var total = segs.reduce(function (a, s) { return a + s.lenTiles; }, 0);
    var bounds = null;
    pts.forEach(function (p) {
      if (!bounds) bounds = { minCol: p.col, minRow: p.row, maxCol: p.col, maxRow: p.row };
      else { bounds.minCol = Math.min(bounds.minCol, p.col); bounds.maxCol = Math.max(bounds.maxCol, p.col); bounds.minRow = Math.min(bounds.minRow, p.row); bounds.maxRow = Math.max(bounds.maxRow, p.row); }
    });
    return { ok: true, value: { points: pts, mode: path.mode, segments: segs, totalTiles: total, bounds: bounds } };
  }
  function sample(compiled, distanceTiles) {
    if (!compiled || !compiled.segments.length) return compiled && compiled.points[0] ? compiled.points[0] : { col: 0, row: 0 };
    var total = compiled.totalTiles || 1;
    var d = ((distanceTiles % total) + total) % total;
    for (var i = 0; i < compiled.segments.length; i++) {
      var s = compiled.segments[i];
      if (d <= s.lenTiles) {
        var k = s.lenTiles ? d / s.lenTiles : 0;
        return { col: s.a.col + (s.b.col - s.a.col) * k, row: s.a.row + (s.b.row - s.a.row) * k };
      }
      d -= s.lenTiles;
    }
    return compiled.points[0];
  }
  function appendOrthogonal(points, target) {
    var pts = (points || []).map(function (p) { return { col: p.col, row: p.row }; });
    if (!pts.length) return { ok: true, value: { points: [{ col: target.col, row: target.row }], added: 1 } };
    var last = pts[pts.length - 1];
    if (same(last, target)) return { ok: false, error: { code: 'SAME_POINT', message: '与上一点相同;没有生成零长度段' } };
    function direct() {
      if (last.col === target.col || last.row === target.row) {
        var cand = pts.concat([{ col: target.col, row: target.row }]);
        if (pts.length >= 2 && isReversal(pts[pts.length - 2], last, target)) return null;
        return cand;
      }
      return null;
    }
    var d = direct(); if (d) return { ok: true, value: { points: d, added: 1 } };
    var prev = pts.length >= 2 ? pts[pts.length - 2] : null;
    function tryH(first) {
      var corner = first ? { col: target.col, row: last.row } : { col: last.col, row: target.row };
      if (same(corner, last) || same(corner, target)) return null;
      if (prev && isReversal(prev, last, corner)) return null;
      var cand = pts.concat([corner, { col: target.col, row: target.row }]);
      if (validate({ mode: 'pingpong', points: cand }).length) return null;
      return cand;
    }
    var a = tryH(true), b = tryH(false);
    // 默认先横后竖;若立即反向则用另一拐角
    var chosen = a || b;
    if (!chosen) return { ok: false, error: { code: 'NO_ORTHOGONAL', message: '两种 L 拐角都会反向或产生非法段;请先点一个水平/垂直中间点' } };
    return { ok: true, value: { points: chosen, added: chosen.length - pts.length } };
  }
  function closeOrthogonal(points) {
    var pts = (points || []).map(function (p) { return { col: p.col, row: p.row }; });
    if (pts.length < 2) return { ok: false, error: { code: 'TOO_FEW', message: '至少两个点才能闭合' } };
    var first = pts[0], last = pts[pts.length - 1];
    if (same(first, last)) return { ok: false, error: { code: 'DEGENERATE', message: '最后一点与首点相同;不需要再闭合' } };
    if (first.col === last.col || first.row === last.row) {
      var path = { mode: 'loop', points: pts };
      var vi = validate(path); if (vi.length) return { ok: false, error: { code: vi[0].code, message: vi[0].message, issues: vi } };
      return { ok: true, value: { points: pts, mode: 'loop' } };
    }
    var prev = pts.length >= 2 ? pts[pts.length - 2] : null;
    var cands = [
      { col: first.col, row: last.row },
      { col: last.col, row: first.row }
    ];
    for (var i = 0; i < cands.length; i++) {
      var corner = cands[i];
      if (same(corner, last) || same(corner, first)) continue;
      if (prev && isReversal(prev, last, corner)) continue;
      var cp = pts.concat([corner]);
      var v = validate({ mode: 'loop', points: cp });
      if (!v.length) return { ok: true, value: { points: cp, mode: 'loop' } };
    }
    return { ok: false, error: { code: 'NO_CLOSE', message: '无法生成非退化直角闭合;继续加点或切回往返' } };
  }
  function sweptBounds(path, radiusTiles) {
    var c = compile(path); if (!c.ok) return c;
    var r = Number(radiusTiles) || 0;
    var b = c.value.bounds;
    return { ok: true, value: {
      minCol: Math.floor(b.minCol - r), maxCol: Math.ceil(b.maxCol + r),
      minRow: Math.floor(b.minRow - r), maxRow: Math.ceil(b.maxRow + r)
    } };
  }

  RA.PathGeometry = {
    validate: validate, compile: compile, sample: sample,
    appendOrthogonal: appendOrthogonal, closeOrthogonal: closeOrthogonal,
    sweptBounds: sweptBounds, segment: segment
  };
})(globalThis.RA = globalThis.RA || {});
