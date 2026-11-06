#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_b1r.mjs —— B1-R1:异步保存/读取/试玩的上下文回归
 * =====================================================
 *     node tools/test_b1r.mjs
 *
 * 用可控完成顺序的仓库复现并锁住:
 *   1) 试玩自动保存期间编辑 → 不离开编辑器、handoff 不带走未保存改动;
 *   2) 保存 A 期间切到 B → 旧回包不把 B 绑到 A,随后 B 有独立草稿、A 仍完整;
 *   3) 读取草稿期间编辑 → 迟到回包不覆盖新工作;
 *   4) 两个读取请求反向完成 → 旧请求不覆盖后选的草稿;
 *   5) 正常试玩 handoff 与已保存草稿内容一致;
 *   6) N02:暂停菜单重开后遮罩消失、输入/帧时间清理。
 * 不访问真实 IndexedDB、用户草稿、原图或素材。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT, loadEditor, makeCanvas } from './loader.mjs';

const RA = loadEditor();
const LD = RA.LevelData;
const clone = (v) => JSON.parse(JSON.stringify(v));
const sample = JSON.parse(readFileSync(join(ROOT, 'levels/dev/floor-a.json'), 'utf8'));
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }
const board = () => makeCanvas(900, 600);

function editor(repo, data) {
  const ed = new RA.Editor(board(), { repo });
  ed.openJSONText(JSON.stringify(data || sample), 'review.json');
  return ed;
}

/** 内存仓库 + 手动放行的保存(可控制回包顺序) */
function delayedSaveRepo() {
  const base = new RA.ContentRepository.MemoryAdapter();
  const repo = RA.ContentRepository.create({ adapter: base });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const save = repo.saveDraft.bind(repo);
  repo.saveDraft = async (...args) => { await gate; return save(...args); };
  return { repo, release };
}

head('R1a:试玩自动保存期间编辑,不离开、不把新改动当已保存');
{
  const { repo, release } = delayedSaveRepo();
  const ed = editor(repo);
  globalThis.sessionStorage.removeItem('RA_DEVPLAY_V1');
  const oldHref = globalThis.location.href;
  globalThis.location.href = 'editor.html';
  const pending = ed.openPlaytest();
  ed.model.setTitle('试玩保存期间的新改动');
  ed.markDirty();
  release();
  const result = await pending;
  const stored = (await repo.loadDraft(sample.id)).value;
  const handoff = globalThis.sessionStorage.getItem('RA_DEVPLAY_V1');
  check('保存期间编辑时试玩被取消', result === false);
  check('没有离开编辑器', globalThis.location.href === 'editor.html', globalThis.location.href);
  check('新改动仍在、dirty 未清', ed.model.title === '试玩保存期间的新改动' && ed.dirty === true);
  check('草稿里是发起时快照(旧标题)', stored.data.title === sample.title, stored.data.title);
  check('没有写 handoff 把未保存内容带走', handoff === null);
  globalThis.location.href = oldHref;
  globalThis.sessionStorage.removeItem('RA_DEVPLAY_V1');
}

head('R1b:保存 A 期间切到 B,旧回包不绑定 B');
{
  const { repo, release } = delayedSaveRepo();
  const ed = editor(repo);
  const other = clone(sample);
  other.id = 'review-other-draft';
  other.title = '另一张独立地图';
  other.contentHash = null;
  const pending = ed.saveDraft();
  ed.openJSONText(JSON.stringify(other), 'other.json');
  release();
  const result = await pending;
  check('旧保存回包返回 false(未应用到新工作区)', result === false);
  check('当前 B 没有被绑到 A 的 draftId', ed.draftId === '' && ed.model.data.id === other.id,
    'draftId=' + ed.draftId);
  const original = (await repo.loadDraft(sample.id)).value;
  check('A 的草稿仍是 A 的内容', original && original.data.id === sample.id &&
    original.data.title === sample.title);
  check('A 的草稿没有被 B 覆盖', original.data.id !== other.id);

  check('随后保存 B 成功', await ed.saveDraft() === true && ed.draftId === other.id);
  const original2 = (await repo.loadDraft(sample.id)).value;
  const otherRecord = (await repo.loadDraft(other.id)).value;
  check('B 有自己独立草稿', !!otherRecord && otherRecord.data.id === other.id);
  check('A 原内容仍在', original2 && original2.data.id === sample.id &&
    original2.data.title === sample.title);
}

