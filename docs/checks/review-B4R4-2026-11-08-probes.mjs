// Independent audit of delivered editor/devplay code with DOM/canvas substitutes.
// Initial placements isolate connector boundaries; this is not a human full clear.
// No certification or real browser data is written.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { loadEditor, ROOT, makeCanvas } from '../../tools/loader.mjs';
const RA = loadEditor(), records = [];
const e = Object.create(RA.Editor.prototype);
Object.assign(e, { model: RA.EditorModel.fromData(RA.B4_SAMPLES.normal1).value,
  workspaceToken: 'review-only', draftId: 'review-only', draftRevision: 1,
  dirty: false, portMark: null, gearGesture: null, stroke: null });
e.say = () => {}; e.saveDraft = async () => true;
assert.equal(await e.openPlaytest(), true);
const h = JSON.parse(sessionStorage.getItem('RA_DEVPLAY_V2'));
assert.equal(h.template.id, RA.B4_SAMPLES.normal1.id);
const queue = [];
globalThis.requestAnimationFrame = fn => { queue.push(fn); return queue.length; };
const getId = document.getElementById.bind(document), cv = makeCanvas(960, 540);
document.getElementById = id => id === 'dev-canvas' ? cv : getId(id);
RA.Assets = class { loadAll(cb) { cb(); } frames() { return {}; } image() { return null; } };
vm.runInThisContext(readFileSync(join(ROOT, 'js/devplay.js'), 'utf8'), { filename: 'js/devplay.js' });
assert.ok(RA.devplay?.ready);
const s = RA.devplay.session, w = s.world, p = s.player;
records.push({ name: 'Real editor handoff and page start', handoffVersion: h.version,
  requestedTemplate: h.template.id, actualInitialFloor: w.currentFloor.data.id,
  floors: RA.devplay.floors.map(f => f.id), linkCount: w.links.length,
  actualSpawn: { x: p.x, feet: p.feet },
  expectedAuthoredStart: RA.CloudPipe.startPose(h.template, p),
  note: 'Actual spawn is on a generated entry floor, not the authored start.' });
let t = 1000, held = false;
function frame(jump) {
  if (jump !== held) { globalThis.dispatch(jump ? 'keydown' : 'keyup', { code: 'Space', repeat: false }); held = jump; }
  const cb = queue.shift(); assert.ok(cb, 'real page RAF callback exists'); cb(t); t += 1000 / 60;
}
function placeAtFinish(link) {
  p.x = (link.openingLeft + link.openingRight - p.w) / 2;
  p.y = link.finishY - p.h; p.vx = p.vy = 0; p.onGround = true;
  p.coyote = 0.1; p.jumpsUsed = 0; p.prevJump = false;
}
function snapshot() { return { floorIndex: s.floorIndex, id: w.currentFloor.data.id,
  status: s.status, trialCompleted: s.trialCompleted, time: s.time, feet: p.feet }; }
for (let index = 0; index < 2; index++) {
  const link = w.links[index]; assert.ok(link);
  placeAtFinish(link);
  let crossedOwnFinish = null, frames = 0;
  for (let n = 0; n < 180 && w.current === index; n++) {
    const prevFeet = p.feet;
    frame(n < 20 || (n >= 24 && n < 60)); frames++;
    if (!crossedOwnFinish && prevFeet >= link.finishY && p.feet < link.finishY) crossedOwnFinish = snapshot();
  }
  if (held) { globalThis.dispatch('keyup', { code: 'Space' }); held = false; }
  assert.equal(w.current, index + 1, 'crossing really enters the generated next floor');
  records.push({ name: index === 0 ? 'Entry fixture to authored map' : 'Authored finish to exit fixture',
    frames, finishY: link.finishY, oldPipeCompletionY: link.commitY,
    crossedOwnFinish, afterOldPipeBoundary: snapshot() });
}
const before = snapshot();
for (let n = 0; n < 60; n++) frame(false);
records.push({ name: 'After old advertised completion boundary, simulation still runs',
  before, afterOneSecond: snapshot(), statusText: getId('dev-status').textContent,
  hud: getId('hud').textContent, doneOverlayDisplay: getId('done-overlay').style.display || null });
assert.equal(s.status, 'running'); assert.equal(s.trialCompleted, null);
assert.ok(s.time > before.time + 0.9);
const source = readFileSync(join(ROOT, 'js/session.js'), 'utf8');
records.push({ name: 'Delivered GameSession has only storage fields, no trial completion consumer',
  trialPlanOccurrences: (source.match(/trialPlan/g) || []).length,
  trialCompletedOccurrences: (source.match(/trialCompleted/g) || []).length });
const standard = readFileSync(join(ROOT, 'js/standard.js'), 'utf8');
records.push({ name: 'Standard remains a separate old V1/three-floor implementation',
  v1Key: standard.includes('RA_STANDARD_V1'), usesTrialPlan: standard.includes('RA.TrialPlan'),
  generatesEntryAndExit: standard.includes('var floors = [entry, t, exit]'),
  floor2Win: standard.includes("s.win('standardExit')"),
  note: 'Source inspection only; standard success and certification were not simulated.' });
const result = { date: '2026-11-08', head: 'ed05f2a', implementation: '34569a2',
  scope: 'Real controller/page RAF/input/simulation; DOM/canvas substituted, no screen or full-level clear.',
  records };
writeFileSync(join(ROOT, 'docs/checks/review-B4R4-2026-11-08-probes.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(0); // Exit 0 means the reported fault was reproduced, not acceptance passed.
