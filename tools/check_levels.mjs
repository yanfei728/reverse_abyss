#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * check_levels.mjs —— 关卡设计辅助工具
 * =====================================
 * 设计楼层时用这个,不用开游戏就能看出问题。
 *
 * 用法:
 *     node tools/check_levels.mjs                  # 检查 levels/ 里所有关卡
 *     node tools/check_levels.mjs levels/floor03.json
 *     node tools/check_levels.mjs levels/老格式.txt # 老格式的纯地图文本也认
 *     node tools/check_levels.mjs --no-sim         # 只做跳跃包络估算(快)
 *
 * 它会:
 *   1) 把地图打印出来(带列号/行号,方便对着数字改地形)
 *   2) 报告问题:不认识的字符、出生点悬空、出口没插在地上…
 *   3) 用 js/reach.js **真的去模拟跳跃**:一阶一阶地算"从出生点能不能爬到出口",
 *      并且把每一跳的"上升多少 / 横移多少 / 起跳时机"打印出来
 *
 * 注意它只做参考:故意设计成需要极限操作的关卡,"模拟跳不过去"不代表人跳不过去,
 * 但反过来 —— 模拟能过,人就一定能过。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine, ROOT } from './loader.mjs';

const args = process.argv.slice(2);
const noSim = args.includes('--no-sim');
const given = args.filter((a) => !a.startsWith('--'));

const RA = loadEngine();

function mapLegend() {
  const tiles = Object.keys(RA.TILE_IMAGES)
    .map((ch) => `${ch} = ${RA.TILE_IMAGES[ch][1]}`)
    .join('   ');
  return `   + = 空气   ${tiles}   P = 出生点   G = 出口「上一层」   S = 弹簧板`;
}

function printMap(level) {
  // P/G 标在它们"站的地方"的上面那一格(和 abyss 的检查器一个做法)
  const marks = {};
  [['P', level.spawnCol, level.spawnRow], ['G', level.goalCol, level.goalRow]]
    .forEach(([letter, col, groundRow]) => {
      let r = groundRow;
      if (groundRow > 0 && !RA.isTileChar(level.chars[groundRow - 1][col])) {
        r = groundRow - 1;
      }
      marks[col + ',' + r] = letter;
    });

  const tens = '     ' + Array.from({ length: level.cols }, (_, c) => String(Math.floor(c / 10) % 10)).join('');
  const ones = '     ' + Array.from({ length: level.cols }, (_, c) => String(c % 10)).join('');
  console.log(tens);
  console.log(ones);
  for (let r = 0; r < level.rows; r++) {
    let line = '';
    for (let c = 0; c < level.cols; c++) {
      const k = c + ',' + r;
      if (marks[k]) { line += marks[k]; continue; }
      const ch = level.chars[r][c];
      line += ch === ' ' ? '+' : ch;
    }
    console.log(String(r).padStart(4, ' ') + ' ' + line);
  }
}

function hopLine(h, i, level) {
  const info = h.info || {};
  const dy = Math.round((h.from.top - h.to.top));
  const dx = Math.round(info.dx || 0);
  const where = (p) => `列 ${p.col0 + 1}-${p.col1 + 1} 第 ${p.row + 1} 行`;
  const timing = info.params
    ? `助跑 ${info.params.lead} 帧 / 按住 ${info.params.hold} 帧 / ` +
    (info.params.dj ? `隔 ${info.params.dj} 帧补二段跳` : '不补跳')
    : '';
  const tag = dy > 150 ? '[要二段跳]' : (dy > 0 ? '[一段跳]' : '[往下]');
  return `   ✓ ${String(i + 1).padStart(2)}. ${where(h.from)} → ${where(h.to)}` +
    `   上升 ${dy}px 横移 ${Math.abs(dx)}px  ${tag}  ${timing}` +
    (info.frames ? `  第 ${info.frames} 帧落地` : '');
}

