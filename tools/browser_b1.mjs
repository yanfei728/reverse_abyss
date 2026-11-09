#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_b1.mjs —— B1 真实浏览器验收
 * ====================================
 *     node tools/browser_b1.mjs
 *
 * 一条链路:
 *   编辑样例 → 保存到 IndexedDB → 刷新 → 找回草稿 → 打开 → 开发试玩
 *   → 真实键盘二段跳跨层 → 暂停/恢复(不追算)。
 * 同时记录浏览器版本、截图和每一步结果;失败时明确失败,不复制旧截图。
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync
} from 'node:fs';
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
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      },
      close() { try { ws.close(); } catch (e) { /* 已关 */ } }
    });
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg.id || !pending.has(msg.id)) return;
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message + ' ' + (msg.error.data || '')));
      else p.res(msg.result);
    };
  });
}
function killTree(child) {
  try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch (e) { try { child.kill(); } catch (e2) { /* 已退出 */ } }
}
async function launch(exe) {
  const profile = mkdtempSync(join(tmpdir(), 'ra-b1-chrome-'));
  const port = await freePort();
  const child = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port,
    'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/')
  ], { stdio: 'ignore', windowsHide: true });
  try {
    let version = null;
    for (let i = 0; i < 100 && !version; i++) {
      try { version = await fetchJson('http://127.0.0.1:' + port + '/json/version'); }
      catch (e) { await sleep(100); }
    }
    if (!version) throw new Error('DevTools 端口没有起来(' + exe + ')');
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      const list = await fetchJson('http://127.0.0.1:' + port + '/json/list');
      target = list.find((t) => t.type === 'page' && t.url.indexOf('editor.html') >= 0);
      if (!target) await sleep(100);
    }
    if (!target) throw new Error('找不到 editor.html 页面目标');
    const ws = await connect(target.webSocketDebuggerUrl);
    await ws.send('Page.enable');
    await ws.send('Runtime.enable');
    return { version, ws, child, profile, exe };
  } catch (e) {
    killTree(child);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
    throw e;
  }
}

