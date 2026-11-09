#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/* test_29_menu_levels.mjs —— 29号卡:种子文本、目录迁移、四档同步、正式入口 */
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadEngine } from './loader.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RA = loadEngine(), LD = RA.LevelData, clone = (v) => JSON.parse(JSON.stringify(v));
let pass = 0, fail = 0; const fails = [];
function check(n, c, e) { if (c) { pass++; console.log('  PASS  ' + n + (e ? '    ' + e : '')); } else { fail++; fails.push(n); console.log('  FAIL  ' + n + (e ? '    ' + e : '')); } }
function head(t) { console.log('\n▌ ' + t); }
function sha(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }
function certFor(data) { return { contentHash: LD.hashSync(data), rulesVersion: RA.RULES.rulesVersion, rulesFingerprint: RA.RULES.rulesFingerprint, profileId: 'run-v1', status: 'passed', completedAt: '2026-11-09T00:00:00Z', source: 'local-playtest' }; }

head('SeedText:RA-36进制完整解析/0拒绝');
{
  const S = RA.SeedText;
  check('RA-1 解析为1', S.parse('RA-1').ok && S.parse('RA-1').value === 1);
  check('最大 1Z141Z3 = 0xFFFFFFFF', S.parse('RA-1Z141Z3').ok && S.parse('RA-1Z141Z3').value === 0xFFFFFFFF);
  check('小写规范化为大写', S.parse('ra-abc').text === 'RA-ABC');
  check('RA-0 明确拒绝', !S.parse('RA-0').ok);
  check('空/格式错误/超范围拒绝', !S.parse('').ok && !S.parse('RA').ok && !S.parse('RA-@@').ok && !S.parse('RA-1Z141Z4').ok);
  check('format 输出可再解析', S.parse(S.format(123456)).value === 123456);
  const r = S.random(123456);
  check('随机种子有效且不等于当前', r.value !== 123456 && S.parse(r.text).ok);
  const pA = RA.TowerPlanner.buildFull40({ seed: 42, candidates: [], fixedLevels: RA.FULL40.fixed, fallback: RA.FULL40.fallback });
  const pB = RA.TowerPlanner.buildFull40({ seed: 42, candidates: [], fixedLevels: RA.FULL40.fixed, fallback: RA.FULL40.fallback });
  check('同种子同候选生成同清单', pA.ok && pB.ok && JSON.stringify(pA.value.floors.map((f) => f.levelId)) === JSON.stringify(pB.value.floors.map((f) => f.levelId)));
}

head('目录迁移/固定补位/归档不被扫回');
{
  const inv = JSON.parse(readFileSync(join(ROOT, 'docs/checks/29-before-inventory.json'), 'utf8'));
  const map = JSON.parse(readFileSync(join(ROOT, 'docs/checks/29-migration-map.json'), 'utf8'));
  check('迁移前后 inventory 53份', inv.files.length === 53, inv.files.length + '');
  check('53 份迁移映射字节 SHA 全部保持不变', map.count === 53 && map.files.every((f) => f.unchangedHash));
  check('固定/补位/四档目录存在且旧目录移除',
    existsSync(join(ROOT, 'levels/fixed/lobby.json')) && existsSync(join(ROOT, 'levels/fixed/rest.json')) &&
    existsSync(join(ROOT, 'levels/fixed/boss.json')) && existsSync(join(ROOT, 'levels/fallback/test3.json')) &&
    !existsSync(join(ROOT, 'levels/full40')) && !existsSync(join(ROOT, 'levels/authored')) &&
    !existsSync(join(ROOT, 'levels/b2')) && !existsSync(join(ROOT, 'levels/v2')));
  check('四档 normal 目录齐全', [1, 2, 3, 4].every((d) => existsSync(join(ROOT, 'levels/normal/difficulty-' + d))));
  const sample = inv.files.find((f) => f.oldPath === 'levels/full40/lobby.json');
  check('固定图迁移字节 SHA 不变', !!sample && sha(join(ROOT, 'levels/fixed/lobby.json')) === sample.sha256);
  const arch = inv.files.find((f) => f.oldPath === 'levels/authored/short/test3.json');
  check('作者图归档字节 SHA 不变', !!arch && sha(join(ROOT, 'levels/archive/authored/short/test3.json')) === arch.sha256);
  const catalog = readFileSync(join(ROOT, 'levels/levels.js'), 'utf8');
  check('catalog 不包含 archive/fixed/fallback 条目', catalog.indexOf('"path": "levels/archive/') < 0 &&
    catalog.indexOf('"path": "levels/fixed/') < 0 && catalog.indexOf('"path": "levels/fallback/') < 0);
}

