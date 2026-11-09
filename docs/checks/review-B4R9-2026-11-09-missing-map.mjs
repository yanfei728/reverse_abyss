// 追加诊断：复现 HUD4、物理进入preview5、6未加载，并对比同一云板/管壁的真实move结果。
// 接缝前使用合法finish站位fixture；后续只用真实Session步进。接触探针另行调用真实FloorView.move，非完整地图路线。
import { loadEngine } from '../../tools/loader.mjs';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const R = loadEngine(), clone = (v) => JSON.parse(JSON.stringify(v));
const manifest = R.TowerPlanner.buildFull40({ fixedLevels: R.FULL40.fixed,
  fallback: R.FULL40.fallback, candidates: [], seed: 1 }).value;
function fresh() {
  const s = R.GameSession.create({ floors: manifest.floors.map((f) => clone(f.data)),
    manifest: clone(manifest), profile: 'run-v1', requireCloud: true }).value;
  s.setActions({ interactPressed: true }); s.update(1 / 60); return s;
}
function jump(s, right) {
  const p = s.player, w = s.world, l = w.links[w.current], from = w.current;
  p.x = (l.openingLeft + l.openingRight - p.w) / 2; p.y = l.finishY - p.h;
  p.vx = p.vy = 0; p.onGround = true; p.coyote = 0.1; p.jumpsUsed = 0;
  p.prevJump = false; p.jumpBuffer = 0; p.ledgeUsed = false;
  let crossing = null;
  for (let frame = 0; frame < 90; frame++) {
    const prevFeet = p.feet;
    s.setActions({ jumpHeld: frame < 20 || (frame >= 24 && frame < 60),
      right: right && frame >= 14 && frame < 30 });
    s.update(1 / 60);
    if (!crossing && prevFeet >= l.commitY && p.feet < l.commitY) crossing = {
      frame, current: w.current, feet: p.feet, commitY: l.commitY,
      rightOverhang: p.x + p.w - l.openingRight };
  }
  return { from, current: w.current, crossing };
}
function scenario(miss) {
  const s = fresh(), transitions = [];
  while (s.world.current < 4) {
    const before = s.world.current; transitions.push(jump(s, false));
    if (s.world.current === before) throw new Error('centered preparation failed');
  }
  transitions.push(jump(s, miss));
  const w = s.world, p = s.player, target = w.instances.get(5), pipe = w.links[5];
  const cloudTop = target.origin.y + target.finish.row * R.C.TS;
  const x = target.origin.x + (target.finish.col + 1) * R.C.TS - p.w / 2;
  // 身体原脚底在顶面上方0.25px，向下1.5px，普通单向云板应该接住。
  const cloud = (view) => view.move(x, cloudTop - p.h - 0.25, p.w, p.h, 0, 90, 1 / 60);
  // 管道内沿向左穿过管壁1px；正确解析应该停在openingLeft并清横向速度。
  const wall = (view) => view.move(pipe.openingLeft + 2, pipe.inner.y + 47,
    p.w, p.h, -180, 0, 1 / 60);
  const activeCloud = cloud(p.level), ownerCloud = cloud(target.view);
  const activeWall = wall(p.level), ownerWall = wall(target.view);
  return {
    missedEntry: miss, transitions, hudFloor: w.current, playerView: p.level.inst.index,
    playerFeetAfterInput: p.feet, live: w.liveStates(),
    map6: { inManifest: !!manifest.floors[6], loaded: w.instances.has(6) },
    pipe5to6: { planned: !!pipe.walls, lowerLoaded: w.instances.has(5),
      upperLoaded: w.instances.has(6), openingLeft: pipe.openingLeft,
      note: 'short.js render traverses all world.links without an endpoint-live filter' },
    floor5Finish: { tileId: target.data.terrain.tiles[target.finish.row][target.finish.col],
      top: cloudTop, activeViewResult: activeCloud, ownerViewResult: ownerCloud },
    floor5Pipe: { activeViewResult: activeWall, ownerViewResult: ownerWall },
    symptomsReproduced: miss && w.current === 4 && !w.instances.has(6) &&
      !activeCloud.grounded && ownerCloud.grounded && activeWall.vx !== 0 && ownerWall.vx === 0
  };
}
const report = { date: '2026-11-09', entry: 'index.html -> short.html full40-formal',
  userScreenshot: 'C:/Users/beilu/Pictures/Screenshots/屏幕截图 2026-11-09 013138.png',
  limits: 'Node canvas/DOM stubs; no browser capture. Finish-position fixtures are not whole-map human play. Contact probes sample floor5 finish/pipe using real FloorView.move without relocating the session player. Does not prove the exact state of the user browser.',
  centeredControl: scenario(false), missedEntry: scenario(true) };
const output = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(
  new URL('./review-B4R9-2026-11-09-missing-map.json', import.meta.url));
if (!process.argv[2] && existsSync(output)) console.log('Existing evidence preserved; pass a new output filename to save this run.');
else writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ control: { current: report.centeredControl.hudFloor,
  map6Loaded: report.centeredControl.map6.loaded },
  failure: { current: report.missedEntry.hudFloor, playerView: report.missedEntry.playerView,
    live: report.missedEntry.live.map((i) => i.index), map6Loaded: report.missedEntry.map6.loaded,
    cloudGrounded: report.missedEntry.floor5Finish.activeViewResult.grounded,
    pipeStopsMovement: report.missedEntry.floor5Pipe.activeViewResult.vx === 0,
    symptomsReproduced: report.missedEntry.symptomsReproduced },
  exitMeaning: '0 means diagnosis completed, not acceptance passed' }, null, 2));
process.exit(0);
