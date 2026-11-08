#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_b4r1.mjs —— 17 号卡 PC 短塔真实页面检查
 * 屏幕点击启动、F 传送、短塔六图/F 提示/死亡重试;完整穿管/碰撞由 test_b4r1 逐连接验证。
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
    ws.onerror = () => reject(new Error('WebSocket'));
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } const q = pending.get(m.id); if (!q) return; pending.delete(m.id); m.error ? q.rej(new Error(m.error.message)) : q.res(m.result); };
  });
}
function killTree(c) { try { spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} }
async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean).filter((p) => existsSync(p));
  let browser = null, last = null;
  for (const exe of exes) {
    const profile = mkdtempSync(join(tmpdir(), 'ra-b4r1-chrome-'));
    const port = await freePort();
    const url = 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/') + '?touch=1';
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox',
      '--window-size=1440,900', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, url], { stdio: 'ignore', windowsHide: true });
    try {
      let version = null;
      for (let i = 0; i < 100 && !version; i++) { try { version = await fetchJson('http://127.0.0.1:' + port + '/json/version'); } catch (e) { await sleep(100); } }
      if (!version) throw new Error('DevTools 端口未启动');
      let target = null;
      for (let i = 0; i < 60 && !target; i++) {
        const list = await fetchJson('http://127.0.0.1:' + port + '/json/list');
        target = list.find((t) => t.type === 'page' && t.url.indexOf('short.html') >= 0);
        if (!target) await sleep(100);
      }
      if (!target) throw new Error('short.html 未加载');
      browser = { ws: await connect(target.webSocketDebuggerUrl), child, profile, version };
      break;
    } catch (e) { last = e; killTree(child); try { rmSync(profile, { recursive: true, force: true }); } catch (e2) {} }
  }
  if (!browser) { console.error('浏览器启动失败:' + (last && last.message)); return 1; }
  const send = browser.ws.send;
  try {
    async function ev(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || '页面异常'); return r.result && r.result.value; }
    async function waitFor(expr, ms) { const end = Date.now() + (ms || 10000); while (Date.now() < end) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(100); } return false; }
    async function rect(sel) { return await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return null;var r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()'); }
    async function click(sel) { const r = await rect(sel); if (!r) return false; const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');var h=document.elementFromPoint(' + x + ',' + y + ');return !!(e&&h&&(e===h||e.contains(h)));})()');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(180); return hit; }
    async function key(code, key) { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key, windowsVirtualKeyCode: code === 'KeyF' ? 70 : 0, nativeVirtualKeyCode: code === 'KeyF' ? 70 : 0 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key }); }
    async function shot(n) { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); }

    check('短塔页面加载', await waitFor('!!RA.short && !!RA.B4_SAMPLES', 12000));
    check('屏幕点击开发短塔', await click('#btn-dev') && await waitFor('!!RA.short.state.session', 8000));
    await sleep(500);
    const lobby = await ev('(function(){var s=RA.short.state.session;return {floor:s.world.current,id:s.world.floorsData[0].id,prompt:document.getElementById("interact-prompt").style.display,text:document.getElementById("interact-prompt").textContent,px:s.player.x,feet:s.player.feet};})()');
    check('大厅作者 level0 出生/F 提示', lobby.floor === 0 && lobby.id === 'b4_lobby' && lobby.prompt === 'block' && lobby.text.indexOf('F') >= 0, JSON.stringify(lobby));
    check('等待不会自动爬塔', await ev('RA.short.state.session.world.current===0'));
    await shot('b4r1-lobby.png');
    await key('KeyF', 'f');
    check('F 传送到第1层 test1', await waitFor('RA.short.state.session && RA.short.state.session.world.current===1', 4000));
    await sleep(500);
    const f1 = await ev('(function(){var s=RA.short.state.session;return {floor:s.world.current,id:s.world.floorsData[1].id,prompt:document.getElementById("interact-prompt").style.display,links:s.world.links.map(function(l){return l&&l.kind;})};})()');
    check('到 test1 且提示隐藏', f1.id === 'author_test_1' && f1.prompt === 'none', JSON.stringify(f1));
    check('1条传送+4条石管', f1.links.join(',') === 'lobby-transfer,stone-pipe,stone-pipe,stone-pipe,stone-pipe');
    await shot('b4r1-test1.png');
    const walls = await ev('(function(){var s=RA.short.state.session,f=s.world.instances.get(1);return {cells:f.wallCells?Object.keys(f.wallCells).length:0};})()');
    check('test1 下连接有6块石墙', walls.cells === 6, JSON.stringify(walls));
    await ev('(function(){var s=RA.short.state.session,l=s.world.links[1],p=s.player;p.x=(l.openingLeft+l.openingRight)/2-p.w/2;p.y=l.finishY-p.h;p.vx=0;p.vy=0;s.paused=true;RA.short.state.cam.x=p.x+p.w/2-RA.short.state.cw/2;RA.short.state.cam.y=p.y-RA.short.state.ch/2;})()');
    await sleep(200);
    await shot('b4r1-pipe.png');
    await ev('RA.short.state.session.paused=false');
    // 屏幕输入:下端云板靠左,左+二段跳,检查不进入上层左实心
    await ev('(function(){var s=RA.short.state.session,l=s.world.links[1],p=s.player;p.x=l.openingLeft+1;p.y=l.finishY-p.h;p.vx=0;p.vy=0;p.onGround=true;p.coyote=.1;p.jumpsUsed=0;p.prevJump=false;s.paused=false;})()');
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyA', key: 'a', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(120);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(80);
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(450);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyA', key: 'a', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(150);
    const side = await ev('(function(){var s=RA.short.state.session,l=s.world.links[1],u=s.world.instances.get(2),p=s.player,col=u.start.col-1;var wall={x:u.origin.x+col*RA.C.TS,y:u.origin.y+u.start.row*RA.C.TS,w:RA.C.TS,h:RA.C.TS};var ox=Math.min(p.x+p.w,wall.x+wall.w)-Math.max(p.x,wall.x),oy=Math.min(p.y+p.h,wall.y+wall.h)-Math.max(p.y,wall.y);return {current:s.world.current,px:p.x,py:p.y,ox:ox,oy:oy};})()');
    check('屏幕左+跳不进入上层侧实心', side.ox <= 1 || side.oy <= 1, JSON.stringify(side));
    await shot('b4r1-side-left.png');

    // 死亡/重试回到 level0 并再次提示
    await ev('RA.short.state.session.die("test")');
    await waitFor('getComputedStyle(document.getElementById("result-overlay")).display==="flex"', 3000);
    const died = await ev('RA.short.state.session.status');
    check('死亡进入结果界面', died === 'dead', died);
    const retry = await click('#btn-retry');
    check('重试回大厅', retry && await waitFor('!!RA.short.state.session && RA.short.state.session.world.current===0 && RA.short.state.session.status==="running"', 5000));
    await sleep(300);
    const retryPrompt = await ev('({id:RA.short.state.session.world.floorsData[0].id,prompt:document.getElementById("interact-prompt").style.display,ids:RA.short.state.session.world.floorsData.map(function(f){return f.id;})})');
    check('重试同一六图清单并显示 F', retryPrompt.id === 'b4_lobby' && retryPrompt.prompt === 'block' &&
      retryPrompt.ids.join(',') === 'b4_lobby,author_test_1,author_test_2,author_test_3,b4_rest,b4_boss', JSON.stringify(retryPrompt));
    await shot('b4r1-retry-lobby.png');

    // www 静态同步(不构建 APK)
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'www/index.html').replace(/\\/g, '/') });
    await sleep(800);
    check('PC 离线 www 加载固定短塔数据', await waitFor('!!RA.B4_SAMPLES && RA.B4_SAMPLES.lobby.id==="b4_lobby"', 10000));

    const evidence = { date: new Date().toISOString(), browser: browser.version.Browser, pass, fail, results,
      note: 'PC Chrome 页面/F/死亡重试;完整穿管由 test_b4r1 逐连接物理验证;不是真机或人工通关。' };
    writeFileSync(join(OUT, 'browser-b4r1-2026-11-07.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally { browser.ws.close(); killTree(browser.child); await sleep(300); try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) {} }
  console.log('\nB4-R1 浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('B4-R1 浏览器失败:' + (e && e.message)); process.exit(1); });
