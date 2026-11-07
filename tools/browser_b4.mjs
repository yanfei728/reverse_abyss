#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_b4.mjs —— B4 PC 真实浏览器检查
 * 短塔三图/石管、编辑器端点/对象/尺寸/裁剪/只读/双主题、标准试玩夹具。
 * 桌面视口不等于真机;画面/手感仍需人工。
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
      const q = pending.get(m.id); if (!q) return; pending.delete(m.id);
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
    const profile = mkdtempSync(join(tmpdir(), 'ra-b4-chrome-'));
    const port = await freePort();
    const url = 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/') + '?touch=1';
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900', '--touch-events=enabled',
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
      browser = { ws, child, profile, version, exe };
      break;
    } catch (e) { last = e; killTree(child); try { rmSync(profile, { recursive: true, force: true }); } catch (e2) {} }
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
    async function nav(file, w, h, dpr) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr || 1, mobile: false });
      await send('Page.navigate', { url: 'file:///' + join(ROOT, file).replace(/\\/g, '/') });
      await sleep(800);
    }
    async function rect(selector) {
      return await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)return null;var r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,id:e.id||""};})()');
    }
    async function click(selector) {
      await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');if(e&&e.scrollIntoView)e.scrollIntoView({block:"center",inline:"nearest"});})()');
      await sleep(80);
      const r = await rect(selector); if (!r) return false;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');var h=document.elementFromPoint(' + x + ',' + y + ');return !!(e&&h&&(e===h||e.contains(h)));})()');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(180);
      return hit;
    }
    async function paletteClick(name) {
      const r = await evaluate('(function(){var bs=document.querySelectorAll(".pitem");for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf(' + JSON.stringify(name) + ')>=0){bs[i].scrollIntoView({block:"center"});var q=bs[i].getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height/2,text:bs[i].textContent};}}return null;})()');
      await sleep(80);
      if (!r) return false;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(120);
      return true;
    }
    async function dragCell(c0, r0, c1, r1) {
      const a = await evaluate('(function(){var q=RA.editor.cellToScreen(' + c0 + ',' + r0 + ');var b=document.getElementById("board").getBoundingClientRect();return {x:b.left+q.x+RA.editor.view.zoom*RA.C.TS/2,y:b.top+q.y+RA.editor.view.zoom*RA.C.TS/2};})()');
      const b = await evaluate('(function(){var q=RA.editor.cellToScreen(' + c1 + ',' + r1 + ');var d=document.getElementById("board").getBoundingClientRect();return {x:d.left+q.x+RA.editor.view.zoom*RA.C.TS/2,y:d.top+q.y+RA.editor.view.zoom*RA.C.TS/2};})()');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'left', buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
      await sleep(180);
    }

    async function cellClick(c, r) {
      const p = await evaluate('(function(){var q=RA.editor.cellToScreen(' + c + ',' + r + ');var b=document.getElementById("board").getBoundingClientRect();return {x:b.left+q.x+RA.editor.view.zoom*RA.C.TS/2,y:b.top+q.y+RA.editor.view.zoom*RA.C.TS/2};})()');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await sleep(180);
      return p;
    }

    check('浏览器启动', true, browser.version.Browser + ' headless');

    // ---------- 短塔 ----------
    check('短塔加载', await waitFor('!!RA.short && !!RA.short.state && !!RA.B4_SAMPLES', 12000));
    const startHit = await click('#btn-dev');
    check('屏幕点击开发短塔', startHit && await waitFor('!!RA.short.state.session', 8000));
    await sleep(500);
    const game = await evaluate('(function(){var s=RA.short.state.session;return {n:s.world.floorCount,ids:s.world.floorsData.map(function(f){return f.id;}),links:s.world.links.map(function(l){return l&&l.kind;}),floor:s.world.current,status:s.status,x:s.player.x};})()');
    check('短塔为大厅+test1/2/3+休整+Boss', game.n === 6 &&
      game.ids.join(',') === 'b4_lobby,author_test_1,author_test_2,author_test_3,b4_rest,b4_boss', JSON.stringify(game.ids));
    check('连接为 lobby-direct + 4 stone-pipe', game.links.join(',') === 'lobby-direct,stone-pipe,stone-pipe,stone-pipe,stone-pipe', JSON.stringify(game.links));
    await shot('b4-short-960x540.png');
    const x0 = game.x;
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyD', key: 'd', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
    await sleep(300);
    const x1 = await evaluate('RA.short.state.session.player.x');
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyD', key: 'd', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
    check('短塔实际移动', x1 > x0 + 4, JSON.stringify({ x0, x1 }));
    const cross = await evaluate(`(function(){
      var s=RA.short.state.session,w=s.world,p=s.player;s.paused=false;var out=[];
      for(var i=0;i<5;i++){var l=w.links[i];p.x=(l.openingLeft+l.openingRight)/2-p.w/2;p.y=l.commitY-p.h+20;p.vx=0;p.vy=-400;var n=0;while(w.current===i&&n++<30)s.stepOnce();out.push(w.current);}
      return {out:out,playerSame: s.player===p,status:s.status};
    })()`);
    check('实际步进逐层穿管 0→1→2→3→4→5', JSON.stringify(cross.out) === '[1,2,3,4,5]' && cross.playerSame, JSON.stringify(cross));

    // ---------- 编辑器 ----------
    await nav('editor.html', 1440, 900, 1);
    check('编辑器启动', await waitFor('!!RA.editor && !!RA.EditorModel && RA_EDITOR_READY', 12000));
    const opened = await evaluate('(function(){RA.editor.openJSONText(JSON.stringify(RA.B4_SAMPLES.normal1),"b4 test");return true;})()');
    check('打开作者层', opened && await waitFor('RA.editor.model && RA.editor.model.data.id === "author_test_1"', 5000));
    // 清除端点后重新用屏幕输入标记
    await evaluate('RA.editor.model.clearCloudPorts();RA.editor.syncUI();');
    await evaluate('RA.editor.setTool("select")');
    await dragCell(2, 22, 3, 22);
    check('屏幕点击标记起点', await click('#btn-start-apply'));
    await dragCell(15, 7, 16, 7);
    check('屏幕点击标记终点', await click('#btn-finish-apply'));
    const endpoint = await evaluate('(function(){var p=RA.editor.model.data.ports;return p&&{profile:p.profile,start:p.start,finish:p.finish};})()');
    check('端点写回 start/finish', endpoint && endpoint.profile === 'cloud-pipe-v2' &&
      endpoint.start.col === 2 && endpoint.start.row === 22 && endpoint.finish.col === 15 && endpoint.finish.row === 7, JSON.stringify(endpoint));
    // 新空层放火球(重开编辑器,避免上一段拖拽状态影响)
    await nav('editor.html', 1440, 900, 1);
    await waitFor('!!RA.editor && !!RA.EditorModel && RA_EDITOR_READY', 12000);
    await evaluate('RA.editor.setTool("brush");RA.editor.newLevel(20,20,false);');
    await sleep(300);
    const palHit = await paletteClick('火球');
    const palState = await evaluate('({ch:RA.editor.ch,tool:RA.editor.tool,ro:RA.editor.model.readOnly})');
    check('选择火球工具', palHit, JSON.stringify(palState));
    const cellp = await cellClick(5, 5);
    const placed = await evaluate('(function(){var o=RA.editor.model.data.objects[0];return o&&{type:o.type,col:o.col,row:o.row};})()');
    const objDebug = await evaluate('({tool:RA.editor.tool,ch:RA.editor.ch,stroke:!!RA.editor.stroke,sel:RA.editor.selection,objs:RA.editor.model.objects.length,tile:RA.editor.model.getTile(5,5),size:[RA.editor.model.cols,RA.editor.model.rows]})');
    check('屏幕点图放置火球', placed && placed.type === 'fireball_static' && placed.col === 5 && placed.row === 5, JSON.stringify({placed,cellp,palState,objDebug}));
    // 尺寸
    await evaluate('(function(){document.getElementById("w-input").value="20";document.getElementById("h-input").value="20";})()');
    await click('#btn-apply-size');
    check('应用尺寸后模型 20×20', await evaluate('RA.editor.model.cols===20 && RA.editor.model.rows===20'));
    // 裁剪作者图
    await evaluate('(function(){RA.editor.openJSONText(JSON.stringify(RA.B4_SAMPLES.normal1),"crop test");window.confirm=function(){return true;};})()');
    await sleep(300);
    await click('#btn-crop');
    const cropped = await evaluate('(function(){var m=RA.editor.model;return {cols:m.cols,rows:m.rows,f:m.data.ports.finish,s:m.data.ports.start,dirty:RA.editor.dirty};})()');
    check('裁剪到内容包络并平移端点', cropped.cols === 20 && cropped.rows === 16 && cropped.f.row === 0 && cropped.s.row === 15, JSON.stringify(cropped));
    await click('#btn-undo');
    const undone = await evaluate('({cols:RA.editor.model.cols,rows:RA.editor.model.rows,fr:RA.editor.model.data.ports.finish.row})');
    check('撤销完整恢复', undone.cols === 20 && undone.rows === 24 && undone.fr === 7, JSON.stringify(undone));
    // 只读 Boss
    await evaluate('RA.editor.openJSONText(JSON.stringify(RA.B4_SAMPLES.boss),"boss read");');
    await sleep(300);
    const ro = await evaluate('({ro:RA.editor.model.readOnly,banner:!document.getElementById("readonly-banner").hidden,hash:RA.LevelData.hashSync(RA.editor.model.toData())})');
    await cellClick(3, 3);
    const ro2 = await evaluate('({ro:RA.editor.model.readOnly,hash:RA.LevelData.hashSync(RA.editor.model.toData()),banner:!document.getElementById("readonly-banner").hidden})');
    check('Boss 只读:横幅、画布点击不改数据', ro.ro && ro.banner && ro.hash === ro2.hash, JSON.stringify({ ro, ro2 }));
    // 主题截图
    const themeHit = await click('#btn-theme');
    const themeRect = await rect('#btn-theme');
    const themeMeta = await evaluate('(function(){var b=document.getElementById("btn-theme");return {disabled:b.disabled,html:b.outerHTML,editor:!!RA.editor,theme:RA.editor&&RA.editor.theme};})()');
    const directTheme = await evaluate('(function(){var b=document.getElementById("btn-theme");b.click();return document.body.dataset.theme;})()');
    const theme = await evaluate('({t:document.body.dataset.theme,stored:localStorage.getItem("ra_editor_preferences_v1")})');
    await shot('b4-editor-light-1440x900.png');
    check('切换浅色并保存偏好', theme.t === 'light' && theme.stored && theme.stored.indexOf('light') >= 0, JSON.stringify({theme,themeHit,themeRect,themeMeta}));
    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await evaluate('RA.editor.syncUI()');
    await shot('b4-editor-light-1024x768.png');
    await evaluate('RA.editor.toggleTheme()');
    await sleep(200);
    await shot('b4-editor-dark-1024x768.png');
    check('切回深色', await evaluate('document.body.dataset.theme === "dark"'));

    // ---------- 标准试玩夹具 ----------
    await evaluate(`(function(){
      sessionStorage.setItem('RA_STANDARD_V1', JSON.stringify({
        template: RA.B4_SAMPLES.normal1,
        rulesVersion: RA.RULES.rulesVersion,
        rulesFingerprint: RA.RULES.rulesFingerprint
      }));
    })()`);
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'standard.html').replace(/\\/g, '/') });
    await sleep(1000);
    const std = await waitFor('!!RA.standard && !!RA.standard.session', 12000);
    check('标准试玩云板夹具启动', std);
    const stdInfo = await evaluate('(function(){var s=RA.standard.session;return {n:s.world.floorCount,links:s.world.links.map(function(l){return l&&l.kind;}),first:s.world.floorsData[0].ports.profile,last:s.world.floorsData[1].ports.profile};})()');
    check('标准夹具:3层,cloud-pipe-v2', stdInfo.n === 3 && stdInfo.first === 'cloud-pipe-v2' && stdInfo.last === 'cloud-pipe-v2' && stdInfo.links.join(',') === 'lobby-direct,stone-pipe', JSON.stringify(stdInfo));
    await shot('b4-standard.png');

    // ---------- PC 离线 www ----------
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'www/index.html').replace(/\\/g, '/') });
    await sleep(900);
    check('PC 离线 www 加载 B4', await waitFor('!!RA.short && !!RA.B4_SAMPLES', 12000));
    await click('#btn-dev');
    const wwwGame = await evaluate('(function(){var s=RA.short.state.session;return s&&{n:s.world.floorCount,id:s.world.floorsData[0].id,links:s.world.links.length};})()');
    check('PC 离线 www 启动六层短塔', wwwGame && wwwGame.n === 6 && wwwGame.id === 'b4_lobby' && wwwGame.links === 5, JSON.stringify(wwwGame));
    await shot('b4-www-offline.png');

    const evidence = {
      date: new Date().toISOString(), browser: browser.version.Browser,
      pass, fail, results,
      note: 'Chrome 桌面真实浏览器;短塔/编辑器和标准夹具为实际页面,不等于 OPD2101 真机或人工通关。'
    };
    writeFileSync(join(OUT, 'browser-b4-2026-11-07.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    browser.ws.close(); killTree(browser.child); await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nB4 浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('B4 浏览器检查失败:' + (e && e.message)); process.exit(1); });
