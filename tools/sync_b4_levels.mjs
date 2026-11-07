#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * sync_b4_levels.mjs —— 生成 B4 作者短塔运行数据
 * ==============================================
 * 只读 levels/authored/short 与 levels/b4/fixed,生成 js/b4-samples.js。
 * 不修改作者原字节副本,不认证,不写正式池。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './loader.mjs';

const files = {
  lobby: 'levels/b4/fixed/lobby.json',
  normal1: 'levels/authored/short/test1.json',
  normal2: 'levels/authored/short/test2.json',
  normal3: 'levels/authored/short/test3.json',
  rest: 'levels/b4/fixed/rest.json',
  boss: 'levels/b4/fixed/boss.json'
};
const out = {};
for (const k of Object.keys(files)) {
  out[k] = JSON.parse(readFileSync(join(ROOT, files[k]), 'utf8'));
}
const text = '/* -*- coding: utf-8 -*- */\n' +
  '/* 由 tools/sync_b4_levels.mjs 从 levels/authored/short 与 levels/b4/fixed 生成;不要手改。 */\n' +
  '(function (RA) {\n  \'use strict\';\n  RA.B4_SAMPLES = ' +
  JSON.stringify(out, null, 2) + ';\n})(globalThis.RA = globalThis.RA || {});\n';
if (process.argv.includes('--check')) {
  const cur = readFileSync(join(ROOT, 'js/b4-samples.js'), 'utf8');
  if (cur !== text) { console.error('js/b4-samples.js 与 levels 不同步;运行 node tools/sync_b4_levels.mjs'); process.exit(1); }
  console.log('B4 样例已同步');
  process.exit(0);
}
writeFileSync(join(ROOT, 'js/b4-samples.js'), text, 'utf8');
console.log('已生成 js/b4-samples.js(6 层作者/固定副本)');