head('R1c:读取草稿期间编辑,迟到回包不覆盖');
{
  const repo = RA.ContentRepository.create({
    adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory'
  });
  await repo.saveDraft(sample.id, sample, 0);
  const ed = editor(repo);
  ed.dirty = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const load = repo.loadDraft.bind(repo);
  repo.loadDraft = async (...args) => { await gate; return load(...args); };
  const pending = ed.openDraftById(sample.id);
  ed.model.setTitle('读取期间的新改动');
  ed.markDirty();
  release();
  const result = await pending;
  check('读取期间有新编辑时打开失败', result === false);
  check('新标题与 dirty 保留', ed.model.title === '读取期间的新改动' && ed.dirty === true);
  check('没有被旧草稿替换', ed.model.data.id === sample.id &&
    ed.model.title === '读取期间的新改动');
}

head('R1d:两个读取请求反向完成,旧请求不覆盖后选草稿');
{
  const repo = RA.ContentRepository.create({
    adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory'
  });
  const other = clone(sample);
  other.id = 'review-open-b';
  other.title = '第二份草稿';
  other.contentHash = null;
  await repo.saveDraft(sample.id, sample, 0);
  await repo.saveDraft(other.id, other, 0);
  const ed = editor(repo);
  ed.dirty = false;
  const waiters = {};
  const load = repo.loadDraft.bind(repo);
  repo.loadDraft = async (id) => {
    await new Promise((resolve) => { waiters[id] = resolve; });
    return load(id);
  };
  const pA = ed.openDraftById(sample.id);
  const pB = ed.openDraftById(other.id);
  waiters[other.id]();                 // 后选的 B 先回包
  await pB;
  waiters[sample.id]();                // 先发的 A 后回包
  const aResult = await pA;
  check('后选草稿后回包仍生效', ed.model.data.id === other.id && ed.draftId === other.id);
  check('旧读取返回 false 且不覆盖', aResult === false && ed.model.data.id === other.id &&
    ed.model.title === other.title);
}

head('正常试玩 handoff 与刚保存的草稿内容一致');
{
  const repo = RA.ContentRepository.create({
    adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory'
  });
  const ed = editor(repo);
  globalThis.sessionStorage.removeItem('RA_DEVPLAY_V1');
  const oldHref = globalThis.location.href;
  globalThis.location.href = 'editor.html';
  const ok = await ed.openPlaytest();
  const handoff = JSON.parse(globalThis.sessionStorage.getItem('RA_DEVPLAY_V1') || 'null');
  const stored = (await repo.loadDraft(sample.id)).value;
  check('正常试玩成功导航', ok === true && globalThis.location.href.indexOf('devplay.html') >= 0);
  check('handoff 是规范快照,与草稿逐项一致',
    !!handoff && LD.canonical(handoff.template) === LD.canonical(stored.data));
  check('handoff 通过 play 校验',
    LD.errorsOf(LD.validate(handoff.template, { purpose: 'play' })).length === 0);
  globalThis.location.href = oldHref;
  globalThis.sessionStorage.removeItem('RA_DEVPLAY_V1');
}

head('N02:暂停菜单重开清掉遮罩与输入');
{
  globalThis.sessionStorage.removeItem('RA_DEVPLAY_V1');
  globalThis.__RA_EL_BY_ID__['dev-canvas'] = makeCanvas(960, 540);
  const RealAssets = RA.Assets;
  RA.Assets = class {
    loadAll(cb) { if (cb) cb(); }
    frames() { return {}; }
  };
  try {
    vm.runInThisContext(readFileSync(join(ROOT, 'js/devplay.js'), 'utf8'),
      { filename: 'js/devplay.js' });
    globalThis.dispatch('keydown', { code: 'KeyP', repeat: false });
    const beforeSession = RA.devplay.session;
    check('P 暂停显示遮罩',
      RA.devplay.session.paused === true &&
      globalThis.document.getElementById('pause-overlay').style.display === 'flex');
    globalThis.document.getElementById('btn-restart-pause').dispatch('click');
    check('重开后是新 session 且不再暂停',
      RA.devplay.session !== beforeSession && RA.devplay.session.paused === false);
    check('重开后遮罩隐藏', globalThis.document.getElementById('pause-overlay').style.display === 'none');
    check('重开后玩家仍能加载角色贴图', !!RA.devplay.session.player.frames);
  } finally {
    RA.Assets = RealAssets;
  }
}

export const result = { pass, fail, fails, name: 'B1-R1 异步回归' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`B1-R1 异步回归:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✓');
  process.exit(0);
}
