#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_world_session.mjs —— 共用 GameSession / 连续楼层 / 生命周期 / 暂停
 * =====================================================================
 *     node tools/test_world_session.mjs
 *
 * 四层诊断夹具:n−1 / n / n+1 生命周期、不同宽高与偏置接口、一次越线提交一次、
 * 上一层地形保留到再上一层、下一层预热但 activeTime 为 0、暂停冻结模拟。
 * 不涉及攻击/伤害/Boss。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEditor, ROOT } from './loader.mjs';

const RA = loadEditor();
const LD = RA.LevelData;
const TS = RA.C.TS;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }
const clone = (v) => JSON.parse(JSON.stringify(v));
const readDev = (name) => JSON.parse(readFileSync(join(ROOT, 'levels/dev', name), 'utf8'));

const floorA = readDev('floor-a.json');
const floorB = readDev('floor-b.json');

function makeFloor(cols, rows, entry, exit, title) {
  const m = RA.EditorModel.create({ cols, rows, withGround: true, title: title || 'fixture' });
  m.data.ports = { profile: 'vertical-v1', entry: { col: entry }, exit: { col: exit } };
  m.data.spawn = { col: 1, row: rows - 2 };
  const enc = LD.encode(m.toData());
  if (!enc.ok) throw new Error('fixture encode: ' + enc.error.message);
  return JSON.parse(enc.value);
}

function makeFour() {
  return [
    makeFloor(14, 8, 2, 5, '四层 A'),
    makeFloor(10, 5, 2, 4, '四层 B'),
    makeFloor(8, 7, 1, 3, '四层 C'),
    makeFloor(12, 6, 2, 6, '四层 D')
  ];
}

/** 把玩家放到当前层接口下方一点,给一个向上速度,再跑若干固定步 */
function crossOnce(session, steps) {
  const floor = session.world.currentFloor;
  const p = session.player;
  p.x = floor.origin.x + floor.exitCol * TS + 6;
  p.y = floor.seamY - p.h + 6;
  p.vx = 0;
  p.vy = -360;
  p.onGround = false;
  for (let i = 0; i < (steps || 60) && session.floorIndex === floor.index; i++) {
    session.stepOnce();
  }
  return session.floorIndex === floor.index + 1;
}

head('GameSession 创建:不合法层拒绝,合法两层可启动');
{
  const bad = clone(floorA);
  bad.ports = null;
  const refused = RA.GameSession.create({ floors: [bad, floorB] });
  check('缺接口的层不能启动试玩',
    !refused.ok && refused.error.code !== undefined &&
    refused.error.message.indexOf('第 1 层') >= 0, refused.error && refused.error.message);
  const none = RA.GameSession.create({ floors: [] });
  check('空楼层拒绝', !none.ok && none.error.code === 'NO_FLOORS');

  const res = RA.GameSession.create({ floors: [floorA, floorB] });
  check('A+B 两层可启动', res.ok, res.ok ? '' : res.error.message);
  const s = res.value;
  const snap = s.snapshot();
  check('初始只有第 0 层活动、第 1 层预热',
    snap.floorIndex === 0 && snap.live.length === 2 &&
    snap.live[0].state === 'active' && snap.live[1].state === 'preview');
  check('不同宽高/偏置接口的原点已对齐',
    s.world.origins[1].x === (floorA.ports.exit.col - floorB.ports.entry.col) * TS &&
    s.world.origins[1].y === -floorB.size.rows * TS,
    JSON.stringify(s.world.origins));
}

head('预热:下一层在动,但 activeTime 为 0、不接触玩家');
{
  const s = RA.GameSession.create({ floors: [floorA, floorB] }).value;
  const preview = s.world.floorAt(1);
  // 诊断用路径对象:只证明预热会跑环境运动;不是攻击实体
  preview.objects = [{
    type: 'gear', col: 1, row: 1, params: {}, pathId: 'diag', _phase: 0
  }];
  preview.paths = {
    diag: {
      id: 'diag', mode: 'pingpong',
      points: [{ col: 1, row: 1 }, { col: 5, row: 1 }]
    }
  };
  const before = { x: preview.objects[0].rx, active: preview.activeTime };
  for (let i = 0; i < 30; i++) s.stepOnce();
  check('预热层时间前进', preview.previewTime > 0.4, String(preview.previewTime));
  check('预热层 activeTime 保持 0', preview.activeTime === 0);
  check('预热层的路径对象在动(非攻击占位)',
    preview.objects[0].rx !== before.x, String(preview.objects[0].rx));
  check('预热不产生 floorEntered 事件',
    s.drainEvents().filter((e) => e.type === 'floorEntered').length === 0);
}

head('一次越线只提交一次,玩家/速度/镜头坐标不重建');
{
  const s = RA.GameSession.create({ floors: [floorA, floorB] }).value;
  for (let i = 0; i < 30; i++) s.stepOnce();            // 落到平台
  const floor0 = s.world.currentFloor;
  const xBefore = s.player.x;
  check('越过接口前在第 0 层', s.floorIndex === 0);
  const did = crossOnce(s, 60);
  check('脚底越线后进入第 1 层', did && s.floorIndex === 1);
  check('玩家对象还是同一个,适配层切到第 1 层',
    s.player === s.world.player && s.player.level === s.world.currentFloor.view);
  const placedX = floor0.origin.x + floor0.exitCol * TS + 6;
  check('世界 x 不因换层被重置', Math.abs(s.player.x - placedX) < 2,
    placedX.toFixed(1) + ' → ' + s.player.x.toFixed(1));
  check('向上速度仍保留(没有被 reset 成 0)', s.player.vy < 0, String(s.player.vy));
  const evs = s.drainEvents().filter((e) => e.type === 'floorEntered');
  check('一次越线只产生一个 floorEntered', evs.length === 1, JSON.stringify(evs));
  check('第 0 层变成地形快照,第 1 层活动',
    s.world.floorAt(0).state === 'snapshot' &&
    s.world.floorAt(1).state === 'active');
  for (let i = 0; i < 30; i++) s.stepOnce();
  const f1 = s.world.currentFloor;
  check('跨层后不会回落:底边梯板把玩家挡在第 1 层',
    s.floorIndex === 1 && s.player.feet <= f1.bottomY + 0.6 && s.player.feet >= f1.seamY,
    'feet=' + s.player.feet.toFixed(2) + ' floor=' + f1.seamY + '..' + f1.bottomY);
}

