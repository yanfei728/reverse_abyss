#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_27_monsters.mjs —— 27号卡可见证据
 * ==========================================
 *   node tools/browser_27_monsters.mjs
 *
 * 1) 真实鼠标在编辑器画移动火球路径、单击流星锤端点,截图;
 * 2) 用同一份等级数据进独立试玩,截图齿轮轨道/移动火球无路径/流星锤链;
 * 3) 正式塔用内存 fixture 给 test3 补位加新怪物,截图正式渲染。
 * 内存 fixture 只在本页生效,不写草稿/池/作者 passed;不是真人通关。
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
const results = [];
let pass = 0, fail = 0;
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
    const profile = mkdtempSync(join(tmpdir(), 'ra-27-chrome-'));
    const port = await freePort();
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + port,
      'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/')], { stdio: 'ignore', windowsHide: true });
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
      browser = { ws, child, profile, version };
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
    async function shot(name) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
    }
    async function mouse(x, y, button, clickCount) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: button || 'left', clickCount: clickCount || 1 });
      await sleep(60);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: button || 'left', clickCount: clickCount || 1 });
      await sleep(80);
    }
    async function clickPalette(name) {
      const r = await evaluate('(function(){var bs=document.querySelectorAll(".pitem");for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()===' +
        JSON.stringify(name) + ') {var q=bs[i].getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height/2};}}return null;})()');
      if (!r) return false;
      await mouse(r.x, r.y, 'left', 1);
      return true;
    }
    async function cellPoint(c, r) {
      return await evaluate('(function(){var ed=RA.editor, cv=document.getElementById("board");var q=ed.cellToScreen(' + (c + 0.5) + ',' + (r + 0.5) +
        ');var b=cv.getBoundingClientRect();var sx=b.width/(cv.width||1),sy=b.height/(cv.height||1);' +
        'return {x:b.left+q.x*sx,y:b.top+q.y*sy};})()');
    }
    async function clickCell(c, r, button) {
      const p = await cellPoint(c, r);
      await mouse(p.x, p.y, button || 'left', 1);
    }
    async function state() {
      return await evaluate('(function(){var e=RA.editor;if(!e)return null;return {ch:e.ch,objects:e.model.data.objects.map(function(o){return {type:o.type,pathId:o.pathId,col:o.col,row:o.row};}),paths:e.model.data.paths.map(function(p){return {id:p.id,mode:p.mode,points:p.points};}),gesture:!!e.gearGesture,dirty:e.dirty};})()');
    }

    check('Chrome 已启动', true, browser.version.Browser + ' headless');
    check('编辑器进入', await waitFor('!!RA.editor && !!RA.editor.model', 15000));
    await evaluate('(function(){var e=RA.editor;e.newLevel(18,24,false);e.fitView();e.syncUI();return true;})()');
    await sleep(200);

    // 真实鼠标:移动火球路径(左键首点/连续节点/右键完成)
    check('调色板选中移动火球', await clickPalette('移动火球'));
    await clickCell(3, 8);
    await clickCell(8, 8);
    await clickCell(8, 14);
    await clickCell(3, 14);
    await clickCell(3, 8, 'right');
    let st = await state();
    check('移动火球路径完成:一个对象一条路径', st && st.objects.filter((o) => o.type === 'fireball_moving').length === 1 &&
      st.paths.length === 1 && st.objects[0].pathId === st.paths[0].id, JSON.stringify(st));
    // 真实鼠标:流星锤只需单击一个端点
    check('调色板选中流星锤', await clickPalette('流星锤'));
    await clickCell(14, 12);
    st = await state();
    check('流星锤单击只放一个端点、无 path', st && st.objects.filter((o) => o.type === 'flail').length === 1 &&
      st.objects.filter((o) => o.type === 'flail')[0].pathId === null && st.paths.length === 1);
    await shot('27-editor-moving-path-flail.png');

    // Esc 取消整次路径事务:不留对象/路径
    await evaluate('RA.editor.newLevel(18,24,false); RA.editor.fitView(); RA.editor.syncUI(); true');
    await sleep(200);
    await clickPalette('移动火球');
    await clickCell(4, 6);
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(60);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(200);
    const escaped = await state();
    check('Esc 取消移动火球路径不留对象/路径', escaped && escaped.objects.length === 0 &&
      escaped.paths.length === 0 && !escaped.gesture, JSON.stringify(escaped));

    // 自定义试玩等级:同图并有三种怪物,便于视觉检查
    const trialLevel = await evaluate(`(function(){
      var d=JSON.parse(JSON.stringify(RA.FULL40.fallback));
      d.id='monster_visual_probe'; d.title='27 怪物视觉探针'; d.difficulty=1; d.certification=null; d.contentHash=null;
      d.objects=[
        {id:'gv',type:'gear',col:4,row:18,params:{speedTilesPerSecond:2,radiusTiles:0.5,damage:20},pathId:'pv'},
        {id:'mv',type:'fireball_moving',col:4,row:18,params:{radiusTiles:0.5,damage:20},pathId:'pv'},
        {id:'fv',type:'flail',col:10,row:15,params:{radiusTiles:0.5,damage:20},pathId:null},
        {id:'sv',type:'spike',col:14,row:19,params:{warningSeconds:0.5,activeSeconds:0.8,cooldownSeconds:1,damage:20},pathId:null}
      ];
      d.paths=[{id:'pv',mode:'pingpong',points:[{col:4,row:18},{col:17,row:18}]}];
      return JSON.stringify(d, null, 2);
    })()`);
    await evaluate('RA.editor.openJSONText(' + JSON.stringify(trialLevel) + ',"27 visual probe"); true');
    await sleep(300);
    const opened = await state();
    const openedMsg = await evaluate('(function(){return RA.editor.msg||"";})()');
    check('试玩等级载入编辑器', opened && opened.objects.length === 4 && opened.objects.some((o) => o.type === 'fireball_moving'),
      JSON.stringify(opened) + ' msg=' + openedMsg);
    await evaluate('true');
    // openPlaytest 是 async,点按钮走真实路径
    const playBtn = await evaluate('(function(){var b=document.getElementById("btn-play");var q=b.getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height/2};})()');
    await mouse(playBtn.x, playBtn.y, 'left', 1);
    check('进入独立试玩', await waitFor('location.pathname.indexOf("trial.html")>=0 && !!RA.trial && !!RA.trial.session', 15000));
    await sleep(500);
    const trialState = await evaluate(`(function(){var s=RA.trial.session,i=s.inst;var g=i.objects.filter(function(o){return o.type==='gear';})[0],m=i.objects.filter(function(o){return o.type==='fireball_moving';})[0],f=i.objects.filter(function(o){return o.type==='flail';})[0];return {floor:!!i,types:i.objects.map(function(o){return o.type;}),gx:g.rx,mx:m.rx,fx:f.rx,fy:f.ry,alive:f.alive,playerHp:s.run.hp,status:s.status};})()`);
    check('试玩层包含齿轮/移动火球/流星锤/地刺', trialState && trialState.types.join(',') === 'gear,fireball_moving,flail,spike', JSON.stringify(trialState.types));
    check('试玩中流星锤在初始轨道上', trialState && Math.abs(Math.hypot(trialState.fx - (10 * 45 + 22.5), trialState.fy - (15 * 45 + 22.5)) - 180) < 0.5);
    await shot('27-trial-gear-track-moving-no-path-flail-chain.png');
    const trialMove = await evaluate(`(function(){var s=RA.trial.session,i=s.inst;var g=i.objects.filter(function(o){return o.type==='gear';})[0],m=i.objects.filter(function(o){return o.type==='fireball_moving';})[0],fl=i.objects.filter(function(o){return o.type==='flail';})[0];var gx=g.rx,mx=m.rx,i0=fl._angle;i.moveObjects(1);return {gear:g.rx-gx,moving:m.rx-mx,angle:fl._angle-i0,gearTrack:!!RA.drawObjectTrack};})()`);
    check('试玩真实1秒:齿轮340/火球170', trialMove && Math.abs(trialMove.gear - 340) < 0.01 && Math.abs(trialMove.moving - 170) < 0.01, JSON.stringify(trialMove));
    check('试玩流星锤1秒角位移1.25926', trialMove && Math.abs(trialMove.angle - 34 / 27) < 1e-6);

    // 正式塔:内存 fixture 给 test3 补位加同样的怪物,不写盘
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/') });
    check('正式入口加载', await waitFor('!!RA.short && !!RA.short.state', 15000));
    await evaluate(`(function(){var fb=RA.FULL40.fallback;
      fb.objects=[
        {id:'gf',type:'gear',col:4,row:18,params:{speedTilesPerSecond:2,radiusTiles:0.5,damage:20},pathId:'pf'},
        {id:'mf',type:'fireball_moving',col:4,row:18,params:{radiusTiles:0.5,damage:20},pathId:'pf'},
        {id:'ff',type:'flail',col:10,row:15,params:{radiusTiles:0.5,damage:20},pathId:null},
        {id:'sf',type:'spike',col:14,row:19,params:{warningSeconds:0.5,activeSeconds:0.8,cooldownSeconds:1,damage:20},pathId:null}
      ];
      fb.paths=[{id:'pf',mode:'pingpong',points:[{col:4,row:18},{col:17,row:18}]}];
      fb.contentHash=null; fb.certification=null;
      return true;})()`);
    const formalBtn = await evaluate('(function(){var b=document.querySelector("#btn-formal");var q=b.getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height/2};})()');
    await mouse(formalBtn.x, formalBtn.y, 'left', 1);
    if (!(await waitFor('!!RA.short.state.session', 3000))) {
      // headless 里按钮的 mouse 事件偶发不触发布局 click;用同一按钮的 click() 兜底(仍是页面真实按钮)
      await evaluate('document.querySelector("#btn-formal").click(); true');
    }
    check('正式完整塔启动', await waitFor('!!RA.short.state.session', 12000));
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyF', key: 'f', windowsVirtualKeyCode: 70 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyF', key: 'f', windowsVirtualKeyCode: 70 });
    await waitFor('RA.short.state.session.world.current===1', 3000);
    await sleep(500);
    const formalState = await evaluate(`(function(){var s=RA.short.state.session,i=s.world.currentFloor;return {floor:s.world.current,types:i.objects.map(function(o){return o.type;}),hud:document.getElementById("floor-text").textContent};})()`);
    check('正式塔第1层含新怪物且HUD同步', formalState && formalState.floor === 1 &&
      formalState.types.join(',') === 'gear,fireball_moving,flail,spike' && formalState.hud.indexOf('1/40') >= 0,
      JSON.stringify(formalState));
    await shot('27-formal-monsters-floor1.png');
  } finally {
    try { browser.ws.close(); } catch (e) { /* ignore */ }
    killTree(browser.child);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  const evidence = {
    title: '27号卡可见浏览器证据', date: '2026-11-09',
    note: '编辑器用真实鼠标画移动火球路径和流星锤端点;试玩用自定义图;正式塔为内存 fixture 给 test3 补位加新怪物,不写草稿/池/作者 passed,不是真人通关。',
    browser: browser.version.Browser, pass, fail, results
  };
  writeFileSync(join(OUT, 'browser-27-monsters-2026-11-09.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('\n27号卡浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL');
  return fail ? 1 : 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('检查异常:' + (e && e.stack || e)); process.exit(1); });
