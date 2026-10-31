#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * test_t01r.mjs —— 2026-10-31 验收问题 R1～R5 的正式回归测试
 * ==========================================================
 *     node tools/test_t01r.mjs         单独跑
 *     node tools/test_all.mjs          和其他自检一起跑
 *
 * 每个场景都来自 [验收报告](docs/checks/review-2026-10-31.md) 的复现脚本,
 * 并扩展了同类嵌套字段、路径碰撞、缺失/空值、中文边界。注意:
 * 这里断言的是**修复后的正确行为**,不是"旧复现输出保持不变"。
 *
 * 路径冲突测试只使用系统临时目录,绝不写正式 levels/;
 * 测试结束会核对正式 levels/ 下所有文件在测试期间没有被改动。
 */
import {
  readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync,
  readdirSync, statSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadEngine, ROOT } from './loader.mjs';
import { planMigration, commitPlan, pathKey } from './migrate_levels.mjs';

const RA = loadEngine();
const LD = RA.LevelData;
const t0 = Date.now();
let pass = 0, fail = 0;
const fails = [];

function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }
const clone = (v) => JSON.parse(JSON.stringify(v));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
function errors(issues) { return LD.errorsOf(issues); }
function hasIssue(issues, code, pathPart) {
  return (issues || []).some((i) => i.code === code &&
    (!pathPart || String(i.path).indexOf(pathPart) >= 0));
}
function hasError(issues, code, pathPart) {
  return errors(issues).some((i) => i.code === code &&
    (!pathPart || String(i.path).indexOf(pathPart) >= 0));
}

// ================= 夹具 =================
function tiles(cols, rows) {
  const t = [];
  for (let r = 0; r < rows; r++) t.push(new Array(cols).fill(0));
  return t;
}

/** 能通过 play/publish 结构校验的关卡(不含认证) */
function validLevel() {
  const cols = 14, rows = 10;
  const t = tiles(cols, rows);
  for (let c = 0; c < cols; c++) { t[8][c] = 1; t[9][c] = 4; }
  for (let c = 4; c <= 6; c++) t[6][c] = 3;
  return {
    schemaVersion: 2,
    id: 't01r_valid',
    title: 'T01-R 样例',
    kind: 'normal',
    difficulty: 2,
    size: { cols, rows },
    terrain: { tiles: t },
    ports: { profile: 'vertical-v1', entry: { col: 1 }, exit: { col: 7 } },
    spawn: { col: 2, row: 7 },
    objects: [
      { id: 'o_fire', type: 'fireball_static', col: 5, row: 5,
        params: { radiusTiles: 0.5, damage: 20 }, pathId: null },
      { id: 'o_gear', type: 'gear', col: 7, row: 4,
        params: { speedTilesPerSecond: 2, radiusTiles: 0.5, damage: 20 }, pathId: 'p1' }
    ],
    paths: [{ id: 'p1', mode: 'pingpong', points: [{ col: 7, row: 4 }, { col: 10, row: 4 }] }],
    visuals: {
      backgroundId: 'sky3',
      decorations: [{ id: 'd1', assetId: 'tiles/brick', col: 3, row: 3, layer: 'back' }]
    },
    extensions: { note: '验收样例' },
    contentHash: null,
    certification: null
  };
}

function certify(level, rules) {
  const lv = clone(level);
  rules = rules || { rulesVersion: 'rules-t01r', rulesFingerprint: 'fp-t01r' };
  lv.contentHash = LD.hashSync(lv);
  lv.certification = {
    contentHash: lv.contentHash,
    rulesVersion: rules.rulesVersion,
    rulesFingerprint: rules.rulesFingerprint,
    profileId: 'standard-v1',
    status: 'passed',
    completedAt: '2026-10-31T08:00:00Z',
    source: 'local-playtest'
  };
  return lv;
}

