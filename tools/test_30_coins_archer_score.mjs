#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_30_coins_archer_score.mjs —— 30号卡:金币 / 弓箭手 / 正式塔计分
 * =============================================================
 *   node tools/test_30_coins_archer_score.mjs
 *
 * 用真实 Session/TrialSession/EditorModel 定向验证:
 *   ① 两种直接放置对象的数据/编辑器保真(不擦地形/异类、幂等、JSON 往返、裁剪)
 *   ② 金币只被玩家身体拾取一次;同模板不同实例各自一次;不阻挡、不参与灵魂轮廓
 *   ③ 弓箭手静止、一击光环灭本体、本体接触 20;2 秒首箭/每 2 秒/170px/s/直线不追踪;
 *      箭穿墙命中、不跨层(按所属层域裁剪)、暂停冻结、离层/死亡清箭;非零 origin 一致
 *   ④ 只有正式 full40-formal 计分:入 1..40 各 20(共 800)、击败 5、金币 10,按实例去重,
 *      Boss 只最终击败一次,重试新局 0;试玩无分数、不写最高分
 *   ⑤ HighScoreStore 只存一个 max;低分不覆盖、破纪录才写、损坏/写失败不假成功
 *
 * 不是关卡合规检查,也不是真人通关记录。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEditor, makeCanvas, ROOT } from './loader.mjs';

const RA = loadEditor();
const LD = RA.LevelData;
const T = RA.C.TS;
const clone = (v) => JSON.parse(JSON.stringify(v));
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }

// ================= 夹具 =================
function levelData(over) {
  const cols = 14, rows = 12;
  const tiles = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) { tiles[10][c] = 4; tiles[11][c] = 4; }
  tiles[10][5] = 5; tiles[10][6] = 5;          // start 云板(2×1)
  tiles[2][5] = 5; tiles[2][6] = 5;            // finish 云板(2×1)
  tiles[2][4] = 4; tiles[2][7] = 4;            // 端点两侧实心
  const d = {
    schemaVersion: 2, id: 'coin_archer_probe', title: 'coin archer probe', kind: 'normal', difficulty: 1,
    size: { cols, rows }, terrain: { tiles }, spawn: null,
    ports: { profile: 'cloud-pipe-v2', start: { col: 5, row: 10 }, finish: { col: 5, row: 2 } },
    objects: [], paths: [], visuals: { backgroundId: 'sky1', decorations: [] },
    extensions: {}, contentHash: null, certification: null
  };
  if (over) Object.assign(d, over);
  return d;
}
function coin(col, row, id) {
  return { id: id || ('coin_' + col + '_' + row), type: 'coin', col, row, params: {}, pathId: null };
}
function archer(col, row, id) {
  return { id: id || ('archer_' + col + '_' + row), type: 'archer', col, row, params: {}, pathId: null };
}
function makeSession(objects, opts) {
  const d = levelData();
  d.objects = objects || [];
  const enc = LD.encode(d);
  if (!enc.ok) throw new Error(JSON.stringify(enc.error));
  const r = RA.GameSession.create({
    floors: [JSON.parse(enc.value)],
    profile: 'run-v1', mode: (opts && opts.mode) || 'short-dev', requireCloud: true
  });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}
function formalSession(objects) {
  return makeSession(objects, { mode: 'full40-formal' });
}
function handoff(data, profileId) {
  return {
    version: 3, kind: 'editor-validation', profileId: profileId || 'run-v1', template: clone(data),
    subjectRef: { levelId: data.id, contentHash: null }, draftRef: { draftId: data.id, revision: 1 },
    rules: { rulesVersion: RA.RULES.rulesVersion, rulesFingerprint: RA.RULES.rulesFingerprint }, requestId: 't30'
  };
}
function newTrial(objects) {
  const d = levelData();
  d.objects = objects || [];
  const enc = LD.encode(d);
  const p = RA.TrialSession.build(handoff(JSON.parse(enc.value)));
  if (!p.ok) throw new Error(p.error && p.error.message);
  return RA.TrialSession.create(p.value);
}
function putPlayerOn(s, col, row) {
  const inst = s.world ? s.world.currentFloor : s.inst;   // TrialSession 只有当前一张图
  const p = s.player;
  p.x = inst.origin.x + col * T + T / 2 - p.w / 2;
  p.y = inst.origin.y + row * T + T / 2 - p.h / 2;
  p.vx = 0; p.vy = 0;
}
/** 精确模拟 n 个固定步(不经 accumulator,便于数箭的发射步数) */
function stepN(s, n) {
  for (let i = 0; i < n; i++) { s.setActions({}); s.stepOnce(); }
}

