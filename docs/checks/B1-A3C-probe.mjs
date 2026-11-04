// A3-C 复现:临界 extensions + 接口缩图,必须在候选副本上失败并保持原图。
import { join } from 'node:path';
import { loadEditor, ROOT } from '../../tools/loader.mjs';
const RA = loadEditor();
const LD = RA.LevelData;
const m = RA.EditorModel.create({ cols: 20, rows: 12 });
m.data.ports = { profile: 'vertical-v1', entry: { col: 10 }, exit: { col: 10 } };
m.data.extensions.note = 'x'.repeat(LD.LIMITS.EXT - 64);
m.data.extensions['作者备注'] = '保留的中文信息';
const input = m.toJSON();
const before = LD.canonical(m.toData());
const res = m.resize(8, 12, { allowLoss: true });
const after = LD.canonical(m.toData());
const out = {
  date: '2026-11-04',
  inputExportOk: input.ok,
  resizeOk: res.ok,
  errorCode: res.ok ? null : res.error.code,
  errorPath: res.ok ? null : (res.error.issues && res.error.issues[0] && res.error.issues[0].path),
  exportAfter: m.toJSON().ok,
  modelUnchanged: before === after,
  cols: m.cols,
  entryCol: m.data.ports && m.data.ports.entry.col,
  extensionBytes: LD.LIMITS.EXT - 64,
  extensionPreserved: m.data.extensions['作者备注'] === '保留的中文信息'
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.resizeOk === false && out.errorCode === 'LIMIT_EXCEEDED' &&
  out.modelUnchanged && out.exportAfter && out.entryCol === 10 ? 0 : 1);
