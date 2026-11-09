#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_editor24.mjs —— 24号卡:真实 Chrome 检查编辑器精简/主题/齿轮事务/试玩返回/旧入口
 * ===================================================================================
 *     node tools/browser_editor24.mjs
 *
 * 真实浏览器页面 + 真实鼠标/键盘事件,覆盖:
 *   旧“对象/参数/路径”面板消失、齿轮专属画布工具(往返/闭合)、主题一次切换+刷新保留、
 *   齿轮 Esc 取消零残留且保留之前撤销、JSON 导出再打开保真、试玩通过后返回原草稿并显式发布、
 *   旧 standard/devplay 页只留说明不启动旧控制器。
 * 测试图只写进本次临时浏览器 IndexedDB(user-data-dir 为临时目录),不写 levels/、不给用户图造 passed。
 * 这是脚本化屏幕检查,不是人工试玩记录。
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

/** 干净的测试图:地面 + 两组云板;没有对象/路径,方便齿轮从零开始。 */
function makeMap(id, finishRow) {
  const cols = 20, rows = 16;
  const tiles = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) tiles[rows - 1][c] = 1;
  [10, finishRow].forEach((row) => { tiles[row][4] = 5; tiles[row][5] = 5; });
  return {
    schemaVersion: 2, id: id, title: id, kind: 'normal', difficulty: 1,
    size: { cols, rows }, terrain: { tiles }, spawn: null,
    ports: { profile: 'cloud-pipe-v2', start: { col: 4, row: 10 }, finish: { col: 4, row: finishRow } },
    objects: [], paths: [],
    visuals: { backgroundId: 'sky1', decorations: [] },
    extensions: { note: '24号卡真实浏览器屏幕检查用图;只写进临时浏览器存储' },
    contentHash: null, certification: null
  };
}
const PLAIN = makeMap('editor24_gear_check', 0);     // 齿轮/JSON 用
const PASS_MAP = makeMap('editor24_return_check', 5); // 试玩返回用(finish 二段跳够得着)