// ================= ① 数据与编辑器 =================
head('两种直接放置对象:注册表类别、编辑器保真、JSON 往返、裁剪');
{
  const reg = RA.EntityRegistry;
  check('coin/archer 已注册且无参数、无路径',
    reg.has('coin') && reg.has('archer') &&
    reg.get('coin').params.length === 0 && reg.get('archer').params.length === 0 &&
    reg.get('coin').requiresPath === false && reg.get('archer').requiresPath === false);
  check('coin 是 collectible、archer 是 hostile(金币不当怪物)',
    reg.get('coin').category === 'collectible' && reg.get('archer').category === 'hostile');
  check('光环可消灭 archer、不可消灭 coin',
    RA.MonsterRules.haloDestroyable('archer') === true &&
    RA.MonsterRules.haloDestroyable('coin') === false);

  const m = RA.EditorModel.create({ cols: 14, rows: 12, withGround: false });
  m.setTile(6, 5, 4);
  const keepTile = m.getTile(6, 5);
  m.placeObject('spike', 6, 5);
  const c = m.placeObject('coin', 6, 5);
  const a = m.placeObject('archer', 6, 5);
  check('金币放置成功且 params={} / pathId=null',
    c.ok && JSON.stringify(c.value.params) === '{}' && c.value.pathId === null);
  check('弓箭手放置成功且 params={} / pathId=null',
    a.ok && JSON.stringify(a.value.params) === '{}' && a.value.pathId === null);
  check('放置不擦真实地形、不删同格异类机关',
    m.getTile(6, 5) === keepTile && keepTile === 4 &&
    m.objectsAt(6, 5).some((o) => o.type === 'spike'));
  check('同格同 type 画笔幂等(不新增)',
    m.brushObject('coin', 6, 5) === false &&
    m.objectsAt(6, 5).filter((o) => o.type === 'coin').length === 1);
  check('异类怪物/对象可同格共存', m.objectsAt(6, 5).length === 3);

  const enc = m.toJSON();
  check('两 type 可编码', enc.ok, enc.ok ? '' : JSON.stringify(enc.error));
  const back = RA.EditorModel.fromJSON(enc.value);
  check('保存/读回保留 coin 与 archer',
    back.ok && back.value.data.objects.filter((o) => o.type === 'coin').length === 1 &&
    back.value.data.objects.filter((o) => o.type === 'archer').length === 1);
  const crop = back.value.cropCandidate();
  check('裁剪候选保留 coin/archer 与空参数',
    crop.ok && (!crop.value.changed || (
      crop.value.model.data.objects.some((o) => o.type === 'coin' && Object.keys(o.params).length === 0) &&
      crop.value.model.data.objects.some((o) => o.type === 'archer' && Object.keys(o.params).length === 0))),
    crop.ok ? '' : JSON.stringify(crop.error));

  // 共享读取检查:路径对 coin/archer 必须为 null
  const bad = levelData();
  bad.objects = [Object.assign(coin(7, 6), { pathId: 'path_x' })];
  bad.paths = [{ id: 'path_x', mode: 'pingpong', points: [{ col: 7, row: 6 }, { col: 8, row: 6 }] }];
  const badIssues = LD.errorsOf(LD.validate(bad, { purpose: 'load' }));
  check('coin 带路径时 load 检查拒绝(不使用路径)',
    badIssues.some((x) => /pathId/.test(x.path || '')));

  // 编辑器实例级直接放置(同 test_editor 的构造方式)
  const repo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  const ed = new RA.Editor(makeCanvas(900, 600), { repo });
  ed.selectChar('~coin');
  check('选择金币工具不报错', ed.ch === '~coin');
  const u0 = ed.undoStack.length;
  check('第一枚金币占一步撤销', ed.placeDirectObject('coin', { c: 3, r: 4 }) === true &&
    ed.undoStack.length === u0 + 1);
  check('同一拖动内再放一枚同格不新增也不新增撤销',
    ed.placeDirectObject('coin', { c: 3, r: 4 }) === false && ed.undoStack.length === u0 + 1);
  check('拖动到另一格放第二枚,同一步撤销',
    ed.placeDirectObject('coin', { c: 4, r: 4 }) === true && ed.undoStack.length === u0 + 1);
  ed.directStroke = false;
  ed.placeDirectObject('archer', { c: 7, r: 5 });
  check('弓箭手一次点击放一个', ed.model.objects.filter((o) => o.type === 'archer').length === 1);
}

