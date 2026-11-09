/* -*- coding: utf-8 -*- */
/*
 * trial-plan.js —— 编辑器单关试玩计划(入口支撑→当前模板→出口支撑)
 * ================================================================
 * 开发/标准共用;支撑只用云板/石管,不含怪物/奖励/认证。完成只在
 * subject→exit-support 的真实 floorEntered 事件上发生。
 */
(function (RA) {
  'use strict';
  var TS = RA.C.TS;
  function blank(c, r) { return Array.from({ length: r }, function () { return new Array(c).fill(0); }); }
  function support(id, title, startCol, finishCol, kind) {
    var cols = Math.max(8, Math.max(startCol, finishCol) + 4), rows = 5;
    var tiles = blank(cols, rows);
    function cloud(col, row) {
      tiles[row][col] = 5; tiles[row][col + 1] = 5;
      if (col - 1 >= 0) tiles[row][col - 1] = 1;
      if (col + 2 < cols) tiles[row][col + 2] = 1;
    }
    cloud(startCol, rows - 1); cloud(finishCol, 0);
    return {
      schemaVersion: 2, id: id, title: title, kind: kind || 'lobby', difficulty: null,
      size: { cols: cols, rows: rows }, spawn: null,
      ports: { profile: 'cloud-pipe-v2', start: { col: startCol, row: rows - 1 }, finish: { col: finishCol, row: 0 } },
      terrain: { tiles: tiles }, objects: [], paths: [],
      visuals: { backgroundId: 'sky1', decorations: [] },
      extensions: { trialSupport: true }, certification: null, contentHash: null
    };
  }
  function build(handoff) {
    if (!handoff || handoff.kind !== 'editor-single-level' || !handoff.template) {
      return { ok: false, error: { code: 'TRIAL_HANDOFF', message: '缺少单关试玩数据;请从编辑器重新开始' } };
    }
    if (handoff.version !== 2) return { ok: false, error: { code: 'TRIAL_VERSION', message: '试玩数据结构过期;请从编辑器重新开始' } };
    var mode = handoff.mode;
    if (mode !== 'development' && mode !== 'standard') return { ok: false, error: { code: 'TRIAL_MODE', message: '未知试玩模式' } };
    var t = handoff.template;
    if (!t.ports || !RA.CloudPipe || !RA.CloudPipe.isCloud(t.ports) || !t.ports.start || !t.ports.finish) {
      return { ok: false, error: { code: 'TRIAL_PORTS', message: '当前模板缺少完整 start/finish,不能生成单关试玩' } };
    }
    var entry = support('trial_entry', '入口支撑', t.ports.start.col, t.ports.start.col, 'lobby');
    var exit = support('trial_exit', '出口支撑', t.ports.finish.col, t.ports.finish.col, 'lobby');
    // 入口支撑 finish→模板 start 使用正常石管;模板 finish→出口支撑 start。
    var plan = {
      mode: mode,
      profileId: mode === 'standard' ? 'standard-v1' : 'run-v1',
      subjectRef: handoff.subjectRef || { levelId: t.id, contentHash: t.contentHash || null },
      draftRef: handoff.draftRef || null,
      rules: handoff.rules || null,
      floors: [entry, t, exit],
      roles: ['entry-support', 'subject', 'exit-support'],
      completion: { fromIndex: 1, toIndex: 2 }
    };
    return { ok: true, value: plan };
  }
  RA.TrialPlan = { build: build };
})(globalThis.RA = globalThis.RA || {});
