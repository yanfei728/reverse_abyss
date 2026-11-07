#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_b4.mjs —— B4 云板/石管/作者三图/编辑器模型检查
 * 只验证真实数据、几何、会话状态与编辑操作,不代替浏览器画面/真机。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { loadEditor, ROOT } from './loader.mjs';

const RA = loadEditor();
const LD = RA.LevelData, CP = RA.CloudPipe, TS = RA.C.TS;
let pass = 0, fail = 0;
const fails = [];
function check(name, fn) {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; fails.push(name); console.log('  FAIL  ' + name + '    ' + (e && e.message)); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const src = (n) => JSON.parse(readFileSync(join(ROOT, 'levels/authored/source-2026-11-07', n + '.json'), 'utf8'));
const run = (n) => JSON.parse(readFileSync(join(ROOT, 'levels/authored/short', n + '.json'), 'utf8'));
const sample = (k) => clone(RA.B4_SAMPLES[k]);
const blank = (c, r) => Array.from({ length: r }, () => new Array(c).fill(0));

function cloudLevel(start, finish, extra) {
  const cols = 12, rows = 16, tiles = blank(cols, rows);
  [[start.col, start.row], [finish.col, finish.row]].forEach(([c, r]) => {
    tiles[r][c] = 5; tiles[r][c + 1] = 5;
    tiles[r][c - 1] = 1; tiles[r][c + 2] = 1;
  });
  const d = {
    schemaVersion: 2, id: 'test_cloud', title: 't', kind: 'normal', difficulty: 1,
    size: { cols, rows }, terrain: { tiles }, spawn: null,
    ports: { profile: CP.CLOUD.profile, start, finish },
    objects: [], paths: [], visuals: { backgroundId: null, decorations: [] },
    extensions: {}, contentHash: null, certification: null
  };
  if (extra) extra(d);
  return d;
}
function errors(d) { return LD.validate(d, { purpose: 'play' }).filter((i) => i.severity === 'error'); }

console.log('B4 数据/几何/编辑器');
check('作者三图原字节副本未改', () => {
  const expect = JSON.parse(readFileSync(join(ROOT, 'docs/checks/authored-levels-2026-11-07.json'), 'utf8')).records;
  expect.forEach((r) => {
    const b = readFileSync(join(ROOT, r.file));
    assert.equal(createHash('sha256').update(b).digest('hex'), r.fileSha256);
  });
});
check('作者运行副本:id 独立、尺寸/地形/未知字段保真、无 spawn/认证', () => {
  ['test1', 'test2', 'test3'].forEach((n) => {
    const a = src(n), b = run(n);
    assert.notEqual(b.id, 'level_mw6arbjv_1l');
    assert.equal(b.spawn, null);
    assert.equal(b.certification, null);
    assert.deepEqual(b.size, a.size);
    assert.deepEqual(b.terrain, a.terrain);
    assert.deepEqual(b.visuals, a.visuals);
    assert.equal(errors(b).length, 0, JSON.stringify(errors(b)));
  });
  assert.equal(new Set([run('test1').id, run('test2').id, run('test3').id]).size, 3);
});
check('云板端点:合法 start/finish 通过,缺/错端点被 play 拒绝', () => {
  const ok = cloudLevel({ col: 2, row: 12 }, { col: 6, row: 2 });
  assert.equal(errors(ok).length, 0, JSON.stringify(errors(ok)));
  const missing = clone(ok); missing.ports = null;
  assert.ok(errors(missing).some((e) => e.code === 'INVALID_PORT'));
  const one = clone(ok); one.terrain.tiles[2][7] = 0;
  assert.ok(errors(one).some((e) => e.code === 'INVALID_PORT'));
  const wrong = clone(ok); wrong.ports.start = { col: 2, row: 2 };
  assert.ok(errors(wrong).length > 0);
});
check('云板端点:左右支撑/净空/对象阻断有具体问题', () => {
  const d = cloudLevel({ col: 2, row: 12 }, { col: 6, row: 2 });
  const side = clone(d); side.terrain.tiles[12][1] = 0;
  assert.ok(errors(side).some((e) => e.path.indexOf('/ports/start') >= 0));
  const clear = clone(d); clear.terrain.tiles[10][2] = 1;
  assert.ok(errors(clear).some((e) => e.message.indexOf('净空') >= 0));
  const obj = clone(d); obj.objects = [{ id: 'o1', type: 'fireball_static', col: 2, row: 11, params: {} }];
  assert.ok(errors(obj).some((e) => e.message.indexOf('对象') >= 0));
});
check('云板起点 pose:角色中心对齐两格、feet 在云板顶面', () => {
  const d = cloudLevel({ col: 2, row: 12 }, { col: 6, row: 2 });
  const p = CP.startPose(d, { w: 20, h: 36 });
  assert.equal(p.feet, 12 * TS);
  assert.equal(p.x, 2 * TS + TS - 10);
});
check('石管几何:两端顶面相距 4 格、内宽2高3、两侧墙、commitY 在上层 start', () => {
  const floors = ['lobby', 'normal1', 'normal2', 'normal3', 'rest', 'boss'].map(sample);
  const r = RA.GameSession.create({ floors, profile: 'run-v1' });
  assert.equal(r.ok, true);
  const w = r.value.world;
  w.links.forEach((link, i) => {
    if (i === 0) {
      assert.equal(link.kind, 'lobby-direct');
      assert.equal(link.walls, null);
    } else {
      assert.equal(link.kind, 'stone-pipe');
      assert.equal(link.inner.w, 2 * TS);
      assert.equal(link.inner.h, 3 * TS);
      assert.equal(link.walls.length, 2);
      assert.equal(link.walls[0].x, link.inner.x - TS);
      assert.equal(link.walls[1].x, link.inner.x + 2 * TS);
    }
    assert.equal(link.finishY - link.startY, 4 * TS);
    assert.equal(link.commitY, link.startY);
    assert.equal(w.origins[i + 1].y + floors[i + 1].ports.start.row * TS, link.startY);
  });
});
check('六层短塔实际换层:同一 Player、逐层提交、预热/快照/连接保留', () => {
  const floors = ['lobby', 'normal1', 'normal2', 'normal3', 'rest', 'boss'].map(sample);
  const r = RA.GameSession.create({ floors, profile: 'run-v1' });
  assert.equal(r.ok, true);
  const s = r.value, w = s.world, player = s.player;
  assert.equal(w.floorCount, 6);
  const ids = floors.map((f) => f.id);
  assert.deepEqual(ids, ['b4_lobby', 'author_test_1', 'author_test_2', 'author_test_3', 'b4_rest', 'b4_boss']);
  for (let i = 0; i < 5; i++) {
    const link = w.links[i];
    player.x = (link.openingLeft + link.openingRight) / 2 - player.w / 2;
    player.y = link.commitY - player.h + 20;
    player.vx = 0; player.vy = -400;
    let n = 0;
    while (w.current === i && n++ < 30) s.stepOnce();
    assert.equal(w.current, i + 1, 'link ' + i);
    assert.equal(player, s.player);
  }
  assert.equal(w.current, 5);
  assert.equal(s.status, 'running');
});
check('生成石墙有碰撞、且只在上层尚未激活时保留', () => {
  const floors = ['lobby', 'normal1', 'normal2', 'normal3', 'rest', 'boss'].map(sample);
  const r = RA.GameSession.create({ floors, profile: 'run-v1' });
  const w = r.value.world;
  const f1 = w.instances.get(1);
  assert.ok(f1.wallCells);
  const keys = Object.keys(f1.wallCells);
  assert.ok(keys.length >= 6);
  const first = keys[0].split(':').map(Number);
  assert.equal(f1.solidAt(first[0], first[1]), true);
});
check('编辑器:固定大厅/Boss 只读,改画/尺寸/终点都不生效', () => {
  const m = RA.EditorModel.fromData(sample('boss'));
  assert.equal(m.ok, true);
  const e = m.value;
  assert.equal(e.readOnly, true);
  const before = LD.hashSync(e.toData());
  e.applyChar(1, 1, '^');
  const r = e.setCloudEndpoint('start', 1, 20);
  assert.equal(r.ok, false);
  assert.equal(LD.hashSync(e.toData()), before);
});
check('编辑器:2×1 云板端点可标记,1×1/非云板失败,清除可恢复', () => {
  const d = cloudLevel({ col: 2, row: 12 }, { col: 6, row: 2 });
  d.ports = null;
  const m = RA.EditorModel.fromData(d).value;
  let r = m.setCloudEndpoint('start', 2, 12);
  assert.equal(r.ok, true);
  r = m.setCloudEndpoint('finish', 6, 2);
  assert.equal(r.ok, true);
  assert.equal(m.data.ports.start.col, 2);
  assert.equal(m.data.ports.finish.col, 6);
  r = m.setCloudEndpoint('start', 2, 12);
  assert.equal(r.ok, true);
  r = m.setCloudEndpoint('start', 1, 12);
  assert.equal(r.ok, false);
  r = m.clearCloudPorts();
  assert.equal(r.ok, true);
  assert.equal(m.data.ports, null);
});
check('编辑器:裁剪候选保留内容/端点,取消零变更,应用后尺寸与偏移正确', () => {
  const m = RA.EditorModel.fromData(run('test1')).value;
  const before = LD.hashSync(m.toData());
  const p = m.cropCandidate();
  assert.equal(p.ok, true);
  assert.equal(p.value.changed, true);
  assert.deepEqual(p.value.afterSize, { cols: 20, rows: 16 });
  assert.deepEqual(p.value.offset, { col: 0, row: -7 });
  const after = m.applyCrop(p.value);
  assert.equal(after.ok, true);
  assert.equal(m.data.size.rows, 16);
  assert.equal(m.data.ports.finish.row, 0);
  assert.deepEqual(m.contentBounds(), { col: 0, row: 0, cols: 20, rows: 16, empty: false });
  assert.notEqual(LD.hashSync(m.toData()), before);
});
check('编辑器:新建普通层无旧 spawn,自动扩展默认关', () => {
  const m = RA.EditorModel.create({ cols: 20, rows: 20, withGround: true });
  assert.equal(m.data.spawn, null);
  assert.equal(m.data.ports, null);
});
check('对象调色板包含已有火球/地刺/齿轮/弹簧/门/浮石', () => {
  const items = RA.EditorPalette ? RA.EditorPalette.build() : [];
  const types = items.map((i) => i.type).filter(Boolean);
  ['fireball_static', 'spike', 'gear', 'spring', 'crumble_door', 'blink_platform'].forEach((t) => {
    assert.ok(types.indexOf(t) >= 0, t + ' missing; have ' + types.join(','));
  });
});
check('B4 rulesVersion/fingerprint 已升级并覆盖接口', () => {
  assert.equal(RA.RULES.rulesVersion, 'b4-1');
  assert.ok(RA.RULES.rulesFingerprint.indexOf('cloud-pipe-v2') >= 0);
  assert.ok(RA.RULES.rulesFingerprint.indexOf('gap4') >= 0);
});

console.log('\nB4 自检:合计 PASS ' + pass + '  FAIL ' + fail);
export const result = { pass, fail, fails };
if (process.argv[1] && /test_b4\.mjs$/.test(process.argv[1])) process.exit(fail ? 1 : 0);