head('四层夹具:n−1 释放、n 快照、n+1 预热/活动');
{
  const s = RA.GameSession.create({ floors: makeFour() }).value;
  check('四层时初始 live=2(活动 + 预热)', s.world.liveStates().length === 2);
  check('第 1 次越线', crossOnce(s, 90));
  check('进入第 2 层后:第 0 层快照、第 1 层活动、第 2 层预热',
    s.world.floorAt(0).state === 'snapshot' &&
    s.world.floorAt(1).state === 'active' &&
    s.world.floorAt(2) && s.world.floorAt(2).state === 'preview');
  const snapshotTime = s.world.floorAt(0).activeTime;
  for (let i = 0; i < 20; i++) s.stepOnce();
  check('快照层不再模拟(activeTime 冻结)',
    s.world.floorAt(0).activeTime === snapshotTime);
  check('第 2 层预热时间在走', s.world.floorAt(2).previewTime > 0);

  check('第 2 次越线', crossOnce(s, 90));
  check('进入第 3 层时第 0 层才被释放',
    s.world.floorAt(0) === undefined && s.world.floorAt(1).state === 'snapshot' &&
    s.world.floorAt(2).state === 'active' &&
    s.world.floorAt(3).state === 'preview');
  check('第 1 层地形快照仍在', !!s.world.floorAt(1).level);

  check('第 3 次越线', crossOnce(s, 90));
  check('进入第 4 层时第 1 层被释放',
    s.world.floorAt(1) === undefined && s.world.floorAt(2).state === 'snapshot' &&
    s.world.floorAt(3).state === 'active');
  check('last floor 没有下一层预热', s.world.floorAt(4) === undefined);
  check('三次越线共 3 个事件,没有重复',
    s.drainEvents().filter((e) => e.type === 'floorEntered').length === 3);
  check('原点宽度不同但接口逐层对齐',
    s.world.origins.length === 4 &&
    s.world.origins[2].x === s.world.origins[1].x +
      (s.world.floors[1].ports.exit.col - s.world.floors[2].ports.entry.col) * TS);
}

head('暂停冻结模拟,恢复不追算后台时间');
{
  const s = RA.GameSession.create({ floors: [floorA, floorB] }).value;
  for (let i = 0; i < 10; i++) s.stepOnce();
  const t0 = s.time;
  const x0 = s.player.x;
  check('暂停返回 true', s.pause() === true && s.paused === true);
  s.update(2.0);                                   // 模拟后台 2 秒
  check('暂停期间时间与位置完全不变',
    s.time === t0 && s.player.x === x0);
  s.resume();
  check('恢复后不补算后台时间', s.time === t0);
  s.update(1.0);
  check('恢复后只按当前帧推进(最多 5 个固定步)',
    s.time - t0 <= RA.GameSession.STEP * RA.GameSession.MAX_STEPS + 1e-9,
    String(s.time - t0));
  check('暂停/恢复事件成对出现', (() => {
    const evs = s.drainEvents().filter((e) => e.type === 'paused' || e.type === 'resumed');
    return evs.length === 2;
  })());
}

head('页面入口与样例文件同步');
{
  const fs = { readFileSync };
  const html = fs.readFileSync(join(ROOT, 'devplay.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
  const { DEVPLAY_SCRIPTS } = await import('./loader.mjs');
  check('devplay.html 的脚本顺序 = 引擎 + devplay.js',
    scripts.join(',') === DEVPLAY_SCRIPTS.join(','),
    scripts.length + ' vs ' + DEVPLAY_SCRIPTS.length);
  check('devplay.html 有 canvas / HUD / 暂停按钮',
    ['dev-canvas', 'hud', 'btn-pause', 'pause-overlay', 'dev-error']
      .every((id) => html.indexOf('id="' + id + '"') >= 0));
  check('开发样例已嵌入且与 JSON 一致',
    RA.DEV_SAMPLES && RA.DEV_SAMPLES.floorA.id === floorA.id &&
    RA.DEV_SAMPLES.floorB.id === floorB.id &&
    LD.canonical(RA.DEV_SAMPLES.floorA) === LD.canonical(floorA) &&
    LD.canonical(RA.DEV_SAMPLES.floorB) === LD.canonical(floorB));
  check('两份开发样例本身就是合法的 play 数据',
    [floorA, floorB].every((f) =>
      LD.errorsOf(LD.validate(f, { purpose: 'play' })).length === 0));
  check('开发样例没有认证、进不了正式池',
    floorA.certification === null && floorB.certification === null &&
    !RA.LEVEL_TEXT[floorA.id] && !RA.LEVEL_TEXT[floorB.id]);
  const sync = spawnSync(process.execPath, [join(ROOT, 'tools/sync_dev_levels.mjs'), '--check'], {
    encoding: 'utf8', windowsHide: true
  });
  check('js/dev-samples.js 与 levels/dev/*.json 同步', sync.status === 0,
    (sync.stdout || '') + (sync.stderr || ''));
}

export const result = { pass, fail, fails, name: '世界/会话自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`世界/会话自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✓');
  process.exit(0);
}
