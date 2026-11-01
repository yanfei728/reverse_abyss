#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * browser_t02a_r.mjs —— T02A-R 的真实浏览器回归(A1～A3)
 * ====================================================
 *     node tools/browser_t02a_r.mjs
 *
 * 在 T02A 的浏览器验收基础上只加本轮需要的检查:
 *   · A1:选机关画笔 S,在同一格真实按住约 1 秒,确认只产生一个对象;
 *   · A2:打开缺 entry/exit 的 JSON,确认页面不抛异常、当前图/历史不变;
 *   · A3:20×12、接口 col=10 的图缩到 8×12:取消零变更;确认后端口退休到
 *         extensions.retiredPorts、ports=null;撤销还原原接口。
 *
 * 证据使用 T02A-R 自己的文件名,不覆盖 T02A 交付时的截图/JSON/日志。
 * 浏览器起不来时明确失败,不复制旧截图冒充新结果。
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from './loader.mjs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EDITOR_URL = 'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/');
const DEMO = join(ROOT, 'levels/demo/t02a-demo.json');
const OUT = join(ROOT, 'docs/checks');
const t0 = Date.now();

const results = [];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) });
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
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

/** 启动一个 Chromium,返回 {version,ws,child,profile,downloads,send} */
async function launch(exe) {
  const profile = mkdtempSync(join(tmpdir(), 'ra-t02ar-chrome-'));
  const downloads = mkdtempSync(join(tmpdir(), 'ra-t02ar-download-'));
  const port = await freePort();
  const child = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port, EDITOR_URL
  ], { stdio: 'ignore', windowsHide: true });
  try {
    let version = null;
    for (let i = 0; i < 80 && !version; i++) {
      try { version = await fetchJson('http://127.0.0.1:' + port + '/json/version'); }
      catch (e) { await sleep(100); }
    }
    if (!version) throw new Error('DevTools 端口没有起来(' + exe + ')');
    let target = null;
    for (let i = 0; i < 50 && !target; i++) {
      const list = await fetchJson('http://127.0.0.1:' + port + '/json/list');
      target = list.find((t) => t.type === 'page' && t.url.indexOf('editor.html') >= 0);
      if (!target) await sleep(100);
    }
    if (!target) throw new Error('找不到 editor.html 页面目标');
    const ws = await connect(target.webSocketDebuggerUrl);
    await ws.send('Page.enable');
    await ws.send('Runtime.enable');
    await ws.send('Browser.setDownloadBehavior', {
      behavior: 'allow', downloadPath: downloads, eventsEnabled: true
    });
    return { version, ws, child, profile, downloads };
  } catch (e) {
    killTree(child);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
    throw e;
  }
}
function killTree(child) {
  try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch (e) { try { child.kill(); } catch (e2) { /* 已退出 */ } }
}

