#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_27_monsters.mjs —— 27号卡:移动火球/流星锤/齿轮轨道、无阻挡伤害、N04/N05
 * =================================================================================
 *   node tools/test_27_monsters.mjs
 *
 * 使用真实 Level/World/GameSession/Trial 数据与真实运动采样;不是关卡合规/真人通关。
 */
import { loadEditor } from './loader.mjs';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }
const clone = (v) => JSON.parse(JSON.stringify(v));

const RA = loadEditor();
const LD = RA.LevelData;
const C = RA.C;
const TS = C.TS;

function baseFloor() {
  const d = clone(RA.FULL40.fallback);
  d.id = 'monster_probe';
  d.title = 'monster_probe';
  d.objects = [];
  d.paths = [];
  d.certification = null;
  d.ports = { profile: 'cloud-pipe-v2', start: { col: 1, row: 20 }, finish: { col: 1, row: 2 } };
  return d;
}
function makeSession(objects, paths) {
  const d = baseFloor();
  d.objects = objects || [];
  d.paths = paths || [];
  const enc = LD.encode(d);
  if (!enc.ok) throw new Error(JSON.stringify(enc.error));
  const made = RA.GameSession.create({
    floors: [JSON.parse(enc.value)], profile: 'run-v1', requireCloud: true, mode: 'test27'
  });
  if (!made.ok) throw new Error(JSON.stringify(made.error));
  return made.value;
}
function obj(type, col, row, extra) {
  return Object.assign({ id: type + '_' + col + '_' + row, type, col, row,
    params: RA.EntityRegistry.defaults(type) || {}, pathId: null }, extra || {});
}

// ================= ① 速度/运动 =================
head('真实运动:齿轮 340、移动火球 170、单点静止、流星锤 4格/约5秒');
{
  const path = { id: 'p', mode: 'pingpong', points: [{ col: 1, row: 14 }, { col: 18, row: 14 }] };
  const gear = obj('gear', 1, 14, { pathId: 'p', params: { speedTilesPerSecond: 2, radiusTiles: 0.5, damage: 20 } });
  const moving = obj('fireball_moving', 1, 14, { pathId: 'p' });
  const single = obj('gear', 1, 14, { id: 'gear_single', pathId: 'single', params: { speedTilesPerSecond: 20, radiusTiles: 0.5, damage: 20 } });
  const s = makeSession([gear, moving, single], [path, { id: 'single', mode: 'pingpong', points: [{ col: 1, row: 14 }] }]);
  const inst = s.world.currentFloor;
  const g = inst.objects.find((o) => o.id === gear.id);
  const m = inst.objects.find((o) => o.id === moving.id);
  const one = inst.objects.find((o) => o.id === single.id);
  const gx = g.rx, mx = m.rx, ox = one.rx;
  inst.moveObjects(1);
  check('齿轮 1 秒移动 340px(旧 speed=2 被忽略)', Math.abs((g.rx - gx) - 340) < 0.01,
    (g.rx - gx).toFixed(3));
  check('移动火球 1 秒移动 170px', Math.abs((m.rx - mx) - 170) < 0.01,
    (m.rx - mx).toFixed(3));
  check('单点路径保持静止', one.rx === ox);
  check('旧 speedTilesPerSecond 仍保真在对象数据里', g.params.speedTilesPerSecond === 2);
}
{
  const flail = obj('flail', 10, 8);
  const s = makeSession([flail]);
  const inst = s.world.currentFloor;
  const f = inst.objects.find((o) => o.id === flail.id);
  const ax = 10 * TS + TS / 2, ay = 8 * TS + TS / 2;
  const d0 = Math.hypot(f.rx - ax, f.ry - ay);
  const a0 = f._angle;
  inst.moveObjects(1);
  const d1 = Math.hypot(f.rx - ax, f.ry - ay);
  check('流星锤创建首帧就在 4 格轨道上', Math.abs(d0 - 4 * TS) < 0.01, d0.toFixed(2));
  check('1 秒角位移约 1.25926rad / 约4.9896秒一圈',
    Math.abs((f._angle - a0) - 34 / 27) < 1e-6 && Math.abs(RA.MonsterRules.flailPeriod() - 27 * Math.PI / 17) < 1e-9,
    (f._angle - a0).toFixed(6));
  check('锤头半径仍为本地半径(不是轨道4格)', Math.abs(f.params.radiusTiles - 0.5) < 1e-9);
  check('非零原点不改变圆心/半径', Math.abs(d1 - 4 * TS) < 0.01);
}

