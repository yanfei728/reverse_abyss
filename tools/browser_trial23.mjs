#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * browser_trial23.mjs —— 23号卡:真实 Chrome 打开编辑器→试玩页的单图试玩检查
 * ======================================================================
 *     node tools/browser_trial23.mjs
 *
 * 做的是**真实浏览器页面 + 真实键盘事件**:
 *   编辑器打开测试图 →「试玩」→ trial.html 启动 → 走位/二段跳 → 扣血/血条 →
 *   K 清火球 → P/Esc 暂停继续 → 另起一张可到终点的图真实上穿 finish → 回编辑器显式发布
 *   → short.html 正式池抽塔加载。
 * 不伪造用户地图的 passed:测试图只存在于这次临时浏览器的 IndexedDB 里(user-data-dir 是临时目录),
 * 也不写 levels/。这是脚本化屏幕验证,不是人工试玩记录。
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

/**
 * 测试图层(只在这台临时浏览器里)。最底行是地面;start 云板第 8 行。
 * start 云板上叠了一个火球 → 旧 play 门槛(起点净空/两侧实心)本来会拒绝这张图,
 * 现在仍能试玩/通过/发布,正好证明几何门槛不再否决人工通过。
 */
function makeMap(id, finishRow) {
  const cols = 12, rows = 10;
  const tiles = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) tiles[rows - 1][c] = 1;
  [8, finishRow].forEach((row) => { tiles[row][5] = 5; tiles[row][6] = 5; });
  return {
    schemaVersion: 2, id: id, title: id, kind: 'normal', difficulty: 1,
    size: { cols, rows }, terrain: { tiles }, spawn: null,
    ports: { profile: 'cloud-pipe-v2', start: { col: 5, row: 8 }, finish: { col: 5, row: finishRow } },
    objects: [{
      id: 'check_fireball', type: 'fireball_static', col: 5, row: 7,
      params: { radiusTiles: 0.5, damage: 20 }
    }],
    paths: [],
    visuals: { backgroundId: 'sky1', decorations: [] },
    extensions: { note: '23号卡真实浏览器屏幕检查用图;只写进临时浏览器存储' },
    contentHash: null, certification: null
  };
}
const MAP = makeMap('trial_browser_check', 0);        // finish 在最高行,脚本跳不上去 → 不干扰输入/暂停检查
const PASS_MAP = makeMap('trial_browser_check_pass', 3); // 二段跳够得着 finish → 真实通过

