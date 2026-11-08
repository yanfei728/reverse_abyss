#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_b4r2.mjs —— 18 号卡：上穿云板时侧移进入上层侧实心的回归
 * 复用原16种接缝输入：4连接×左右×起跳即横移/第17帧横移。
 * 初始只放到下端云板;之后只用真实固定步+方向/二段跳输入,不改坐标/速度/index。
 */
import { strict as assert } from 'node:assert';
import { loadEditor } from './loader.mjs';

const RA = loadEditor();
const TS = RA.C.TS;
let pass = 0, fail = 0;
const fails = [];
const clone = (v) => JSON.parse(JSON.stringify(v));
function check(name, fn) {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; fails.push(name); console.log('  FAIL  ' + name + '    ' + (e && e.message)); }
}
function session() {
  const r = RA.GameSession.create({
    floors: ['lobby', 'normal1', 'normal2', 'normal3', 'rest', 'boss'].map((k) => clone(RA.B4_SAMPLES[k])),
    profile: 'run-v1', requireCloud: true
  });
  assert.equal(r.ok, true, r.error && r.error.message);
  r.value.pressInteract(); r.value.stepOnce();
  return r.value;
}
function atLowerBoard(s, index, side) {
  const l = s.world.links[index], p = s.player;
  p.x = side < 0 ? l.openingLeft + 1 : side > 0 ? l.openingRight - p.w - 1 : (l.openingLeft + l.openingRight - p.w) / 2;
  p.y = l.finishY - p.h;
  p.vx = p.vy = 0; p.onGround = true; p.coyote = 0.1; p.jumpsUsed = 0; p.prevJump = false;
}
function jump(n) { return n < 20 || (n >= 24 && n < 60); }
function prepare(index) {
  const s = session();
  for (let i = 1; i < index; i++) {
    atLowerBoard(s, i, 0);
    for (let n = 0; n < 180 && s.world.current === i; n++) {
      s.setActions({ left: false, right: false, jumpHeld: jump(n) }); s.stepOnce();
    }
    assert.equal(s.world.current, i + 1, 'control ascent ' + i);
  }
  return s;
}

console.log('B4-R2 云板侧边穿墙');
check('World 第1层原点按 TS 对齐,不再有 -2000/45 的 round 差', () => {
  const s = session();
  const origin = s.world.origins[1];
  assert.ok(Math.abs(origin.y % TS) === 0);
  assert.equal(s.world.currentFloor.originTileY, s.world.currentFloor.origin.y / TS);
});

let reproduced = 0, fullBody = 0;
for (const index of [1, 2, 3, 4]) {
  for (const direction of [-1, 1]) {
    for (const lateralStart of [0, 17]) {
      check(`连接${index} ${direction < 0 ? '左' : '右'} ${lateralStart === 0 ? '起跳即横移' : '第17帧横移'}`, () => {
        const s = prepare(index), w = s.world, p = s.player, l = w.links[index];
        const upper = w.instances.get(index + 1);
        atLowerBoard(s, index, direction);
        const col = direction < 0 ? upper.start.col - 1 : upper.start.col + 2;
        const wall = {
          x: upper.origin.x + col * TS, y: upper.origin.y + upper.start.row * TS,
          w: TS, h: TS
        };
        assert.ok(upper.data.terrain.tiles[upper.start.row][col] >= 1 &&
          upper.data.terrain.tiles[upper.start.row][col] <= 4, 'side support must be solid');
        let bad = 0, whole = 0;
        for (let n = 0; n < 90 && w.current === index; n++) {
          s.setActions({
            left: direction < 0 && n >= lateralStart,
            right: direction > 0 && n >= lateralStart,
            jumpHeld: jump(n)
          });
          s.stepOnce();
          const ox = Math.min(p.x + p.w, wall.x + wall.w) - Math.max(p.x, wall.x);
          const oy = Math.min(p.y + p.h, wall.y + wall.h) - Math.max(p.y, wall.y);
          if (ox > 1 && oy > 1) bad++;
          if (ox >= p.w - 0.01 && oy >= p.h - 0.01) whole++;
        }
        if (bad) reproduced++;
        if (whole) fullBody++;
        assert.equal(bad, 0, 'intersections=' + bad + ' first wall=' + JSON.stringify(wall));
      });
    }
  }
}
check('原16种输入无持续实心相交/无整身入墙', () => {
  assert.equal(reproduced, 0); assert.equal(fullBody, 0);
});
check('正常居中二段跳四连接仍能入层(同一Player)', () => {
  const s = session(); const p = s.player;
  for (let i = 1; i <= 4; i++) {
    const w = s.world, l = w.links[i];
    p.x = (l.openingLeft + l.openingRight) / 2 - p.w / 2;
    p.y = l.finishY - p.h; p.vx = 0; p.vy = 0; p.onGround = true; p.coyote = 0.1;
    p.jumpsUsed = 0; p.prevJump = false;
    for (let n = 0; n < 180 && w.current === i; n++) {
      s.setActions({ jumpHeld: jump(n) }); s.stepOnce();
    }
    assert.equal(w.current, i + 1, 'link ' + i);
    assert.equal(s.player, p);
  }
});
check('预热/暂停/生命/光环不因侧墙查询被提前启动', () => {
  const s = session();
  const next = s.world.instances.get(2);
  assert.equal(next.state, 'preview');
  assert.equal(next.activeTime, 0);
  s.pause();
  const t = s.time;
  s.update(1);
  assert.equal(s.time, t);
  s.resume();
});

console.log('\nB4-R2 自检:合计 PASS ' + pass + '  FAIL ' + fail);
export const result = { pass, fail, fails };
if (process.argv[1] && /test_b4r2\.mjs$/.test(process.argv[1])) process.exit(fail ? 1 : 0);
