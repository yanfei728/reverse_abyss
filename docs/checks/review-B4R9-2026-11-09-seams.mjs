// 定向引擎诊断，不是地图合规检查、真人通关或认证。
// 仅在每条接缝开始前设置一个合法的 finish 站位；随后全部调用真实 Player/Session 步进。
import { loadEngine } from '../../tools/loader.mjs';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = loadEngine();
const clone = (x) => JSON.parse(JSON.stringify(x));
const built = R.TowerPlanner.buildFull40({
  fixedLevels: R.FULL40.fixed, fallback: R.FULL40.fallback, candidates: [], seed: 1
});
if (!built.ok) throw new Error(JSON.stringify(built));
const plan = built.value;
function fresh() {
  const made = R.GameSession.create({
    floors: plan.floors.map((f) => clone(f.data)), manifest: clone(plan),
    profile: 'run-v1', requireCloud: true
  });
  if (!made.ok) throw new Error(JSON.stringify(made));
  const s = made.value;
  s.setActions({ interactPressed: true }); s.update(1 / 60); // 实际大厅 F 分派
  return s;
}
function atFinish(s) {
  const p = s.player, l = s.world.links[s.world.current];
  p.x = (l.openingLeft + l.openingRight - p.w) / 2;
  p.y = l.finishY - p.h;
  p.vx = p.vy = 0; p.onGround = true; p.coyote = 0.1;
  p.jumpsUsed = 0; p.prevJump = false; p.jumpBuffer = 0; p.ledgeUsed = false;
  return l;
}
function snapshot(s, l, frame) {
  const p = s.player, w = s.world;
  return { frame, current: w.current, feet: p.feet, commitY: l.commitY,
    x: p.x, width: p.w, rightOverhang: p.x + p.w - l.openingRight,
    onGround: p.onGround, live: [...w.instances.keys()],
    states: [...w.instances.values()].map((i) => ({ slot: i.index, state: i.state })) };
}
function cross(s, side = null) {
  const l = atFinish(s), samples = [];
  let firstUpwardCrossing = null;
  for (let frame = 0; frame < 90; frame++) {
    const prev = s.player.feet;
    s.setActions({
      jumpHeld: frame < 20 || (frame >= 24 && frame < 60),
      right: side === 'right' && frame >= 14 && frame < 30,
      left: side === 'left' && frame >= 14 && frame < 30
    });
    s.update(1 / 60);
    if (!firstUpwardCrossing && prev >= l.commitY && s.player.feet < l.commitY) {
      firstUpwardCrossing = snapshot(s, l, frame);
    }
    if ([40, 60, 89].includes(frame)) samples.push(snapshot(s, l, frame));
  }
  return { side, firstUpwardCrossing, samples };
}
const centered = [], centeredSession = fresh();
for (let from = 1; from < 20; from++) {
  if (centeredSession.world.current !== from) break;
  const r = cross(centeredSession);
  centered.push({ from, to: centeredSession.world.current, crossing: r.firstUpwardCrossing });
}
const edgeCases = [];
for (const from of [1, 8, 14]) {
  const s = fresh();
  while (s.world.current < from) {
    const before = s.world.current;
    cross(s);
    if (s.world.current === before) throw new Error('centered setup did not advance');
  }
  const r = cross(s, 'right');
  edgeCases.push({ from, expectedNext: from + 1, expectedPreview: from + 2,
    manifestHasExpectedPreview: !!plan.floors[from + 2],
    previewCreated: s.world.instances.has(from + 2), ...r });
}
const leftControl = cross(fresh(), 'left');
const report = {
  date: '2026-11-09', entry: 'index.html -> short.html -> full40-formal',
  environment: 'Node loader DOM/canvas stubs; no visible browser this review',
  limits: 'Each seam uses a finish-position fixture; not a continuous whole-map route, human clear, performance measurement or certification. No browser storage is touched.',
  manifest: { slots: plan.floors.length, normal: plan.normalCount, fallback: plan.fallbackCount },
  centered, edgeCases, leftControl,
  bugReproduced: edgeCases.some((r) => r.firstUpwardCrossing?.current === r.from && !r.previewCreated)
};
const output = process.argv[2] ? resolve(process.argv[2])
  : fileURLToPath(new URL('./review-B4R9-2026-11-09-seams.json', import.meta.url));
if (!process.argv[2] && existsSync(output)) {
  console.log('Original evidence preserved; pass a new output filename to save this run.');
} else {
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ slots: report.manifest.slots, centeredTransitions: centered.length,
  bugReproduced: report.bugReproduced,
  right: edgeCases.map((r) => ({ from: r.from, current: r.samples.at(-1).current,
    crossingOverhang: r.firstUpwardCrossing?.rightOverhang, live: r.samples.at(-1).live,
    previewCreated: r.previewCreated })),
  leftControlCurrent: leftControl.samples.at(-1).current,
  exitMeaning: '0 means the diagnostic completed, not acceptance passed' }, null, 2));
process.exit(0);
