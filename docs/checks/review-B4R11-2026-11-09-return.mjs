// 真实Editor/openPlaytest和trial.js返回接线诊断；Node DOM替身/隔离MemoryAdapter，不碰作者浏览器库。
import { loadEditor, makeCanvas } from '../../tools/loader.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import vm from 'node:vm';
const R = loadEditor(), clone = (x) => JSON.parse(JSON.stringify(x));
globalThis.requestAnimationFrame = () => 0;
R.Assets = class { loadAll(cb) { cb?.(); } image() { return null; } frames() { return {}; } };
const repo = R.ContentRepository.create({ adapter: new R.ContentRepository.MemoryAdapter(), persistent: false });
const editor = new R.Editor(makeCanvas(), { repo });
editor.model = R.EditorModel.fromTrusted(clone(R.FULL40.fallback));
editor.model.data.id = 'review_return_27'; editor.model.data.title = 'draft-return-fixture';
editor.model.data.difficulty = 1; editor.model.data.certification = null;
editor.model.invalidate(); editor.dirty = true;
const started = await editor.openPlaytest();
if (!started) throw new Error(editor.msg);
const ref = { draftId: editor.draftId, revision: editor.draftRevision };
const before = await repo.loadDraft(ref.draftId);
const html = readFileSync(new URL('../../trial.html', import.meta.url), 'utf8');
const controls = html.match(/<div id="controls">([\s\S]*?)<\/div>/)?.[1] || '';
const links = [...controls.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
const top = links.find((m) => m[2].includes('编辑器'));
if (!top) throw new Error('No editor return link in controls');
const attrs = top[1], topHref = attrs.match(/\bhref="([^"]+)"/)?.[1];
const topId = attrs.match(/\bid="([^"]+)"/)?.[1];
const get = document.getElementById.bind(document), canvas = makeCanvas();
document.getElementById = (id) => id === 'dev-canvas' ? canvas : get(id);
if (topId) document.getElementById(topId).href = topHref;
vm.runInThisContext(readFileSync(new URL('../../js/platform/action-input.js', import.meta.url), 'utf8'));
vm.runInThisContext(readFileSync(new URL('../../js/trial.js', import.meta.url), 'utf8'));
if (!R.trial) throw new Error('trial.js did not start');
const running = R.trial.session.status;
const effectiveTopHref = topId ? document.getElementById(topId).href : topHref;
const resultHref = R.trial.backHref();
function locationFor(href) {
  const query = href.indexOf('?');
  globalThis.location = { protocol: 'file:', href, search: query < 0 ? '' : href.slice(query) };
}
async function open(href) {
  locationFor(href);
  const ed = new R.Editor(makeCanvas(), { repo });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return { draftId: ed.draftId, revision: ed.draftRevision, levelId: ed.model.data.id,
    hash: R.LevelData.hashSync(ed.model.toData()) };
}
const topReturn = await open(effectiveTopHref), boundReturn = await open(resultHref);
const after = await repo.loadDraft(ref.draftId);
const report = {
  date: '2026-11-09', limits: 'Node DOM/canvas stubs + isolated MemoryAdapter. No actual browser navigation/storage access, no certification generated.',
  started, trialStatusAtReturn: running, ref, topHref: effectiveTopHref, resultHref,
  topReturn, boundReturn,
  storedDraftStillExists: after.ok && !!after.value,
  storedContentUnchanged: after.ok && before.value.contentHash === after.value.contentHash,
  storedRevisionUnchanged: after.ok && before.value.revision === after.value.revision,
  certification: after.value?.data.certification,
  topReturnBugReproduced: topReturn.draftId !== ref.draftId,
  boundReturnRestoredOriginal: boundReturn.draftId === ref.draftId
};
const output = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(
  new URL('./review-B4R11-2026-11-09-return.json', import.meta.url));
if (!process.argv[2] && existsSync(output)) console.log('Original evidence preserved; pass a new output path to save this run.');
else writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
process.exit(0); // 诊断完成，true表示已复现故障，不是通过。