async function main() {
  const exes = [process.env.RA_BROWSER, CHROME, EDGE].filter(Boolean).filter((p) => existsSync(p));
  if (!exes.length) { console.error('找不到 Chrome/Edge'); return 2; }
  let browser = null, last = null;
  for (const exe of exes) {
    const profile = mkdtempSync(join(tmpdir(), 'ra-trial23-chrome-'));
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
  const shortUrl = 'file:///' + join(ROOT, 'short.html').replace(/\\/g, '/');
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
      await sleep(30);
      await key('keyUp', code, keyName, vk);
    }
    async function shot(name) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
    }
    const info = () => evaluate('document.getElementById("trial-info").textContent');
    const snap = () => evaluate('(function(){var s=RA.trial&&RA.trial.session;return s?s.snapshot():null;})()');
    async function openEditorMap(map) {
      await send('Page.navigate', { url: editorUrl });
      await sleep(500);
      const loaded = await waitFor('!!RA.editor && !!RA.editor.model', 15000);
      if (!loaded) return false;
      return await evaluate('RA.editor.openJSONText(' + JSON.stringify(JSON.stringify(map)) + ', ' + JSON.stringify(map.id + '.json') + ')') === true;
    }
    async function startTrialFromEditor() {
      await evaluate('document.getElementById("btn-play").click()');
      return await waitFor('location.pathname.indexOf("trial.html") >= 0 && !!RA.trial && !!RA.trial.session', 15000);
    }

    check('Chrome 已启动', true, browser.version.Browser + ' headless');
    check('编辑器页面加载', await waitFor('!!RA.editor && !!RA.editor.model', 15000));
    const storage = await evaluate('RA.editor.repo && RA.editor.repo.storage');
    check('临时浏览器草稿库可用', ['indexedDB', 'memory'].indexOf(storage) >= 0, storage);

    // ---------------- 第一张图:启动/走跳/扣血/K/暂停 ----------------
    check('打开当前图(走共用 JSON 解码)', await openEditorMap(MAP));
    check('这张图旧 play 门槛本来会拒绝(起点净空/两侧实心),只读检查能过',
      await evaluate('RA.LevelData.errorsOf(RA.LevelData.validate(JSON.parse(' + JSON.stringify(JSON.stringify(MAP)) + '), {purpose:"play"})).length > 0') === true &&
      await evaluate('RA.TrialSession.readableIssues(JSON.parse(' + JSON.stringify(JSON.stringify(MAP)) + ')).length === 0') === true);
    check('点「试玩」进入单图试玩页', await startTrialFromEditor(), await evaluate('location.href'));
    const plan = await evaluate('({draftId:RA.trial.plan.draftRef.draftId, revision:RA.trial.plan.draftRef.revision, profile:RA.trial.plan.profileId})');
    check('试玩页确实跑起来了:有 RA.ActionInput、开始走帧、无启动错误',
      await evaluate('typeof RA.ActionInput === "function"') &&
      await waitFor('RA.trial.session.time > 0', 3000) &&
      await evaluate('document.getElementById("dev-error").style.display !== "block"'));
    check('加载提示已被真实状态替换(不是一直"正在启动")',
      (await info()).indexOf('运行中') >= 0 && (await info()).indexOf('正在启动') < 0, await info());
    check('试玩用普通游玩初态:profile=run-v1、满血、K 开局就绪',
      plan.profile === 'run-v1' &&
      (await evaluate('RA.trial.session.snapshot().maxHp')) === 100 &&
      (await evaluate('RA.trial.session.snapshot().haloCooldownRemaining')) === 0 &&
      (await info()).indexOf('光环就绪') >= 0);
    check('只有当前这一张图:没有 World/换层/上下关',
      await evaluate('RA.trial.session.inst.world === null && RA.trial.session.plan.spawn.row === 8 && RA.trial.session.plan.finish.row === 0'));
    await shot('trial23-browser-start.png');

    // 扣血 + 血条(等会话真的进了一步,不靠固定 sleep 猜帧率)
    await waitFor('RA.trial.session.snapshot().hp < 100', 3000);
    const hurt = await snap();
    const bar = await evaluate('parseFloat(document.getElementById("hp-fill").style.width)');
    check('起点上方叠的火球真实扣血、血条同步', hurt.hp < 100 && Math.abs(bar - hurt.hp / hurt.maxHp * 100) < 0.6,
      'hp=' + hurt.hp + ' bar=' + bar.toFixed(1) + '%');

    // K 清火球(站在起点附近施放,范围要真的覆盖到那个火球)
    await tap('KeyK', 'k', 75);
    await waitFor('(function(){var s=RA.trial.session;var fb=s.inst.objects.filter(function(o){return o.type==="fireball_static";})[0];' +
      'return !!fb && fb.alive === false;})()', 3000);
    const skill = await evaluate('(function(){var s=RA.trial.session;var fb=s.inst.objects.filter(function(o){return o.type==="fireball_static";})[0];' +
      'return {active:s.snapshot().haloActiveRemaining, cd:s.snapshot().haloCooldownRemaining, alive:fb?fb.alive:null, hud:document.getElementById("trial-info").textContent};})()');
    check('开局按 K 立刻施放光环(14 秒活动/20 秒冷却)', skill.active > 13 && skill.cd > 19,
      'active=' + skill.active + ' cd=' + skill.cd);
    check('范围内火球被光环清除(不再画成活物)', skill.alive === false);
    check('HUD 显示光环活动', skill.hud.indexOf('光环活动') >= 0, skill.hud);
    await shot('trial23-browser-skill.png');

    // 走位(真实键盘)
    const x0 = await evaluate('RA.trial.session.player.x');
    await key('rawKeyDown', 'KeyD', 'd', 68);
    await waitFor('RA.trial.session.player.x > ' + (x0 + 1), 1500);
    await key('keyUp', 'KeyD', 'd', 68);
    const x1 = await evaluate('RA.trial.session.player.x');
    check('按 D 真的往右走', x1 > x0 + 1, x0.toFixed(1) + ' -> ' + x1.toFixed(1));
    const xa = await evaluate('RA.trial.session.player.x');
    await key('rawKeyDown', 'ArrowLeft', 'ArrowLeft', 37);
    await waitFor('RA.trial.session.player.x < ' + (xa - 1), 1500);
    await key('keyUp', 'ArrowLeft', 'ArrowLeft', 37);
    check('按 ← 真的往左走', (await evaluate('RA.trial.session.player.x')) < xa - 1);

    // 跳跃 + 二段跳(真实按住 Space)
    const feet0 = await evaluate('RA.trial.session.player.feet');
    await key('rawKeyDown', 'Space', ' ', 32);
    await waitFor('RA.trial.session.player.feet < ' + (feet0 - 20), 2000);
    const feet1 = await evaluate('RA.trial.session.player.feet');
    const jumps1 = await evaluate('RA.trial.session.player.jumpsUsed');
    await key('keyUp', 'Space', ' ', 32);
    check('按住 Space 会起跳(jumpHeld 接对)', feet1 < feet0 - 20 && jumps1 === 1,
      feet0.toFixed(1) + ' -> ' + feet1.toFixed(1) + ' jumps=' + jumps1);
    await sleep(60);
    await key('rawKeyDown', 'Space', ' ', 32);
    const doubleJumped = await waitFor('RA.trial.session.player.jumpsUsed === 2', 1500);
    const jumps2 = await evaluate('RA.trial.session.player.jumpsUsed');
    await key('keyUp', 'Space', ' ', 32);
    check('松手后再按 Space 能二段跳', doubleJumped && jumps2 === 2, 'jumps=' + jumps2);

    // 暂停 / 继续(真实 P,再 P;再 Esc/按钮)
    await tap('KeyP', 'p', 80);
    await waitFor('RA.trial.session.status === "paused"', 2000);
    check('按 P 暂停,遮罩出现', await evaluate('RA.trial.session.status === "paused"') &&
      await evaluate('document.getElementById("pause-overlay").style.display === "flex"'));
    await shot('trial23-browser-paused.png');
    const pt = await evaluate('RA.trial.session.time');
    await sleep(450);
    check('暂停期间时间冻结', await evaluate('RA.trial.session.time') === pt);
    await tap('KeyP', 'p', 80);
    await waitFor('RA.trial.session.status === "running"', 2000);
    check('再按 P 能继续(不是永久卡住)', await evaluate('RA.trial.session.status === "running"') &&
      await evaluate('document.getElementById("pause-overlay").style.display === "none"'));
    await tap('Escape', 'Escape', 27);
    await waitFor('RA.trial.session.status === "paused"', 2000);
    check('Esc 也能暂停', await evaluate('RA.trial.session.status === "paused"'));
    await evaluate('document.getElementById("btn-resume").click()');
    await waitFor('RA.trial.session.status === "running"', 2000);
    check('「继续」按钮恢复运行', await evaluate('RA.trial.session.status === "running"'));
    await shot('trial23-browser-paused-resumed.png');
    check('这张图的终点不可达,输入/暂停检查期间没有被误判通过',
      await evaluate('RA.trial.session.status === "running"'));

    // ---------------- 第二张图:真实上穿 finish → 通过记录 → 显式发布 ----------------
    check('打开可到终点的第二张图', await openEditorMap(PASS_MAP));
    check('第二张图旧 play 门槛本来也会拒绝',
      await evaluate('RA.LevelData.errorsOf(RA.LevelData.validate(JSON.parse(' + JSON.stringify(JSON.stringify(PASS_MAP)) + '), {purpose:"play"})).length > 0') === true);
    check('再次进入试玩页', await startTrialFromEditor() && await waitFor('RA.trial.session.time > 0', 3000));
    const passPlan = await evaluate('({draftId:RA.trial.plan.draftRef.draftId, revision:RA.trial.plan.draftRef.revision})');
    // 真实二段跳:按住 → 松手 → 再按住(与 Player 的二段跳规则一致,不改物理参数)
    await key('rawKeyDown', 'Space', ' ', 32);
    await sleep(240);
    await key('keyUp', 'Space', ' ', 32);
    await sleep(90);
    await key('rawKeyDown', 'Space', ' ', 32);
    const passed = await waitFor('RA.trial.session.status === "passed"', 6000);
    await key('keyUp', 'Space', ' ', 32);
    check('真实按 Space 从 start 完整上穿 finish 一次通过', passed,
      'status=' + (await evaluate('RA.trial.session.status')) + ' feet=' + (await evaluate('RA.trial.session.player.feet')));
    check('通过后结束遮罩与文字正确', await waitFor('getComputedStyle(document.getElementById("done-overlay")).display === "flex"', 2000) &&
      (await evaluate('document.querySelector("#done-overlay h2").textContent')).indexOf('通过') >= 0);
    check('通过记录写回草稿(绑定当前内容 hash)',
      await waitFor('document.getElementById("dev-status").textContent.indexOf("已写入草稿") >= 0', 4000),
      await evaluate('document.getElementById("dev-status").textContent'));
    const tBefore = await evaluate('RA.trial.session.time');
    await sleep(400);
    check('通过后冻结:时间不再走、不进入别的图', await evaluate('RA.trial.session.time') === tBefore &&
      await evaluate('RA.trial.session.inst.world === null'));
    await shot('trial23-browser-pass.png');
    const saved = await evaluate('(async function(){var repo=RA.ContentRepository.create();' +
      'var d=await repo.loadDraft(' + JSON.stringify(passPlan.draftId) + ');var c=d.ok&&d.value&&d.value.data.certification;' +
      'return c?{profile:c.profileId,status:c.status,hash:c.contentHash}:null;})()');
    check('草稿里的通过记录是 run-v1 / passed / 当前内容 hash',
      !!saved && saved.profile === 'run-v1' && saved.status === 'passed' &&
      saved.hash === (await evaluate('RA.LevelData.hashSync(RA.trial.plan.template)')), JSON.stringify(saved));

    // 回编辑器,用户明确点「发布」才入池
    await send('Page.navigate', { url: editorUrl });
    await sleep(600);
    check('回到编辑器', await waitFor('!!RA.editor && !!RA.editor.model', 15000));
    const opened = await evaluate('RA.editor.openDraftById(' + JSON.stringify(passPlan.draftId) + ')');
    check('能重新打开刚通过的那份草稿,带通过记录', opened === true &&
      await evaluate('RA.editor.model.data.certification && RA.editor.model.data.certification.profileId') === 'run-v1');
    check('显式「发布」成功(旧几何规则不再否决)', (await evaluate('RA.editor.publishCurrent()')) === true &&
      (await evaluate('document.getElementById("publish-status") ? document.getElementById("publish-status").textContent : ""')).indexOf('已发布') >= 0);
    const pool = await evaluate('(async function(){var r=await RA.editor.repo.listEligible({difficulty:1});' +
      'return r.ok?r.value.map(function(v){return v.levelId;}):null;})()');
    check('正式池里出现这张人工通过图', Array.isArray(pool) && pool.indexOf(PASS_MAP.id) >= 0, JSON.stringify(pool));
    await shot('trial23-browser-editor-published.png');

    // 正式加载:short.html 正式池抽塔
    await send('Page.navigate', { url: shortUrl });
    await sleep(700);
    check('短塔页面加载', await waitFor('!!RA.short && !!RA.short.repo', 15000));
    await evaluate('document.getElementById("btn-formal").click()');
    const formalStart = await waitFor('!!RA.short.state.session', 8000);
    check('正式短塔能用这张图启动(正式加载不看旧几何门槛)', formalStart,
      await evaluate('document.getElementById("menu-status").textContent'));
    if (formalStart) {
      const floors = await evaluate('RA.short.state.session.manifest.floors.map(function(f){return f.levelId;})');
      check('抽到的塔里包含刚发布的图', Array.isArray(floors) && floors.indexOf(PASS_MAP.id) >= 0, JSON.stringify(floors));
      await sleep(300);
      await shot('trial23-browser-formal-load.png');
    }

    // 启动异常必须显示具体错误(用坏数据复现,不改运行代码)
    const badHandoff = {
      version: 3, kind: 'editor-validation', profileId: 'run-v1',
      template: Object.assign({}, MAP, { objects: [{ id: 'x', type: 'future_enemy', col: 1, row: 1, params: {} }] }),
      subjectRef: { levelId: MAP.id, contentHash: null }, draftRef: { draftId: MAP.id, revision: 1 },
      rules: { rulesVersion: 'x', rulesFingerprint: 'x' }, requestId: 'bad'
    };
    await evaluate('sessionStorage.setItem("RA_TRIAL_V3", ' + JSON.stringify(JSON.stringify(badHandoff)) + ')');
    await send('Page.navigate', { url: trialUrl });
    await sleep(600);
    const badState = await evaluate('(function(){var b=document.getElementById("dev-error");return {shown:b.style.display,text:b.textContent,' +
      'info:document.getElementById("trial-info").textContent,hasEditorLink:b.innerHTML.indexOf("editor.html")>=0,trial:!!RA.trial};})()');
    check('坏数据启动:显示具体错误和回编辑器入口,不留在加载提示',
      badState.shown === 'block' && /未注册|future_enemy/.test(badState.text) &&
      badState.info.indexOf('正在启动') < 0 && badState.hasEditorLink && badState.trial === false,
      JSON.stringify(badState));
    await shot('trial23-browser-startup-error.png');

    const evidence = {
      date: new Date().toISOString(), card: '23号卡', browser: browser.version.Browser,
      executable: browser.exe, durationMs: Date.now() - t0, pass, fail, results,
      screenshots: ['docs/checks/trial23-browser-start.png', 'docs/checks/trial23-browser-skill.png',
        'docs/checks/trial23-browser-paused.png', 'docs/checks/trial23-browser-paused-resumed.png',
        'docs/checks/trial23-browser-pass.png',
        'docs/checks/trial23-browser-editor-published.png', 'docs/checks/trial23-browser-formal-load.png',
        'docs/checks/trial23-browser-startup-error.png'],
      note: '真实 Chrome + 真实键盘事件的脚本化屏幕检查,不是人工试玩记录;测试图只写进本次临时浏览器的 IndexedDB,没有写 levels/,也没有给用户地图伪造 passed。'
    };
    writeFileSync(join(OUT, 'browser-trial23-2026-11-08.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  } finally {
    browser.ws.close(); killTree(browser.child); await sleep(300);
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  console.log('\n23号卡浏览器检查:' + pass + ' PASS / ' + fail + ' FAIL   用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  return fail ? 1 : 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error('23号卡浏览器检查失败:' + (e && e.message)); process.exit(1); });
