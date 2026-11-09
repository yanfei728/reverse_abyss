#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_28_return_soul.mjs —— 28号卡可见证据
 * =============================================
 *   node tools/browser_28_return_soul.mjs
 *
 * 真实 Chrome:未通关顶部/暂停返回原草稿、编辑器灵魂方向双击/右键取消/污水连续铺、
 * 试玩与正式内存fixture显示。不写作者passed/池/草稿;内存fixture只在本页。
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
const results = []; let pass = 0, fail = 0;
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) });
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function freePort() { return new Promise((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
async function fetchJson(u) { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map(); let seq = 0;
    ws.onopen = () => resolve({ send(m, p) { return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p || {} })); }); }, close() { try { ws.close(); } catch (e) { /* ignore */ } } });
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result); };
  });
}
function killTree(c) { try { spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* ignore */ } }

async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean).filter((p) => existsSync(p));
  if (!exes.length) { console.error('找不到 Chrome/Edge'); return 2; }
  let browser = null, last = null;
  for (const exe of exes) {
    const profile = mkdtempSync(join(tmpdir(), 'ra-28-chrome-')), port = await freePort();
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900', '--user-data-dir=' + profile,
      '--remote-debugging-port=' + port, 'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/')], { stdio: 'ignore', windowsHide: true });
    try {
      let version = null;
      for (let i = 0; i < 100 && !version; i++) { try { version = await fetchJson('http://127.0.0.1:' + port + '/json/version'); } catch (e) { await sleep(100); } }
      if (!version) throw new Error('DevTools 端口未启动');
      let target = null;
      for (let i = 0; i < 60 && !target; i++) { const list = await fetchJson('http://127.0.0.1:' + port + '/json/list'); target = list.find((t) => t.type === 'page'); if (!target) await sleep(100); }
      if (!target) throw new Error('找不到页面目标');
      const ws = await connect(target.webSocketDebuggerUrl);
      await ws.send('Page.enable'); await ws.send('Runtime.enable');
      browser = { ws, child, profile, version }; break;
    } catch (e) { last = e; killTree(child); try { rmSync(profile, { recursive: true, force: true }); } catch (e2) { /* ignore */ } }
  }
  if (!browser) { console.error('浏览器启动失败:' + (last && last.message)); return 1; }
  const send = browser.ws.send;
  try {
    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面异常:' + (r.exceptionDetails.text || '') + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
      return r.result ? r.result.value : undefined;
    }
    async function waitFor(expr, ms) { const end = Date.now() + (ms || 10000); while (Date.now() < end) { try { if (await evaluate(expr)) return true; } catch (e) { /* page switching */ } await sleep(60); } return false; }
    async function shot(n) { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); }
    async function mouse(x, y, button) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: button || 'left', clickCount: 1 });
      await sleep(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: button || 'left', clickCount: 1 });
      await sleep(70);
    }
    async function rect(sel) { return await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()'); }
    async function cellPoint(c, r) {
      return await evaluate('(function(){var ed=RA.editor,cv=document.getElementById("board");var q=ed.cellToScreen(' + (c + 0.5) + ',' + (r + 0.5) + ');var b=cv.getBoundingClientRect();return {x:b.left+q.x*b.width/(cv.width||1),y:b.top+q.y*b.height/(cv.height||1)};})()');
    }
    async function clickCell(c, r, button) { const p = await cellPoint(c, r); await mouse(p.x, p.y, button); }
    async function selectPalette(name) {
      const p = await evaluate('(function(){var bs=document.querySelectorAll(".pitem");for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()===' + JSON.stringify(name) + '){var r=bs[i].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}}return null;})()');
      if (!p) return false; await mouse(p.x, p.y, 'left'); return true;
    }
    async function loadLevel(d) {
      await evaluate('RA.editor.openJSONText(' + JSON.stringify(d) + ',"28 visual probe");true');
      await sleep(250);
    }
    function levelJSON(id) {
      return `(function(){var d=JSON.parse(JSON.stringify(RA.FULL40.fallback));
        d.id='${id}';d.title='28 灵魂与污水';d.difficulty=1;d.contentHash=null;d.certification=null;
        for(var c=3;c<=6;c++){d.terrain.tiles[14][c]=4;}
        d.objects=[
          {id:'soulv',type:'soul',col:4,row:13,params:{radiusTiles:0.5,damage:20,initialDirection:1},pathId:null},
          {id:'poolv',type:'sewage_pool',col:8,row:18,params:{},pathId:null},
          {id:'pooldoor',type:'crumble_door',col:7,row:4,params:{fadeSeconds:0.12},pathId:null}
        ];
        d.paths=[];return JSON.stringify(d,null,2);})()`;
    }

    function soulPendingDirsOk(dirs, dir) { return Array.isArray(dirs) && dirs.indexOf(dir) >= 0; }

    check('Chrome 已启动', true, browser.version.Browser + ' headless');
    check('编辑器进入', await waitFor('!!RA.editor && !!RA.editor.model', 15000));

    // 返回原稿:真实试玩后从顶部/暂停返回
    const originalLevel = await evaluate(levelJSON('return_soul_28'));
    await loadLevel(originalLevel);
    await evaluate('RA.editor.saveDraft({silent:true})');
    await sleep(200);
    const originalRef = await evaluate('({draftId:RA.editor.draftId,revision:RA.editor.draftRevision,hash:RA.LevelData.hashSync(RA.editor.model.toData())})');
    const playBtn = await rect('#btn-play');
    await mouse(playBtn.x, playBtn.y, 'left');
    check('进入未通关试玩', await waitFor('location.pathname.indexOf("trial.html")>=0 && !!RA.trial && !!RA.trial.session', 15000));
    const topBack = await rect('#btn-top-editor');
    check('顶部返回入口存在', !!topBack);
    const trialRefTop = await evaluate('({draftId:RA.trial.plan.draftRef.draftId,revision:RA.trial.plan.draftRef.revision})');
    await mouse(topBack.x, topBack.y, 'left');
    check('未通关点顶部返回编辑器', await waitFor('location.pathname.indexOf("editor.html")>=0 && !!RA.editor', 15000));
    await sleep(500);
    const restoredTop = await evaluate('({draftId:RA.editor.draftId,revision:RA.editor.draftRevision,hash:RA.LevelData.hashSync(RA.editor.model.toData()),soul:RA.editor.model.data.objects.some(function(o){return o.type==="soul";})})');
    check('顶部返回打开原草稿同ID/hash/内容', restoredTop && restoredTop.draftId === trialRefTop.draftId &&
      restoredTop.revision === trialRefTop.revision && restoredTop.hash === originalRef.hash && restoredTop.soul,
      JSON.stringify(restoredTop) + ' expected=' + JSON.stringify(trialRefTop));
    await shot('28-return-top-editor-restored.png');

    // 暂停返回
    await mouse((await rect('#btn-play')).x, (await rect('#btn-play')).y, 'left');
    await waitFor('location.pathname.indexOf("trial.html")>=0 && !!RA.trial', 15000);
    await mouse((await rect('#btn-pause')).x, (await rect('#btn-pause')).y, 'left');
    await sleep(150);
    const trialRefPause = await evaluate('({draftId:RA.trial.plan.draftRef.draftId,revision:RA.trial.plan.draftRef.revision})');
    await mouse((await rect('#btn-pause-editor')).x, (await rect('#btn-pause-editor')).y, 'left');
    check('暂停返回也打开原草稿', await waitFor('location.pathname.indexOf("editor.html")>=0 && !!RA.editor', 15000));
    await sleep(400);
    const restoredPause = await evaluate('({draftId:RA.editor.draftId,revision:RA.editor.draftRevision,hash:RA.LevelData.hashSync(RA.editor.model.toData())})');
    check('暂停返回同ID/revision/hash', restoredPause && restoredPause.draftId === trialRefPause.draftId &&
      restoredPause.revision === trialRefPause.revision && restoredPause.hash === originalRef.hash,
      JSON.stringify(restoredPause) + ' expected=' + JSON.stringify(trialRefPause));

    // 编辑器:第一击锁格/箭头/第二击确认;右键取消;污水连续铺
    await evaluate('(function(){var e=RA.editor;e.newLevel(14,12,false);e.fitView();e.model.setTile(5,4,4);e.model.setTile(6,4,4);e.model.invalidate();e.syncUI();return true;})()');
    await sleep(250);
    check('选中灵魂', await selectPalette('灵魂'));
    await clickCell(5, 3);
    const pIllegal = await cellPoint(5, 1);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pIllegal.x, y: pIllegal.y, button: 'none', clickCount: 0 });
    await sleep(120);
    const illegalDir = await evaluate('RA.editor.soulGesture && RA.editor.soulGesture.dir');
    check('鼠标指向非法方向时只保留合法方向', illegalDir !== 0 &&
      soulPendingDirsOk(await evaluate('RA.editor.soulGesture && RA.editor.soulGesture.directions'), illegalDir),
      String(illegalDir));
    const pArrow = await cellPoint(7, 3);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pArrow.x, y: pArrow.y, button: 'none', clickCount: 0 });
    await sleep(150);
    const soulPending = await evaluate('({col:RA.editor.soulGesture&&RA.editor.soulGesture.col,row:RA.editor.soulGesture&&RA.editor.soulGesture.row,dir:RA.editor.soulGesture&&RA.editor.soulGesture.dir,dirs:RA.editor.soulGesture&&RA.editor.soulGesture.directions,objects:RA.editor.model.data.objects.length})');
    check('第一击只锁位置并给出合法方向', soulPending && soulPending.col === 5 && soulPending.row === 3 &&
      Array.isArray(soulPending.dirs) && soulPending.dirs.indexOf(soulPending.dir) >= 0 && soulPending.objects === 0,
      JSON.stringify(soulPending));
    await shot('28-editor-soul-direction-arrow.png');
    // 方向阶段不能保存/试玩半成品
    const pendingPlay = await rect('#btn-play');
    await mouse(pendingPlay.x, pendingPlay.y, 'left');
    await sleep(300);
    const pendingGuard = await evaluate('({path:location.pathname,msg:RA.editor.msg,gesture:!!RA.editor.soulGesture})');
    check('方向阶段试玩被阻止且提示先确认/取消', pendingGuard && pendingGuard.path.indexOf('editor.html') >= 0 &&
      pendingGuard.gesture && /方向/.test(pendingGuard.msg), JSON.stringify(pendingGuard));
    await clickCell(5, 3);
    await sleep(150);
    const soulCommitted = await evaluate('(function(){var o=RA.editor.model.data.objects.filter(function(x){return x.type==="soul";})[0];return {count:RA.editor.model.data.objects.filter(function(x){return x.type==="soul";}).length,dir:o&&o.params.initialDirection,path:o&&o.pathId};})()');
    check('第二击提交一个灵魂、显式方向、无路径', soulCommitted && soulCommitted.count === 1 &&
      soulCommitted.dir >= 0 && soulCommitted.dir <= 3 && soulCommitted.path === null, JSON.stringify(soulCommitted));

    await selectPalette('灵魂');
    await clickCell(6, 3);
    await clickCell(6, 3, 'right');
    await sleep(120);
    const soulCancelled = await evaluate('RA.editor.model.data.objects.filter(function(x){return x.type==="soul";}).length');
    check('右键取消不新增灵魂', soulCancelled === 1, String(soulCancelled));

    await selectPalette('污水池');
    const p0 = await cellPoint(8, 8), p1 = await cellPoint(10, 8);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p0.x, y: p0.y, button: 'none', clickCount: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p0.x, y: p0.y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p1.x, y: p1.y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p1.x, y: p1.y, button: 'left', clickCount: 1 });
    await sleep(200);
    const poolState = await evaluate('({pools:RA.editor.model.data.objects.filter(function(x){return x.type==="sewage_pool";}).length,tile:RA.editor.model.getTile(8,8),undo:RA.editor.undoStack.length})');
    check('污水池连续铺多格且不擦真实地形', poolState && poolState.pools >= 2 && poolState.tile === 0,
      JSON.stringify(poolState));
    await shot('28-editor-soul-and-sewage.png');

    // 试玩显示:灵魂/池(新 id,避免与刚才原草稿 revision 冲突)
    const visualLevel = await evaluate(levelJSON('return_soul_28_visual'));
    await loadLevel(visualLevel);
    await evaluate('RA.editor.saveDraft({silent:true})');
    await sleep(200);
    await mouse((await rect('#btn-play')).x, (await rect('#btn-play')).y, 'left');
    let trialOpened2 = await waitFor('location.pathname.indexOf("trial.html")>=0 && !!RA.trial && !!RA.trial.session', 5000);
    if (!trialOpened2) {
      const r = await evaluate('(async function(){try{var out=await RA.editor.openPlaytest();return {out:out,msg:RA.editor.msg,disabled:document.getElementById("btn-play").disabled,saving:RA.editor._saving,dirty:RA.editor.dirty,kind:RA.editor.model.data.kind,diff:RA.editor.model.data.difficulty};}catch(e){return {err:String(e&&e.stack||e),msg:RA.editor.msg};}})()');
      await sleep(500);
      trialOpened2 = await waitFor('location.pathname.indexOf("trial.html")>=0 && !!RA.trial && !!RA.trial.session', 10000);
      if (!trialOpened2) check('第二次进入试玩', false, JSON.stringify(r));
    }
    if (!trialOpened2) {
      const dbg = await evaluate('({path:location.pathname,msg:RA.editor&&RA.editor.msg,dirty:RA.editor&&RA.editor.dirty,soul:RA.editor&&!!RA.editor.soulGesture})');
      check('第二次进入试玩', false, JSON.stringify(dbg));
    } else {
      check('第二次进入试玩', true);
    }
    if (!trialOpened2) throw new Error('第二次试玩未启动');
    await sleep(500);
    const trialMon = await evaluate('(function(){var s=RA.trial.session,i=s.inst;var so=i.objects.filter(function(o){return o.type==="soul";})[0],po=i.objects.filter(function(o){return o.type==="sewage_pool";})[0];return {types:i.objects.map(function(o){return o.type;}),alive:so&&so.alive,pool:!!po};})()');
    check('试玩层含灵魂/污水池', trialMon && trialMon.types.indexOf('soul') >= 0 && trialMon.types.indexOf('sewage_pool') >= 0 && trialMon.alive);
    await shot('28-trial-soul-sewage.png');

    // 正式塔内存fixture
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/') });
    check('正式入口加载', await waitFor('!!RA.short && !!RA.short.state', 15000));
    await evaluate(`(function(){var fb=RA.FULL40.fallback;for(var c=3;c<=6;c++){fb.terrain.tiles[14][c]=4;}
      fb.objects=[{id:'soulf',type:'soul',col:4,row:13,params:{radiusTiles:0.5,damage:20,initialDirection:1},pathId:null},
        {id:'poolf',type:'sewage_pool',col:8,row:18,params:{},pathId:null}];fb.paths=[];fb.contentHash=null;fb.certification=null;return true;})()`);
    const fb = await rect('#btn-formal');
    await mouse(fb.x, fb.y, 'left');
    if (!(await waitFor('!!RA.short.state.session', 3000))) await evaluate('document.querySelector("#btn-formal").click();true');
    check('正式完整塔启动', await waitFor('!!RA.short.state.session', 12000));
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyF', key: 'f', windowsVirtualKeyCode: 70 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyF', key: 'f', windowsVirtualKeyCode: 70 });
    await waitFor('RA.short.state.session.world.current===1', 3000);
    await sleep(500);
    const formal = await evaluate('(function(){var s=RA.short.state.session,i=s.world.currentFloor;return {floor:s.world.current,types:i.objects.map(function(o){return o.type;}),hud:document.getElementById("floor-text").textContent};})()');
    check('正式塔含灵魂/污水池且HUD同步', formal && formal.floor === 1 &&
      formal.types.indexOf('soul') >= 0 && formal.types.indexOf('sewage_pool') >= 0 && formal.hud.indexOf('1/40') >= 0,
      JSON.stringify(formal));
    await shot('28-formal-soul-sewage-floor1.png');
  } finally {
    try { browser.ws.close(); } catch (e) { /* ignore */ }
    killTree(browser.child);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  const evidence = { title: '28号卡可见浏览器证据', date: '2026-11-09',
    note: '真实Chrome:未通关顶部/暂停返回原草稿、编辑器灵魂第一击/箭头/第二击/右键取消/污水连续铺、试玩与正式内存fixture。不写作者passed/池/草稿;正式为内存fixture。',
    browser: browser.version.Browser, pass, fail, results };
  writeFileSync(join(OUT, 'browser-28-return-soul-2026-11-09.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('\n28号卡浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('检查异常:' + (e && e.stack || e)); process.exit(1); });