// ================= ② 无阻挡但有伤害 =================
head('怪物无实体阻挡;伤害按实际位置');
{
  const objs = [
    obj('gear', 3, 12, { pathId: 'p' }),
    obj('fireball_moving', 4, 12, { pathId: 'p' }),
    obj('fireball_static', 5, 12),
    obj('flail', 6, 12),
    obj('spike', 7, 12)
  ];
  const s = makeSession(objs, [{ id: 'p', mode: 'pingpong', points: [{ col: 1, row: 14 }, { col: 10, row: 14 }] }]);
  const inst = s.world.currentFloor;
  const spike = inst.objects.find((o) => o.type === 'spike');
  check('地刺底座不再实心', inst.solidAt(spike.row, spike.col) === false);
  objs.forEach((o) => {
    const live = inst.objects.find((x) => x.type === o.type);
    check(o.type + ' 不阻塞格子', inst.solidAt(live.row, live.col) === false);
  });
}
{
  const fire = obj('fireball_static', 5, 12, { params: { radiusTiles: 0.5, damage: 0 } });
  const s = makeSession([fire]);
  const inst = s.world.currentFloor, p = s.player;
  const o = inst.objects[0];
  p.x = inst.origin.x + o.rx - p.w / 2; p.y = inst.origin.y + o.ry - p.h / 2;
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
  const hp = s.run.hp;
  inst.updateActiveObjects(1 / 60, s);
  check('显式 damage=0 不扣血、不产生受伤事件(N05)', s.run.hp === hp &&
    !s.events.some((e) => e.type === 'playerDamaged'), String(s.run.hp));
}
{
  const fire = obj('fireball_static', 5, 12);
  const s = makeSession([fire]);
  const inst = s.world.currentFloor, p = s.player, o = inst.objects[0];
  delete o.params.damage; // 运行时缺省才取注册默认 20(数据写入时仍要求必填)
  p.x = inst.origin.x + o.rx - p.w / 2; p.y = inst.origin.y + o.ry - p.h / 2;
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
  inst.updateActiveObjects(1 / 60, s);
  check('缺省 damage 才取默认 20', s.run.hp === 80, String(s.run.hp));
}
{
  const moving = obj('fireball_moving', 5, 12, { pathId: 'p' });
  const gear = obj('gear', 6, 12, { pathId: 'p' });
  const s = makeSession([moving, gear], [{ id: 'p', mode: 'pingpong', points: [{ col: 5, row: 12 }, { col: 6, row: 12 }] }]);
  const inst = s.world.currentFloor, p = s.player;
  inst.objects.forEach((o) => {
    p.x = inst.origin.x + o.rx - p.w / 2; p.y = inst.origin.y + o.ry - p.h / 2;
    s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
    const hp = s.run.hp;
    inst.updateActiveObjects(1 / 60, s);
    check(o.type + ' 接触伤害仍生效', s.run.hp < hp, String(hp - s.run.hp));
  });
}
{
  const flail = obj('flail', 10, 8);
  const s = makeSession([flail]);
  const inst = s.world.currentFloor, p = s.player, f = inst.objects[0];
  const ax = 10 * TS + TS / 2, ay = 8 * TS + TS / 2;
  // 端点(锚点)位置
  p.x = inst.origin.x + ax - p.w / 2; p.y = inst.origin.y + ay - p.h / 2;
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
  inst.updateActiveObjects(1 / 60, s);
  check('流星锤端点/锁链不伤害', s.run.hp === 100, String(s.run.hp));
  // 锤头位置
  p.x = inst.origin.x + f.rx - p.w / 2; p.y = inst.origin.y + f.ry - p.h / 2;
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
  inst.updateActiveObjects(1 / 60, s);
  check('只有流星锤头伤害', s.run.hp === 80, String(s.run.hp));
}
{
  const spike = obj('spike', 5, 12);
  const s = makeSession([spike]);
  const inst = s.world.currentFloor, p = s.player, o = inst.objects[0];
  p.x = inst.origin.x + 5 * TS + 2; p.y = inst.origin.y + (12 + 1) * TS - p.h;
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
  o.state = 'warning'; inst.updateActiveObjects(1 / 60, s);
  check('地刺预警不伤害', s.run.hp === 100);
  o.cycle = (Number(o.params.warningSeconds) || 0.5) + 0.05;
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
  inst.updateActiveObjects(1 / 60, s);
  check('地刺伸出按尖刺区域伤害', s.run.hp === 80, String(s.run.hp));
}

