#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_b3r2.mjs —— B3-R2 视口/可见性/屏幕坐标点击检查
 * ======================================================
 * 冷启动、短横屏、16:10、DPR 1/2/3；用屏幕坐标点击开菜单/暂停/布局,
 * 不调用 DOM .click() 绕过布局。桌面模拟不等于 OPD2101/Android 11 真机。
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
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
    const profile = mkdtempSync(join(tmpdir(), 'ra-b3r2-chrome-'));
    const port = await freePort();
    const url = 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/') + '?touch=1';
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=960,540', '--touch-events=enabled',
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
      if (!target) throw new Error('找不到 short.html');
      const ws = await connect(target.webSocketDebuggerUrl);
      await ws.send('Page.enable'); await ws.send('Runtime.enable');
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
    async function setViewport(w, h, dpr) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: dpr, mobile: true
      });
      await send('Page.navigate', {
        url: 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/') + '?touch=1'
      });
      await sleep(700);
      return await waitFor('!!RA.short && !!RA.short.diagnostics && !!document.getElementById("menu")', 12000);
    }
    async function rect(selector) {
      return await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)return null;var r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,id:e.id||""};})()');
    }
    async function screenClick(selector) {
      const r = await rect(selector);
      if (!r) return { ok: false, reason: 'no-rect' };
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');var h=document.elementFromPoint(' + x + ',' + y + ');return {hit:!!h,contains:!!(e&&h&&(e===h||e.contains(h))),id:h&&h.id||""};})()');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(160);
      return { ok: true, x, y, hit };
    }

    check('浏览器启动', true, browser.version.Browser + ' headless');

    const cases = [
      { name: '普通横屏 960×540', w: 960, h: 540, dpr: 1 },
      { name: '短横屏 800×360', w: 800, h: 360, dpr: 2 },
      { name: '16:10 960×600', w: 960, h: 600, dpr: 3 }
    ];
    for (let ci = 0; ci < cases.length; ci++) {
      const c = cases[ci];
      check(c.name + ' 冷启动', await setViewport(c.w, c.h, c.dpr));
      const d = await evaluate('RA.short.diagnostics()');
      check(c.name + ' 菜单主按钮在屏内', d.menuBox && d.menuBox.left >= 0 && d.menuBox.top >= 0 &&
        d.menuBox.left + d.menuBox.width <= c.w + 1 && d.menuBox.top + d.menuBox.height <= c.h + 1,
        JSON.stringify(d.menuBox));
      const dev = await rect('#btn-dev');
      const startVisible = dev && dev.left >= 0 && dev.top >= 0 && dev.right <= c.w + 1 && dev.bottom <= c.h + 1;
      check(c.name + ' 开始按钮可见', startVisible, dev ? JSON.stringify(dev) : 'missing');
      const click = await screenClick('#btn-dev');
      check(c.name + ' 屏幕坐标点击开始', click.ok && click.hit && click.hit.contains,
        click.hit ? JSON.stringify(click.hit) : click.reason);
      check(c.name + ' 会话启动且菜单消失', await waitFor('!!RA.short.state.session', 8000) &&
        await evaluate('getComputedStyle(document.getElementById("menu")).display === "none"'));
      const game = await evaluate('RA.short.diagnostics()');
      check(c.name + ' 画布背板/显示比例', game.canvasBuffer && game.canvasBuffer.width > 0 &&
        Math.abs(game.canvasBuffer.width / game.wrap.width - game.dpr) < 0.02 &&
        Math.abs(game.canvasBuffer.height / game.wrap.height - game.dpr) < 0.02,
        JSON.stringify({ wrap: game.wrap, buffer: game.canvasBuffer, dpr: game.dpr }));
      // 实际键盘输入:看到玩家坐标变化,松开后停止
      const x0 = await evaluate('RA.short.state.session.player.x');
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyD', key: 'd', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
      await sleep(260);
      const x1 = await evaluate('RA.short.state.session.player.x');
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyD', key: 'd', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
      await sleep(900);
      const x2 = await evaluate('RA.short.state.session.player.x');
      await sleep(250);
      const x3 = await evaluate('RA.short.state.session.player.x');
      check(c.name + ' 实际输入移动并松开后停下', x1 > x0 + 4 && Math.abs(x3 - x2) < 1.5,
        JSON.stringify({ x0, x1, x2, x3 }));
      await shot('b3r2-' + ci + '-' + c.w + 'x' + c.h + '-game.png');
      // 暂停/继续用屏幕按钮
      const pause = await screenClick('#btn-pause');
      check(c.name + ' 屏幕点击暂停', pause.ok && pause.hit && pause.hit.contains &&
        await waitFor('getComputedStyle(document.getElementById("pause-overlay")).display === "flex"'));
      const resume = await screenClick('#btn-resume');
      check(c.name + ' 屏幕点击继续', resume.ok && resume.hit && resume.hit.contains &&
        await evaluate('RA.short.state.session.paused === false'));
      // 布局:屏幕点击打开,关闭按钮可见,关闭回暂停/菜单
      const settings = await screenClick('#btn-settings');
      check(c.name + ' 屏幕点击打开布局', settings.ok && await waitFor('getComputedStyle(document.getElementById("settings-overlay")).display === "flex"'));
      const settingsBox = await evaluate('(function(){var b=document.querySelector("#settings-overlay .box");if(!b)return null;var r=b.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};})()');
      check(c.name + ' 布局面板区域在屏内', settingsBox && settingsBox.left >= 0 && settingsBox.top >= 0 &&
        settingsBox.right <= c.w + 1 && settingsBox.bottom <= c.h + 1, settingsBox ? JSON.stringify(settingsBox) : 'missing');
      await shot('b3r2-' + ci + '-' + c.w + 'x' + c.h + '-layout.png');
      const close = await rect('#btn-layout-close');
      check(c.name + ' 布局关闭按钮在屏内', close && close.left >= 0 && close.top >= 0 &&
        close.right <= c.w + 1 && close.bottom <= c.h + 1, close ? JSON.stringify(close) : 'missing');
      const sc = await screenClick('#btn-layout-close');
      check(c.name + ' 屏幕点击关闭布局', sc.ok && sc.hit && sc.hit.contains);
      await evaluate('document.getElementById("btn-menu-pause").click()');
      await sleep(150);
      await shot('b3r2-' + ci + '-' + c.w + 'x' + c.h + '-menu.png');
      // 冷启动菜单截图在启动前已不再;取新一次冷启动快照
      await send('Page.navigate', { url: 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/') + '?touch=1' });
      await sleep(600);
      await waitFor('!!RA.short && !!RA.short.diagnostics', 10000);
      await shot('b3r2-' + ci + '-' + c.w + 'x' + c.h + '-cold.png');
    }

    // DPR 稳定/重复 resize:同一视口重复设置后 CSS 尺寸不变,backing store 对应 DPR
    await setViewport(960, 540, 1);
    const a = await evaluate('({wrap:RA.short.diagnostics().wrap,canvas:RA.short.diagnostics().canvas,dpr:RA.short.diagnostics().dpr})');
    await setViewport(960, 540, 1);
    const b = await evaluate('({wrap:RA.short.diagnostics().wrap,canvas:RA.short.diagnostics().canvas,dpr:RA.short.diagnostics().dpr})');
    check('重复 resize CSS 尺寸稳定', a.wrap.width === b.wrap.width && a.wrap.height === b.wrap.height);
    check('canvas backing store 对应 DPR', b.canvas.width === Math.round(b.wrap.width * b.dpr) &&
      b.canvas.height === Math.round(b.wrap.height * b.dpr));

    // 基础回退:去掉现代 inset/aspect-ratio 后,JS 尺寸仍让菜单可见可点
    await evaluate('(function(){document.getElementById("app").style.inset="auto";document.getElementById("wrap").style.aspectRatio="auto";RA.short.diagnostics();})()');
    const fallback = await evaluate('RA.short.diagnostics()');
    const devF = await rect('#btn-dev');
    check('无 inset/aspect-ratio 基础回退仍可见', fallback.wrap.width > 0 && fallback.menuBox &&
      devF && devF.left >= 0 && devF.top >= 0 && devF.right <= 960 && devF.bottom <= 540,
      JSON.stringify({ wrap: fallback.wrap, menu: fallback.menuBox, dev: devF }));
    const clickF = await screenClick('#btn-dev');
    check('基础回退仍可屏幕点击开始', clickF.ok && clickF.hit && clickF.hit.contains &&
      await waitFor('!!RA.short.state.session', 8000));

    // 离线 www/Android 包入口也必须用屏幕坐标启动
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 360, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'www/index.html').replace(/\\/g, '/') + '?touch=1' });
    await sleep(700);
    check('离线 www 冷启动', await waitFor('!!RA.short && !!RA.short.diagnostics && !!document.getElementById("menu")', 12000));
    const wwwDiag = await evaluate('RA.short.diagnostics()');
    check('离线 www 菜单在主按钮屏内', wwwDiag.menuBox && wwwDiag.menuBox.top >= 0 &&
      wwwDiag.menuBox.top + wwwDiag.menuBox.height <= 361, JSON.stringify(wwwDiag.menuBox));
    const wwwClick = await screenClick('#btn-dev');
    check('离线 www 屏幕坐标启动', wwwClick.ok && wwwClick.hit && wwwClick.hit.contains &&
      await waitFor('!!RA.short.state.session', 8000));
    await shot('b3r2-www-800x360-game.png');

    const evidence = {
      date: new Date().toISOString(), browser: browser.version.Browser,
      cases, pass, fail, results,
      note: 'Chrome 移动视口/DPR 模拟;不是 OPD2101/Android 11/WebView 真机证据。真机未复测。'
    };
    writeFileSync(join(OUT, 'browser-b3r2-2026-11-06.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    browser.ws.close(); killTree(browser.child); await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nB3-R2 浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('B3-R2 浏览器检查失败:' + (e && e.message)); process.exit(1); });
