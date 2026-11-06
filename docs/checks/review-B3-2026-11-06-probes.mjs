// 独立 B3 验收：仅内存仓库/DOM 事件替身，不写用户内容或认证。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { loadEditor, loadPlatform, ROOT } from '../../tools/loader.mjs';
const RA = loadEditor(); loadPlatform();
const LD = RA.LevelData;
const clone = v => JSON.parse(JSON.stringify(v));
const sample = JSON.parse(readFileSync(join(ROOT, 'levels/b2/normal-1.json'), 'utf8'));
const repo = () => RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
const report = {};

// 执行 short.js 中原始按钮绑定函数，替换 DOM 外壳，不复制输入算法。
{
  const src = readFileSync(join(ROOT, 'js/short.js'), 'utf8');
  const a = src.indexOf('  function setupTouchButtons() {');
  const b = src.indexOf('  function setupInput() {', a);
  if (a < 0 || b < 0) throw new Error('找不到原始绑定函数');
  const buttons = [];
  const makeButton = () => {
    const handlers = {};
    return { dataset: {}, classList: { add() {}, remove() {} },
      setAttribute() {}, setPointerCapture() {},
      addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
      emit(type, pointerId) { for (const fn of handlers[type] || []) fn({ pointerId, preventDefault() {} }); }
    };
  };
  const host = { appendChild(el) { buttons.push(el); } };
  const state = { input: new RA.ActionInput(), layoutEdit: false };
  vm.runInNewContext(src.slice(a, b) + '\nsetupTouchButtons();', {
    RA, state, $: id => id === 'touch-controls' ? host : null,
    document: { createElement: makeButton }, selectLayoutAction() {}
  });
  const left = buttons.find(b => b.dataset.action === 'left');
  left.emit('pointerdown', 11); left.emit('pointerdown', 12);
  const both = state.input.snapshot();
  left.emit('pointerup', 11);
  const firstUp = state.input.snapshot();
  left.emit('pointerup', 12);
  const allUp = state.input.snapshot();
  report.sameButtonPointers = { both, firstUp, allUp,
    stuckAfterAllReleased: allUp.sources !== 0 || allUp.held.left };
}

// 同内容旧规则认证 → 重新导入当前规则声明；夹具仅存在隔离内存中。
{
  const r = repo(), data = clone(sample);
  data.certification = null; data.contentHash = null;
  const hash = LD.hashSync(data);
  const cert = { contentHash: hash, rulesVersion: 'old-review-fixture',
    rulesFingerprint: 'old-review-fixture', profileId: 'standard-v1', status: 'passed',
    completedAt: '2026-11-06T00:00:00Z', source: 'local-playtest' };
  const old = clone(data); old.certification = cert;
  const first = await r.importLevel(JSON.stringify(old));
  const fresh = clone(data); fresh.certification = { ...cert,
    rulesVersion: RA.RULES.rulesVersion, rulesFingerprint: RA.RULES.rulesFingerprint };
  const second = await r.importLevel(JSON.stringify(fresh));
  const loaded = second.ok ? await r.loadDraft(second.value.draftId) : null;
  const published = second.ok ? await r.publishImported({
    draftId: second.value.draftId, expectedRevision: second.value.revision
  }) : null;
  report.refreshCertification = { first, second,
    storedRulesVersion: loaded?.value?.data?.certification?.rulesVersion,
    published, poolSize: (await r.listEligible({ difficulty: 1 })).value.length };
}

// 可保存但不可运行的草稿应保留导入信息，而非在持久化前做 play 门槛。
{
  const r = repo(), data = clone(sample);
  data.certification = null; data.contentHash = null;
  data.objects.push({ id: 'review_unknown', type: 'future_review_object', col: 2, row: 5,
    params: { custom: 123 }, extensions: { preserveMe: 'review-only' } });
  const draftErrors = LD.errorsOf(LD.validate(data, { purpose: 'draft' }));
  const result = await r.importLevel(JSON.stringify(data));
  report.unknownDraft = { draftErrors, result, storedCount: (await r.listDrafts()).value.length };
}
writeFileSync(join(ROOT, 'docs/checks/review-B3-2026-11-06-probes.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.sameButtonPointers.stuckAfterAllReleased ||
  !report.refreshCertification.published?.ok || !report.unknownDraft.result.ok ? 1 : 0;