// ================= ③ 光环类型 =================
head('光环清火球、不清机械;正式/试玩同类型判断');
{
  const types = ['fireball_static', 'fireball_moving', 'gear', 'flail', 'spike'];
  types.forEach((t) => {
    const expect = t === 'fireball_static' || t === 'fireball_moving';
    check('haloDestroyable(' + t + ')=' + expect, RA.MonsterRules.haloDestroyable(t) === expect);
  });
  const objs = [
    obj('fireball_static', 10, 20), obj('fireball_moving', 10, 20, { pathId: 'p' }),
    obj('gear', 10, 20, { pathId: 'p' }), obj('flail', 10, 20), obj('spike', 10, 20)
  ];
  const s = makeSession(objs, [{ id: 'p', mode: 'pingpong', points: [{ col: 10, row: 20 }, { col: 12, row: 20 }] }]);
  const inst = s.world.currentFloor, p = s.player;
  p.x = inst.origin.x + 10 * TS; p.y = inst.origin.y + 20 * TS - p.h;
  s.run.haloActiveRemaining = 14; s.run.haloCooldownRemaining = 20;
  inst.objects.forEach((o) => { o.rx = 10 * TS + TS / 2; o.ry = 20 * TS + TS / 2; });
  s._applyHalo();
  const alive = {};
  inst.objects.forEach((o) => { alive[o.type] = o.alive; });
  check('光环消灭静止/移动火球', alive.fireball_static === false && alive.fireball_moving === false,
    JSON.stringify(alive));
  check('光环不消灭齿轮/流星锤/地刺', alive.gear === true && alive.flail === true && alive.spike === true);
}

// ================= ③b 暂停/预热/相位 =================
head('暂停冻结、preview 先动不伤害、入层不重置相位');
{
  const f1 = baseFloor();
  f1.id = 'phase_one';
  const f2 = baseFloor();
  f2.id = 'phase_two';
  f2.objects = [obj('flail', 10, 15), obj('fireball_moving', 4, 18, { pathId: 'p2' })];
  f2.paths = [{ id: 'p2', mode: 'pingpong', points: [{ col: 4, row: 18 }, { col: 17, row: 18 }] }];
  const enc = LD.encode(f2);
  const lobby = clone(RA.FULL40.fixed.lobby);
  const made = RA.GameSession.create({
    floors: [lobby, JSON.parse(LD.encode(f1).value), JSON.parse(enc.value)],
    profile: 'run-v1', requireCloud: true, mode: 'test27'
  });
  check('三层会话可创建', made.ok, made.ok ? '' : JSON.stringify(made.error));
  const s = made.value;
  s.setActions({ interactPressed: true }); s.update(1 / 60); // 0→1
  check('进入1层,2层是preview', s.world.current === 1 && s.world.instances.get(2) &&
    s.world.instances.get(2).state === 'preview');
  const pv = s.world.instances.get(2);
  const fl = pv.objects.filter((o) => o.type === 'flail')[0];
  const a0 = fl._angle, hp0 = s.run.hp;
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  check('preview 怪物先运动', fl._angle !== a0);
  check('preview 不伤害当前层玩家', s.run.hp === hp0);
  const a1 = fl._angle;
  s.pause();
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  check('暂停冻结怪物运动', fl._angle === a1, String(fl._angle - a1));
  s.resume();
  // 直接走到2层提交;观察 preview 相位是否被重置
  s.world.commitNext();
  check('入层保留预热相位,不回到正下方', s.world.current === 2 && Math.abs(
    s.world.instances.get(2).objects.filter((o) => o.type === 'flail')[0]._angle - a1) < 1e-9,
    'current=' + s.world.current);
}

