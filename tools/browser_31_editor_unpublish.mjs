#!/usr/bin/env node
/* 31: isolated Chrome UI/IndexedDB regression. No author profile or catalog writes. */
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
    const profile = mkdtempSync(join(tmpdir(), 'ra-31-chrome-')), port = await freePort();
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
      await sleep(100); // Input is sampled by the animation loop, so hold across frames.
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
      await evaluate('RA.editor.openJSONText(' + JSON.stringify(jsonText) + ',"31 editor probe");true');
      await sleep(250);
    }

    async function click(sel) {
      await evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'center'})`);
      const p = await rect(sel); await mouse(p.x, p.y);
    }
    async function confirmRemoval(accept) {
      const pending = click('#btn-unpublish');
      await sleep(250);
      await send('Page.handleJavaScriptDialog', { accept });
      await pending;
    }
    check('isolated Chrome/editor ready', await waitFor('!!RA.editor && !!RA.editor.model', 15000));
    const fixture = await evaluate(`(()=>{let d=JSON.parse(JSON.stringify(RA.FULL40.fallback));
      d.id='editor31';d.title='31 isolated editor';d.certification=null;d.contentHash=null;
      d.objects=[];d.paths=[];return JSON.stringify(d);})()`);
    await loadLevel(fixture);
    await evaluate('RA.editor.view={x:0,y:0,zoom:1};true');
    check('flail palette', await selectPalette('流星锤'));
    await clickCell(6, 7);
    check('mouse placed nonzero flail', await evaluate('RA.editor.model.data.objects.some(o=>o.type==="flail"&&o.col===6&&o.row===7)'));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1300, y: 40 });
    await shot('31-editor-flail.png');
    const beforeView = await evaluate('JSON.stringify(RA.editor.view)');
    const center = await cellPoint(8, 8);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: center.x, y: center.y, deltaX: 0, deltaY: 220 });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: center.x, y: center.y, button: 'middle', clickCount: 1 });
    await sleep(100);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x + 60, y: center.y + 30, button: 'middle', buttons: 4 });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: center.x + 60, y: center.y + 30, button: 'middle', clickCount: 1 });
    check('real wheel/pan changes view only', beforeView !== await evaluate('JSON.stringify(RA.editor.view)') && await evaluate('RA.editor.model.data.objects[0].col===6&&RA.editor.model.data.objects[0].row===7'));
    await shot('31-editor-flail-zoom-pan.png');
    await evaluate('RA.editor.view={x:0,y:405,zoom:1};RA.editor.mouse.outside=true;true');
    await sleep(100); await shot('31-editor-flail-offscreen.png');
    await evaluate('RA.editor.view={x:0,y:0,zoom:0.8};true');
    for (const [palette, type, row] of [['路径齿轮', 'gear', 4], ['移动火球', 'fireball_moving', 13]]) {
      check(`${type} palette`, await selectPalette(palette));
      await clickCell(3, row); await clickCell(7, row); await clickCell(7, row + 2); await clickCell(7, row + 2, 'right');
      check(`${type} mouse path completed`, await evaluate(`RA.editor.model.data.objects.some(o=>o.type==='${type}') && RA.editor.model.data.paths.length===1 && !RA.editor.gearGesture`));
      await shot(`31-editor-${type}-path.png`);
      await key('KeyE', 'e', 69); await clickCell(3, row);
      check(`${type} eraser removes object and path`, await evaluate(`!RA.editor.model.data.objects.some(o=>o.type==='${type}') && RA.editor.model.data.paths.length===0`));
      await click('#btn-undo');
      check(`${type} one undo restores both`, await evaluate(`RA.editor.model.data.objects.some(o=>o.type==='${type}') && RA.editor.model.data.paths.length===1`));
      await click('#btn-redo');
      check(`${type} one redo removes both`, await evaluate(`!RA.editor.model.data.objects.some(o=>o.type==='${type}') && RA.editor.model.data.paths.length===0`));
    }
    await click('#btn-draft');
    check('saved edited draft', await waitFor('!!RA.editor.draftId && !RA.editor.dirty && !RA.editor._saving', 4000));
    const draftId = await evaluate('RA.editor.draftId');
    const noOpBefore = await evaluate('JSON.stringify({hash:RA.LevelData.hashSync(RA.editor.model.data),undo:RA.editor.undoStack.length,redo:RA.editor.redoStack.length})');
    await key('KeyE', 'e', 69); await clickCell(3, 4);
    check('empty eraser preserves dirty/hash/history', await evaluate('!RA.editor.dirty') && noOpBefore === await evaluate('JSON.stringify({hash:RA.LevelData.hashSync(RA.editor.model.data),undo:RA.editor.undoStack.length,redo:RA.editor.redoStack.length})'));
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/') + '?from=trial&draft=' + draftId });
    check('saved/reopened draft has no orphan paths', await waitFor(`!!RA.editor && RA.editor.draftId===${JSON.stringify(draftId)} && RA.editor.model.data.paths.length===0 && RA.editor.model.data.objects.length===1`, 10000));
    await shot('31-editor-reopened.png');

    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'index.html').replace(/\\/g, '/') });
    check('index ready', await waitFor('!!RA.short && !!RA.short.repo', 10000));
    // Synthetic declarations are created ONLY in this disposable profile, never author storage.
    check('isolated IDB fixture prepared', await evaluate(`(async()=>{
      const repo=RA.short.repo;await repo.ensurePoolEpoch();
      window.fixture31={};
      for(const name of ['a','b','invalid']){
        let d=JSON.parse(JSON.stringify(RA.FULL40.fallback));d.id='unpublish31';d.title='31 version '+name;d.difficulty=1;
        d.contentHash=null;d.certification=null;d.contentHash=RA.LevelData.hashSync(d);
        if(name!=='invalid')d.certification={contentHash:d.contentHash,rulesVersion:'fixture31',rulesFingerprint:'fixture31',profileId:'run-v1',status:'passed',source:'local-playtest',completedAt:'2026-11-09T00:00:00.000Z'};
        const r={levelId:d.id,contentHash:d.contentHash,data:d,poolEpoch:RA.FULL40.poolEpoch,source:'isolated-test'};
        fixture31[name]=r;const p=await repo.adapter.publish(r);if(!p.ok)return false;
      }
      const s=await repo.saveDraft('retained31',fixture31.a.data,0);if(!s.ok)return false;
      fixture31.draftBefore=JSON.stringify((await repo.loadDraft('retained31')).value);
      localStorage.setItem('ra_seed_texts_v1',JSON.stringify({version:1,activeSeed:'RA-1',savedSeeds:['RA-1']}));
      localStorage.setItem('ra_high_score_v1',JSON.stringify({version:1,bestScore:777}));
      fixture31.storageBefore=JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));
      return true;
    })()`));
    await click('#btn-formal');
    check('formal new read includes both browser versions', await waitFor('RA.short.state.manifest && RA.short.state.manifest.floors.filter(f=>f.levelId==="unpublish31").length===2', 10000));
    await evaluate('fixture31.manifest=JSON.stringify(RA.short.state.manifest);true');
    await click('#btn-pause');
    // Open settings from its real menu button; retains the current manifest snapshot.
    await click('#btn-menu-pause'); await click('#btn-main-settings');
    check('version list includes unqualified record', await waitFor('document.getElementById("published-version").options.length===3 && !document.getElementById("published-version").disabled', 4000));
    await evaluate('document.getElementById("published-version").value=JSON.stringify([fixture31.a.levelId,fixture31.a.contentHash]);document.getElementById("published-version").dispatchEvent(new Event("change"));true');
    await confirmRemoval(false);
    check('real confirmation cancel retains all versions', await evaluate('(async()=>document.getElementById("unpublish-status").textContent.includes("已取消")&&(await RA.short.repo.listPublishedVersions()).value.length===3)()'));
    // Real IDB delete request succeeds, then abort: oncomplete must be the only success point.
    await evaluate(`(()=>{
      const adapter=RA.short.repo.adapter;fixture31.open=adapter.open.bind(adapter);
      adapter.open=async()=>{const db=await fixture31.open();return {transaction(...args){
        const tx=db.transaction(...args), original=tx.objectStore.bind(tx);
        tx.objectStore=(name)=>{const store=original(name);return {get:k=>store.get(k),delete:k=>{
          const req=store.delete(k);req.addEventListener('success',()=>{
            fixture31.requestSucceeded=true;
            fixture31.successTooEarly=document.getElementById('unpublish-status').textContent.includes('已移出');
            tx.abort();
          });return req;
        }};};return tx;
      }};};return true;
    })()`);
    await confirmRemoval(true);
    check('request-success then real IDB abort reports failure', await waitFor('document.getElementById("unpublish-status").textContent.includes("移出失败")', 4000));
    await evaluate('RA.short.repo.adapter.open=fixture31.open;true');
    check('failed transaction retained target/selection, no early success', await evaluate('(async()=>fixture31.requestSucceeded&&!fixture31.successTooEarly&&!!(await RA.short.repo.getPublished(fixture31.a.levelId,fixture31.a.contentHash)).value&&document.getElementById("published-version").value===JSON.stringify([fixture31.a.levelId,fixture31.a.contentHash]))()'));
    await shot('31-unpublish-aborted.png');
    // Delay storage open and change selection programmatically while pending: target stays captured.
    await evaluate(`(()=>{const adapter=RA.short.repo.adapter;adapter.open=async()=>{await new Promise(r=>setTimeout(r,500));return fixture31.open();};return true;})()`);
    const removal = confirmRemoval(true);
    await sleep(350);
    check('pending operation disables repeat and selection', await evaluate('document.getElementById("btn-unpublish").disabled&&document.getElementById("published-version").disabled'));
    await evaluate('document.getElementById("published-version").value=JSON.stringify([fixture31.b.levelId,fixture31.b.contentHash]);true');
    await removal;
    check('successful deletion waits for completion and refreshes list', await waitFor('document.getElementById("unpublish-status").textContent.includes("已移出浏览器发布池")&&document.getElementById("published-version").options.length===2&&!document.getElementById("published-version").disabled', 6000));
    await evaluate('RA.short.repo.adapter.open=fixture31.open;true');
    check('captured hash removed, later-selected other hash retained', await evaluate('(async()=>!(await RA.short.repo.getPublished(fixture31.a.levelId,fixture31.a.contentHash)).value&&!!(await RA.short.repo.getPublished(fixture31.b.levelId,fixture31.b.contentHash)).value)()'));
    check('repeat exact removal returns removed=false', await evaluate('(async()=>{let r=await RA.short.repo.unpublish(fixture31.a);return r.ok&&!r.value.removed;})()'));
    check('draft/history/storage and manifest unchanged', await evaluate('(async()=>fixture31.draftBefore===JSON.stringify((await RA.short.repo.loadDraft("retained31")).value)&&fixture31.storageBefore===JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))&&fixture31.manifest===JSON.stringify(RA.short.state.manifest))()'));
    await click('#btn-main-settings-close'); await click('#btn-main-settings');
    check('reopened settings counts current pool rather than original tower', await waitFor('document.getElementById("pool-detail").textContent.includes("正式池:1 张")&&document.getElementById("pool-detail").textContent.includes("浏览器发布 1")', 4000));
    await click('#btn-main-settings-close');
    await evaluate('RA.short.retrySame();true');
    check('retry still uses old manifest including removed version', await evaluate('fixture31.manifest===JSON.stringify(RA.short.state.manifest)&&RA.short.state.manifest.floors.some(f=>f.levelId===fixture31.a.levelId&&f.contentHash===fixture31.a.contentHash)'));
    await click('#btn-pause'); await click('#btn-menu-pause'); await click('#btn-formal');
    check('fresh formal read excludes removed hash', await waitFor('RA.short.state.session && !RA.short.state.manifest.floors.some(f=>f.levelId===fixture31.a.levelId&&f.contentHash===fixture31.a.contentHash)', 5000));
    await click('#btn-pause'); await click('#btn-menu-pause');
    await evaluate('RA.NORMAL_LEVELS=[Object.assign({},fixture31.b,{source:"builtin",path:"levels/normal/difficulty-1/fixture31.json"})];true');
    await click('#btn-main-settings');
    await waitFor('!document.getElementById("published-version").disabled', 4000);
    await evaluate('document.getElementById("published-version").value=JSON.stringify([fixture31.b.levelId,fixture31.b.contentHash]);document.getElementById("published-version").dispatchEvent(new Event("change"));true');
    check('builtin duplicate explicitly identified before delete', await evaluate('document.getElementById("published-source").textContent.includes("还有内置来源")'));
    await confirmRemoval(true);
    check('builtin warning survives successful browser removal', await waitFor('document.getElementById("unpublish-status").textContent.includes("已移出")&&document.getElementById("unpublish-status").textContent.includes("sync_levels.mjs")', 4000));
    await shot('31-unpublish-builtin-remains.png');
    await click('#btn-main-settings-close'); await click('#btn-formal');
    // Planner labels ordinary slots "published" for both sources; assert exact identity and actual source counts.
    check('fresh formal read still includes exact builtin duplicate', await waitFor('RA.short.state.session&&RA.short.state.poolInfo.builtin===1&&RA.short.state.poolInfo.published===0&&RA.short.state.manifest.floors.some(f=>f.levelId===fixture31.b.levelId&&f.contentHash===fixture31.b.contentHash)', 5000));
    check('new IDB adapter sees committed removals and retained unqualified version', await evaluate('(async()=>{const r=RA.ContentRepository.create();const list=await r.listPublishedVersions();return list.ok&&list.value.length===1&&list.value[0].contentHash===fixture31.invalid.contentHash;})()'));
    check('author fixture draft still present after both removals', await evaluate('(async()=>fixture31.draftBefore===JSON.stringify((await RA.short.repo.loadDraft("retained31")).value))()'));

  } catch (e) {
    check('browser scenario completed without exception', false, e.stack || String(e));
  } finally {
    browser.ws.close(); killTree(browser.child);
    // Only remove the disposable profile this script created under the system temp directory.
    if (browser.profile.startsWith(join(tmpdir(), 'ra-31-chrome-'))) {
      try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* locked profile */ }
    }
  }
  writeFileSync(join(OUT, 'browser-31-editor-unpublish.json'), JSON.stringify({date:'2026-11-09',browser:browser.version.Browser,note:'Isolated headless Chrome; real mouse/key events, rendered screenshots and IndexedDB. Synthetic published declarations only in disposable profile. Not human play or author publishing.',pass,fail,results},null,2)+'\n','utf8');
  console.log(pass+' PASS / '+fail+' FAIL'); return fail?1:0;
}
main().then(c=>process.exit(c)).catch(e=>{console.error(e.stack||e);process.exit(1);});
