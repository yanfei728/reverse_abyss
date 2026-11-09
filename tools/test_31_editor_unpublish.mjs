// Isolated fixtures only; no author data, certification or catalog writes.
import { loadEditor } from './loader.mjs';
import { writeFileSync } from 'node:fs';
const RA = loadEditor(), LD = RA.LevelData;
const clone = x => JSON.parse(JSON.stringify(x));
const results = [];
function check(name, ok) { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); }
function model(type = 'gear', mode = 'pingpong', single = false) {
  const m = RA.EditorModel.create({ cols: 40, rows: 40 });
  const o = m.placeObject(type, 6, 7).value;
  o.pathId = 'route';
  m.data.paths.push({ id: 'route', mode, points: single ? [{ col: 6, row: 7 }] : [{ col: 6, row: 7 }, { col: 9, row: 7 }], future: { keep: [1, 2] } });
  m.data.paths.push({ id: 'old_orphan', mode: 'pingpong', points: [{ col: 1, row: 1 }], future: 'preserve' });
  return m;
}
for (const type of ['gear', 'fireball_moving']) for (const mode of ['single', 'pingpong', 'loop']) {
  const m = model(type, mode === 'single' ? 'pingpong' : mode, mode === 'single');
  const ed = Object.create(RA.Editor.prototype);
  Object.assign(ed, { model: m, undoStack: [], redoStack: [], undoBytes: 0, redoBytes: 0, syncUI() {}, say() {} });
  const before = clone(m.data);
  ed.pushUndo(); m.eraseCell(6, 7);
  check(`${type}/${mode} erase releases only associated path`, !m.data.objects.length && m.data.paths.length === 1 && m.data.paths[0].id === 'old_orphan');
  ed.undo();
  check(`${type}/${mode} single undo restores exact object/path`, JSON.stringify(ed.model.data.objects) === JSON.stringify(before.objects) && JSON.stringify(ed.model.data.paths) === JSON.stringify(before.paths));
  ed.redo();
  const encoded = LD.encode(ed.model.toData()), reopened = encoded.ok && RA.EditorModel.fromJSON(encoded.value);
  check(`${type}/${mode} redo/export/reopen has no new orphan`, reopened.ok && !reopened.value.data.objects.length && reopened.value.data.paths.length === 1);
}
{
  const m = model();
  m.data.objects.push({ id: 'future', type: 'unknown_future', col: 6, row: 7, pathId: 'route', params: { keep: true } });
  const before = JSON.stringify(m.data.paths);
  m.removeObject(m.data.objects[0].id);
  check('ID deletion retains same-cell unknown object and shared path', m.data.objects.length === 1 && JSON.stringify(m.data.paths) === before);
  m.removeObject('future');
  check('last unknown reference releases associated path only', m.data.paths.length === 1 && m.data.paths[0].id === 'old_orphan');
  const snapshot = JSON.stringify(m.toData());
  check('missing ID and empty erase are content no-ops', m.removeObject('missing') === 0 && !m.eraseCell(6, 7) && JSON.stringify(m.toData()) === snapshot);
}
for (const op of ['region', 'tile', 'spawn', 'resize']) {
  const m = model();
  if (op === 'region') m.fillRect(5, 6, 7, 8, '+');
  if (op === 'tile') m.applyChar(6, 7, '=');
  if (op === 'spawn') m.setSpawn(6, 7);
  if (op === 'resize') { m.data.objects[0].col = 35; m.resize(20, 40, { allowLoss: true }); }
  check(`${op} deletion releases associated path`, !m.data.objects.length && m.data.paths.length === 1 && m.data.paths[0].id === 'old_orphan');
}
const adapter = new RA.ContentRepository.MemoryAdapter();
const repo = RA.ContentRepository.create({ adapter });
await repo.ensurePoolEpoch();
function record(title) {
  const d = clone(RA.FULL40.fallback); d.id = 'fixture31'; d.title = title; d.difficulty = 1; d.certification = null;
  d.contentHash = LD.hashSync(d);
  // Synthetic test declaration, only inside this in-memory fixture.
  d.certification = { status: 'passed', profileId: 'run-v1', contentHash: d.contentHash };
  return { levelId: d.id, contentHash: d.contentHash, poolEpoch: RA.FULL40.poolEpoch, data: d };
}
const a = record('first'), b = record('second'), invalid = record('unqualified'); invalid.data.certification = null;
for (const r of [a, b, invalid]) await adapter.publish(r);
await adapter.put({ draftId: 'retained', data: a.data, history: ['retained'] }, 0);
const draftsBefore = JSON.stringify([...adapter.records]), metaBefore = JSON.stringify([...adapter.meta]);
check('list includes unqualified published versions', (await repo.listPublishedVersions()).value.length === 3);
const plan = candidates => RA.TowerPlanner.buildFull40({ seed: 9, candidates, fixedLevels: RA.FULL40.fixed, fallback: RA.FULL40.fallback, poolEpoch: RA.FULL40.poolEpoch });
const original = plan((await repo.listEligible()).value), originalJSON = JSON.stringify(original.value);
adapter.failNextPut('simulated cancel', 'CANCELLED');
check('memory failure retains exact version', !(await repo.unpublish(a)).ok && !!(await adapter.getPublished(a.levelId, a.contentHash)).value);
const removed = await repo.unpublish(a);
check('exact identity removes one hash only', removed.ok && removed.value.removed && !(await adapter.getPublished(a.levelId, a.contentHash)).value && !!(await adapter.getPublished(b.levelId, b.contentHash)).value);
check('repeat delete is idempotent', (await repo.unpublish(a)).value.removed === false);
check('invalid identities rejected', !(await repo.unpublish({ levelId: 'fixture31' })).ok && !(await repo.unpublish({ levelId: 'bad:id', contentHash: a.contentHash })).ok);
const next = plan((await repo.listEligible()).value);
check('fresh eligible/Planner exclude removed version', next.ok && !next.value.floors.some(f => f.levelId === a.levelId && f.contentHash === a.contentHash));
check('existing manifest retained', JSON.stringify(original.value) === originalJSON);
check('draft/history/metadata unchanged', JSON.stringify([...adapter.records]) === draftsBefore && JSON.stringify([...adapter.meta]) === metaBefore);
const throwing = RA.ContentRepository.create({ adapter: { unpublish() { throw Error('offline'); } } });
check('adapter exceptions become failure Result', !(await throwing.unpublish(b)).ok);
const fail = results.filter(x => !x.ok).length;
writeFileSync(new URL('../docs/checks/31-targeted.json', import.meta.url), JSON.stringify({ date: '2026-11-09', pass: results.length - fail, fail, results }, null, 2) + '\n', 'utf8');
console.log(`${results.length - fail} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
