#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * sync_b2_levels.mjs —— 把 levels/b2/*.json 嵌成 js/b2-samples.js
 * 开发短塔模板共 6 层,全部未认证;正式池仍只认已发布+已认证内容。
 *     node tools/sync_b2_levels.mjs [--check]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './loader.mjs';

const dir = join(ROOT, 'levels/b2');
const out = join(ROOT, 'js/b2-samples.js');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
const map = {
  'lobby.json': 'lobby',
  'normal-1.json': 'normal1',
  'normal-2.json': 'normal2',
  'normal-3.json': 'normal3',
  'rest.json': 'rest',
  'boss.json': 'boss'
};
const samples = {};
for (const f of files) {
  const key = map[f] || f.replace(/\.json$/, '').replace(/[^a-zA-Z0-9]/g, '');
  samples[key] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
}
const text = `/* -*- coding: utf-8 -*- */
/*
 * b2-samples.js —— B2 开发短塔模板(自动生成,不要手改)
 * 来源:levels/b2/*.json;重新生成:node tools/sync_b2_levels.mjs
 * 未认证的开发模板;不进入正式随机池。
 */
(function (RA) {
  'use strict';
  RA.B2_SAMPLES = ${JSON.stringify(samples, null, 2)};
})(globalThis.RA = globalThis.RA || {});
`;
const check = process.argv.includes('--check');
const old = existsSync(out) ? readFileSync(out, 'utf8') : '';
if (old === text) { console.log('b2-samples.js 已是最新(' + files.length + ' 层)'); process.exit(0); }
if (check) { console.error('b2-samples.js 与 levels/b2 不同步'); process.exit(1); }
writeFileSync(out, text, 'utf8');
console.log('已生成 js/b2-samples.js(' + files.length + ' 层)');
