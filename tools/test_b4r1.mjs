#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_b4r1.mjs —— 17 号卡：PC 固定六图短塔 R1/R2
 * 源件保真、固定锚点、大厅 F、四条真实二段跳穿管、石墙/负行碰撞、休整、Boss。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { loadEditor, ROOT } from './loader.mjs';

const RA = loadEditor();
const LD = RA.LevelData, TS = RA.C.TS;
let pass = 0, fail = 0;
const fails = [];
function check(name, fn) {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; fails.push(name); console.log('  FAIL  ' + name + '    ' + (e && e.message)); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const samples = () => RA.B4_SAMPLES;
const floors = () => ['lobby', 'normal1', 'normal2', 'normal3', 'rest', 'boss'].map((k) => clone(samples()[k]));
function session() {
  const r = RA.GameSession.create({ floors: floors(), profile: 'run-v1' });
  assert.equal(r.ok, true, r.error && r.error.message);
  return r.value;
}
function transferAndClimb(s, target) {
  s.pressInteract(); s.stepOnce();
  assert.equal(s.world.current, 1);
  for (let i = 1; i < target; i++) climb(s, i);
}
function climb(s, i) {
  const w = s.world, l = w.links[i], p = s.player;
  p.x = (l.openingLeft + l.openingRight) / 2 - p.w / 2;
  p.y = l.finishY - p.h;
  p.vx = 0; p.vy = 0; p.onGround = true; p.coyote = 0.1;
  p.jumpsUsed = 0; p.prevJump = false;
  for (let n = 0; n < 180 && w.current === i; n++) {
    s.setActions({ jumpHeld: (n < 20 || (n >= 24 && n < 60)) });
    s.stepOnce();
  }
  assert.equal(w.current, i + 1, 'link ' + i + ' feet=' + p.feet + ' commit=' + l.commitY);
}

console.log('B4-R1 固定六图短塔');
check('三张固定源字节 SHA 不变', () => {
  const want = {
    'level0.json': 'fcaf59ad30d603042dd4770a62baa303c1cb2841311aac480b2bbeda5d337953',
    'rest_level.json': '3e35e2570379bb0fae2895b02bde39f6490c39caa45ad90ef9d704316bbbf136',
    'boss.json': 'f3b0e3fb0c0e43ac51ecbd4d168de38ffe3898ea0c342c4424757dd2225acaea'
  };
  Object.keys(want).forEach((f) => {
    const b = readFileSync(join(ROOT, 'levels/archive/authored/source-fixed-2026-11-07', f));
    assert.equal(createHash('sha256').update(b).digest('hex'), want[f]);
  });
});
check('level0 仅精确两格裸 x 转0,其余地形/尺寸/空白不变', () => {
  const raw = read('levels/archive/authored/source-fixed-2026-11-07/level0.json');
  assert.equal((raw.match(/\bx\b/g) || []).length, 2);
  const src = JSON.parse(raw.replace(/\bx\b/g, '0'));
  const run = json('levels/archive/authored/fixed/level0.json');
  assert.deepEqual(run.size, src.size);
  for (let r = 0; r < src.size.rows; r++) {
    for (let c = 0; c < src.size.cols; c++) {
      const s = src.terrain.tiles[r][c];
      assert.equal(run.terrain.tiles[r][c], s);
    }
  }
  assert.equal(run.terrain.tiles[19][9], 0);
  assert.equal(run.terrain.tiles[19][10], 0);
  assert.equal(run.kind, 'lobby');
  assert.equal(run.id, 'b4_lobby');
  assert.equal(run.ports, null);
  assert.deepEqual(run.extensions.fixedScene.playerSpawn, { centerCol: 10, feetRow: 20 });
});
check('rest/boss 地形、尺寸、空白保真且固定身份独立', () => {
  const restSrc = json('levels/archive/authored/source-fixed-2026-11-07/rest_level.json');
  const rest = json('levels/archive/authored/fixed/rest_level.json');
  assert.deepEqual(rest.size, restSrc.size);
  assert.deepEqual(rest.terrain, restSrc.terrain);
  assert.equal(rest.kind, 'rest'); assert.equal(rest.id, 'b4_rest');
  assert.deepEqual(rest.ports.start, { col: 13, row: 18 });
  assert.deepEqual(rest.ports.finish, { col: 1, row: 8 });
  const bossSrc = json('levels/archive/authored/source-fixed-2026-11-07/boss.json');
  const boss = json('levels/archive/authored/fixed/boss.json');
  assert.deepEqual(boss.size, bossSrc.size);
  assert.deepEqual(boss.terrain, bossSrc.terrain);
  assert.equal(boss.kind, 'boss'); assert.equal(boss.id, 'b4_boss');
  assert.deepEqual(boss.ports.start, { col: 1, row: 20 });
  assert.equal(boss.ports.finish, null);
  assert.deepEqual(boss.extensions.fixedScene.boss, { centerCol: 10.5, centerRow: 14.5 });
  assert.notEqual(boss.id, rest.id);
});
check('共享校验:lobby无ports/Boss仅start可跑,normal缺端点拒绝', () => {
  const lobby = samples().lobby;
  assert.equal(LD.errorsOf(LD.validate(lobby, { purpose: 'play' })).length, 0);
  assert.equal(LD.errorsOf(LD.validate(samples().boss, { purpose: 'play' })).length, 0);
  const bad = clone(samples().normal1); bad.ports = null;
  assert.ok(LD.errorsOf(LD.validate(bad, { purpose: 'play' })).some((e) => e.code === 'INVALID_PORT'));
  const mixed = clone(samples().normal1);
  mixed.ports = { profile: 'vertical-v1', entry: { col: 2 }, exit: { col: 3 } };
  const mr = RA.GameSession.create({ floors: [mixed], requireCloud: true });
  assert.equal(mr.ok, false);
  assert.equal(mr.error.code, 'LEGACY_PORT');
});
check('大厅出生中心/脚底与 F 提示', () => {
  const s = session();
  assert.equal(s.world.current, 0);
  assert.equal(Math.round(s.player.x + s.player.w / 2), 450);
  assert.equal(Math.round(s.player.feet), 900);
  assert.ok(s.interactionPrompt() && s.interactionPrompt().text.indexOf('F') >= 0);
});
check('F 单次传送到第1层,保留生命/光环/同一Player', () => {
  const s = session(); const p = s.player;
  s.run.hp = 60; s.run.haloActiveRemaining = 7;
  s.pressInteract(); s.stepOnce();
  assert.equal(s.world.current, 1);
  assert.equal(s.player, p);
  assert.equal(s.run.hp, 60); assert.ok(Math.abs(s.run.haloActiveRemaining - 7) < 0.05);
  assert.equal(s.interactionPrompt(), null);
  s.pressInteract(); s.stepOnce();
  assert.equal(s.world.current, 1);
});
check('四条连接可用真实二段跳从下端云板穿到上层 start', () => {
  const s = session(); s.pressInteract(); s.stepOnce();
  for (let i = 1; i <= 4; i++) climb(s, i);
  assert.equal(s.world.current, 5);
  assert.equal(s.status, 'running');
});
check('石管六块墙:逐格 tileId=4,上层未激活时四向阻挡', () => {
  const s = session(); s.pressInteract(); s.stepOnce();
  for (let i = 1; i <= 4; i++) {
    const f = s.world.currentFloor, l = s.world.links[i];
    const keys = Object.keys(f.wallCells || {});
    assert.equal(keys.length, 6, 'link ' + i + ' walls ' + keys.length);
    keys.forEach((k) => {
      const [r, c] = k.split(':').map(Number);
      assert.equal(f.solidAt(r, c), true);
      assert.equal(f.view.blockedAt(f.originTileY + r, f.originTileX + c), true);
    });
    // 从管内向左/右移动,不能穿出内壁
    const p = s.player;
    p.x = l.openingLeft + 1; p.y = l.openingStartY ? l.openingStartY : (l.startY + TS); p.vx = -900; p.vy = 0;
    const r = f.view.move(p.x, p.y, p.w, p.h, -900, 0, 1 / 60);
    assert.ok(r.x >= l.openingLeft - 0.01, 'left wall x=' + r.x);
    s.stepOnce();
    if (s.world.current !== i) break;
    // 推进到下一层,继续检查
    climb(s, i);
  }
});
check('test3 finish.row=2 的负行管壁仍参与碰撞', () => {
  const s = session(); transferAndClimb(s, 3);
  const f = s.world.currentFloor, l = s.world.links[3];
  assert.equal(f.finish.row, 2);
  assert.ok(f.wallCells && f.wallCells['-1:' + (f.finish.col - 1)]);
  assert.equal(f.view.blockedAt(f.originTileY - 1, f.originTileX + f.finish.col - 1), true);
  assert.equal(f.view.blockedAt(f.originTileY - 1, f.originTileX + f.finish.col + 2), true);
});
check('休整入场一次回复40/封顶100,平台跳跃不重复', () => {
  const s = session(); transferAndClimb(s, 3);
  s.run.hp = 50;
  climb(s, 3);
  assert.equal(s.world.current, 4);
  assert.equal(s.run.hp, 90);
  const once = s.run.hp;
  for (let n = 0; n < 90; n++) { s.setActions({ jumpHeld: n % 30 < 6 }); s.stepOnce(); }
  assert.equal(s.run.hp, once);
});
check('Boss 固定中心(10.5,14.5),只有start/无finish/无后续管', () => {
  const s = session(); transferAndClimb(s, 4); climb(s, 4);
  assert.equal(s.world.current, 5);
  const f = s.world.currentFloor;
  assert.equal(f.finish, null);
  assert.equal(f.data.ports.finish, null);
  assert.equal(f.exitOpen, false);
  assert.ok(s.boss);
  const cx = (s.boss.x + s.boss.w / 2 - f.origin.x) / TS;
  const cy = (s.boss.y + s.boss.h / 2 - f.origin.y) / TS;
  assert.equal(cx, 10.5); assert.equal(cy, 14.5);
});
check('短塔规则 b4-2 指纹覆盖固定场景/碰撞', () => {
  assert.ok(/^b4-\d+$/.test(RA.RULES.rulesVersion), RA.RULES.rulesVersion);
  assert.ok(RA.RULES.rulesFingerprint.indexOf('fixed=short-fixed-v1') >= 0);
  assert.ok(RA.RULES.rulesFingerprint.indexOf('collision=world-v3') >= 0);
});

console.log('\nB4-R1 自检:合计 PASS ' + pass + '  FAIL ' + fail);
export const result = { pass, fail, fails };
if (process.argv[1] && /test_b4r1\.mjs$/.test(process.argv[1])) process.exit(fail ? 1 : 0);
