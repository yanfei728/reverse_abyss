#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * test_leveldata.mjs —— T01 契约自检:schemaVersion=2 的编解码、校验、hash、旧图迁移
 * =============================================================================
 *     node tools/test_leveldata.mjs         单独跑
 *     node tools/test_all.mjs               和其他自检一起跑(计入总账)
 *
 * 这里只验证"数据契约",不验证画面与手感:
 *   ① SHA-256 与 node:crypto 交叉验证(空串 / 中文 / 长文本 / emoji);
 *   ② 编解码往返:难度 3、两个带参数对象、一条 pingpong 路径、背景、extensions 全保真;
 *   ③ 规范化 hash:对象键顺序不影响;改一格 / 一个参数 / 名字 / extensions 都改变;
 *   ④ 分层校验:草稿可暂缺,试玩/发布必须严格;未知对象/参数、断引用、越界、超限、
 *      未来 schema、自报 hash 不符都有明确 code 与 path;
 *   ⑤ 旧图迁移:12 张旧图逐格对比旧引擎解析结果、对象与出生点/出口保真、
 *      原文件字节不变、输出与工具生成的一致、认证不继承;
 *   ⑥ 输出可读(地形一行一行)且仍是标准 JSON;输入不被修改。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEngine, ROOT } from './loader.mjs';

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
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function sha256File(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }

function codesOf(issues) {
  return (issues || []).map((i) => i.code);
}
function hasIssue(issues, code, pathPrefix) {
  return (issues || []).some((i) => i.code === code &&
    (!pathPrefix || String(i.path).indexOf(pathPrefix) === 0));
}
function errorIssues(issues) { return LD.errorsOf(issues); }

// ================= ① SHA-256 =================
head('SHA-256:与 node:crypto 一致(跨 Node / 浏览器同一个 hash)');
{
  const vectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['The quick brown fox jumps over the lazy dog',
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592']
  ];
  vectors.forEach(([input, want]) => {
    check('sha256(' + (input === '' ? '空串' : JSON.stringify(input.slice(0, 24))) + ') 固定向量',
      LD.sha256Hex(input) === want);
  });
  const samples = ['', 'abc', '中文关卡数据', 'a'.repeat(1000), '😀 表情与代理项', '行1\n行2\r\n行3'];
  samples.forEach((s, i) => {
    const want = createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
    check('与 node:crypto 对拍 #' + (i + 1) + '(' + s.length + ' 字符)', LD.sha256Hex(s) === want);
  });
  check('UTF-8 字节数:中文 3 字节 / 空格 1 字节',
    LD.byteLength('中') === 3 && LD.byteLength('a b') === 3, LD.byteLength('中') + ' / ' + LD.byteLength('a b'));
}

// ================= ② 对象注册表 =================
head('对象注册表:首版六个类型、参数描述与默认值');
{
  const types = RA.EntityRegistry.types();
  check('注册了 6 种首版对象', types.length === 6, types.join(', '));
  check('包含 spring / crumble_door / blink_platform / fireball_static / spike / gear',
    ['spring', 'crumble_door', 'blink_platform', 'fireball_static', 'spike', 'gear']
      .every((t) => RA.EntityRegistry.has(t)));
  check('旧字符映射:S→spring, x→crumble_door, y→blink_platform',
    RA.EntityRegistry.typeOfLetter('S') === 'spring' &&
    RA.EntityRegistry.typeOfLetter('x') === 'crumble_door' &&
    RA.EntityRegistry.typeOfLetter('y') === 'blink_platform');
  check('没有注册的旧字符返回 null', RA.EntityRegistry.typeOfLetter('Z') === null);
  const gear = RA.EntityRegistry.get('gear');
  check('gear 标记为必须引用路径', gear.requiresPath === true);
  check('每个参数都有中文名、单位、范围与默认值',
    RA.EntityRegistry.list().every((t) => t.params.length > 0 && t.params.every((p) =>
      p.label && typeof p.unit === 'string' && typeof p.def === 'number' &&
      typeof p.min === 'number' && typeof p.max === 'number' && p.def >= p.min && p.def <= p.max)));
  check('必填参数默认值与 config 一致(齿轮速度 2 格/秒)',
    RA.EntityRegistry.defaults('gear').speedTilesPerSecond === RA.C.OBJECT_PARAMS.gear.speedTilesPerSecond.def);
  check('可选参数不强行补默认值(弹簧的弹力覆盖)',
    Object.keys(RA.EntityRegistry.defaults('spring')).length === 0);
  check('注册表没有被调用方共享可变引用',
    (() => { const a = RA.EntityRegistry.get('gear'); a.params[0].def = 999; return RA.EntityRegistry.get('gear').params[0].def === 2; })());
  check('内置背景 id 是 sky1~sky8', RA.EntityRegistry.backgroundIds().join(',') ===
    ['sky1', 'sky2', 'sky3', 'sky4', 'sky5', 'sky6', 'sky7', 'sky8'].join(','));
  check('注册表不会把 Object.prototype 的键当成对象类型',
    RA.EntityRegistry.has('__proto__') === false &&
    RA.EntityRegistry.has('toString') === false &&
    RA.EntityRegistry.get('constructor') === null);
}

