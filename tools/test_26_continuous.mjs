#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_26_continuous.mjs —— 26号卡:连续接口提交、实存石管几何、邻层云板/管壁碰撞
 * =================================================================================
 *   node tools/test_26_continuous.mjs
 *
 * 使用真实 TowerPlanner/GameSession/Player 步进;每条接缝开始前只做一次合法 finish 站位,
 * 之后全部真实输入。不是完整地图通关/真人验收/关卡合规检查。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEngine, ROOT } from './loader.mjs';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }
const clone = (v) => JSON.parse(JSON.stringify(v));

const R = loadEngine();
const LD = R.LevelData;
const C = R.C;
const plan = R.TowerPlanner.buildFull40({
  fixedLevels: R.FULL40.fixed, fallback: R.FULL40.fallback,
  candidates: [], seed: 1, poolEpoch: R.FULL40.poolEpoch
}).value;

function rawSession() {
  const made = R.GameSession.create({
    floors: plan.floors.map((f) => clone(f.data)), manifest: clone(plan),
    profile: 'run-v1', requireCloud: true, mode: 'full40-formal'
  });
  if (!made.ok) throw new Error(JSON.stringify(made.error));
  return made.value;
}
function fresh() {
  const s = rawSession();
  s.setActions({ interactPressed: true }); s.update(1 / 60);
  return s;
}
function atFinish(s) {
  const p = s.player, l = s.world.links[s.world.current];
  p.x = (l.openingLeft + l.openingRight - p.w) / 2;
  p.y = l.finishY - p.h;
  p.vx = p.vy = 0; p.onGround = true; p.coyote = 0.1; p.jumpsUsed = 0;
  p.prevJump = false; p.jumpBuffer = 0; p.ledgeUsed = false;
  return l;
}
function cross(s, side) {
  const l = atFinish(s), from = s.world.current;
  let crossed = false;
  for (let frame = 0; frame < 90; frame++) {
    const prevFeet = s.player.feet;
    s.setActions({
      jumpHeld: frame < 20 || (frame >= 24 && frame < 60),
      right: side === 'right' && frame >= 14 && frame < 30,
      left: side === 'left' && frame >= 14 && frame < 30
    });
    s.update(1 / 60);
    if (!crossed && prevFeet >= l.commitY && s.player.feet < l.commitY) crossed = true;
    if (s.world.current !== from) break;
  }
  return { from, current: s.world.current, crossed };
}
function climbTo(s, n) {
  while (s.world.current < n) {
    const before = s.world.current;
    cross(s, null);
    if (s.world.current === before) throw new Error('centered preparation stuck at ' + before);
  }
  return s;
}

// ================= ① 合法上穿提交 =================
head('真实右移上穿:1/8/14 接缝一次提交,Player.view/current 同步');
{
  for (const from of [1, 8, 14]) {
    const s = fresh();
    climbTo(s, from);
    const player = s.player;
    s.run.hp = 77;
    s.run.haloCooldownRemaining = 20;
    const r = cross(s, 'right');
    check('第 ' + from + ' 层右移上穿提交到 ' + (from + 1), r.current === from + 1, 'current=' + r.current);
    check('Player.view 同步到目标层', player.level.inst.index === from + 1,
      'view=' + player.level.inst.index);
    check('同一 Player、HP/CD 保留', s.player === player && s.run.hp === 77 &&
      s.run.haloCooldownRemaining > 15, s.run.hp + ' / ' + s.run.haloCooldownRemaining);
    check('再上一层 preview 已创建', s.world.instances.has(from + 2),
      'live=' + [...s.world.instances.keys()].join(','));
    check('实时最多 3 个实例(n−1/n/n+1)', s.world.instances.size === 3,
      [...s.world.instances.keys()].join(','));
    check('目标层已激活、旧层仍为 snapshot', s.world.currentFloor.state === 'active' &&
      s.world.instances.get(from).state === 'snapshot');
  }
  const s = fresh(); climbTo(s, 1);
  const before = s.world.current;
  const r = cross(s, 'left');
  check('向左上穿对照也合法', r.current === before + 1);
}

// ================= ② 规划/实存石管 =================
head('规划链接 vs 实存运行几何:两端实存才生成');
{
  const s = rawSession();
  // 0层只有0/1实存;1→2是规划石管,但2未加载
  const link12 = s.world.links[1];
  check('0层时1→2石管不进入 runtimeLinks',
    s.world.liveStoneLinks().every((l) => l.lowerIndex !== 1));
  check('未实存连接的墙不产生幽灵碰撞',
    !s.world.wallAtWorld(link12.walls[0].x + 10, link12.walls[0].y + C.TS * 1.5));
  check('未实存连接不在下层实例生成 wallCells',
    Object.keys(s.world.instances.get(1).wallCells || {}).length === 0);

  s.setActions({ interactPressed: true }); s.update(1 / 60); // F 0→1, 现在1/2实存
  check('真实进入1后1→2成为运行几何',
    s.world.liveStoneLinks().some((l) => l.lowerIndex === 1));
  check('运行墙有碰撞、且落在下层 wallCells',
    s.world.wallAtWorld(link12.walls[0].x + 10, link12.walls[0].y + C.TS * 1.5) &&
    Object.keys(s.world.instances.get(1).wallCells).length === 6);
  check('绘制和碰撞读取同一份 liveStoneLinks(源码契约)',
    readFileSync(join(ROOT, 'js/short.js'), 'utf8').indexOf('world.liveStoneLinks') >= 0);
}

