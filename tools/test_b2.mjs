#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_b2.mjs —— B2 战斗/六类对象/休整/Boss/抽选/发布/编辑工具
 * ==========================================================
 *     node tools/test_b2.mjs
 *
 * 只使用 Node DOM 替身与内存仓库;不写用户草稿、原图或正式池。
 * 认证相关的测试数据是**测试夹具**,不是人工通关认证,也不会写入仓库文件。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEditor, makeCanvas, ROOT, SHORT_SCRIPTS } from './loader.mjs';

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
const makeCanvasLike = () => makeCanvas(900, 600);
const ld = (n) => JSON.parse(readFileSync(join(ROOT, 'levels/archive/b2', n + '.json'), 'utf8'));
const lobby = ld('lobby'), n1 = ld('normal-1'), n2 = ld('normal-2'), n3 = ld('normal-3');
const rest = ld('rest'), bossFloor = ld('boss');
// B2 旧样例的 2 点 loop 在新直角规则下是退化环;测试夹具改成往返,不改磁盘旧文件
if (n3.paths && n3.paths[0] && n3.paths[0].mode === 'loop' && n3.paths[0].points.length < 3) { n3.paths[0].mode = 'pingpong'; n3.contentHash = LD.hashSync(n3); }
const tower = [lobby, n1, n2, n3, rest, bossFloor];
const pos = (x, y) => ({ x, y });

