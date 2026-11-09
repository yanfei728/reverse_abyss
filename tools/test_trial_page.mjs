#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_trial_page.mjs —— 试玩页接线回归(23号卡)
 * =============================================
 * 按 trial.html 里**真实的 script 顺序**把页面脚本跑起来,验证:
 *   · 输入模块真的被加载(ActionInput 存在,不再 new 时报错停在启动提示)
 *   · 按住的 Space/W/↑ 真的变成 jumpHeld(不再是 held.jump)、能起跳、松手后能二段跳
 *   · P/Esc 第二次按下能继续(暂停边沿不在 running 分支里)
 *   · 启动异常显示具体错误与返回编辑器,不会一直停在"正在启动"
 * 这是 Node 的 DOM/Canvas 替身,不是屏幕验收,也不能当人工通关记录。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { loadEditor, ROOT, makeCanvas } from './loader.mjs';

loadEditor(); // 装 DOM/Canvas 替身(Node 里没有真屏幕)
const origGet = globalThis.document.getElementById.bind(globalThis.document);
const EL = globalThis.__RA_EL_BY_ID__;
const canvas = makeCanvas(960, 540);
globalThis.document.getElementById = (id) => (id === 'dev-canvas' ? canvas : origGet(id));

globalThis.RA = {};
const HTML = readFileSync(join(ROOT, 'trial.html'), 'utf8');
const SCRIPTS = [...HTML.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map((m) => m[1]);
const TS = 45;

function level(startRow, finishRow) {
  const cols = 12, rows = 10;
  const tiles = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) tiles[rows - 1][c] = 1;      // 地面:走位测试不会掉出地图
  [startRow, finishRow].forEach((row) => {
    tiles[row][5] = 5; tiles[row][6] = 5;                      // 2×1 云板端点
  });
  return {
    schemaVersion: 2, id: 'trial_page', title: 'page-check', kind: 'normal', difficulty: 1,
    size: { cols, rows }, terrain: { tiles }, spawn: null,
    ports: { profile: 'cloud-pipe-v2', start: { col: 5, row: startRow }, finish: { col: 5, row: finishRow } },
    objects: [], paths: [], visuals: { backgroundId: 'sky1', decorations: [] },
    extensions: {}, contentHash: null, certification: null
  };
}
function handoff(data) {
  return {
    version: 3, kind: 'editor-validation', profileId: 'run-v1', template: data,
    subjectRef: { levelId: data.id, contentHash: null },
    draftRef: { draftId: data.id, revision: 1 },
    rules: { rulesVersion: 'test', rulesFingerprint: 'test' }, requestId: 't'
  };
}