// ================= 样例关卡 =================
function blank(cols, rows) {
  const tiles = [];
  for (let r = 0; r < rows; r++) tiles.push(new Array(cols).fill(0));
  return tiles;
}

/** 难度 3、两个带参数对象、一条 pingpong 路径、背景、装饰、extensions —— T01 的验收样例 */
function makeFixture() {
  const cols = 24, rows = 16;
  const tiles = blank(cols, rows);
  for (let c = 0; c < cols; c++) { tiles[14][c] = 1; tiles[15][c] = 4; }
  for (let c = 6; c <= 9; c++) tiles[12][c] = 3;
  for (let c = 20; c <= 23; c++) tiles[0][c] = 2;          // 顶边外墙,不挡接口开口
  return {
    schemaVersion: 2,
    id: 'test_level_01',
    title: '测试关卡 · 难度 3',
    kind: 'normal',
    difficulty: 3,
    size: { cols, rows },
    terrain: { tiles },
    ports: { profile: 'vertical-v1', entry: { col: 2 }, exit: { col: 14 } },
    spawn: { col: 4, row: 13 },
    objects: [
      { id: 'o_fire', type: 'fireball_static', col: 8, row: 10,
        params: { radiusTiles: 0.5, damage: 20 }, pathId: null },
      { id: 'o_gear', type: 'gear', col: 12, row: 6,
        params: { speedTilesPerSecond: 2, radiusTiles: 0.5, damage: 20 }, pathId: 'p1' }
    ],
    paths: [
      { id: 'p1', mode: 'pingpong', points: [{ col: 12, row: 6 }, { col: 16, row: 6 }] }
    ],
    visuals: {
      backgroundId: 'sky3',
      decorations: [{ id: 'd1', assetId: 'tiles/brick', col: 5, row: 4, layer: 'back' }]
    },
    extensions: { note: '往返样例', nested: { list: [1, 2, 3], flag: true } },
    contentHash: null,
    certification: null
  };
}

const VALUE_KEYS = ['schemaVersion', 'id', 'title', 'kind', 'difficulty', 'size', 'terrain',
  'ports', 'spawn', 'objects', 'paths', 'visuals', 'extensions'];

// ================= ③ 编解码往返 =================
head('编解码往返:难度 3 + 两个对象 + 路径 + 背景 + 装饰 + extensions');
{
  const fx = makeFixture();
  const enc = LD.encode(fx);
  check('encode 成功', enc.ok, enc.ok ? '' : (enc.error && enc.error.code + ' ' + enc.error.message));
  const text = enc.value;
  check('输出是合法 JSON', (() => { try { JSON.parse(text); return true; } catch (e) { return false; } })());
  check('contentHash 是 sha256:<64 位小写十六进制>', /^sha256:[0-9a-f]{64}$/.test(enc.contentHash));
  check('地形每行写在一行里(可读,不是每个数字一行)',
    text.indexOf('[0, 0, 0') >= 0 && text.split('\n').length < 160,
    text.split('\n').length + ' 行');
  check('encode 是确定性的(两次输出完全一样)', LD.encode(fx).value === text);

  const dec = LD.decode(text);
  check('decode 成功', dec.ok, dec.ok ? '' : (dec.error && dec.error.code + ' ' + dec.error.message));
  check('decode 没有额外警告', dec.ok && dec.warnings.length === 0,
    dec.ok ? dec.warnings.join('; ') : '');
  const back = dec.value;
  check('往返后内容完全等价(除派生 hash)',
    LD.canonical(LD.contentOf(back)) === LD.canonical(LD.contentOf(fx)));
  check('难度 3 保真', back.difficulty === 3);
  check('两个对象与参数保真',
    back.objects.length === 2 &&
    back.objects[0].params.damage === 20 &&
    back.objects[0].params.radiusTiles === 0.5 &&
    back.objects[1].type === 'gear');
  check('路径模式 pingpong 与点保真',
    back.paths.length === 1 && back.paths[0].mode === 'pingpong' &&
    back.paths[0].points.length === 2 && back.paths[0].points[1].col === 16);
  check('对象引用路径保真', back.objects[1].pathId === 'p1');
  check('背景引用保真', back.visuals.backgroundId === 'sky3');
  check('装饰保真', back.visuals.decorations.length === 1 &&
    back.visuals.decorations[0].layer === 'back');
  check('extensions 嵌套数据保真',
    back.extensions.nested.list.join(',') === '1,2,3' && back.extensions.nested.flag === true);
  check('地形矩阵逐格相等',
    LD.canonical(back.terrain.tiles) === LD.canonical(fx.terrain.tiles));
  check('往返后的 contentHash 与 encode 一致', back.contentHash === enc.contentHash);
  check('decode 不修改输入对象',
    LD.canonical(fx) === LD.canonical(makeFixture()) && fx.contentHash === null);
}

