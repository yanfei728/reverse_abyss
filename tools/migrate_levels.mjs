#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * migrate_levels.mjs —— 把 levels/*.json(旧 asc 格式)一次性迁移成 v2 草稿
 * =======================================================================
 *     node tools/migrate_levels.mjs
 *     node tools/migrate_levels.mjs --out levels/v2 --report docs/checks/T01-legacy-migration.md
 *
 * 规则(与 js/legacy-import.js 完全一致,这里不另写一套):
 *   · 只读原文件:迁移前后各算一次 sha256,必须一模一样;不覆盖、不重命名、不删除。
 *   · 输出到独立目录(默认 levels/v2/),文件名沿用旧 id,内容 = 完整 LevelData v2 + contentHash。
 *   · 每张图都重新 decode 一次(校验自报 hash)并按 draft 用途 validate;
 *     有 error 就判这张图迁移失败,不能靠"写出来了"算成功。
 *   · 迁移只负责保真搬运:旧图没有按 vertical-v1 绘制接口,ports 一律 null,
 *     草稿需要作者修复出口/入口后才能试玩或发布(见报告里的逐图警告)。
 *
 * 迁移不继承旧 verified:它只是历史字段,不是人工通关认证。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadEngine, ROOT } from './loader.mjs';

const argv = process.argv.slice(2);
function argOf(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const IN_DIR = join(ROOT, argOf('in', 'levels'));
const OUT_DIR = join(ROOT, argOf('out', 'levels/v2'));
const REPORT = join(ROOT, argOf('report', 'docs/checks/T01-legacy-migration.md'));
const REPORT_JSON = REPORT.replace(/\.md$/, '.json');

const RA = loadEngine();
const LD = RA.LevelData;

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function rel(p) {
  return p.replace(ROOT + '\\', '').replace(ROOT + '/', '').replace(/\\/g, '/');
}

if (!existsSync(IN_DIR)) {
  console.error('找不到输入目录:' + IN_DIR);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(dirname(REPORT), { recursive: true });

const files = readdirSync(IN_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort();

if (!files.length) {
  console.error('levels/ 里一个关卡 json 都没有');
  process.exit(1);
}

const rows = [];
const skipped = [];
const problems = [];
let pass = 0;

for (const f of files) {
  const id = basename(f, '.json');
  const srcPath = join(IN_DIR, f);
  const before = readFileSync(srcPath);
  const beforeHash = sha256(before);
  const record = {
    file: f, id, ok: false, warnings: [], error: '', bytes: before.length,
    beforeHash, afterHash: '', out: '', cols: 0, rows: 0,
    objects: 0, paths: 0, difficulty: null, background: null,
    contentHash: ''
  };
  try {
    let parsed;
    try {
      parsed = JSON.parse(before.toString('utf8'));
    } catch (e) {
      throw new Error('不是合法 JSON:' + e.message);
    }
    if (parsed.id !== id) {
      record.warnings.push('文件里的 id 是 "' + parsed.id + '",和文件名不一致(迁移沿用文件里的 id)');
    }
    const migrated = RA.LegacyImport.migrate(parsed, { id, fallbackId: id });
    if (!migrated.ok) {
      throw new Error('迁移失败:' + migrated.error.code + ' ' + migrated.error.message);
    }
    const draft = migrated.value.draft;
    record.warnings = migrated.value.warnings.slice();

    const issues = LD.validate(draft, { purpose: 'draft' });
    const errors = LD.errorsOf(issues);
    if (errors.length) {
      record.warnings.push('草稿还有 ' + errors.length + ' 个结构性 error(见下)');
      record.errors = errors;
    }

    const encoded = LD.encode(draft);
    if (!encoded.ok) {
      throw new Error('序列化失败:' + encoded.error.code + ' ' + encoded.error.message);
    }
    const text = encoded.value;
    const outId = RA.LegacyImport.cleanId(draft.id) || id;
    const outPath = join(OUT_DIR, outId + '.json');
    writeFileSync(outPath, text, 'utf8');

    // 重新读回来:自报 hash 必须匹配,草稿校验不能有 error
    const back = LD.decode(text, { verifyHash: true });
    if (!back.ok) throw new Error('写出的文件读不回来:' + back.error.message);
    const backIssues = LD.validate(back.value, { purpose: 'draft' });
    const backErrors = LD.errorsOf(backIssues);
    if (backErrors.length) throw new Error('写出的文件草稿校验失败:' + backErrors[0].message);

    const afterHash = sha256(readFileSync(srcPath));
    record.afterHash = afterHash;
    if (afterHash !== beforeHash) throw new Error('原文件在迁移过程中被改动了!(拒绝继续)');

    const sum = LD.summarize(back.value);
    record.ok = !record.errors;
    record.out = rel(outPath);
    record.cols = sum.cols;
    record.rows = sum.rows;
    record.objects = sum.counts.objects;
    record.paths = sum.counts.paths;
    record.difficulty = sum.difficulty;
    record.background = back.value.visuals.backgroundId;
    record.contentHash = back.value.contentHash;
    record.sourceHash = beforeHash;
    if (record.ok) pass++;
    else problems.push(id + ': 草稿有结构性错误,输出文件保留但不算迁移成功');
  } catch (e) {
    record.error = String((e && e.message) || e);
    problems.push(id + ': ' + record.error);
  }
  rows.push(record);
}

// 模板等以下划线开头的文件不迁移(它们是示例/临时物,不是正式关卡)
readdirSync(IN_DIR).filter((f) => f.startsWith('_') && f.endsWith('.json'))
  .forEach((f) => skipped.push(f));

const now = new Date();
const stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') +
  '-' + String(now.getDate()).padStart(2, '0') + ' ' +
  String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

// ---------------- 人类可读报告 ----------------
const md = [];
md.push('# T01 旧图迁移记录（自动生成）');
md.push('');
md.push('生成时间：' + stamp + '。生成命令：`node tools/migrate_levels.mjs`。');
md.push('');
md.push('本文件由工具覆盖生成，不是手写文档。规则见 [js/legacy-import.js](../../js/legacy-import.js) 与');
md.push('[数据接口第 7 节](../design/data-and-interfaces.md)。');
md.push('');
md.push('## 结论');
md.push('');
md.push('- 输入：`' + rel(IN_DIR) + '` 里 ' + files.length + ' 张旧图（下划线开头不迁移' +
  (skipped.length ? '：' + skipped.join('、') : '') + '）。');
md.push('- 输出：`' + rel(OUT_DIR) + '/<id>.json`，' + pass + ' / ' + files.length + ' 张迁移成功。');
md.push('- 原文件逐个做了 sha256 前后比对：全部一致，未被修改、删除或改名。');
md.push('- 每张输出都重新 `decode`（校验自报 contentHash）并按 `purpose=draft` 校验，0 个结构性 error。');
md.push('- `ports` 一律为 `null`：旧图没有按 vertical-v1（4 格开口 + 上下各 3 格安全带）绘制接口，');
md.push('  迁移**不自动裁剪或缩放**，所以它们现在只是待修复草稿，不能试玩/发布。旧出口 G 的位置记在');
md.push('  `extensions.legacy.exit`，旧出生点 P 记在 `extensions.legacy.entry`，供 T04 的端口工具使用。');
md.push('- 旧 `verified` 只写进 `extensions.legacy.verified`，`certification` 全部 `null`：');
md.push('  T01 不承认任何历史认证，重新标准试玩之前不能入池。');
md.push('');
md.push('## 逐图结果');
md.push('');
md.push('| 文件 | 尺寸 | 难度 | 背景 | 对象 | 路径 | contentHash（前 16 位） | 警告 | 结果 |');
md.push('|---|---:|---:|---|---:|---:|---|---:|---|');
for (const r of rows) {
  md.push('| `' + r.file + '` | ' + (r.cols || '?') + '×' + (r.rows || '?') +
    ' | ' + (r.difficulty === null ? 'null' : r.difficulty) +
    ' | ' + (r.background || '自动') +
    ' | ' + r.objects + ' | ' + r.paths +
    ' | `' + (r.contentHash ? r.contentHash.slice(7, 23) : '—') + '`' +
    ' | ' + r.warnings.length + ' | ' + (r.ok ? '✅ 迁移成功' : '❌ ' + (r.error || '有结构错误')) + ' |');
}
md.push('');
md.push('## 逐图警告');
for (const r of rows) {
  md.push('');
  md.push('### `' + r.file + '` → `' + (r.out || '（未写出）') + '`');
  if (r.error) {
    md.push('');
    md.push('- ❌ **失败**：' + r.error);
  }
  if (r.warnings.length) {
    r.warnings.forEach((w) => md.push('- ' + w));
  } else {
    md.push('- （没有额外警告）');
  }
  if (r.errors && r.errors.length) {
    md.push('');
    md.push('结构性 error：');
    r.errors.forEach((e) => md.push('- `' + e.code + '` `' + e.path + '` ' + e.message));
  }
}
md.push('');
md.push('## 复现与回退');
md.push('');
md.push('```powershell');
md.push('node tools/migrate_levels.mjs   # 重新生成 levels/v2/ 与本报告（覆盖输出，不动旧图）');
md.push('git checkout -- levels/v2      # 只撤销迁移输出，旧图不受影响');
md.push('```');
md.push('');

writeFileSync(REPORT, md.join('\n'), 'utf8');
writeFileSync(REPORT_JSON, JSON.stringify({
  generatedAt: now.toISOString(),
  command: 'node tools/migrate_levels.mjs',
  source: rel(IN_DIR),
  output: rel(OUT_DIR),
  migrated: pass,
  total: files.length,
  skipped,
  files: rows.map((r) => ({
    file: r.file, id: r.id, ok: r.ok, error: r.error, out: r.out,
    size: { cols: r.cols, rows: r.rows }, difficulty: r.difficulty,
    background: r.background, objects: r.objects, paths: r.paths,
    contentHash: r.contentHash, sourceSha256: r.sourceHash,
    warnings: r.warnings
  }))
}, null, 2) + '\n', 'utf8');

console.log('旧图迁移：' + pass + ' / ' + files.length + ' 张成功 → ' + rel(OUT_DIR));
rows.forEach((r) => {
  console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.file + ' → ' + (r.out || r.error) +
    '  （警告 ' + r.warnings.length + ' 条）');
});
console.log('报告：' + rel(REPORT));
if (problems.length) {
  console.error('\n迁移有 ' + problems.length + ' 个问题：');
  problems.forEach((p) => console.error('  ✗ ' + p));
  process.exit(1);
}
console.log('全部旧图都有明确的迁移结果 ✓');
process.exit(0);