// ---- 用一个可控的 rAF 队列代替真实帧循环 ----
let queue = [];
let now = 1000;
globalThis.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
globalThis.cancelAnimationFrame = () => { queue = []; };
function frame() {
  const cb = queue.shift();
  if (!cb) throw new Error('页面没有再安排下一帧');
  cb(now);
  now += 1000 / 60;
}
function keys(code, down) {
  globalThis.dispatch(down ? 'keydown' : 'keyup', { code, repeat: false });
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; console.log('  FAIL  ' + name + '    ' + (e && e.message)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }
function el(id) { return globalThis.document.getElementById(id); }

function runPage(scripts, note) {
  for (const rel of scripts) {
    if (rel === 'js/trial.js') {
      // finish 放在很高处:这个自检只验证输入/暂停接线,不让脚本跳一次就通关
      sessionStorage.setItem('RA_TRIAL_V3', JSON.stringify(handoff(level(8, 0))));
      // Node 里没有图片,资源加载直接回调;这不影响移动/碰撞/输入逻辑
      RA.Assets = class { loadAll(cb) { cb(); } image() { return null; } frames() { return {}; } };
    }
    vm.runInThisContext(readFileSync(join(ROOT, rel), 'utf8'), { filename: rel });
    void note;
  }
}

console.log('▌ 按 trial.html 真实脚本顺序启动');
runPage(SCRIPTS);

check('trial.html 在 trial.js 之前加载了 js/platform/action-input.js', () => {
  const iInput = SCRIPTS.indexOf('js/platform/action-input.js');
  const iTrial = SCRIPTS.indexOf('js/trial.js');
  assert(iInput >= 0, 'HTML 里没有 action-input.js');
  assert(iInput < iTrial, 'action-input.js 必须在 trial.js 之前');
});
check('页面启动成功:RA.ActionInput 有定义,RA.trial 已暴露', () => {
  assert(typeof RA.ActionInput === 'function', 'RA.ActionInput = ' + typeof RA.ActionInput);
  assert(RA.trial && RA.trial.session, 'RA.trial 没有建立(启动多半报错了)');
});
check('启动提示已经被真实状态替换(不再停在"正在启动")', () => {
  const info = el('trial-info').textContent;
  assert(info && info.indexOf('正在启动') < 0, 'trial-info=' + info);
  assert(info.indexOf('运行中') >= 0, 'trial-info=' + info);
  assert(el('dev-error').style.display !== 'block', '不应该显示启动错误');
});
check('开局技能就绪(K 可用),不是旧的开局 20 秒冷却', () => {
  const sn = RA.trial.session.snapshot();
  assert(sn.profileId === 'run-v1', 'profileId=' + sn.profileId);
  assert(sn.haloCooldownRemaining === 0, 'CD=' + sn.haloCooldownRemaining);
  assert(el('trial-info').textContent.indexOf('光环就绪') >= 0, el('trial-info').textContent);
});

console.log('▌ 键盘真实边沿:走跳 / 二段跳 / K / 暂停继续');
frame(); // 第一帧
check('按住 Space 真的传成 jumpHeld 并起跳(不是 held.jump)', () => {
  const s = RA.trial.session;
  const feet0 = s.player.feet;
  keys('Space', true);
  for (let i = 0; i < 10; i++) frame();
  assert(s.actions.jumpHeld === true, 'jumpHeld=' + s.actions.jumpHeld);
  assert(s.player.feet < feet0 - 10, '脚底没有上升:' + feet0 + ' -> ' + s.player.feet);
  assert(s.player.jumpsUsed === 1, 'jumpsUsed=' + s.player.jumpsUsed);
});
check('松手后还能二段跳(沿用原 Player 数值)', () => {
  const s = RA.trial.session;
  keys('Space', false);
  frame();
  keys('Space', true);
  for (let i = 0; i < 6; i++) frame();
  assert(s.player.jumpsUsed === 2, 'jumpsUsed=' + s.player.jumpsUsed);
  keys('Space', false);
});
check('A/D 与方向键都能左右移动', () => {
  const s = RA.trial.session;
  for (let i = 0; i < 30; i++) frame();        // 先落地/停稳
  const x0 = s.player.x;
  keys('ArrowLeft', true);
  for (let i = 0; i < 20; i++) frame();
  keys('ArrowLeft', false);
  assert(s.player.x < x0 - 2, '← 没让 x 变:' + x0 + ' -> ' + s.player.x);
  for (let i = 0; i < 30; i++) frame();
  const x1 = s.player.x;
  keys('KeyD', true);
  for (let i = 0; i < 20; i++) frame();
  keys('KeyD', false);
  assert(s.player.x > x1 + 2, 'D 没让 x 变:' + x1 + ' -> ' + s.player.x);
});
check('K 施放光环:14 秒活动 + 从施放起 20 秒冷却', () => {
  const s = RA.trial.session;
  keys('KeyK', true); frame(); keys('KeyK', false);
  const sn = s.snapshot();
  assert(sn.haloActiveRemaining > 13.5, '活动=' + sn.haloActiveRemaining);
  assert(sn.haloCooldownRemaining > 19.5, '冷却=' + sn.haloCooldownRemaining);
  assert(el('trial-info').textContent.indexOf('光环活动') >= 0, el('trial-info').textContent);
});
check('P 暂停:时间冻结、遮罩出现;再按 P 继续', () => {
  const s = RA.trial.session;
  keys('KeyP', true); frame(); keys('KeyP', false);
  assert(s.status === 'paused', 'status=' + s.status);
  assert(el('pause-overlay').style.display === 'flex', 'pause-overlay 没显示');
  const t = s.time;
  for (let i = 0; i < 20; i++) frame();
  assert(s.time === t, '暂停期间还在计时:' + t + ' -> ' + s.time);
  keys('KeyP', true); frame(); keys('KeyP', false);
  assert(s.status === 'running', '再按 P 没能继续,status=' + s.status);
  assert(el('pause-overlay').style.display === 'none', 'pause-overlay 没关掉');
  for (let i = 0; i < 6; i++) frame();
  assert(s.time > t, '继续后时间没有走');
});
check('暂停按钮与 Esc 走同一个控制函数', () => {
  const s = RA.trial.session;
  keys('Escape', true); frame(); keys('Escape', false);
  assert(s.status === 'paused', 'Esc 没暂停:' + s.status);
  el('btn-resume').dispatch('click', {});
  frame();
  assert(s.status === 'running', '继续按钮没恢复:' + s.status);
});
check('失焦会暂停并显示具体原因', () => {
  const s = RA.trial.session;
  globalThis.dispatch('blur', {});
  frame();
  assert(s.status === 'paused', 'blur 后 status=' + s.status);
  assert(/失去焦点/.test(el('pause-reason').textContent), el('pause-reason').textContent);
  keys('KeyP', true); frame(); keys('KeyP', false);
  assert(s.status === 'running');
});

console.log('▌ 启动异常必须可见,不留在加载提示');
const realError = console.error;
console.error = () => { };   // 这两段故意制造启动异常,错误已经显示在页面上
(function reloadWithMissingInput() {
  // 只重跑 trial.js:模拟"HTML 又漏了输入脚本"这种启动异常
  globalThis.RA = { ...RA };
  delete RA.ActionInput;
  sessionStorage.setItem('RA_TRIAL_V3', JSON.stringify(handoff(level(8, 0))));
  vm.runInThisContext(readFileSync(join(ROOT, 'js/trial.js'), 'utf8'), { filename: 'js/trial.js' });
})();
check('缺输入脚本时:显示具体错误 + 返回编辑器,启动提示结束', () => {
  const info = el('trial-info').textContent;
  assert(info.indexOf('正在启动') < 0, 'trial-info=' + info);
  assert(info.indexOf('启动失败') >= 0, 'trial-info=' + info);
  const box = el('dev-error');
  assert(box.style.display === 'block', 'dev-error 没显示');
  assert(box.textContent.indexOf('action-input') >= 0, '错误没写清缺哪个脚本:' + box.textContent);
  assert(box.children.some((c) => c.tagName === 'A' && String(c.href).indexOf('editor.html') >= 0),
    '错误提示里没有返回编辑器的链接');
});
check('没有试玩数据时也给具体错误(不是一直加载)', () => {
  globalThis.RA = { ...RA, ActionInput: RA.ActionInput || loadActionInput() };
  el('dev-error').style.display = '';
  el('dev-error').textContent = '';
  el('trial-info').textContent = '正在启动当前图…';
  sessionStorage.removeItem('RA_TRIAL_V3');
  vm.runInThisContext(readFileSync(join(ROOT, 'js/trial.js'), 'utf8'), { filename: 'js/trial.js' });
  assert(el('dev-error').style.display === 'block', 'dev-error 没显示');
  assert(/没有试玩数据/.test(el('dev-error').textContent), el('dev-error').textContent);
  assert(el('trial-info').textContent.indexOf('正在启动') < 0, el('trial-info').textContent);
});
console.error = realError;

function loadActionInput() {
  vm.runInThisContext(readFileSync(join(ROOT, 'js/platform/action-input.js'), 'utf8'), { filename: 'js/platform/action-input.js' });
  return RA.ActionInput;
}

console.log('\n试玩页接线回归:合计 PASS ' + pass + ' FAIL ' + fail);
export const result = { pass, fail, name: '试玩页接线回归' };
if (process.argv[1] && /test_trial_page\.mjs$/.test(process.argv[1])) process.exit(fail ? 1 : 0);