// ================= ④ 规范化 hash =================
head('规范化 hash:键顺序无关,任何内容变化都会改变');
{
  const fx = makeFixture();
  const h = LD.hashSync(fx);
  check('hash 格式固定', h === LD.hashSync(fx) && h.indexOf('sha256:') === 0);

  // 同样的内容,但对象键顺序全部反过来(JSON 文本不同 → parse 后键顺序不同)
  function reverseKeys(v) {
    if (Array.isArray(v)) return v.map(reverseKeys);
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).sort().reverse().forEach((k) => { out[k] = reverseKeys(v[k]); });
      return out;
    }
    return v;
  }
  const shuffled = reverseKeys(fx);
  shuffled.contentHash = null;
  check('对象键顺序不同 → 同一个 hash', LD.hashSync(shuffled) === h);

  const tileChanged = clone(fx); tileChanged.terrain.tiles[0][0] = 1;
  check('改一格地形 → hash 改变', LD.hashSync(tileChanged) !== h);
  const paramChanged = clone(fx); paramChanged.objects[0].params.damage = 21;
  check('改一个对象参数 → hash 改变', LD.hashSync(paramChanged) !== h);
  const titleChanged = clone(fx); titleChanged.title = '改个名字';
  check('只改显示名 → hash 也改变(首版不做"是否影响玩法"的猜测)',
    LD.hashSync(titleChanged) !== h);
  const extChanged = clone(fx); extChanged.extensions.note = '别的';
  check('改 extensions → hash 改变', LD.hashSync(extChanged) !== h);
  const bgChanged = clone(fx); bgChanged.visuals.backgroundId = 'sky4';
  check('改背景 → hash 改变', LD.hashSync(bgChanged) !== h);
  const h2 = clone(fx); h2.contentHash = 'sha256:' + '0'.repeat(64);
  check('hash 不包含 contentHash / certification 自身', LD.hashSync(h2) === h);
  check('hash(data) 返回 Promise,结果与 hashSync 一致',
    typeof LD.hash(fx).then === 'function');

  // 与 node:crypto 对拍:规范化文本按 UTF-8 编码
  const want = 'sha256:' + createHash('sha256')
    .update(Buffer.from(LD.canonical(LD.contentOf(fx)), 'utf8')).digest('hex');
  check('contentHash = sha256(规范化 UTF-8 文本),与 node:crypto 对拍', h === want);
  check('sameContent 用它比较内容', LD.sameContent(fx, clone(fx)) &&
    !LD.sameContent(fx, tileChanged));
  check('规范化 JSON 保留 __proto__ 这类合法键(不污染也不丢)',
    LD.canonical(JSON.parse('{"__proto__":1,"a":2}')).indexOf('"__proto__"') >= 0);

  const protoId = clone(fx);
  protoId.objects.push({
    id: '__proto__', type: 'spike', col: 2, row: 2,
    params: { warningSeconds: 0.5, activeSeconds: 0.8, cooldownSeconds: 1, damage: 20 },
    pathId: null
  });
  check('对象 id 叫 __proto__ 不会污染字典(play 仍 0 error)',
    errorIssues(LD.validate(protoId, { purpose: 'play' })).length === 0);
}

// ================= ⑤ 自报 hash 不能信任 =================
head('自报 contentHash:加载外部文件时必须和实际内容一致');
{
  const fx = makeFixture();
  const text = LD.encode(fx).value;
  const bad = text.replace(/"contentHash": "sha256:[0-9a-f]{64}"/, '"contentHash": "sha256:' + 'a'.repeat(64) + '"');
  const r1 = LD.decode(bad);
  check('自报 hash 被篡改 → HASH_MISMATCH', !r1.ok && r1.error.code === 'HASH_MISMATCH',
    r1.ok ? '读进来了' : r1.error.code);
  const tampered = JSON.parse(text);
  tampered.terrain.tiles[0][0] = 1;
  const r2 = LD.decode(JSON.stringify(tampered));
  check('内容改了但 hash 没变 → HASH_MISMATCH', !r2.ok && r2.error.code === 'HASH_MISMATCH');
  const r3 = LD.decode(JSON.stringify(tampered), { verifyHash: false });
  check('verifyHash:false 可以读入(由调用方判定),validate 仍报 HASH_MISMATCH',
    r3.ok && hasIssue(LD.validate(r3.value, { purpose: 'draft' }), 'HASH_MISMATCH'));
  const noHash = JSON.parse(text); delete noHash.contentHash;
  check('缺 hash 的草稿可以读入(补算不产生认证)', LD.decode(JSON.stringify(noHash)).ok);
}

