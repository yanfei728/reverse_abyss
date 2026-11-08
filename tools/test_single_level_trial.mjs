#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/* test_single_level_trial.mjs —— 21号卡:独立单图 TrialSession */
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
function handoff(data) { return { version: 3, kind: 'editor-validation', profileId: 'standard-v1', template: data,
  subjectRef: { levelId: data.id, contentHash: null }, draftRef: { draftId: data.id, revision: 1 },
  rules: { rulesVersion: RA.RULES.rulesVersion, rulesFingerprint: RA.RULES.rulesFingerprint }, requestId: 't' }; }
function create(start, finish) { const d = level(start, finish); const p = RA.TrialSession.build(handoff(d)); assert.equal(p.ok, true, p.error && p.error.message); return RA.TrialSession.create(p.value); }
function jump(s) { for (let n = 0; n < 240 && s.status === 'running'; n++) { s.setActions({ jumpHeld: n < 20 || (n >= 24 && n < 60) }); s.update(1 / 60); } }

check('单图从 start 中心顶面出生,无 World/支撑', () => {
  const s = create(6, 2);
  assert.equal(s.player.feet, 6 * TS);
  assert.equal(Math.round(s.player.x + s.player.w / 2), 3 * TS);
  assert.equal(s.inst.world, null);
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
  const x0 = a.player.x;
  for (let i = 0; i < 120; i++) a.update(1 / 120);
  for (let i = 0; i < 60; i++) b.update(1 / 60);
  assert.ok(Math.abs(a.player.x - b.player.x) < 1e-6, a.player.x + ' vs ' + b.player.x);
  const x = a.player.x; a.update(0); a.update(-1); a.update(NaN);
  assert.equal(a.player.x, x);
});
check('标准初始冷却20秒,之后 K 可用', () => {
  const s = create(6, 2);
  assert.equal(s.snapshot().haloCooldownRemaining, 20);
  assert.equal(s.pressSkill(), false);
  for (let i = 0; i < 1210; i++) s.update(1 / 60);
  assert.equal(s.pressSkill(), true);
});
check('暂停/死亡不产生通过', () => {
  const s = create(6, 2); s.pause(); s.update(1); assert.equal(s.status, 'paused');
  s.resume(); s.run.hp = 0; s.status = 'failed'; assert.equal(s.status, 'failed');
});
console.log('\n独立单图试玩:合计 PASS ' + pass + ' FAIL ' + fail);
export const result = { pass, fail };
if (process.argv[1] && /test_single_level_trial\.mjs$/.test(process.argv[1])) process.exit(fail ? 1 : 0);
