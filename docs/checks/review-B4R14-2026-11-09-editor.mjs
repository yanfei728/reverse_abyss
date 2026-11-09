// Read-only isolated model/draw-command probes; no browser DB or author JSON writes.
import { loadEditor } from '../../tools/loader.mjs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const RA = loadEditor();
const clone = x => JSON.parse(JSON.stringify(x));
function modelWith(type) {
  const made = RA.EditorModel.create({ cols: 40, rows: 40 });
  const m = made.model || made.value || made;
  const res = m.placeObject(type, 6, 7);
  if (!res.ok) throw Error(res.error.message);
  return { m, o: res.value };
}
function pathProbe(type, operation) {
  const { m, o } = modelWith(type);
  o.pathId = 'route_probe';
  m.data.paths.push({ id: o.pathId, mode: 'pingpong', points: [{ col: 6, row: 7 }, { col: 9, row: 7 }] });
  m.invalidate();
  const before = clone(m.toData());
  if (operation === 'removeObject') m.removeObject(o.id);
  else m.eraseCell(o.col, o.row);
  const after = m.toData();
  return { type, operation, beforeObjects: before.objects.length, beforePaths: before.paths.length,
    afterObjects: after.objects.length, afterPaths: after.paths.length,
    orphanPathPresent: after.paths.some(p => p.id === 'route_probe') && !after.objects.some(o => o.pathId === 'route_probe') };
}
function flailProbe(view, col = 6, row = 7) {
  const { m, o } = modelWith('flail');
  o.col = col; o.row = row;
  const e = Object.create(RA.Editor.prototype);
  Object.assign(e, { model: m, view, W: 1800, H: 1600, grid: false, showEntities: true, mouse: { outside: true },
    selection: null, portMark: null, gearGesture: null, assets: { image: () => null } });
  const lines = [], arcs = [];
  let from;
  const ctx = new Proxy({
    moveTo(x, y) { from = { x, y }; },
    lineTo(x, y) { if (this.strokeStyle === '#94a3b8') lines.push({ from, to: { x, y } }); },
    arc(x, y, r) { arcs.push({ x, y, r, fill: this.fillStyle }); },
    measureText() { return { width: 10 }; }
  }, { get(t, p) { return p in t ? t[p] : (() => {}); } });
  e.drawBoard(ctx);
  const head = RA.flailHead(o);
  const expected = { from: e.cellToScreen(head.anchor.x / RA.C.TS, head.anchor.y / RA.C.TS),
    to: e.cellToScreen(head.x / RA.C.TS, head.y / RA.C.TS) };
  const actual = lines[0] || null;
  const distance = actual ? Math.hypot(actual.to.x - expected.to.x, actual.to.y - expected.to.y) : null;
  return { col, row, view, expected, actual, headPositionErrorPx: distance,
    expectedHeadVisible: expected.to.x >= 0 && expected.to.x <= e.W && expected.to.y >= 0 && expected.to.y <= e.H,
    headWasDrawn: arcs.some(a => a.fill === '#f97316'),
    bugReproduced: !actual || distance > 0.001 };
}
const output = {
  date: '2026-11-09', kind: 'isolated-model-and-real-draw-command-probe',
  limits: 'Not browser screenshots or human play. No author storage, maps, publishing or implementation changes.',
  paths: ['gear', 'fireball_moving'].flatMap(t => ['removeObject', 'eraseCell'].map(op => pathProbe(t, op))),
  flail: [flailProbe({ x: 0, y: 0, zoom: 1 }), flailProbe({ x: 81, y: 135, zoom: 0.5 }),
    flailProbe({ x: 0, y: 4 * RA.C.TS, zoom: 1 }, 6, 2)],
  unpublishApi: typeof RA.ContentRepository.prototype.unpublish === 'function',
  conclusions: { orphanPath: false, flailDraw: false }
};
output.conclusions.orphanPath = output.paths.some(p => p.orphanPathPresent);
output.conclusions.flailDraw = output.flail.some(p => p.bugReproduced);
const dest = process.argv[2];
if (dest) writeFileSync(resolve(dest), JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(output, null, 2));
process.exit(0); // Node DOM/asset stubs may leave background timers after text drawing.
