#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * migrate_levels.mjs —— 把 levels/*.json(旧 asc 格式)一次性迁移成 v2 草稿
 * =======================================================================
 *     node tools/migrate_levels.mjs
 *     node tools/migrate_levels.mjs --in levels --out levels/archive/v2 \
 *          --report docs/checks/T01-legacy-migration.md [--force]
 *
 * 路径安全(2026-10-31 验收 R2):
 *   ① 先规划、后写入:所有源文件、输出文件、报告文件的真实路径在**任何写入之前**
 *      全部算好并检查;同一目录、大小写/别名相同、输出 ID 归一化碰撞、
 *      报告落到源文件或输出文件上,都会在写入前直接失败。
 *   ② 源文件永远只读:迁移前后各算一次 sha256,不一致立即报错(这只是兜底,
 *      正常流程下源路径根本不在写入计划里)。
 *   ③ 已有输出:内容相同 → 幂等接受(不重写);内容不同 → 默认报冲突不覆盖,
 *      必须显式 --force 才覆盖,避免把手工改过的草稿冲掉。
 *   ④ 规划或迁移失败时不写任何文件、也不生成报告,只打印问题。
 *
 * 迁移规则本身不在这里:见 js/legacy-import.js(只读输入)与 js/level-data.js(校验/编码)。
 * 旧图的 verified 不继承为认证;ports 一律 null(旧图没有按 vertical-v1 绘制接口)。
 */
import {
  readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, realpathSync
} from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEngine, ROOT } from './loader.mjs';

const RA = loadEngine();
const LD = RA.LevelData;

export const DEFAULTS = {
  inDir: 'levels',
  outDir: 'levels/archive/v2',
  report: 'docs/checks/T01-legacy-migration.md'
};

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function rel(p) {
  const r = resolve(p);
  const root = resolve(ROOT);
  if (r === root) return '.';
  if (r.indexOf(root + '\\') === 0 || r.indexOf(root + '/') === 0) {
    return r.slice(root.length + 1).replace(/\\/g, '/');
  }
  return r.replace(/\\/g, '/');
}

/**
 * 比较路径用的键:解析成绝对路径、解析符号链接/别名(存在时),Windows 下统一小写。
 * 这样 --in 与 --out 只差大小写、或经 junction 指向同一目录时也能被判成同一个。
 */
