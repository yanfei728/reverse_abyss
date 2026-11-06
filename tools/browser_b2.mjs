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
        target = list.find((t) => t.type === 'page' && t.url.indexOf('short.html') >= 0);
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
    check('short.html 加载完成', await waitFor('!!RA.short && !!RA.B2_SAMPLES && !!RA.TowerPlanner', 15000));
    check('菜单默认可见', await evaluate('getComputedStyle(document.getElementById("menu")).display') === 'flex');
    await evaluate('document.getElementById("btn-formal").click()');
    await sleep(300);
    check('正式池为空时明确提示,不启动', (await evaluate('document.getElementById("menu-status").textContent')).indexOf('正式池') >= 0 &&
      await evaluate('!RA.short.state.session'));
    await evaluate('document.getElementById("btn-dev").click()');
    check('开发短塔启动', await waitFor('!!RA.short.state.session', 8000));
    check('从大厅开始、生命 100', await evaluate('(function(){var s=RA.short.state.session.snapshot();return s.floor.kind==="lobby"&&s.hp===100&&s.floorCount===6;})()'));
    check('HUD 显示生命与技能', await evaluate('document.getElementById("hp-text").textContent.indexOf("100")>=0'));
    await shot('b2-browser-short-start.png');

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

    // 调试定位到大厅出口前,真实键盘跳过去(不是重新初始化)
    await evaluate(`(function(){
      var s=RA.short.state.session, f=s.world.currentFloor, p=s.player;
      p.x=f.origin.x+f.exitCol*45+8; p.y=f.seamY-p.h+5; p.vy=-360; p.onGround=false;
    })()`);
    await key('rawKeyDown', 'Space', ' ', 32); await key('keyUp', 'Space', ' ', 32);
    const crossed = await waitFor('RA.short.state.session.floorIndex === 1', 3000);
    check('真实输入越过大堂接口进入普通层', crossed);
    check('HUD/会话保留生命与光环', await evaluate('(function(){var s=RA.short.state.session.snapshot();return s.hp===100 && s.castId===1;})()'));
    await shot('b2-browser-short-floor2.png');

    // 死亡 → 重试同一塔(不重新抽选)
    const oldManifest = await evaluate('RA.short.state.manifest.manifestId');
    await evaluate('RA.short.state.session.damage(100,"browser-test")');
    check('死亡结果遮罩出现', await waitFor('getComputedStyle(document.getElementById("result-overlay")).display === "flex"', 3000));
    await evaluate('document.getElementById("btn-retry").click()');
    await waitFor('!!RA.short.state.session && RA.short.state.session.status === "running"', 5000);
    check('重试回到大厅且仍是同一 manifest',
      await evaluate('RA.short.state.session.snapshot().floorIndex === 0') &&
      await evaluate('RA.short.state.manifest.manifestId') === oldManifest);
    await shot('b2-browser-short-retry.png');

    // 编辑器 B2 工具:接口/对象/路径面板
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/') });
    await sleep(800);
    check('编辑器加载', await waitFor('!!RA.editor && !!RA.editor.model', 15000));
    const sample = readFileSync(join(ROOT, 'levels/b2/normal-1.json'), 'utf8');
    check('打开普通层模板', await evaluate('RA.editor.openJSONText(' + JSON.stringify(sample) + ', "n1.json")') === true);
    check('接口/对象/路径面板已填充',
      await evaluate('document.getElementById("obj-list").children.length > 1') &&
      await evaluate('document.getElementById("path-list").children.length >= 1') &&
      await evaluate('document.getElementById("port-entry").value') !== '');
    await evaluate(`(function(){
      document.getElementById('port-entry').value='3';
      document.getElementById('port-exit').value='5';
      document.getElementById('btn-ports-apply').click();
    })()`);
    check('接口编辑写入模型', await evaluate('RA.editor.model.data.ports.entry.col===3 && RA.editor.model.data.ports.exit.col===5'));
    await evaluate(`(function(){
      document.getElementById('path-points').value='2,4\\n8,4';
      document.getElementById('btn-path-new').click();
    })()`);
    check('路径点工具新增路径', await evaluate('RA.editor.model.data.paths.length >= 2'));
    await evaluate(`(function(){
      document.getElementById('obj-type').value='fireball_static';
      document.getElementById('obj-col').value='5';
      document.getElementById('obj-row').value='4';
      document.getElementById('btn-obj-apply').click();
    })()`);
    check('对象参数工具新增对象', await evaluate('RA.editor.model.data.objects.some(function(o){return o.type==="fireball_static"})'));
    await shot('b2-browser-editor-tools.png');

    // 标准试玩页:只验证真实 standard-v1 页面/入口/无光环,不伪造通关认证
    const n1 = JSON.parse(readFileSync(join(ROOT, 'levels/b2/normal-1.json'), 'utf8'));
    const rulesVersion = await evaluate('RA.RULES.rulesVersion');
    const rulesFingerprint = await evaluate('RA.RULES.rulesFingerprint');
    await evaluate('sessionStorage.setItem("RA_STANDARD_V1", ' + JSON.stringify(JSON.stringify({
      version: 1, template: n1, draftId: n1.id, revision: 1,
      contentHash: n1.contentHash, rulesVersion: rulesVersion,
      rulesFingerprint: rulesFingerprint, profile: 'standard-v1'
    })) + ')');
    await send('Page.navigate', { url: 'file:///' + join(ROOT, 'standard.html').replace(/\\/g, '/') });
    await sleep(700);
    check('标准试玩页加载', await waitFor('!!RA.standard && !!RA.standard.session', 15000));
    const stdSnap = await evaluate('(function(){var s=RA.standard.session;return {floors:s.world.floorCount,allow:s.profile.allowSkill,cd:s.snapshot().haloCooldownRemaining,err:document.getElementById("std-error").textContent};})()');
    check('标准会话三层(入口/作者层/出口)且无光环',
      stdSnap && stdSnap.floors === 3 && stdSnap.allow === false &&
      stdSnap.cd > 18 && stdSnap.cd <= 20,
      JSON.stringify(stdSnap));
    check('标准页 HUD 显示无光环/冷却', (await evaluate('document.getElementById("std-hud").textContent')).indexOf('无光环') >= 0);
    await shot('b2-browser-standard-start.png');

    const evidence = {
      date: new Date().toISOString(), browser: browser.version.Browser,
      executable: browser.exe, userAgent: await evaluate('navigator.userAgent'),
      durationMs: Date.now() - t0, pass, fail, results,
      screenshots: ['docs/checks/b2-browser-short-start.png', 'docs/checks/b2-browser-short-floor2.png',
        'docs/checks/b2-browser-short-retry.png', 'docs/checks/b2-browser-editor-tools.png', 'docs/checks/b2-browser-standard-start.png'],
      note: '标准试玩/人工通关认证未由自动化伪造;正式池此时为空。'
    };
    writeFileSync(join(OUT, 'browser-b2-2026-11-06.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    browser.ws.close(); killTree(browser.child); await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nB2 浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('B2 浏览器检查失败:' + (e && e.message)); process.exit(1); });
