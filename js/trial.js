/* -*- coding: utf-8 -*-
/* trial.js —— 独立单图试玩验证页(standard-v1) */
(function (RA) {
  'use strict';
  var C = RA.C, W = 960, H = 540;
  function $(id) { return document.getElementById(id); }
  function showError(t) { var e = $('dev-error'); if (e) { e.style.display = 'block'; e.textContent = t; } }
  function read() { try { var r = sessionStorage.getItem('RA_TRIAL_V3'); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function boot() {
    var h = read();
    if (!h) { showError('没有试玩验证数据;请从编辑器重新发起。「试玩验证」只运行当前一张图。'); return; }
    var pr = RA.TrialSession.build(h);
    if (!pr.ok) { showError('试玩数据不能启动:[' + pr.error.code + '] ' + pr.error.message + ';请从编辑器重新开始'); return; }
    var plan = pr.value;
    var s = RA.TrialSession.create(plan);
    var canvas = $('dev-canvas'), ctx = canvas.getContext('2d');
    var assets = new RA.Assets(); var cam = { x: 0, y: 0 }, cw = W, ch = H, dpr = 1;
    var held = { left: false, right: false, jump: false }, done = false, last = 0;
    function resize() { cw = canvas.clientWidth || W; ch = canvas.clientHeight || H; dpr = devicePixelRatio || 1; canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    addEventListener('resize', resize); resize();
    function hud() {
      var sn = s.snapshot(), el = $('hud');
      if (el) el.textContent = '试玩验证 · 生命 ' + sn.hp + '/' + sn.maxHp +
        ' · ' + (sn.haloActiveRemaining > 0 ? '光环 ' + sn.haloActiveRemaining.toFixed(1) + 's' : (sn.haloCooldownRemaining > 0 ? '技能冷却 ' + sn.haloCooldownRemaining.toFixed(1) + 's' : '光环就绪(K)')) +
        ' · ' + (sn.status === 'passed' ? '通过' : sn.status === 'failed' ? '失败' : sn.status);
    }
    function render() {
      var g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#0a0f1e'); g.addColorStop(1, '#05060c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      var inst = s.inst;
      inst.level.draw(ctx, { ox: cam.x, oy: cam.y, vw: cw, vh: ch }, assets);
      inst.objects.forEach(function (o) {
        var x = o.rx - cam.x, y = o.ry - cam.y;
        if (o.type === 'fireball_static') { ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.arc(x, y, (o.params.radiusTiles || .5) * C.TS, 0, Math.PI * 2); ctx.fill(); }
        else if (o.type === 'spike') { ctx.fillStyle = '#9aa8c7'; ctx.fillRect(x - C.TS / 2, y, C.TS, 10); }
        else if (o.type === 'gear') { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x, y, (o.params.radiusTiles || .5) * C.TS, 0, Math.PI * 2); ctx.fill(); }
      });
      var p = s.player;
      if (Object.keys(p.frames || {}).length) p.draw(ctx, { ox: cam.x, oy: cam.y }, assets);
      else { ctx.fillStyle = '#ffcd6e'; ctx.fillRect(p.x - cam.x, p.y - cam.y, p.w, p.h); }
    }
    function saveCert() {
      var repo = RA.ContentRepository && RA.ContentRepository.create(); if (!repo) return;
      var cr = RA.LevelData.hashSync(plan.template);
      var cert = { contentHash: cr, rulesVersion: plan.rules.rulesVersion, rulesFingerprint: plan.rules.rulesFingerprint,
        profileId: 'standard-v1', status: 'passed', completedAt: new Date().toISOString(), source: 'local-playtest' };
      repo.loadDraft(plan.draftRef.draftId).then(function (r) {
        if (!r.ok || !r.value || r.value.revision !== plan.draftRef.revision) { var t = $('dev-status'); if (t) t.textContent = '试玩通过,但认证未保存(草稿 revision 已变化)'; return; }
        var data = JSON.parse(JSON.stringify(plan.template)); data.certification = cert;
        return repo.saveDraft(plan.draftRef.draftId, data, plan.draftRef.revision).then(function (x) {
          var t = $('dev-status'); if (t) t.textContent = x.ok ? '试玩通过,认证已写入草稿;回编辑器点击发布才入正式池' : '试玩通过,但认证保存失败:' + x.error.message;
        });
      });
    }
    function tick(now) {
      var dt = last ? (now - last) / 1000 : 0; last = now; if (dt > .25) dt = .25;
      if (s.status === 'running') {
        s.setActions({ left: held.left, right: held.right, jumpHeld: held.jump });
        s.update(dt);
        var p = s.player, tx = p.x + p.w / 2 - cw / 2, ty = p.y + p.h / 2 - ch / 2;
        cam.x += (tx - cam.x) * Math.min(1, dt * 7); cam.y += (ty - cam.y) * Math.min(1, dt * 7);
      }
      s.drainEvents().forEach(function (ev) {
        if (ev.type === 'trialPassed') { done = true; var o = $('done-overlay'); if (o) o.style.display = 'flex'; saveCert(); }
        if (ev.type === 'trialFailed') { done = true; var o2 = $('done-overlay'); if (o2) { o2.style.display = 'flex'; var h2 = o2.querySelector('h2'); if (h2) h2.textContent = '试玩失败'; } }
      });
      render(); hud(); requestAnimationFrame(tick);
    }
    held.left = held.right = held.jump = false;
    addEventListener('keydown', function (e) {
      if (e.repeat) return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') { held.left = true; e.preventDefault(); }
      if (e.code === 'KeyD' || e.code === 'ArrowRight') { held.right = true; e.preventDefault(); }
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') { held.jump = true; e.preventDefault(); }
      if (e.code === 'KeyK') { s.pressSkill(); e.preventDefault(); }
      if (e.code === 'KeyP' || e.code === 'Escape') { if (s.status === 'paused') s.resume(); else s.pause(); }
    });
    addEventListener('keyup', function (e) {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') held.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') held.right = false;
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') held.jump = false;
    });
    var restart = $('btn-done-restart');
    if (restart) restart.addEventListener('click', function () { location.reload(); });
    assets.loadAll(function () { s.player.loadSprites(assets); });
    requestAnimationFrame(tick);
    RA.trial = { session: s, plan: plan };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(globalThis.RA = globalThis.RA || {});
