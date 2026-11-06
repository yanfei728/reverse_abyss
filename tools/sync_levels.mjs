#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * sync_levels.mjs —— 把 levels/*.json 打包成 levels/levels.js
 * =========================================================
 * 为什么需要这一步:双击 legacy.html/short.html 打开时是 file:// 协议,浏览器**不许**
 * 网页读本地文件,所以关卡数据得先内嵌进一个 js 文件里。
 *
 * 用法:
 *     node tools/sync_levels.mjs
 *
 * 什么时候要跑:
 *   · 新加 / 删掉 / 改了 levels/*.json 之后
 *   · (_ 开头的文件是模板,不会被打包)
 *
 * 顺便把每个 json 体检一遍:id 要和文件名一致、要有 asc(地图)、难度要在 1~4、
 * verified 要是布尔、size 要和 asc 对得上 —— 有问题直接报错退出,不生成半成品。
 * 用 python -m http.server 之类的 http 方式打开时,游戏会直接 fetch json,
 * 那一份是实时的,不用跑这个脚本。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'levels');
const SKY_COUNT = 8;               // 与 config.SKY_COUNT 一致

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort();

if (!files.length) {
  console.error('levels/ 里一个关卡 json 都没有');
  process.exit(1);
}

const out = {};
const problems = [];
let warned = 0;

for (const f of files) {
  const id = basename(f, '.json');
  let data;
  try {
    data = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  } catch (e) {
    problems.push(`${f}: 不是合法的 json(${e.message})`);
    continue;
  }
  if (data.id !== id) problems.push(`${f}: id 是 "${data.id}",应该和文件名一样是 "${id}"`);
  if (typeof data.asc === 'string') data.asc = data.asc.replace(/\r\n/g, '\n').split('\n');
  if (!Array.isArray(data.asc) || !data.asc.some((l) => String(l).trim())) {
    problems.push(`${f}: 没有 asc(地图一行都没写)`);
    continue;
  }
  const asc = data.asc.map((l) => String(l).replace(/\s+$/, ''));
  const cols = asc.reduce((m, l) => Math.max(m, l.length), 0);
  const rows = asc.length;
  if (!Number.isInteger(data.difficulty) || data.difficulty < 1 || data.difficulty > 4) {
    problems.push(`${f}: difficulty 要是 1~4 的整数(现在是 ${JSON.stringify(data.difficulty)})`);
  }
  if (typeof data.verified !== 'boolean') {
    problems.push(`${f}: verified 要是 true / false(现在是 ${JSON.stringify(data.verified)})`);
  }
  if (!data.size || data.size.cols !== cols || data.size.rows !== rows) {
    problems.push(`${f}: size 和 asc 对不上 —— 现在应该是 {"cols": ${cols}, "rows": ${rows}}` +
      `(写的是 ${JSON.stringify(data.size)})`);
  }
  if (data.objects !== undefined && !Array.isArray(data.objects)) {
    problems.push(`${f}: objects 要是数组`);
  }
  if (data.sky !== undefined && data.sky !== 0 &&
      (!Number.isInteger(data.sky) || data.sky < 1 || data.sky > SKY_COUNT)) {
    problems.push(`${f}: sky 只能是 0(自动)或者 1~${SKY_COUNT}`);
  }
  // 轻量体检:行长度是不是一致(不一致不算错,但通常是画歪了)
  const widths = [...new Set(asc.filter((l) => l.trim()).map((l) => l.length))];
  if (widths.length > 1) {
    warned++;
    console.warn(`  ⚠ ${f}: 每行长度不一致(${widths.join('/')})—— 确认不是画歪了`);
  }
  out[id] = data;
}

if (problems.length) {
  console.error('levels/ 里有 ' + problems.length + ' 个问题,先修好再同步:');
  problems.forEach((p) => console.error('  ✗ ' + p));
  process.exit(1);
}

// 顺手提醒一下还留在 levels/ 里的老格式文件(游戏已经不读它们了)
const legacy = readdirSync(DIR).filter((f) => f.endsWith('.txt') && !f.startsWith('_'));
if (legacy.length) {
  console.warn('  ⚠ levels/ 里还有老格式的 txt(游戏不读它们了,要就用编辑器另存,要就删掉):' +
    legacy.join('、'));
}

const body = `/* -*- coding: utf-8 -*- */
/*
 * levels.js —— 关卡数据的内嵌副本(自动生成,别手改!)
 * =====================================================
 * 由 tools/sync_levels.mjs 从 levels/*.json 生成。
 * 改了 json 就重新跑一次:  node tools/sync_levels.mjs
 *
 * 一个键 = 一层关卡:{"id", "difficulty", "verified", "size", "sky", "objects", "asc"}
 *   · id      关卡的固定身份(名字已经去掉了,显示也用 id)
 *   · asc     地图本体,一行一格
 *   · 其它    难度(1~4)/ 验过没有 / 大小 / 天空 / 带参数的元素
 * 游戏启动时如果发现是 http 打开的,会用 fetch 读 levels/*.json 覆盖这里的内容,
 * 所以本地调试改 json 可以不用跑同步(但要刷新页面)。
 */
(function (RA) {
  'use strict';
  RA.LEVEL_DATA = ${JSON.stringify(out, null, 2)};

  // 兼容层:关卡编辑器现在读的是这一份(id → asc 文本)。等编辑器接了新格式就能删。
  RA.LEVEL_TEXT = {};
  Object.keys(RA.LEVEL_DATA).forEach(function (id) {
    RA.LEVEL_TEXT[id] = RA.LEVEL_DATA[id].asc.join('\\n');
  });
})(globalThis.RA = globalThis.RA || {});
`;

writeFileSync(join(DIR, 'levels.js'), body, 'utf8');
console.log(`已生成 levels/levels.js:${files.length} 个关卡`);
files.forEach((f) => console.log('  · ' + f));
if (warned) console.log(`(${warned} 个文件有提醒,见上)`);