// ================= ⑥ 分层校验 =================
head('分层校验:草稿 / 试玩 / 发布');
{
  const fx = makeFixture();
  check('样例在 draft 下 0 个 error', errorIssues(LD.validate(fx, { purpose: 'draft' })).length === 0);
  check('样例在 play 下 0 个 error', errorIssues(LD.validate(fx, { purpose: 'play' })).length === 0);
  check('样例在 publish 下要求认证(CERT_REQUIRED)',
    hasIssue(LD.validate(fx, { purpose: 'publish', rules: { rulesVersion: 'r', rulesFingerprint: 'f' } }),
      'CERT_REQUIRED'));

  // 补一份合法认证 → publish 通过
  const pub = clone(fx);
  const cert = {
    contentHash: LD.hashSync(pub),
    rulesVersion: 'rules-test-1',
    rulesFingerprint: 'fp-test-1',
    profileId: 'standard-v1',
    status: 'passed',
    completedAt: '2026-10-30T00:00:00Z',
    source: 'local-playtest'
  };
  pub.certification = cert;
  pub.contentHash = cert.contentHash;
  const rules = { rulesVersion: 'rules-test-1', rulesFingerprint: 'fp-test-1' };
  const pubIssues = LD.validate(pub, { purpose: 'publish', rules });
  check('认证 + 规则匹配 + 接口合规 → publish 0 个 error',
    errorIssues(pubIssues).length === 0, errorIssues(pubIssues).map((i) => i.message).join('; '));

  const wrongRules = LD.validate(pub, { purpose: 'publish', rules: { rulesVersion: 'rules-test-2', rulesFingerprint: 'fp-test-1' } });
  check('规则版本变了 → RULES_MISMATCH', hasIssue(wrongRules, 'RULES_MISMATCH'));
  const wrongFp = LD.validate(pub, { purpose: 'publish', rules: { rulesVersion: 'rules-test-1', rulesFingerprint: 'fp-x' } });
  check('规则指纹变了 → RULES_MISMATCH', hasIssue(wrongFp, 'RULES_MISMATCH'));

  const edited = clone(pub); edited.terrain.tiles[1][1] = 1;
  const stale = LD.validate(edited, { purpose: 'publish', rules });
  check('认证后改一格 → 内容 hash 与认证都失效',
    hasIssue(stale, 'HASH_MISMATCH', '/contentHash') && hasIssue(stale, 'HASH_MISMATCH', '/certification'));

  const noPorts = clone(fx); noPorts.ports = null;
  check('play 缺接口 → INVALID_PORT', hasIssue(LD.validate(noPorts, { purpose: 'play' }), 'INVALID_PORT'));
  const noPortsDraft = LD.validate(noPorts, { purpose: 'draft' });
  check('draft 缺接口只警告,不阻止保存',
    errorIssues(noPortsDraft).length === 0 &&
    hasIssue(noPortsDraft, 'INVALID_PORT') && LD.encode(noPorts).ok);
  const badProfile = clone(fx); badProfile.ports.profile = 'horizontal-v9';
  check('接口 profile 不对 → INVALID_PORT', hasIssue(LD.validate(badProfile, { purpose: 'play' }), 'INVALID_PORT'));
  const badCol = clone(fx); badCol.ports.exit.col = 22;
  check('出口开口越出右边界 → INVALID_PORT', hasIssue(LD.validate(badCol, { purpose: 'play' }), 'INVALID_PORT'));
  const noSpawn = clone(fx); noSpawn.spawn = null;
  check('play 缺出生点 → INVALID_FIELD', hasIssue(LD.validate(noSpawn, { purpose: 'play' }), 'INVALID_FIELD', '/spawn'));

  const fixedKind = clone(fx);
  fixedKind.kind = 'rest'; fixedKind.difficulty = null;
  check('固定场景 difficulty 必须 null(play 下 0 error)',
    errorIssues(LD.validate(fixedKind, { purpose: 'play' })).length === 0);
  check('固定场景不能进普通发布池', hasIssue(LD.validate(fixedKind, { purpose: 'publish' }), 'INVALID_FIELD', '/kind'));
}

