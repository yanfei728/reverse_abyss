#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_26_seams.mjs —— 26号卡:可见 Chrome 真实键盘接缝 / 第4层 HUD 组合
 * =========================================================================
 *     node tools/browser_26_seams.mjs
 *
 * 从 index.html 进入正式完整塔,F 0→1。每个目标接缝开始前用一次明确标注的合法
 * finish 站位 fixture(不改 current/debugJump),之后全部真实键盘跳跃/横移。
 * 覆盖 1→2、2→3、3→4、4→5(右移)、5→6;第4→5前后检查缺图/云板/管壁。
 * 这不是连续整图路线,也不是真人全塔通关;连续物理步进证据在 test_26_continuous。
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
const t0 = Date.now();
const results = [];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) });
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function fetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); const pending = new Map(); let seq = 0;
    ws.onopen = () => resolve({
      send(m, p) { return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p || {} })); }); },
      close() { try { ws.close(); } catch (e) { /* ignore */ } }
    });
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m.id || !pending.has(m.id)) return;
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
    };
  });
}
function killTree(c) { try { spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* ignore */ } }

async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean).filter((p) => existsSync(p));
  if (!exes.length) { console.error('找不到 Chrome/Edge'); return 2; }
  let browser = null, last = null;
  for (const exe of exes) {
    const profile = mkdtempSync(join(tmpdir(), 'ra-26-chrome-'));
    const port = await freePort();
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + port,
      'file:///' + join(ROOT, 'index.html').replace(/\\/g, '/')], { stdio: 'ignore', windowsHide: true });
    try {
      let version = null;
      for (let i = 0; i < 100 && !version; i++) {
        try { version = await fetchJson('http://127.0.0.1:' + port + '/json/version'); } catch (e) { await sleep(100); }
      }
      if (!version) throw new Error('DevTools 端口未启动');
      let target = null;
      for (let i = 0; i < 60 && !target; i++) {
        const list = await fetchJson('http://127.0.0.1:' + port + '/json/list');
        target = list.find((t) => t.type === 'page');
        if (!target) await sleep(100);
      }
      if (!target) throw new Error('找不到页面目标');
      const ws = await connect(target.webSocketDebuggerUrl);
      await ws.send('Page.enable'); await ws.send('Runtime.enable');
      browser = { ws, child, profile, version, exe };
      break;
    } catch (e) {
      last = e; killTree(child);
      try { rmSync(profile, { recursive: true, force: true }); } catch (e2) { /* ignore */ }
    }
  }
  if (!browser) { console.error('浏览器启动失败:' + (last && last.message)); return 1; }
  const send = browser.ws.send;
  try {
    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面异常:' + (r.exceptionDetails.text || '') + ' ' +
        ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
      return r.result ? r.result.value : undefined;
    }
    async function waitFor(expr, ms) {
      const end = Date.now() + (ms || 10000);
      while (Date.now() < end) { try { if (await evaluate(expr)) return true; } catch (e) { /* 页面还在切 */ } await sleep(60); }
      return false;
    }
    async function key(code, name, vk, down) {
      await send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', code, key: name,
        windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    }
    async function tapF() {
      await key('KeyF', 'f', 70, true); await sleep(120); await key('KeyF', 'f', 70, false); await sleep(150);
    }
    async function shot(name) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
    }
    async function rect(selector) {
      return await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)return null;var r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()');
    }
    async function click(selector) {
      const r = await rect(selector); if (!r) return false;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(300); return true;
    }
    async function state() {
      const text = await evaluate('(function(){var s=RA.short&&RA.short.state.session;if(!s)return null;' +
        'var w=s.world,f=w.currentFloor,p=s.player;return JSON.stringify({floor:w.current,status:s.status,' +
        'x:p.x+p.w/2-f.origin.x,feet:p.feet-f.origin.y,onGround:p.onGround,' +
        'hud:document.getElementById("floor-text").textContent,' +
        'live:[].concat(Array.from(w.instances.keys())),hasNext:w.instances.has(w.current+1),' +
        'playerView:p.level.inst.index,links:w.liveStoneLinks().map(function(l){return l.lowerIndex;}),' +
        'linksPlanned:w.links.filter(function(l){return l&&l.kind==="stone-pipe";}).map(function(l){return l.lowerIndex;})});})()');
      return text ? JSON.parse(text) : null;
    }
    async function fixtureAt(linkIndex) {
      await evaluate(`(function(){
        var s=RA.short.state.session,w=s.world,l=w.links[${linkIndex}],p=s.player;
        p.x=(l.openingLeft+l.openingRight-p.w)/2; p.y=l.finishY-p.h;
        p.vx=p.vy=0; p.onGround=true; p.coyote=0.1; p.jumpsUsed=0;
        p.prevJump=false; p.jumpBuffer=0; p.ledgeUsed=false;
        return true;
      })()`);
      await sleep(150);
    }
    // 真实键盘:一次跳跃+按住的二段跳;right=true 时在上升段向右。
    async function jumpSeam(right) {
      await key('Space', ' ', 32, true);
      if (right) await key('ArrowRight', 'ArrowRight', 39, true);
      await sleep(300);
      await key('Space', ' ', 32, false);
      await sleep(90);
      await key('Space', ' ', 32, true);
      await sleep(650);
      await key('Space', ' ', 32, false);
      if (right) await key('ArrowRight', 'ArrowRight', 39, false);
      await sleep(900);
    }

    check('Chrome 已启动', true, browser.version.Browser + ' headless(真实渲染/键盘)');
    check('index.html 进入完整塔', await waitFor('location.pathname.indexOf("short.html")>=0 && !!RA.short', 15000));
    await click('#btn-formal');
    check('正式完整塔启动', await waitFor('!!RA.short.state.session', 10000));
    check('开局在 0 层', (await state()).floor === 0);
    await tapF();
    check('真实键盘 F 进入第 1 层', await waitFor('RA.short.state.session.world.current===1', 3000),
      (await state()).hud);

    // 1→2,2→3,3→4:每个接缝一次合法 finish 站位 fixture,随后真实键盘
    for (const from of [1, 2, 3]) {
      await fixtureAt(from);
      await jumpSeam(false);
      const st = await state();
      check('真实键盘从 ' + from + ' 层上穿到 ' + (from + 1),
        st && st.floor === from + 1 && st.playerView === from + 1,
        st && (st.hud + ' view=' + st.playerView + ' live=' + st.live.join(',')));
    }
    let st4 = await state();
    check('到达第 4 层、HUD/地图已接上', st4 && st4.floor === 4 && st4.hud.indexOf('4/40') >= 0,
      st4 && st4.hud);
    check('4层 runtimeLinks 不含未实存的5→6', st4 && st4.links.indexOf(5) < 0,
      st4 && ('live links=' + st4.links.join(',')));
    await shot('26-browser-floor4-before-cross.png');

    // 第4层 HUD 组合:fixture 到4层finish,真实右移上穿到5
    await fixtureAt(4);
    await jumpSeam(true);
    const st5 = await state();
    check('4→5 右移上穿后 HUD/current/Player.view 都为 5',
      st5 && st5.floor === 5 && st5.playerView === 5 && st5.hud.indexOf('5/40') >= 0,
      st5 && (st5.hud + ' view=' + st5.playerView));
    check('5层 live=4/5/6,6号图已加载', st5 && st5.live.join(',') === '4,5,6' && st5.hasNext,
      st5 && ('live=' + st5.live.join(',') + ' has6=' + st5.hasNext));
    check('5→6 运行几何进入 runtimeLinks', st5 && st5.links.indexOf(5) >= 0,
      st5 && st5.links.join(','));
    await shot('26-browser-floor5-map6-loaded.png');

    const collisions = await evaluate(`(function(){
      var s=RA.short.state.session,w=s.world,p=s.player;
      var t=w.instances.get(5),top=t.origin.y+t.finish.row*RA.C.TS;
      var x=t.origin.x+(t.finish.col+1)*RA.C.TS-p.w/2;
      function down(inst){return inst.view.move(x,top-p.h-0.25,p.w,p.h,0,90,1/60).grounded;}
      function up(inst){return inst.view.move(x,top+10,p.w,p.h,0,-200,1/60).y;}
      var wall=w.links[5].walls[0],wx=wall.x+10,wy=wall.y+2*RA.C.TS;
      function wallMove(inst){var r=inst.view.move(wx+2,wy-p.h/2,p.w,p.h,-180,0,1/60);return {vx:r.vx,x:r.x};}
      return JSON.stringify({active5:{down:down(w.instances.get(5)),up:up(w.instances.get(5)),wall:wallMove(w.instances.get(5))},
        preview6:{down:down(w.instances.get(6)),up:up(w.instances.get(6)),wall:wallMove(w.instances.get(6))}});
    })()`).then(JSON.parse);
    check('同一 live 云板从 active5/preview6 下落都能站',
      collisions.active5.down === true && collisions.preview6.down === true);
    check('同一 live 云板上穿都能过(oneWay 保留)',
      collisions.active5.up < 0 && collisions.preview6.up < 0 &&
      collisions.active5.up === collisions.preview6.up);
    check('同一 live 管壁横向都挡住', collisions.active5.wall.vx === 0 &&
      collisions.preview6.wall.vx === 0 &&
      collisions.active5.wall.x === collisions.preview6.wall.x);

    // 5→6:真实键盘继续
    await fixtureAt(5);
    await jumpSeam(false);
    const st6 = await state();
    check('真实键盘从5层上穿到6层、HUD 与地图同步', st6 && st6.floor === 6 &&
      st6.hud.indexOf('6/40') >= 0, st6 && st6.hud);
    await shot('26-browser-floor6-continued.png');
  } finally {
    try { browser.ws.close(); } catch (e) { /* ignore */ }
    killTree(browser.child);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const evidence = {
    title: '26号卡接缝真实 Chrome 检查', date: '2026-11-09',
    note: 'index.html 正式完整塔;每个接缝前一次明确标注的 finish 站位 fixture,随后真实键盘上穿;覆盖1→2/2→3/3→4/4→5右移/5→6。不是连续整图路线,不是 debugJumpTo,不是真人全塔通关。交互式连续平台攀爬在可见浏览器中未完成。',
    browser: browser.version.Browser, elapsedSeconds: Number(elapsed), pass, fail, results
  };
  writeFileSync(join(OUT, 'browser-26-seams-2026-11-09.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('\n26号卡接缝浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' + elapsed + 's');
  return fail ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('检查异常:' + (e && e.stack || e));
  process.exit(1);
});
