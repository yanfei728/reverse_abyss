#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * sync_levels.mjs —— 29号卡:把 levels/normal/difficulty-1..4 中已通过、可读取的
 * schema2 普通图打包成 file:///HTTP 共用的内置正式候选(levels/levels.js)。
 *
 *     node tools/sync_levels.mjs
 *
 * 只扫描这四个难度目录;fixed/fallback/archive 永不进入普通池。
 * 无有效人工通过声明的文件明确跳过;档案/固定/补位不扫描。
 * 任何坏 JSON/坏 hash/难度与目录不符/读取失败都会失败且不写半成品。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './loader.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = join(ROOT, 'levels');
const OUT = join(LEVELS, 'levels.js');
const RA = loadEngine();
const LD = RA.LevelData;
const DIRS = [
  ['difficulty-1', 1], ['difficulty-2', 2], ['difficulty-3', 3], ['difficulty-4', 4]
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.toLowerCase().endsWith('.json')) out.push(p);
  }
  return out;
}

const problems = [], skipped = [], entries = [], seen = new Set();
for (const [sub, difficulty] of DIRS) {
  const dir = join(LEVELS, 'normal', sub);
  for (const file of walk(dir).sort()) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    let data;
    try { data = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { problems.push(rel + ': JSON 无法解析(' + e.message + ')'); continue; }
    const read = LD.readableIssues ? LD.readableIssues(data) : LD.errorsOf(LD.validate(data, { purpose: 'load' }));
    if (read.length) { problems.push(rel + ': 读取检查失败 ' + read[0].code + ' ' + read[0].path + ' ' + read[0].message); continue; }
    if (Number(data.difficulty) !== difficulty || !Number.isInteger(data.difficulty)) {
      problems.push(rel + ': 目录 ' + sub + ' 要求 difficulty=' + difficulty + ',实际 ' + JSON.stringify(data.difficulty));
      continue;
    }
    const hash = LD.hashSync(data);
    const pass = RA.ContentRepository && RA.ContentRepository.certState
      ? RA.ContentRepository.certState(data, hash, RA.RULES) : { ok: false, reason: '无通过判定' };
    if (!pass.ok) {
      skipped.push({ path: rel, reason: pass.reason || '未通过', levelId: data.id });
      continue;
    }
    const key = String(data.id) + '\u0000' + hash;
    if (seen.has(key)) { skipped.push({ path: rel, reason: '同 id/hash 重复,已去重', levelId: data.id }); continue; }
    seen.add(key);
    entries.push({ levelId: data.id, contentHash: hash, source: 'builtin', path: rel, requiredDifficulty: difficulty, data });
  }
}

if (problems.length) {
  console.error('levels/normal 有 ' + problems.length + ' 个问题;未写入 levels.js:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}

entries.sort((a, b) => (a.levelId + a.contentHash).localeCompare(b.levelId + b.contentHash));
const body = `/* -*- coding: utf-8 -*- */
/* 由 tools/sync_levels.mjs 从 levels/normal/difficulty-1..4 生成;不要手改。
 * 只包含有有效人工通过声明且当前内容可读取的普通图;fixed/fallback/archive 永不入池。
 * 改 JSON 后运行: node tools/sync_levels.mjs
 */
(function (RA) {
  'use strict';
  RA.NORMAL_LEVELS = ${JSON.stringify(entries, null, 2)};
  // 旧编辑器/旧页面读取的兼容别名;新正式入口只用 NORMAL_LEVELS。
  RA.LEVEL_DATA = {};
  RA.LEVEL_TEXT = {};
})(globalThis.RA = globalThis.RA || {});
`;
writeFileSync(OUT, body, 'utf8');
console.log('已生成 levels/levels.js: ' + entries.length + ' 张内置普通图');
entries.forEach((e) => console.log('  · ' + e.data.difficulty + '  ' + e.levelId + '  ' + e.path));
if (skipped.length) {
  console.log('跳过 ' + skipped.length + ' 个未入池文件:');
  skipped.forEach((s) => console.log('  - ' + s.path + ': ' + s.reason));
}
