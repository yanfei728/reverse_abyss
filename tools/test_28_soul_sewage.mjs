#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_28_soul_sewage.mjs —— 28号卡:灵魂动态轮廓、污水池、怪物互不擦除
 * 真实 Session/Trial + 共享 SoulMotion;不是关卡合规/真人通关。
 */
import { loadEditor } from './loader.mjs';
import { pathToFileURL } from 'node:url';
const RA = loadEditor();
const LD = RA.LevelData, T = RA.C.TS, clone = (v) => JSON.parse(JSON.stringify(v));
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }

function floorData() {
  const cols = 12, rows = 10;
  const tiles = Array.from({ length: rows }, () => new Array(cols).fill(0));
  // 起点/出口云板各2格
  [8, 1].forEach((r) => { tiles[r][1] = 5; tiles[r][2] = 5; });
  // 2x2 方块岛:给魂贴边
  for (let r = 4; r <= 5; r++) for (let c = 4; c <= 6; c++) tiles[r][c] = 4;
  return {
    schemaVersion: 2, id: 'soul_pool_probe', title: 'soul_pool_probe', kind: 'normal', difficulty: 1,
    size: { cols, rows }, terrain: { tiles }, spawn: null,
    ports: { profile: 'cloud-pipe-v2', start: { col: 1, row: 8 }, finish: { col: 1, row: 1 } },
    objects: [], paths: [], visuals: { backgroundId: 'sky1', decorations: [] },
    extensions: {}, contentHash: null, certification: null
  };
}
function make(objects) {
  const d = floorData(); d.objects = objects || [];
  const enc = LD.encode(d);
  if (!enc.ok) throw new Error(JSON.stringify(enc.error));
  const made = RA.GameSession.create({
    floors: [JSON.parse(enc.value)], profile: 'run-v1', requireCloud: true, mode: 'test28'
  });
  if (!made.ok) throw new Error(JSON.stringify(made.error));
  return made.value;
}
function soul(col, row, dir, extra) {
  return Object.assign({ id: 'soul_' + col + '_' + row, type: 'soul', col, row,
    params: { radiusTiles: 0.5, damage: 20, initialDirection: dir }, pathId: null }, extra || {});
}
function pool(col, row) {
  return { id: 'sewage_' + col + '_' + row, type: 'sewage_pool', col, row, params: {}, pathId: null };
}

// ================= 方块几何/方向 =================
head('方块外轮廓方向:相邻空格才合法,非法方向不出现');
{
  let rev = 0;
  const blocks = new Set(['2,2']);
  const g = RA.BlockGeometry.create({
    cols: 10, rows: 10, revision: () => rev, isBlock: (r, c) => blocks.has(r + ',' + c)
  });
  const above = RA.SoulMotion.availableDirections(g, 2, 1, 0.5);
  const left = RA.SoulMotion.availableDirections(g, 1, 2, 0.5);
  check('方块上方合法方向只有左右', above.join(',') === '1,3', above.join(','));
  check('方块左侧合法方向只有上下', left.join(',') === '0,2', left.join(','));
  check('对角空格没有贴边方向', RA.SoulMotion.availableDirections(g, 1, 1, 0.5).length === 0);
  check('方块内部不是可放位置', RA.SoulMotion.availableDirections(g, 2, 2, 0.5).length === 0);
}