/** 带未知字段的草稿:R1 的核心夹具 */
function extraLevel() {
  const lv = validLevel();
  lv.id = 't01r_extra';
  lv.authorNote = '保留作者备注';
  lv.size.unit = 'tile';
  lv.terrain.legend = { 1: 'grass' };
  lv.visuals.tint = 'dusk';
  lv.visuals.decorations[0].opacity = 0.8;
  lv.objects.push({
    id: 'o_future', type: 'future_enemy', col: 3, row: 4,
    params: { speed: 2, note: '作者参数' }, pathId: null,
    behavior: { keep: 'author-data' }, priority: 3
  });
  lv.paths[0].label = '巡逻路线';
  lv.extensions = { custom: { keep: [1, 2, 3] } };
  return lv;
}

// ================= R1 =================
head('R1:未知内容保留,hash/encode/decode 同一份内容规则,未来 schema 两端拒绝');
{
  const fx = extraLevel();
  const dec = LD.decode(JSON.stringify(fx));
  check('带未知字段的草稿可以读入', dec.ok, dec.ok ? '' : (dec.error && dec.error.code));
  const d = dec.ok ? dec.value : {};
  check('未知顶层字段保留(authorNote)', d.authorNote === '保留作者备注');
  check('size / terrain 的未知子字段保留', d.size.unit === 'tile' &&
    d.terrain.legend && d.terrain.legend[1] === 'grass');
  check('visuals 与装饰的未知字段保留', d.visuals.tint === 'dusk' &&
    d.visuals.decorations[0].opacity === 0.8);
  check('未知对象的额外字段保留(behavior / priority)',
    d.objects && d.objects[2] && d.objects[2].behavior &&
    d.objects[2].behavior.keep === 'author-data' && d.objects[2].priority === 3);
  check('未知对象的未知参数保留', d.objects && d.objects[2] &&
    d.objects[2].params.note === '作者参数');
  check('路径上的未知字段保留(label)', d.paths && d.paths[0].label === '巡逻路线');
  check('decode 对未知顶层字段给出提示(保留而不是静默删除)',
    dec.warnings.some((w) => w.indexOf('authorNote') >= 0));
  check('同一条 decode 警告不会重复出现',
    dec.warnings.filter((w) => w.indexOf('authorNote') >= 0).length === 1,
    dec.warnings.join(' | '));

  const enc = LD.encode(fx);
  check('带未知字段的草稿可以编码', enc.ok, enc.ok ? '' : (enc.error && enc.error.code));
  const text = enc.value;
  check('输出里真的有未知字段', text.indexOf('authorNote') >= 0 && text.indexOf('behavior') >= 0);
  const back = LD.decode(text);
  check('编码后的文件能按同一契约重开(不再 HASH_MISMATCH)', back.ok,
    back.ok ? '' : (back.error && back.error.code + ' ' + back.error.message));
  check('重开后内容与输入等价(含未知字段)',
    back.ok && LD.canonical(LD.contentOf(back.value)) === LD.canonical(LD.contentOf(fx)));
  check('重开后仍保有 behavior / label / tint',
    back.ok && back.value.objects[2].behavior.keep === 'author-data' &&
    back.value.paths[0].label === '巡逻路线' && back.value.visuals.tint === 'dusk');
  check('重开后 hash 与 encode 报告的一致',
    back.ok && back.value.contentHash === enc.contentHash);
  check('编码是幂等的(两次输出相同)', LD.encode(fx).value === text);

  const changed = clone(fx); changed.authorNote = '改备注';
  check('改未知顶层字段 → hash 改变(未知内容也进入内容指纹)',
    LD.hashSync(changed) !== LD.hashSync(fx));
  const changed2 = clone(fx); changed2.objects[2].behavior.keep = 'changed';
  check('改未知对象字段 → hash 改变', LD.hashSync(changed2) !== LD.hashSync(fx));

  // 未来 schema:读写两端都拒绝,且不改输入
  const future = clone(validLevel());
  future.schemaVersion = 3;
  future.futureSystem = { keep: 'v3-data' };
  const beforeFuture = LD.canonical(future);
  const enc3 = LD.encode(future);
  check('encode 拒绝 schemaVersion=3(UNSUPPORTED_SCHEMA)',
    !enc3.ok && enc3.error.code === 'UNSUPPORTED_SCHEMA', enc3.ok ? '竟然成功了' : enc3.error.code);
  check('被拒绝时没有输出文本', !enc3.value);
  check('encode 被拒绝后输入对象没有被改动', LD.canonical(future) === beforeFuture);
  check('encode 拒绝缺少 schemaVersion(不隐式升级)',
    LD.encode({ id: 'no_schema' }).error.code === 'UNSUPPORTED_SCHEMA');
  const dec3 = LD.decode(JSON.stringify(future));
  check('decode 同样拒绝 schemaVersion=3', !dec3.ok && dec3.error.code === 'UNSUPPORTED_SCHEMA');

  const draftIssues = LD.validate(fx, { purpose: 'draft' });
  check('未知对象在草稿下只是警告,可以保存', errors(draftIssues).length === 0);
  check('未知对象在试玩下被拒绝',
    hasError(LD.validate(fx, { purpose: 'play' }), 'UNKNOWN_ENTITY'));
}

