#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * sync_levels.mjs —— 29/41:把 levels/normal/difficulty-1..4 中已通过、可读取的
 * schema2 普通图打包成 file:///HTTP 共用的内置正式候选(levels/levels.js)。
 *
 *     node tools/sync_levels.mjs
 *     node tools/sync_levels.mjs --check
 *
 * 浏览器目录导出与 Node 共用 js/normal-catalog.js 的纯编译器:
 * 本工具只负责枚举文件；通过/难度/去重/排序/脚本文本都由共享模块决定。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './runtime.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = join(ROOT, 'levels');
const OUT = join(LEVELS, 'levels.js');
const RA = loadEngine();

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

const files = [];
for (const sub of ['difficulty-1', 'difficulty-2', 'difficulty-3', 'difficulty-4']) {
  const dir = join(LEVELS, 'normal', sub);
  for (const file of walk(dir).sort()) {
    files.push({ path: relative(LEVELS, file).replace(/\\/g, '/'), text: readFileSync(file, 'utf8') });
  }
}
const compiled = RA.NormalCatalog.compile(files);
if (!compiled.ok) {
  console.error('levels/normal 有 ' + compiled.problems.length + ' 个问题;未写入 levels.js:');
  compiled.problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
const body = RA.NormalCatalog.script(compiled.entries);
const check = process.argv.includes('--check');
if (check) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (cur !== body) { console.error('levels.js 未同步;运行 node tools/sync_levels.mjs'); process.exit(1); }
  console.log('levels.js 已是最新: ' + compiled.entries.length + ' 张内置普通图');
  process.exit(0);
}
writeFileSync(OUT, body, 'utf8');
console.log('已生成 levels/levels.js: ' + compiled.entries.length + ' 张内置普通图');
compiled.entries.forEach((e) => console.log('  · ' + e.data.difficulty + '  ' + e.levelId + '  ' + e.path));
if (compiled.skipped.length) {
  console.log('跳过 ' + compiled.skipped.length + ' 个未入池文件:');
  compiled.skipped.forEach((s) => console.log('  - ' + s.path + ': ' + s.reason));
}
