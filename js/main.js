/* -*- coding: utf-8 -*- */
/*
 * main.js —— 入口:把画布、关卡池、Game 接起来,然后开始每帧跑
 * ==========================================================
 * 打开方式(两种都行):
 *   ① 双击 index.html          —— 靠 levels/levels.js 里内嵌的关卡数据(asc + 元信息)
 *   ② python -m http.server     —— 这时会顺手 fetch levels/*.json,
 *                                  改完存盘刷新就生效,不用再 sync
 *
 * 想跑自检:index.html?selftest=1(结果直接打在页面上,也给控制台一份)
 */
(function (RA) {
  'use strict';

  function pageLogger(el) {
    return function (line, kind) {
      var d = globalThis.document.createElement('div');
      d.textContent = line || ' ';
      d.className = 'line ' + (kind || 'info');
      el.appendChild(d);
    };
  }

  function runSelfTest(game) {
    var doc = globalThis.document;
    var out = doc.getElementById('selftest');
    if (!out) {
      out = doc.createElement('pre');
      out.id = 'selftest';
      doc.body.appendChild(out);
    }
    var status = doc.getElementById('status');
    if (status) status.textContent = '运行中…';
    var fast = /[?&]fast=1/.test(globalThis.location.search);
    var t0 = Date.now();
    var res = RA.Smoke.runAll(game, pageLogger(out), { sim: !fast });

    var sum = doc.getElementById('selftest-result');
    if (!sum) {
      sum = doc.createElement('div');
      sum.id = 'selftest-result';
      doc.body.appendChild(sum);
    }
    sum.textContent = (res.ok ? 'SELFTEST OK' : 'SELFTEST FAIL') +
      '    ' + res.total + ' 项检查 · 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's' +
      (res.skipped ? ' · 跳过 ' + res.skipped + ' 项' : '');
    sum.className = res.ok ? 'ok' : 'bad';
    if (status) status.textContent = res.ok ? '全部通过 ✔' : '有失败的项,见上面标 FAIL 的行';
    if (globalThis.console) globalThis.console.log(sum.textContent, res);
    game.toTitle();
  }

  /** 自检模式:URL 上有 ?selftest=1,或者页面自己设了 window.RA_SELFTEST */
  function wantSelfTest() {
    return !!globalThis.RA_SELFTEST ||
      /[?&]selftest=1/.test(globalThis.location.search);
  }

  function boot() {
    var doc = globalThis.document;
    var canvas = doc.getElementById('game');
    if (!canvas) {
      console.error('找不到 <canvas id="game">');
      return;
    }
    // 关卡池:levels/*.json 的内嵌副本(存在浏览器里的自定义关卡由 Game 自己并进来)
    var src = RA.LEVEL_DATA || {};
    // 关卡池是异步准备的(http 下要 fetch levels/*.json)
    RA.LevelPack.load(src, function (pack) {
      var game = new RA.Game(canvas, pack);
      RA.game = game;                 // 控制台里可以直接玩:RA.game.newTower() 之类
      RA.assets = game.assets;        // 界面层(ui.js)画天空/背景时要用
      game.attachDrop();

      // 贴图都是 assets/ 下独立的 PNG:先读进来再开局。
      // 读不到(文件删了之类)也不卡住 —— 每个素材都有现画的兜底。
      var ctx = game.ctx;
      ctx.fillStyle = '#07080f';
      ctx.fillRect(0, 0, RA.C.WIDTH, RA.C.HEIGHT);
      RA.text(ctx, '载入贴图…', 18, RA.C.INK_DIM, RA.C.WIDTH / 2, RA.C.HEIGHT / 2);

      game.assets.loadAll(function () {
        if (wantSelfTest()) {
          runSelfTest(game);
          return;
        }
        game.loop();
      });
    });
  }

  if (globalThis.document.readyState === 'loading') {
    globalThis.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(globalThis.RA = globalThis.RA || {});
