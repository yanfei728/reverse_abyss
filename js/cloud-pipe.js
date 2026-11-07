/* -*- coding: utf-8 -*- */
/*
 * cloud-pipe.js —— 云板端点与 2×3 石管共享几何
 * ==============================================
 * 模板只存 start/finish 两个 2×1 云板锚点;管内净空、两侧石墙、楼层原点
 * 都是派生的只读几何,不写回模板。World/LevelData/编辑器/标准试玩共用这里。
 */
(function (RA) {
  'use strict';
  var C = RA.C, TS = C.TS, P = C.PORT;
  var CLOUD = {
    profile: P.CLOUD_PROFILE,
    boardWidth: P.CLOUD_BOARD_WIDTH || 2,
    boardHeight: P.CLOUD_BOARD_HEIGHT || 1,
    innerHeight: P.CLOUD_INNER_HEIGHT || 3,
    wall: P.CLOUD_WALL || 1,
    gap: P.CLOUD_GAP || 4,
    clearance: P.CLOUD_CLEARANCE || 2
  };
  function isCloud(ports) { return !!(ports && ports.profile === CLOUD.profile); }
  function issue(code, path, message, cells) {
    var o = { code: code, path: path, message: message, severity: 'error' };
    if (cells) o.cells = cells;
    return o;
  }
  function tile(data, r, c) {
    try { return data.terrain.tiles[r][c]; } catch (e) { return null; }
  }
  function solid(t) { return t >= 1 && t <= 4; }
  function endpointValid(data, role) {
    var p = data.ports[role];
    var cols = data.size.cols, rows = data.size.rows;
    if (!p || !Number.isInteger(p.col) || !Number.isInteger(p.row)) {
      return issue('INVALID_PORT', '/ports/' + role, role + ' 需要整数 col/row');
    }
    if (p.col < 0 || p.row < 0 || p.col + CLOUD.boardWidth > cols || p.row >= rows) {
      return issue('INVALID_PORT', '/ports/' + role, role + ' 的 2×1 云板在 ' + cols + '×' + rows + ' 地图外');
    }
    for (var c = p.col; c < p.col + CLOUD.boardWidth; c++) {
      if (tile(data, p.row, c) !== 5) {
        return issue('INVALID_PORT', '/ports/' + role,
          role + ' 必须是连续两格云板(tileId=5);(' + c + ',' + p.row + ') 是 ' + tile(data, p.row, c),
          [{ col: c, row: p.row }]);
      }
    }
    return null;
  }
  function objectInRect(data, col, row, w, h) {
    var hits = [];
    (data.objects || []).forEach(function (o) {
      if (o.col >= col && o.col < col + w && o.row >= row && o.row < row + h) hits.push(o);
    });
    return hits;
  }
  function pathInRect(data, col, row, w, h) {
    var hits = [];
    (data.paths || []).forEach(function (p) {
      (p.points || []).forEach(function (pt) {
        if (pt.col >= col && pt.col < col + w && pt.row >= row && pt.row < row + h) hits.push({ path: p.id, point: pt });
      });
    });
    return hits;
  }
  function validate(data, purpose) {
    var out = [];
    if (!data || !data.ports) return out;
    if (!isCloud(data.ports)) return out; // 旧格式由旧校验/迁移处理
    var start = data.ports.start, finish = data.ports.finish;
    if (data.kind === 'boss') {
      if (!start) return [issue('INVALID_PORT', '/ports/start', 'Boss 必须有底部 start 云板')];
      var be = endpointValid(data, 'start');
      if (be) out.push(be);
      if (finish) out.push(issue('INVALID_PORT', '/ports/finish', '终局 Boss 不应有 finish/顶出口'));
      return out;
    }
    [['start', start], ['finish', finish]].forEach(function (x) {
      var e = endpointValid(data, x[0]);
      if (e) out.push(e);
    });
    if (!start || !finish) return out;
    if (!(start.row > finish.row)) {
      out.push(issue('INVALID_PORT', '/ports', 'start 必须位于 finish 下方(start.row > finish.row)',
        [{ col: start.col, row: start.row }, { col: finish.col, row: finish.row }]));
    }
    // 两侧普通实心
    [['start', start], ['finish', finish]].forEach(function (x) {
      var p = x[1];
      [[p.col - 1, '左'], [p.col + CLOUD.boardWidth, '右']].forEach(function (side) {
        if (side[0] < 0 || side[0] >= data.size.cols || !solid(tile(data, p.row, side[0]))) {
          out.push(issue('INVALID_PORT', '/ports/' + x[0],
            x[0] + ' 云板' + side[1] + '侧一格必须是普通实心地形(1~4)',
            [{ col: side[0], row: p.row }]));
        }
      });
    });
    // 端点必须在内容包络的顶/底行(允许外部空白)
    var top = -1, bottom = -1;
    for (var rr = 0; rr < data.size.rows; rr++) {
      for (var cc = 0; cc < data.size.cols; cc++) {
        if (solid(tile(data, rr, cc))) { if (top < 0) top = rr; bottom = rr; break; }
      }
    }
    if (top >= 0 && finish.row !== top) out.push(issue('INVALID_PORT', '/ports/finish',
      'finish 必须位于全图最高非空地形行(当前 ' + top + ')', [{ col: finish.col, row: finish.row }]));
    if (bottom >= 0 && start.row !== bottom) out.push(issue('INVALID_PORT', '/ports/start',
      'start 必须位于全图最低非空地形行(当前 ' + bottom + ')', [{ col: start.col, row: start.row }]));
    // 局部净空:起点上方 2 行、终点下方 2 行
    var checks = [
      { role: 'start', r0: start.row - CLOUD.clearance, r1: start.row - 1 },
      { role: 'finish', r0: finish.row + 1, r1: finish.row + CLOUD.clearance }
    ];
    checks.forEach(function (ck) {
      var p = data.ports[ck.role];
      for (var r = ck.r0; r <= ck.r1; r++) {
        for (var c = p.col; c < p.col + CLOUD.boardWidth; c++) {
          if (r < 0 || r >= data.size.rows) {
            out.push(issue('INVALID_PORT', '/ports/' + ck.role, ck.role + ' 净空超出地图', [{ col: c, row: r }]));
            continue;
          }
          if (solid(tile(data, r, c))) {
            out.push(issue('INVALID_PORT', '/ports/' + ck.role,
              ck.role + ' 的 2×2 净空被实心地形占用', [{ col: c, row: r }]));
          }
        }
      }
      var obs = objectInRect(data, p.col, ck.r0, CLOUD.boardWidth, CLOUD.clearance);
      if (obs.length) out.push(issue('INVALID_PORT', '/ports/' + ck.role,
        ck.role + ' 的净空被对象占用', obs.map(function (o) { return { col: o.col, row: o.row, object: o.id }; })));
      var paths = pathInRect(data, p.col, ck.r0, CLOUD.boardWidth, CLOUD.clearance);
      if (paths.length) out.push(issue('INVALID_PORT', '/ports/' + ck.role,
        ck.role + ' 的净空被路径占用', paths));
    });
    void purpose;
    return out;
  }

  function startPose(data, playerSize) {
    var w = (playerSize && playerSize.w) || 26;
    var fixed = data && data.extensions && data.extensions.fixedScene;
    if (fixed && fixed.playerSpawn) {
      var fs = fixed.playerSpawn;
      return { x: fs.centerCol * TS - w / 2, feet: fs.feetRow * TS, fixed: true };
    }
    if (!isCloud(data.ports) || !data.ports.start) return null;
    var p = data.ports.start;
    return {
      x: p.col * TS + CLOUD.boardWidth * TS / 2 - w / 2,
      feet: p.row * TS,
      col: p.col, row: p.row
    };
  }

  function nextOrigin(lower, upper, lowerOrigin) {
    if (!isCloud(lower.ports) || !isCloud(upper.ports)) return null;
    var a = lower.ports.finish, b = upper.ports.start;
    return {
      x: lowerOrigin.x + (a.col - b.col) * TS,
      y: lowerOrigin.y + (a.row - b.row - CLOUD.gap) * TS
    };
  }

  function buildLink(lower, upper, lowerOrigin, kind) {
    if (!isCloud(lower.ports) || !isCloud(upper.ports)) return null;
    var upperOrigin = nextOrigin(lower, upper, lowerOrigin);
    var finishY = lowerOrigin.y + lower.ports.finish.row * TS;
    var startY = finishY - CLOUD.gap * TS;
    var left = upperOrigin.x + upper.ports.start.col * TS;
    var inner = { x: left, y: startY + TS, w: CLOUD.boardWidth * TS, h: CLOUD.innerHeight * TS };
    var link = {
      kind: kind || 'stone-pipe',
      lowerIndex: lower.index,
      upperIndex: upper.index,
      upperOrigin: upperOrigin,
      finishY: finishY,
      startY: startY,
      commitY: startY,
      openingLeft: left,
      openingRight: left + CLOUD.boardWidth * TS,
      inner: inner,
      walls: null
    };
    if (link.kind === 'stone-pipe') {
      link.walls = [
        { x: inner.x - CLOUD.wall * TS, y: inner.y, w: CLOUD.wall * TS, h: CLOUD.innerHeight * TS },
        { x: inner.x + CLOUD.boardWidth * TS, y: inner.y, w: CLOUD.wall * TS, h: CLOUD.innerHeight * TS }
      ];
    }
    return link;
  }

  RA.CloudPipe = {
    CLOUD: CLOUD,
    isCloud: isCloud,
    validate: validate,
    startPose: startPose,
    bossPose: function (data, bossSize) {
      var f = data && data.extensions && data.extensions.fixedScene && data.extensions.fixedScene.boss;
      if (!f) return null;
      return { x: f.centerCol * TS - bossSize.w / 2, y: f.centerRow * TS - bossSize.h / 2 };
    },
    nextOrigin: nextOrigin,
    buildLink: buildLink
  };
})(globalThis.RA = globalThis.RA || {});