// ================= R3 =================
head('R3:规则版本/指纹双方独立校验,完成时间必须是 ISO8601');
{
  const rules = { rulesVersion: 'rules-t01r', rulesFingerprint: 'fp-t01r' };
  const good = certify(validLevel(), rules);
  check('合法认证 + 合法规则 → publish 0 error',
    errors(LD.validate(good, { purpose: 'publish', rules })).length === 0,
    errors(LD.validate(good, { purpose: 'publish', rules })).map((i) => i.message).join('; '));

  const noCertRules = clone(good);
  delete noCertRules.certification.rulesVersion;
  delete noCertRules.certification.rulesFingerprint;
  const i1 = LD.validate(noCertRules, { purpose: 'publish', rules: {} });
  check('认证缺规则 + 当前规则为空 → 不能通过发布(RULES_MISMATCH)',
    hasError(i1, 'RULES_MISMATCH', '/certification/rulesVersion') &&
    hasError(i1, 'RULES_MISMATCH', '/certification/rulesFingerprint') &&
    hasError(i1, 'RULES_MISMATCH', '/certification'));

  const emptyCert = clone(good);
  emptyCert.certification.rulesVersion = '';
  emptyCert.certification.rulesFingerprint = '   ';
  check('认证规则为空串/空白 → RULES_MISMATCH',
    hasError(LD.validate(emptyCert, { purpose: 'publish', rules }), 'RULES_MISMATCH'));

  const numCert = clone(good);
  numCert.certification.rulesVersion = 7;
  check('认证规则不是字符串 → RULES_MISMATCH',
    hasError(LD.validate(numCert, { purpose: 'publish', rules }), 'RULES_MISMATCH'));

  const emptyRules = LD.validate(good, { purpose: 'publish', rules: {} });
  check('当前规则为空对象 → RULES_MISMATCH', hasError(emptyRules, 'RULES_MISMATCH', '/certification'));
  const missingFp = LD.validate(good, { purpose: 'publish', rules: { rulesVersion: 'rules-t01r' } });
  check('当前规则缺指纹 → RULES_MISMATCH', hasError(missingFp, 'RULES_MISMATCH'));
  const numRules = LD.validate(good, { purpose: 'publish', rules: { rulesVersion: 'rules-t01r', rulesFingerprint: 1 } });
  check('当前规则指纹类型错误 → RULES_MISMATCH', hasError(numRules, 'RULES_MISMATCH'));

  const badTime = (value) => {
    const lv = clone(good);
    lv.certification.completedAt = value;
    return LD.validate(lv, { purpose: 'publish', rules });
  };
  ['', 'yesterday', '2026-10-31', '2026-10-31T00:00:00', '31/10/2026 08:00'].forEach((v) => {
    check('非法完成时间被拒绝:' + JSON.stringify(v),
      hasError(badTime(v), 'INVALID_FIELD', '/certification/completedAt'));
  });
  ['2026-10-31T08:00:00+08:00', '2026-10-31T00:00:00.123Z'].forEach((v) => {
    check('合法 ISO8601(带时区/小数秒)通过:' + v,
      errors(LD.validate(Object.assign(clone(good), {
        certification: Object.assign(clone(good.certification), { completedAt: v })
      }), { purpose: 'publish', rules })).length === 0);
  });

  const draftBadTime = clone(good);
  draftBadTime.certification.completedAt = 'not-a-time';
  check('草稿里的坏时间只是警告,不阻止读取/保存',
    errors(LD.validate(draftBadTime, { purpose: 'draft' })).length === 0 &&
    hasIssue(LD.validate(draftBadTime, { purpose: 'draft' }), 'INVALID_FIELD', '/certification/completedAt'));
}

