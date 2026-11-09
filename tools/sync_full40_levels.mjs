#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * sync_full40_levels.mjs —— 生成完整塔运行数据 js/full40-samples.js
 * ==============================================================
 * 只读 levels/archive/full40/ 下已验运行副本,打包成 file:// 可用的 <script> 数据。
 * 原始导出在 开发示例关卡/ 只读保存;本工具只核对地形/尺寸等保真,不改原件。
 *
 *   node tools/sync_full40_levels.mjs          # 生成/更新
 *   node tools/sync_full40_levels.mjs --check  # 只检查是否同步
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './loader.mjs';

const LAYOUT = 'full40-v1';
const GAMEPLAY_PROFILE = 'run-v1';
const POOL_EPOCH = 'full40-pool-reset-2026-11-09';

const RUN_DIR = 'levels';
const SOURCE_DIR = '开发示例关卡';
const RUN_FILES = {
  lobby: 'levels/fixed/lobby.json',
  rest: 'levels/fixed/rest.json',
  boss: 'levels/fixed/boss.json',
  fallback: 'levels/fallback/test3.json'
};
const SOURCE_FILES = [
  { role: 'lobby', path: '开发示例关卡/level0.json', note: '大厅/出生;原始导出含两个裸 x,运行副本沿用已验转换' },
  { role: 'rest', path: '开发示例关卡/rest_level.json', note: '10/30 休整' },
  { role: 'boss', path: '开发示例关卡/boss.json', note: '20/40 Boss;原始导出没有 start/finish' },
  { role: 'fallback', path: '开发示例关卡/test3.json', note: '每档不足时的内置补位;原始 ports 为空' },
  { role: 'test1', path: '开发示例关卡/test1.json', note: '作者普通图原件,不进完整塔正式池' },
  { role: 'test2', path: '开发示例关卡/test2.json', note: '作者普通图原件,不进完整塔正式池' }
];