// ================= ② 金币拾取 =================
head('金币:只被玩家身体拾取一次、无阻挡、不参与灵魂轮廓、每实例独立');
{
  const s = formalSession([coin(7, 9, 'c_a'), coin(7, 9, 'c_b'), coin(9, 9, 'c_c')]);
  const inst = s.world.currentFloor;
  check('金币不提供实体碰撞', inst.solidAt(9, 7) === false);
  const loopsBefore = RA.SoulMotion ? RA.SoulMotion.loops(inst.blockGeometry, 0.5).map((l) => l.total).join(',') : '';
  inst.objects.push(Object.assign(archer(11, 9), {}));
  const loopsAfter = RA.SoulMotion ? RA.SoulMotion.loops(inst.blockGeometry, 0.5).map((l) => l.total).join(',') : '';
  check('金币/弓箭手都不参与灵魂外轮廓', loopsBefore === loopsAfter, loopsBefore + ' -> ' + loopsAfter);
  inst.objects.pop();

  const ca = inst.objects[0], cb = inst.objects[1], cc = inst.objects[2];
  putPlayerOn(s, 7, 9);
  s._damagedThisStep = false;
  inst.updateActiveObjects(1 / 60, s);
  check('身体接触金币后消失', ca.collected === true && cb.collected === true);
  check('同格两枚金币各算一次(实例去重)', s.score === 20, 'score=' + s.score);
  inst.updateActiveObjects(1 / 60, s);
  check('同一枚金币不会重复拾取、不加分', s.score === 20, 'score=' + s.score);
  check('金币不计入击杀/不扣血', s.run.hp === 100);
  putPlayerOn(s, 9, 9);
  inst.updateActiveObjects(1 / 60, s);
  check('另一个位置的金币仍可拾取(+10)', cc.collected === true && s.score === 30, 'score=' + s.score);

  // 光环不代捡:把金币放在光环范围内但玩家身体不接触
  const s2 = formalSession([coin(11, 3)]);
  const inst2 = s2.world.currentFloor;
  putPlayerOn(s2, 3, 9);
  s2.castSkill();
  s2._applyHalo();
  check('光环范围内但未被身体接触的金币不会被捡/不加分',
    inst2.objects[0].collected !== true && s2.score === 0, 'score=' + s2.score);
}

