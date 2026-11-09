#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_b2.mjs —— B2 主入口/短塔/暂停/重试 + 编辑器 B2 工具 真实浏览器检查
 * ========================================================================
 *     node tools/browser_b2.mjs
 * 说明:自动化不会声称完成人工通关认证;标准试玩/发布仍需作者实际游玩并经用户确认。
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
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
    ws.onopen = () => resolve({ send(m, p) { return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p || {} })); }); }, close() { try { ws.close(); } catch (e) {} } });
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m.id || !pending.has(m.id)) return;
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
    };
  });
}
function killTree(c) { try { spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} }

async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean).filter((p) => existsSync(p));
  if (!exes.length) { console.error('找不到 Chrome/Edge'); return 2; }
  let browser = null, last = null;
  for (const exe of exes) {
    const profile = mkdtempSync(join(tmpdir(), 'ra-b2-chrome-'));
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
        target = list.find((t) => t.type === 'page' && t.url.indexOf('index.html') >= 0);
        if (!target) await sleep(100);
      }
      if (!target) throw new Error('找不到 short.html');
      const ws = await connect(target.webSocketDebuggerUrl);
      await ws.send('Page.enable'); await ws.send('Runtime.enable');
      browser = { ws, child, profile, version, exe };
      break;
    } catch (e) {
      last = e; killTree(child);
      try { rmSync(profile, { recursive: true, force: true }); } catch (e2) {}
    }
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
    async function key(type, code, keyName, vk) {
      await send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    }
    async function shot(name) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
    }

    check('Chrome 已启动', true, browser.version.Browser + ' headless');
    check('双击 index.html 自动进入 short.html', await waitFor('!!RA.short && !!RA.B2_SAMPLES && !!RA.TowerPlanner', 15000) &&
      (await evaluate('location.pathname.indexOf("short.html") >= 0')));
    check('菜单默认可见', await evaluate('getComputedStyle(document.getElementById("menu")).display') === 'flex');
    await evaluate('document.getElementById("btn-formal").click()');
    await sleep(400);
    // 25号卡:正式池为空也能开始完整塔(36 个普通槽用 test3 补位)
    check('正式池为空也能开始完整塔', await waitFor('!!RA.short.state.session', 8000) &&
      await evaluate('(function(){var s=RA.short.state.session;return s.world.floorCount===41 && RA.short.state.manifest.layout==="full40-v1";})()'));
    await send('Page.reload');
    await sleep(500);
    await waitFor('!!RA.short && !!RA.short.state', 12000);
    await evaluate('document.getElementById("btn-dev").click()');
    check('开发短塔启动', await waitFor('!!RA.short.state.session', 8000));
    check('从大厅开始、生命 100', await evaluate('(function(){var s=RA.short.state.session.snapshot();return s.floor.kind==="lobby"&&s.hp===100&&s.floorCount===6;})()'));
    check('HUD 显示生命与技能', await evaluate('document.getElementById("hp-text").textContent.indexOf("100")>=0'));
    await shot('b2r1-browser-short-start.png');

    await key('rawKeyDown', 'KeyK', 'k', 75); await key('keyUp', 'KeyK', 'k', 75);
    await sleep(150);
    check('K 施放光环并进入 14/20 秒', await evaluate('(function(){var s=RA.short.state.session.snapshot();return s.castId===1 && s.haloActiveRemaining>13 && s.haloCooldownRemaining>19;})()'));
    await key('rawKeyDown', 'KeyP', 'p', 80); await key('keyUp', 'KeyP', 'p', 80);
    const pt = await evaluate('RA.short.state.session.snapshot().time');
    await sleep(500);
    check('P 暂停并冻结时间', await evaluate('RA.short.state.session.paused') === true &&
      await evaluate('RA.short.state.session.snapshot().time') === pt);
    await evaluate('document.getElementById("btn-resume").click()');
    await sleep(250);
    check('继续后恢复', await evaluate('RA.short.state.session.paused') === false);

    // 调试短塔也从 0 层大厅按 F 出发(与完整塔同一套传送;不再翻越上边界/石管)
    await evaluate(`(function(){
      var s=RA.short.state.session, f=s.world.currentFloor, p=s.player;
      var fs=f.data.extensions && f.data.extensions.fixedScene;
      var sp=fs && fs.playerSpawn;
      if(sp){ p.x=f.origin.x+sp.centerCol*45-p.w/2; p.y=f.origin.y+(sp.feetRow-1)*45-p.h; }
      p.vx=0; p.vy=0;
    })()`);
    await sleep(150);
    await key('rawKeyDown', 'KeyF', 'f', 70); await key('keyUp', 'KeyF', 'f', 70);
    const crossed = await waitFor('RA.short.state.session.floorIndex === 1', 3000);
    check('真实按 F 从大厅进入普通层', crossed);
    check('HUD/会话保留生命与光环', await evaluate('(function(){var s=RA.short.state.session.snapshot();return s.hp===100 && s.castId===1;})()'));
    await shot('b2r1-browser-short-floor2.png');

    // 死亡 → 重试同一塔(不重新抽选)
    const oldManifest = await evaluate('RA.short.state.manifest.manifestId');
    await evaluate('RA.short.state.session.damage(100,"browser-test")');
    check('死亡结果遮罩出现', await waitFor('getComputedStyle(document.getElementById("result-overlay")).display === "flex"', 3000));
    await evaluate('document.getElementById("btn-retry").click()');
    await waitFor('!!RA.short.state.session && RA.short.state.session.status === "running"', 5000);
    check('重试回到大厅且仍是同一 manifest',
      await evaluate('RA.short.state.session.snapshot().floorIndex === 0') &&
      await evaluate('RA.short.state.manifest.manifestId') === oldManifest);
    await shot('b2r1-browser-short-retry.png');

    // 24号卡后的编辑器:旧“对象/参数/路径”面板已移除,数据与画布工具保留
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/') });
    await sleep(800);
    check('编辑器加载', await waitFor('!!RA.editor && !!RA.editor.model', 15000));
    const sample = readFileSync(join(ROOT, 'levels/archive/b2/normal-1.json'), 'utf8');
    check('打开普通层模板', await evaluate('RA.editor.openJSONText(' + JSON.stringify(sample) + ', "n1.json")') === true);
    check('旧对象/参数/路径面板已移除',
      await evaluate('document.getElementById("obj-list") === null && document.getElementById("obj-type") === null && ' +
        'document.getElementById("path-list") === null && document.getElementById("btn-obj-apply") === null && ' +
        'document.getElementById("btn-path-apply") === null'));
    check('对象/路径数据仍在,端点区域仍显示',
      await evaluate('RA.editor.model.data.objects.length > 0 && RA.editor.model.data.paths.length > 0') &&
      await evaluate('!!document.getElementById("start-coord") && !!document.getElementById("finish-coord")'));
    check('齿轮专属控件在画布工具旁,选齿轮时才显示',
      await evaluate('!!document.getElementById("gear-mode")') &&
      await evaluate('(function(){RA.editor.selectChar("~gear");return document.getElementById("gear-mode-row").style.display!=="none";})()') &&
      await evaluate('(function(){RA.editor.selectChar("^");return document.getElementById("gear-mode-row").style.display==="none";})()'));
    await shot('b2r1-browser-editor-after-24.png');

    // 旧标准试玩页:24号卡起只留说明+回编辑器,不再启动旧控制器
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'standard.html').replace(/\\/g, '/') });
    await sleep(700);
    check('旧标准页不再启动旧控制器',
      await evaluate('(typeof RA === "undefined" ? "undefined" : typeof RA.standard) === "undefined"') &&
      await evaluate('document.body.textContent.indexOf("停用") >= 0') &&
      await evaluate('!!document.querySelector(\'a[href="editor.html"]\')'));
    await shot('b2r1-browser-standard-disabled.png');

    const evidence = {
      date: new Date().toISOString(), browser: browser.version.Browser,
      executable: browser.exe, userAgent: await evaluate('navigator.userAgent'),
      durationMs: Date.now() - t0, pass, fail, results,
      screenshots: ['docs/checks/b2r1-browser-short-start.png', 'docs/checks/b2r1-browser-short-floor2.png',
        'docs/checks/b2r1-browser-short-retry.png', 'docs/checks/b2r1-browser-editor-after-24.png', 'docs/checks/b2r1-browser-standard-disabled.png'],
      note: '标准试玩/人工通关认证未由自动化伪造;正式池此时为空。'
    };
    writeFileSync(join(OUT, 'browser-b2r1-2026-11-06.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    browser.ws.close(); killTree(browser.child); await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nB2 浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('B2 浏览器检查失败:' + (e && e.message)); process.exit(1); });