// ================= R4 =================
head('R4:旧图未知格子/未知对象字段/路径引用/元信息完整保留,超容量明确失败');
{
  const small = RA.LegacyImport.migrate({
    id: 'unknown80',
    asc: ['?'.repeat(80), '+P++++G']
  }, { id: 'unknown80' });
  check('80 个未知格全部保留(不再只留 64 个)', small.ok &&
    small.value.draft.extensions.legacy.unknownChars.length === 80,
    small.ok ? String(small.value.draft.extensions.legacy.unknownChars.length) : small.error.message);
  check('未知格保留字符与坐标',
    small.ok && small.value.draft.extensions.legacy.unknownChars[79].ch === '?' &&
    small.value.draft.extensions.legacy.unknownChars[79].col === 79 &&
    small.value.draft.extensions.legacy.unknownChars[0].row === 0);
  const smallEnc = small.ok ? LD.encode(small.value.draft) : null;
  check('80 个未知格的草稿可以保存/重开', !!(smallEnc && smallEnc.ok &&
    LD.decode(smallEnc.value).ok));

  const cols = 80, rows = 60;
  const huge = [];
  for (let r = 0; r < rows; r++) huge.push('?'.repeat(cols));
  const tooBig = RA.LegacyImport.migrate({ id: 'unknown_huge', asc: huge }, { id: 'unknown_huge' });
  check('未知格多到超出 extensions 容量 → 迁移明确失败(LIMIT_EXCEEDED)',
    !tooBig.ok && tooBig.error.code === 'LIMIT_EXCEEDED',
    tooBig.ok ? '迁移竟然成功' : tooBig.error.code);
  check('失败时不返回半成品草稿(不会被截断后当成功)', !tooBig.value);

  const legacyObj = {
    id: 'legacy_objects_full',
    asc: ['+P++++G'],
    objects: [{
      type: 'fireball', id: 'enemy 1', col: 2, row: 0,
      params: { radiusTiles: 1 }, pathId: 'old_route',
      behavior: { keep: 'author-data' }, tags: ['boss']
    }]
  };
  const snapshot = JSON.stringify(legacyObj);
  const migrated = RA.LegacyImport.migrate(legacyObj, { id: legacyObj.id });
  check('带额外字段/路径引用的旧对象迁移成功', migrated.ok,
    migrated.ok ? '' : migrated.error.message);
  const obj = migrated.ok ? migrated.value.draft.objects[0] : {};
  check('旧对象的额外字段完整保留(behavior / tags)',
    obj.behavior && obj.behavior.keep === 'author-data' &&
    Array.isArray(obj.tags) && obj.tags[0] === 'boss');
  check('旧路径引用保留为待修复,不再删除', obj.pathId === 'old_route');
  check('映射类型保留原类型名(fireball → fireball_static + legacyType)',
    obj.type === 'fireball_static' && obj.legacyType === 'fireball');
  check('旧 id 被规范化后保留原值(legacyId)', obj.id === 'enemy_1' && obj.legacyId === 'enemy 1');
  check('迁移不修改调用方传入的旧对象', JSON.stringify(legacyObj) === snapshot);

  const draftIssues = LD.validate(migrated.value.draft, { purpose: 'draft' });
  check('断路径在草稿下只是警告(BROKEN_REFERENCE)', errors(draftIssues).length === 0 &&
    hasIssue(draftIssues, 'BROKEN_REFERENCE'));
  check('断路径在试玩下是错误', hasError(LD.validate(migrated.value.draft, { purpose: 'play' }),
    'BROKEN_REFERENCE'));

  const emptyPath = RA.LegacyImport.migrate({
    id: 'legacy_empty_path', asc: ['+P++++G'],
    objects: [{ type: 'spike', id: 'spk', col: 2, row: 0, params: {}, pathId: '' }]
  }, { id: 'legacy_empty_path' });
  check('旧对象空 pathId 迁移成 null(不因空串让整张图失败)',
    emptyPath.ok && emptyPath.value.draft.objects[0].pathId === null);
  const badPathType = RA.LegacyImport.migrate({
    id: 'legacy_bad_path', asc: ['+P++++G'],
    objects: [{
      type: 'spike', id: 'spk2', col: 2, row: 0, pathId: 42,
      params: { warningSeconds: 0.5, activeSeconds: 0.8, cooldownSeconds: 1, damage: 20 }
    }]
  }, { id: 'legacy_bad_path' });
  check('旧对象非字符串 pathId 保留在 legacyPathId、引用标为待修复',
    badPathType.ok && badPathType.value.draft.objects[0].pathId === null &&
    badPathType.value.draft.objects[0].legacyPathId === 42);
  const enc = LD.encode(migrated.value.draft);
  check('带断路径引用的迁移草稿可以保存', enc.ok, enc.ok ? '' : enc.error.message);
  const reopened = enc.ok ? LD.decode(enc.value) : null;
  check('重开后额外字段/路径/legacyType 仍在',
    !!(reopened && reopened.ok && reopened.value.objects[0].behavior.keep === 'author-data' &&
      reopened.value.objects[0].pathId === 'old_route' &&
      reopened.value.objects[0].legacyType === 'fireball'));

  const withMeta = RA.LegacyImport.migrate({
    id: 'legacy_meta',
    asc: ['// name: 带注释的旧图', '// author: 我', '+P++++G'],
    objects: [],
    extraInfo: { keep: 'meta' },
    tags: ['a', 'b']
  }, { id: 'legacy_meta' });
  check('旧图未识别的顶层字段保存到 extensions.legacy.meta',
    withMeta.ok && withMeta.value.draft.extensions.legacy.meta.extraInfo.keep === 'meta' &&
    withMeta.value.draft.extensions.legacy.meta.tags.length === 2);
  check('旧注释行原样保存到 extensions.legacy.comments',
    withMeta.ok && withMeta.value.draft.extensions.legacy.comments.author === '我' &&
    withMeta.value.draft.extensions.legacy.comments.name === '带注释的旧图');

  const longName = '很长的名字'.repeat(30);
  const truncated = RA.LegacyImport.migrate({
    id: 'legacy_long', asc: ['// name: ' + longName, '+P++++G']
  }, { id: 'legacy_long' });
  check('超长显示名截断后保留原值', truncated.ok &&
    truncated.value.draft.title.length === LD.LIMITS.TITLE &&
    truncated.value.draft.extensions.legacy.originalTitle === longName);

  const chineseId = RA.LegacyImport.migrate({ id: '我的图', asc: ['+P+G'] }, { id: '我的图' });
  check('无法直接映射的旧 id 保留原值(originalId)',
    chineseId.ok && /^[A-Za-z0-9_-]+$/.test(chineseId.value.draft.id) &&
    chineseId.value.draft.extensions.legacy.originalId === '我的图');
}

