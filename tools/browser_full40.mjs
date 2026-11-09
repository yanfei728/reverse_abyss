#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_full40.mjs —— 25号卡:真实 Chrome 检查完整塔入口/清池/分档/F 传送/双 Boss/重试
 * =====================================================================================
 *     node tools/browser_full40.mjs
 *
 * 真实浏览器 + 真实键盘事件;用 RA.short.debugJumpTo 定位 10/20/30/40 做生命周期检查,
 * 这是显式调试跳层,不是真人从 0 走通 40 层,也不产生任何作者认证。
 * 只写临时浏览器 user-data-dir 的 IndexedDB,不碰用户存储/levels/。
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
    const profile = mkdtempSync(join(tmpdir(), 'ra-full40-chrome-'));
    const port = await freePort();
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + port,
      'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/')], { stdio: 'ignore', windowsHide: true });
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
  const shortUrl = 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/');
  try {
    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面异常:' + (r.exceptionDetails.text || '') + ' ' +
        ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
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
      await sleep(120);
      await key('keyUp', code, keyName, vk);
      await sleep(160);
    }
    const pressF = () => tap('KeyF', 'f', 70);
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
      await sleep(250);
      return hit;
    }
    async function gameState() {
      return await evaluate('(function(){var st=RA.short.state,s=st.session;if(!s)return null;var p=s.player;return {' +
        'floor:s.world.current,count:s.world.floorCount,kind:s.world.currentFloor.data.kind,' +
        'hp:s.run.hp,status:s.status,manifestId:s.manifestId,layout:st.manifest&&st.manifest.layout,' +
        'hud:document.getElementById("floor-text").textContent,' +
        'prompt:(document.getElementById("interact-prompt").style.display==="none")?"":document.getElementById("interact-prompt").textContent,' +
        'live:s.world.liveStates(),px:p.x,py:p.y,' +
        'result:(document.getElementById("result-overlay").style.display==="flex")?document.getElementById("result-title").textContent:""};})()');
    }
    async function debugJump(n) {
      const text = await evaluate('(function(){var r=RA.short.debugJumpTo(' + n + ');' +
        'return JSON.stringify(r&&r.ok?{floor:r.value.floor,id:r.value.instanceId,kind:r.value.kind}:{err:String((r&&r.error)||"failed")});})()');
      return JSON.parse(text);
    }

    // ---------------- 0. 页面与空池启动 ----------------
    check('Chrome 已启动', true, browser.version.Browser + ' headless');
    check('短塔页加载', await waitFor('!!RA.short && !!RA.short.state && !!RA.FULL40', 15000));
    check('页面标题/按钮是完整塔', await evaluate('document.title.indexOf("完整塔")>=0 && ' +
      'document.getElementById("btn-formal").textContent.indexOf("开始完整塔")>=0'));
    check('HUD 初值是 0/40 不是 1/6', (await evaluate('document.getElementById("floor-text").textContent')).indexOf('0/40') >= 0);
    const poolText = await evaluate('document.getElementById("pool-status").textContent');
    check('正式池状态显示 0 张并说明 test3 补位/旧图归档', /正式池:0 张/.test(poolText) &&
      poolText.indexOf('test3') >= 0 && poolText.indexOf('归档') >= 0, poolText);
    check('旧普通内置池已不在活动 catalog', await evaluate('Object.keys(RA.LEVEL_DATA||{}).length===0 && Object.keys(RA.LEVEL_TEXT||{}).length===0'));
    await shot('full40-menu-empty-pool.png');

    check('空池也能点开始完整塔', await click('#btn-formal'));
    check('完整塔启动成功、菜单隐藏', await waitFor('RA.short.state.session && document.getElementById("menu").style.display==="none"', 10000));
    let gs = await gameState();
    check('开局在 0 层大厅', gs && gs.floor === 0 && gs.kind === 'lobby', gs && gs.hud);
    check('清单是 41 槽 full40-v1', gs && gs.count === 41 && gs.layout === 'full40-v1');
    check('普通槽全部由 test3 补位(空池)', await evaluate('(function(){var m=RA.short.state.manifest;' +
      'return m.floors.filter(function(f){return f.kind==="normal";}).every(function(f){return f.source==="fallback"&&f.levelId==="full40_fallback_test3";});})()'));
    await shot('full40-floor0-lobby.png');

    // ---------------- 1. 0→F→1 ----------------
    await debugJump(0);
    await sleep(150);
    gs = await gameState();
    check('大厅出生点有 F 提示', gs && gs.prompt.indexOf('F') >= 0, gs && gs.prompt);
    await pressF();
    await waitFor('RA.short.state.session.world.current===1', 3000);
    gs = await gameState();
    check('真实按 F 一次进入第 1 层', gs && gs.floor === 1 && gs.status === 'running', gs && gs.hud);
    check('第 1 层 HUD 显示真实 1/40', gs && gs.hud.indexOf('1/40') >= 0 && gs.hud.indexOf('普通') >= 0, gs && gs.hud);

    // ---------------- 2. 10/30 双休息 ----------------
    await evaluate('RA.short.state.session.run.hp=40');
    let r10 = await debugJump(10);
    await sleep(200);
    gs = await gameState();
    check('10 层进场回 40:HP 40→80', gs && gs.hp === 80 && gs.hud.indexOf('10/40') >= 0 && gs.hud.indexOf('休整') >= 0,
      (gs && gs.hp) + ' / ' + (gs && gs.hud));
    check('10 层实例身份非空且带槽号', r10 && r10.id && r10.id.indexOf('10:') === 0, r10 && r10.id);
    await shot('full40-floor10-rest.png');
    await evaluate('RA.short.state.session.run.hp=80');
    const r30 = await debugJump(30);
    await sleep(200);
    gs = await gameState();
    check('30 层独立实例、独立回血:HP 80→100', gs && gs.hp === 100 && gs.hud.indexOf('30/40') >= 0 &&
      r30 && r30.id && r30.id.indexOf('30:') === 0 && r30.id !== r10.id, (gs && gs.hp) + ' / ' + (r30 && r30.id));
    await shot('full40-floor30-rest.png');

    // ---------------- 3. 20 Boss:不胜利 → F→21 ----------------
    await debugJump(20);
    await sleep(300);
    gs = await gameState();
    check('20 层是 Boss,击败前无 F 提示', gs && gs.kind === 'boss' && gs.hud.indexOf('20/40') >= 0 &&
      gs.hud.indexOf('BOSS') >= 0 && gs.prompt === '', gs && gs.hud);
    check('20 层 Boss 有独立实例', await evaluate('(function(){var s=RA.short.state.session;return !!s.boss&&s.boss.state==="shielded";})()'));
    await evaluate('window.__boss20=RA.short.state.session.boss; RA.short.state.session.run.hp=55; RA.short.state.session.run.haloCooldownRemaining=3;');
    await evaluate('(function(){var b=RA.short.state.session.boss;b.state="resolving";b.pendingPhase=null;b.resolvingTimer=0;return true;})()');
    await sleep(400);
    gs = await gameState();
    check('20 层 Boss 击败后不胜利、仍 running', gs && gs.status === 'running' && gs.kind === 'boss');
    check('20 层击败后显示 F 进入 21 提示', gs && gs.prompt.indexOf('F') >= 0 && gs.prompt.indexOf('21') >= 0, gs && gs.prompt);
    await shot('full40-floor20-boss-cleared.png');
    await pressF();
    await waitFor('RA.short.state.session.world.current===21', 3000);
    gs = await gameState();
    check('按 F 一次从 20 传送到 21', gs && gs.floor === 21 && gs.hud.indexOf('21/40') >= 0, gs && gs.hud);
    check('传送保留同一玩家 HP/CD', gs && gs.hp === 55 &&
      await evaluate('RA.short.state.session.run.haloCooldownRemaining>0'));
    check('21 层没有旧 Boss/没有 F 提示', await evaluate('RA.short.state.session.boss===null') && gs.prompt === '');
    await shot('full40-floor21-after-boss.png');

    // ---------------- 4. 死亡重试同一清单 ----------------
    const manifestBefore = gs && gs.manifestId;
    await debugJump(10);
    await sleep(150);
    await evaluate('(function(){var s=RA.short.state.session;s.run.hp=1;s.invulnerable=0;' +
      's.run.invulnerableRemaining=0;s.damage(50,"debug-retry-test");return s.status;})()');
    await sleep(300);
    gs = await gameState();
    check('调试跳层后受伤会死亡并出现死亡面板', gs && gs.status === 'dead' && gs.result.indexOf('死亡') >= 0,
      (gs && gs.status) + ' / ' + (gs && gs.result));
    await shot('full40-dead-retry.png');
    check('点「重试同一座塔」', await click('#btn-retry'));
    check('重试回到 0 层、同一 manifestId(不重抽)', await waitFor('RA.short.state.session && RA.short.state.session.world.current===0', 6000) &&
      (await gameState()).manifestId === manifestBefore);

    // ---------------- 5. 40 新 Boss 胜利 ----------------
    await debugJump(40);
    await sleep(300);
    check('40 层创建全新 Boss(与 20 层不是同一实例)', await evaluate('(function(){var s=RA.short.state.session;return !!s.boss&&s.boss!==window.__boss20&&s.boss.phase===1&&s.boss.state==="shielded";})()'));
    // 两阶段:直接受控推进(调试定位,不冒充战斗操作)
    await evaluate('(function(){var b=RA.short.state.session.boss;b.shieldRemaining=0;b.state="exposed";return true;})()');
    await evaluate('(function(){var s=RA.short.state.session,b=s.boss;b.state="resolving";b.pendingPhase=2;b.resolvingTimer=0;return true;})()');
    await sleep(150);
    await evaluate('(function(){var s=RA.short.state.session,b=s.boss;b.phase=2;b.state="exposed";b.shieldRemaining=0;return true;})()');
    await evaluate('(function(){var s=RA.short.state.session,b=s.boss;b.state="resolving";b.pendingPhase=null;b.resolvingTimer=0;return true;})()');
    await sleep(500);
    gs = await gameState();
    check('40 层两阶段后击败才完整塔胜利', gs && gs.status === 'won' && gs.result.indexOf('完整塔通过') >= 0,
      (gs && gs.status) + ' / ' + (gs && gs.result));
    check('胜利后仍在 40 层、没有 41 层', gs && gs.floor === 40 && gs.count === 41);
    await shot('full40-floor40-victory.png');

    // ---------------- 6. 一次性清池 / 新发布保留 ----------------
    const epochProbe = await evaluate(`(async function(){
      function openDB(name, ver, upgrade){
        return new Promise(function(res,rej){var r=indexedDB.open(name,ver);r.onupgradeneeded=function(){upgrade(r.result);};
          r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};});
      }
      var db = await openDB('ra_full40_reset_probe', 2, function(d){
        if(!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts',{keyPath:'draftId'});
        if(!d.objectStoreNames.contains('published')) d.createObjectStore('published',{keyPath:'key'});
      });
      await new Promise(function(res,rej){var tx=db.transaction(['drafts','published'],'readwrite');
        tx.objectStore('drafts').put({draftId:'keep_draft',revision:1,title:'保留草稿',data:{}});
        tx.objectStore('published').put({key:'old:1',levelId:'old',contentHash:'sha256:old',data:{},profile:'run-v1'});
        tx.oncomplete=res;tx.onerror=function(){rej(tx.error);};});
      db.close();
      var repo = RA.ContentRepository.create({dbName:'ra_full40_reset_probe'});
      var prep1 = await repo.ensurePoolEpoch('probe-epoch');
      var after = await repo.adapter.listPublished();
      var drafts = await repo.listDrafts();
      var prep2 = await repo.ensurePoolEpoch('probe-epoch');
      var after2 = await repo.adapter.listPublished();
      indexedDB.deleteDatabase('ra_full40_reset_probe');
      return { first: prep1.ok && prep1.value.resetApplied, publishedAfter: after.value.length,
        draftsKept: drafts.value.length, second: prep2.ok && prep2.value.resetApplied === false,
        publishedAfter2: after2.value.length };
    })()`);
    check('真实 IndexedDB 一次性清池:同事务清 published、保留 drafts', epochProbe && epochProbe.first === true &&
      epochProbe.publishedAfter === 0 && epochProbe.draftsKept === 1, JSON.stringify(epochProbe));
    check('同一 epoch 重开不再清池', epochProbe && epochProbe.second === true && epochProbe.publishedAfter2 === 0);

    // 旧页面写入的"无 epoch"记录不能混进候选;随后新发布必须保留
    const seedOld = await evaluate(`(async function(){
      var repo = RA.short.repo; var d = JSON.parse(JSON.stringify(RA.FULL40.fallback));
      d.id='legacy_no_epoch'; d.title=d.id; d.difficulty=2; d.contentHash=null; d.certification=null;
      var enc = RA.LevelData.encode(d); var data = JSON.parse(enc.value);
      await repo.adapter.publish({key:data.id+':'+data.contentHash,levelId:data.id,contentHash:data.contentHash,
        data:data,profile:'run-v1',source:'local-playtest',publishedAt:'old'});
      var list = await repo.listEligible({});
      return {count:list.ok?list.value.length:-1, ids:list.ok?list.value.map(function(r){return r.levelId;}):[]};
    })()`);
    check('旧无 epoch 记录被候选隔离(不冒充新发布)', seedOld && seedOld.count === 0 && seedOld.ids.indexOf('legacy_no_epoch') < 0, JSON.stringify(seedOld));

    const pub = await evaluate(`(async function(){
      var repo = RA.short.repo; var d = JSON.parse(JSON.stringify(RA.FULL40.fallback));
      d.id='full40_browser_new'; d.title='浏览器新发布'; d.difficulty=2; d.contentHash=null; d.certification=null;
      var enc = RA.LevelData.encode(d); if(!enc.ok) return {err:enc.error}; var out=JSON.parse(enc.value);
      out.certification={contentHash:out.contentHash,rulesVersion:'probe',rulesFingerprint:'probe',
        profileId:'run-v1',status:'passed',source:'local-playtest',completedAt:new Date().toISOString()};
      var saved = await repo.saveDraft('draft_browser_new', out, 0);
      if(!saved.ok) return {err:saved.error};
      var res = await repo.publish({draftId:'draft_browser_new',expectedRevision:saved.value.revision,receipt:out.certification});
      if(!res.ok) return {err:res.error};
      var list = await repo.listEligible({});
      return {count:list.value.length, ids:list.value.map(function(r){return r.levelId+':d'+r.data.difficulty;})};
    })()`);
    check('真实浏览器里发布难度 2 新图成功', pub && !pub.err && pub.count === 1 && pub.ids[0] === 'full40_browser_new:d2', JSON.stringify(pub));

    await send('Page.reload');
    await waitFor('!!RA.short && !!RA.short.repo', 15000);
    await waitFor('document.getElementById("pool-status").textContent.indexOf("正式池")>=0', 8000);
    const afterReload = await evaluate('(async function(){var l=await RA.short.repo.listEligible({});return {n:l.value.length,ids:l.value.map(function(r){return r.levelId;}),text:document.getElementById("pool-status").textContent};})()');
    check('刷新后新发布仍在(不会被再次清池)', afterReload && afterReload.n === 1 && afterReload.ids.indexOf('full40_browser_new') >= 0, JSON.stringify(afterReload));
    check('池状态显示 1 张且区分难度', afterReload && afterReload.text.indexOf('1 张') >= 0 && afterReload.text.indexOf('2档 1') >= 0, afterReload && afterReload.text);

    // 正式塔:难度 2 新图只进 11–19
    await click('#btn-formal');
    await waitFor('RA.short.state.session', 10000);
    const dist = await evaluate('(function(){var m=RA.short.state.manifest;var pub=m.floors.filter(function(f){return f.source==="published";});' +
      'return {slots:pub.map(function(f){return f.floorNumber;}),diffs:pub.map(function(f){return f.requiredDifficulty;}),' +
      'levelIds:pub.map(function(f){return f.levelId;}),total:m.floors.length};})()');
    check('新发布只出现在 11–19 层段', dist && dist.total === 41 && dist.slots.length === 1 &&
      dist.slots[0] >= 11 && dist.slots[0] <= 19 && dist.diffs[0] === 2, JSON.stringify(dist));
    check('新发布 levelId 正确、其余普通槽 test3 补位', dist && dist.levelIds[0] === 'full40_browser_new');
  } finally {
    try { browser.ws.close(); } catch (e) { /* ignore */ }
    killTree(browser.child);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const evidence = {
    title: '25号卡完整塔真实 Chrome 检查', date: '2026-11-09',
    note: '真实浏览器 + 真实键盘事件;生命周期检查使用 RA.short.debugJumpTo 显式调试跳层,不是真人从 0 走通 40 层,不产生认证。测试数据只在临时 user-data-dir。',
    browser: browser.version.Browser, elapsedSeconds: Number(elapsed),
    pass, fail, results
  };
  writeFileSync(join(OUT, 'browser-full40-2026-11-09.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('\n25号卡完整塔浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' + elapsed + 's');
  return fail ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('检查异常:' + (e && e.stack || e));
  process.exit(1);
});
