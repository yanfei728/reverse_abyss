#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * browser_t02a.mjs —— T02A 的真实浏览器验收(Chrome headless + DevTools 协议)
 * ========================================================================
 *     node tools/browser_t02a.mjs
 *
 * 为什么要这个脚本:替身测试证明不了真实画布、真实鼠标事件和浏览器下载。
 * 这里启动本机 Chrome 的 headless 模式,打开 editor.html(file://),然后用
 * DevTools 协议做真实交互:
 *   ① 打开演示 JSON(走页面自己的 openJSONText,和文件选择后的处理同一条路径);
 *   ② 在画布上按住左键画一格、再拖一段;
 *   ③ 点「撤销」「重做」按钮,核对模型真的回去/回来;
 *   ④ 滚轮缩放、右键拖动平移,核对 view 变化;
 *   ⑤ 点「导出 JSON」,接收真实下载文件,再把它重新打开;
 *   ⑥ 截图保存到 docs/checks/。
 *
 * 不替代的东西:真实用户手感、文件选择对话框、安卓真机。文件对话框无法在
 * headless 里弹出,所以“打开文件”这一步用页面同一条 JSON 处理函数验证,
 * 演示 JSON 的字节来自真实下载结果。浏览器版本与结果写进 JSON 证据。
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
const EDITOR_URL = 'file:///' + join(ROOT, 'editor.html').replace(/\\/g, '/');
const DEMO = join(ROOT, 'levels/demo/t02a-demo.json');
const OUT_DIR = join(ROOT, 'docs/checks');
const t0 = Date.now();

const results = [];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  const rec = { name, ok: !!cond, extra: extra === undefined ? '' : String(extra) };
  results.push(rec);
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}

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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
    ws.onerror = (e) => reject(new Error('WebSocket 连接失败'));
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

