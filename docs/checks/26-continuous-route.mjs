// 26号卡附加诊断:真实 Session/Player 连续物理步进 1→6(不是可见浏览器、不是真人通关)。
// 使用 test3 平台路线;输入由脚本按固定策略给出,不调用 activateSlot/debugJumpTo,不设置 finish 站位。
import { loadEngine } from '../../tools/loader.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const R = loadEngine(), clone = (v) => JSON.parse(JSON.stringify(v));
const plan = R.TowerPlanner.buildFull40({
  fixedLevels: R.FULL40.fixed, fallback: R.FULL40.fallback, candidates: [], seed: 1,
  poolEpoch: R.FULL40.poolEpoch
}).value;
const s = R.GameSession.create({
  floors: plan.floors.map((f) => clone(f.data)), manifest: clone(plan),
  profile: 'run-v1', requireCloud: true, mode: 'full40-formal'
}).value;
s.setActions({ interactPressed: true }); s.update(1 / 60); // 真实大厅 F 分派
const TS = R.C.TS;
const PLAN = [
  { top: 810, take: 120, target: 250 }, { top: 720, take: 330, target: 480 },
  { top: 630, take: 560, target: 700 }, { top: 450, take: 700, target: 520 },
  { top: 315, take: 520, target: 300 }, { top: 225, take: 300, target: 160 },
  { top: 90, take: 110, target: 125, cloud: true }
];
let stage = 0, mode = 'walk', lastFloor = s.world.current, frame = 0;
const transitions = [];
for (; frame < 12000 && s.world.current < 6; frame++) {
  if (s.world.current !== lastFloor) {
    transitions.push({ from: lastFloor, to: s.world.current, frame,
      hudFloor: s.snapshot().floorNumber, live: [...s.world.instances.keys()],
      playerView: s.player.level.inst.index });
    lastFloor = s.world.current; stage = 0; mode = 'walk';
  }
  const fl = s.world.currentFloor, p = s.player;
  const lx = p.x + p.w / 2 - fl.origin.x, lf = p.feet - fl.origin.y;
  const P = PLAN[Math.min(stage, PLAN.length - 1)];
  if (mode === 'walk') {
    const dir = lx < P.take - 6 ? 1 : (lx > P.take + 6 ? -1 : 0);
    s.setActions({ right: dir > 0, left: dir < 0, jumpHeld: false }); s.update(1 / 60);
    if (Math.abs(lx - P.take) < 8 && p.onGround) { mode = 'jump'; P._frame = 0; }
  } else {
    P._frame = (P._frame || 0) + 1;
    const dir = lx < P.target - 6 ? 1 : (lx > P.target + 6 ? -1 : 0);
    s.setActions({ right: dir > 0, left: dir < 0,
      jumpHeld: P._frame < 20 || (P._frame >= 24 && P._frame < 64) });
    s.update(1 / 60);
    if (p.onGround && Math.abs(p.feet - fl.origin.y - P.top) < 3) { stage++; mode = 'walk'; }
    else if (P._frame > 130) { mode = 'walk'; P._frame = 0; }
  }
}
const report = {
  date: '2026-11-09', kind: 'engine-continuous-physics',
  entry: 'plan seed=1 fallback test3; F 0→1 then real setActions stepping',
  limits: 'Node loader; scripted input, not visible browser and not a human clear. No finish-position fixture, no debugJumpTo/activateSlot.',
  transitions, finalFloor: s.world.current, finalLive: [...s.world.instances.keys()],
  playerView: s.player.level.inst.index, frames: frame, status: s.status
};
writeFileSync(fileURLToPath(new URL('./26-continuous-route.json', import.meta.url)),
  JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ transitions: transitions.map((t) => t.from + '>' + t.to),
  finalFloor: s.world.current, finalLive: report.finalLive, playerView: report.playerView,
  status: s.status }, null, 2));
