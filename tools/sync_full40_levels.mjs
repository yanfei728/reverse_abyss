#!/usr/bin/env node
/* 将固定场景和补位关卡打包为浏览器可直接加载的数据。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, loadEngine } from './runtime.mjs';

const RA = loadEngine();
const files = {
  lobby: 'levels/fixed/lobby.json', rest: 'levels/fixed/rest.json',
  boss: 'levels/fixed/boss.json', restHouse: 'levels/fixed/rest-house.json',
  easyFinish: 'levels/fixed/easy-finish.json', fallback: 'levels/fallback/test3.json'
};
const levels = {};
const copies = [];
for (const [role, path] of Object.entries(files)) {
  const bytes = readFileSync(join(ROOT, path));
  const data = JSON.parse(bytes.toString('utf8'));
  const issues = RA.LevelData.readableIssues(data);
  if (issues.length || data.contentHash !== RA.LevelData.hashSync(data)) {
    throw new Error('固定关卡内容或hash无效: ' + path);
  }
  if (data.certification) throw new Error('固定场景不应带普通关卡通过声明: ' + path);
  levels[role] = data;
  copies.push({ role, path, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const data = {
  layout: 'full40-v1', gameplayProfile: 'run-v1',
  poolEpoch: 'full40-pool-reset-2026-11-09',
  fixed: { lobby: levels.lobby, rest: levels.rest, boss: levels.boss },
  easyFinish: levels.easyFinish, restHouse: levels.restHouse,
  fallback: levels.fallback, runCopies: copies
};
const text = '/* 由 tools/sync_full40_levels.mjs 生成，请勿手动编辑。 */\n' +
  '(function (RA) {\n  \'use strict\';\n  RA.FULL40 = ' + JSON.stringify(data, null, 2) +
  ';\n})(globalThis.RA = globalThis.RA || {});\n';
const out = join(ROOT, 'js/full40-samples.js');
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== text) throw new Error('固定关卡数据未同步');
  console.log('固定关卡清单已同步');
} else {
  writeFileSync(out, text, 'utf8');
  console.log('已生成固定场景、小屋、终点和补位关卡数据');
}
