/* -*- coding: utf-8 -*-
/*
 * soul-motion.js —— 28号卡:灵魂的方块轮廓几何与 170px/s 动态贴边
 * ================================================================
 * 只读取“方块几何”provider(terrain/当前门浮石弹簧/实存管壁),不把怪物/轨道/链/池当方块。
 * 正式 FloorInstance、独立 TrialSession 和编辑器预览共用这一份方向/轮廓/运动算法。
 */
(function (RA) {
  'use strict';
  var C = RA.C || {};
  var T = C.TS || 45;
  var DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

  /**
   * provider: {cols, rows, isBlock(row,col), revision()}
   * 缓存整张方块图;只有 revision 改变才重建,避免每个魂每帧扫全图。
   */
  function createGeometry(opts) {
    var cols = opts.cols || 0, rows = opts.rows || 0;
    var cacheRev = null, cache = null;
    function ensure() {
      var rev = opts.revision ? opts.revision() : 0;
      if (cacheRev === rev && cache) return cache;
      var map = [];
      for (var r = 0; r < rows; r++) {
        var line = [];
        for (var c = 0; c < cols; c++) line.push(!!opts.isBlock(r, c));
        map.push(line);
      }
      cache = map; cacheRev = rev;
      return cache;
    }
    return {
      cols: cols, rows: rows,
      revision: function () { return opts.revision ? opts.revision() : 0; },
      isBlock: function (r, c) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) return true; // 地图外按不可走的实心边界
        return ensure()[r][c];
      },
      map: ensure
    };
  }

  function key(x, y) { return Math.round(x * 1000) / 1000 + ':' + Math.round(y * 1000) / 1000; }
  function dirOf(dx, dy) {
    if (dx > 0) return 1; if (dx < 0) return 3; if (dy < 0) return 0; return 2;
  }

  /** 方块并集的外露边;方向沿实心在右(顺时针),用于生成轮廓。 */
  function buildEdges(geom) {
    var map = geom.map(), edges = [];
    for (var r = 0; r < geom.rows; r++) {
      for (var c = 0; c < geom.cols; c++) {
        if (!map[r][c]) continue;
        var x0 = c * T, y0 = r * T, x1 = x0 + T, y1 = y0 + T;
        if (!map[r - 1] || !map[r - 1][c]) edges.push({ a: { x: x0, y: y0 }, b: { x: x1, y: y0 }, dir: 1, n: { x: 0, y: -1 } });
        if (!map[r][c + 1] || !map[r][c + 1]) edges.push({ a: { x: x1, y: y0 }, b: { x: x1, y: y1 }, dir: 2, n: { x: 1, y: 0 } });
        if (!map[r + 1] || !map[r + 1][c]) edges.push({ a: { x: x1, y: y1 }, b: { x: x0, y: y1 }, dir: 3, n: { x: 0, y: 1 } });
        if (!map[r][c - 1] || !map[r][c - 1]) edges.push({ a: { x: x0, y: y1 }, b: { x: x0, y: y0 }, dir: 0, n: { x: -1, y: 0 } });
      }
    }
    return edges;
  }

  /** 从边端点选下一条;优先直行,其次顺时针(保持实心在右)。 */
  function nextEdge(edges, e) {
    var k = key(e.b.x, e.b.y);
    var cand = edges.filter(function (x) {
      return key(x.a.x, x.a.y) === k && !(Math.abs(x.b.x - e.a.x) < 1e-6 && Math.abs(x.b.y - e.a.y) < 1e-6);
    });
    if (!cand.length) return null;
    var cur = e.dir;
    cand.sort(function (p, q) {
      var dp = (p.dir - cur + 4) % 4, dq = (q.dir - cur + 4) % 4;
      return dp - dq;
    });
    return cand[0];
  }

  /** 把边序列变成带半径偏移的折线(节点取相邻偏移线交点)。 */
  function offsetPoints(edges, r) {
    var out = [];
    for (var i = 0; i < edges.length; i++) {
      var prev = edges[(i - 1 + edges.length) % edges.length], e = edges[i];
      var p;
      if (prev.dir === e.dir) {
        p = { x: e.a.x + e.n.x * r, y: e.a.y + e.n.y * r };
      } else if ((prev.dir === 1 || prev.dir === 3) && (e.dir === 0 || e.dir === 2)) {
        p = { x: e.a.x + e.n.x * r, y: prev.a.y + prev.n.y * r };
      } else if ((prev.dir === 0 || prev.dir === 2) && (e.dir === 1 || e.dir === 3)) {
        p = { x: prev.a.x + prev.n.x * r, y: e.a.y + e.n.y * r };
      } else {
        p = { x: e.a.x + e.n.x * r, y: e.a.y + e.n.y * r };
      }
      out.push(p);
    }
    return out;
  }
  function pointDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function polyline(edges, r) {
    var pts = offsetPoints(edges, r), segs = [], total = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var len = pointDist(a, b);
      segs.push({ a: a, b: b, len: len, dir: edges[i].dir });
      total += len;
    }
    return { pts: pts, segs: segs, total: total, edges: edges };
  }

  function loops(geom, radiusTiles) {
    var rev = geom.revision(), keyId = 'r' + radiusTiles;
    if (geom._loops && geom._loopsRev === rev && geom._loopsKey === keyId) return geom._loops;
    var edges = buildEdges(geom), unused = edges.slice(), out = [];
    while (unused.length) {
      var start = unused.shift();
      var seq = [start], cur = nextEdge(edges, start), guard = 0;
      while (cur && guard++ < edges.length * 2 && !(Math.abs(cur.a.x - start.a.x) < 1e-6 && Math.abs(cur.a.y - start.a.y) < 1e-6)) {
        seq.push(cur);
        unused = unused.filter(function (x) { return x !== cur; });
        cur = nextEdge(edges, cur);
      }
      if (seq.length) {
        var p = polyline(seq, radiusTiles * T);
        if (p.total > 0.01) out.push(p);
      }
    }
    geom._loopsRev = rev; geom._loopsKey = keyId; geom._loops = out;
    return out;
  }

  function projectOnSeg(px, py, s) {
    var dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    var l2 = dx * dx + dy * dy;
    var k = l2 ? ((px - s.a.x) * dx + (py - s.a.y) * dy) / l2 : 0;
    k = Math.max(0, Math.min(1, k));
    return { x: s.a.x + dx * k, y: s.a.y + dy * k, k: k, d: Math.hypot(px - (s.a.x + dx * k), py - (s.a.y + dy * k)) };
  }

  /** 在轮廓中找离给定点最近的段(半径附近优先),供初次放置/飞行后回贴。 */
  function nearestSeg(geom, x, y, radiusTiles, dir) {
    var lps = loops(geom, radiusTiles), best = null;
    lps.forEach(function (lp) {
      lp.segs.forEach(function (s, idx) {
        // 指定方向时只接受同向或反向的边;否则会从最近的错误边回贴
        if (dir !== undefined && s.dir !== dir && (s.dir + 2) % 4 !== dir) return;
        var p = projectOnSeg(x, y, s);
        var sd = dir === undefined ? 0 : (s.dir === dir ? 0 : 1);
        var score = p.d + sd * T * 0.25;
        if (Math.abs(p.d - radiusTiles * T) <= T * 0.9 && (!best || score < best.score)) {
          best = { loop: lp, seg: s, idx: idx, p: p, score: score, dir: s.dir };
        }
      });
    });
    return best;
  }

  /** 相邻空格可选的贴边方向(0上1右2下3左),编辑器预览与运行使用同一几何。 */
  function availableDirections(geom, col, row, radiusTiles) {
    var cx = (col + 0.5) * T, cy = (row + 0.5) * T;
    // 只允许与方块上下左右相邻的空格;对角空格不能贴边
    if (!geom.isBlock(row - 1, col) && !geom.isBlock(row + 1, col) &&
      !geom.isBlock(row, col - 1) && !geom.isBlock(row, col + 1)) return [];
    var out = [], seen = {};
    loops(geom, radiusTiles).forEach(function (lp) {
      lp.segs.forEach(function (s) {
        var p = projectOnSeg(cx, cy, s);
        if (p.d > radiusTiles * T + T * 0.75) return;
        // 只接受投影点在该相邻空格内的边;不能把隔壁/拐角另一侧的方向当成合法
        if (Math.floor(p.x / T) !== col || Math.floor(p.y / T) !== row) return;
        [s.dir, (s.dir + 2) % 4].forEach(function (d) {
          if (seen[d]) return;
          // 方向必须沿已投影的边,且投影点在该格中心附近(而不是地图另一侧)
          seen[d] = 1; out.push(d);
        });
      });
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /** 从位置/方向建立贴边状态;返回 null 表示无相邻轮廓,按方向直飞。 */
  function attach(geom, x, y, direction, radiusTiles) {
    var best = nearestSeg(geom, x, y, radiusTiles, direction);
    if (!best) return null;
    var reverse = false;
    if (direction !== undefined && best.seg.dir !== direction) {
      if ((best.seg.dir + 2) % 4 !== direction) return null;
      reverse = true;
    }
    var p = best.p, s = 0, lp = best.loop;
    for (var i = 0; i < best.idx; i++) s += lp.segs[i].len;
    s += lp.segs[best.idx].len * p.k;
    if (reverse) s = (lp.total - s) % lp.total;
    var state = { attached: true, loop: lp, s: s, reverse: reverse, dir: direction === undefined ? best.dir : direction,
      rx: p.x, ry: p.y, radiusTiles: radiusTiles };
    sample(state);
    return state;
  }

  function sample(st) {
    if (!st.attached || !st.loop) return;
    var lp = st.loop, total = lp.total;
    var s = ((st.s % total) + total) % total;
    if (st.reverse) s = (total - s) % total;
    for (var i = 0; i < lp.segs.length; i++) {
      var seg = lp.segs[i];
      if (s <= seg.len || i === lp.segs.length - 1) {
        var k = seg.len ? Math.min(1, s / seg.len) : 0;
        st.rx = seg.a.x + (seg.b.x - seg.a.x) * k;
        st.ry = seg.a.y + (seg.b.y - seg.a.y) * k;
        var dd = st.reverse ? (seg.dir + 2) % 4 : seg.dir;
        if (dd !== st.dir) st.dir = dd;
        return;
      }
      s -= seg.len;
    }
  }

  /** 前进一步;几何 revision 变化时重建/回贴,找不到边则按当时方向直飞。 */
  function step(st, dt, geom, speedPx) {
    if (!st) return null;
    var radius = st.radiusTiles === undefined ? 0.5 : st.radiusTiles;
    if (st.attached && st.loop && st._rev !== geom.revision()) {
      st._rev = geom.revision();
      var a = attach(geom, st.rx, st.ry, st.dir, radius);
      if (a) {
        st.attached = a.attached; st.loop = a.loop; st.s = a.s; st.reverse = a.reverse;
        st.dir = a.dir; st.rx = a.rx; st.ry = a.ry; st._rev = a._rev || st._rev;
      } else { st.attached = false; st.loop = null; }
    }
    if (st.attached && st.loop) {
      st.s += (st.reverse ? -1 : 1) * speedPx * dt;
      sample(st);
      st._rev = geom.revision();
      return st;
    }
    // 直飞:按当前方向,保持当时朝向;不穿过方块,遇到相邻块尝试重新贴边
    var v = DIRS[st.dir], nx = st.rx + v.x * speedPx * dt, ny = st.ry + v.y * speedPx * dt;
    var row = Math.floor(ny / T), col = Math.floor(nx / T);
    var a2 = attach(geom, nx, ny, st.dir, radius);
    if (!a2 && geom.isBlock(row, col)) {
      // 正面遇块:尝试沿块边切向重新附着;有序尝试,避免随机换边/抖动
      var tryDirs = [st.dir, (st.dir + 1) % 4, (st.dir + 3) % 4, (st.dir + 2) % 4];
      for (var ti = 0; ti < tryDirs.length && !a2; ti++) {
        a2 = attach(geom, st.rx, st.ry, tryDirs[ti], radius);
      }
    }
    if (a2) {
      a2._rev = geom.revision();
      return a2;
    }
    if (geom.isBlock(row, col)) {
      // 正面遇块且暂无可贴边:停在接触位置,下一模拟步/几何变化再尝试;不穿实心
      return st;
    }
    st.rx = nx; st.ry = ny;
    return st;
  }

  RA.BlockGeometry = { create: createGeometry };
  RA.SoulMotion = {
    DIRS: DIRS,
    availableDirections: availableDirections,
    loops: loops,
    attach: attach,
    step: step,
    sample: sample,
    nearestSeg: nearestSeg
  };
})(globalThis.RA = globalThis.RA || {});