// ================= R5 =================
head('R5:导出文件必须落在自身导入上限内(按 UTF-8 字节)');
{
  const big = validLevel();
  big.objects.push({
    id: 'o_blob', type: 'future_enemy', col: 3, row: 4,
    params: { blob: 'x'.repeat(LD.LIMITS.BYTES) }, pathId: null
  });
  const r = LD.encode(big);
  check('超过导入上限的导出 → LIMIT_EXCEEDED',
    !r.ok && r.error.code === 'LIMIT_EXCEEDED', r.ok ? '竟然成功了' : r.error.code);
  check('超限时不返回文本(不会写出打不开的文件)', !r.value);
  check('错误信息说明实际字节数与上限',
    !r.ok && r.error.message.indexOf(String(LD.LIMITS.BYTES)) >= 0);

  const zh = validLevel();
  const zhChars = Math.floor(LD.LIMITS.BYTES / 3) + 100;   // 字符数在上限内,UTF-8 字节数超限
  zh.objects.push({
    id: 'o_zh', type: 'future_enemy', col: 3, row: 4,
    params: { blob: '中'.repeat(zhChars) }, pathId: null
  });
  const rz = LD.encode(zh);
  check('中文按真实 UTF-8 字节计数(字符数没超也会被拦)',
    !rz.ok && rz.error.code === 'LIMIT_EXCEEDED', rz.ok ? '竟然成功了' : rz.error.code);

  const under = validLevel();
  under.objects.push({
    id: 'o_under', type: 'future_enemy', col: 3, row: 4,
    params: { blob: 'x'.repeat(LD.LIMITS.BYTES - 300000) }, pathId: null
  });
  const ru = LD.encode(under);
  check('未超限的大文件可以导出', ru.ok, ru.ok ? '' : ru.error.code);
  check('导出字节数在上限内(按 UTF-8 实测)',
    ru.ok && LD.byteLength(ru.value) <= LD.LIMITS.BYTES,
    ru.ok ? LD.byteLength(ru.value) + ' 字节' : '');
  const back = ru.ok ? LD.decode(ru.value) : null;
  check('导出后能重新导入(自洽)',
    !!(back && back.ok) && back.value.contentHash === ru.contentHash);
}