// ================= ③ 弓箭手与箭 =================
head('弓箭手:2 秒首箭/每 2 秒、170px/s、直线不追踪、穿墙、不跨层');
{
  const s = makeSession([archer(2, 9)]);
  const inst = s.world.currentFloor;
  const a = inst.objects[0];
  putPlayerOn(s, 10, 9);
  stepN(s, 119);
  check('入层后不满 2 秒不射箭(119 步)', inst.arrowSeq === 0 && inst.arrows.length === 0,
    'seq=' + inst.arrowSeq);
  let fireStep = -1;
  for (let i = 120; i <= 124; i++) {
    s.setActions({}); s.stepOnce();
    if (inst.arrowSeq > 0 && fireStep < 0) fireStep = i;
  }
  check('第一箭在入层约 2 秒(120–122 步)', fireStep >= 120 && fireStep <= 122, 'step=' + fireStep);
  check('满 2 秒射第一箭', inst.arrowSeq === 1, 'seq=' + inst.arrowSeq);
  const shot1 = inst.arrows[0];
  check('箭绑定所属实例与来源', !!shot1 && shot1.ownerInstanceId === inst.instanceId &&
    shot1.sourceObjectId === a.id);
  check('发射方向是玩家所在方向(朝右,水平 ±0.05)',
    !!shot1 && shot1.vx > 0.999 && Math.abs(shot1.vy) < 0.05,
    shot1 ? shot1.vx.toFixed(3) + ',' + shot1.vy.toFixed(3) : 'no arrow');
  // 移走玩家:已经射出的箭不追踪、方向不变
  putPlayerOn(s, 2, 3);
  const dirX = shot1.vx, dirY = shot1.vy, x0 = shot1.x, y0 = shot1.y;
  stepN(s, 30);
  const moved = Math.hypot(shot1.x - x0, shot1.y - y0);
  check('0.5 秒飞 85px(170px/s)且方向不变', Math.abs(moved - 85) < 0.6 &&
    shot1.vx === dirX && shot1.vy === dirY, moved.toFixed(2));
  const cross = (shot1.x - x0) * dirY - (shot1.y - y0) * dirX;
  check('飞行轨迹保持直线(不追踪移动后的玩家)', Math.abs(cross) < 1e-6, cross.toExponential(2));
  // 第二箭在 ~4 秒
  const secondBefore = inst.arrowSeq;
  for (let i = 0; i < 130 && inst.arrowSeq < secondBefore + 1; i++) { s.setActions({}); s.stepOnce(); }
  check('每 2 秒一箭(第 2 箭在约 4 秒)', inst.arrowSeq === secondBefore + 1, 'seq=' + inst.arrowSeq);

  // 穿墙:隔着实心地形仍命中玩家
  const d = levelData();
  d.objects = [archer(2, 9)];
  d.terrain.tiles[9][5] = 4;
  d.terrain.tiles[9][6] = 4;
  const enc = LD.encode(d);
  const sw = RA.GameSession.create({ floors: [JSON.parse(enc.value)], profile: 'run-v1', mode: 'short-dev' });
  const s3 = sw.value;
  putPlayerOn(s3, 10, 9);
  stepN(s3, 260);
  check('箭穿墙命中玩家扣 20(不参与地形碰撞)', s3.run.hp === 80, 'hp=' + s3.run.hp);

  // 不跨层:所属层域以 finish 顶面为上界;箭到边界消失,上层不动
  const s4 = makeSession([archer(5, 5)]);
  const inst4 = s4.world.currentFloor;
  const dom = RA.arrowDomainRect(inst4);
  check('箭域上界 = finish 顶面、下界 = start 云板底面',
    dom.top === 2 * T && dom.bottom === 11 * T, JSON.stringify(dom));
  putPlayerOn(s4, 5, 1);                         // 在 finish 之上的"邻层"位置
  s4.run.hp = 100; s4.run.invulnerableRemaining = 0;
  // 只推进场景对象(不跑玩家物理),避免角色落到 finish 云板上又回到域内
  for (let i = 0; i < 200; i++) { s4._damagedThisStep = false; inst4.updateActiveObjects(1 / 60, s4); }
  check('箭到本层上接口即消失,不会伤到域外/邻层', s4.run.hp === 100 && inst4.arrows.length === 0,
    'hp=' + s4.run.hp + ' arrows=' + inst4.arrows.length);
  check('域内线段裁剪:越界段 t1<1', (function () {
    const seg = RA.clipSegmentToRect(5 * T, 2 * T + 10, 5 * T, 2 * T - 40, dom);
    return !!seg && seg.t1 < 1 - 1e-9;
  })());

  // 本体接触 20、沿用无敌时间
  const s5 = makeSession([archer(7, 9)]);
  putPlayerOn(s5, 7, 9);
  s5._damagedThisStep = false; s5.run.invulnerableRemaining = 0;
  s5.world.currentFloor.updateActiveObjects(1 / 60, s5);
  check('本体接触扣 20', s5.run.hp === 80, 'hp=' + s5.run.hp);
  s5._damagedThisStep = false; s5.run.invulnerableRemaining = 0.5;
  s5.world.currentFloor.updateActiveObjects(1 / 60, s5);
  check('无敌时间内本体接触不重复扣', s5.run.hp === 80);

  // 光环只杀本体,不清箭
  const s6 = makeSession([archer(7, 9)]);
  const inst6 = s6.world.currentFloor;
  const a6 = inst6.objects[0];
  inst6.arrows.push({
    id: inst6.instanceId + ':arrow_manual', ownerInstanceId: inst6.instanceId,
    sourceObjectId: a6.id, x: 3 * T, y: 9 * T, prevX: 3 * T, prevY: 9 * T, vx: 1, vy: 0, alive: true, age: 0
  });
  putPlayerOn(s6, 7, 9);
  s6.castSkill(); s6._applyHalo();
  check('光环一击消灭弓箭手本体', a6.alive === false);
  check('光环不清理已射出的箭', inst6.arrows.length === 1);
  putPlayerOn(s6, 3, 9);
  const arrow6 = inst6.arrows[0];
  arrow6.x = s6.player.x + s6.player.w / 2;
  arrow6.y = s6.player.y + s6.player.h / 2;
  const hpBefore = s6.run.hp = 100; s6.run.invulnerableRemaining = 0; s6._damagedThisStep = false;
  inst6.updateActiveObjects(1 / 60, s6);
  check('本体死后已发箭仍继续命中', s6.run.hp < hpBefore, 'hp=' + s6.run.hp);

  // 暂停冻结
  const s7 = makeSession([archer(2, 9)]);
  const inst7 = s7.world.currentFloor;
  putPlayerOn(s7, 10, 9);
  stepN(s7, 120);
  const age0 = inst7.objects[0].shotElapsed, x7 = inst7.arrows.length ? inst7.arrows[0].x : null;
  s7.pause();
  for (let i = 0; i < 60; i++) s7.update(1);
  check('暂停冻结射击计时与箭', inst7.objects[0].shotElapsed === age0 &&
    (!inst7.arrows.length || inst7.arrows[0].x === x7));
  s7.resume();

  // 离层 / 死亡清箭
  const lobby = clone(RA.FULL40.fixed.lobby);
  const d8 = levelData();
  d8.objects = [archer(2, 9)];
  const enc8 = LD.encode(d8);
  const r8 = RA.GameSession.create({
    floors: [lobby, JSON.parse(enc8.value)], profile: 'run-v1', mode: 'full40-formal', requireCloud: true
  });
  const s8 = r8.value;
  const lobbyInst = s8.world.currentFloor;
  lobbyInst.arrows.push({ id: 'x', ownerInstanceId: lobbyInst.instanceId, sourceObjectId: 'a', x: 1, y: 1, prevX: 1, prevY: 1, vx: 1, vy: 0, alive: true, age: 0 });
  const tr = s8.world.transferNext(s8.player);
  check('F 传送后旧层的箭被清掉', tr.ok && lobbyInst.arrows.length === 0, JSON.stringify(tr.error || (tr.value && tr.value.to)));
  const s9 = formalSession([archer(2, 9)]);
  putPlayerOn(s9, 10, 9);
  stepN(s9, 120);
  s9.die('probe');
  check('死亡后清空本层箭', s9.world.currentFloor.arrows.length === 0);
}

