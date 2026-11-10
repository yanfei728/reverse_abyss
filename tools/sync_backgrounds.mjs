#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * sync_backgrounds.mjs —— 35号卡:扫描关卡小背景图片生成静态清单
 * ================================================================
 *   node tools/sync_backgrounds.mjs            # 写 assets/background/catalog.js
 *   node tools/sync_backgrounds.mjs --check    # 只核对清单是否最新(不写)
 *
 * 规则:
 *   · 只扫描 assets/background/level/ 下的 .png(浏览器 file:// 不能枚举目录,
 *     所以运行期只读这份静态清单);assets/background/large/ 不扫入。
 *   · id 由文件名派生,不随图片内容变化:ASCII 文件名 → levelbg-<slug>;
 *     含非 ASCII 文件名 → levelbg-<路径短hash>;界面 label 仍显示原文件名。
 *   · 同 id 冲突(不同文件算出同一 id)直接报错,不写半份清单。
 *   · 图片只读,不重采样/不改名;清单是纯数据,无 DOM/文件选择 API。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'assets/background/level');
const OUT = join(ROOT, 'assets/background/catalog.js');
const REL_DIR = 'assets/background/level';

/* 已知小背景的显示名(素材标签);新增图片可在这里补,缺省用文件名 */
const LABELS = {
  'levelbg-sample-cave-01': '示例洞窟背景',
  'levelbg-lobby-20261110': '新大厅背景',
  'levelbg-rest-area-20261110': '新休息区背景',
  'levelbg-rest-house-20261110': '休息小屋背景'
};

function pngSize(buf) {
  if (!(buf.length >= 24 && buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG')) return null;
  if (buf.slice(12, 16).toString('latin1') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function idOf(file) {
  const stem = basename(file, '.png');
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(stem)) {
    const slug = stem.toLowerCase().replace(/[._]+/g, '-').replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
    return 'levelbg-' + slug;
  }
  const h = createHash('sha256').update(REL_DIR + '/' + file).digest('hex').slice(0, 8);
  return 'levelbg-' + h;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  if (!existsSync(DIR)) {
    console.error('找不到目录 ' + REL_DIR + ';先建 assets/background/level/');
    process.exit(2);
  }
  const entries = [];
  const problems = [];
  const seen = Object.create(null);
  const files = readdirSync(DIR).filter((f) => statSync(join(DIR, f)).isFile()).sort();
  for (const f of files) {
    if (!/\.png$/i.test(f)) {
      if (!/^readme/i.test(f)) console.warn('跳过非 PNG 文件:' + REL_DIR + '/' + f);
      continue;
    }
    const buf = readFileSync(join(DIR, f));
    const size = pngSize(buf);
    if (!size) { problems.push(REL_DIR + '/' + f + ': 不是合法 PNG(按 magic 判断)'); continue; }
    const id = idOf(f);
    if (seen[id]) { problems.push('id 冲突:' + id + ' ← ' + seen[id] + ' 与 ' + f); continue; }
    seen[id] = f;
    entries.push({
      id: id,
      label: LABELS[id] || basename(f, '.png'),
      file: REL_DIR + '/' + f,
      width: size.width,
      height: size.height
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  if (problems.length) {
    console.error('背景清单生成失败(' + problems.length + ' 个问题),未写文件:');
    problems.forEach((p) => console.error('  - ' + p));
    process.exit(1);
  }
  const body = `/* -*- coding: utf-8 -*- */
/* 由 tools/sync_backgrounds.mjs 扫描 assets/background/level/ 生成;不要手改。
 * 只包含 .png 小背景;assets/background/large/ 的大背景不在此清单。
 * 放图/换图后运行: node tools/sync_backgrounds.mjs
 */
(function (RA) {
  'use strict';
  RA.LevelBackgroundCatalog = {
    entries: ${JSON.stringify(entries, null, 2).replace(/\n/g, '\n    ')}
  };
})(globalThis.RA = globalThis.RA || {});
`;
  const old = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (old === body) {
    console.log('背景清单已是最新:' + entries.length + ' 项');
    return;
  }
  if (checkOnly) {
    console.error('背景清单不是最新;运行 node tools/sync_backgrounds.mjs');
    process.exit(1);
  }
  writeFileSync(OUT, body, 'utf8');
  console.log('已生成 assets/background/catalog.js:' + entries.length + ' 项');
  entries.forEach((e) => console.log('  · ' + e.id + '  ' + e.width + '×' + e.height + '  ' + e.file));
}

main();
