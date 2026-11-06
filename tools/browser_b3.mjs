#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_b3.mjs —— 触控/布局/暂停恢复/返回边界 真实浏览器检查
 * ===========================================================
 * Chrome headless + 移动视口 + DevTools touch 事件。它不等于真机,
 * 也不证明系统文件选择/分享/后台锁屏;这些仍需人工。
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from './loader.mjs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = join(ROOT, 'docs/checks');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) });
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function fetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); const pending = new Map(); let seq = 0;
    ws.onopen = () => resolve({
      send(m, p) { return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p || {} })); }); },
      close() { try { ws.close(); } catch (e) {} }
    });
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m.id || !pending.has(m.id)) return;
      const q = pending.get(m.id); pending.delete(m.id);
      if (m.error) q.rej(new Error(m.error.message)); else q.res(m.result);
    };
  });
}
function killTree(c) { try { spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} }

async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean).filter((p) => existsSync(p));
  if (!exes.length) { console.error('找不到 Chrome/Edge'); return 2; }
  let browser = null, last = null;
  for (const exe of exes) {
    const profile = mkdtempSync(join(tmpdir(), 'ra-b3-chrome-'));
    const port = await freePort();
    const url = 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/') + '?touch=1';
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=900,500', '--touch-events=enabled',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + port, url],
      { stdio: 'ignore', windowsHide: true });
    try {
      let version = null;
      for (let i = 0; i < 100 && !version; i++) {
        try { version = await fetchJson('http://127.0.0.1:' + port + '/json/version'); } catch (e) { await sleep(100); }
      }
      if (!version) throw new Error('DevTools 端口未启动');
      let target = null;
      for (let i = 0; i < 60 && !target; i++) {
        const list = await fetchJson('http://127.0.0.1:' + port + '/json/list');
        target = list.find((t) => t.type === 'page' && t.url.indexOf('short.html') >= 0);
        if (!target) await sleep(100);
      }
      if (!target) throw new Error('找不到 short.html?touch=1');
      const ws = await connect(target.webSocketDebuggerUrl);
      await ws.send('Page.enable'); await ws.send('Runtime.enable');
      await ws.send('Emulation.setDeviceMetricsOverride', {
        width: 900, height: 500, deviceScaleFactor: 2, mobile: true
      });
      await ws.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      browser = { ws, child, profile, version, exe };
      break;
    } catch (e) {
      last = e; killTree(child);
      try { rmSync(profile, { recursive: true, force: true }); } catch (e2) {}
    }
  }
  if (!browser) { console.error('浏览器启动失败:' + (last && last.message)); return 1; }
  const send = browser.ws.send;
  try {
    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面异常:' + (r.exceptionDetails.text || ''));
      return r.result ? r.result.value : undefined;
    }
    async function waitFor(expr, ms) {
      const end = Date.now() + (ms || 10000);
      while (Date.now() < end) { try { if (await evaluate(expr)) return true; } catch (e) {} await sleep(100); }
      return false;
    }
    async function shot(name) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
    }
    async function centers() {
      return await evaluate(`(function(){
        var out={}; document.querySelectorAll('.tbtn').forEach(function(b){
          var r=b.getBoundingClientRect(); out[b.dataset.action]={x:r.left+r.width/2,y:r.top+r.height/2};
        }); return out;
      })()`);
    }
    async function touchStart(points) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    }
    async function touchMove(points) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
    }
    async function touchEnd() {
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }

    check('浏览器启动', true, browser.version.Browser + ' headless');
    check('短塔/触控模块加载', await waitFor('!!RA.short && !!RA.ActionInput && !!RA.ControlLayout', 15000));
    check('触控模式与四个按钮', await evaluate('document.body.classList.contains("touch")') &&
      await evaluate('document.querySelectorAll(".tbtn").length === 4'));
    check('设置按钮可用', await evaluate('!!document.getElementById("btn-settings")'));
    await shot('b3-browser-touch-menu.png');

    await evaluate('document.getElementById("btn-dev").click()');
    check('开发短塔启动', await waitFor('!!RA.short.state.session', 8000));
    const c = await centers();
    check('触控按钮有可见位置', c.left && c.jump && c.skill && c.left.x > 0 && c.jump.x > 0);

    // 两指:左 + 跳;移动/跳跃同时
    await touchStart([
      { x: c.left.x, y: c.left.y, id: 1 },
      { x: c.jump.x, y: c.jump.y, id: 2 }
    ]);
    await sleep(180);
    const two = await evaluate('RA.short.state.input.snapshot()');
    check('两个触点同时按住左/跳', two && two.held.left === true && two.held.jumpHeld === true,
      JSON.stringify(two && two.held));
    // CDP 不能单独抬起一个触点;用同一 button 上的 pointerup 验证来源独立释放
    await evaluate('document.querySelector(\'[data-action="left"]\').dispatchEvent(new PointerEvent("pointerup",{pointerId:1,bubbles:true}))');
    await sleep(120);
    const one = await evaluate('RA.short.state.input.snapshot()');
    check('抬起一只手指不释放另一指', one && one.held.jumpHeld === true && one.held.left === false,
      JSON.stringify(one && one.held));
    await touchEnd();
    await sleep(100);
    const none = await evaluate('RA.short.state.input.snapshot()');
    check('全部抬起后输入清空', none && none.sources === 0 && none.held.left === false && none.held.jumpHeld === false);

    // 左右同时按住抵消
    await touchStart([{ x: c.left.x, y: c.left.y, id: 3 }, { x: c.right.x, y: c.right.y, id: 4 }]);
    await sleep(100);
    const lr = await evaluate('RA.short.state.input.snapshot()');
    check('左右同时按住抵消', lr && lr.held.left === false && lr.held.right === false);
    await touchEnd();
    await sleep(100);

    // 点技能一次
    await touchStart([{ x: c.skill.x, y: c.skill.y, id: 5 }]);
    await touchEnd();
    await sleep(200);
    check('触点 K 只施放一次', await evaluate('RA.short.state.session.run.castId === 1') &&
      await evaluate('RA.short.state.session.run.haloActiveRemaining > 13'));

    // 暂停/恢复
    await evaluate('document.getElementById("btn-pause").click()');
    check('暂停遮罩', await waitFor('getComputedStyle(document.getElementById("pause-overlay")).display === "flex"'));
    const pausedTime = await evaluate('RA.short.state.session.time');
    await sleep(400);
    check('暂停冻结模拟时间', await evaluate('RA.short.state.session.time') === pausedTime);
    await evaluate('document.getElementById("btn-resume").click()');
    await sleep(150);
    check('继续恢复', await evaluate('RA.short.state.session.paused') === false);

    // 生命周期后台/前台:清输入、保持暂停
    await evaluate('RA.short.state.input.setHeld("pointer:bg", "left", true); RA.short.state.lifecycle.triggerBackground()');
    check('后台清输入并暂停', await evaluate('RA.short.state.input.snapshot().sources === 0') &&
      await evaluate('RA.short.state.session.paused === true'));
    await evaluate('RA.short.state.lifecycle.triggerForeground()');
    check('前台不自动继续', await evaluate('RA.short.state.session.paused === true'));

    // 返回:暂停面板 → 大厅
    await evaluate('RA.short.state.lifecycle.triggerBack()');
    await waitFor('getComputedStyle(document.getElementById("result-overlay")).display === "none"');
    check('返回键从暂停回大厅', await evaluate('RA.short.state.session === null') &&
      await evaluate('getComputedStyle(document.getElementById("menu")).display === "flex"'));

    // 布局:打开设置,拖动左按钮,保存,重载恢复
    await evaluate('document.getElementById("btn-settings").click()');
    check('布局设置打开', await waitFor('getComputedStyle(document.getElementById("settings-overlay")).display === "flex"'));
    const beforeLayout = await evaluate('RA.short.state.layout.buttons.left.x');
    const cs = await centers();
    await touchStart([{ x: cs.left.x, y: cs.left.y, id: 12 }]);
    await touchMove([{ x: cs.left.x + 45, y: cs.left.y, id: 12 }]);
    await touchEnd();
    await sleep(150);
    const afterLayout = await evaluate('RA.short.state.layout.buttons.left.x');
    check('拖动按钮改变布局', afterLayout > beforeLayout, beforeLayout.toFixed(3) + '→' + afterLayout.toFixed(3));
    await evaluate('document.getElementById("btn-layout-save").click()');
    check('布局保存到本机', await evaluate('!!localStorage.getItem("ra_control_layout_v1")'));
    await send('Page.reload');
    await waitFor('!!RA.short && !!RA.short.state.layout', 10000);
    await evaluate('document.getElementById("btn-settings").click()');
    await sleep(150);
    check('重载后恢复保存的布局', await evaluate('Math.abs(RA.short.state.layout.buttons.left.x - ' + afterLayout + ') < 1e-9'));
    await evaluate('document.getElementById("btn-layout-reset").click()');
    await evaluate('document.getElementById("btn-layout-save").click()');
    check('恢复默认布局', await evaluate('RA.short.state.layout.buttons.left.x === 0.10'));
    await evaluate('document.getElementById("btn-layout-close").click()');
    await shot('b3-browser-touch-layout.png');

    // 离线 www 包(不含编辑器/测试)也要能独立加载并启动开发短塔
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'www/index.html').replace(/\\/g, '/') + '?touch=1' });
    await sleep(700);
    check('离线 www 包加载', await waitFor('!!RA.short && !!RA.short.state.layout', 12000));
    check('离线 www 包保留触控入口', await evaluate('document.body.classList.contains("touch")') &&
      await evaluate('document.querySelectorAll(".tbtn").length === 4'));
    await evaluate('document.getElementById("btn-dev").click()');
    check('离线 www 包能启动开发短塔', await waitFor('!!RA.short.state.session', 8000));
    await shot('b3-browser-offline-package.png');

    const evidence = {
      date: new Date().toISOString(), browser: browser.version.Browser, executable: browser.exe,
      viewport: { width: 900, height: 500, mobile: true }, pass, fail, results,
      screenshots: ['docs/checks/b3-browser-touch-menu.png', 'docs/checks/b3-browser-touch-layout.png', 'docs/checks/b3-browser-offline-package.png'],
      note: '桌面模拟触控/生命周期;真机锁屏、系统文件选择/分享、性能未由本脚本证明。'
    };
    writeFileSync(join(OUT, 'browser-b3-2026-11-06.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    browser.ws.close(); killTree(browser.child); await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nB3 浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('B3 浏览器检查失败:' + (e && e.message)); process.exit(1); });