head('非零 origin:金币拾取 / 弓箭手命中 / 箭域仍按世界局部坐标一致');
{
  const lobby = clone(RA.FULL40.fixed.lobby);
  const d = levelData();
  d.id = 'origin_probe';
  d.objects = [coin(7, 9, 'coin_origin'), archer(2, 9, 'archer_origin')];
  const enc = LD.encode(d);
  const made = RA.GameSession.create({
    floors: [lobby, JSON.parse(enc.value)], profile: 'run-v1', mode: 'full40-formal', requireCloud: true
  });
  const s = made.value;
  const fs = s.world.currentFloor.data.extensions.fixedScene.playerSpawn;
  s.player.x = s.world.currentFloor.origin.x + fs.centerCol * T - s.player.w / 2;
  s.player.y = s.world.currentFloor.origin.y + (fs.feetRow - 1) * T - s.player.h;
  s.actions.interactPressed = true; s.stepOnce();
  const inst = s.world.currentFloor;
  check('进入的第 1 层 origin 非零(避免局部/世界混淆)',
    inst.origin.x !== 0 || inst.origin.y !== 0, JSON.stringify(inst.origin));
  putPlayerOn(s, 7, 9);
  s._damagedThisStep = false;
  inst.updateActiveObjects(1 / 60, s);
  check('非零 origin 下金币仍被正确拾取(+10,连入层共 30)', s.score === 30, 'score=' + s.score);
  putPlayerOn(s, 10, 9);
  s.run.invulnerableRemaining = 0; s.run.hp = 100;
  stepN(s, 260);
  check('非零 origin 下弓箭手仍能瞄准并命中玩家', s.run.hp === 80, 'hp=' + s.run.hp);
}

// ================= ④ 正式计分 =================
head('正式计分:入层 20/击败 5/金币 10、去重、Boss 最终一次、41 槽 800、重试 0');
function planFull40(seed) {
  return RA.TowerPlanner.buildFull40({
    seed: seed || 3, candidates: [], fixedLevels: RA.FULL40.fixed, fallback: RA.FULL40.fallback,
    poolEpoch: RA.FULL40.poolEpoch
  });
}
function fullSession(plan) {
  const floors = plan.value.floors.map((f) => clone(f.data));
  const r = RA.GameSession.create({
    floors, profile: 'run-v1', requireCloud: true, mode: 'full40-formal', manifest: plan.value
  });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}
