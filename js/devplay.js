/* -*- coding: utf-8 -*- */
/*
 * devplay.js —— 开发试玩页(新 GameSession + 连续楼层)
 * =====================================================
 * 页面只做适配:canvas/键盘/暂停按钮/镜头/背景;模拟全部在 RA.GameSession。
 * 数据来源:
 *   1) 编辑器通过 sessionStorage['RA_DEVPLAY_V1'] 交来的"当前层 + 下一层样例";
 *   2) 直接打开 devplay.html 时用 RA.DEV_SAMPLES 里的两层样例。
 * 不读取旧关卡池,不写 levels/,不发布。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var W = 960, H = 540;

  function $(id) { return document.getElementById(id); }
  function showError(text) {
    var box = $('dev-error');
    if (box) {
      box.style.display = 'block';
      box.textContent = text;
    }
    var canvas = $('dev-canvas');
    if (canvas) canvas.style.display = 'none';
    var hud = $('hud');
    if (hud) hud.style.display = 'none';
  }

  function readHandoff() {
    try {
      var raw = globalThis.sessionStorage.getItem('RA_DEVPLAY_V1');
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.template || !data.next) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function boot() {
    try { bootInner(); } catch (e) {
      showError('开发试玩启动失败:' + (e && e.message));
    }
  }

  function bootInner() {
    var handoff = readHandoff();
    var floors = handoff ? [handoff.template, handoff.next]
      : (RA.DEV_SAMPLES ? [RA.DEV_SAMPLES.floorA, RA.DEV_SAMPLES.floorB] : []);
    var source = handoff ? '编辑器当前层 + 开发样例 B' : '内置开发样例 A + B';
    if (!floors.length || !floors[0]) {
      showError('没有可运行的开发样例。请在编辑器里点「开发试玩」,或确认 js/dev-samples.js 已生成。');
      return;
    }
    var res = RA.GameSession.create({ floors: floors });
    if (!res.ok) {
      showError('这份试玩数据不能启动:[' + res.error.code + '] ' + res.error.message);
      return;
    }
    var session = res.value;
    var assets = new RA.Assets();
    var player = session.player;
    var canvas = $('dev-canvas');
    var ctx = canvas.getContext('2d');
    var cam = { x: player.x - W / 2, y: player.y - H / 2, vw: W, vh: H };
    var dpr = 1, cw = W, ch = H;
    var pausedByPage = false;
    var lastT = 0;
    var hudT = 0;
    var overlay = $('pause-overlay');
    var hud = $('hud');
    var status = $('dev-status');
    var pausedAt = 0;

    RA.devplay = {
      session: session,
      floors: floors,
      source: source,
      camera: cam,
      ready: true
    };

    function setPaused(paused, reason) {
      if (paused) {
        if (session.paused) return;
        session.pause();
        pausedAt = performance.now();
        if (overlay) {
          overlay.style.display = 'flex';
          $('pause-reason').textContent = reason || '手动暂停';
        }
      } else {
        if (!session.paused) return;
        session.resume();
        if (overlay) overlay.style.display = 'none';
      }
    }

    function togglePause() { setPaused(!session.paused, '手动暂停'); }

    function restart() {
      var again = RA.GameSession.create({ floors: floors });
      if (!again.ok) { showError('重新开始失败:' + again.error.message); return; }
      session.dispose();
      session = again.value;
      RA.devplay.session = session;
      player = session.player;
      cam.x = player.x - W / 2;
      cam.y = player.y - H / 2;
      setPaused(false);
    }

    // ---------- 输入 ----------
    var held = { left: false, right: false, jump: false };
    var KEY_LEFT = { ArrowLeft: 1, KeyA: 1 };
    var KEY_RIGHT = { ArrowRight: 1, KeyD: 1 };
    var KEY_JUMP = { Space: 1, ArrowUp: 1, KeyW: 1 };
    function isUiTarget(e) {
      var t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    }
    globalThis.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (e.code === 'KeyR') { e.preventDefault(); restart(); return; }
      if (isUiTarget(e)) return;
      if (KEY_LEFT[e.code]) { held.left = true; e.preventDefault(); }
      if (KEY_RIGHT[e.code]) { held.right = true; e.preventDefault(); }
      if (KEY_JUMP[e.code]) { held.jump = true; e.preventDefault(); }
    });
    globalThis.addEventListener('keyup', function (e) {
      if (KEY_LEFT[e.code]) held.left = false;
      if (KEY_RIGHT[e.code]) held.right = false;
      if (KEY_JUMP[e.code]) held.jump = false;
    });
    globalThis.addEventListener('blur', function () {
      held.left = held.right = held.jump = false;
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        pausedByPage = true;
        setPaused(true, '页面切到后台,已自动暂停');
      } else if (pausedByPage) {
        pausedByPage = false;
        // 回到页面不自动继续,留给用户点「继续」,避免一回来就掉下去
        if (!session.paused) setPaused(false);
      }
    });
    var resumeBtn = $('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', function () { setPaused(false); });
    var restartBtn = $('btn-restart');
    if (restartBtn) restartBtn.addEventListener('click', function () { restart(); });
    var restartPauseBtn = $('btn-restart-pause');
    if (restartPauseBtn) restartPauseBtn.addEventListener('click', function () { restart(); });
    var pauseBtn = $('btn-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', togglePause);

    // ---------- 尺寸 ----------
    function resize() {
      cw = canvas.clientWidth || W;
      ch = canvas.clientHeight || H;
      dpr = globalThis.devicePixelRatio || 1;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cam.vw = cw;
      cam.vh = ch;
    }
    globalThis.addEventListener('resize', resize);
    resize();

    // ---------- 每帧 ----------
    function render() {
      var zoom = 1;
      // 简单暗色背景 + 高度渐变的"深渊"
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, '#0a0f1e');
      g.addColorStop(1, '#05060c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);

      var insts = session.world.instances;
      var idxs = Array.from(insts.keys()).sort(function (a, b) { return a - b; });
      idxs.forEach(function (i) {
        var inst = insts.get(i);
        var localCam = {
          ox: cam.x - inst.origin.x,
          oy: cam.y - inst.origin.y,
          vw: cw / zoom, vh: ch / zoom
        };
        // 地形(快照层也保留,直到再上一层才释放)
        inst.level.draw(ctx, localCam, assets);
        // 接口开口提示:顶部开口画一条暗黄线,便于看清从哪里出
        var openL = inst.exitCol * C.TS - localCam.ox;
        var openR = openL + RA.LevelData.PORT.openingCols * C.TS;
        var topY = inst.origin.y - cam.y;
        ctx.strokeStyle = 'rgba(255, 205, 110, .45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(openL, topY);
        ctx.lineTo(openR, topY);
        ctx.stroke();
        // 预热/活动层的路径对象画一个小点,证明"下一层在动"
        if (inst.state !== 'snapshot') {
          inst.objects.forEach(function (o) {
            if (o.rx === undefined) return;
            ctx.fillStyle = 'rgba(126, 224, 168, .8)';
            ctx.beginPath();
            ctx.arc(o.rx + inst.origin.x - cam.x, o.ry + inst.origin.y - cam.y, 5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      });

      // 玩家(用现有贴图;缺图时画一个占位方块)
      var viewCam = { ox: cam.x, oy: cam.y };
      if (Object.keys(player.frames || {}).length) {
        player.draw(ctx, viewCam, assets);
      } else {
        ctx.fillStyle = '#ffcd6e';
        ctx.fillRect(player.x - cam.x, player.y - cam.y, player.w, player.h);
      }

      // 当前层标注
      ctx.fillStyle = 'rgba(207, 216, 234, .7)';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      insts.forEach(function (inst, i) {
        var y = inst.origin.y - cam.y + 16;
        ctx.fillText('第 ' + (inst.index + 1) + ' 层 · ' + inst.state, 14, y);
      });
    }

    function tick(now) {
      var dt = lastT ? (now - lastT) / 1000 : 0;
      lastT = now;
      if (dt > 0.25) dt = 0.25;
      if (!session.paused) {
        session.setActions({ left: held.left, right: held.right, jumpHeld: held.jump });
        session.update(dt);
        var p = session.player;
        var tx = p.x + p.w / 2 - cw / 2;
        var ty = p.y + p.h / 2 - ch / 2;
        var k = Math.min(1, dt * 7);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
      }
      session.drainEvents().forEach(function (ev) {
        if (ev.type === 'floorEntered') {
          if (status) status.textContent = '进入第 ' + (ev.to + 1) + ' 层;上一层地形保留到再上一层才释放';
        }
      });
      render();
      hudT += dt;
      if (hudT > 0.1 && hud) {
        hudT = 0;
        var snap = session.snapshot();
        hud.textContent = '第 ' + (snap.floorIndex + 1) + '/' + snap.floorCount + ' 层 · ' +
          '模拟 ' + snap.time.toFixed(1) + 's · ' +
          (snap.paused ? '已暂停' : (snap.player.onGround ? '地面' : '空中')) +
          ' · ' + source;
      }
      requestAnimationFrame(tick);
    }

    assets.loadAll(function () {
      player.loadSprites(assets);
    });
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(globalThis.RA = globalThis.RA || {});