// ================= ③c 独立试玩共用 =================
head('独立试玩共用运动/光环类型');
{
  const d = baseFloor();
  d.id = 'trial_monsters';
  d.objects = [
    obj('fireball_static', 1, 20), obj('fireball_moving', 1, 20, { pathId: 'p' }),
    obj('gear', 1, 20, { pathId: 'p' }), obj('flail', 1, 20)
  ];
  d.paths = [{ id: 'p', mode: 'pingpong', points: [{ col: 1, row: 20 }, { col: 8, row: 20 }] }];
  const enc = LD.encode(d);
  const plan = RA.TrialSession.build({
    version: 3, kind: 'editor-validation', profileId: 'run-v1', template: JSON.parse(enc.value),
    subjectRef: { levelId: d.id, contentHash: null }, draftRef: { draftId: d.id, revision: 1 },
    rules: { rulesVersion: RA.RULES.rulesVersion, rulesFingerprint: RA.RULES.rulesFingerprint }, requestId: 't27'
  });
  check('独立试玩可构建新怪物关卡', plan.ok, plan.ok ? '' : (plan.error && plan.error.message));
  const ts = RA.TrialSession.create(plan.value);
  const inst = ts.inst;
  const fl = inst.objects.filter((o) => o.type === 'flail')[0];
  const a0 = fl._angle;
  inst.moveObjects(1);
  // 重置到起点附近再测光环(运动采样本身已在上一条验证)
  inst.objects.forEach((o) => { o.rx = 1 * TS + TS / 2; o.ry = 20 * TS + TS / 2; });
  check('独立试玩齿轮/火球/流星锤共用运动', Math.abs(fl._angle - a0 - 34 / 27) < 1e-6);
  ts.pressSkill();
  inst.objects.forEach((o) => { o.rx = 1 * TS + TS / 2; o.ry = 20 * TS + TS / 2; });
  ts._applyHalo();
  const alive = {};
  inst.objects.forEach((o) => { alive[o.type] = o.alive; });
  check('独立试玩光环清火球不清机械', alive.fireball_static === false &&
    alive.fireball_moving === false && alive.gear === true && alive.flail === true,
    JSON.stringify(alive));
}

// ================= ④ N04 pending 方向 =================
head('N04:临界上穿延后确认按 y 方向,回落取消');{
  const plan = RA.TowerPlanner.buildFull40({
    fixedLevels: RA.FULL40.fixed, fallback: RA.FULL40.fallback, candidates: [],
    seed: 1, poolEpoch: RA.FULL40.poolEpoch
  }).value;
  const s = RA.GameSession.create({
    floors: plan.floors.slice(0, 3).map((f) => clone(f.data)), manifest: clone(plan),
    profile: 'run-v1', requireCloud: true, mode: 'test27'
  }).value;
  // 真实进入1层,取1→2链接
  s.setActions({ interactPressed: true }); s.update(1 / 60);
  const w = s.world, p = s.player, link = w.links[1];
  check('N04 测试前提:当前1层', w.current === 1);
  const yAbove = link.commitY - 10;
  const yBelow = link.commitY + 10;
  // 上穿帧:身体尚未完全进入开口,但脚底越过顶层
  p.x = link.openingLeft - 10; p.vx = 0;
  let acted = w.afterPlayerStep({ x: p.x, w: p.w, feet: yAbove }, yBelow);
  check('临界帧不立即提交,但记住 pending', acted === null && !!w.pendingEntry);
  // 继续上升(脚底更小)并移入开口
  p.x = link.openingLeft + 5;
  acted = w.afterPlayerStep({ x: p.x, w: p.w, feet: yAbove - 5 }, yAbove);
  check('真正进入后一次提交', acted !== null && w.current === 2, 'current=' + w.current);
  // 回落应取消 pending
  const s2 = RA.GameSession.create({
    floors: plan.floors.slice(0, 3).map((f) => clone(f.data)), manifest: clone(plan),
    profile: 'run-v1', requireCloud: true, mode: 'test27'
  }).value;
  s2.setActions({ interactPressed: true }); s2.update(1 / 60);
  const w2 = s2.world, p2 = s2.player, l2 = w2.links[1];
  p2.x = l2.openingLeft - 10;
  w2.afterPlayerStep({ x: p2.x, w: p2.w, feet: l2.commitY - 10 }, l2.commitY + 10);
  const had = !!w2.pendingEntry;
  p2.x = l2.openingLeft - 10;
  w2.afterPlayerStep({ x: p2.x, w: p2.w, feet: l2.commitY + 20 }, l2.commitY - 10);
  check('脚底回落到接口下方后取消 pending', had && !w2.pendingEntry && w2.current === 1);
}

