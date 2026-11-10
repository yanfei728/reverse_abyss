#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * import_level_bundle.mjs —— 41:无目录 API 时的已通过关卡包导入
 * =================================================================
 *   node tools/import_level_bundle.mjs path/to/bundle.json
 *   node tools/import_level_bundle.mjs path/to/bundle.json --check
 *
 * 只接受浏览器“批量导出到本地”生成的 bundle（reverse-abyss-level-bundle-v1）。
 * 每张先按 normal/difficulty-N 落盘；全部预检通过后才写；最后用共享
 * js/normal-catalog.js 重新生成 levels.js。--check 只读比较，不写文件。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './runtime.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RA = loadEngine();
const LD = RA.LevelData;
const args = process.argv.slice(2);
const check = args.includes('--check');
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('用法: node tools/import_level_bundle.mjs <bundle.json> [--check]'); process.exit(2); }

let bundle;
try { bundle = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error('读取关卡包失败: ' + e.message); process.exit(1); }
if (!bundle || bundle.format !== 'reverse-abyss-level-bundle-v1' || !Array.isArray(bundle.levels)) {
  console.error('不是 reverse-abyss-level-bundle-v1 关卡包'); process.exit(1);
}

const RA2 = RA;
const candidates = [];
for (const data of bundle.levels) {
  const c = RA2.LevelExport.candidate(data, { source: 'bundle' });
  if (!c.ok) { console.error('关卡包中有不合格内容: ' + c.error.message); process.exit(1); }
  candidates.push(c.value);
}
const targets = candidates.map((c) => ({
  c,
  rel: 'levels/normal/difficulty-' + c.difficulty + '/' + RA2.LevelExport.fileName(c)
}));
// 读磁盘现有 normal 文件（含原 11 张），不删除；只做统一预检
const { readdirSync, statSync } = await import('node:fs');
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
  for (const f of walk(join(ROOT, 'levels/normal', sub))) {
    files.push({ path: 'normal/' + sub + '/' + f.split(/[\\/]/).pop(), text: readFileSync(f, 'utf8') });
  }
}
const existing = new Set(files.map((f) => f.path));
const pre = RA2.NormalCatalog.compile(files);
if (!pre.ok) { console.error('既有目录预检失败（未写入）'); pre.problems.forEach((p) => console.error('  - ' + p)); process.exit(1); }
const seen = new Set(pre.entries.map((e) => e.levelId + '\u0000' + e.contentHash));
const additions = [];
for (const t of targets) {
  const key = t.c.levelId + '\u0000' + t.c.contentHash;
  if (seen.has(key)) { console.log('已存在同 id/hash 版本，跳过: ' + t.c.levelId); continue; }
  seen.add(key);
  const rel = t.rel.replace(/^levels\//, '');
  if (existing.has(rel)) {
    const old = files.find((f) => f.path === rel);
    if (old.text !== t.c.text) { console.error('冲突:目标已存在且内容不同 ' + t.rel); process.exit(1); }
    console.log('已存在同版本，跳过: ' + t.rel);
    continue;
  }
  files.push({ path: rel, text: t.c.text });
  additions.push(t);
}
const compiled = RA2.NormalCatalog.compile(files);
if (!compiled.ok) {
  console.error('清单预检失败（未写入）:');
  compiled.problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
const body = RA2.NormalCatalog.script(compiled.entries);
const levelPath = join(ROOT, 'levels/levels.js');
if (check) {
  const cur = existsSync(levelPath) ? readFileSync(levelPath, 'utf8') : '';
  if (cur !== body) { console.error('levels.js 未同步；重新运行不带 --check'); process.exit(1); }
  console.log('关卡包可导入；目标 ' + additions.length + ' 个新增，清单已最新 ' + compiled.entries.length + ' 张');
  process.exit(0);
}
for (const t of additions) {
  const abs = join(ROOT, t.rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, t.c.text, 'utf8');
  const back = readFileSync(abs, 'utf8');
  if (back !== t.c.text) { console.error('写回校验失败: ' + t.rel); process.exit(1); }
}
writeFileSync(levelPath, body, 'utf8');
const back = readFileSync(levelPath, 'utf8');
if (back !== body) { console.error('levels.js 写回校验失败'); process.exit(1); }
console.log('已导入 ' + additions.length + ' 个 JSON；levels.js 共 ' + compiled.entries.length + ' 张内置普通图');
