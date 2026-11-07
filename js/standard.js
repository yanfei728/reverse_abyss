/* -*- coding: utf-8 -*- */
/*
 * standard.js —— 标准试玩(standard-v1)
 * =====================================
 * 从生成的安全入口支撑开始 → 作者关卡(真实接缝) → 生成的出口平台。
 * 无光环、无回复、冷却 20 秒;必须通过真实出口才写认证回执。
 * 认证只写入草稿,不自动发布;发布仍需作者在编辑器明确点击。
 */
(function (RA) {
  'use strict';
  var C = RA.C, TS = C.TS, W = 960, H = 540;
  function $(id) { return document.getElementById(id); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  var state = { session: null, handoff: null, assets: null, ctx: null, canvas: null,
    cam: { x: 0, y: 0 }, lastT: 0, cw: W, ch: H, dpr: 1,
    held: { left: false, right: false, jump: false }, done: false };

  function blank(c, r) { return Array.from({ length: r }, function () { return new Array(c).fill(0); }); }

  /** 生成的入口/出口平台:尺寸足够容纳接口开口,地面安全 */
  function supportFloor(id, title, entry, exit, rows) {
    rows = rows || 6;
    var cols = Math.max(8, Math.max(entry, exit) + RA.LevelData.PORT.openingCols + 2);
    var tiles = blank(cols, rows);
    for (var x = 0; x < cols; x++) tiles[rows - 1][x] = 1;
    for (var x2 = 2; x2 < Math.min(cols, 7); x2++) tiles[rows - 3][x2] = 1;
    return {
      schemaVersion: 2, id: id, kind: 'lobby', title: title, difficulty: null,
      size: { cols: cols, rows: rows }, spawn: { col: 2, row: rows - 2 },
      ports: { profile: 'vertical-v1', entry: { col: entry }, exit: { col: exit } },
      terrain: { tiles: tiles }, objects: [], paths: [],
      visuals: { backgroundId: 'sky1', decorations: [] },
      extensions: { standardSupport: true }, certification: null, contentHash: null
    };
  }

  /** B4 云板标准试玩夹具:2×1 起终点云板 + 两侧支撑,无地面/无隐形整条底板 */
  function supportCloud(id, title, startCol, finishCol) {
    var cols = Math.max(8, Math.max(startCol, finishCol) + 4);
    var rows = 5, tiles = blank(cols, rows);
    function cloud(col, row) {
      tiles[row][col] = 5; tiles[row][col + 1] = 5;
      if (col - 1 >= 0) tiles[row][col - 1] = 1;
      if (col + 2 < cols) tiles[row][col + 2] = 1;
    }
    cloud(startCol, rows - 1);
    cloud(finishCol, 0);
    return {
      schemaVersion: 2, id: id, kind: 'lobby', title: title, difficulty: null,
      size: { cols: cols, rows: rows }, spawn: null,
      ports: { profile: 'cloud-pipe-v2', start: { col: startCol, row: rows - 1 }, finish: { col: finishCol, row: 0 } },
      terrain: { tiles: tiles }, objects: [], paths: [],
      visuals: { backgroundId: 'sky1', decorations: [] },
      extensions: { standardSupport: true }, certification: null, contentHash: null
    };
  }

  RA.standard = { supportFloor: supportFloor, supportCloud: supportCloud };

  function loadHandoff() {
    try {
      var raw = sessionStorage.getItem('RA_STANDARD_V1');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function showError(text) {
    var box = $('std-error');
    if (box) { box.style.display = 'block'; box.textContent = text; }
  }

  function boot() {
    var h = loadHandoff();
    state.handoff = h;
    if (!h || !h.template) {
      showError('没有标准试玩数据。请在编辑器里点「标准试玩」开始。');
      return;
    }
    var t = h.template;
    var cloud = RA.CloudPipe && RA.CloudPipe.isCloud(t.ports);
    var entry = cloud ? supportCloud('std_entry', '标准入口', t.ports.start.col, t.ports.start.col)
      : supportFloor('std_entry', '标准入口', t.ports.entry.col, t.ports.entry.col, 6);
    var exit = cloud ? supportCloud('std_exit', '标准出口', t.ports.finish.col, t.ports.finish.col)
      : supportFloor('std_exit', '标准出口', t.ports.exit.col, t.ports.exit.col, 6);
    var floors = [entry, t, exit];
    var res = RA.GameSession.create({
      floors: floors, mode: 'standard', profile: 'standard-v1',
      rules: { rulesVersion: h.rulesVersion, rulesFingerprint: h.rulesFingerprint }
    });
    if (!res.ok) { showError('标准试玩不能启动:[' + res.error.code + '] ' + res.error.message); return; }
    state.session = res.value;
    state.canvas = $('std-canvas');
    state.ctx = state.canvas.getContext('2d');
    state.assets = new RA.Assets();
    state.assets.loadAll(function () { state.session.player.loadSprites(state.assets); });
    resize();
    globalThis.addEventListener('resize', resize);
    state.cam.x = state.session.player.x - state.cw / 2;
    state.cam.y = state.session.player.y - state.ch / 2;
    RA.standard.session = state.session;
    requestAnimationFrame(tick);
  }

  function resize() {
    var cv = state.canvas; if (!cv) return;
    state.cw = cv.clientWidth || W; state.ch = cv.clientHeight || H;
    state.dpr = globalThis.devicePixelRatio || 1;
    cv.width = Math.round(state.cw * state.dpr);
    cv.height = Math.round(state.ch * state.dpr);
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function render() {
    var ctx = state.ctx, s = state.session; if (!ctx || !s) return;
    var cam = state.cam;
    var g = ctx.createLinearGradient(0, 0, 0, state.ch);
    g.addColorStop(0, '#0a0f1e'); g.addColorStop(1, '#05060c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, state.cw, state.ch);
    (s.world.links || []).forEach(function (link) {
      if (!link || link.kind !== 'stone-pipe' || !link.walls) return;
      ctx.fillStyle = 'rgba(8,10,16,.9)'; ctx.fillRect(link.inner.x - cam.x, link.inner.y - cam.y, link.inner.w, link.inner.h);
      ctx.fillStyle = '#4b5563';
      link.walls.forEach(function (w) { ctx.fillRect(w.x - cam.x, w.y - cam.y, w.w, w.h); });
    });
    s.world.instances.forEach(function (inst) {
      inst.level.draw(ctx, { ox: cam.x - inst.origin.x, oy: cam.y - inst.origin.y, vw: state.cw, vh: state.ch }, state.assets);
      inst.objects.forEach(function (o) {
        var sx = inst.origin.x + (o.rx === undefined ? o.col * TS + TS / 2 : o.rx) - cam.x;
        var sy = inst.origin.y + (o.ry === undefined ? o.row * TS + TS / 2 : o.ry) - cam.y;
        if (o.type === 'fireball_static') {
          if (o.alive === false) return;
          ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.arc(sx, sy, (o.params.radiusTiles || 0.5) * TS, 0, Math.PI * 2); ctx.fill();
        } else if (o.type === 'gear') {
          ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(sx, sy, (o.params.radiusTiles || 0.5) * TS, 0, Math.PI * 2); ctx.fill();
        } else if (o.type === 'spike') {
          ctx.fillStyle = '#9aa8c7'; ctx.fillRect(sx - TS / 2 + 2, sy + TS / 2 - 12, TS - 4, 12);
        } else if (o.type === 'spring') {
          ctx.fillStyle = '#7ee0a8'; ctx.fillRect(sx - TS / 2 + 4, sy + TS / 2 - 10, TS - 8, 8);
        } else if (o.type === 'crumble_door' && !o.broken) {
          ctx.fillStyle = '#9c7bd8'; ctx.fillRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4);
        } else if (o.type === 'blink_platform' && o.state !== 'gone') {
          ctx.fillStyle = o.state === 'warning' ? '#ffd166' : '#7fb3ff';
          ctx.fillRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4);
        }
      });
    });
    var p = s.player;
    if (s.snapshot().haloActiveRemaining > 0) {
      ctx.strokeStyle = 'rgba(126,224,168,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x + p.w / 2 - cam.x, p.y + p.h / 2 - cam.y,
        (RA.RULES.tuning.haloRadiusTiles || 1.5) * TS, 0, Math.PI * 2); ctx.stroke();
    }
    if (Object.keys(p.frames || {}).length) p.draw(ctx, { ox: cam.x, oy: cam.y }, state.assets);
    else { ctx.fillStyle = '#ffcd6e'; ctx.fillRect(p.x - cam.x, p.y - cam.y, p.w, p.h); }
  }

  function hud() {
    var s = state.session; if (!s) return;
    var snap = s.snapshot();
    var el = $('std-hud');
    if (el) el.textContent = '标准试玩 · 第 ' + (snap.floorIndex + 1) + '/' + snap.floorCount +
      ' 层 · 生命 ' + Math.max(0, snap.hp) + '/' + snap.maxHp +
      ' · ' + (snap.haloActiveRemaining > 0 ? '光环 ' + snap.haloActiveRemaining.toFixed(1) + 's'
        : (snap.haloCooldownRemaining > 0 ? '技能冷却 ' + snap.haloCooldownRemaining.toFixed(1) + 's' : '光环就绪(K)'));
  }

  function complete() {
    if (state.done) return;
    state.done = true;
    var h = state.handoff;
    var template = h.template;
    var hash = RA.LevelData.hashSync(template);
    if (hash !== h.contentHash) {
      showError('标准试玩内容 hash 与发起时不一致;不生成认证');
      $('std-result').style.display = 'flex';
      return;
    }
    var repo = RA.ContentRepository ? RA.ContentRepository.create() : null;
    if (!repo) { showError('浏览器存储不可用,无法保存认证'); return; }
    var cert = {
      contentHash: hash,
      rulesVersion: h.rulesVersion,
      rulesFingerprint: h.rulesFingerprint,
      profileId: 'standard-v1',
      status: 'passed',
      completedAt: new Date().toISOString(),
      source: 'local-playtest'
    };
    repo.loadDraft(h.draftId).then(function (loaded) {
      if (!loaded.ok || !loaded.value) { showError('找不到标准试玩对应的草稿'); return; }
      if (loaded.value.revision !== h.revision) {
        showError('草稿 revision 已变化;这次标准试玩结果不写入,请重新开始');
        return;
      }
      var data = clone(template);
      data.certification = cert;
      return repo.saveDraft(h.draftId, data, h.revision).then(function (saved) {
        if (!saved.ok) { showError('认证写回草稿失败:[' + saved.error.code + '] ' + saved.error.message); return; }
        var box = $('std-result');
        if (box) box.style.display = 'flex';
        var txt = $('std-result-text');
        if (txt) txt.textContent = '标准试玩通过,认证已写入草稿 revision ' + saved.value.revision +
          '。回到编辑器点击「发布」才会进入正式池。';
        var link = $('std-back'); if (link) link.style.display = 'inline-block';
      });
    });
  }

  function tick(now) {
    var dt = state.lastT ? (now - state.lastT) / 1000 : 0;
    state.lastT = now;
    if (dt > 0.25) dt = 0.25;
    var s = state.session;
    if (s) {
      if (!s.paused && s.status === 'running') {
        s.setActions({ left: state.held.left, right: state.held.right, jumpHeld: state.held.jump });
        s.update(dt);
        if (s.floorIndex === 2 && !state.done) {
          s.win('standardExit');
          complete();
        }
        if (s.status === 'dead' && !state.done) {
          state.done = true;
          var ov = $('std-result');
          if (ov) ov.style.display = 'flex';
          var tt = $('std-result-text');
          if (tt) tt.textContent = '标准试玩失败(死亡);认证未生成。回编辑器重新开始。';
        }
        var p = s.player;
        var tx = p.x + p.w / 2 - state.cw / 2;
        var ty = p.y + p.h / 2 - state.ch / 2;
        var k = Math.min(1, dt * 7);
        state.cam.x += (tx - state.cam.x) * k;
        state.cam.y += (ty - state.cam.y) * k;
      }
      render();
      hud();
    }
    requestAnimationFrame(tick);
  }

  var KEY_LEFT = { ArrowLeft: 1, KeyA: 1 }, KEY_RIGHT = { ArrowRight: 1, KeyD: 1 };
  var KEY_JUMP = { Space: 1, ArrowUp: 1, KeyW: 1 };
  globalThis.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (KEY_LEFT[e.code]) { state.held.left = true; e.preventDefault(); }
    if (KEY_RIGHT[e.code]) { state.held.right = true; e.preventDefault(); }
    if (KEY_JUMP[e.code]) { state.held.jump = true; e.preventDefault(); }
    if (e.code === 'KeyK') { e.preventDefault(); if (state.session) state.session.pressSkill(); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (state.session) { if (state.session.paused) state.session.resume(); else state.session.pause(); } }
  });
  globalThis.addEventListener('keyup', function (e) {
    if (KEY_LEFT[e.code]) state.held.left = false;
    if (KEY_RIGHT[e.code]) state.held.right = false;
    if (KEY_JUMP[e.code]) state.held.jump = false;
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.RA = globalThis.RA || {});