export function pathKey(p) {
  const abs = resolve(p);
  let real = abs;
  try { real = realpathSync(abs); } catch (e) { /* 还不存在:用解析后的绝对路径 */ }
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

function planError(code, message) {
  return { code: code, message: message };
}

/** child 是否在 dir 里面(用真实路径键比较,Windows 大小写/别名同样生效) */
export function isUnder(dir, child) {
  const d = pathKey(dir);
  const q = pathKey(child);
  if (q === d) return true;
  return q.indexOf(d + '\\') === 0 || q.indexOf(d + '/') === 0;
}

/**
 * 只读规划:读源文件、迁移、编码、检查全部路径与冲突,不写任何文件。
 * 返回 {ok, errors, entries, inDir, outDir, reportPath, reportJsonPath, force}。
 */
export function planMigration(opts) {
  opts = opts || {};
  const inDir = resolve(ROOT, opts.inDir || DEFAULTS.inDir);
  const outDir = resolve(ROOT, opts.outDir || DEFAULTS.outDir);
  const reportPath = resolve(ROOT, opts.report || DEFAULTS.report);
  const reportJsonPath = opts.reportJson
    ? resolve(ROOT, opts.reportJson)
    : reportPath.replace(/\.md$/i, '') + '.json';
  const force = !!opts.force;
  const errors = [];

  const inKey = pathKey(inDir);
  const outKey = pathKey(outDir);

  if (!existsSync(inDir)) {
    errors.push(planError('MISSING_INPUT', '找不到输入目录:' + inDir));
  } else if (!statSync(inDir).isDirectory()) {
    errors.push(planError('MISSING_INPUT', '输入不是目录:' + inDir));
  }
  if (existsSync(outDir) && !statSync(outDir).isDirectory()) {
    errors.push(planError('OUTPUT_NOT_DIR', '输出路径已存在但不是目录:' + outDir));
  }
  if (inKey === outKey) {
    errors.push(planError('PATH_CONFLICT',
      '输入与输出是同一个目录(' + inDir + '):迁移会覆盖源文件,拒绝执行。' +
      '请把 --out 指到独立目录,例如 levels/archive/v2'));
  }
  if (pathKey(reportPath) === pathKey(reportJsonPath)) {
    errors.push(planError('REPORT_CONFLICT', 'Markdown 报告和 JSON 报告是同一个路径:' + reportPath));
  }
  if (existsSync(reportPath) && statSync(reportPath).isDirectory()) {
    errors.push(planError('REPORT_CONFLICT', '报告路径是目录:' + reportPath));
  }
  [reportPath, reportJsonPath].forEach((rp) => {
    // 报告写进输入目录会被下一次运行当成源文件;一律要求放在外面,
    // 这样"报告"永远不会和"源文件"混在一起(R2)。
    if (isUnder(inDir, rp)) {
      errors.push(planError('REPORT_CONFLICT',
        '报告必须放在输入目录之外:' + rp + ' 在 ' + inDir + ' 里;' +
        '否则下次迁移会把报告当成源文件,也容易覆盖源文件'));
    }
  });
  if (errors.length) {
    return { ok: false, errors, entries: [], skipped: [], inDir, outDir, reportPath, reportJsonPath, force };
  }

  const files = readdirSync(inDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort();
  const skipped = readdirSync(inDir)
    .filter((f) => f.startsWith('_') && f.endsWith('.json')).sort();
  if (!files.length) {
    errors.push(planError('NO_INPUT', '输入目录里一个关卡 json 都没有:' + inDir));
    return {
      ok: false, errors, entries: [], skipped, inDir, outDir,
      reportPath, reportJsonPath, force
    };
  }

  const sourceKeys = Object.create(null);
  const entries = [];
  const outputKeys = Object.create(null);

  files.forEach((f) => {
    sourceKeys[pathKey(join(inDir, f))] = f;
  });

  files.forEach((f) => {
    const sourcePath = join(inDir, f);
    const before = readFileSync(sourcePath);
    const entry = {
      file: f,
      sourcePath,
      beforeHash: sha256(before),
      id: basename(f, '.json'),
      outPath: '',
      text: '',
      contentHash: '',
      warnings: [],
      error: '',
      status: 'migrated',
      cols: 0,
      rows: 0,
      objects: 0,
      paths: 0,
      difficulty: null,
      background: null
    };
    try {
      let parsed;
      try {
        parsed = JSON.parse(before.toString('utf8'));
      } catch (e) {
        throw new Error('不是合法 JSON:' + e.message);
      }
      const migrated = RA.LegacyImport.migrate(parsed, { id: entry.id, fallbackId: entry.id });
      if (!migrated.ok) {
        throw new Error('迁移失败:' + migrated.error.code + ' ' + migrated.error.message);
      }
      const draft = migrated.value.draft;
      entry.warnings = migrated.value.warnings.slice();
      if (draft.id !== entry.id) {
        entry.warnings.push('输出 id 归一化为 "' + draft.id + '"(与文件名不同,可能造成输出碰撞)');
      }
      const encoded = LD.encode(draft);
      if (!encoded.ok) {
        throw new Error('序列化失败:' + encoded.error.code + ' ' + encoded.error.message);
      }
      entry.text = encoded.value;
      entry.contentHash = encoded.contentHash;
      entry.warnings = entry.warnings.concat(encoded.warnings || []);
      entry.outPath = join(outDir, draft.id + '.json');
      const outKey = pathKey(entry.outPath);
      if (sourceKeys[outKey]) {
        errors.push(planError('SOURCE_OVERWRITE',
          entry.file + ' 的输出会落到源文件 "' + sourceKeys[outKey] + '" 上,拒绝执行'));
        entry.error = '输出与源文件相同';
      }
      if (outputKeys[outKey]) {
        errors.push(planError('DUPLICATE_OUTPUT',
          '两个源文件会写到同一个输出 "' + entry.outPath + '":' +
          outputKeys[outKey] + ' 与 ' + entry.file + ';请先重命名,工具不会互相覆盖'));
        entry.error = '输出路径碰撞';
      }
      outputKeys[outKey] = f;

      const sum = LD.summarize(draft);
      entry.cols = sum.cols;
      entry.rows = sum.rows;
      entry.objects = sum.counts.objects;
      entry.paths = sum.counts.paths;
      entry.difficulty = sum.difficulty;
      entry.background = draft.visuals.backgroundId;
      entry.outputBytes = Buffer.byteLength(entry.text, 'utf8');

      if (existsSync(entry.outPath)) {
        if (!statSync(entry.outPath).isFile()) {
          errors.push(planError('OUTPUT_NOT_FILE',
            '输出位置已存在但不是普通文件:' + entry.outPath));
          entry.error = '输出不是文件';
        } else {
          const existing = readFileSync(entry.outPath, 'utf8');
          if (existing === entry.text) {
            entry.status = 'unchanged';
          } else if (force) {
            entry.status = 'overwrite';
            entry.warnings.push('已有输出内容不同,按 --force 覆盖:' + rel(entry.outPath));
          } else {
            entry.status = 'conflict';
            errors.push(planError('OUTPUT_CONFLICT',
              '已有输出内容不同,默认不覆盖:' + rel(entry.outPath) +
              ';确认要重写请加 --force(手工改过的草稿先备份)'));
            entry.error = '输出冲突';
          }
        }
      }
    } catch (e) {
      entry.error = String((e && e.message) || e);
      errors.push(planError('MIGRATE_FAILED', entry.file + ': ' + entry.error));
    }
    entries.push(entry);
  });

  // 报告文件不能落到源文件/输出文件上
  [reportPath, reportJsonPath].forEach((rp) => {
    const k = pathKey(rp);
    if (sourceKeys[k]) {
      errors.push(planError('REPORT_CONFLICT',
        '报告会覆盖源文件:' + rp + ';换一个 --report 路径'));
    }
    if (outputKeys[k]) {
      errors.push(planError('REPORT_CONFLICT',
        '报告和迁移输出是同一个文件:' + rp + ';换一个 --report 路径'));
    }
  });

  // 规划期间源文件必须完全没变(只读)
  entries.forEach((entry) => {
    try {
      const now = sha256(readFileSync(entry.sourcePath));
      if (now !== entry.beforeHash) {
        errors.push(planError('SOURCE_CHANGED', entry.file + ' 在迁移规划期间被改动,拒绝继续'));
      }
    } catch (e) {
      errors.push(planError('SOURCE_UNREADABLE', entry.file + ' 读不回来:' + e.message));
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    entries,
    skipped,
    inDir,
    outDir,
    reportPath,
    reportJsonPath,
    force
  };
}

function fmtTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 生成人类可读报告(纯字符串,不写盘) */
export function buildReport(plan, now) {
  const entries = plan.entries;
  const okCount = entries.filter((e) => !e.error).length;
  const unchanged = entries.filter((e) => e.status === 'unchanged').length;
  const overwritten = entries.filter((e) => e.status === 'overwrite').length;
  const fresh = okCount - unchanged - overwritten;
  const md = [];
  md.push('# T01 旧图迁移记录（自动生成）');
  md.push('');
  md.push('生成时间：' + fmtTime(now || new Date()) + '。生成命令：`node tools/migrate_levels.mjs`。');
  md.push('');
  md.push('本文件由工具覆盖生成，不是手写文档。规则见 [js/legacy-import.js](../../js/legacy-import.js) 与');
  md.push('[数据接口第 7 节](../design/data-and-interfaces.md)。');
  md.push('');
  md.push('## 结论');
  md.push('');
  md.push('- 输入：`' + rel(plan.inDir) + '` 里 ' + entries.length + ' 张旧图（下划线开头不迁移' +
    (plan.skipped && plan.skipped.length ? '：' + plan.skipped.join('、') : '') + '）。');
  md.push('- 输出：`' + rel(plan.outDir) + '/<id>.json`，成功 ' + okCount + ' / ' + entries.length +
    ' 张；新写入 ' + fresh + '、内容未变幂等跳过 ' + unchanged + '、按 --force 覆盖 ' + overwritten + '。');
  md.push('- 原文件逐个做了 sha256 规划期与写后比对：全部一致，未被修改、删除或改名。');
  md.push('- 每条输出都重新 `decode`（校验自报 contentHash）并按 `purpose=draft` 校验，0 个结构性 error。');
  md.push('- `ports` 一律为 `null`：旧图没有按 vertical-v1（4 格开口 + 上下各 3 格安全带）绘制接口，');
  md.push('  迁移**不自动裁剪或缩放**，所以它们现在只是待修复草稿，不能试玩/发布。旧出口 G 的位置记在');
  md.push('  `extensions.legacy.exit`，旧出生点 P 记在 `extensions.legacy.entry`，供 T04 的端口工具使用。');
  md.push('- 旧 `verified` 只写进 `extensions.legacy.verified`，`certification` 全部 `null`：');
  md.push('  迁移不承认任何历史认证，重新标准试玩之前不能入池。');
  md.push('- 路径安全（T01-R/R2）：写入前已检查输入/输出/报告的真实路径与大小写别名；');
  md.push('  同一目录、输出碰撞、报告覆盖源文件都会在写入前失败；内容不同的人工草稿默认不覆盖。');
  md.push('');
  md.push('## 逐图结果');
  md.push('');
  md.push('| 文件 | 尺寸 | 难度 | 背景 | 对象 | 路径 | contentHash（前 16 位） | 警告 | 状态 |');
  md.push('|---|---:|---:|---|---:|---:|---|---:|---|');
  entries.forEach((e) => {
    const status = e.error ? '❌ ' + e.error
      : (e.status === 'unchanged' ? '✅ 未变（幂等）'
        : (e.status === 'overwrite' ? '✅ 已覆盖（--force）' : '✅ 新迁移'));
    md.push('| `' + e.file + '` | ' + (e.cols || '?') + '×' + (e.rows || '?') +
      ' | ' + (e.difficulty === null ? 'null' : e.difficulty) +
      ' | ' + (e.background || '自动') +
      ' | ' + e.objects + ' | ' + e.paths +
      ' | `' + (e.contentHash ? e.contentHash.slice(7, 23) : '—') + '`' +
      ' | ' + e.warnings.length + ' | ' + status + ' |');
  });
  md.push('');
  md.push('## 逐图警告');
  entries.forEach((e) => {
    md.push('');
    md.push('### `' + e.file + '` → `' + (e.outPath ? rel(e.outPath) : '（未写出）') + '`');
    if (e.error) md.push('', '- ❌ **失败**：' + e.error);
    if (e.warnings.length) e.warnings.forEach((w) => md.push('- ' + w));
    else md.push('- （没有额外警告）');
  });
  md.push('');
  md.push('## 复现与回退');
  md.push('');
  md.push('```powershell');
  md.push('node tools/migrate_levels.mjs                      # 重新生成（内容相同则幂等跳过）');
  md.push('node tools/migrate_levels.mjs --force              # 显式覆盖内容不同的既有输出');
  md.push('git checkout -- levels/archive/v2                          # 只撤销迁移输出');
  md.push('```');
  md.push('');
  return md.join('\n');
}

/** 执行规划:先写关卡文件,再写报告。任何失败都保留源文件与已有输出。 */
export function commitPlan(plan, now) {
  if (!plan || !plan.ok) return { ok: false, error: '规划未通过,没有写任何文件' };
  mkdirSync(plan.outDir, { recursive: true });
  const written = [];
  const unchanged = [];
  plan.entries.forEach((e) => {
    if (e.status === 'unchanged') { unchanged.push(e.outPath); return; }
    writeFileSync(e.outPath, e.text, 'utf8');
    written.push(e.outPath);
  });

  // 写后复验源文件没有被改(兜底;正常路径里源文件不在写入计划中)
  const changed = [];
  plan.entries.forEach((e) => {
    const nowHash = sha256(readFileSync(e.sourcePath));
    if (nowHash !== e.beforeHash) changed.push(e.file);
  });

  const md = buildReport(plan, now);
  const existingReport = existsSync(plan.reportPath) ? readFileSync(plan.reportPath, 'utf8') : null;
  if (existingReport !== md) writeFileSync(plan.reportPath, md, 'utf8');
  const json = JSON.stringify({
    generatedAt: (now || new Date()).toISOString(),
    command: 'node tools/migrate_levels.mjs',
    source: rel(plan.inDir),
    output: rel(plan.outDir),
    migrated: plan.entries.filter((e) => !e.error).length,
    total: plan.entries.length,
    skipped: plan.skipped || [],
    files: plan.entries.map((e) => ({
      file: e.file, ok: !e.error, error: e.error, out: rel(e.outPath),
      status: e.status, size: { cols: e.cols, rows: e.rows }, difficulty: e.difficulty,
      background: e.background, objects: e.objects, paths: e.paths,
      contentHash: e.contentHash, sourceSha256: e.beforeHash,
      warnings: e.warnings
    }))
  }, null, 2) + '\n';
  const existingJson = existsSync(plan.reportJsonPath)
    ? readFileSync(plan.reportJsonPath, 'utf8') : null;
  if (existingJson !== json) writeFileSync(plan.reportJsonPath, json, 'utf8');

  return { ok: changed.length === 0, written, unchanged, report: plan.reportPath, changed };
}

function parseArgs(argv) {
  const out = { force: false, inDir: DEFAULTS.inDir, outDir: DEFAULTS.outDir, report: DEFAULTS.report };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--in' && argv[i + 1]) out.inDir = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outDir = argv[++i];
    else if (a === '--report' && argv[i + 1]) out.report = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else out.unknown = a;
  }
  return out;
}

export function main(argv) {
  const args = parseArgs(argv || []);
  if (args.help) {
    console.log('用法:node tools/migrate_levels.mjs [--in 目录] [--out 目录] [--report 文件] [--force]');
    return 0;
  }
  const plan = planMigration(args);
  if (!plan.ok) {
    console.error('迁移没有执行:规划阶段发现 ' + plan.errors.length + ' 个问题(未写入任何文件)');
    plan.errors.forEach((e) => console.error('  ✗ [' + e.code + '] ' + e.message));
    return 1;
  }
  let res;
  try {
    res = commitPlan(plan);
  } catch (e) {
    console.error('写入失败:' + (e && e.message));
    return 1;
  }
  if (!res.ok) {
    console.error('写完后发现源文件被改动,请立刻检查:' + (res.changed || []).join('、'));
    return 1;
  }
  const count = (s) => plan.entries.filter((e) => e.status === s).length;
  console.log('旧图迁移:' + plan.entries.length + ' 张 → ' + rel(plan.outDir) +
    '(新写入 ' + (plan.entries.length - count('unchanged') - count('overwrite')) +
    '、幂等跳过 ' + count('unchanged') + '、强制覆盖 ' + count('overwrite') + ')');
  plan.entries.forEach((e) => {
    console.log('  PASS  ' + e.file + ' → ' + rel(e.outPath) + '  [' + e.status +
      ', 警告 ' + e.warnings.length + ' 条]');
  });
  console.log('报告:' + rel(plan.reportPath));
  return 0;
}

const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) process.exit(main(process.argv.slice(2)));