function report(level, id, opts) {
  console.log('='.repeat(76));
  console.log(`关卡 ${id}   (${level.rows} 行 × ${level.cols} 列,` +
    `世界 ${level.worldW}×${level.worldH}px,难度 ${level.difficulty},` +
    (level.verified ? '已验证' : '未验证') + ')');
  console.log(`出生点: 第 ${level.spawnCol + 1} 列 第 ${level.spawnRow + 1} 行` +
    `      出口: 第 ${level.goalCol + 1} 列 第 ${level.goalRow + 1} 行`);
  const others = level.entities.filter((e) => e !== level.goal);
  if (others.length) {
    console.log('地图上的其他东西:' + others.map((e) =>
      `${e.constructor.name}(第 ${e.col + 1} 列 第 ${e.row + 1} 行)`).join('、'));
  }
  if (level.objects.length) {
    console.log('objects(带参数的元素):' + level.objects.map((o) =>
      `${o.type}(第 ${o.col + 1} 列 第 ${o.row + 1} 行${Object.keys(o.params).length
        ? ',' + JSON.stringify(o.params) : ''})`).join('、'));
  } else {
    console.log('objects(带参数的元素):没有(地形和地物都在 asc 地图里)');
  }
  if (level.sky) {
    console.log('天空: 第 ' + level.sky + ' 张(assets/sky/sky' + level.sky +
      '.png,这一层自己指定的)');
  } else {
    console.log('天空: 自动(爬塔时随层数循环,一共 ' + (RA.C.SKY_COUNT || 8) + ' 张)');
  }
  console.log(mapLegend());
  printMap(level);
  console.log('-'.repeat(76));

  let problems = 0;
  level.warnings.forEach((w) => { console.log('  ⚠  ' + w); problems++; });
  if (level.groundBelow(level.spawnRow, level.spawnCol) !== level.spawnRow) {
    console.log('  ⚠  出生点脚下不是地面,角色会先掉一段');
    problems++;
  }
  if (level.groundBelow(level.goal.row, level.goal.col) !== level.goal.row) {
    console.log('  ⚠  出口不在实心地形上');
    problems++;
  }

  const t0 = Date.now();
  const r = RA.Reach.path(level, { sim: !opts.noSim });
  const cost = Date.now() - t0;
  console.log(`可达性(${opts.noSim ? '跳跃包络估算' : '逐跳物理模拟'},` +
    `平台 ${r.platforms ? r.platforms.length : 0} 块,算了 ${cost}ms):`);
  if (r.ok) {
    console.log(`  ✓  从出生点爬得到出口,一共 ${r.hops.length} 跳`);
    r.hops.forEach((h, i) => console.log(hopLine(h, i, level)));
  } else {
    console.log('  ⚠  ' + (r.reason || '爬不上去'));
    if (r.highest) {
      console.log(`     最高只到 列 ${r.highest.col0 + 1}-${r.highest.col1 + 1}` +
        ` 第 ${r.highest.row + 1} 行(出口在第 ${level.goalRow + 1} 行)`);
    }
    console.log('     要么把台阶降下来(一段跳约 150px、二段跳约 300px),');
    console.log('     要么加一块落脚的平台 / 弹簧板 S。');
    problems++;
  }
  console.log();
  return problems;
}

// ---------------- 主流程 ----------------
const dir = join(ROOT, 'levels');
let files = given;
if (!files.length) {
  files = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => join(dir, f));
}
if (!files.length) {
  console.log('levels/ 里没有关卡文件');
  process.exit(1);
}

console.log(`reverse_abyss 关卡检查 —— ${files.length} 个文件` +
  `(参数 --no-sim 可以关掉物理模拟)\n`);

let bad = 0;
for (const p of files) {
  const id = basename(p).replace(/\.(json|txt)$/, '');
  if (!existsSync(p)) {
    console.log('找不到文件: ' + p);
    bad++;
    continue;
  }
  const raw = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  // .json 是新格式(asc + 元信息);老格式的纯地图文本也照样能查
  const data = p.endsWith('.json') ? JSON.parse(raw) : { id: id, asc: raw };
  const level = RA.Level.fromData(data, { id: id, source: basename(p) });
  bad += report(level, id, { noSim });
}

console.log('='.repeat(76));
console.log(`检查完毕:${files.length} 个文件,${bad} 条提示`);
if (bad) {
  console.log('(提示不是判死刑:有些关就是要跳的。但可达性标 ⚠ 的请务必看一眼)');
}
process.exit(bad ? 1 : 0);