// ================= R2 =================
head('R2:迁移工具先规划后写入,源文件永不被覆盖(仅系统临时目录)');
const LEVELS_DIR = join(ROOT, 'levels');
const V2_DIR = join(LEVELS_DIR, 'v2');
function snapshotTree(dir) {
  if (!existsSync(dir)) return {};
  const out = {};
  readdirSync(dir).forEach((f) => {
    const p = join(dir, f);
    if (statSync(p).isFile()) out[f] = sha256(readFileSync(p));
  });
  return out;
}
const levelsBefore = snapshotTree(LEVELS_DIR);
const v2Before = snapshotTree(V2_DIR);

function sampleLegacy(id) {
  return {
    id: id, difficulty: 1, verified: false, size: { cols: 6, rows: 4 },
    sky: 0, objects: [], asc: ['+G++++', '^---^^', '+P++++', '^^^^^^']
  };
}
function writeSample(dir, name, id) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name + '.json');
  writeFileSync(p, JSON.stringify(sampleLegacy(id), null, 2), 'utf8');
  return p;
}
function mkTemp(tag) {
  return mkdtempSync(join(tmpdir(), 'ra-t01r-' + tag + '-'));
}
function cleanup(...dirs) {
  dirs.forEach((d) => { try { rmSync(d, { recursive: true, force: true }); } catch (e) { } });
}

let tempRoots = [];