async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean).filter((p) => existsSync(p));
  if (!exes.length) { console.error('找不到 Chrome / Edge'); return 2; }
  let browser = null, lastErr = null;
  for (const exe of exes) {
    try { browser = await launch(exe); break; }
    catch (e) { lastErr = e; console.error('启动失败:' + exe + ' — ' + e.message); }
  }
  if (!browser) { console.error('所有浏览器都起不来:' + (lastErr && lastErr.message)); return 1; }
  const { ws, version } = browser;
  const send = ws.send;
  let contextId = null;
  try {
    async function evaluate(expression) {
      const params = { expression, returnByValue: true, awaitPromise: true };
      if (contextId) params.contextId = contextId;
      const r = await send('Runtime.evaluate', params);
      if (r.exceptionDetails) {
        throw new Error('页面异常:' + (r.exceptionDetails.text || '') + ' ' +
          ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
      }
      return r.result ? r.result.value : undefined;
    }
    async function waitFor(expr, ms) {
      const end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        try { if (await evaluate(expr)) return true; } catch (e) { /* 加载中 */ }
        await sleep(100);
      }
      return false;
    }
    async function shot(name) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
    }
    async function key(type, code, keyName, vk) {
      await send('Input.dispatchKeyEvent', {
        type, code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
      });
    }
    async function press(code, keyName, vk, holdMs) {
      await key('rawKeyDown', code, keyName, vk);
      await sleep(holdMs || 80);
      await key('keyUp', code, keyName, vk);
    }

    check('Chrome 已启动', true, version.Browser + ' headless');
    check('编辑器真实页面加载完成',
      await waitFor('!!RA.editor && RA.editor.model && !!RA.ContentRepository', 15000));
    check('编辑器使用 IndexedDB 草稿仓库',
      await evaluate('RA.editor.repo.storage') === 'indexedDB',
      await evaluate('RA.editor.repo.storage'));

    // 1) 打开合法样例(开发样例 A),保存到草稿
    const sample = readFileSync(join(ROOT, 'levels/archive/dev/floor-a.json'), 'utf8');
    check('真实页面打开开发样例 A',
      await evaluate('RA.editor.openJSONText(' + JSON.stringify(sample) + ', "floor-a.json")') === true);
    const draftId = await evaluate('RA.editor.model.id');
    await evaluate('document.getElementById("btn-draft").click()');
    check('点「保存草稿」写入 IndexedDB',
      await waitFor('RA.editor.draftRevision === 1 && RA.editor.dirty === false', 8000),
      await evaluate('String(RA.editor.draftRevision)'));
    await shot('b1-browser-editor-saved.png');

    // 2) 刷新页面,找回草稿
    await send('Page.reload');
    await sleep(800);
    check('刷新后编辑器重新加载',
      await waitFor('!!RA.editor && RA.editor.model && !!RA.ContentRepository', 15000));
    const listed = await evaluate(
      'RA.editor.refreshDrafts().then(function(list){ return list.map(function(d){return d.draftId;}); })');
    check('刷新后能从 IndexedDB 列出刚保存的草稿',
      Array.isArray(listed) && listed.indexOf(draftId) >= 0, JSON.stringify(listed));
    await evaluate(`(function(){
      var s=document.getElementById('draft-select');
      s.value=${JSON.stringify(draftId)};
      s.dispatchEvent(new Event('change'));
      document.getElementById('btn-draft-open').click();
    })()`);
    check('点「打开草稿」恢复完整内容',
      await waitFor('RA.editor.draftId === ' + JSON.stringify(draftId) +
        ' && RA.editor.model.id === ' + JSON.stringify(draftId) + ' && !RA.editor.dirty', 8000),
      await evaluate('RA.editor.model.title'));
    check('恢复的地形/接口/出生点/extensions 与保存前一致',
      await evaluate('(function(){var d=RA.editor.model.data;return d.spawn.col===5 && ' +
        'd.ports.exit.col===5 && d.terrain.tiles[4][5]===1 && d.extensions.dev===true;})()'));
    await shot('b1-browser-editor-restored.png');

    // 3) 开发试玩:自动保存 revision 2 并跳到 devplay
    await evaluate('document.getElementById("btn-play").click()');
    check('试玩页加载新 GameSession',
      await waitFor('!!RA.devplay && RA.devplay.ready && !!RA.devplay.session', 15000));
    check('试玩使用两层(编辑层 + 开发样例 B)',
      await evaluate('RA.devplay.floors.length === 2 && RA.devplay.session.floorCount === 2'));
    check('初始在第 0 层,第 1 层预热',
      await evaluate('(function(){var s=RA.devplay.session.snapshot();return s.floorIndex===0 && ' +
        's.live.length===2 && s.live[1].state==="preview";})()'));
    await sleep(700);                            // 落到平台
    await shot('b1-browser-devplay-start.png');

    // 4) 真实键盘二段跳跨层
    let crossed = false;
    for (let attempt = 0; attempt < 5 && !crossed; attempt++) {
      await press('Space', ' ', 32, 130);
      await sleep(90);
      await press('Space', ' ', 32, 220);
      for (let i = 0; i < 20 && !crossed; i++) {
        await sleep(80);
        crossed = (await evaluate('RA.devplay.session.floorIndex')) === 1;
      }
      if (!crossed) await sleep(300);
    }
    check('真实键盘二段跳穿过出口到第 1 层', crossed,
      'floor=' + await evaluate('RA.devplay.session.floorIndex'));
    const afterCross = await evaluate(`(function(){var s=RA.devplay.session.snapshot(); return {
      floor: s.floorIndex, live: s.live, player: s.player, time: s.time
    };})()`);
    check('跨层后第 0 层地形快照仍在、第 1 层活动',
      afterCross.live.length === 2 && afterCross.live[0].state === 'snapshot' &&
      afterCross.live[1].state === 'active', JSON.stringify(afterCross.live));
    check('跨层没有把玩家重置回出生点(位置仍在接口附近)',
      afterCross.player.y < 160 && afterCross.player.y > -250,
      'y=' + afterCross.player.y.toFixed(1));
    await sleep(1200);
    const settled = await evaluate('RA.devplay.session.snapshot()');
    check('跨层后落回入口梯板也不会掉回第 0 层',
      settled.floorIndex === 1 && settled.player.feet <= 1 && settled.player.onGround === true,
      'floor=' + settled.floorIndex + ' feet=' + settled.player.feet.toFixed(1));
    await shot('b1-browser-devplay-floor2.png');

    // 5) 暂停 / 恢复
    await key('rawKeyDown', 'KeyP', 'p', 80);
    await key('keyUp', 'KeyP', 'p', 80);
    const paused = await evaluate('RA.devplay.session.paused');
    const pausedSnap = await evaluate('RA.devplay.session.snapshot()');
    await sleep(800);
    const still = await evaluate('RA.devplay.session.snapshot()');
    check('P 能暂停模拟', paused === true && still.paused === true);
    check('暂停期间时间 / 位置不推进',
      still.time === pausedSnap.time && still.player.x === pausedSnap.player.x &&
      still.player.y === pausedSnap.player.y);
    check('暂停遮罩可见', await evaluate(
      'getComputedStyle(document.getElementById("pause-overlay")).display === "flex"'));
    await shot('b1-browser-devplay-paused.png');
    await evaluate('document.getElementById("btn-resume").click()');
    const resumed = await waitFor('!RA.devplay.session.paused', 3000);
    await sleep(300);
    const afterResume = await evaluate('RA.devplay.session.snapshot()');
    check('点「继续」恢复模拟', resumed && afterResume.paused === false);
    check('恢复后不追算暂停的 0.8 秒',
      afterResume.time > pausedSnap.time && afterResume.time - pausedSnap.time < 0.4,
      (afterResume.time - pausedSnap.time).toFixed(3) + 's');

    // N02:暂停菜单里重开,旧遮罩不能留在新 session 上
    await key('rawKeyDown', 'KeyP', 'p', 80);
    await key('keyUp', 'KeyP', 'p', 80);
    check('重开前已暂停并显示遮罩',
      await evaluate('RA.devplay.session.paused') === true &&
      await evaluate('getComputedStyle(document.getElementById("pause-overlay")).display') === 'flex');
    await evaluate('(window.__oldSession = RA.devplay.session, true)');
    await evaluate('document.getElementById("btn-restart-pause").click()');
    await sleep(300);
    check('暂停菜单重开后遮罩消失、新 session 未暂停',
      await evaluate('getComputedStyle(document.getElementById("pause-overlay")).display') === 'none' &&
      await evaluate('RA.devplay.session.paused') === false);
    check('重开后回到第 1 层且仍是新 session',
      await evaluate('RA.devplay.session.floorIndex') === 0 &&
      await evaluate('RA.devplay.session !== window.__oldSession') === true);
    check('重开后玩家贴图仍加载',
      await evaluate('Object.keys(RA.devplay.session.player.frames || {}).length > 0'));

    const evidence = {
      date: new Date().toISOString(),
      browser: version.Browser,
      executable: browser.exe,
      userAgent: await evaluate('navigator.userAgent'),
      durationMs: Date.now() - t0,
      pass, fail, results,
      screenshots: [
        'docs/checks/b1-browser-editor-saved.png',
        'docs/checks/b1-browser-editor-restored.png',
        'docs/checks/b1-browser-devplay-start.png',
        'docs/checks/b1-browser-devplay-floor2.png',
        'docs/checks/b1-browser-devplay-paused.png'
      ],
      draftId
    };
    writeFileSync(join(OUT, 'browser-b1-2026-11-04.json'),
      JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    ws.close();
    killTree(browser.child);
    await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  }
  console.log('\nB1 浏览器验收:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' +
    ((Date.now() - t0) / 1000).toFixed(1) + 's');
  return fail ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('B1 浏览器验收失败:' + (e && e.message));
  process.exit(1);
});
