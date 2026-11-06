/* -*- coding: utf-8 -*- */
/*
 * reach.js —— "这一层爬得上去吗":可达性分析
 * ===========================================
 * 设计向上爬的关卡最怕的就是"有一段谁也上不去"。这个模块干两件事:
 *
 *   ① envelope(dyUp, dx) —— 保守的**跳跃包络**:比现在高 dyUp 像素、
 *      横向差 dx 像素的那个落脚点,理论上够不够得着。
 *      数字是从 config 里的物理参数推出来的(一段跳约 150px、二段跳约 300px),
 *      故意留了余量 —— 它说"够不着"就一定够不着。
 *
 *   ② path(level) —— 从出生点那块地板到出口那块地板的路线。
 *      先把"同一行上连成一排"的地面合成一块块**平台**(不然一条 15 格宽的地面
 *      会变成 15 个点,白算一堆),再用**真的物理**(Player.update)一跳跃一跳跃
 *      地模拟:助跑几帧、起跳、按多久松手、要不要空中补一跳,扫几组时机,
 *      只要有一组能稳稳站上目标平台,这一跳就算成立。
 *
 *   所以它给出的"爬得上去"不是估算,是模拟出来的。
 *   tools/check_levels.mjs 用它逐跳打印;js/smoke.js 用它守住关卡池。
 */