{
  // ① 输入与输出同一目录:规划阶段拒绝,源文件一字不动
  const root = mkTemp('same'); tempRoots.push(root);
  const data = join(root, 'data');
  const src = writeSample(data, 'sample', 'sample');
  const before = readFileSync(src);
  const plan = planMigration({ inDir: data, outDir: data, report: join(root, 'report.md') });
  check('--in 与 --out 相同 → 规划失败(PATH_CONFLICT)',
    !plan.ok && plan.errors.some((e) => e.code === 'PATH_CONFLICT'));
  check('同目录被拒绝后源文件没有被覆盖', readFileSync(src).equals(before));
  check('同目录被拒绝后没有创建输出/报告',
    !existsSync(join(root, 'report.md')) && !existsSync(join(root, 'report.json')));
  check('同目录被拒绝后没有执行写入(commit 不写)', commitPlan(plan).ok === false &&
    readFileSync(src).equals(before));

  // ② 只差大小写(Windows 路径别名):同样在写入前拒绝
  const inDirCase = join(root, 'CaseData');
  const src2 = writeSample(inDirCase, 'sample', 'sample');
  const upper = join(root, 'CASEDATA');
  const planCase = planMigration({ inDir: inDirCase, outDir: upper, report: join(root, 'r-case.md') });
  check('--in/--out 只差大小写 → PATH_CONFLICT',
    !planCase.ok && planCase.errors.some((e) => e.code === 'PATH_CONFLICT'),
    planCase.ok ? '竟然通过' : planCase.errors.map((e) => e.code).join(','));
  check('大小写别名被拒绝后源文件不变', readFileSync(src2).length > 0 &&
    readFileSync(src2).toString('utf8').indexOf('"asc"') >= 0);

  // ③ 报告落在源文件上
  const planRep = planMigration({
    inDir: data, outDir: join(root, 'out3'), report: join(data, 'sample.json')
  });
  check('--report 指向源文件 → 写入前失败(REPORT_CONFLICT)',
    !planRep.ok && planRep.errors.some((e) => e.code === 'REPORT_CONFLICT'));
  check('报告冲突时源文件未被改写', readFileSync(src).equals(before));

  // ④ 报告放在输入目录里 → 拒绝(避免下次把报告当源文件)
  const planInside = planMigration({
    inDir: data, outDir: join(root, 'out4'), report: join(data, '_report.md')
  });
  check('报告不允许放进输入目录(REPORT_CONFLICT)', !planInside.ok &&
    planInside.errors.some((e) => e.code === 'REPORT_CONFLICT'));

  // ⑤ 输出 ID 归一化碰撞
  const dup = join(root, 'dup');
  writeSample(dup, 'a b', 'a b');
  writeSample(dup, 'a_b', 'a_b');
  const planDup = planMigration({ inDir: dup, outDir: join(root, 'out5'), report: join(root, 'r5.md') });
  check('两个旧 id 归一化成同一个输出 → DUPLICATE_OUTPUT',
    !planDup.ok && planDup.errors.some((e) => e.code === 'DUPLICATE_OUTPUT'),
    planDup.ok ? '竟然通过' : planDup.errors.map((e) => e.code).join(','));
  check('碰撞时没有生成任何输出', !existsSync(join(root, 'out5')) ||
    readdirSync(join(root, 'out5')).length === 0);

  // ⑥ 正常迁移 → 幂等 → 内容不同的输出默认冲突 → --force 覆盖
  const okRoot = join(root, 'ok');
  const okIn = join(okRoot, 'in');
  const okOut = join(okRoot, 'out');
  const okSrc = writeSample(okIn, 'sample', 'sample');
  const okSrcHash = sha256(readFileSync(okSrc));
  const p1 = planMigration({ inDir: okIn, outDir: okOut, report: join(okRoot, 'r.md') });
  check('正常规划通过', p1.ok, p1.ok ? '' : p1.errors.map((e) => e.code).join(','));
  check('规划阶段不写任何输出', !existsSync(okOut));
  const c1 = commitPlan(p1);
  check('执行后写出关卡与报告', c1.ok && existsSync(join(okOut, 'sample.json')) &&
    existsSync(join(okRoot, 'r.md')) && existsSync(join(okRoot, 'r.json')));
  const out1 = readFileSync(join(okOut, 'sample.json'), 'utf8');
  check('迁移后源文件没有被改(sha256 一致)', sha256(readFileSync(okSrc)) === okSrcHash);

  const p2 = planMigration({ inDir: okIn, outDir: okOut, report: join(okRoot, 'r.md') });
  check('第二次规划:内容相同 → 幂等(unchanged)', p2.ok &&
    p2.entries.every((e) => e.status === 'unchanged'));
  commitPlan(p2);
  check('幂等时不会重写输出', readFileSync(join(okOut, 'sample.json'), 'utf8') === out1);

  writeFileSync(join(okOut, 'sample.json'), out1.replace('"title"', '"title" '), 'utf8');
  const manual = readFileSync(join(okOut, 'sample.json'), 'utf8');
  const p3 = planMigration({ inDir: okIn, outDir: okOut, report: join(okRoot, 'r.md') });
  check('人工改过的输出默认报冲突(OUTPUT_CONFLICT)',
    !p3.ok && p3.errors.some((e) => e.code === 'OUTPUT_CONFLICT'));
  check('冲突时输出保持人工内容', readFileSync(join(okOut, 'sample.json'), 'utf8') === manual);
  const p4 = planMigration({ inDir: okIn, outDir: okOut, report: join(okRoot, 'r.md'), force: true });
  check('--force 时允许覆盖(overwrite)', p4.ok &&
    p4.entries.every((e) => e.status === 'overwrite'));
  commitPlan(p4);
  check('--force 后输出恢复成迁移结果', readFileSync(join(okOut, 'sample.json'), 'utf8') === out1);

  // ⑦ 报告与输出相撞
  const p5 = planMigration({
    inDir: okIn, outDir: okOut, report: join(okOut, 'sample.json'), reportJson: join(okRoot, 'r5b.json')
  });
  check('--report 指向输出文件 → REPORT_CONFLICT',
    !p5.ok && p5.errors.some((e) => e.code === 'REPORT_CONFLICT'));

  // ⑧ 输入目录不存在 / 输出位置是文件
  const pMissing = planMigration({ inDir: join(root, 'nope'), outDir: join(root, 'o'), report: join(root, 'r6.md') });
  check('输入目录不存在 → MISSING_INPUT', !pMissing.ok &&
    pMissing.errors.some((e) => e.code === 'MISSING_INPUT'));
  const outFile = join(root, 'not-a-dir');
  writeFileSync(outFile, 'x', 'utf8');
  const pOutFile = planMigration({ inDir: okIn, outDir: outFile, report: join(root, 'r7.md') });
  check('输出位置是文件 → OUTPUT_NOT_DIR', !pOutFile.ok &&
    pOutFile.errors.some((e) => e.code === 'OUTPUT_NOT_DIR'));

  // ⑨ CLI 退出码:同目录必须是 1,且源文件不变
  // 用 stdio:'ignore' 而不是管道捕获输出:受限沙箱里子进程管道可能被平台禁止,
  // 这里只验证退出码与文件副作用,已经足够抓住"先写后报错"的回归。
  const cliRoot = join(root, 'cli');
  const cliIn = join(cliRoot, 'in');
  const cliSrc = writeSample(cliIn, 'sample', 'sample');
  const cliBefore = readFileSync(cliSrc);
  const child = spawnSync(process.execPath,
    ['tools/migrate_levels.mjs', '--in', cliIn, '--out', cliIn, '--report', join(cliRoot, 'r.md')],
    { cwd: ROOT, stdio: 'ignore' });
  check('CLI 同目录迁移退出码 1', child.status === 1, 'exit ' + child.status);
  check('CLI 拒绝时源文件字节不变', readFileSync(cliSrc).equals(cliBefore));
  check('CLI 拒绝时不去写报告', !existsSync(join(cliRoot, 'r.md')));
}

// 正式 levels/ 在测试期间必须完全没变
const levelsAfter = snapshotTree(LEVELS_DIR);
const v2After = snapshotTree(V2_DIR);
check('测试没有改动正式 levels/*.json', JSON.stringify(levelsBefore) === JSON.stringify(levelsAfter));
check('测试没有改动正式 levels/v2/*.json', JSON.stringify(v2Before) === JSON.stringify(v2After));
const outsideTmp = tempRoots.filter((d) => pathKey(d).indexOf(pathKey(tmpdir())) !== 0);
check('R2 夹具全部在系统临时目录内', outsideTmp.length === 0,
  outsideTmp.join(','));
tempRoots.forEach((d) => cleanup(d));

// ================= 收尾 =================
export const result = { pass, fail, fails, name: '验收修复自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`验收修复自检:合计 PASS ${pass}  FAIL ${fail}   用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✓');
  process.exit(0);
}