// ================= ⑤ 正式读取:发布池中的新类型 =================
head('正式池读取同版本新怪物(测试证书,不写作者 passed)');
{
  const d = baseFloor();
  d.id = 'monster_publish_probe';
  d.title = '27 发布读取探针';
  d.difficulty = 1;
  d.objects = [
    obj('fireball_moving', 4, 18, { pathId: 'p' }), obj('flail', 10, 15),
    { id: 'gpub', type: 'gear', col: 4, row: 18, params: { speedTilesPerSecond: 2, radiusTiles: 0.5, damage: 20 }, pathId: 'p' }
  ];
  d.paths = [{ id: 'p', mode: 'pingpong', points: [{ col: 4, row: 18 }, { col: 12, row: 18 }] }];
  const enc = LD.encode(d);
  const data = JSON.parse(enc.value);
  const cert = {
    contentHash: LD.hashSync(data), rulesVersion: RA.RULES.rulesVersion,
    rulesFingerprint: RA.RULES.rulesFingerprint, profileId: 'run-v1',
    status: 'passed', completedAt: '2026-11-09T00:00:00Z', source: 'local-playtest'
  };
  data.certification = cert;
  const repo = RA.ContentRepository.create({
    adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory'
  });
  const saved = await repo.saveDraft('monster_publish_probe', data, 0);
  const pub = await repo.publish({ draftId: 'monster_publish_probe', expectedRevision: 1, receipt: cert });
  const pool = await repo.listEligible({ difficulty: 1 });
  check('新类型草稿可保存/发布到测试池', saved.ok && pub.ok && pool.ok && pool.value.length === 1,
    JSON.stringify({ saved: saved.ok, pub: pub.ok, pool: pool.ok }));
  if (pool.ok && pool.value.length === 1) {
    const made = RA.GameSession.create({
      floors: [clone(pool.value[0].data)], profile: 'run-v1', requireCloud: true, mode: 'formal'
    });
    check('正式塔读取池中同版本新怪物', made.ok && made.value.world.currentFloor.objects.length === 3,
      made.ok ? '' : JSON.stringify(made.error));
  }
}

// ================= ⑤ 编辑器数据/绘制 =================
head('编辑器数据:新类型/路径/裁剪/JSON 保真');{
  const m = RA.EditorModel.create({ cols: 16, rows: 12, withGround: false });
  const mv = m.placeObject('fireball_moving', 2, 4).value;
  const fl = m.placeObject('flail', 8, 6).value;
  const path = m.addPath('pingpong', [{ col: 2, row: 4 }, { col: 9, row: 4 }]).value;
  mv.pathId = path.id;
  m.invalidate();
  check('移动火球能放置并挂路径', !!mv && mv.pathId === path.id);
  check('流星锤只放端点、pathId=null', !!fl && fl.pathId === null && fl.col === 8 && fl.row === 6);
  // 挂在石块上的端点不能擦掉该格地形
  m.setTile(10, 10, 4);
  const beforeTile = m.getTile(10, 10);
  const fl2 = m.placeObject('flail', 10, 10);
  check('挂墙端点保留原石块地形', fl2.ok && m.getTile(10, 10) === beforeTile && beforeTile === 4);
  const enc = m.toJSON();
  check('新对象可编码', enc.ok, enc.ok ? '' : JSON.stringify(enc.error));
  const back = RA.EditorModel.fromJSON(enc.value).value;
  check('编码/读回保留类型、路径、端点', back.data.objects.some((o) => o.type === 'fireball_moving' && o.pathId === path.id) &&
    back.data.objects.some((o) => o.type === 'flail' && o.col === 8 && o.row === 6));
  const beforeHash = RA.LevelData.hashSync(m.toData());
  back.setTitle('changed');
  check('编辑会改变 hash(通过记录需重玩)', RA.LevelData.hashSync(back.toData()) !== beforeHash);
  // 裁剪包络:锤在角附近不把4格轨道裁掉
  const crop = back.cropCandidate();
  check('裁剪候选考虑流星锤4格扫掠', crop.ok && (crop.value.bounds.col <= 4 || !crop.value.changed),
    crop.ok ? JSON.stringify(crop.value.bounds) : JSON.stringify(crop.error));
}
{
  // 轨道绘制:齿轮有,移动火球/流星锤没有整圈
  let strokes = 0;
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes++; } };
  const inst = { origin: { x: 0, y: 0 }, paths: { p: { id: 'p', mode: 'pingpong', points: [{ col: 1, row: 1 }, { col: 4, row: 1 }] } } };
  RA.drawObjectTrack(ctx, inst, { type: 'gear', pathId: 'p' }, { x: 0, y: 0 });
  check('正式绘制给齿轮画轨道', strokes > 0, String(strokes));
  strokes = 0;
  RA.drawObjectTrack(ctx, inst, { type: 'fireball_moving', pathId: 'p' }, { x: 0, y: 0 });
  RA.drawObjectTrack(ctx, inst, { type: 'flail', pathId: null }, { x: 0, y: 0 });
  check('正式/试玩不给移动火球/流星锤画路径圆周', strokes === 0);
}

const result = { pass, fail, fails, name: '27 怪物' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`怪物自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('全部通过 ✔');
  process.exit(0);
}
export { result };
