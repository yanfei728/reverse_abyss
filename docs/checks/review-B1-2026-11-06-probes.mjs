// 独立验收探针：只在 Node 的 DOM/内存仓库内运行，不写用户草稿或原图。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT, loadEditor, makeCanvas } from '../../tools/loader.mjs';
const RA = loadEditor();
const clone = v => JSON.parse(JSON.stringify(v));
const sample = JSON.parse(readFileSync(join(ROOT, 'levels/dev/floor-a.json'), 'utf8'));
const report = {};
function delayedRepo() {
  const adapter = new RA.ContentRepository.MemoryAdapter();
  const repo = RA.ContentRepository.create({ adapter });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const save = repo.saveDraft.bind(repo);
  repo.saveDraft = async (...args) => { await gate; return save(...args); };
  return { repo, release };
}
function editor(repo, data = sample) {
  const ed = new RA.Editor(makeCanvas(900, 600), { repo });
  ed.openJSONText(JSON.stringify(data), 'review.json');
  return ed;
}

// B1-R1a：试玩的自动保存期间编辑，不能未经再次保存就离开页面。
{
  const { repo, release } = delayedRepo();
  const ed = editor(repo);
  globalThis.location.href = 'editor.html';
  const pending = ed.openPlaytest();
  ed.model.setTitle('试玩保存期间的新改动');
  ed.dirty = true;
  release();
  const result = await pending;
  const stored = (await repo.loadDraft(sample.id)).value;
  const handoff = JSON.parse(sessionStorage.getItem('RA_DEVPLAY_V1'));
  report.playtestEditDuringSave = {
    result, navigated: location.href !== 'editor.html', dirty: ed.dirty,
    storedTitle: stored.data.title, currentTitle: ed.model.title,
    handoffTitle: handoff && handoff.template.title,
    unsavedChangesSentAway: result && location.href !== 'editor.html' &&
      !!handoff && stored.data.title !== handoff.template.title
  };
}

// B1-R1b：保存 A 期间切换到 B，旧回调不得把 B 绑定到 A 的 draftId/revision。
{
  const { repo, release } = delayedRepo();
  const ed = editor(repo);
  const pending = ed.saveDraft();
  const other = clone(sample);
  other.id = 'review-other-draft';
  other.title = '另一张独立地图';
  other.contentHash = null;
  ed.openJSONText(JSON.stringify(other), 'other.json');
  release();
  await pending;
  const wrongBinding = ed.draftId;
  await ed.saveDraft();
  const original = (await repo.loadDraft(sample.id)).value;
  const otherRecord = (await repo.loadDraft(other.id)).value;
  report.switchModelDuringSave = {
    currentModelId: ed.model.id, draftIdAfterOldSave: wrongBinding,
    originalDraftId: sample.id, originalStoredModelIdAfterSecondSave: original.data.id,
    otherDraftExists: !!otherRecord,
    originalOverwritten: original.data.id !== sample.id
  };
}

// B1-R1c：异步读草稿期间新画的一笔，不得在回包时无提示覆盖。
{
  const repo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter() });
  await repo.saveDraft(sample.id, sample, 0);
  const ed = editor(repo);
  ed.dirty = false;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const load = repo.loadDraft.bind(repo);
  repo.loadDraft = async (...args) => { await gate; return load(...args); };
  const pending = ed.openDraftById(sample.id);
  ed.model.setTitle('读取期间的新改动');
  ed.dirty = true;
  release();
  const result = await pending;
  report.editDuringOpen = {
    result, finalTitle: ed.model.title, dirty: ed.dirty,
    newEditLost: ed.model.title !== '读取期间的新改动'
  };
}

// 非阻塞 N02：暂停菜单点重开后，遮罩应消失。
{
  sessionStorage.removeItem('RA_DEVPLAY_V1');
  globalThis.__RA_EL_BY_ID__['dev-canvas'] = makeCanvas(960, 540);
  const Assets = RA.Assets;
  RA.Assets = class { loadAll() {} };
  vm.runInThisContext(readFileSync(join(ROOT, 'js/devplay.js'), 'utf8'), { filename: 'js/devplay.js' });
  globalThis.dispatch('keydown', { code: 'KeyP', repeat: false });
  const before = {
    paused: RA.devplay.session.paused,
    overlay: document.getElementById('pause-overlay').style.display
  };
  document.getElementById('btn-restart-pause').dispatch('click');
  report.restartFromPause = {
    before,
    after: { paused: RA.devplay.session.paused,
      overlay: document.getElementById('pause-overlay').style.display },
    staleOverlay: !RA.devplay.session.paused &&
      document.getElementById('pause-overlay').style.display === 'flex'
  };
  RA.Assets = Assets;
}

writeFileSync(join(ROOT, 'docs/checks/review-B1-2026-11-06-probes.json'),
  JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
// 这是复现证据：存在阻塞问题时保留非零退出码。
process.exitCode = report.playtestEditDuringSave.unsavedChangesSentAway ||
  report.switchModelDuringSave.originalOverwritten || report.editDuringOpen.newEditLost ? 1 : 0;