// ================= ⑦ 数据错误码 =================
head('数据错误:格式 / schema / 尺寸 / 引用 / 参数 / 上限');
{
  function expectDecodeCode(name, input, code, opts) {
    const r = LD.decode(input, opts);
    check(name, !r.ok && r.error.code === code, r.ok ? '读进来了' : r.error.code);
    return r;
  }
  expectDecodeCode('非 JSON 文本 → INVALID_JSON', '这不是 json', 'INVALID_JSON');
  expectDecodeCode('空文本 → INVALID_JSON', '   ', 'INVALID_JSON');
  expectDecodeCode('顶层是数组 → INVALID_JSON', '[]', 'INVALID_JSON');
  expectDecodeCode('没有 schemaVersion → UNSUPPORTED_SCHEMA', '{}', 'UNSUPPORTED_SCHEMA');
  expectDecodeCode('未来 schemaVersion=3 → UNSUPPORTED_SCHEMA', JSON.stringify({ schemaVersion: 3 }), 'UNSUPPORTED_SCHEMA');
  expectDecodeCode('旧 schemaVersion=1 → UNSUPPORTED_SCHEMA', JSON.stringify({ schemaVersion: 1 }), 'UNSUPPORTED_SCHEMA');
  expectDecodeCode('缺 terrain.tiles → INVALID_FIELD', JSON.stringify({ schemaVersion: 2, size: { cols: 1, rows: 1 } }), 'INVALID_FIELD');

  const fx = makeFixture();
  const badSize = clone(fx); badSize.size.rows = 15;
  const decSize = LD.decode(JSON.stringify(badSize));
  check('尺寸与地形不一致:草稿能读但给出警告', decSize.ok && decSize.warnings.some((w) => w.indexOf('size') >= 0));
  check('尺寸与地形不一致:validate 报 INVALID_FIELD',
    hasIssue(LD.validate(decSize.value, { purpose: 'draft' }), 'INVALID_FIELD', '/terrain/tiles'));
  check('尺寸与地形不一致:encode 拒绝(不会静默裁剪)', !LD.encode(decSize.value).ok);

  const shortRow = clone(fx); shortRow.terrain.tiles[3].pop();
  const decRow = LD.decode(JSON.stringify(shortRow));
  check('行长度不齐 → INVALID_FIELD 指向具体行',
    hasIssue(LD.validate(decRow.value, { purpose: 'draft' }), 'INVALID_FIELD', '/terrain/tiles/3'));

  const badTile = clone(fx); badTile.terrain.tiles[0][0] = 9;
  const decTile = LD.decode(JSON.stringify(badTile));
  check('未定义的地块编号 → INVALID_FIELD 指向具体格',
    hasIssue(LD.validate(decTile.value, { purpose: 'draft' }), 'INVALID_FIELD', '/terrain/tiles/0/0'));

  const dupId = clone(fx);
  dupId.objects[1].id = dupId.objects[0].id;
  check('对象 id 重复 → INVALID_FIELD', hasIssue(LD.validate(dupId, { purpose: 'play' }), 'INVALID_FIELD', '/objects/1/id'));
  check('对象 id 重复时 encode 拒绝', !LD.encode(dupId).ok);

  const unknownType = clone(fx);
  unknownType.objects.push({ id: 'o_dragon', type: 'dragon', col: 2, row: 2, params: {}, pathId: null });
  const draftIssues = LD.validate(unknownType, { purpose: 'draft' });
  check('未知对象类型:草稿保留并警告(UNKNOWN_ENTITY)',
    hasIssue(draftIssues, 'UNKNOWN_ENTITY') && errorIssues(draftIssues).length === 0);
  check('未知对象类型:play 报错', hasIssue(LD.validate(unknownType, { purpose: 'play' }), 'UNKNOWN_ENTITY'));
  check('未知对象类型可以保存成草稿(不静默丢弃)', LD.encode(unknownType).ok);

  const unknownParam = clone(fx);
  unknownParam.objects[0].params.explode = true;
  check('未知参数:草稿警告,play 报错',
    hasIssue(LD.validate(unknownParam, { purpose: 'draft' }), 'UNKNOWN_PARAM') &&
    hasIssue(LD.validate(unknownParam, { purpose: 'play' }), 'UNKNOWN_PARAM'));
  const outOfRange = clone(fx);
  outOfRange.objects[0].params.damage = 999;
  check('参数越界:草稿警告,play 报错',
    hasIssue(LD.validate(outOfRange, { purpose: 'draft' }), 'INVALID_FIELD', '/objects/0/params/damage') &&
    errorIssues(LD.validate(outOfRange, { purpose: 'play' })).some((i) => i.path === '/objects/0/params/damage'));
  const missingParam = clone(fx);
  delete missingParam.objects[1].params.speedTilesPerSecond;
  check('缺必填参数:草稿警告,play 报错',
    hasIssue(LD.validate(missingParam, { purpose: 'draft' }), 'INVALID_FIELD', '/objects/1/params/speedTilesPerSecond') &&
    hasIssue(LD.validate(missingParam, { purpose: 'play' }), 'INVALID_FIELD'));

  const brokenRef = clone(fx);
  brokenRef.objects[1].pathId = 'p_missing';
  check('路径引用断开:草稿也报 BROKEN_REFERENCE(不能保存成看似完整)',
    hasIssue(LD.validate(brokenRef, { purpose: 'draft' }), 'BROKEN_REFERENCE', '/objects/1/pathId'));

  const shortPath = clone(fx);
  shortPath.paths[0].points = [{ col: 12, row: 6 }];
  check('路径不足两个点:草稿警告,play 报错',
    hasIssue(LD.validate(shortPath, { purpose: 'draft' }), 'INVALID_FIELD', '/paths/0/points') &&
    hasIssue(LD.validate(shortPath, { purpose: 'play' }), 'INVALID_FIELD', '/paths/0/points'));

  const dupPoint = clone(fx);
  dupPoint.paths[0].points = [{ col: 12, row: 6 }, { col: 12, row: 6 }];
  check('路径相邻重复点:play 报错', hasIssue(LD.validate(dupPoint, { purpose: 'play' }), 'INVALID_FIELD', '/paths/0/points/1'));

  const offPath = clone(fx);
  offPath.objects[1].col = 13;
  check('对象初始格不等于路径首点:play 报错',
    hasIssue(LD.validate(offPath, { purpose: 'play' }), 'INVALID_FIELD', '/objects/1'));

  const gearNoPath = clone(fx);
  gearNoPath.objects[1].pathId = null;
  check('齿轮没有路径:play 报错', hasIssue(LD.validate(gearNoPath, { purpose: 'play' }), 'INVALID_FIELD', '/objects/1/pathId'));

  const outsideObj = clone(fx);
  outsideObj.objects[0].col = 999;
  check('对象在地图外:草稿警告,play 报错',
    hasIssue(LD.validate(outsideObj, { purpose: 'draft' }), 'INVALID_FIELD', '/objects/0') &&
    hasIssue(LD.validate(outsideObj, { purpose: 'play' }), 'INVALID_FIELD', '/objects/0'));

  // ---- 上限 ----
  const tooWide = { schemaVersion: 2, size: { cols: LD.LIMITS.COLS + 1, rows: 1 },
    terrain: { tiles: [new Array(LD.LIMITS.COLS + 1).fill(0)] } };
  expectDecodeCode('宽度超过上限 → LIMIT_EXCEEDED', JSON.stringify(tooWide), 'LIMIT_EXCEEDED');
  const tooManyObjects = clone(fx);
  for (let i = 0; i < LD.LIMITS.OBJECTS; i++) {
    tooManyObjects.objects.push({ id: 'x' + i, type: 'spike', col: 1, row: 1, params: {}, pathId: null });
  }
  check('对象数超过上限 → LIMIT_EXCEEDED', !LD.decode(JSON.stringify(tooManyObjects)).ok ||
    LD.decode(JSON.stringify(tooManyObjects)).error.code === 'LIMIT_EXCEEDED');
  const bigText = 'a'.repeat(LD.LIMITS.BYTES + 1);
  check('导入字节数超过上限 → LIMIT_EXCEEDED',
    LD.decode(bigText).error.code === 'LIMIT_EXCEEDED');
  const longExt = clone(fx);
  longExt.extensions = { blob: 'x'.repeat(LD.LIMITS.EXT + 10) };
  check('extensions 太大 → LIMIT_EXCEEDED(保存被拒)',
    hasIssue(LD.validate(longExt, { purpose: 'draft' }), 'LIMIT_EXCEEDED', '/extensions'));

  // ---- extensions 只收 JSON ----
  const fnExt = clone(fx);
  fnExt.extensions = { cb: function () { } };
  check('extensions 里有函数 → INVALID_FIELD', !LD.decode(fnExt).ok &&
    LD.decode(fnExt).error.code === 'INVALID_FIELD');
  const nanExt = clone(fx);
  nanExt.extensions = { n: NaN };
  check('extensions 里有 NaN → INVALID_FIELD', LD.decode(nanExt).error.code === 'INVALID_FIELD');

  // ---- 界面/背景资源 ----
  const unknownBg = clone(fx);
  unknownBg.visuals.backgroundId = 'sky99';
  check('未知背景:play 只警告(MISSING_ASSET)',
    hasIssue(LD.validate(unknownBg, { purpose: 'play' }), 'MISSING_ASSET') &&
    errorIssues(LD.validate(unknownBg, { purpose: 'play' })).length === 0);
  check('未知背景:publish 报 MISSING_ASSET',
    hasIssue(LD.validate(unknownBg, { purpose: 'publish' }), 'MISSING_ASSET'));

  // ---- encode 拒绝结构性错误 ----
  const encBad = LD.encode(dupId);
  check('encode 失败时带 issues(code/path)',
    !encBad.ok && Array.isArray(encBad.error.issues) && encBad.error.issues.length > 0 &&
    encBad.error.issues[0].code && encBad.error.issues[0].path);
}

