/* -*- coding: utf-8 -*- */
/*
 * short.js —— PC 短塔入口(开发短塔 / 正式短塔)
 * ===============================================
 * 页面只做菜单、键盘、渲染与结果;模拟/生命/技能/Boss 全在 GameSession。
 * 开发短塔使用未认证 B2 模板,明确标注;正式短塔只从已发布+已认证普通层抽选,
 * 固定大厅/休整/Boss 场景来自内置模板。死亡回大厅,重试同一 manifest。
 */
(function (RA) {
  'use strict';
  var C = RA.C, TS = C.TS, W = 960, H = 540;
  function $(id) { return document.getElementById(id); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  var state = {
    session: null,
    floors: [],
    manifest: null,
    mode: 'dev',
    assets: null,
    paused: false,
    overlay: '',
    cam: { x: 0, y: 0 },
    canvas: null,
    ctx: null,
    held: { left: false, right: false, jump: false },
    lastT: 0,
    dpr: 1,
    cw: W, ch: H
  };
  RA.short = { state: state };

  function hasSamples() {
    var s = RA.B2_SAMPLES;
    return s && s.lobby && s.normal1 && s.normal2 && s.normal3 && s.rest && s.boss;
  }

  function fixedFloors() {
    var s = RA.B2_SAMPLES;
    return { lobby: clone(s.lobby), rest: clone(s.rest), boss: clone(s.boss) };
  }

  function devFloors() {
    var s = RA.B2_SAMPLES;
    return ['lobby', 'normal1', 'normal2', 'normal3', 'rest', 'boss'].map(function (k) {
      return clone(s[k]);
    });
  }

  function showMenu() {
    state.session = null;
    state.overlay = '';
    var menu = $('menu');
    if (menu) menu.style.display = 'flex';
    var pause = $('pause-overlay');
    if (pause) pause.style.display = 'none';
    var result = $('result-overlay');
    if (result) result.style.display = 'none';
    var hud = $('hud');
    if (hud) hud.style.display = 'none';
    var msg = $('menu-status');
    if (msg) msg.textContent = RA.short.lastMessage || '';
  }

  function start(floors, manifest, mode) {
    if (!hasSamples()) {
      $('menu-status').textContent = '缺少开发模板 js/b2-samples.js;运行 node tools/sync_b2_levels.mjs';
      return false;
    }
    var res = RA.GameSession.create({
      floors: floors, mode: mode, manifest: manifest || null, profile: 'run-v1'
    });
    if (!res.ok) {
      $('menu-status').textContent = '短塔启动失败:[' + res.error.code + '] ' + res.error.message;
      return false;
    }
    state.session = res.value;
    if (state.assets) state.session.player.loadSprites(state.assets);
    state.floors = floors;
    state.manifest = manifest || null;
    state.mode = mode;
    state.paused = false;
    state.held = { left: false, right: false, jump: false };
    state.lastT = 0;
    state.cam.x = state.session.player.x - state.cw / 2;
    state.cam.y = state.session.player.y - state.ch / 2;
    var menu = $('menu'); if (menu) menu.style.display = 'none';
    var hud = $('hud'); if (hud) hud.style.display = 'flex';
    var pause = $('pause-overlay'); if (pause) pause.style.display = 'none';
    var result = $('result-overlay'); if (result) result.style.display = 'none';
    RA.short.lastMessage = '';
    return true;
  }

  async function startDev() {
    var s = RA.B2_SAMPLES;
    var floors = devFloors();
    var manifest = {
      manifestId: 'dev-short-v1',
      profile: 'short-v1',
      dev: true,
      floors: floors.map(function (f) { return { levelId: f.id, contentHash: f.contentHash }; })
    };
    return start(floors, manifest, 'short-dev');
  }

  async function startFormal() {
    var repo = RA.short.repo;
    if (!repo) { $('menu-status').textContent = '浏览器草稿/发布库不可用'; return false; }
    var eligible = await repo.listEligible({ difficulty: 1, rules: RA.RULES });
    if (!eligible.ok) {
      $('menu-status').textContent = '读取正式池失败:[' + eligible.error.code + '] ' + eligible.error.message;
      return false;
    }
    if (!eligible.value.length) {
      $('menu-status').textContent = '正式池还没有已认证并发布的普通层。请先在编辑器制作、标准试玩通关并发布;或用开发短塔。';
      return false;
    }
    var fixed = fixedFloors();
    var plan = RA.TowerPlanner.build({
      profile: 'short-v1', seed: Date.now(), fixedLevels: fixed,
      candidates: eligible.value, rules: RA.RULES
    });
    if (!plan.ok) {
      $('menu-status').textContent = '抽塔失败:[' + plan.error.code + '] ' + plan.error.message;
      return false;
    }
    var floors = plan.value.floors.map(function (f) { return clone(f.data); });
    return start(floors, plan.value, 'short-formal');
  }

  function retrySame() {
    if (!state.floors.length) { showMenu(); return; }
    start(state.floors, state.manifest, state.mode);
  }

  function setPaused(paused, reason) {
    if (!state.session) return;
    if (paused) { state.session.pause(); state.paused = true; }
    else { state.paused = false; state.session.resume(); }
    var ov = $('pause-overlay');
    if (ov) ov.style.display = paused ? 'flex' : 'none';
    var r = $('pause-reason'); if (r && reason) r.textContent = reason;
  }

  function togglePause() {
    if (!state.session || state.session.status !== 'running') return;
    setPaused(!state.session.paused, '手动暂停');
  }

  function finish(kind) {
    var ov = $('result-overlay');
    if (!ov) return;
    ov.style.display = 'flex';
    $('result-title').textContent = kind === 'won' ? '短塔通过' : '死亡';
    $('result-text').textContent = kind === 'won'
      ? '开发短塔/正式短塔已通关。未通过标准试玩的草稿不会因此获得认证。'
      : '已回到大厅状态。可以重试同一座塔,不会重新抽选。';
    $('btn-retry').style.display = kind === 'dead' ? 'inline-block' : 'none';
  }

  // ---------------- 输入 ----------------
  var KEY_LEFT = { ArrowLeft: 1, KeyA: 1 };
  var KEY_RIGHT = { ArrowRight: 1, KeyD: 1 };
  var KEY_JUMP = { Space: 1, ArrowUp: 1, KeyW: 1 };
  globalThis.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
    if (e.code === 'KeyK') { e.preventDefault(); if (state.session) state.session.pressSkill(); return; }
    if (KEY_LEFT[e.code]) { e.preventDefault(); state.held.left = true; }
    if (KEY_RIGHT[e.code]) { e.preventDefault(); state.held.right = true; }
    if (KEY_JUMP[e.code]) { e.preventDefault(); state.held.jump = true; }
  });
  globalThis.addEventListener('keyup', function (e) {
    if (KEY_LEFT[e.code]) state.held.left = false;
    if (KEY_RIGHT[e.code]) state.held.right = false;
    if (KEY_JUMP[e.code]) state.held.jump = false;
  });
  globalThis.addEventListener('blur', function () {
    state.held = { left: false, right: false, jump: false };
    if (state.session && state.session.status === 'running' && !state.session.paused) {
      setPaused(true, '窗口失焦,已暂停');
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state.session && !state.session.paused) {
      setPaused(true, '页面切到后台,已暂停');
    }
  });

  // ---------------- 渲染 ----------------
  function resize() {
    var cv = state.canvas;
    if (!cv) return;
    state.cw = cv.clientWidth || W;
    state.ch = cv.clientHeight || H;
    state.dpr = globalThis.devicePixelRatio || 1;
    cv.width = Math.round(state.cw * state.dpr);
    cv.height = Math.round(state.ch * state.dpr);
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function drawObject(ctx, inst, o, cam) {
    var x = o.rx !== undefined ? o.rx : o.col * TS + TS / 2;
    var y = o.ry !== undefined ? o.ry : o.row * TS + TS / 2;
    var sx = inst.origin.x + x - cam.x;
    var sy = inst.origin.y + y - cam.y;
    if (o.type === 'fireball_static') {
      if (!o.alive) return;
      ctx.fillStyle = '#ff7043';
      ctx.beginPath(); ctx.arc(sx, sy, (o.params.radiusTiles || 0.5) * TS, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'gear') {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(sx, sy, (o.params.radiusTiles || 0.5) * TS, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b4f00'; ctx.lineWidth = 2; ctx.stroke();
    } else if (o.type === 'spring') {
      ctx.fillStyle = '#7ee0a8';
      ctx.fillRect(sx - TS / 2 + 4, sy + TS / 2 - 10, TS - 8, 8);
    } else if (o.type === 'spike') {
      ctx.fillStyle = '#9aa8c7';
      var base = sy + TS / 2 - 12;
      ctx.fillRect(sx - TS / 2 + 2, base, TS - 4, 12);
      if (o.state === 'active') {
        ctx.fillStyle = '#ff8a65';
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(sx - TS / 2 + 5 + i * 12, base);
          ctx.lineTo(sx - TS / 2 + 11 + i * 12, base - 16);
          ctx.lineTo(sx - TS / 2 + 17 + i * 12, base);
          ctx.fill();
        }
      }
    } else if (o.type === 'crumble_door') {
      if (o.broken) return;
      ctx.fillStyle = '#9c7bd8';
      ctx.fillRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4);
    } else if (o.type === 'blink_platform') {
      if (o.state === 'gone') return;
      ctx.fillStyle = o.state === 'warning' ? '#ffd166' : '#7fb3ff';
      ctx.fillRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4);
    }
  }

  function render() {
    var ctx = state.ctx;
    if (!ctx || !state.session) return;
    var cam = state.cam;
    var g = ctx.createLinearGradient(0, 0, 0, state.ch);
    g.addColorStop(0, '#0a0f1e'); g.addColorStop(1, '#05060c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, state.cw, state.ch);
    var insts = state.session.world.instances;
    Array.from(insts.keys()).sort(function (a, b) { return a - b; }).forEach(function (i) {
      var inst = insts.get(i);
      if (inst.state === 'snapshot') {
        inst.level.draw(ctx, { ox: cam.x - inst.origin.x, oy: cam.y - inst.origin.y, vw: state.cw, vh: state.ch }, state.assets);
        return;
      }
      inst.level.draw(ctx, { ox: cam.x - inst.origin.x, oy: cam.y - inst.origin.y, vw: state.cw, vh: state.ch }, state.assets);
      inst.objects.forEach(function (o) { drawObject(ctx, inst, o, cam); });
      var openL = inst.origin.x + inst.exitCol * TS - cam.x;
      var openR = openL + RA.LevelData.PORT.openingCols * TS;
      ctx.strokeStyle = inst.exitOpen === false ? 'rgba(255,120,100,.7)' : 'rgba(255,205,110,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(openL, inst.origin.y - cam.y); ctx.lineTo(openR, inst.origin.y - cam.y); ctx.stroke();
    });
    // boss + hazards
    var boss = state.session.boss;
    if (boss && !boss.defeated) {
      ctx.fillStyle = boss.state === 'exposed' ? '#ff9f43' : '#b06bff';
      ctx.fillRect(boss.x - cam.x, boss.y - cam.y, boss.w, boss.h);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(boss.state === 'exposed' ? 'EXPOSED' : ('SHIELD ' + boss.shieldRemaining.toFixed(1)),
        boss.x - cam.x, boss.y - cam.y - 8);
      boss.hazards.forEach(function (h) {
        if (h.type === 'laser') {
          ctx.fillStyle = 'rgba(255,80,80,.35)';
          ctx.fillRect(h.x - cam.x, h.y - cam.y, h.w, h.h);
        } else {
          ctx.fillStyle = 'rgba(255,120,80,.85)';
          ctx.beginPath(); ctx.arc(h.x - cam.x, h.y - cam.y, h.r, 0, Math.PI * 2); ctx.fill();
        }
      });
    }
    var p = state.session.player;
    if (Object.keys(p.frames || {}).length) p.draw(ctx, { ox: cam.x, oy: cam.y }, state.assets);
    else { ctx.fillStyle = '#ffcd6e'; ctx.fillRect(p.x - cam.x, p.y - cam.y, p.w, p.h); }
  }

  function updateHud() {
    var s = state.session; if (!s) return;
    var snap = s.snapshot();
    var fill = $('hp-fill'); if (fill) fill.style.width = Math.max(0, snap.hp / snap.maxHp * 100) + '%';
    var hp = $('hp-text'); if (hp) hp.textContent = Math.max(0, Math.round(snap.hp)) + '/' + snap.maxHp;
    var halo = $('halo-text');
    if (halo) {
      if (snap.haloActiveRemaining > 0) halo.textContent = '光环 ' + snap.haloActiveRemaining.toFixed(1) + 's';
      else if (snap.haloCooldownRemaining > 0) halo.textContent = '冷却 ' + snap.haloCooldownRemaining.toFixed(1) + 's';
      else halo.textContent = '光环就绪 (K)';
    }
    var fl = $('floor-text');
    if (fl) fl.textContent = '第 ' + (snap.floorIndex + 1) + '/' + snap.floorCount + ' 层 · ' + (snap.floor ? snap.floor.kind : '');
    var bs = $('boss-text');
    if (bs) {
      if (snap.boss) bs.textContent = 'Boss 阶段 ' + snap.boss.phase + ' · ' + snap.boss.state +
        (snap.boss.state === 'shielded' ? ' ' + snap.boss.shieldRemaining.toFixed(1) + 's' : '');
      else bs.textContent = '';
    }
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
        var p = s.player;
        var tx = p.x + p.w / 2 - state.cw / 2;
        var ty = p.y + p.h / 2 - state.ch / 2;
        var k = Math.min(1, dt * 7);
        state.cam.x += (tx - state.cam.x) * k;
        state.cam.y += (ty - state.cam.y) * k;
      }
      s.drainEvents().forEach(function (ev) {
        if (ev.type === 'dead') finish('dead');
        if (ev.type === 'won') finish('won');
      });
      render();
      updateHud();
    }
    requestAnimationFrame(tick);
  }

  function boot() {
    state.canvas = $('short-canvas');
    state.ctx = state.canvas.getContext('2d');
    state.assets = new RA.Assets();
    resize();
    globalThis.addEventListener('resize', resize);
    state.assets.loadAll(function () { if (state.session) state.session.player.loadSprites(state.assets); });
    RA.short.repo = RA.ContentRepository ? RA.ContentRepository.create() : null;
    var startDevBtn = $('btn-dev');
    if (startDevBtn) startDevBtn.addEventListener('click', function () { startDev(); });
    var startFormalBtn = $('btn-formal');
    if (startFormalBtn) startFormalBtn.addEventListener('click', function () { startFormal(); });
    var retryBtn = $('btn-retry');
    if (retryBtn) retryBtn.addEventListener('click', function () { retrySame(); });
    var menuBtn = $('btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', function () { showMenu(); });
    var resumeBtn = $('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', function () { setPaused(false); });
    var menuPauseBtn = $('btn-menu-pause');
    if (menuPauseBtn) menuPauseBtn.addEventListener('click', function () { showMenu(); });
    var pauseBtn = $('btn-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', function () { togglePause(); });
    var restartBtn = $('btn-restart');
    if (restartBtn) restartBtn.addEventListener('click', function () { retrySame(); });
    showMenu();
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.RA = globalThis.RA || {});
