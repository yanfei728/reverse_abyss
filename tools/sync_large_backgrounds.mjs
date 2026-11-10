#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * sync_large_backgrounds.mjs —— 38/39:三层大背景静态清单(显式分组/布局)
 * =====================================================================
 *   node tools/sync_large_backgrounds.mjs
 *   node tools/sync_large_backgrounds.mjs --check
 *
 * 39:不再假设“中层=小塔”;每次层带 fit/anchor/pan/max 配置。
 * 组1保留38已验布局(左塔22%W、前中后4/3/2%);组2天空→村落→山谷 cover;
 * 组3/4本轮空(运行时保留渐变)。只读PNG,不裁剪/不改原图。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './runtime.mjs';

const DIR = join(ROOT, 'assets/background/large');
const OUT = join(DIR, 'catalog.js');

const GROUPS = [
  {
    group: 'difficulty-1',
    layers: [
      { id: 'background-sunset', layer: 'back', order: 0, file: 'background-sunset.png',
        layout: { fit: 'cover', anchorX: 0.5, anchorY: 0.5, panPct: 0.02 } },
      { id: 'midground-tower', layer: 'mid', order: 1, file: 'midground-tower.png',
        layout: { fit: 'contain', anchorX: 0.22, anchorY: 1, panPct: 0.03, maxWidthPct: 0.28, maxHeightPct: 0.8 } },
      { id: 'foreground-forest', layer: 'front', order: 2, file: 'foreground-forest.png',
        layout: { fit: 'cover', anchorX: 0.5, anchorY: 1, panPct: 0.04 } }
    ]
  },
  {
    group: 'difficulty-2',
    layers: [
      { id: 'background-sky', layer: 'back', order: 0, file: 'background-sky.png',
        layout: { fit: 'cover', anchorX: 0.5, anchorY: 0.5, panPct: 0.02 } },
      { id: 'midground-village', layer: 'mid', order: 1, file: 'midground-village.png',
        layout: { fit: 'cover', anchorX: 0.5, anchorY: 1, panPct: 0.03 } },
      { id: 'foreground-valley', layer: 'front', order: 2, file: 'foreground-valley.png',
        layout: { fit: 'cover', anchorX: 0.5, anchorY: 1, panPct: 0.04 } }
    ]
  },
  { group: 'difficulty-3', layers: [] },
  { group: 'difficulty-4', layers: [] }
];

function pngSize(buf) {
  if (!(buf.length >= 24 && buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG')) return null;
  if (buf.slice(12, 16).toString('latin1') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function main() {
  const check = process.argv.includes('--check');
  const problems = [];
  const groups = [];
  for (const g of GROUPS) {
    const layers = [];
    for (const l of g.layers) {
      const rel = `assets/background/large/${g.group}/${l.file}`;
      const abs = join(ROOT, rel);
      if (!existsSync(abs)) { problems.push(rel + ' 不存在(组内三张必须齐全)'); continue; }
      const size = pngSize(readFileSync(abs));
      if (!size) { problems.push(rel + ' 不是可读 PNG'); continue; }
      layers.push({
        id: l.id, layer: l.layer, order: l.order, file: rel,
        width: size.width, height: size.height, layout: l.layout
      });
    }
    if (g.layers.length && layers.length !== g.layers.length) {
      problems.push(g.group + ' 必须三张齐全或全空(当前 ' + layers.length + '/' + g.layers.length + ')');
    }
    groups.push({ group: g.group, layers: layers });
  }
  if (problems.length) { problems.forEach((p) => console.error('  - ' + p)); process.exit(1); }
  const data = { version: 2, groups: groups };
  const text = '/* -*- coding: utf-8 -*- */\n' +
    '/* 由 tools/sync_large_backgrounds.mjs 生成;不要手改。\n' +
    ' * 39:分组/每图布局(cover/contain/锚点/横移幅度);组3/4空=渐变。 */\n' +
    '(function (RA) {\n  \'use strict\';\n  RA.LargeBackgroundCatalog = ' +
    JSON.stringify(data, null, 2) + ';\n})(globalThis.RA = globalThis.RA || {});\n';
  if (check) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== text) { console.error('大背景清单未同步;运行 node tools/sync_large_backgrounds.mjs'); process.exit(1); }
    console.log('大背景清单已是最新:' + groups.filter((g) => g.layers.length).map((g) => g.group).join(','));
    return;
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(OUT, text, 'utf8');
  console.log('已生成 large/catalog.js:' + groups.map((g) => g.group + '=' + g.layers.length).join(' '));
}
main();
