#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * sync_dev_levels.mjs —— 把 levels/archive/dev/*.json 嵌进 js/dev-samples.js
 * ================================================================
 * 双击 file:// 打开页面时浏览器不许 fetch 本地 JSON,所以开发样例也要像
 * levels/levels.js 一样生成一份可 <script> 引用的副本。
 *
 *     node tools/sync_dev_levels.mjs          重新生成
 *     node tools/sync_dev_levels.mjs --check  只检查是否同步(不同步退出 1)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './loader.mjs';

const dir = join(ROOT, 'levels/archive/dev');
const out = join(ROOT, 'js/dev-samples.js');
const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  : [];
const samples = {};
for (const f of files) {
  const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const key = f.replace(/^floor-/, '').replace(/\.json$/, '');
  const name = key === 'a' ? 'floorA' : key === 'b' ? 'floorB' : 'floor' + key.toUpperCase();
  samples[name] = data;
}
const text = `/* -*- coding: utf-8 -*- */
/*
 * dev-samples.js —— 连续试玩用的开发样例(自动生成,不要手改)
 * 来源:levels/archive/dev/*.json;重新生成:node tools/sync_dev_levels.mjs
 * 开发模式样例,未认证;不进入正式随机池。
 */
(function (RA) {
  'use strict';
  RA.DEV_SAMPLES = ${JSON.stringify(samples, null, 2)};
})(globalThis.RA = globalThis.RA || {});
`;
const checkOnly = process.argv.includes('--check');
const old = existsSync(out) ? readFileSync(out, 'utf8') : '';
if (old === text) {
  console.log('dev-samples.js 已是最新(' + files.length + ' 层)');
  process.exit(0);
}
if (checkOnly) {
  console.error('dev-samples.js 与 levels/archive/dev/*.json 不同步;运行 node tools/sync_dev_levels.mjs');
  process.exit(1);
}
writeFileSync(out, text, 'utf8');
console.log('已生成 js/dev-samples.js(' + files.length + ' 层)');