function activate(s, n) {
  const res = s.world.activateSlot(n);
  s.boss = null;
  s._onFloorEntered({ from: n, to: n });
  const inst = res.value.inst;
  const p = s.player;
  p.level = inst.view;
  if (inst.cloud && inst.level.startLocalX !== undefined) { p.x = inst.level.startX; p.y = inst.level.startFeet - p.h; }
  p.vx = 0; p.vy = 0;
  return res.value;
}
{
  const s = fullSession(planFull40(3));
  check('正式局初始 0 分', s.formal === true && s.score === 0 && s.snapshot().score === 0);
  // 0 层不出生加分
  s._onFloorEntered({ from: 0, to: 0 });
  check('0 层大厅不加分', s.score === 0);
  // F 进 1 层 +20
  const fs = s.world.currentFloor.data.extensions.fixedScene.playerSpawn;
  s.player.x = s.world.currentFloor.origin.x + fs.centerCol * T - s.player.w / 2;
  s.player.y = s.world.currentFloor.origin.y + (fs.feetRow - 1) * T - s.player.h;
  s.actions.interactPressed = true;
  s.stepOnce();
  check('F 进第 1 层 +20', s.world.current === 1 && s.score === 20, 'score=' + s.score);
  s._onFloorEntered({ from: 1, to: 1 });
  check('重复 floorEntered 不重复加层分', s.score === 20);
}
{
  // 在真实第 1 层上放一个金币与弓箭手(作为该层模板对象,实例自己带 rx/ry)
  const lobby = clone(RA.FULL40.fixed.lobby);
  const d = levelData();
  d.id = 'score_floor';
  d.objects = [coin(7, 9, 'coin_live'), archer(2, 9, 'archer_live')];
  const enc = LD.encode(d);
  const made = RA.GameSession.create({
    floors: [lobby, JSON.parse(enc.value)], profile: 'run-v1', mode: 'full40-formal', requireCloud: true
  });
  const s = made.value;
  const fs = s.world.currentFloor.data.extensions.fixedScene.playerSpawn;
  s.player.x = s.world.currentFloor.origin.x + fs.centerCol * T - s.player.w / 2;
  s.player.y = s.world.currentFloor.origin.y + (fs.feetRow - 1) * T - s.player.h;
  s.actions.interactPressed = true; s.stepOnce();
  const inst = s.world.currentFloor;
  const liveCoin = inst.objects.filter((o) => o.type === 'coin')[0];
  putPlayerOn(s, 7, 9);
  s._damagedThisStep = false;
  inst.updateActiveObjects(1 / 60, s);
  check('正式拾取金币 +10', s.score === 30 && liveCoin.collected, 'score=' + s.score);
  const liveArcher = inst.objects.filter((o) => o.type === 'archer')[0];
  putPlayerOn(s, 2, 9);
  s.run.haloCooldownRemaining = 0;
  s.castSkill();
  s._applyHalo();
  check('正式击败弓箭手 +5 且只一次', liveArcher.alive === false && s.score === 35, 'score=' + s.score);
  s._damagedThisStep = false;
  s._applyHalo();
  check('持续光环/重复帧不重复加击杀分', s.score === 35);

  // 已死对象不假击杀
  liveArcher.alive = false;
  s._applyHalo();
  check('已死对象不会被再次击杀计分', s.score === 35);
  // 机械类不可击败,不加击杀分
  const gear = { id: 'gear_probe', type: 'gear', col: 4, row: 4, pathId: 'p_probe', params: {},
    rx: 4 * T + T / 2, ry: 4 * T + T / 2, alive: true };
  inst.objects.push(gear);
  inst.paths.p_probe = { id: 'p_probe', mode: 'pingpong', points: [{ col: 4, row: 4 }] };
  putPlayerOn(s, 4, 4);
  s._applyHalo();
  check('齿轮等机关不被光环击败、不加击杀分', s.score === 35 && gear.alive === true);
}
{
  // 41 槽全部 1..40 入层 = 800,再打 Boss 最终 +5
  const plan = planFull40(5);
  const s = fullSession(plan);
  for (let n = 1; n <= 40; n++) activate(s, n);
  check('1..40 层首次进入共 800 分', s.score === 800, 'score=' + s.score);
  check('snapshot.score 与真实分一致', s.snapshot().score === 800);
  // 40 层 Boss:两阶段后最终击败 +5,再胜利
  const boss = s.boss;
  check('40 层有独立 Boss', !!boss && s.world.current === 40);
  boss.shieldRemaining = 0.01; boss.update(0.02, s);
  s.run.haloCooldownRemaining = 0; s.run.hp = 100;
  putPlayerOn(s, 0, 0);
  s.player.x = boss.x + boss.w / 2 - s.player.w / 2;
  s.player.y = boss.y + boss.h / 2 - s.player.h / 2;
  s.castSkill(); s.stepOnce();
  boss.resolvingTimer = 0; boss.update(0.01, s);
  check('Boss 第一阶段切换不加击杀分', s.score === 800 && boss.phase === 2, 'score=' + s.score);
  boss.shieldRemaining = 0.01; boss.update(0.02, s);
  s.run.haloCooldownRemaining = 0;
  s.player.x = boss.x + boss.w / 2 - s.player.w / 2;
  s.player.y = boss.y + boss.h / 2 - s.player.h / 2;
  s.castSkill(); s.stepOnce();
  boss.resolvingTimer = 0; boss.update(0.01, s);
  check('Boss 最终击败 +5 且先入账再胜利', boss.defeated && s.status === 'won' && s.score === 805,
    'score=' + s.score);

  // 重试/新开始:新局 0,manifest 不重抽
  const again = fullSession(plan);
  check('重试同一清单但新局 0 分', again.score === 0 && again.manifestId === s.manifestId);
}
{
  // 同模板不同槽位:同一 coin id 各自一次
  const lobby = clone(RA.FULL40.fixed.lobby);
  const d = levelData();
  d.id = 'same_template_floor';
  d.objects = [coin(3, 9, 'coin_same')];
  const enc = LD.encode(d);
  const r = RA.GameSession.create({
    floors: [lobby, JSON.parse(enc.value), JSON.parse(enc.value)],
    profile: 'run-v1', mode: 'full40-formal', requireCloud: true
  });
  const s = r.value;
  s.actions.interactPressed = true; s.stepOnce();          // 0→1 (+20)
  const inst1 = s.world.currentFloor;
  putPlayerOn(s, 3, 9);
  inst1.updateActiveObjects(1 / 60, s);
  check('第 1 槽金币 +10', s.score === 30, 'score=' + s.score);
  // 进入第 2 槽(同一模板数据:同对象 id 的独立实例)
  const ev = s.world.commitNext();
  s._onFloorEntered(ev);
  const inst2 = s.world.currentFloor;
  putPlayerOn(s, 3, 9);
  inst2.updateActiveObjects(1 / 60, s);
  check('同模板重复槽位的同名金币各算一次(实例去重)', s.score === 60, 'score=' + s.score);
  // 重复拾取同一实例不再加
  inst2.updateActiveObjects(1 / 60, s);
  check('同一实例金币不会再加', s.score === 60);
}
{
  // 非正式(调试短塔/试玩)不创建分数
  const s = makeSession([coin(7, 9), archer(2, 9)], { mode: 'short-dev' });
  const inst = s.world.currentFloor;
  putPlayerOn(s, 7, 9);
  inst.updateActiveObjects(1 / 60, s);
  s.run.haloCooldownRemaining = 0;
  putPlayerOn(s, 2, 9);
  s.castSkill(); s._applyHalo();
  check('非正式局 score 保持 null,不发 scoreChanged',
    s.snapshot().score === null && s.formal === false &&
    !s.events.some((e) => e.type === 'scoreChanged'));
  const events = s.drainEvents();
  check('非正式局仍会捡金币/杀敌(只是不计分)',
    inst.objects.some((o) => o.type === 'coin' && o.collected) &&
    events.some((e) => e.type === 'fireballDestroyed'));
}