async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean).filter((p) => existsSync(p));
  if (!exes.length) { console.error('找不到 Chrome/Edge'); return 2; }
  let browser = null, last = null;
  for (const exe of exes) {
    const profile = mkdtempSync(join(tmpdir(), 'ra-editor24-chrome-'));
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
      browser = { ws, child, profile, version, exe };
      break;
    } catch (e) {
      last = e; killTree(child);
      try { rmSync(profile, { recursive: true, force: true }); } catch (e2) { /* ignore */ }
    }
  }
  if (!browser) { console.error('浏览器启动失败:' + (last && last.message)); return 1; }
  const send = browser.ws.send;
  const editorUrl = 'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/');
  const trialUrl = 'file:///' + join(ROOT, 'trial.html').replace(/\\/g, '/');
  const standardUrl = 'file:///' + join(ROOT, 'standard.html').replace(/\\/g, '/');
  const devplayUrl = 'file:///' + join(ROOT, 'devplay.html').replace(/\\/g, '/');
  try {
    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面异常:' + (r.exceptionDetails.text || ''));
      return r.result ? r.result.value : undefined;
    }
    async function waitFor(expr, ms) {
      const end = Date.now() + (ms || 10000);
      while (Date.now() < end) { try { if (await evaluate(expr)) return true; } catch (e) { /* 页面还在切 */ } await sleep(80); }
      return false;
    }
    async function key(type, code, keyName, vk) {
      await send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    }
    async function tap(code, keyName, vk) {
      await key('rawKeyDown', code, keyName, vk);
      await sleep(110);
      await key('keyUp', code, keyName, vk);
      await sleep(90);
    }
    async function combo(mods, code, keyName, vk) {
      for (const m of mods) { await key('rawKeyDown', m.code, m.name, m.vk); await sleep(70); }
      await key('rawKeyDown', code, keyName, vk);
      await sleep(120);
      await key('keyUp', code, keyName, vk);
      await sleep(60);
      for (const m of mods) { await key('keyUp', m.code, m.name, m.vk); await sleep(60); }
      await sleep(180);
    }
    const CTRL = { code: 'ControlLeft', name: 'Control', vk: 17 };
    const SHIFT = { code: 'ShiftLeft', name: 'Shift', vk: 16 };
    const undoKey = () => combo([CTRL], 'KeyZ', 'z', 90);
    const redoKey = () => combo([CTRL, SHIFT], 'KeyZ', 'z', 90);
    async function shot(name) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
    }
    async function rect(selector) {
      return await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)return null;var r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,id:e.id||""};})()');
    }
    async function click(selector) {
      await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');if(e&&e.scrollIntoView)e.scrollIntoView({block:"center",inline:"nearest"});})()');
      await sleep(60);
      const r = await rect(selector); if (!r) return false;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');var h=document.elementFromPoint(' + x + ',' + y + ');return !!(e&&h&&(e===h||e.contains(h)));})()');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(160);
      return hit;
    }
    async function paletteClick(name) {
      const r = await evaluate('(function(){var bs=document.querySelectorAll(".pitem");for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf(' + JSON.stringify(name) + ')>=0){bs[i].scrollIntoView({block:"center"});var q=bs[i].getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height/2,text:bs[i].textContent};}}return null;})()');
      await sleep(60);
      if (!r) return false;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(120);
      return true;
    }
    async function toolClick(name) {
      const r = await evaluate('(function(){var bs=document.querySelectorAll(".titem");for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf(' + JSON.stringify(name) + ')>=0){var q=bs[i].getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height/2};}}return null;})()');
      if (!r) return false;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(120);
      return true;
    }
    async function cellPoint(c, r) {
      return await evaluate('(function(){var q=RA.editor.cellToScreen(' + c + ',' + r + ');var b=document.getElementById("board").getBoundingClientRect();' +
        'return {x:b.left+q.x+RA.editor.view.zoom*RA.C.TS/2,y:b.top+q.y+RA.editor.view.zoom*RA.C.TS/2};})()');
    }
    async function cellClick(c, r, button) {
      const p = await cellPoint(c, r);
      const btn = button || 'left';
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: btn, clickCount: 1 });
      await sleep(90);   // 按住至少一帧,编辑器的按下采样才看得到
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: btn, clickCount: 1 });
      await sleep(140);
      return p;
    }
    async function state() {
      return await evaluate('(function(){var e=RA.editor,m=e.model;return {theme:e.theme,dom:document.body.dataset.theme,' +
        'hash:RA.LevelData.hashSync(m.toData()),dirty:e.dirty,objs:m.data.objects.length,paths:m.data.paths.length,' +
        'undo:e.undoStack.length,redo:e.redoStack.length,gesture:!!e.gearGesture,msg:e.msg};})()');
    }
    async function openMap(map) {
      const ok = await evaluate('RA.editor.openJSONText(' + JSON.stringify(JSON.stringify(map)) + ', ' + JSON.stringify(map.id + '.json') + ')');
      await sleep(200);
      return ok;
    }

    check('Chrome 已启动', true, browser.version.Browser + ' headless');
    check('编辑器加载', await waitFor('!!RA.editor && !!RA.editor.model', 15000));

    // ---------------- 旧面板移除 ----------------
    check('旧“对象/参数/路径”面板不在页面里',
      await evaluate('document.getElementById("obj-list") === null && document.getElementById("obj-type") === null && ' +
        'document.getElementById("obj-params") === null && document.getElementById("path-list") === null && ' +
        'document.getElementById("path-points") === null && document.getElementById("btn-obj-apply") === null && ' +
        'document.getElementById("btn-path-new") === null'));
    check('齿轮专属控件在画布工具旁(默认隐藏)',
      await evaluate('!!document.getElementById("gear-mode") && document.getElementById("gear-mode-row").style.display === "none"'));

    // ---------------- 主题:一次切换 + 刷新保留 ----------------
    await evaluate('localStorage.setItem("ra_editor_preferences_v1", JSON.stringify({schemaVersion:1,theme:"dark",autoGrow:true,customFlag:"keep-me"}))');
    await send('Page.reload');
    await waitFor('!!RA.editor && !!RA.editor.model', 15000);
    check('刷新后恢复深色偏好', (await state()).theme === 'dark' && (await state()).dom === 'dark');
    await openMap(PLAIN);
    const themeBefore = await state();
    check('点一次主题按钮只切一次', (await click('#btn-theme')) === true);
    const themeAfter = await state();
    const prefs = await evaluate('JSON.parse(localStorage.getItem("ra_editor_preferences_v1"))');
    check('一次点击 light↔dark 只变一次', themeAfter.theme !== themeBefore.theme && themeAfter.dom === themeAfter.theme,
      themeBefore.theme + ' -> ' + themeAfter.theme);
    check('主题不改地图/hash/dirty', themeAfter.hash === themeBefore.hash && themeAfter.dirty === themeBefore.dirty);
    check('偏好保存保留 autoGrow/其他字段且写入新主题',
      prefs && prefs.theme === themeAfter.theme && prefs.autoGrow === true && prefs.customFlag === 'keep-me',
      JSON.stringify(prefs));
    await shot('editor24-theme-light.png');
    await send('Page.reload');
    await waitFor('!!RA.editor && !!RA.editor.model', 15000);
    check('刷新保留刚切换的主题', (await state()).theme === themeAfter.theme);
    await click('#btn-theme');
    const themeBack = await state();
    check('再点一次恢复原来的主题', themeBack.theme === themeBefore.theme);
    await shot('editor24-theme-dark.png');

    // ---------------- 齿轮画布工具:往返/闭合、完成、撤销、取消 ----------------
    check('打开干净测试图', await openMap(PLAIN) === true);
    check('选齿轮后出现往返/闭合选项', (await paletteClick('路径齿轮')) === true &&
      await evaluate('document.getElementById("gear-mode-row").style.display !== "none"'));
    await evaluate('document.getElementById("gear-mode").value = "loop"');
    const g0 = await state();
    await cellClick(6, 10);
    let g1 = await state();
    check('画布左键放下齿轮并开始画路径', g1.gesture === true && g1.objs === g0.objs + 1 && g1.paths === g0.paths + 1);
    await cellClick(12, 10);
    await cellClick(12, 6);
    g1 = await state();
    const pathInfo = await evaluate('(function(){var p=RA.editor.model.data.paths[0];return {mode:p.mode,points:p.points.length};})()');
    check('连续左键按直角加节点', g1.gesture === true && pathInfo.points >= 3, JSON.stringify(pathInfo));
    await cellClick(12, 6, 'right');   // 右键完成
    await sleep(120);
    const g2 = await state();
    const donePath = await evaluate('(function(){var p=RA.editor.model.data.paths[0];return {mode:p.mode,points:p.points.length,first:p.points[0],last:p.points[p.points.length-1]};})()');
    check('右键完成后只留一条撤销', g2.gesture === false && g2.undo === g0.undo + 1,
      'undo ' + g0.undo + ' -> ' + g2.undo);
    check('闭合模式真的闭合(loop 隐式首尾相连,至少4角)', donePath.mode === 'loop' && donePath.points >= 4 &&
      !(donePath.first.col === donePath.last.col && donePath.first.row === donePath.last.row) &&
      await evaluate('(function(){var p=RA.editor.model.data.paths.filter(function(x){return x.mode==="loop";})[0];' +
        'return !!p && RA.PathGeometry.validate(p).length===0;})()'),
      JSON.stringify(donePath));
    await shot('editor24-gear-finished.png');
    await undoKey();
    const u1 = await state();
    check('撤销整组齿轮', u1.objs === g0.objs && u1.paths === g0.paths, JSON.stringify({ objs: u1.objs, paths: u1.paths }));
    await redoKey();
    const r1 = await state();
    check('重做整组齿轮', r1.objs === g2.objs && r1.paths === g2.paths);

    // 橡皮仍能删画布元素
    check('切到橡皮工具', await toolClick('橡皮'));
    await cellClick(6, 10);
    const er1 = await state();
    check('橡皮能删掉画布上的齿轮', er1.objs === r1.objs - 1);
    await undoKey();
    check('撤销恢复被擦掉的齿轮', (await state()).objs === r1.objs);

    // 取消事务:先做一次普通编辑,再放齿轮按 Esc
    check('切回画笔', await toolClick('画笔'));
    await paletteClick('^');
    await cellClick(2, 14);
    const c0 = await state();
    check('准备:先有一次可撤销的普通编辑', c0.dirty === true && c0.undo >= 1);
    await paletteClick('路径齿轮');
    await evaluate('document.getElementById("gear-mode").value = "pingpong"');
    await cellClick(3, 12);
    await cellClick(9, 12);
    const during = await state();
    check('取消前齿轮和路径已经出现', during.gesture === true && during.objs === c0.objs + 1);
    await tap('Escape', 'Escape', 27);
    await sleep(200);
    const c1 = await state();
    check('Esc 取消:齿轮/路径零残留', c1.gesture === false && c1.objs === c0.objs && c1.paths === c0.paths,
      JSON.stringify({ objs: c1.objs, paths: c1.paths }));
    check('Esc 取消:内容 hash 与 dirty 回到开始前', c1.hash === c0.hash && c1.dirty === c0.dirty);
    check('Esc 取消:没有弹掉之前的撤销', c1.undo === c0.undo && c1.redo === c0.redo, 'undo ' + c0.undo + ' -> ' + c1.undo);
    await shot('editor24-gear-cancel.png');
    // 之前的普通编辑仍可撤销
    await undoKey();
    const c2 = await state();
    check('取消后还能撤销之前那一步编辑', c2.hash !== c0.hash && c2.objs === c0.objs);

    // ---------------- JSON 保真 ----------------
    const json = await evaluate('(function(){var r=RA.LevelData.encode(RA.editor.model.toData());return r.ok?r.value:null;})()');
    check('导出 JSON 成功', typeof json === 'string' && json.length > 50);
    const round = await evaluate('(function(){var before=RA.editor.model.toData();var r=RA.LevelData.encode(before);' +
      'var e2=RA.LevelData.decode(r.value);if(!e2.ok)return {ok:false,err:e2.error&&e2.error.code};' +
      'var a=RA.LevelData.canonical(RA.LevelData.contentOf(before)), b=RA.LevelData.canonical(RA.LevelData.contentOf(e2.value));' +
      'return {ok:a===b,hashOk:e2.value.contentHash===RA.LevelData.hashSync(before),' +
      'objs:e2.value.objects.length,paths:e2.value.paths.length,' +
      'custom:!!(e2.value.extensions&&e2.value.extensions.note)};})()');
    check('JSON 解码回来内容一致(对象/路径/自定义参数/hash)', round.ok && round.hashOk && round.custom,
      JSON.stringify(round));
    const reopen = await evaluate('RA.editor.openJSONText(' + JSON.stringify(json) + ', "reopen.json")');
    await sleep(200);
    check('用导出的 JSON 重新打开仍保真',
      reopen === true && await evaluate('(function(){var m=RA.editor.model;return m.data.paths.length>0 && m.data.objects.length>0;})()'));

    // ---------------- 试玩通过 → 返回原草稿 → 显式发布 ----------------
    check('打开可通终点图', await openMap(PASS_MAP) === true);
    check('点「试玩」进入试玩页', (await click('#btn-play')) === true &&
      await waitFor('location.pathname.indexOf("trial.html") >= 0 && !!RA.trial && !!RA.trial.session', 15000));
    const retPlan = await evaluate('({draftId:RA.trial.plan.draftRef.draftId, revision:RA.trial.plan.draftRef.revision})');
    await waitFor('RA.trial.session.time > 0', 3000);
    await key('rawKeyDown', 'Space', ' ', 32);
    await sleep(240);
    await key('keyUp', 'Space', ' ', 32);
    await sleep(90);
    await key('rawKeyDown', 'Space', ' ', 32);
    const passed = await waitFor('RA.trial.session.status === "passed"', 6000);
    await key('keyUp', 'Space', ' ', 32);
    check('真实按键上穿 finish', passed, 'status=' + (await evaluate('RA.trial.session.status')));
    check('通过记录已保存', await waitFor('RA.trial.saveState && RA.trial.saveState.phase === "saved"', 5000),
      await evaluate('RA.trial.saveState && (RA.trial.saveState.phase + " " + RA.trial.saveState.reason)'));
    const backHref = await evaluate('document.getElementById("btn-done-editor").getAttribute("href")');
    check('返回链接带原草稿身份', String(backHref).indexOf('from=trial') >= 0 &&
      String(backHref).indexOf(encodeURIComponent(retPlan.draftId)) >= 0, backHref);
    await shot('editor24-trial-pass.png');
    check('点「返回编辑器」真的回到编辑器', (await click('#btn-done-editor')) === true &&
      await waitFor('location.pathname.indexOf("editor.html") >= 0 && !!RA.editor', 15000));
    const returned = await waitFor('RA.editor.draftId === ' + JSON.stringify(retPlan.draftId), 8000);
    const backState = await evaluate('(function(){var e=RA.editor;return {draftId:e.draftId,rev:e.draftRevision,' +
      'cert:e.model.data.certification?e.model.data.certification.profileId:null,mapId:e.model.data.id};})()');
    check('返回后自动打开原草稿的最新版本', returned && backState.rev === retPlan.revision + 1 &&
      backState.mapId === PASS_MAP.id, JSON.stringify(backState));
    check('返回后能看到通过记录', backState.cert === 'run-v1');
    await shot('editor24-trial-return.png');
    check('返回后可直接显式发布', (await click('#btn-publish')) === true);
    const poolOk = await waitFor('(async function(){var r=await RA.editor.repo.listEligible({difficulty:1});' +
      'return r.ok && r.value.some(function(v){return v.levelId === ' + JSON.stringify(PASS_MAP.id) + ';});})()', 5000);
    const pool = await evaluate('(async function(){var r=await RA.editor.repo.listEligible({difficulty:1});' +
      'return r.ok?r.value.map(function(v){return v.levelId;}):null;})()');
    check('发布后正式池出现该图', poolOk && Array.isArray(pool) && pool.indexOf(PASS_MAP.id) >= 0, JSON.stringify(pool));

    // ---------------- 旧入口停用 ----------------
    await send('Page.navigate', { url: standardUrl });
    await sleep(600);
    const stdPage = await evaluate('(function(){return {std:(typeof RA==="undefined")?"undefined":typeof RA.standard,text:document.body.textContent,link:!!document.querySelector(\'a[href="editor.html"]\')};})()');
    check('旧标准页只留说明+回编辑器,不启动旧控制器',
      stdPage.std === 'undefined' && stdPage.text.indexOf('停用') >= 0 && stdPage.link === true,
      JSON.stringify(stdPage));
    await shot('editor24-old-standard.png');
    await send('Page.navigate', { url: devplayUrl });
    await sleep(600);
    const devPage = await evaluate('(function(){return {dev:(typeof RA==="undefined")?"undefined":typeof RA.devplay,text:document.body.textContent,link:!!document.querySelector(\'a[href="editor.html"]\')};})()');
    check('旧开发页只留说明+回编辑器,不启动旧控制器',
      devPage.dev === 'undefined' && devPage.text.indexOf('停用') >= 0 && devPage.link === true,
      JSON.stringify(devPage));
    await shot('editor24-old-devplay.png');

    const evidence = {
      date: new Date().toISOString(), card: '24号卡', browser: browser.version.Browser,
      executable: browser.exe, durationMs: Date.now() - t0, pass, fail, results,
      screenshots: ['docs/checks/editor24-theme-light.png', 'docs/checks/editor24-theme-dark.png',
        'docs/checks/editor24-gear-finished.png', 'docs/checks/editor24-gear-cancel.png',
        'docs/checks/editor24-trial-pass.png', 'docs/checks/editor24-trial-return.png',
        'docs/checks/editor24-old-standard.png', 'docs/checks/editor24-old-devplay.png'],
      note: '真实 Chrome + 真实鼠标/键盘事件的脚本化屏幕检查,不是人工验收记录;测试图只写进本次临时浏览器 IndexedDB,没有写 levels/,也没有给用户图伪造通过记录。'
    };
    writeFileSync(join(OUT, 'browser-editor24-2026-11-08.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    browser.ws.close(); killTree(browser.child); await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  console.log('\n24号卡浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('24号卡浏览器检查失败:' + (e && e.message)); process.exit(1); });