// ================= 170px/s 与轮廓 =================
head('单方块绕行 170px/s、非零原点、L形/动态移除');
{
  const blocks = new Set(['4,4']); let rev = 0;
  const g = RA.BlockGeometry.create({
    cols: 14, rows: 14, revision: () => rev, isBlock: (r, c) => blocks.has(r + ',' + c)
  });
  const st = RA.SoulMotion.attach(g, 4 * T + T / 2, 3 * T + T / 2, 1, 0.5);
  check('方块上方贴边成功', !!st && st.attached);
  const s0 = st.s, lp0 = st.loop.total;
  for (let i = 0; i < 60; i++) RA.SoulMotion.step(st, 1 / 60, g, 170);
  const ds = ((st.s - s0) % lp0 + lp0) % lp0;
  check('1秒沿轮廓弧长170px', Math.abs(ds - 170) < 0.01, ds.toFixed(2));
  const boxL = 4 * T, boxR = 5 * T, boxT = 4 * T, boxB = 5 * T;
  const dx = Math.max(boxL - st.rx, 0, st.rx - boxR);
  const dy = Math.max(boxT - st.ry, 0, st.ry - boxB);
  check('非零原点仍保持半径0.5格', Math.abs(Math.hypot(dx, dy) - T / 2) < 1e-6,
    Math.hypot(dx, dy).toFixed(2));
  // 动态移除:不再贴附,当前方向直飞但不穿实心
  rev++; blocks.delete('4,4');
  const before = { x: st.rx, y: st.ry };
  for (let i = 0; i < 10; i++) RA.SoulMotion.step(st, 1 / 60, g, 170);
  check('方块移除后不再有依附/不会瞬移', !st.attached && Math.abs(st.rx - before.x) < 60);
}
{
  // 直飞后遇到下一块重新贴边,且不在方块内
  let rev = 0; const blocks = new Set(['3,4']);
  const g = RA.BlockGeometry.create({ cols: 12, rows: 10, revision: () => rev, isBlock: (r, c) => blocks.has(r + ',' + c) });
  let st = { attached: false, rx: 2 * T + T / 2, ry: 3 * T + T / 2, dir: 1,
    radiusTiles: 0.5, loop: null, s: 0, reverse: false };
  for (let i = 0; i < 120 && !st.attached; i++) st = RA.SoulMotion.step(st, 1 / 60, g, 170);
  check('直飞到下一块后重新贴边', st.attached === true);
  const bx = Math.floor(st.rx / T), by = Math.floor(st.ry / T);
  check('重新贴边后不进入实心方块', !blocks.has(by + ',' + bx));
}
{
  // L形/凹角:可贴边且有限步内不进入实心
  let rev = 0; const blocks = new Set(['2,2', '2,3', '3,2']);
  const g = RA.BlockGeometry.create({ cols: 10, rows: 10, revision: () => rev, isBlock: (r, c) => blocks.has(r + ',' + c) });
  const dirs = RA.SoulMotion.availableDirections(g, 3, 3, 0.5);
  check('L形凹角仍有合法方向', dirs.length > 0, dirs.join(','));
  const st = RA.SoulMotion.attach(g, 3 * T + T / 2, 3 * T + T / 2, dirs[0], 0.5);
  check('L形可附着', !!st && st.attached);
  if (st) {
    for (let i = 0; i < 120; i++) RA.SoulMotion.step(st, 1 / 60, g, 170);
    check('L形运动后不进入实心方块', !blocks.has(Math.floor(st.ry / T) + ',' + Math.floor(st.rx / T)));
  }
}