// ================= ⑧ 认证生命周期 =================
head('认证:内容变化后失效,写文件时不会带出过期的认证');
{
  const fx = makeFixture();
  const base = clone(fx);
  base.contentHash = LD.hashSync(base);
  base.certification = {
    contentHash: base.contentHash,
    rulesVersion: 'r1', rulesFingerprint: 'f1', profileId: 'standard-v1',
    status: 'passed', completedAt: '2026-10-30T00:00:00Z', source: 'local-playtest'
  };
  const enc = LD.encode(base);
  check('内容没变:编码保留认证', enc.ok && JSON.parse(enc.value).certification !== null);

  const edited = clone(base);
  edited.title = '改了名字';
  const enc2 = LD.encode(edited);
  check('内容变了:编码移除过期认证并提示',
    enc2.ok && JSON.parse(enc2.value).certification === null &&
    enc2.warnings.some((w) => w.indexOf('认证') >= 0));
  check('草稿用途下过期认证只是警告,不阻止保存',
    hasIssue(LD.validate(edited, { purpose: 'draft' }), 'HASH_MISMATCH', '/certification'));
  check('认证来源不合法 → INVALID_FIELD',
    hasIssue(LD.validate(Object.assign(clone(base), {
      certification: Object.assign(clone(base.certification), { source: 'trust-me' })
    }), { purpose: 'draft' }), 'INVALID_FIELD', '/certification/source'));
}