function newSession(floors, profile) {
  const r = RA.GameSession.create({ floors: floors || tower, profile: profile || 'run-v1' });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
function cross(s) {
  const f = s.world.currentFloor, p = s.player;
  p.x = f.origin.x + f.exitCol * TS + 8;
  p.y = f.seamY - p.h + 6;
  p.vx = 0; p.vy = -380; p.onGround = false;
  for (let i = 0; i < 90 && s.floorIndex === f.index; i++) s.stepOnce();
  return s.floorIndex === f.index + 1;
}
function certFor(data) {
  return {
    contentHash: LD.hashSync(data),
    rulesVersion: RA.RULES.rulesVersion,
    rulesFingerprint: RA.RULES.rulesFingerprint,
    profileId: 'standard-v1', status: 'passed',
    completedAt: '2026-11-06T00:00:00Z', source: 'local-playtest'
  };
}

head('规则/模板:数值、指纹、开发短塔可启动');
{
  check('rulesVersion/fingerprint 非空且互相关联',
    !!RA.RULES.rulesVersion && RA.RULES.rulesFingerprint.indexOf(RA.RULES.rulesVersion) >= 0);
  check('正式 profile 开局技能可用', RA.RULES.profile('run-v1').allowSkill === true &&
    RA.RULES.profile('run-v1').haloCooldown === 0);
  const std = RA.RULES.profile('standard-v1');
  check('standard-v1 初始无活动光环、冷却 20 秒且保留技能', std.allowSkill === true &&
    std.haloActive === 0 && std.haloCooldown === 20);
  const ss = newSession([lobby], 'standard-v1');
  check('标准开局 K 因 20 秒 CD 施放失败', ss.castSkill() === false && ss.run.haloCooldownRemaining === 20);
  for (let i = 0; i < 600; i++) ss.stepOnce();
  ss.pause();
  const pausedCd = ss.run.haloCooldownRemaining;
  ss.update(2);
  check('标准暂停不减 CD', ss.run.haloCooldownRemaining === pausedCd);
  ss.resume();
  for (let i = 0; i < 610; i++) ss.stepOnce();
  check('标准冷却归零后可以实际施放', ss.castSkill() === true && ss.run.haloActiveRemaining === 14 &&
    ss.run.haloCooldownRemaining === 20);
  check('6 层开发短塔都是合法 play 数据',
    tower.every((f) => LD.errorsOf(LD.validate(f, { purpose: 'play' })).length === 0));
  const s = newSession();
  check('短塔从大厅开始', s.snapshot().floor.kind === 'lobby' && s.snapshot().hp === 100);
  check('6 层种类顺序', s.world.floorsData.map((f) => f.kind).join(',') ===
    'lobby,normal,normal,normal,rest,boss');
}

head('生命/无敌/死亡/越界;不再本层无伤重生');
{
  const s = newSession([lobby]);
  check('一次受伤 20', s.damage(20, 'test') && s.run.hp === 80);
  check('无敌期内同一/下一瞬间不重复受伤', s.damage(20, 'test') === false && s.run.hp === 80);
  s.stepOnce();
  s.run.invulnerableRemaining = 0;
  s.stepOnce();
  check('无敌结束后可再次受伤', s.damage(20, 'test') === true && s.run.hp === 60);
  s.run.invulnerableRemaining = 0;
  s._damagedThisStep = false;
  s.damage(100, 'kill');
  check('生命归零判死亡', s.status === 'dead' && s.run.hp === 0);
  check('死亡事件只一次', s.drainEvents().filter((e) => e.type === 'dead').length === 1);
  s.update(1);
  check('死亡后模拟停止', s.time < 1 && s.status === 'dead');

  const s2 = newSession([lobby]);
  const fl = s2.world.currentFloor;
  s2.player.y = fl.bottomY + 120;
  s2.stepOnce();
  check('异常越界判死亡(而不是回本层出生点)',
    s2.status === 'dead' && s2.world.current === 0);
  const ev = s2.drainEvents().filter((e) => e.type === 'dead')[0];
  check('越界死亡记录原因', ev && ev.reason === 'outOfBounds', ev && ev.reason);
}

head('光环:14/20 秒、暂停冻结、跨层保留、火球可杀');
{
  const s = newSession([lobby, n1]);
  check('开局可施放', s.castSkill() === true && s.run.haloActiveRemaining === 14 &&
    s.run.haloCooldownRemaining === 20 && s.run.castId === 1);
  for (let i = 0; i < 60; i++) s.stepOnce();
  check('激活期间继续倒计时', s.run.haloActiveRemaining < 14 && s.run.haloActiveRemaining > 12.9);
  s.pause();
  const active = s.run.haloActiveRemaining;
  s.update(3);
  check('暂停冻结光环', s.run.haloActiveRemaining === active);
  s.resume();
  s.run.haloActiveRemaining = 0.01; s.run.haloCooldownRemaining = 0.01;
  s.stepOnce();
  check('冷却结束可再次施放且 castId 唯一', s.castSkill() === true && s.run.castId === 2);
  check('跨层不重建技能状态', cross(s) && s.run.castId === 2 &&
    s.run.haloActiveRemaining > 0);

  const s2 = newSession([n1]);
  const fire = s2.world.currentFloor.objects.filter((o) => o.type === 'fireball_static')[0];
  s2.player.x = fire.rx - s2.player.w / 2;
  s2.player.y = fire.ry - s2.player.h / 2;
  s2.castSkill(); s2.stepOnce();
  check('光环半径内的火球被一击消灭', fire.alive === false &&
    s2.drainEvents().some((e) => e.type === 'fireballDestroyed'));

  const s3 = newSession([lobby, n1]);
  const previewFire = s3.world.floorAt(1).objects.filter((o) => o.type === 'fireball_static')[0];
  s3.castSkill();
  for (let i = 0; i < 5; i++) s3.stepOnce();
  check('光环不攻击 preview 层的火球', previewFire.alive !== false &&
    s3.world.floorAt(1).activeTime === 0);
}

head('六类对象:弹簧/门/浮石/火球/地刺/齿轮');
{
  const s = newSession([n1]);
  const inst = s.world.currentFloor;
  const spring = inst.objects.filter((o) => o.type === 'spring')[0];
  s.player.x = spring.rx - s.player.w / 2;
  s.player.y = spring.ry - s.player.h + 10;
  s.player.vy = 100;
  s.stepOnce();
  check('弹簧弹起玩家', s.player.vy < 0, String(s.player.vy));

  const s2 = newSession([n2]);
  const inst2 = s2.world.currentFloor;
  const door = inst2.objects.filter((o) => o.type === 'crumble_door')[0];
  s2.player.x = door.rx - s2.player.w / 2;
  s2.player.y = door.ry - s2.player.h / 2;
  s2.stepOnce();
  check('门触碰后消失且本局不恢复', door.broken === true && inst2.solidAt(door.row, door.col) === false);

  const blink = inst2.objects.filter((o) => o.type === 'blink_platform')[0];
  s2.player.x = blink.rx - s2.player.w / 2;
  s2.player.y = blink.ry - TS / 2 - s2.player.h;
  s2.player.vy = 100;
  s2.stepOnce();
  check('浮石被踩进入预警', blink.state === 'warning' || blink.state === 'gone', blink.state);
  blink.state = 'warning'; blink.timer = 0.01; s2.stepOnce();
  check('预警结束失去碰撞', blink.state === 'gone');
  blink.timer = 0.01;
  s2.player.x = 0; s2.player.y = 0;            // 离开,允许恢复
  s2.stepOnce();
  check('玩家离开后浮石恢复', blink.state === 'idle');

  const s3 = newSession([n3]);
  const inst3 = s3.world.currentFloor;
  const spike = inst3.objects.filter((o) => o.type === 'spike')[0];
  check('地刺底座不阻挡(27号卡取消实心底座)', inst3.solidAt(spike.row, spike.col) === false);
  // 尖刺伤害区在格内下部:把身体放到尖刺实际伸出的区域,不再依赖"站上底座"
  s3.player.x = inst3.origin.x + spike.rx - s3.player.w / 2;
  s3.player.y = inst3.origin.y + (spike.row + 1) * TS - s3.player.h;
  spike.cycle = (spike.params.warningSeconds || 0.5) + 0.05;
  s3._damagedThisStep = false; s3.run.invulnerableRemaining = 0;
  inst3.updateActiveObjects(1 / 60, s3);
  check('地刺伸出时伤害玩家', s3.run.hp < 100, String(s3.run.hp));

  const gear = inst3.objects.filter((o) => o.type === 'gear')[0];
  const gx = gear.rx;
  for (let i = 0; i < 10; i++) s3.stepOnce();
  check('齿轮沿路径运动', gear.rx !== gx);
  const geo = inst3.pathSegments(inst3.paths[gear.pathId]);
  check('路径段能被 World 读取(旧夹具改为往返)', geo.segs.length >= 1, String(geo.segs.length));
}

head('休整:首次进入回复 40、封顶 100、按实例只一次');
{
  const s = newSession([rest]);
  s.run.hp = 40;
  s._onFloorEntered({ from: -1, to: 0 });
  check('首次进入休整回复 40', s.run.hp === 80);
  s._onFloorEntered({ from: -1, to: 0 });
  check('同一实例不重复回复', s.run.hp === 80 && s.run.claimedRest.size === 1);
  s.run.hp = 90;
  const s2 = newSession([rest]);
  s2.run.hp = 90;
  s2._onFloorEntered({ from: -1, to: 0 });
  check('回复封顶 100', s2.run.hp === 100);
}

head('上层非零原点:正常固定步跨层后的对象接触与权限');
{
  const s = newSession([lobby, n2]);
  check('正常跨线进入有 x/y 偏移的普通层', cross(s) && s.world.currentFloor.origin.x !== 0 &&
    s.world.currentFloor.origin.y !== 0, JSON.stringify(s.world.currentFloor.origin));
  const inst = s.world.currentFloor;
  const door = inst.objects.filter((o) => o.type === 'crumble_door')[0];
  const platformTop = inst.origin.y + 8 * TS;
  s.player.x = inst.origin.x + door.rx - s.player.w - 8;
  s.player.y = platformTop - s.player.h;
  s.player.vx = 180; s.player.vy = 0; s.player.onGround = true;
  s.stepOnce();
  check('上层正常侧碰门消失一次', door.broken === true && inst.solidAt(door.row, door.col) === false);
  check('门消失事件一次', s.drainEvents().filter((e) => e.type === 'doorBroken').length === 1);

  const blink = inst.objects.filter((o) => o.type === 'blink_platform')[0];
  s.player.x = inst.origin.x + blink.rx - s.player.w / 2;
  s.player.y = inst.origin.y + blink.row * TS - s.player.h;
  s.player.vx = 0; s.player.vy = 80; s.player.onGround = false;
  s.stepOnce();
  check('上层落到浮石开始预警且仍承重', blink.state === 'warning' &&
    inst.solidAt(blink.row, blink.col) === true);
  s.pause();
  const timer = blink.timer;
  s.update(2);
  check('暂停冻结浮石预警计时', blink.timer === timer);
  s.resume();
  for (let i = 0; i < 40; i++) s.stepOnce();
  check('上层预警结束浮石消失', blink.state === 'gone');
  // 玩家占位时恢复延后
  blink.timer = 0.01;
  s.player.x = inst.origin.x + blink.rx - s.player.w / 2;
  s.player.y = inst.origin.y + blink.row * TS - s.player.h;
  s.stepOnce();
  check('玩家仍占位时浮石恢复延后', blink.state === 'gone');
  s.player.x = 0; s.player.y = 0;
  blink.timer = 0.01;
  s.stepOnce();
  check('离开后浮石恢复且重新实心', blink.state === 'idle' && inst.solidAt(blink.row, blink.col) === true);
}

{
  const s = newSession([lobby, n1]);
  check('进入普通层 1(非零原点)', cross(s) && s.world.currentFloor.origin.y !== 0);
  const inst = s.world.currentFloor;
  const spring = inst.objects.filter((o) => o.type === 'spring')[0];
  s.player.x = inst.origin.x + spring.rx - s.player.w / 2;
  s.player.y = inst.origin.y + spring.ry - s.player.h + 8; s.player.vy = 100;
  s.stepOnce();
  check('上层弹簧正常弹起', s.player.vy < 0);
  const fire = inst.objects.filter((o) => o.type === 'fireball_static')[0];
  s.player.x = inst.origin.x + fire.rx - s.player.w / 2;
  s.player.y = inst.origin.y + fire.ry - s.player.h / 2;
  const hp0 = s.run.hp;
  s.stepOnce();
  check('上层火球接触伤害', s.run.hp === hp0 - 20, String(s.run.hp));
  s.run.invulnerableRemaining = 0;
  s.player.x = inst.origin.x + fire.rx - s.player.w / 2; s.player.y = inst.origin.y + fire.ry - s.player.h / 2;
  s.run.haloCooldownRemaining = 0; s.castSkill(); s.stepOnce();
  check('上层光环可消灭火球', fire.alive === false);
}

{
  const s = newSession([lobby, n3]);
  check('进入普通层 3(非零原点)', cross(s));
  const inst = s.world.currentFloor;
  const spike = inst.objects.filter((o) => o.type === 'spike')[0];
  s.player.x = inst.origin.x + spike.rx - s.player.w / 2;
  s.player.y = inst.origin.y + (spike.row + 1) * TS - s.player.h;
  s.player.vy = 0; s.player.onGround = true;
  spike.cycle = (spike.params.warningSeconds || 0.5) + 0.05;
  const hp0 = s.run.hp;
  s._damagedThisStep = false; s.run.invulnerableRemaining = 0;
  inst.updateActiveObjects(1 / 60, s);
  check('上层地刺伸出伤害', s.run.hp < hp0);
  const gear = inst.objects.filter((o) => o.type === 'gear')[0];
  s.run.invulnerableRemaining = 0;
  s.player.x = inst.origin.x + gear.rx - s.player.w / 2; s.player.y = inst.origin.y + gear.ry - s.player.h / 2;
  const hp1 = s.run.hp;
  s.stepOnce();
  check('上层齿轮接触伤害', s.run.hp < hp1);
}

head('Boss:两阶段、攻击/停攻清场、单次光环只掉一阶段、胜利/出口');
{
  const s = newSession([lobby, bossFloor]);
  s.run.hp = 100;
  cross(s);
  check('进入 Boss 层创建 Boss、出口关闭',
    !!s.boss && s.boss.state === 'shielded' && s.world.currentFloor.exitOpen === false);
  const seen = {};
  for (let i = 0; i < 3; i++) {
    s.boss.hazards = [];
    s.boss.attackTimer = 0;
    s.stepOnce();
    s.boss.hazards.forEach(function (h) { seen[h.type] = true; });
    s.boss.shieldRemaining = 5;
  }
  check('护盾阶段轮换三种攻击', seen.laser && seen.orb && seen.fireball, JSON.stringify(seen));
  s.boss.hazards = [];
  s.boss.attackTimer = 0;
  s.stepOnce();
  check('护盾阶段会生成有预警的攻击', s.boss.hazards.length > 0);
  const firstHazards = s.boss.hazards.length;
  s.boss.shieldRemaining = 0.01;
  s.stepOnce();
  check('护盾耗尽进入 exposed 并清空伤害物',
    s.boss.state === 'exposed' && s.boss.hazards.length === 0,
    s.boss.state + '/' + s.boss.hazards.length);
  const beforeHp = s.run.hp;
  for (let i = 0; i < 1250; i++) s.stepOnce();
  check('exposed 保持且不攻击、玩家安全', s.boss.state === 'exposed' &&
    s.boss.hazards.length === 0 && s.run.hp === beforeHp);

  s.player.x = s.boss.x + s.boss.w / 2 - s.player.w / 2;
  s.player.y = s.boss.y + s.boss.h / 2 - s.player.h / 2;
  s.run.haloCooldownRemaining = 0;
  s.pressSkill(); s.stepOnce();
  check('第一次光环命中进入第二阶段 resolving',
    s.boss.state === 'resolving' && s.run.haloActiveRemaining === 0);
  check('命中消耗光环但冷却不重置', s.run.haloCooldownRemaining > 18);
  for (let i = 0; i < 40; i++) s.stepOnce();
  check('第二阶段重新护盾', s.boss.state === 'shielded' && s.boss.phase === 2);
  s.boss.shieldRemaining = 0.01; s.stepOnce();
  check('第二阶段可再次 exposed', s.boss.state === 'exposed');
  s.player.x = s.boss.x + s.boss.w / 2 - s.player.w / 2;
  s.player.y = s.boss.y + s.boss.h / 2 - s.player.h / 2;
  s.run.haloCooldownRemaining = 0;
  s.pressSkill(); s.stepOnce();
  for (let i = 0; i < 40; i++) s.stepOnce();
  check('第二次命中击败 Boss 并胜利', s.boss.defeated && s.status === 'won');
  check('胜利后出口打开', s.world.currentFloor.exitOpen === true);
  check('死亡后不能再结算胜利', (() => {
    const t = newSession([lobby]);
    t.die('test');
    return t.win('late') === false && t.status === 'dead';
  })());
}

head('抽选:只接受已认证候选、固定场景、seed 稳定/可重复');
{
  const fixed = { lobby: lobby, rest: rest, boss: bossFloor };
  const empty = RA.TowerPlanner.build({ seed: 1, fixedLevels: fixed, candidates: [] });
  check('无候选时明确 EMPTY_POOL', !empty.ok && empty.error.code === 'EMPTY_POOL');
  const fakeCert = { levelId: 'x', contentHash: 'h', data: clone(n1) };
  const one = RA.TowerPlanner.build({ seed: 7, fixedLevels: fixed, candidates: [fakeCert] });
  check('候选不足 3 个允许重复', one.ok && one.value.floors.length === 6 &&
    one.value.floors.filter((f) => f.kind === 'normal').length === 3);
  const three = [n1, n2, n3].map((d, i) => ({ levelId: d.id + i, contentHash: d.contentHash, data: d }));
  const a = RA.TowerPlanner.build({ seed: 42, fixedLevels: fixed, candidates: three });
  const b = RA.TowerPlanner.build({ seed: 42, fixedLevels: fixed, candidates: three.slice().reverse() });
  check('同 seed/候选结果稳定', a.ok && b.ok && a.value.manifestId === b.value.manifestId);
  check('manifest 含 6 层且引用 id+hash', a.value.floors.length === 6 &&
    a.value.floors.every((f) => f.levelId && f.contentHash));
}

head('发布:回执/规则/内容/revision 原子校验,失败旧池不变');
{
  const repo = RA.ContentRepository.create({
    adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory'
  });
  const data = clone(n1);
  const cert = certFor(data);
  data.certification = cert;
  const saved = await repo.saveDraft('publish_fixture', data, 0);
  check('测试夹具草稿可保存', saved.ok, saved.ok ? '' : saved.error.message);
  const bad = await repo.publish({ draftId: 'publish_fixture', expectedRevision: 1,
    receipt: Object.assign({}, cert, { contentHash: 'sha256:bad' }) });
  check('错误回执 hash 不发布', !bad.ok && bad.error.code === 'HASH_MISMATCH');
  const conflict = await repo.publish({ draftId: 'publish_fixture', expectedRevision: 0, receipt: cert });
  check('revision 冲突不发布', !conflict.ok && conflict.error.code === 'CONFLICT');
  const wrongRules = await repo.publish({ draftId: 'publish_fixture', expectedRevision: 1,
    receipt: Object.assign({}, cert, { rulesVersion: 'old-rules' }) });
  check('规则不匹配不发布', !wrongRules.ok && wrongRules.error.code === 'RULES_MISMATCH');
  check('失败后池仍为空', (await repo.listEligible({ difficulty: 1 })).value.length === 0);

  const pub = await repo.publish({ draftId: 'publish_fixture', expectedRevision: 1, receipt: cert });
  check('匹配回执原子发布', pub.ok, pub.ok ? '' : pub.error.message);
  const eligible = await repo.listEligible({ difficulty: 1 });
  check('正式池只含已认证 normal', eligible.ok && eligible.value.length === 1 &&
    eligible.value[0].levelId === n1.id);
  const again = await repo.publish({ draftId: 'publish_fixture', expectedRevision: 1, receipt: cert });
  check('同 id+hash 发布幂等', again.ok);
  const old = await repo.getPublished(n1.id, cert.contentHash);
  check('可按 id+hash 取回不可变内容', old.ok && old.value && old.value.data.id === n1.id);

  // 同 id 新内容:保留旧版本
  const changed = clone(n1);
  changed.title = '短塔普通层 1(改)';
  changed.contentHash = null;
  const cert2 = certFor(changed);
  changed.certification = cert2;
  const saved2 = await repo.saveDraft('publish_fixture', changed, 1);
  const pub2 = await repo.publish({ draftId: 'publish_fixture', expectedRevision: 2, receipt: cert2 });
  check('同 id 新 hash 可发布并保留旧版本', saved2.ok && pub2.ok);
  check('旧版本内容仍可取回', (await repo.getPublished(n1.id, cert.contentHash)).value.data.title === n1.title);
  check('正式池同时有新旧两个版本', (await repo.listEligible({ difficulty: 1 })).value.length === 2);
}

head('正式入口:index 唯一,short/旧页只跳转');
{
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('index 是正式壳并加载 short 控制器', idx.indexOf('js/short.js') >= 0 &&
    idx.indexOf('js/full40-samples.js') >= 0 && idx.indexOf('REVERSE ABYSS') >= 0);
  for (const f of ['short.html', 'legacy.html', 'standard.html', 'devplay.html']) {
    const h = readFileSync(join(ROOT, f), 'utf8');
    check(f + ' 单向跳 index,不加载旧控制器', /url=index\.html/.test(h) &&
      h.indexOf('js/short.js') < 0 && h.indexOf('js/standard.js') < 0 && h.indexOf('js/devplay.js') < 0);
  }
  const sync = spawnSync(process.execPath, [join(ROOT, 'tools/sync_b2_levels.mjs'), '--check'], { encoding: 'utf8' });
  check('b2-samples.js 与 levels/archive/b2 同步', sync.status === 0, (sync.stderr || ''));
}

head('编辑器发布按钮:草稿+回执匹配才入池');
{
  const repo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  const ed = new RA.Editor(makeCanvasLike(), { repo });
  ed.openJSONText(JSON.stringify(n1), 'n1.json');
  const cert = certFor(n1);
  ed.model.data.certification = cert;
  ed.markDirty();
  check('带认证草稿先保存', await ed.saveDraft() === true && ed.draftRevision === 1);
  check('发布按钮把匹配草稿写入正式池', await ed.publishCurrent() === true);
  const pool = await repo.listEligible({ difficulty: 1 });
  check('发布后正式池出现该关卡', pool.ok && pool.value.length === 1 &&
    pool.value[0].levelId === n1.id);
}

head('编辑器 B2 工具:接口/对象参数/路径/引用保护');
{
  const m = RA.EditorModel.create({ cols: 20, rows: 12, withGround: true, title: 'B2 工具' });
  check('可补 ports=null', m.setPorts(3, 6).ok && m.data.ports.entry.col === 3 &&
    m.data.ports.exit.col === 6);
  check('可清空接口(保留可撤销由 UI 负责)', m.clearPorts().ok && m.data.ports === null);
  m.setPorts(3, 6);
  const path = m.addPath('loop', [{ col: 5, row: 5 }, { col: 8, row: 5 }, { col: 8, row: 7 }]);
  check('可新增路径', path.ok, path.ok ? '' : path.error.message);
  const obj = m.placeObject('gear', 5, 5);
  check('可加六个注册对象', obj.ok);
  check('gear 初始格对齐路径首点', m.updateObject(obj.value.id, {
    params: { speedTilesPerSecond: 2, radiusTiles: 0.5, damage: 20 },
    pathId: path.value.id
  }).ok && obj.value.col === 5 && obj.value.row === 5);
  const delBlocked = m.removePath(path.value.id);
  check('被对象引用的路径不能静默删除', !delBlocked.ok && delBlocked.error.code === 'IN_USE');
  m.updateObject(obj.value.id, { pathId: null });
  check('解除引用后可删除路径', m.removePath(path.value.id).ok);
  check('删除对象', m.removeObject(obj.value.id) === 1 && m.data.objects.length === 0);
}

export const result = { pass, fail, fails, name: 'B2 自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`B2 自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✓');
  process.exit(0);
}