// ================= 运行:魂/池伤害、无阻挡、光环 =================
head('正式运行:魂170、池20/无敌、无实体阻挡、光环类型');
{
  const s = make([soul(5, 3, 1), pool(8, 6)]);
  const inst = s.world.currentFloor;
  const so = inst.objects.find((o) => o.type === 'soul');
  const po = inst.objects.find((o) => o.type === 'sewage_pool');
  check('灵魂初始化已贴边', so._soul && so._soul.attached);
  check('灵魂初始位置不在方块内部', !inst.isBlockForSoul(so.row, so.col));
  const s0 = so._soul.s, lp0 = so._soul.loop.total;
  inst.moveObjects(1);
  const ds = ((so._soul.s - s0) % lp0 + lp0) % lp0;
  check('灵魂真实1秒沿轮廓弧长170px', Math.abs(ds - 170) < 0.01, ds.toFixed(2));
  check('魂/池都不提供实体碰撞', inst.solidAt(so.row, so.col) === false &&
    inst.solidAt(po.row, po.col) === false);

  // 其它怪物/池不改变同一份方块轮廓
  const loopBefore = RA.SoulMotion.loops(inst.blockGeometry, 0.5).map((l) => l.total).join(',');
  inst.objects.push({ id: 'path_monster_probe', type: 'gear', col: 4, row: 3, pathId: null,
    params: { speedTilesPerSecond: 2, radiusTiles: 0.5, damage: 20 } }, pool(5, 3));
  const loopAfter = RA.SoulMotion.loops(inst.blockGeometry, 0.5).map((l) => l.total).join(',');
  check('其它怪物/池不参与灵魂轮廓', loopBefore === loopAfter,
    loopBefore + ' -> ' + loopAfter);

  // 门/浮石状态参与轮廓;gate消失/浮石gone不计,状态变化使几何revision失效
  const door = { id: 'door_probe', type: 'crumble_door', col: 7, row: 4, params: {}, pathId: null, broken: false };
  const blink = { id: 'blink_probe', type: 'blink_platform', col: 8, row: 4,
    params: { warningSeconds: 0.5, goneSeconds: 1.6 }, pathId: null, state: 'idle', timer: 0 };
  inst.objects.push(door, blink);
  check('存在的门/浮石参与方块轮廓', inst.isBlockForSoul(4, 7) && inst.isBlockForSoul(4, 8));
  door.broken = true; blink.state = 'gone';
  check('门broken/浮石gone不参与方块轮廓', !inst.isBlockForSoul(4, 7) && !inst.isBlockForSoul(4, 8));
  inst.blockRevision = 0;
  blink.state = 'warning'; blink.timer = 0.001;
  inst.updateActiveObjects(1 / 60, { player: s.player }); // 只推进浮石状态
  check('浮石状态变化使几何版本失效', inst.blockRevision > 0);

  // 池接触:20 + 无敌期中不重复 + 到期再20
  const p = s.player;
  p.x = inst.origin.x + po.col * T + 2; p.y = inst.origin.y + po.row * T + 2;
  p.w = 20; p.h = 36;
  s.run.invulnerableRemaining = 0; s._damagedThisStep = false;
  inst.updateActiveObjects(1 / 60, s);
  check('污水池接触扣20', s.run.hp === 80, String(s.run.hp));
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0.5;
  inst.updateActiveObjects(1 / 60, s);
  check('无敌时间内不重复扣', s.run.hp === 80);
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
  inst.updateActiveObjects(1 / 60, s);
  check('无敌到期后再次扣20', s.run.hp === 60, String(s.run.hp));

  // 光环:魂可消灭,池不可
  s.run.haloActiveRemaining = 14; s.run.haloCooldownRemaining = 20;
  s.player.x = inst.origin.x + so.rx; s.player.y = inst.origin.y + so.ry;
  s._applyHalo();
  check('光环消灭灵魂', so.alive === false);
  check('光环不消灭污水池', po.alive !== false && po.type === 'sewage_pool');
}

// ================= 编辑器数据/放置保真 =================
head('编辑器:初始方向/同格共存/不擦地形/JSON');
{
  const m = RA.EditorModel.create({ cols: 12, rows: 10, withGround: false });
  m.setTile(5, 4, 4);
  const beforeTile = m.getTile(5, 4);
  const so = m.placeObject('soul', 5, 3);
  check('soul 放置不擦真实地形', so.ok && m.getTile(5, 4) === beforeTile && beforeTile === 4);
  so.value.params.initialDirection = 1;
  const po = m.placeObject('sewage_pool', 8, 6);
  check('sewage 放置成功', po.ok && po.value.params && po.value.pathId === null);
  m.placeObject('fireball_static', 8, 6);
  check('同格可共存异类怪物(不删火球)', m.objectsAt(8, 6).filter((o) => o.type === 'fireball_static').length === 1);
  const enc = m.toJSON();
  check('soul/sewage 可编码', enc.ok, enc.ok ? '' : JSON.stringify(enc.error));
  const back = RA.EditorModel.fromJSON(enc.value).value;
  const so2 = back.data.objects.find((o) => o.type === 'soul');
  check('保存/读回保留初始方向', so2 && so2.params.initialDirection === 1);
  // 同格异类画笔共存/同类幂等,且不擦地形
  const m2 = RA.EditorModel.create({ cols: 12, rows: 10, withGround: false });
  m2.setTile(4, 5, 4);
  m2.brushObject('spike', 4, 5);
  check('怪物画笔不擦真实地形', m2.getTile(4, 5) === 4);
  m2.brushObject('fireball_static', 4, 5);
  check('异类怪物画笔不删除既有怪物', m2.objectsAt(4, 5).some((o) => o.type === 'spike') &&
    m2.objectsAt(4, 5).some((o) => o.type === 'fireball_static'));
  check('同类画笔幂等', m2.brushObject('fireball_static', 4, 5) === false &&
    m2.objectsAt(4, 5).filter((o) => o.type === 'fireball_static').length === 1);
  const crop = m.cropCandidate();
  check('裁剪候选保留灵魂初始方向', crop.ok && (!crop.value.changed || crop.value.model.data.objects.find((o) => o.type === 'soul').params.initialDirection === 1),
    crop.ok ? '' : JSON.stringify(crop.error));
  // 缺 initialDirection 时 play/load 必须报错
  const bad = floorData(); bad.objects = [soul(5, 3, 1)];
  delete bad.objects[0].params.initialDirection;
  const badIssues = LD.errorsOf(LD.validate(bad, { purpose: 'play' }));
  check('缺失 initialDirection 不被静默补默认', badIssues.some((x) => /initialDirection/.test(x.path)));
}