async function main() {
  if (!existsSync(CHROME)) {
    console.error('找不到 Chrome:' + CHROME + ';本机无法做真实浏览器验收。');
    return 2;
  }
  const profile = mkdtempSync(join(tmpdir(), 'ra-t02a-chrome-'));
  const downloads = mkdtempSync(join(tmpdir(), 'ra-t02a-download-'));
  const port = await freePort();
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1440,900',
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + port,
    EDITOR_URL
  ];
  const child = spawn(CHROME, args, { stdio: 'ignore', windowsHide: true });
  let ws = null;
  try {
    // 等 DevTools 端口起来
    let version = null;
    for (let i = 0; i < 100 && !version; i++) {
      try { version = await fetchJson('http://127.0.0.1:' + port + '/json/version'); }
      catch (e) { await sleep(100); }
    }
    if (!version) throw new Error('Chrome DevTools 端口没有起来');
    check('本机 Chrome 已启动(headless)', true, version.Browser);

    let target = null;
    for (let i = 0; i < 50 && !target; i++) {
      const list = await fetchJson('http://127.0.0.1:' + port + '/json/list');
      target = list.find((t) => t.type === 'page' && t.url.indexOf('editor.html') >= 0);
      if (!target) await sleep(100);
    }
    if (!target) throw new Error('找不到 editor.html 页面目标');
    ws = await connect(target.webSocketDebuggerUrl);
    const send = ws.send;
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Browser.setDownloadBehavior', {
      behavior: 'allow', downloadPath: downloads, eventsEnabled: true
    });

    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true
      });
      if (r.exceptionDetails) {
        throw new Error('页面脚本异常:' + (r.exceptionDetails.text || '') + ' ' +
          (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
      }
      return r.result ? r.result.value : undefined;
    }
    async function waitFor(expression, timeoutMs) {
      const end = Date.now() + (timeoutMs || 10000);
      while (Date.now() < end) {
        try { if (await evaluate(expression)) return true; } catch (e) { /* 页面还在加载 */ }
        await sleep(100);
      }
      return false;
    }

    check('editor.html 在真实浏览器里加载完成(RA_EDITOR_READY)',
      await waitFor('!!window.RA_EDITOR_READY && !!window.RA && !!RA.editor', 15000));
    check('编辑器在浏览器里拿到了 canvas 和模型',
      await evaluate('!!document.getElementById("board") && RA.editor.model.cols > 0'),
      await evaluate('RA.editor.model.cols + "×" + RA.editor.model.rows'));

    // ---- ① 打开演示 JSON(与文件选择后的处理同一条路径) ----
    const demoText = readFileSync(DEMO, 'utf8');
    const opened = await evaluate(
      'RA.editor.openJSONText(' + JSON.stringify(demoText) + ', "t02a-demo.json")');
    check('真实页面打开演示 JSON', opened === true);
    check('打开后 id / 难度 / 对象数 / 路线数正确',
      await evaluate('RA.editor.model.id === "t02a_demo" && RA.editor.model.difficulty === 3 && ' +
        'RA.editor.model.objects.length === 3 && RA.editor.model.paths.length === 1'),
      await evaluate('RA.editor.model.id + " 难度" + RA.editor.model.difficulty'));

    // 截图①:导入后的编辑器全貌
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 't02a-browser-import.png'), Buffer.from(shot.data, 'base64'));

    // ---- ② 真实鼠标:在画布上画一格 + 拖一段 ----
    async function cellToScreen(c, r) {
      return evaluate(`(function(){
        var p = RA.editor.cellToScreen(${c}, ${r});
        p.x += RA.C.TS * RA.editor.view.zoom / 2;
        p.y += RA.C.TS * RA.editor.view.zoom / 2;
        var cv = document.getElementById('board');
        var b = cv.getBoundingClientRect();
        return { x: b.left + p.x * b.width / cv.width,
                 y: b.top + p.y * b.height / cv.height };
      })()`);
    }
    async function mouse(type, x, y, button, buttonsMask) {
      await send('Input.dispatchMouseEvent', {
        type, x, y, button: button || 'none', buttons: buttonsMask || 0, clickCount: 1
      });
      await sleep(60);
    }
    // 换到画笔 + 草地块
    await evaluate('RA.editor.setTool("brush"); RA.editor.selectChar("^"); RA.editor.setBrush(1);');
    const p1 = await cellToScreen(2, 4);
    await mouse('mouseMoved', p1.x, p1.y);
    await mouse('mousePressed', p1.x, p1.y, 'left', 1);
    await mouse('mouseReleased', p1.x, p1.y, 'left', 0);
    await sleep(120);
    const painted = await evaluate('RA.editor.model.getTile(2, 4)');
    check('真实鼠标点击在画布上画出一格', painted === 1, 'tile=' + painted);

    const p2 = await cellToScreen(5, 4);
    await mouse('mouseMoved', p1.x, p1.y);
    await mouse('mousePressed', p1.x, p1.y, 'left', 1);
    for (let c = 3; c <= 5; c++) {
      const p = await cellToScreen(c, 4);
      await mouse('mouseMoved', p.x, p.y, 'left', 1);
    }
    await mouse('mouseReleased', p2.x, p2.y, 'left', 0);
    await sleep(150);
    const lineOk = await evaluate(
      '[2,3,4,5].every(function(c){ return RA.editor.model.getTile(c,4) === 1; })');
    check('真实鼠标拖动画出连续一段', lineOk === true);

    // ---- ③ 撤销 / 重做按钮 ----
    await evaluate('document.getElementById("btn-undo").click()');
    await sleep(100);
    // 第一笔(单点)在快照里,撤销第二笔后它应该还在;(3,4)~(5,4) 是第二笔
    const undone = await evaluate(
      'RA.editor.model.getTile(5,4) === 0 && RA.editor.model.getTile(3,4) === 0 && ' +
      'RA.editor.model.getTile(2,4) === 1');
    check('点「撤销」只收回拖动画的第二笔', undone === true);
    await evaluate('document.getElementById("btn-redo").click()');
    await sleep(100);
    const redone = await evaluate(
      'RA.editor.model.getTile(2,4) === 1 && RA.editor.model.getTile(5,4) === 1');
    check('点「重做」又回来', redone === true);

    // ---- ④ 滚轮缩放 + 右键拖动平移 ----
    const z0 = await evaluate('RA.editor.view.zoom');
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: p1.x, y: p1.y, deltaX: 0, deltaY: -240, button: 'none', buttons: 0
    });
    await sleep(150);
    const z1 = await evaluate('RA.editor.view.zoom');
    check('真实滚轮事件改变了缩放', z1 > z0, z0.toFixed(3) + ' → ' + z1.toFixed(3));

    const vx0 = await evaluate('RA.editor.view.x');
    await mouse('mouseMoved', 700, 500);
    await mouse('mousePressed', 700, 500, 'right', 2);
    await mouse('mouseMoved', 760, 530, 'right', 2);
    await mouse('mouseReleased', 760, 530, 'right', 0);
    await sleep(120);
    const vx1 = await evaluate('RA.editor.view.x');
    check('真实右键拖动平移了视角', Math.abs(vx1 - vx0) > 1,
      vx0.toFixed(1) + ' → ' + vx1.toFixed(1));

    // 截图②:画完 / 缩放后的画布
    shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, 't02a-browser-draw.png'), Buffer.from(shot.data, 'base64'));

    // ---- ⑤ 导出 JSON:真实浏览器下载 ----
    await evaluate('document.getElementById("btn-export").click()');
    let downloaded = null;
    for (let i = 0; i < 60 && !downloaded; i++) {
      const files = readdirSync(downloads).filter((f) => f.endsWith('.json'));
      if (files.length) downloaded = join(downloads, files[0]);
      else await sleep(100);
    }
    check('点「导出 JSON」真的产生了浏览器下载文件', !!downloaded,
      downloaded ? downloaded.split('\\').pop() : '没等到文件');
    if (downloaded) {
      const text = readFileSync(downloaded, 'utf8');
      const data = JSON.parse(text);
      check('下载文件是完整 LevelData(不是 TXT)',
        data.schemaVersion === 2 && data.terrain && data.objects.length === 3 &&
        data.paths.length === 1, data.id + ' / ' + text.length + ' 字节');
      check('下载文件保留了未知对象字段与路线',
        data.objects.some((o) => o.type === 'future_enemy' &&
          o.behavior && o.behavior.keep === 'author-data') &&
        data.paths[0].label === '往返巡逻');
      check('页面提示是“已发起导出”,没有声称写进 levels/',
        (await evaluate('document.getElementById("status").textContent')).indexOf('已发起导出') >= 0);
      writeFileSync(join(OUT_DIR, 't02a-browser-exported.json'), text);
      // ---- ⑥ 重新打开刚下载的文件 ----
      const reopened = await evaluate(
        'RA.editor.openJSONText(' + JSON.stringify(text) + ', "browser-exported.json")');
      check('真实下载的文件能在页面里重新打开', reopened === true);
      check('重开后内容仍在(对象 / 路线 / 未知字段)',
        await evaluate('RA.editor.model.objects.length === 3 && ' +
          'RA.editor.model.paths[0].label === "往返巡逻" && ' +
          'RA.editor.model.data.certification === null'));

      // 截图③:重新打开后的页面
      shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT_DIR, 't02a-browser-reopen.png'), Buffer.from(shot.data, 'base64'));
    }

    check('页面里没有旧的 TXT 出口 / 保存到游戏按钮',
      await evaluate('!document.getElementById("btn-download") && ' +
        '!document.getElementById("btn-save-folder") && ' +
        '!document.getElementById("chk-autosave")'));

    const versionInfo = version;
    const evidence = {
      date: new Date().toISOString(),
      browser: versionInfo.Browser,
      protocolVersion: versionInfo['Protocol-Version'],
      userAgent: await evaluate('navigator.userAgent'),
      url: EDITOR_URL,
      durationMs: Date.now() - t0,
      pass, fail,
      results,
      screenshots: [
        'docs/checks/t02a-browser-import.png',
        'docs/checks/t02a-browser-draw.png',
        'docs/checks/t02a-browser-reopen.png'
      ],
      exportedJson: 'docs/checks/t02a-browser-exported.json'
    };
    writeFileSync(join(OUT_DIR, 'browser-t02a-2026-10-31.json'),
      JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    if (ws) ws.close();
    try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); }
    catch (e) { try { child.kill(); } catch (e2) { /* 已退出 */ } }
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome 还没退干净 */ }
    try { rmSync(downloads, { recursive: true, force: true }); } catch (e) { /* 同上 */ }
  }
  console.log('\n浏览器验收:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' +
    ((Date.now() - t0) / 1000).toFixed(1) + 's');
  return fail ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('浏览器验收失败:' + (e && e.message));
  process.exit(1);
});