async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean);
  const existing = exes.filter((p) => existsSync(p));
  if (!existing.length) {
    console.error('找不到 Chrome / Edge;本机无法做真实浏览器验收。');
    return 2;
  }
  let browser = null, launchError = null;
  for (const exe of existing) {
    try {
      browser = await launch(exe);
      browser.exe = exe;
      break;
    } catch (e) {
      launchError = e;
      console.error('启动失败:' + exe + ' — ' + e.message);
    }
  }
  if (!browser) { console.error('所有浏览器都起不来:' + (launchError && launchError.message)); return 1; }
  const { version, ws } = browser;
  const send = ws.send;
  try {
    check('本机 Chromium 已启动(headless)', true, version.Browser + ' @ ' + browser.exe);
    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true
      });
      if (r.exceptionDetails) {
        throw new Error('页面脚本异常:' + (r.exceptionDetails.text || '') + ' ' +
          ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
      }
      return r.result ? r.result.value : undefined;
    }
    async function waitFor(expr, ms) {
      const end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        try { if (await evaluate(expr)) return true; } catch (e) { /* 还在加载 */ }
        await sleep(100);
      }
      return false;
    }
    async function cellToScreen(c, r) {
      return evaluate(`(function(){
        var p = RA.editor.cellToScreen(${c}, ${r});
        p.x += RA.C.TS * RA.editor.view.zoom / 2;
        p.y += RA.C.TS * RA.editor.view.zoom / 2;
        var cv = document.getElementById('board'), b = cv.getBoundingClientRect();
        return { x: b.left + p.x * b.width / cv.width,
                 y: b.top + p.y * b.height / cv.height };
      })()`);
    }
    async function mouse(type, x, y, button, buttonsMask) {
      await send('Input.dispatchMouseEvent', {
        type, x, y, button: button || 'none', buttons: buttonsMask || 0, clickCount: 1
      });
      await sleep(50);
    }
    async function shot(name) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
    }

    check('editor.html 在真实浏览器里加载完成',
      await waitFor('!!window.RA_EDITOR_READY && !!window.RA.editor', 15000));

    // ---- 打开演示 JSON ----
    const demoText = readFileSync(DEMO, 'utf8');
    check('打开演示 JSON', await evaluate(
      'RA.editor.openJSONText(' + JSON.stringify(demoText) + ', "t02a-demo.json")') === true);
    check('演示图 id / 对象数正确', await evaluate(
      'RA.editor.model.id === "t02a_demo" && RA.editor.model.objects.length === 3'));
    await shot('t02ar-browser-import.png');

    // ---- 正常鼠标画图 / 撤销 / 重做 / 缩放 / 平移(T02A 回归) ----
    await evaluate('RA.editor.setTool("brush"); RA.editor.selectChar("^"); RA.editor.setBrush(1);');
    const p1 = await cellToScreen(2, 4);
    await mouse('mouseMoved', p1.x, p1.y);
    await mouse('mousePressed', p1.x, p1.y, 'left', 1);
    await mouse('mouseReleased', p1.x, p1.y, 'left', 0);
    await sleep(100);
    check('真实鼠标画出一格', await evaluate('RA.editor.model.getTile(2,4) === 1'));
    await evaluate('document.getElementById("btn-undo").click()');
    await sleep(80);
    check('撤销按钮生效', await evaluate('RA.editor.model.getTile(2,4) === 0'));
    await evaluate('document.getElementById("btn-redo").click()');
    await sleep(80);
    check('重做按钮生效', await evaluate('RA.editor.model.getTile(2,4) === 1'));
    const z0 = await evaluate('RA.editor.view.zoom');
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: p1.x, y: p1.y, deltaX: 0, deltaY: -240,
      button: 'none', buttons: 0
    });
    await sleep(120);
    check('真实滚轮改变缩放', await evaluate('RA.editor.view.zoom') > z0);

    // ---- 导出与重开(T02A 回归;在 A1 加对象之前) ----
    await evaluate('document.getElementById("btn-export").click()');
    let downloaded = null;
    for (let i = 0; i < 60 && !downloaded; i++) {
      const files = readdirSync(browser.downloads).filter((f) => f.endsWith('.json'));
      if (files.length) downloaded = join(browser.downloads, files[0]);
      else await sleep(100);
    }
    check('导出 JSON 真的产生下载文件', !!downloaded);
    if (downloaded) {
      const text = readFileSync(downloaded, 'utf8');
      const data = JSON.parse(text);
      check('下载文件是未认证完整 LevelData', data.schemaVersion === 2 &&
        data.certification === null && data.ports === null);
      check('下载文件保留未知字段与路线',
        data.objects.some((o) => o.type === 'future_enemy' &&
          o.behavior && o.behavior.keep === 'author-data') &&
        data.paths[0].label === '往返巡逻');
      writeFileSync(join(OUT, 't02ar-browser-exported.json'), text);
      check('下载文件能重新打开', await evaluate(
        'RA.editor.openJSONText(' + JSON.stringify(text) + ', "reopen.json")') === true);
    }

    // ---- A2:缺 entry 的结构错误导入,零替换 ----
    const bad = JSON.parse(demoText);
    bad.id = 'bad_ports';
    bad.contentHash = null;
    bad.ports = { profile: 'vertical-v1' };
    const beforeA2 = await evaluate(`(function(){
      return { id: RA.editor.model.id, title: RA.editor.model.title,
        undo: RA.editor.undoStack.length, dirty: RA.editor.dirty,
        view: { x: RA.editor.view.x, y: RA.editor.view.y, zoom: RA.editor.view.zoom },
        json: JSON.stringify(RA.editor.model.toData()) };
    })()`);
    const a2 = await evaluate(`(function(){
      try {
        var r = RA.editor.openJSONText(${JSON.stringify(JSON.stringify(bad))}, 'bad-ports.json');
        return { returned: r, status: document.getElementById('status').textContent };
      } catch (e) { return { thrown: String(e && e.message) }; }
    })()`);
    const afterA2 = await evaluate(`(function(){
      return { id: RA.editor.model.id, title: RA.editor.model.title,
        undo: RA.editor.undoStack.length, dirty: RA.editor.dirty,
        view: { x: RA.editor.view.x, y: RA.editor.view.y, zoom: RA.editor.view.zoom },
        json: JSON.stringify(RA.editor.model.toData()) };
    })()`);
    check('坏接口导入返回 false 且不抛异常', a2.returned === false && !a2.thrown,
      a2.thrown || '');
    check('坏接口导入后当前图 / 历史 / dirty / 视角完全不变',
      afterA2.json === beforeA2.json && afterA2.id === beforeA2.id &&
      afterA2.undo === beforeA2.undo && afterA2.dirty === beforeA2.dirty &&
      afterA2.view.x === beforeA2.view.x && afterA2.view.y === beforeA2.view.y &&
      afterA2.view.zoom === beforeA2.view.zoom);
    check('坏接口错误提示含 INVALID_PORT 与路径', /INVALID_PORT/.test(a2.status) &&
      /\/ports/.test(a2.status), a2.status);
    await shot('t02ar-browser-bad-import.png');

    // ---- A1:机关画笔同格按住约 1 秒 ----
    await evaluate('RA.editor.selectChar("S"); RA.editor.setTool("brush"); RA.editor.setBrush(1);');
    const s1 = await cellToScreen(1, 1);
    await mouse('mouseMoved', s1.x, s1.y);
    await mouse('mousePressed', s1.x, s1.y, 'left', 1);
    await sleep(1200);                        // 真实时间里持续按住
    await mouse('mouseReleased', s1.x, s1.y, 'left', 0);
    await sleep(150);
    const a1 = await evaluate(`(function(){
      var at = RA.editor.model.objects.filter(function(o){ return o.col === 1 && o.row === 1; });
      return { at: at.length, types: at.map(function(o){ return o.type; }) };
    })()`);
    check('真实按住 S 约 1 秒后同格只有一个弹簧',
      a1.at === 1 && a1.types[0] === 'spring', JSON.stringify(a1));
    check('按键拖动仍只占一步撤销',
      await evaluate('RA.editor.undoStack.length') >= 1);

    // ---- A3:缩图接口确认 / 保真备份 / 撤销 ----
    await evaluate(`(function(){
      var m = RA.EditorModel.create({ cols: 20, rows: 12, title: 'resize-ports' });
      m.data.ports = { profile: 'vertical-v1', entry: { col: 10 }, exit: { col: 10 } };
      RA.editor.replaceModel(m);
      RA.editor.pushUndo();
      RA.editor.dirty = true;
      window.__raConfirm = window.confirm;
    })()`);
    const a3cancel = await evaluate(`(function(){
      var before = JSON.stringify(RA.editor.model.toData());
      var history = RA.editor.undoStack.length;
      window.confirm = function(){ return false; };
      var ok = RA.editor.changeSize(8, 12);
      var now = JSON.stringify(RA.editor.model.toData());
      return { ok: ok, same: now === before, history: RA.editor.undoStack.length === history,
        ports: RA.editor.model.data.ports };
    })()`);
    check('浏览器里取消缩图:零变更、端口不动',
      a3cancel.ok === false && a3cancel.same === true && a3cancel.history === true &&
      a3cancel.ports && a3cancel.ports.entry.col === 10, JSON.stringify(a3cancel.ports));
    const a3ok = await evaluate(`(function(){
      window.confirm = function(){ return true; };
      var ok = RA.editor.changeSize(8, 12);
      return { ok: ok, cols: RA.editor.model.cols, ports: RA.editor.model.data.ports,
        retired: RA.editor.model.data.extensions.retiredPorts || [] };
    })()`);
    check('浏览器里确认缩图:ports 置空、原接口完整退休',
      a3ok.ok === true && a3ok.cols === 8 && a3ok.ports === null &&
      a3ok.retired.length === 1 && a3ok.retired[0].ports.entry.col === 10 &&
      a3ok.retired[0].before.cols === 20, JSON.stringify(a3ok.retired[0] || null));
    await shot('t02ar-browser-resize.png');
    const a3undo = await evaluate(`(function(){
      document.getElementById('btn-undo').click();
      var p = RA.editor.model.data.ports;
      var r = RA.editor.model.data.extensions.retiredPorts;
      return { ports: p, retired: r || [] };
    })()`);
    check('浏览器里撤销缩图:接口还原、退役记录移除',
      a3undo.ports && a3undo.ports.entry.col === 10 && a3undo.ports.exit.col === 10 &&
      a3undo.retired.length === 0);

    check('页面仍然没有旧 TXT / 保存到游戏入口',
      await evaluate('!document.getElementById("btn-download") && ' +
        '!document.getElementById("btn-save-folder") && ' +
        '!document.getElementById("chk-autosave")'));

    const evidence = {
      date: new Date().toISOString(),
      browser: version.Browser,
      executable: browser.exe,
      protocolVersion: version['Protocol-Version'],
      userAgent: await evaluate('navigator.userAgent'),
      url: EDITOR_URL,
      durationMs: Date.now() - t0,
      pass, fail, results,
      screenshots: [
        'docs/checks/t02ar-browser-import.png',
        'docs/checks/t02ar-browser-bad-import.png',
        'docs/checks/t02ar-browser-resize.png'
      ],
      exportedJson: 'docs/checks/t02ar-browser-exported.json'
    };
    writeFileSync(join(OUT, 'browser-t02a-r-2026-11-01.json'),
      JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    ws.close();
    killTree(browser.child);
    await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
    try { rmSync(browser.downloads, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  }
  console.log('\nT02A-R 浏览器验收:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' +
    ((Date.now() - t0) / 1000).toFixed(1) + 's');
  return fail ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('T02A-R 浏览器验收失败:' + (e && e.message));
  process.exit(1);
});