// ================= 预览/暂停/相位 =================
head('灵魂preview先动不伤害、暂停冻结、入层不重置相位');
{
  const f1 = floorData(); f1.id = 'soul_phase_a';
  const f2 = floorData(); f2.id = 'soul_phase_b'; f2.objects = [soul(5, 3, 1)];
  const e1 = LD.encode(f1), e2 = LD.encode(f2);
  const made = RA.GameSession.create({
    floors: [clone(RA.FULL40.fixed.lobby), JSON.parse(e1.value), JSON.parse(e2.value)],
    profile: 'run-v1', requireCloud: true, mode: 'test28'
  });
  check('三层灵魂会话可创建', made.ok, made.ok ? '' : JSON.stringify(made.error));
  const s = made.value;
  s.setActions({ interactPressed: true }); s.update(1 / 60);
  const pv = s.world.instances.get(2);
  const so = pv && pv.objects.filter((o) => o.type === 'soul')[0];
  check('2层灵魂处于preview', !!so && pv.state === 'preview');
  const s0 = so._soul.s, hp0 = s.run.hp;
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  check('preview灵魂先运动', so._soul.s !== s0);
  check('preview灵魂不伤害当前层玩家', s.run.hp === hp0);
  const s1 = so._soul.s;
  s.pause();
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  check('暂停冻结灵魂运动', so._soul.s === s1);
  s.resume(); s.world.commitNext();
  const act = s.world.instances.get(2).objects.filter((o) => o.type === 'soul')[0];
  check('入层保留灵魂相位,不回到初始方向', s.world.current === 2 && Math.abs(act._soul.s - s1) < 1e-9,
    'current=' + s.world.current);
}

// ================= 独立试玩共用 =================
head('独立试玩共用灵魂/池运动与伤害类型');{
  const d = floorData();
  d.id = 'trial_soul_pool';
  d.objects = [soul(5, 3, 1), pool(8, 6)];
  const enc = LD.encode(d);
  const p = RA.TrialSession.build({
    version: 3, kind: 'editor-validation', profileId: 'run-v1', template: JSON.parse(enc.value),
    subjectRef: { levelId: d.id, contentHash: null }, draftRef: { draftId: d.id, revision: 1 },
    rules: { rulesVersion: RA.RULES.rulesVersion, rulesFingerprint: RA.RULES.rulesFingerprint }, requestId: 't28'
  });
  check('独立试玩可构建含魂/池关卡', p.ok, p.ok ? '' : (p.error && p.error.message));
  const ts = RA.TrialSession.create(p.value);
  const so = ts.inst.objects.find((o) => o.type === 'soul');
  const po = ts.inst.objects.find((o) => o.type === 'sewage_pool');
  const s0 = so._soul.s, lp0 = so._soul.loop.total;
  ts.inst.moveObjects(1);
  const ds = ((so._soul.s - s0) % lp0 + lp0) % lp0;
  check('独立试玩魂共用170贴边', Math.abs(ds - 170) < 0.01, ds.toFixed(2));
  ts.player.x = ts.inst.origin.x + po.col * T + 2; ts.player.y = ts.inst.origin.y + po.row * T + 2;
  ts.run.invulnerableRemaining = 0; ts._damagedThisStep = false;
  ts.inst.updateActiveObjects(1 / 60, ts);
  check('独立试玩池同样扣20', ts.run.hp === 80, String(ts.run.hp));
}

const result = { pass, fail, fails };
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`28 灵魂/污水自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('全部通过 ✔');
  process.exit(0);
}
export { result };