(function (RA) {
  'use strict';

  var DT = 1 / 60;

  // ---------- ① 跳跃包络 ----------
  /*
   * 这里有两个东西,别搞混:
   *   couldReach(dyUp, dx) —— **必要条件**,只用来粗筛掉明显不可能的候选
   *                           (差 10 格高、隔 20 格远这种)。必须宽松:宁可多模拟几次,
   *                           也不能把真能跳上去的边拦掉。
   *   envelope(dyUp, dx)   —— **保守估计**,只在关掉物理模拟(--no-sim)时当结论用。
   *
   * 以前只有一个 envelope,而且被 findHop 当成硬门槛,于是有两处会误杀:
   *   · 那张表不单调:往上 135px 时横向限 170px,往上 180px 反而放宽到 320px;
   *   · 横向距离取的是"目标平台中心",宽平台会算出远超实际需要的距离。
   * 结果是一层本来爬得上去的关卡被报成"爬不上去"。现在粗筛用 couldReach,
   * 结论一律以真物理模拟为准。
   */
  function couldReach(dyUp, dx) {
    var adx = Math.abs(dx);
    if (dyUp > 310) return false;          // 二段跳也就约 300px 高
    if (dyUp <= 0) return adx <= 640;      // 往下掉 / 平着走:横向很宽松
    return adx <= 520;                     // 滞空最久约 1.4s,空中最快 300px/s
  }

  /** 保守估计(不跑物理模拟时才当结论):跳得越高,横向能给的距离越小 */
  function envelope(dyUp, dx) {
    var adx = Math.abs(dx);
    if (dyUp > 300) return false;
    if (dyUp <= 0) return adx <= 420;
    if (dyUp <= 80) return adx <= 280;
    if (dyUp <= 150) return adx <= 200;
    if (dyUp <= 230) return adx <= 150;
    return adx <= 90;
  }

  /** 两块落脚面之间的横向空隙(重叠就是 0,和"到中心"不一样) */
  function gapX(A, B) {
    if (B.left > A.right) return B.left - A.right;
    if (B.right < A.left) return A.left - B.right;
    return 0;
  }

  // ---------- 平台:同一行上连成一排的地面算一块 ----------
  function platforms(level) {
    var surf = level.surfaces();
    surf.sort(function (a, b) { return a.row - b.row || a.col - b.col; });
    var list = [];
    surf.forEach(function (s) {
      var last = list[list.length - 1];
      if (last && last.row === s.row && last.col1 === s.col - 1) last.col1 = s.col;
      else list.push({ row: s.row, col0: s.col, col1: s.col });
    });
    list.forEach(function (p) {
      p.tile = level.tile;
      p.top = p.row * level.tile;                // 站上去时脚底的 y
      p.left = p.col0 * level.tile;
      p.right = (p.col1 + 1) * level.tile;
      p.cx = (p.left + p.right) / 2;
    });
    return list;
  }

  function platformOf(list, col, row) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].row === row && col >= list[i].col0 && col <= list[i].col1) return i;
    }
    return -1;
  }

  // ---------- ② 用真物理模拟"从 A 跳到 B" ----------
  /**
   * lead:起跳前先朝目标跑多少帧(助跑)
   * hold:起跳键按住多少帧(决定跳多高)
   * dj  :松手之后隔多少帧再按一次(>0 = 二段跳)
   * 这一组按"最可能成功"的顺序排列,通常第一两组就能过。
   */
  function hopParams() {
    var out = [];
    [2, 6, 10, 0, 14].forEach(function (lead) {
      out.push({ lead: lead, hold: 21, dj: 0 });
    });
    [2, 6, 10].forEach(function (lead) {
      out.push({ lead: lead, hold: 21, dj: 2 });
      out.push({ lead: lead, hold: 9, dj: 2 });
    });
    [2, 6].forEach(function (lead) {
      out.push({ lead: lead, hold: 4, dj: 0 });
      out.push({ lead: lead, hold: 21, dj: 14 });
    });
    return out;
  }

  /** 从 A 块的哪一格起跳:优先离 B 最近的那一格 */
  function startCols(A, B) {
    var mid = (B.col0 + B.col1) / 2;
    var near = RA.clamp(Math.round(mid), A.col0, A.col1);
    var cols = [near];
    if (A.col0 !== near) cols.push(A.col0);
    if (A.col1 !== near) cols.push(A.col1);
    return cols;
  }

  function simulateHop(level, A, B, col, prm) {
    var tile = level.tile;
    var p = new RA.Player(level);
    p.x = col * tile + (tile - p.w) / 2;
    p.y = A.top - p.h;
    p.vx = p.vy = 0;
    p.onGround = true;
    p.coyote = p.COYOTE_TIME;

    var input = { left: false, right: false, jump: false };
    var ctx = { player: p, snd: null };
    var goalLeft = B.left - 3, goalRight = B.right + 3;

    // 弹簧之类带冷却的机关,每次模拟前复位
    for (var i = 0; i < level.entities.length; i++) {
      if (level.entities[i].cool !== undefined) level.entities[i].cool = 0;
    }

    var second = prm.lead + prm.hold + (prm.dj || 0);
    for (var f = 0; f < 170; f++) {
      // ---- 跳跃按键:到点按下、到点松开(hold 决定跳多高,dj 决定什么时候补二段跳)----
      input.jump = (f >= prm.lead && f < prm.lead + prm.hold) ||
        (prm.dj > 0 && f >= second && f < second + prm.hold);

      // ---- 横向:像人一样"朝落点推,进了平台范围就松开刹车" ----
      // 还在平台底下时先挪到平台外侧,免得一头顶在平台肚子上。
      var inside = p.cx > B.left && p.cx < B.right;
      var below = p.feet > B.top + 2;
      var aimX;
      if (below && inside) aimX = (p.cx < B.cx) ? (B.left - 24) : (B.right + 24);
      else if (p.cx < B.left + 6) aimX = B.left + 6;
      else if (p.cx > B.right - 6) aimX = B.right - 6;
      else aimX = p.cx;
      var d = aimX - p.cx;
      if (d > 8) { input.right = true; input.left = false; }
      else if (d < -8) { input.left = true; input.right = false; }
      else if (p.vx > 30) { input.left = true; input.right = false; }
      else if (p.vx < -30) { input.right = true; input.left = false; }
      else { input.left = false; input.right = false; }

      p.update(DT, input, ctx);
      for (var k = 0; k < level.entities.length; k++) level.entities[k].update(DT, ctx);

      if (p.onGround && Math.abs(p.feet - B.top) < 1.5 &&
        p.x + p.w > goalLeft && p.x < goalRight) {
        return { ok: true, frames: f };
      }
      if (p.y > level.worldH + 240) break;              // 掉出世界了
    }
    return { ok: false, frames: 0 };
  }

  /** A 能不能跳到 B:把"起跳格 × 时机"扫一遍 */
  function findHop(level, A, B) {
    var dyUp = A.top - B.top;
    var dx = gapX(A, B);
    if (!couldReach(dyUp, dx)) {
      return { ok: false, reason: '差得太远(高度/距离超出可能范围)', dyUp: dyUp, dx: dx };
    }
    var cols = startCols(A, B);
    var params = hopParams();
    for (var c = 0; c < cols.length; c++) {
      for (var i = 0; i < params.length; i++) {
        var r = simulateHop(level, A, B, cols[c], params[i]);
        if (r.ok) {
          return {
            ok: true, frames: r.frames, params: params[i], col: cols[c],
            dyUp: dyUp, dx: dx
          };
        }
      }
    }
    return { ok: false, reason: '模拟里跳不过去', dyUp: dyUp, dx: dx };
  }

  /**
   * 从出生点那块地板走到出口那块地板的路线。
   * opts: {sim:true 用真物理验证每一跳 / maxDx,maxDy 候选范围(格)}
   * 返回 {ok, path:[平台], hops:[{from,to,info}], reason, platforms}
   */
  function path(level, opts) {
    opts = opts || {};
    var sim = opts.sim !== false;
    var maxDx = opts.maxDx === undefined ? 7 : opts.maxDx;
    var maxDy = opts.maxDy === undefined ? 7 : opts.maxDy;

    var list = platforms(level);
    var si = platformOf(list, level.spawnCol, level.spawnRow);
    var gi = platformOf(list, level.goalCol, level.goalRow);
    if (si < 0) return { ok: false, reason: '出生点不在可站的地面上', platforms: list };
    if (gi < 0) return { ok: false, reason: '出口不在可站的地面上', platforms: list };
    if (si === gi) return { ok: true, path: [list[si]], hops: [], platforms: list };

    var came = {}, hopInfo = {}, hopCache = {};
    came[si] = -1;
    var queue = [si];

    while (queue.length) {
      var cur = queue.shift();
      var a = list[cur];
      var cand = [];
      for (var j = 0; j < list.length; j++) {
        if (j === cur) continue;
        var b = list[j];
        if (b.col0 - a.col1 > maxDx || a.col0 - b.col1 > maxDx) continue;
        if (a.row - b.row > maxDy || b.row - a.row > maxDy) continue;
        var dyUp = a.top - b.top;
        var dx = gapX(a, b);
        if (!couldReach(dyUp, dx)) continue;
        cand.push(j);
      }
      // 离出口更近的先试
      cand.sort(function (x, y) {
        var bx = list[x], by = list[y];
        return (Math.abs(bx.cx - list[gi].cx) + Math.abs(bx.row - list[gi].row) * 2) -
          (Math.abs(by.cx - list[gi].cx) + Math.abs(by.row - list[gi].row) * 2);
      });

      for (var n = 0; n < cand.length; n++) {
        var k = cand[n];
        if (came[k] !== undefined) continue;
        var key = cur + '>' + k;
        if (hopCache[key] === undefined) {
          hopCache[key] = sim ? findHop(level, list[cur], list[k]) : { ok: true };
        }
        hopInfo[key] = hopCache[key];
        if (!hopCache[key].ok) continue;
        came[k] = cur;
        if (k === gi) { queue.length = 0; break; }
        queue.push(k);
      }
    }

    if (came[gi] === undefined) {
      var best = null;
      Object.keys(came).forEach(function (idx) {
        var s = list[idx];
        if (!best || s.row < best.row) best = s;
      });
      return {
        ok: false, reason: '从起点出发到不了出口',
        highest: best, platforms: list, reachedCount: Object.keys(came).length
      };
    }

    var hops = [];
    var node = gi;
    while (came[node] !== -1) {
      var prev = came[node];
      hops.unshift({ from: list[prev], to: list[node], info: hopInfo[prev + '>' + node] });
      node = prev;
    }
    var route = [list[si]];
    hops.forEach(function (h) { route.push(h.to); });
    return { ok: true, path: route, hops: hops, platforms: list };
  }

  RA.Reach = {
    envelope: envelope,
    couldReach: couldReach,
    gapX: gapX,
    platforms: platforms,
    findHop: findHop,
    simulateHop: simulateHop,
    path: path,
    hopParams: hopParams
  };
})(globalThis.RA = globalThis.RA || {});