head('sync_levels:有效通过文件真实入池,错误不写半成品');
{
  const normal1 = join(ROOT, 'levels/normal/difficulty-1');
  const fixture = join(normal1, '__test29_sync_fixture.json');
  const before = readFileSync(join(ROOT, 'levels/levels.js'), 'utf8');
  const data = clone(RA.FULL40.fallback);
  data.id = 'test29_sync_fixture'; data.title = 'sync fixture'; data.difficulty = 1;
  data.certification = null; data.contentHash = null;
  let enc = LD.encode(data);
  check('测试 fixture 可编码', enc.ok, enc.ok ? '' : JSON.stringify(enc.error));
  const parsed = JSON.parse(enc.value);
  parsed.certification = certFor(parsed);
  writeFileSync(fixture, JSON.stringify(parsed, null, 2));
  const run = spawnSync(process.execPath, [join(ROOT, 'tools/sync_levels.mjs')], { cwd: ROOT, encoding: 'utf8' });
  const text = readFileSync(join(ROOT, 'levels/levels.js'), 'utf8');
  check('同步退出0并包含有效通过图', run.status === 0 && text.indexOf('test29_sync_fixture') >= 0,
    (run.stderr || '').slice(0, 120));
  check('catalog 记录 builtin 来源与内容 hash', text.indexOf('"source": "builtin"') >= 0 &&
    text.indexOf('"contentHash": "sha256:') > 0);
  const mCat = text.match(/RA\.NORMAL_LEVELS = ([\s\S]*?);\n  \/\/ /);
  const cat = mCat ? JSON.parse(mCat[1]) : [];
  const plan = RA.TowerPlanner.buildFull40({
    seed: 42, candidates: cat, fixedLevels: RA.FULL40.fixed,
    fallback: RA.FULL40.fallback, poolEpoch: RA.FULL40.poolEpoch
  });
  check('目录同步后真实被正式 Planner 读取', plan.ok && plan.value.floors.some((f) =>
    f.kind === 'normal' && f.levelId === 'test29_sync_fixture'));
  unlinkSync(fixture);
  const run2 = spawnSync(process.execPath, [join(ROOT, 'tools/sync_levels.mjs')], { cwd: ROOT, encoding: 'utf8' });
  check('移除 fixture 后回到空池且不残留', run2.status === 0 &&
    readFileSync(join(ROOT, 'levels/levels.js'), 'utf8').indexOf('test29_sync_fixture') < 0);
  check('上一份空池也合法', readFileSync(join(ROOT, 'levels/levels.js'), 'utf8').indexOf('NORMAL_LEVELS = []') >= 0);
  const badDir = join(ROOT, 'levels/normal/difficulty-2');
  const badFile = join(badDir, '__test29_bad_difficulty.json');
  const goodBad = clone(RA.FULL40.fallback);
  goodBad.id = 'test29_bad_difficulty'; goodBad.difficulty = 1;
  goodBad.certification = null; goodBad.contentHash = null;
  const badEnc = JSON.parse(LD.encode(goodBad).value);
  badEnc.certification = certFor(badEnc);
  writeFileSync(badFile, JSON.stringify(badEnc, null, 2));
  const beforeBad = readFileSync(join(ROOT, 'levels/levels.js'), 'utf8');
  const badRun = spawnSync(process.execPath, [join(ROOT, 'tools/sync_levels.mjs')], { cwd: ROOT, encoding: 'utf8' });
  check('档位与目录不符时同步失败且保留旧产物', badRun.status !== 0 &&
    readFileSync(join(ROOT, 'levels/levels.js'), 'utf8') === beforeBad && /difficulty=2/.test(badRun.stderr || ''));
  unlinkSync(badFile);
  check('清理错误 fixture 后仍空池', spawnSync(process.execPath, [join(ROOT, 'tools/sync_levels.mjs')], { cwd: ROOT }).status === 0 &&
    readFileSync(join(ROOT, 'levels/levels.js'), 'utf8').indexOf('NORMAL_LEVELS = []') >= 0);
}

head('正式入口/旧链静态契约');
{
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('index 英文logo/开始/退出/右下设置', idx.indexOf('REVERSE ABYSS') >= 0 && idx.indexOf('btn-formal') >= 0 &&
    idx.indexOf('btn-quit') >= 0 && idx.indexOf('btn-main-settings') >= 0);
  check('index 不加载旧 main/game/tower', idx.indexOf('js/main.js') < 0 && idx.indexOf('js/game.js') < 0 && idx.indexOf('js/tower.js') < 0);
  check('index 加载正式 short/full40/seed-text', idx.indexOf('js/short.js') >= 0 &&
    idx.indexOf('js/full40-samples.js') >= 0 && idx.indexOf('js/seed-text.js') >= 0);
  for (const f of ['short.html', 'legacy.html', 'standard.html', 'devplay.html', 'tests/browser.html']) {
    const h = readFileSync(join(ROOT, f), 'utf8');
    check(f + ' 单向跳 index 且不执行旧控制器', /url=(?:\.\.\/)?index\.html/.test(h) &&
      h.indexOf('js/main.js') < 0 && h.indexOf('js/game.js') < 0 && h.indexOf('js/tower.js') < 0);
  }
  const short = readFileSync(join(ROOT, 'js/short.js'), 'utf8');
  check('short 使用 SeedText 且不再 Date.now 抽塔', short.indexOf('RA.SeedText') >= 0 && short.indexOf('Date.now()') < 0);
  check('short 合并内置 NORMAL_LEVELS 与 published', short.indexOf('builtinCandidates') >= 0 &&
    short.indexOf('collectCandidates') >= 0);
  check('无镜像/可调塔高控件', idx.indexOf('btn-dev') < 0 && idx.indexOf('btn-mirror') < 0 &&
    idx.indexOf('tower-height') < 0 && idx.indexOf('input id="height') < 0);
}

const result = { pass, fail, fails };
const IS_MAIN = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`29 主菜单/目录自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('全部通过 ✔');
  process.exit(0);
}
export { result };
