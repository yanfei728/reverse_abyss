/* -*- coding: utf-8 -*-
/* trial.js —— 编辑器发起的单图试玩页(普通游玩初态,只有当前图) */
(function (RA) {
  'use strict';
  var C = RA.C, W = 960, H = 540;
  var state = { raf: 0, stopped: false };
  var lastDraftRef = null;
  function $(id) { return document.getElementById(id); }

  /** 所有返回入口共用的原草稿地址;plan 尚未建立时用本次读取到的可信 draftRef。 */
  function draftBackHref() {
    var ref = lastDraftRef || (read() && read().draftRef);
    if (!ref || !ref.draftId) return 'editor.html';
    return 'editor.html?from=trial&draft=' + encodeURIComponent(ref.draftId);
  }

  /** 启动/首帧异常:结束启动状态,显示具体错误和回编辑器的路,不能一直停在"正在启动" */
  function failStartup(prefix, err) {
    state.stopped = true;
    if (state.raf) { try { cancelAnimationFrame(state.raf); } catch (e) { /* 已停止 */ } state.raf = 0; }
    var msg = err && (err.message || err.toString()) ? (err.message || err.toString()) : String(err || '未知错误');
    var box = $('dev-error');
    if (box) {
      box.style.display = 'block';
      box.textContent = prefix + ':' + msg;
      var br = document.createElement('br');
      var link = document.createElement('a');
      link.href = draftBackHref();
      link.textContent = '← 返回编辑器(草稿不受影响)';
      link.style.display = 'inline-block';
      link.style.marginTop = '10px';
      link.style.color = '#ffd7cf';
      box.appendChild(br);
      box.appendChild(link);
    }
    var info = $('trial-info');
    if (info) info.textContent = '启动失败';
    var pause = $('pause-overlay'); if (pause) pause.style.display = 'none';
    var done = $('done-overlay'); if (done) done.style.display = 'none';
    if (globalThis.console && console.error) console.error(prefix, err);
  }

  function read() {
    try {
      var r = sessionStorage.getItem('RA_TRIAL_V3');
      return r ? JSON.parse(r) : null;
    } catch (e) { return null; }
  }

  function startPage() {
    if (typeof RA.ActionInput !== 'function') {
      throw new Error('页面缺少 js/platform/action-input.js(RA.ActionInput 未定义);这是页面脚本清单问题');
    }
    if (!RA.TrialSession || typeof RA.TrialSession.build !== 'function') {
      throw new Error('页面缺少 js/trial-session.js(RA.TrialSession 未定义)');
    }
    var handoff = read();
    if (!handoff) {
      throw new Error('没有试玩数据;请从编辑器当前图点击「试玩」重新发起(只运行当前一张图)');
    }
    if (handoff.draftRef) lastDraftRef = handoff.draftRef;
    var pr = RA.TrialSession.build(handoff);
    if (!pr.ok) {
      throw new Error('当前图不能启动:[' + pr.error.code + '] ' + pr.error.message);
    }
    var plan = pr.value;
    lastDraftRef = plan.draftRef || lastDraftRef;
    var s = RA.TrialSession.create(plan);
    var canvas = $('dev-canvas'), ctx = canvas.getContext('2d');
    var assets = new RA.Assets();
    var cam = { x: 0, y: 0 }, cw = W, ch = H, dpr = 1;
    var last = 0, done = false;
    // 24号卡:通过记录保存状态与"返回原草稿"动作要协调,不能把保存中/失败说成已保存
    var saveState = { phase: 'idle', reason: '', pendingBack: false };
    var input = new RA.ActionInput();

    // 36:试玩继承已保存的视野档位(只显示);没有跨层回血/计分.
    var prefs = RA.PlayPreferences ? RA.PlayPreferences.load(globalThis.localStorage) : null;
    var viewMode = (prefs && prefs.value && prefs.value.viewMode) === 'classic' ? 'classic' : 'wide';
    if (RA.ViewZoom && RA.ViewZoom.setMode) RA.ViewZoom.setMode(viewMode);

    function resize() {
      cw = canvas.clientWidth || W; ch = canvas.clientHeight || H; dpr = devicePixelRatio || 1;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    /** 32:试玩与正式共用同一个游玩镜头缩放(2/3);世界可见宽高 = CSS 尺寸 / zoom */
    function viewWorld() {
      var vz = RA.ViewZoom;
      if (!vz) return { w: cw, h: ch, zoom: 1 };
      return { w: vz.worldW(cw), h: vz.worldH(ch), zoom: vz.zoom() };
    }
    function camCenterOn(wx, wy) {
      var v = viewWorld();
      return { x: wx - v.w / 2, y: wy - v.h / 2 };
    }
    addEventListener('resize', resize); resize();

    var cam0 = camCenterOn(s.player.x + s.player.w / 2, s.player.y + s.player.h / 2);
    cam.x = cam0.x;
    cam.y = cam0.y;
    // 38:试玩按本图 difficulty 选用同一套大背景;纯视觉,不写模板/分数
    var parallax = RA.LargeBackground ? RA.LargeBackground.createParallaxState() : null;
    var parallaxGroup = RA.LargeBackground ? RA.LargeBackground.groupForTrial((s.data && s.data.difficulty) || 1) : null;

    function showPauseOverlay(on, reason) {
      var ov = $('pause-overlay');
      if (ov) ov.style.display = on ? 'flex' : 'none';
      var r = $('pause-reason');
      if (r && on && reason) r.textContent = reason;
    }

    function hud() {
      var sn = s.snapshot(), bar = $('hp-fill'), txt = $('hp-text'), info = $('trial-info');
      if (bar) bar.style.width = Math.max(0, Math.min(100, sn.hp / sn.maxHp * 100)) + '%';
      if (txt) txt.textContent = '生命 ' + Math.max(0, Math.round(sn.hp)) + '/' + sn.maxHp;
      if (info) {
        var skill = sn.haloActiveRemaining > 0 ? '光环活动 ' + sn.haloActiveRemaining.toFixed(1) + 's'
          : (sn.haloCooldownRemaining > 0 ? 'K 冷却 ' + sn.haloCooldownRemaining.toFixed(1) + 's' : '光环就绪(K)');
        var st = sn.status === 'passed' ? '通过' : sn.status === 'failed' ? '失败'
          : (sn.status === 'paused' ? '已暂停' : '运行中');
        info.textContent = skill + ' · ' + st + ' · 单图试玩(' + sn.profileId + ')';
      }
    }

    function render() {
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, '#0a0f1e'); g.addColorStop(1, '#05060c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      // 38:大背景在 CSS 屏幕空间、ViewZoom 之前;缺组保留渐变
      if (RA.LargeBackground && parallax) {
        RA.LargeBackground.draw(ctx, {
          groupId: parallaxGroup, width: cw, height: ch, u: parallax.u
        }, assets);
      }
      var inst = s.inst;
      var view = viewWorld();
      // 32:背景按屏幕画;世界层统一缩放 zoom(DPR 已在 resize 里设好,不重复)
      ctx.save();
      if (RA.ViewZoom) RA.ViewZoom.apply(ctx);
      inst.level.draw(ctx, { ox: cam.x, oy: cam.y, vw: view.w, vh: view.h }, assets);
      // 33:齿轮轨道用作者图;移动火球游玩中仍不显示路径
      if (RA.drawGearTracks) RA.drawGearTracks(ctx, inst, cam, assets);
      inst.objects.forEach(function (o) {
        if (o.type !== 'sewage_pool') return;
        RA.drawFloorObject(ctx, inst, o, cam, assets);
      });
      inst.objects.forEach(function (o) {
        if (o.type === 'sewage_pool') return;
        RA.drawFloorObject(ctx, inst, o, cam, assets);
      });
      // 30/32:试玩与正式共用同一份箭/火焰弹绘制;试玩仍然不计分、不写最高分
      if (RA.drawFloorArrows) RA.drawFloorArrows(ctx, inst, cam, assets);
      if (RA.drawFloorBolts) RA.drawFloorBolts(ctx, inst, cam, assets);
      var p = s.player;
      // 33:正式与试玩共用 RA.drawPlayerHalo(R=2.25格、作者光环图、只读真实活动状态)
      if (RA.drawPlayerHalo) RA.drawPlayerHalo(ctx, p, s.run, cam, assets);
      else if (s.run.haloActiveRemaining > 0) {
        var rr = (RA.RULES.tuning.haloRadiusTiles || 2.25) * C.TS;
        ctx.strokeStyle = 'rgba(126,224,168,.8)'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2 - cam.x, p.y + p.h / 2 - cam.y, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (Object.keys(p.frames || {}).length) p.draw(ctx, { ox: cam.x, oy: cam.y }, assets);
      else { ctx.fillStyle = '#ffcd6e'; ctx.fillRect(p.x - cam.x, p.y - cam.y, p.w, p.h); }
      ctx.restore();
    }

    /** 试玩返回原草稿:只在明确点"返回编辑器"时把草稿身份带回编辑器 */
    function goBack() {
      var loc = globalThis.location;
      if (loc) { loc.href = draftBackHref(); return true; }
      return false;
    }

    function bindBackLink(el) {
      if (!el) return;
      el.href = draftBackHref();
      el.addEventListener('click', function (e) {
        if (saveState.phase !== 'saving') return;
        if (e && e.preventDefault) e.preventDefault();
        saveState.pendingBack = true;
        var note = $('done-note');
        if (note) note.textContent = '通过记录保存中…保存完成后会自动返回编辑器';
      });
    }

    function setSavePhase(phase, reason) {
      saveState.phase = phase;
      if (reason !== undefined) saveState.reason = reason || '';
      var status = $('dev-status'), note = $('done-note');
      var noteText = phase === 'saving' ? '通过记录保存中…'
        : phase === 'saved' ? '通过记录已保存;返回编辑器会打开这份草稿的最新版本,可直接点「发布」'
        : phase === 'failed' ? '通过记录未保存:' + saveState.reason + ';可点「重试保存记录」'
        : '本次通过没有绑定草稿';
      if (note) note.textContent = noteText;
      if (status) {
        status.textContent = phase === 'saving' ? '试玩通过,正在把通过记录写回草稿…'
          : phase === 'saved' ? '试玩通过,通过记录已写入草稿;回编辑器点击「发布」才入正式池'
          : phase === 'failed' ? '试玩通过,但通过记录保存失败:' + saveState.reason
          : '试玩通过,但本次没有草稿身份可记录(回编辑器保存草稿后再试玩)';
      }
      var retry = $('btn-done-retry-save');
      if (retry) retry.style.display = phase === 'failed' ? 'inline-block' : 'none';
      if (phase === 'saved' && saveState.pendingBack) {
        saveState.pendingBack = false;
        goBack();
      } else if (phase === 'failed') {
        // 保存失败必须停留在结果页显示原因,不能借 pendingBack 自动离开而掩盖失败
        saveState.pendingBack = false;
      }
    }

    function savePass() {
      setSavePhase('saving');
      var repo = RA.ContentRepository && RA.ContentRepository.create();
      if (!repo) { setSavePhase('failed', '浏览器草稿/发布库不可用'); return; }
      if (!plan.draftRef || !plan.draftRef.draftId) { setSavePhase('unbound'); return; }
      var cr = RA.LevelData.hashSync(plan.template);
      var cert = {
        contentHash: cr,
        rulesVersion: (RA.RULES && RA.RULES.rulesVersion) || '',
        rulesFingerprint: (RA.RULES && RA.RULES.rulesFingerprint) || '',
        profileId: plan.profileId,
        status: 'passed',
        completedAt: new Date().toISOString(),
        source: 'local-playtest'
      };
      repo.loadDraft(plan.draftRef.draftId).then(function (r) {
        if (!r.ok || !r.value || r.value.revision !== plan.draftRef.revision) {
          setSavePhase('failed', '草稿 revision 已变化(可能在别处编辑过);回编辑器重新试玩即可');
          return;
        }
        var data = JSON.parse(JSON.stringify(plan.template));
        data.certification = cert;
        return repo.saveDraft(plan.draftRef.draftId, data, plan.draftRef.revision).then(function (x) {
          if (x.ok) setSavePhase('saved');
          else setSavePhase('failed', (x.error && x.error.message) || '保存失败');
        });
      }).catch(function (e) {
        setSavePhase('failed', (e && e.message) || '保存时出错');
      });
    }

    function showDone(kind) {
      done = true;
      var ov = $('done-overlay');
      if (ov) {
        ov.style.display = 'flex';
        var h2 = ov.querySelector('h2');
        if (h2) h2.textContent = kind === 'passed' ? '本图试玩通过' : '试玩失败';
        var note = $('done-note');
        if (note && kind !== 'passed') note.textContent = '失败只重试本图,不进入别的关卡;返回编辑器草稿还在';
      }
      showPauseOverlay(false);
    }

    /** 键盘与按钮共用同一个暂停/继续控制 */
    function togglePause(reason) {
      if (s.status === 'running') {
        input.clearAll();
        s.pause();
        showPauseOverlay(true, reason || '手动暂停(P / Esc 或按钮继续)');
        return true;
      }
      if (s.status === 'paused') {
        input.clearAll();
        last = 0;
        s.resume();
        showPauseOverlay(false);
        return true;
      }
      return false;
    }

    function frame(now) {
      if (state.stopped) return;
      try {
        var dt = last ? (now - last) / 1000 : 0;
        last = now;
        if (dt > .25) dt = .25;
        // 每帧都消费输入:pause 边沿不能只在 running 分支里取,否则第一次暂停后永远拿不到第二次
        var a = input.consume();
        if (a.pressed.pause) togglePause('手动暂停(P / Esc 或按钮继续)');
        if (s.status === 'running') {
          s.setActions({ left: a.held.left, right: a.held.right, jumpHeld: a.held.jumpHeld });
          if (a.pressed.skill) s.pressSkill();
          s.update(dt);
          var p = s.player;
          var focus = camCenterOn(p.x + p.w / 2, p.y + p.h / 2);
          cam.x += (focus.x - cam.x) * Math.min(1, dt * 7);
          cam.y += (focus.y - cam.y) * Math.min(1, dt * 7);
          if (RA.LargeBackground && parallax) {
            RA.LargeBackground.update(parallax, { playerX: p.x, groupId: parallaxGroup, discontinuity: false });
          }
        }
        s.drainEvents().forEach(function (ev) {
          if (ev.type === 'trialPassed' && !done) { showDone('passed'); savePass(); }
          if (ev.type === 'trialFailed' && !done) showDone('failed');
        });
        render();
        hud();
        state.raf = requestAnimationFrame(frame);
      } catch (e) {
        failStartup('试玩运行出错', e);
      }
    }

    addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var src = 'key:' + e.code;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') { input.setHeld(src, 'left', true); e.preventDefault(); }
      if (e.code === 'KeyD' || e.code === 'ArrowRight') { input.setHeld(src, 'right', true); e.preventDefault(); }
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') { input.setHeld(src, 'jump', true); e.preventDefault(); }
      if (e.code === 'KeyK') { input.press('skill'); e.preventDefault(); }
      if (e.code === 'KeyP' || e.code === 'Escape') { input.press('pause'); e.preventDefault(); }
      if (e.code === 'KeyR') { location.reload(); e.preventDefault(); }
    });
    addEventListener('keyup', function (e) {
      var src = 'key:' + e.code;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.setHeld(src, 'left', false);
      if (e.code === 'KeyD' || e.code === 'ArrowRight') input.setHeld(src, 'right', false);
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') input.setHeld(src, 'jump', false);
    });
    addEventListener('blur', function () {
      if (s.status !== 'running') return;
      input.clearAll();
      s.pause();
      showPauseOverlay(true, '失去焦点已暂停(P / Esc 或按钮继续)');
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden || s.status !== 'running') return;
      input.clearAll();
      s.pause();
      showPauseOverlay(true, '页面切到后台已暂停(P / Esc 或按钮继续)');
    });

    var pauseBtn = $('btn-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', function () { togglePause('手动暂停(P / Esc 或按钮继续)'); });
    var restartBtn = $('btn-restart');
    if (restartBtn) restartBtn.addEventListener('click', function () { location.reload(); });
    var resumeBtn = $('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', function () { togglePause('手动暂停(P / Esc 或按钮继续)'); });
    var restartPause = $('btn-restart-pause');
    if (restartPause) restartPause.addEventListener('click', function () { location.reload(); });
    var restartDone = $('btn-done-restart');
    if (restartDone) restartDone.addEventListener('click', function () { location.reload(); });

    // 所有返回编辑器入口统一带本次 draftRef;保存中点击等保存完成,失败停留显示
    bindBackLink($('btn-top-editor'));
    bindBackLink($('btn-pause-editor'));
    var backLink = $('btn-done-editor');
    bindBackLink(backLink);
    if (backLink && plan.draftRef && plan.draftRef.draftId) {
      backLink.textContent = '返回编辑器(打开原草稿)';
    }
    var retrySave = $('btn-done-retry-save');
    if (retrySave) retrySave.addEventListener('click', function () { savePass(); });

    assets.loadAll(function () { s.player.loadSprites(assets); });
    hud();
    render();
    state.raf = requestAnimationFrame(frame);
    RA.trial = {
      session: s, plan: plan, input: input, togglePause: togglePause,
      paused: function () { return s.status === 'paused'; },
      saveState: saveState, backHref: draftBackHref,
      // 32:验收/诊断读镜头与可见世界尺寸(与正式状态里的 cam/cw/ch 对应)
      cam: cam,
      viewWorld: viewWorld,
      // 33:验收/诊断读本次页面真实加载的素材(hasFile 证明 PNG 已从仓库读到)
      assets: assets,
      // 36:验收/诊断读继承到的视野档位(试玩没有跨层回血)
      viewMode: viewMode
    };
  }

  function boot() {
    try {
      startPage();
    } catch (e) {
      failStartup('试玩启动失败', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(globalThis.RA = globalThis.RA || {});