function readJson(rel) { return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')); }
function sha256File(rel) { return createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function sameMatrix(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/** 原始 level0 有两个裸 x 不是合法 JSON;只用于保真核对时把它们当空气。 */
function readLobbySourceTerrain() {
  const raw = readFileSync(join(ROOT, '开发示例关卡/level0.json'), 'utf8');
  const patched = raw.replace(/\bx\b/g, '0');
  return JSON.parse(patched);
}

function checkRunCopies(run) {
  const problems = [];
  const t = (name) => run[name];
  if (t('lobby').kind !== 'lobby') problems.push('lobby.kind 必须是 lobby');
  if (t('lobby').ports !== null) problems.push('lobby.ports 必须为空(固定场景)');
  if (!t('lobby').extensions || !t('lobby').extensions.fixedScene ||
    !t('lobby').extensions.fixedScene.playerSpawn ||
    t('lobby').extensions.fixedScene.playerSpawn.centerCol !== 10 ||
    t('lobby').extensions.fixedScene.playerSpawn.feetRow !== 20) {
    problems.push('lobby 缺 fixedScene.playerSpawn centerCol10/feetRow20');
  }
  if (t('rest').kind !== 'rest') problems.push('rest.kind 必须是 rest');
  const rp = t('rest').ports || {};
  if (rp.profile !== 'cloud-pipe-v2' || !rp.start || rp.start.col !== 13 || rp.start.row !== 18 ||
    !rp.finish || rp.finish.col !== 1 || rp.finish.row !== 8) {
    problems.push('rest 端点必须是 start(13,18)/finish(1,8)');
  }
  if (t('boss').kind !== 'boss') problems.push('boss.kind 必须是 boss');
  const bp = t('boss').ports || {};
  if (bp.profile !== 'cloud-pipe-v2' || !bp.start || bp.start.col !== 1 || bp.start.row !== 20 ||
    bp.finish !== null) problems.push('boss 端点必须是 start(1,20)/无 finish');
  const fx = t('boss').extensions && t('boss').extensions.fixedScene && t('boss').extensions.fixedScene.boss;
  if (!fx || fx.centerCol !== 10.5 || fx.centerRow !== 14.5) problems.push('boss 缺 fixedScene.boss center10.5/14.5');
  if (t('fallback').kind !== 'normal') problems.push('fallback.kind 必须是 normal');
  const fp = t('fallback').ports || {};
  if (fp.profile !== 'cloud-pipe-v2' || !fp.start || fp.start.col !== 1 || fp.start.row !== 20 ||
    !fp.finish || fp.finish.col !== 1 || fp.finish.row !== 2) {
    problems.push('fallback 端点必须是 start(1,20)/finish(1,2)');
  }
  if (t('fallback').certification !== null) problems.push('fallback 不能带通过记录');
  if (!Number.isInteger(t('fallback').difficulty) || t('fallback').difficulty < 1 || t('fallback').difficulty > 4) {
    problems.push('fallback 自身难度需要是 1..4(补位时可忽略)');
  }
  return problems;
}

function checkFidelity(run) {
  const problems = [];
  // 大厅:原始导出有两个裸 x;运行副本沿用已验转换,地形比对时把裸 x 当空气
  const lobbySrc = readLobbySourceTerrain();
  if (!sameMatrix(lobbySrc.terrain.tiles, run.lobby.terrain.tiles)) problems.push('大厅地形与 开发示例关卡/level0.json 不一致');
  if (!sameMatrix(lobbySrc.size, run.lobby.size)) problems.push('大厅尺寸与原始导出不一致');
  // 休息:原始 ports 为空,只比较地形/尺寸
  const restSrc = readJson('开发示例关卡/rest_level.json');
  if (!sameMatrix(restSrc.terrain.tiles, run.rest.terrain.tiles)) problems.push('休整地形与原始导出不一致');
  if (!sameMatrix(restSrc.size, run.rest.size)) problems.push('休整尺寸与原始导出不一致');
  // Boss:原始 kind=normal/ports=null,只比较地形/尺寸
  const bossSrc = readJson('开发示例关卡/boss.json');
  if (!sameMatrix(bossSrc.terrain.tiles, run.boss.terrain.tiles)) problems.push('Boss 地形与原始导出不一致');
  if (!sameMatrix(bossSrc.size, run.boss.size)) problems.push('Boss 尺寸与原始导出不一致');
  // 补位:test3 原始整体可比(除了 id/title/hash/cert/ports)
  const fbSrc = readJson('开发示例关卡/test3.json');
  if (!sameMatrix(fbSrc.terrain.tiles, run.fallback.terrain.tiles)) problems.push('fallback 地形与 开发示例关卡/test3.json 不一致');
  if (!sameMatrix(fbSrc.size, run.fallback.size)) problems.push('fallback 尺寸与 test3 原始导出不一致');
  if (JSON.stringify(fbSrc.objects || []) !== JSON.stringify(run.fallback.objects || [])) problems.push('fallback objects 与 test3 不一致');
  if (JSON.stringify(fbSrc.paths || []) !== JSON.stringify(run.fallback.paths || [])) problems.push('fallback paths 与 test3 不一致');
  if (JSON.stringify(fbSrc.extensions || {}) !== JSON.stringify(run.fallback.extensions || {})) problems.push('fallback extensions 与 test3 不一致');
  return problems;
}

function main() {
  const check = process.argv.includes('--check');
  for (const rel of Object.values(RUN_FILES)) {
    if (!existsSync(join(ROOT, rel))) { console.error('缺少运行副本: ' + rel); process.exit(1); }
  }
  for (const s of SOURCE_FILES) {
    if (!existsSync(join(ROOT, s.path))) { console.error('缺少原始导入文件: ' + s.path); process.exit(1); }
  }
  const run = {};
  for (const k of Object.keys(RUN_FILES)) run[k] = readJson(RUN_FILES[k]);
  const problems = checkRunCopies(run).concat(checkFidelity(run));
  if (problems.length) {
    console.error('完整塔运行副本有问题:');
    problems.forEach((p) => console.error('  - ' + p));
    process.exit(1);
  }
  const data = {
    layout: LAYOUT,
    gameplayProfile: GAMEPLAY_PROFILE,
    poolEpoch: POOL_EPOCH,
    fixed: { lobby: run.lobby, rest: run.rest, boss: run.boss },
    fallback: run.fallback,
    sources: SOURCE_FILES.map((s) => ({ role: s.role, path: s.path, sha256: sha256File(s.path), note: s.note })),
    runCopies: Object.keys(RUN_FILES).map((k) => ({ role: k, path: RUN_FILES[k], sha256: sha256File(RUN_FILES[k]) }))
  };
  const text = '/* -*- coding: utf-8 -*- */\n' +
    '/* 由 tools/sync_full40_levels.mjs 从 levels/fixed 与 levels/fallback 生成;不要手改。\n' +
    ' * 原始导出只读保存在 开发示例关卡/;运行副本的 ports/固定出生沿用已验元数据。 */\n' +
    '(function (RA) {\n  \'use strict\';\n  RA.FULL40 = ' +
    JSON.stringify(data, null, 2) + ';\n})(globalThis.RA = globalThis.RA || {});\n';
  if (check) {
    const cur = readFileSync(join(ROOT, 'js/full40-samples.js'), 'utf8');
    if (cur !== text) { console.error('js/full40-samples.js 与 levels/fixed/fallback 不同步;运行 node tools/sync_full40_levels.mjs'); process.exit(1); }
    console.log('完整塔运行数据已同步');
    process.exit(0);
  }
  writeFileSync(join(ROOT, 'js/full40-samples.js'), text, 'utf8');
  console.log('已生成 js/full40-samples.js(完整塔固定场景 + test3 补位)');
}

main();