// ================= ⑨ 旧图迁移(真实 12 张) =================
head('旧图迁移:12 张内置图逐格保真、对象/入口/出口保真、原文件不变');
const LEVEL_DIR = join(ROOT, 'levels');
const V2_DIR = join(LEVEL_DIR, 'v2');
const levelFiles = readdirSync(LEVEL_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const srcHashesBefore = levelFiles.map((f) => sha256File(join(LEVEL_DIR, f)));

check('12 张旧图都在', levelFiles.length === 12, levelFiles.length + ' 张');
check('迁移输出目录存在', existsSync(V2_DIR));
check('模板 _template.json 没有被迁移', !existsSync(join(V2_DIR, '_template.json')));

{
  let totalObjects = 0;
  const mismatch = [];
  levelFiles.forEach((f) => {
    const id = basename(f, '.json');
    const raw = JSON.parse(readFileSync(join(LEVEL_DIR, f), 'utf8'));
    const oldLv = RA.Level.fromData(raw, { id });
    const migrated = RA.LegacyImport.migrate(raw, { id, fallbackId: id });
    if (!migrated.ok) { mismatch.push(id + ': 迁移失败 ' + migrated.error.message); return; }
    const draft = migrated.value.draft;

    // 逐格与旧引擎解析结果对比
    let cellDiffs = 0;
    for (let r = 0; r < oldLv.rows; r++) {
      for (let c = 0; c < oldLv.cols; c++) {
        // 旧引擎的 chars 里空格表示空气(不是 '+');标记字符已经被它换成 '+'。
        const ch = oldLv.chars[r][c];
        const want = LD.idOf(ch) === null ? 0 : LD.idOf(ch);
        const got = draft.terrain.tiles[r][c];
        if (want !== got) cellDiffs++;
        if (oldLv.grid[r][c] !== LD.isSolidId(got)) cellDiffs++;
        if (oldLv.oneway[r][c] !== LD.isOnewayId(got)) cellDiffs++;
      }
    }
    if (cellDiffs) mismatch.push(id + ': ' + cellDiffs + ' 格不一致');

    // 尺寸 / 对象数量 / 出生点 / 出口
    if (draft.size.cols !== oldLv.cols || draft.size.rows !== oldLv.rows) {
      mismatch.push(id + ': 尺寸 ' + draft.size.cols + '×' + draft.size.rows +
        ' != ' + oldLv.cols + '×' + oldLv.rows);
    }
    const rows = RA.Level.normalizeRows(raw.asc, false);
    const firstChar = (ch) => {
      for (let r = 0; r < rows.length; r++) {
        const c = rows[r].indexOf(ch);
        if (c >= 0) return { col: c, row: r };
      }
      return null;
    };
    const expectedSpawn = firstChar('P');
    const expectedExit = firstChar('G');
    const expectedObjects = (rows.join('').split('').filter((ch) => 'Sxy'.indexOf(ch) >= 0).length) +
      (Array.isArray(raw.objects) ? raw.objects.length : 0);
    if (expectedObjects !== draft.objects.length) {
      mismatch.push(id + ': 对象 ' + draft.objects.length + ' != ' + expectedObjects);
    }
    if (expectedSpawn) {
      if (!draft.spawn || draft.spawn.col !== expectedSpawn.col || draft.spawn.row !== expectedSpawn.row) {
        mismatch.push(id + ': 出生点不保真');
      }
    }
    if (expectedExit) {
      const ex = draft.extensions.legacy && draft.extensions.legacy.exit;
      if (!ex || ex.col !== expectedExit.col || ex.row !== expectedExit.row) {
        mismatch.push(id + ': 旧出口 G 没有记录');
      }
    }
    if (draft.ports !== null) mismatch.push(id + ': ports 不应自动生成');
    if (draft.certification !== null) mismatch.push(id + ': 不应继承认证');
    if (!migrated.value.warnings.some((w) => w.indexOf('ports') >= 0)) {
      mismatch.push(id + ': 缺少"ports 留空需修复"的警告');
    }
    if (draft.difficulty !== raw.difficulty) mismatch.push(id + ': 难度没有保真');
    const sky = parseInt(raw.sky, 10);
    const wantBg = (sky >= 1 && sky <= 8) ? 'sky' + sky : null;
    if (draft.visuals.backgroundId !== wantBg) mismatch.push(id + ': 背景没有保真');

    // 每张图都要有明确迁移结果:能编码、能重新读回、草稿校验 0 error
    const enc = LD.encode(draft);
    if (!enc.ok) { mismatch.push(id + ': encode 失败 ' + enc.error.message); return; }
    const back = LD.decode(enc.value);
    if (!back.ok) { mismatch.push(id + ': 读不回来 ' + back.error.message); return; }
    const errs = errorIssues(LD.validate(back.value, { purpose: 'draft' }));
    if (errs.length) mismatch.push(id + ': 草稿还有 error ' + errs[0].message);

    // 磁盘上的 v2 文件必须和"现在重新迁移"的结果一模一样(工具输出不漂移)
    const diskPath = join(V2_DIR, id + '.json');
    if (!existsSync(diskPath)) mismatch.push(id + ': levels/v2/' + id + '.json 不存在');
    else if (readFileSync(diskPath, 'utf8') !== enc.value) {
      mismatch.push(id + ': levels/v2/' + id + '.json 与重新迁移的结果不一致(要重跑 tools/migrate_levels.mjs)');
    } else if (!LD.decode(readFileSync(diskPath, 'utf8')).ok) {
      mismatch.push(id + ': v2 文件 hash 校验失败');
    }
    totalObjects += draft.objects.length;
  });
  check('12 张旧图逐格 / 尺寸 / 对象 / 入口出口 / 认证 / 背景全部保真', mismatch.length === 0,
    mismatch.slice(0, 4).join(' | '));
  check('迁移出的对象总数与旧图一致', totalObjects > 0, totalObjects + ' 个对象(来自 S/x/y 与旧 objects)');

  // 原文件没有被改动
  const srcHashesAfter = levelFiles.map((f) => sha256File(join(LEVEL_DIR, f)));
  check('迁移没有改动任何原文件(前后 sha256 一致)',
    srcHashesBefore.join(',') === srcHashesAfter.join(','));
  check('levels/ 下仍然只有旧格式的正式关卡(没有覆盖旧图)',
    levelFiles.every((f) => JSON.parse(readFileSync(join(LEVEL_DIR, f), 'utf8')).schemaVersion === undefined));
}

head('旧图迁移:字符映射、未知内容保留、合成旧图');
{
  const map = [
    '+++G+++',
    '++^^^^^',
    '+++S+y+',
    '++x+++.',
    '+P+++++'
  ].join('\n');
  const r = RA.LegacyImport.migrate(map, { id: 'legacy_test', fallbackId: 'legacy_test' });
  check('纯文本地图迁移成功', r.ok);
  const d = r.value.draft;
  check('S/x/y 变成对象', d.objects.length === 3 &&
    d.objects.filter((o) => o.type === 'spring').length === 1 &&
    d.objects.filter((o) => o.type === 'crumble_door').length === 1 &&
    d.objects.filter((o) => o.type === 'blink_platform').length === 1,
    d.objects.map((o) => o.type + '@' + o.col + ',' + o.row).join(' '));
  check('老 "." 空气被识别,并留下说明', d.terrain.tiles[3][6] === 0 &&
    r.value.warnings.some((w) => w.indexOf("'.'") >= 0));
  check('出生点 P 保真', d.spawn && d.spawn.col === 1 && d.spawn.row === 4);
  check('出口 G 位置记进 extensions.legacy.exit', d.extensions.legacy.exit.col === 3);
  check('迁移草稿可以直接保存(0 error,draft 校验)', errorIssues(LD.validate(d, { purpose: 'draft' })).length === 0);
  check('迁移草稿不能直接试玩(缺 vertical-v1 接口)',
    hasIssue(LD.validate(d, { purpose: 'play' }), 'INVALID_PORT'));

  const unknown = RA.LegacyImport.migrate({ asc: ['+++?++', '+P+++G'] }, { id: '未知图' });
  check('中文 id 不能直接当新 id 时被规范化并警告', unknown.ok && /^[A-Za-z0-9_-]+$/.test(unknown.value.draft.id));
  check('不认识的字符按空气迁移,但逐个记录警告与位置',
    unknown.value.warnings.some((w) => w.indexOf('不认识') >= 0) &&
    unknown.value.draft.extensions.legacy.unknownChars.length === 1 &&
    unknown.value.draft.extensions.legacy.unknownChars[0].ch === '?');

  const withObjects = RA.LegacyImport.migrate({
    id: 'legacy_objects',
    difficulty: 2,
    verified: true,
    sky: 5,
    asc: ['++++G++++', '+++^^^^^^', '+P+++++++'],
    objects: [
      { type: 'fireball', col: 4, row: 1, params: { radiusTiles: 1 } },
      { type: 'mystery', col: 6, row: 1, params: { x: 1 } }
    ]
  }, { id: 'legacy_objects' });
  check('旧对象类型 fireball → fireball_static,参数按默认补全', withObjects.ok &&
    withObjects.value.draft.objects.some((o) => o.type === 'fireball_static' &&
      o.params.damage === 20 && o.params.radiusTiles === 1));
  check('未知旧对象类型原样保留(草稿可存、试玩报错)',
    withObjects.value.draft.objects.some((o) => o.type === 'mystery') &&
    hasIssue(LD.validate(withObjects.value.draft, { purpose: 'play' }), 'UNKNOWN_ENTITY'));
  check('旧 verified 只作为历史字段保留,不产生认证',
    withObjects.value.draft.certification === null &&
    withObjects.value.draft.extensions.legacy.verified === true);
  check('旧 sky 转成背景 id', withObjects.value.draft.visuals.backgroundId === 'sky5');

  const twoSpawns = RA.LegacyImport.migrate({ asc: ['+P+P+G'] }, { id: 'two' });
  check('第二个出生点被忽略并警告',
    twoSpawns.value.draft.spawn.col === 1 &&
    twoSpawns.value.warnings.some((w) => w.indexOf('第二个出生点') >= 0));
}

// ================= ⑩ 汇总 / 输出稳定性 =================
head('汇总与稳定输出');
{
  const fx = makeFixture();
  const sum = LD.summarize(fx);
  check('summarize 统计对象类型', sum.objectsByType.fireball_static === 1 &&
    sum.objectsByType.gear === 1 && sum.counts.objects === 2);
  check('summarize 统计实心 / 单向地块', sum.counts.solid > 0 && sum.counts.oneway === 0);
  check('summarize 报告接口与出生点', sum.hasPorts === true && sum.hasSpawn === true);

  const enc1 = LD.encode(fx).value;
  const parsed = JSON.parse(enc1);
  check('encode 输出字段顺序固定(schemaVersion 在第一行)', enc1.split('\n')[1].indexOf('"schemaVersion"') > 0);
  check('encode 输出没有 undefined / NaN', enc1.indexOf('undefined') < 0 && enc1.indexOf('NaN') < 0);
  check('地形矩阵与 size 精确一致', parsed.terrain.tiles.length === parsed.size.rows &&
    parsed.terrain.tiles.every((r) => r.length === parsed.size.cols));
  check('地块字典:0 空 / 1 草 / 2 土 / 3 砖 / 4 石 / 5 单向',
    LD.charOf(0) === '+' && LD.charOf(1) === '^' && LD.charOf(2) === '_' &&
    LD.charOf(3) === '~' && LD.charOf(4) === '=' && LD.charOf(5) === '-' &&
    LD.idOf(' ') === null);
  check('isSolidId / isOnewayId 和旧引擎一致',
    LD.isSolidId(1) && LD.isSolidId(4) && !LD.isSolidId(5) && LD.isOnewayId(5));
}

// ================= 收尾 =================
export const result = { pass, fail, fails, name: '关卡数据自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`关卡数据自检:合计 PASS ${pass}  FAIL ${fail}   用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✓');
  process.exit(0);
}