// ================= ⑤ 试玩:同行为、无分数 =================
head('试玩:金币/弓箭手行为相同,但没有分数与最高分写入');
{
  const ts = newTrial([coin(7, 9), archer(2, 9)]);
  const inst = ts.inst;
  check('试玩没有计分状态/快照分数', ts.snapshot().score === undefined && ts.formal === undefined);
  putPlayerOn(ts, 7, 9);
  ts._damagedThisStep = false;
  inst.updateActiveObjects(1 / 60, ts);
  check('试玩里金币同样被拾取消失', inst.objects[0].collected === true);
  check('试玩拾取金币不产生分数事件', !ts.events.some((e) => /score/.test(e.type)));
  putPlayerOn(ts, 10, 9);
  ts.run.invulnerableRemaining = 0;
  stepN(ts, 300);
  check('试玩里弓箭手同样在 2 秒后射箭并扣血', ts.run.hp < 100, 'hp=' + ts.run.hp);
  putPlayerOn(ts, 2, 9);
  ts.run.invulnerableRemaining = 0;
  ts.run.haloCooldownRemaining = 0;
  ts.pressSkill(); ts._applyHalo();
  check('试玩里光环同样消灭弓箭手本体',
    inst.objects.filter((o) => o.type === 'archer').every((o) => o.alive === false));
  check('试玩会话没有计分回调/最高分依赖',
    typeof ts.onCoinCollected === 'undefined' &&
    Object.keys(ts).every((k) => !/score/i.test(k)));
  ts.dispose();
  check('试玩 dispose 清箭', inst.arrows.length === 0);
}