// ================= ③ 邻层云板/管壁从相关 view 一致 =================
head('同一 live 云板/管壁:active/snapshot/preview view 结果一致');
{
  const s = fresh(); climbTo(s, 5);
  const w = s.world, p = s.player;
  const target = w.instances.get(5);
  const top = target.origin.y + target.finish.row * C.TS;
  const x = target.origin.x + (target.finish.col + 1) * C.TS - p.w / 2;
  const views = [
    ['snapshot4', w.instances.get(4)],
    ['active5', w.instances.get(5)],
    ['preview6', w.instances.get(6)]
  ].filter((v) => v[1]);
  const downs = views.map(([name, inst]) => [name, inst.view.move(x, top - p.h - 0.25, p.w, p.h, 0, 90, 1 / 60)]);
  check('所有 view 对邻层云板下落都能接住', downs.every(([, r]) => r.grounded === true),
    downs.map(([n, r]) => n + ':' + r.grounded).join(' '));
  const ups = views.map(([name, inst]) => [name, inst.view.move(x, top + 10, p.w, p.h, 0, -200, 1 / 60)]);
  check('所有 view 对邻层云板上穿都能过(oneWay 未被当实心)',
    ups.every(([, r]) => r.y < top + 10 - 1), ups.map(([n, r]) => n + ':' + r.y.toFixed(1)).join(' '));
  const link = w.links[5], wall = link.walls[0];
  const wx = wall.x + 10, wy = wall.y + 2 * C.TS;
  const walls = views.map(([name, inst]) => [name, inst.view.move(wx + 2, wy - p.h / 2, p.w, p.h, -180, 0, 1 / 60)]);
  check('所有 view 对已实存管壁横向阻挡一致', walls.every(([, r]) => r.vx === 0),
    walls.map(([n, r]) => n + ':' + r.vx).join(' '));
  const target5 = w.instances.get(5), link56 = w.links[5];
  check('5→6 石管两端实存、进入 runtimeLinks',
    w.liveStoneLinks().some((l) => l.lowerIndex === 5));
  check('5→6 墙在运行几何里', w.wallAtWorld(link56.walls[0].x + 10, link56.walls[0].y + C.TS * 1.5));
}

// ================= ④ 未实存连接无绘制/无碰撞 =================
head('规划了但上层未实存:不显示、不碰撞');
{
  const s = fresh(); climbTo(s, 4);
  const w = s.world;
  check('4层实时实例为3/4/5', [...w.instances.keys()].join(',') === '3,4,5');
  check('5→6 未进入 runtimeLinks', w.liveStoneLinks().every((l) => l.lowerIndex !== 5));
  check('5→6 墙不存在于世界碰撞',
    !w.wallAtWorld(w.links[5].walls[0].x + 10, w.links[5].walls[0].y + C.TS * 1.5));
  check('5号实例不持有5→6派生墙(它只是4→5的上层)',
    Object.keys(w.instances.get(5).wallCells).length === 0,
    Object.keys(w.instances.get(5).wallCells).length + ' cells');
}

// ================= ⑤ 一次提交/重复跳 =================
head('上层 start 附近反复跳不重复入层');
{
  const s = fresh(); climbTo(s, 5);
  const before = s.world.current;
  const eventsBefore = s.events.filter((e) => e.type === 'floorEntered').length;
  const p = s.player, f = s.world.currentFloor;
  p.x = f.level.startX; p.y = f.level.startFeet - p.h - 40;
  for (let i = 0; i < 180; i++) {
    s.setActions({ jumpHeld: true, left: i % 30 < 10, right: i % 30 >= 15 });
    s.update(1 / 60);
  }
  check('反复跳仍停留在同一层', s.world.current === before, 'current=' + s.world.current);
  check('没有重复 floorEntered 事件',
    s.events.filter((e) => e.type === 'floorEntered').length === eventsBefore);
  check('Player.view 仍指向当前层', p.level.inst.index === s.world.current);
}

// ================= ⑥ 绘制只画实存管道 =================
head('short.render:只画已实存石管');
{
  const js = readFileSync(join(ROOT, 'js/short.js'), 'utf8');
  check('管道绘制改用 liveStoneLinks', js.indexOf('liveStoneLinks') >= 0);
  check('不再无条件遍历整塔 links 画管',
    js.indexOf('(state.session.world.links || []).forEach') < 0);
}

const result = { pass, fail, fails, name: '26 连续接口' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`连续接口自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('全部通过 ✔');
  process.exit(0);
}
export { result };
