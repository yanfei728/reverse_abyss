#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/* test_single_level_trial.mjs —— 单图 TrialSession(23号卡:普通游玩初态/无几何门槛) */
import { strict as assert } from 'node:assert';
import { loadEditor } from './loader.mjs';
const RA = loadEditor(), TS = RA.C.TS, LD = RA.LevelData;
let pass = 0, fail = 0;
function check(n, f) { try { f(); pass++; console.log('  PASS  ' + n); } catch (e) { fail++; console.log('  FAIL  ' + n + '    ' + e.message); } }
function level(startRow, finishRow) {
  const cols = 12, rows = 10, tiles = Array.from({ length: rows }, () => new Array(cols).fill(0));
  [startRow, finishRow].forEach((row) => {
    tiles[row][2] = 5; tiles[row][3] = 5; tiles[row][1] = 1; tiles[row][4] = 1;
  });
  return { schemaVersion: 2, id: 'trial_syn', title: 'synthetic', kind: 'normal', difficulty: 1,
    size: { cols, rows }, terrain: { tiles }, spawn: null,
    ports: { profile: 'cloud-pipe-v2', start: { col: 2, row: startRow }, finish: { col: 2, row: finishRow } },
    objects: [], paths: [], visuals: { backgroundId: 'sky1', decorations: [] }, extensions: {}, contentHash: null, certification: null };
}
function handoff(data, profileId) {
  return { version: 3, kind: 'editor-validation', profileId: profileId || 'run-v1', template: data,
    subjectRef: { levelId: data.id, contentHash: null }, draftRef: { draftId: data.id, revision: 1 },
    rules: { rulesVersion: RA.RULES.rulesVersion, rulesFingerprint: RA.RULES.rulesFingerprint }, requestId: 't' };
}
function build(data, profileId) { return RA.TrialSession.build(handoff(data, profileId)); }
function create(start, finish) {
  const d = level(start, finish);
  const p = build(d);
  assert.equal(p.ok, true, p.error && p.error.message);
  return RA.TrialSession.create(p.value);
}
function jump(s) { for (let n = 0; n < 240 && s.status === 'running'; n++) { s.setActions({ jumpHeld: n < 20 || (n >= 24 && n < 60) }); s.update(1 / 60); } }