// ================= ⑥ HighScoreStore =================
head('最高分:只存一个 max、低分不覆盖、损坏/失败不假成功');
{
  const HS = RA.HighScoreStore;
  function mem(initial) {
    const data = Object.assign({}, initial || {});
    return {
      getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem(k, v) { data[k] = String(v); },
      removeItem(k) { delete data[k]; },
      __data: data
    };
  }
  check('独立 key 为 ra_high_score_v1', HS.KEY === 'ra_high_score_v1');
  const st = mem({ other_key: 'keep-me' });
  check('无记录时读回 0', HS.read(st).ok && HS.read(st).value.bestScore === 0);
  let res = HS.submit(st, 30);
  check('首次提交 30 写入并回读', res.ok && res.value.updated === true && HS.read(st).value.bestScore === 30);
  res = HS.submit(st, 20);
  check('更低分不覆盖最高值', res.ok && res.value.updated === false && HS.read(st).value.bestScore === 30);
  res = HS.submit(st, 60);
  check('破纪录写入新 max', res.ok && res.value.updated === true && HS.read(st).value.bestScore === 60);
  const raw = JSON.parse(st.getItem(HS.KEY));
  check('只存 {version:1,bestScore},没有逐局记录/日期/种子',
    Object.keys(raw).sort().join(',') === 'bestScore,version' && raw.version === 1 && raw.bestScore === 60,
    JSON.stringify(raw));
  check('不碰其它存储键', st.getItem('other_key') === 'keep-me');
  check('损坏记录如实失败、不清理、不假成功', (function () {
    const bad = mem({ ra_high_score_v1: '{broken' });
    const rc = HS.read(bad);
    const sub = HS.submit(bad, 99);
    return rc.ok === false && rc.error.code === 'CORRUPT' &&
      sub.ok === false && bad.getItem('ra_high_score_v1') === '{broken';
  })());
  check('写失败保留原合法最高分', (function () {
    const failing = mem({ ra_high_score_v1: JSON.stringify({ version: 1, bestScore: 40 }) });
    failing.setItem = () => { throw new Error('quota'); };
    const sub = HS.submit(failing, 90);
    return sub.ok === false && sub.error.code === 'STORAGE_WRITE_FAILED' && sub.value.bestScore === 40;
  })());
  check('存储不可用时不抛异常、不报成功', (function () {
    const none = HS.read(null);
    const sub = HS.submit(undefined, 10);
    return none.ok === false && sub.ok === false;
  })());
  check('负分夹到 0、非法值拒绝', (function () {
    const stNeg = mem();
    const rNeg = HS.submit(stNeg, -5);
    return rNeg.ok === true && HS.read(stNeg).value.bestScore === 0 &&
      stNeg.getItem(HS.KEY) === null &&
      HS.submit(mem(), NaN).ok === false;
  })());
  check('版本不支持按损坏处理', HS.decode(JSON.stringify({ version: 2, bestScore: 5 })).ok === false);
}

// ================= ⑦ 页面/接线静态契约 =================
head('页面与接线:右上得分、结果分数、设置最高分;试玩页无分数');
{
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const trialHtml = readFileSync(join(ROOT, 'trial.html'), 'utf8');
  const shortJs = readFileSync(join(ROOT, 'js/short.js'), 'utf8');
  const sessionJs = readFileSync(join(ROOT, 'js/session.js'), 'utf8');
  check('index 有右上得分与结果分数元素',
    idx.indexOf('id="score-text"') >= 0 && idx.indexOf('id="result-score"') >= 0);
  check('index 设置里有只读历史最高分', idx.indexOf('id="high-score-value"') >= 0 &&
    idx.indexOf('id="high-score-status"') >= 0);
  check('index 加载 high-score-store 且在 short.js 之前',
    idx.indexOf('js/high-score-store.js') >= 0 &&
    idx.indexOf('js/high-score-store.js') < idx.indexOf('js/short.js'));
  check('trial.html 没有得分/最高分显示元素', trialHtml.indexOf('score-text') < 0 &&
    trialHtml.indexOf('result-score') < 0 && trialHtml.indexOf('high-score-value') < 0 &&
    readFileSync(join(ROOT, 'js/trial.js'), 'utf8').indexOf('HighScoreStore') < 0);
  check('short 只读 snapshot.score 更新 HUD,并通过 HighScoreStore 存 max',
    shortJs.indexOf('snap.score') >= 0 && shortJs.indexOf('RA.HighScoreStore') >= 0 &&
    shortJs.indexOf('ra_high_score_v1') < 0);
  check('核心 session 不直接访问 localStorage', sessionJs.indexOf('localStorage') < 0);
  check('正式身份来自 full40-formal,不看是否有 run-v1',
    sessionJs.indexOf("this.mode === ((RA.C.SCORE && RA.C.SCORE.formalMode) || 'full40-formal')") >= 0 ||
    /formalMode/.test(sessionJs));
  const rules = readFileSync(join(ROOT, 'js/rules.js'), 'utf8');
  check('规则版本升到 b4-10 且指纹包含计分条件',
    rules.indexOf("b4-10") >= 0 && rules.indexOf('score=formal-only') >= 0);
}

const result = { pass, fail, fails, name: '30 金币/弓箭手/计分' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`30 金币/弓箭手/计分自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('全部通过 ✔');
  process.exit(0);
}
export { result };
