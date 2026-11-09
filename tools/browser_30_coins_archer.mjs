#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_30_coins_archer.mjs —— 30号卡可见证据
 * ===============================================
 *   node tools/browser_30_coins_archer.mjs
 *
 * 真实 Chrome + 真实鼠标/键盘:
 *   ① 编辑器用「金币 / 弓箭手」调色板直接点击放置(无参数/坐标表单),保存草稿;
 *   ② 试玩:金币被身体拾取消失、弓箭手 2 秒后射箭扣血、K 只消灭本体、**没有分数 HUD**;
 *   ③ 未通关从顶部返回,编辑器打开同一草稿(revision/hash/对象不变,原稿不退化);
 *   ④ index 正式塔(内存 fixture 给 test3 补位):F 进 1 层 HUD「得分 20」→ 捡币 30 → 击杀 35,
 *      死亡结果页显示本次得分,设置只读历史最高分写入并可刷新保持,重试同塔回到 0 分。
 *
 * 只在本页内存里改 RA.FULL40.fallback,不写作者草稿/发布池/通过记录,不冒充真人通关。
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
    const profile = mkdtempSync(join(tmpdir(), 'ra-30-chrome-')), port = await freePort();
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
    async function waitFor(expr, ms) { const end = Date.now() + (ms || 10000); while (Date.now() < end) { try { if (await evaluate(expr)) return true; } catch (e) { /* 页面切换中 */ } await sleep(60); } return false; }
    async function shot(n) { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); }
    async function mouse(x, y, button) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: button || 'left', clickCount: 1 });
      await sleep(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: button || 'left', clickCount: 1 });
      await sleep(80);
    }
    async function rect(sel) { return await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()'); }
    async function key(code, keyName, vk) {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: keyName, windowsVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName, windowsVirtualKeyCode: vk });
      await sleep(120);
    }
    async function cellPoint(c, r) {
      return await evaluate('(function(){var ed=RA.editor,cv=document.getElementById("board");var q=ed.cellToScreen(' + (c + 0.5) + ',' + (r + 0.5) + ');var b=cv.getBoundingClientRect();return {x:b.left+q.x*b.width/(cv.width||1),y:b.top+q.y*b.height/(cv.height||1)};})()');
    }
    async function clickCell(c, r, button) { const p = await cellPoint(c, r); await mouse(p.x, p.y, button); }
    async function selectPalette(name) {
      const p = await evaluate('(function(){var bs=document.querySelectorAll(".pitem");for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()===' + JSON.stringify(name) + '){bs[i].scrollIntoView({block:"center"});var r=bs[i].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}}return null;})()');
      if (!p) return false;
      await mouse(p.x, p.y, 'left');
      await sleep(120);
      return true;
    }
    async function loadLevel(jsonText) {
      await evaluate('RA.editor.openJSONText(' + JSON.stringify(jsonText) + ',"30 coins archer probe");true');
      await sleep(250);
    }

    check('Chrome 已启动', true, browser.version.Browser + ' headless');
    check('编辑器进入', await waitFor('!!RA.editor && !!RA.editor.model', 15000));

    // ---------- ① 编辑器:真实鼠标从调色板直接放金币/弓箭手 ----------
    const fixture = await evaluate(`(function(){
      var d=JSON.parse(JSON.stringify(RA.FULL40.fallback));
      d.id='coins_archer_30';d.title='30 金币与弓箭手';d.difficulty=1;d.contentHash=null;d.certification=null;
      d.objects=[];d.paths=[];
      return JSON.stringify(d,null,2);})()`);
    await loadLevel(fixture);
    check('载入 21×24 普通图', await evaluate('RA.editor.model.cols===21 && RA.editor.model.rows===24'));
    check('选中金币工具', await selectPalette('金币'));
    await clickCell(3, 19);
    await clickCell(6, 19);
    const coinState = await evaluate('(function(){var o=RA.editor.model.data.objects.filter(function(x){return x.type==="coin";});return {n:o.length,params:o.map(function(x){return JSON.stringify(x.params);}),pathIds:o.map(function(x){return x.pathId;}),tiles:[RA.editor.model.getTile(3,19),RA.editor.model.getTile(6,19)]};})()');
    check('金币直接点击放置 2 枚,params={} / pathId=null',
      coinState.n === 2 && coinState.params.every((p) => p === '{}') && coinState.pathIds.every((p) => p === null),
      JSON.stringify(coinState));
    check('选中弓箭手工具', await selectPalette('弓箭手'));
    await clickCell(12, 18);
    const archerState = await evaluate('(function(){var o=RA.editor.model.data.objects.filter(function(x){return x.type==="archer";});return {n:o.length,params:o.map(function(x){return JSON.stringify(x.params);}),pathIds:o.map(function(x){return x.pathId;})};})()');
    check('弓箭手直接点击放置 1 个,params={} / pathId=null',
      archerState.n === 1 && archerState.params[0] === '{}' && archerState.pathIds[0] === null,
      JSON.stringify(archerState));
    check('没有出现手填坐标/参数面板', await evaluate('!document.getElementById("obj-col") && !document.getElementById("obj-params")'));
    await shot('30-editor-coins-archer.png');

    // ---------- ② 试玩:捡币/被射/光环杀本体/无分数 ----------
    await evaluate('RA.editor.saveDraft({silent:true})');
    await sleep(300);
    const draftRef = await evaluate('({draftId:RA.editor.draftId,revision:RA.editor.draftRevision,hash:RA.LevelData.hashSync(RA.editor.model.toData())})');
    await mouse((await rect('#btn-play')).x, (await rect('#btn-play')).y, 'left');
    const trialOpen = await waitFor('location.pathname.indexOf("trial.html")>=0 && !!RA.trial && !!RA.trial.session', 15000);
    check('从编辑器进入单图试玩', trialOpen);
    await sleep(400);
    // 试玩发起时编辑器会再保存一次(新 revision);返回应打开这份最新版本
    const trialRef = await evaluate('({draftId:RA.trial.plan.draftRef.draftId,revision:RA.trial.plan.draftRef.revision})');
    check('试玩页没有分数 HUD / 最高分元素',
      await evaluate('!document.getElementById("score-text") && document.querySelectorAll("[id*=score]").length===0'));
    check('试玩会话快照没有分数', await evaluate('RA.trial.session.snapshot().score===undefined'));
    const trialTypes = await evaluate('RA.trial.session.inst.objects.map(function(o){return o.type;})');
    check('试玩层里同时有金币与弓箭手',
      trialTypes.indexOf('coin') >= 0 && trialTypes.indexOf('archer') >= 0, trialTypes.join(','));

    // 角色走到第一枚金币上(脚本化置位,真实帧循环负责拾取)
    await evaluate(`(function(){var s=RA.trial.session,i=s.inst,o=i.objects.filter(function(x){return x.type==="coin";})[0];
      var p=s.player;p.x=o.rx-p.w/2;p.y=o.ry-p.h/2;return true;})()`);
    await sleep(400);
    const coinPicked = await evaluate('(function(){var o=RA.trial.session.inst.objects.filter(function(x){return x.type==="coin";});return {collected:o.map(function(x){return !!x.collected;}),text:document.getElementById("trial-info").textContent};})()');
    check('试玩:金币被身体接触后消失', coinPicked.collected[0] === true, JSON.stringify(coinPicked));
    // 站到弓箭手旁边等 2 秒:箭命中扣血
    await evaluate(`(function(){var s=RA.trial.session,i=s.inst,a=i.objects.filter(function(x){return x.type==="archer";})[0];
      var p=s.player;p.x=a.rx+3*45-p.w/2;p.y=a.ry-p.h/2;return true;})()`);
    const hurt = await waitFor('RA.trial.session.run.hp < 100', 6000);
    check('试玩:弓箭手入层约 2 秒后射箭并扣血', hurt, await evaluate('RA.trial.session.run.hp'));
    await shot('30-trial-coins-archer.png');
    const beforeK = await evaluate('RA.trial.session.inst.objects.filter(function(x){return x.type==="archer";})[0].alive');
    // 靠近本体按 K:光环只消灭本体
    await evaluate(`(function(){var s=RA.trial.session,i=s.inst,a=i.objects.filter(function(x){return x.type==="archer";})[0];
      var p=s.player;p.x=a.rx-p.w/2;p.y=a.ry-p.h/2;s.run.haloCooldownRemaining=0;return true;})()`);
    await key('KeyK', 'k', 75);
    await sleep(400);
    const afterK = await evaluate('({alive:RA.trial.session.inst.objects.filter(function(x){return x.type==="archer";})[0].alive,arrows:RA.trial.session.inst.arrows.length,score:RA.trial.session.snapshot().score})');
    check('试玩:K 光环只消灭弓箭手本体(箭/分数都不受影响)',
      beforeK === true && afterK.alive === false && afterK.score === undefined, JSON.stringify(afterK));
    await shot('30-trial-archer-killed.png');

    // ---------- ③ 未通关返回原稿 ----------
    await mouse((await rect('#btn-top-editor')).x, (await rect('#btn-top-editor')).y, 'left');
    check('未通关点顶部返回编辑器', await waitFor('location.pathname.indexOf("editor.html")>=0 && !!RA.editor', 15000));
    await sleep(500);
    const restored = await evaluate('(function(){var d=RA.editor.model.data;return {draftId:RA.editor.draftId,revision:RA.editor.draftRevision,hash:RA.LevelData.hashSync(d),coins:d.objects.filter(function(o){return o.type==="coin";}).length,archers:d.objects.filter(function(o){return o.type==="archer";}).length,cert:!!d.certification};})()');
    check('返回打开原草稿:同 ID/最新 revision/内容 hash,金币弓箭手都在,且没有假通过',
      restored.draftId === trialRef.draftId && restored.revision === trialRef.revision &&
      restored.hash === draftRef.hash && restored.coins === 2 && restored.archers === 1 && restored.cert === false,
      JSON.stringify(restored) + ' trial=' + JSON.stringify(trialRef) + ' saved=' + JSON.stringify(draftRef));

    // ---------- ④ 正式塔:得分/结果/最高分/重试 ----------
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'index.html').replace(/\\/g, '/') });
    check('index 正式入口加载', await waitFor('!!RA.short && !!RA.short.state', 15000));
    await evaluate(`(function(){var fb=RA.FULL40.fallback;
      fb.objects=[{id:'coin_f1',type:'coin',col:9,row:19,params:{},pathId:null},
                  {id:'coin_f2',type:'coin',col:10,row:19,params:{},pathId:null},
                  {id:'archer_f1',type:'archer',col:16,row:18,params:{},pathId:null}];
      fb.paths=[];fb.contentHash=null;fb.certification=null;return true;})()`);
    await mouse((await rect('#btn-formal')).x, (await rect('#btn-formal')).y, 'left');
    if (!(await waitFor('!!RA.short.state.session', 3000))) await evaluate('document.querySelector("#btn-formal").click();true');
    check('正式完整塔启动', await waitFor('!!RA.short.state.session', 12000));
    check('启动后 HUD 得分 0 且存在右上角', await waitFor('document.getElementById("score-text") && document.getElementById("score-text").textContent.indexOf("得分 0")>=0', 4000),
      await evaluate('document.getElementById("score-text") && document.getElementById("score-text").textContent'));
    await key('KeyF', 'f', 70);
    check('真实 F 进入第 1 层', await waitFor('RA.short.state.session.world.current===1', 4000));
    await sleep(400);
    const hud20 = await evaluate('document.getElementById("score-text").textContent');
    check('首次进入第 1 层 HUD 得分 20', hud20.indexOf('得分 20') >= 0, hud20);
    await shot('30-formal-floor1-score20.png');
    // 捡一枚金币:+10
    await evaluate(`(function(){var s=RA.short.state.session,i=s.world.currentFloor,o=i.objects.filter(function(x){return x.type==="coin";})[0];
      var p=s.player;p.x=i.origin.x+o.rx-p.w/2;p.y=i.origin.y+o.ry-p.h/2;return true;})()`);
    await sleep(400);
    check('拾取金币后 HUD 得分 30', await waitFor('document.getElementById("score-text").textContent.indexOf("得分 30")>=0', 3000),
      await evaluate('document.getElementById("score-text").textContent'));
    // 光环击败弓箭手:+5
    await evaluate(`(function(){var s=RA.short.state.session,i=s.world.currentFloor,a=i.objects.filter(function(x){return x.type==="archer";})[0];
      var p=s.player;p.x=i.origin.x+a.rx-p.w/2;p.y=i.origin.y+a.ry-p.h/2;s.run.haloCooldownRemaining=0;return true;})()`);
    await key('KeyK', 'k', 75);
    await sleep(500);
    check('击败弓箭手后 HUD 得分 35', await waitFor('document.getElementById("score-text").textContent.indexOf("得分 35")>=0', 3000),
      await evaluate('document.getElementById("score-text").textContent'));
    check('正式击杀弓箭手本体', await evaluate('RA.short.state.session.world.currentFloor.objects.filter(function(o){return o.type==="archer";})[0].alive===false'));
    await shot('30-formal-score35.png');
    // 死亡:结果页显示本次得分
    await evaluate('(function(){var s=RA.short.state.session;s.run.invulnerableRemaining=0;s._damagedThisStep=false;s.damage(999,"browser-probe");return true;})()');
    await sleep(500);
    const result = await evaluate('({shown:document.getElementById("result-overlay").style.display,score:document.getElementById("result-score").textContent,title:document.getElementById("result-title").textContent,stored:localStorage.getItem("ra_high_score_v1")})');
    check('死亡结果页显示本次得分 35', result.shown === 'flex' && /本次得分 35/.test(result.score), JSON.stringify(result));
    check('历史最高分只存一个 max', (function () {
      try { const p = JSON.parse(result.stored || 'null'); return !!p && p.version === 1 && p.bestScore === 35 && Object.keys(p).length === 2; } catch (e) { return false; }
    })(), result.stored);
    await shot('30-formal-result-score.png');
    // 设置里只读历史最高分
    await mouse((await rect('#btn-menu')).x, (await rect('#btn-menu')).y, 'left');
    await waitFor('!RA.short.state.session', 3000);
    await mouse((await rect('#btn-main-settings')).x, (await rect('#btn-main-settings')).y, 'left');
    await waitFor('document.getElementById("main-settings").style.display==="flex"', 4000);
    const hs = await evaluate('({value:document.getElementById("high-score-value").textContent,status:document.getElementById("high-score-status").textContent})');
    check('设置里显示只读历史最高分 35', hs.value === '35', JSON.stringify(hs));
    check('设置说明只保存一个最高值、无逐局记录', /只保存一个历史最高值/.test(hs.status) && /没有逐局记录/.test(hs.status), hs.status);
    await shot('30-settings-high-score.png');
    // 刷新后最高分保持
    await send('Page.reload');
    check('刷新后 index 重新加载', await waitFor('!!RA.short && !!RA.short.state', 15000));
    await mouse((await rect('#btn-main-settings')).x, (await rect('#btn-main-settings')).y, 'left');
    await waitFor('document.getElementById("main-settings").style.display==="flex"', 4000);
    check('刷新后历史最高分仍为 35(独立 key 保持)',
      await evaluate('document.getElementById("high-score-value").textContent==="35"'),
      await evaluate('document.getElementById("high-score-value").textContent'));
    await mouse((await rect('#btn-main-settings-close')).x, (await rect('#btn-main-settings-close')).y, 'left');
    // 重试同塔:0 分
    await mouse((await rect('#btn-formal')).x, (await rect('#btn-formal')).y, 'left');
    await waitFor('!!RA.short.state.session', 12000);
    await key('KeyF', 'f', 70);
    await waitFor('RA.short.state.session.world.current===1', 4000);
    await sleep(300);
    const retryScore = await evaluate('document.getElementById("score-text").textContent');
    check('新一局重试:得分从 0 开始(再进 1 层后为 20,不是继承上一局)',
      retryScore.indexOf('得分 20') >= 0, retryScore);
    check('重试不重新抽塔(同 manifest)', await evaluate('!!RA.short.state.session.manifestId'));
  } finally {
    try { browser.ws.close(); } catch (e) { /* ignore */ }
    killTree(browser.child);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  const evidence = {
    title: '30号卡可见浏览器证据', date: '2026-11-09',
    note: '真实Chrome:编辑器调色板鼠标放金币/弓箭手、试玩拾取/被箭扣血/K杀本体且无分数、未通关返回原稿、正式内存fixture的20/10/5计分与结果/最高分/重试0。不写作者passed/发布池/草稿(编辑器草稿仅本隔离profile)。正式图为内存fixture。',
    browser: browser.version.Browser, pass, fail, results
  };
  writeFileSync(join(OUT, 'browser-30-coins-archer-2026-11-09.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('\n30号卡浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('检查异常:' + (e && e.stack || e)); process.exit(1); });