check('单图从 start 中心顶面出生,无 World/支撑', () => {
  const s = create(6, 2);
  assert.equal(s.player.feet, 6 * TS);
  assert.equal(Math.round(s.player.x + s.player.w / 2), 3 * TS);
  assert.equal(s.inst.world, null);
});
check('试玩用普通游玩初态:满血、技能开局可用,施放后 14/20 秒', () => {
  const s = create(6, 2);
  const sn = s.snapshot();
  assert.equal(sn.profileId, 'run-v1');
  assert.equal(sn.hp, RA.RULES.tuning.hp);
  assert.equal(sn.haloCooldownRemaining, 0);
  assert.equal(s.pressSkill(), true, '开局应当能施放技能');
  assert.ok(s.run.haloActiveRemaining > 14 - 1e-9 && s.run.haloActiveRemaining <= 14);
  assert.ok(s.run.haloCooldownRemaining > 20 - 1e-9 && s.run.haloCooldownRemaining <= 20);
  assert.equal(s.pressSkill(), false, '冷却中不能再施放');
});
check('旧 standard-v1 handoff 仍按自己的 profile 记录(不再硬性要求)', () => {
  const p = build(level(6, 2), 'standard-v1');
  assert.equal(p.ok, true, p.error && p.error.message);
  assert.equal(p.value.profileId, 'standard-v1');
  assert.equal(p.value.profile.haloCooldown, RA.RULES.tuning.haloCooldown);
});
check('真实二段跳从 start 到 finish 通过一次并冻结', () => {
  const s = create(6, 2); jump(s);
  assert.equal(s.status, 'passed', 'status=' + s.status + ' feet=' + s.player.feet);
  const t = s.time, ev = s.drainEvents(); assert.equal(ev.filter((e) => e.type === 'trialPassed').length, 1);
  for (let i = 0; i < 60; i++) s.update(1 / 60);
  assert.equal(s.time, t); assert.equal(s.status, 'passed');
});
check('finish.row=0 可在本图上方通过', () => {
  const s = create(4, 0); jump(s); assert.equal(s.status, 'passed');
});
check('120Hz/60Hz相同实际时间位移一致,dt=0不模拟', () => {
  const a = create(6, 2), b = create(6, 2);
  a.setActions({ right: true }); b.setActions({ right: true });
  for (let i = 0; i < 120; i++) a.update(1 / 120);
  for (let i = 0; i < 60; i++) b.update(1 / 60);
  assert.ok(Math.abs(a.player.x - b.player.x) < 1e-6, a.player.x + ' vs ' + b.player.x);
  const x = a.player.x; a.update(0); a.update(-1); a.update(NaN);
  assert.equal(a.player.x, x);
});
check('暂停冻结:时间/位置不动,恢复不追算;两次 pause→resume', () => {
  const s = create(6, 2);
  for (let i = 0; i < 10; i++) s.update(1 / 60);
  assert.equal(s.pause(), true);
  const t = s.time, y = s.player.y;
  for (let i = 0; i < 60; i++) s.update(1 / 60);
  assert.equal(s.time, t); assert.equal(s.player.y, y);
  assert.equal(s.pause(), false, '已经暂停时再 pause 不重复切状态');
  assert.equal(s.resume(), true);
  assert.equal(s.resume(), false);
  s.update(1 / 60);
  assert.ok(s.time > t && s.time - t < 0.03, '恢复后不补算暂停期间的现实时间,时间=' + s.time);
});
check('被光环清除的火球 alive=false,不会重复计数,齿轮/地刺不被清除', () => {
  const d = level(6, 2);
  d.paths = [{ id: 'gpath', mode: 'pingpong', points: [{ col: 9, row: 8 }, { col: 9, row: 7 }] }];
  d.objects = [
    { id: 'fb', type: 'fireball_static', col: 3, row: 5, params: { radiusTiles: 0.5, damage: 20 } },
    { id: 'sp', type: 'spike', col: 8, row: 8, params: { warningSeconds: 0.5, activeSeconds: 0.8, cooldownSeconds: 1, damage: 20 } },
    { id: 'gr', type: 'gear', col: 9, row: 8, pathId: 'gpath', params: { speedTilesPerSecond: 2, radiusTiles: 0.5, damage: 20 } }
  ];
  const p = build(d);
  assert.equal(p.ok, true, p.error && p.error.message);
  const s = RA.TrialSession.create(p.value);
  assert.equal(s.pressSkill(), true);
  s.update(1 / 60); s.update(1 / 60);
  const fb = s.inst.objects.filter((o) => o.id === 'fb')[0];
  assert.equal(fb.alive, false, '范围内的火球应被光环清除');
  assert.equal(s.inst.objects.filter((o) => o.id === 'sp')[0].alive, true);
  assert.equal(s.inst.objects.filter((o) => o.id === 'gr')[0].alive, true);
});
check('取消几何/净空/可达性门槛:不符合旧规则的图也能启动试玩', () => {
  const d = level(6, 2);
  // 旧 play 校验会因这三条拒绝:finish 不在最高行、云板两侧不是实心、起点上方净空被占用
  d.terrain.tiles[0][10] = 1;
  d.terrain.tiles[6][1] = 0;
  d.objects.push({ id: 'block', type: 'fireball_static', col: 2, row: 5, params: { radiusTiles: 0.5, damage: 20 } });
  assert.ok(LD.errorsOf(LD.validate(d, { purpose: 'play' })).length > 0, '旧 play 门槛本来会拒绝这张图');
  const p = build(d);
  assert.equal(p.ok, true, p.error && p.error.message);
  assert.equal(LD.readableIssues(d).length, 0, '只读检查不应报错');
});
check('仍保留运行必需读取错误:未知对象/缺起终点/网格坏掉都明确拒绝', () => {
  const unknown = level(6, 2);
  unknown.objects.push({ id: 'x', type: 'future_enemy', col: 1, row: 1, params: {} });
  const pu = build(unknown);
  assert.equal(pu.ok, false);
  assert.equal(pu.error.code, 'UNKNOWN_ENTITY');
  const noFinish = level(6, 2); noFinish.ports.finish = null;
  const pf = build(noFinish);
  assert.equal(pf.ok, false);
  assert.ok(/finish/.test(pf.error.message), pf.error.message);
  const brokenGrid = level(6, 2); brokenGrid.size.cols = 13;
  const pg = build(brokenGrid);
  assert.equal(pg.ok, false);
});
check('启动数据缺失/结构过期给出具体错误码', () => {
  const noData = RA.TrialSession.build(null);
  assert.equal(noData.ok, false); assert.equal(noData.error.code, 'TRIAL_HANDOFF');
  const oldVersion = RA.TrialSession.build({ version: 2, kind: 'editor-validation', template: level(6, 2) });
  assert.equal(oldVersion.ok, false);
  const badKind = RA.TrialSession.build(handoff(Object.assign(level(6, 2), { kind: 'rest' })));
  assert.equal(badKind.ok, false); assert.equal(badKind.error.code, 'TRIAL_KIND');
});
check('暂停/死亡不产生通过', () => {
  const s = create(6, 2); s.pause(); s.update(1); assert.equal(s.status, 'paused');
  s.resume(); s.run.hp = 0; s.status = 'failed'; assert.equal(s.status, 'failed');
});
console.log('\n单图试玩(23号卡):合计 PASS ' + pass + ' FAIL ' + fail);
export const result = { pass, fail };
if (process.argv[1] && /test_single_level_trial\.mjs$/.test(process.argv[1])) process.exit(fail ? 1 : 0);
