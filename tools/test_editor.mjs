#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * test_editor.mjs —— T02A:编辑器完整 LevelData 模型与 JSON 往返
 * ============================================================
 *     node tools/test_editor.mjs
 *
 * 测试分三层:
 *   ① 纯模型:EditorModel 以一份 LevelData 为唯一真值(没有第二份 cells);
 *      画笔字符只在边界转换;对象/出生点/元信息/未知字段都留在数据里。
 *   ② 界面:在 DOM 替身里真的起一个编辑器,模拟鼠标画一笔、撤销/重做、
 *      改尺寸、导入导出;检查旧的 TXT / 保存到游戏链路确实不在界面上。
 *   ③ 文件:演示 JSON 能被打开、导出、重新打开,内容逐项保真。
 *
 * 旧的 TXT 导出 / 「保存到游戏」改池测试已被替换:目标契约是 JSON + 独立文件,
 * 不再给浏览器旧池写 TXT。画图/撤销/缩放等交互回归仍然保留。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeCanvas, loadEditor, ROOT, EDITOR_SCRIPTS } from './loader.mjs';

const t0 = Date.now();
const RA = loadEditor();
const LD = RA.LevelData;
const C = RA.C;
const AIR = RA.EMPTY_CHARS[0];
const TS = C.TS;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }
const clone = (v) => JSON.parse(JSON.stringify(v));
const demoPath = join(ROOT, 'levels/demo/t02a-demo.json');
const demoText = readFileSync(demoPath, 'utf8');
const demoData = JSON.parse(demoText);

const board = makeCanvas(900, 600);
board.clientWidth = 900;
board.clientHeight = 600;

// ================= ① 调色板 =================
head('调色板:地块与已注册机关,不再有出口 G 画笔');
{
  const items = RA.EditorPalette.build();
  const chars = items.map((i) => i.ch);
  check('有空气笔刷', chars.indexOf(AIR) >= 0);
  check('五种地块都在调色板里', ['^', '_', '~', '=', '-'].every((ch) => chars.indexOf(ch) >= 0));
  check('出生点 P 在调色板里', chars.indexOf('P') >= 0);
  check('已注册的机关 S / x / y 都在调色板里',
    ['S', 'x', 'y'].every((ch) => chars.indexOf(ch) >= 0));
  check('出口 G 不再是画笔', chars.indexOf('G') < 0 && RA.EditorPalette.known('G') === false);
  check('机关名字来自 EntityRegistry',
    items.filter((i) => i.ch === 'x')[0].name.indexOf(RA.EntityRegistry.get('crumble_door').name) === 0);
  check('调色板里的对象笔刷带 type', items.filter((i) => i.ch === 'S')[0].type === 'spring');
  check('没有字母的注册对象(火球/地刺/齿轮)不冒充画笔',
    !items.some((i) => i.type === 'fireball_static' || i.type === 'gear'));
  check('调色板图标都画得出来', (() => {
    try {
      items.forEach((it) => {
        const cv = makeCanvas(38, 38);
        const ctx = cv.getContext('2d');
        if (it.kind === 'object') {
          const cls = RA.BY_LETTER[it.ch];
          cls.prototype.drawIcon(ctx, 0, 0, 38);
        }
      });
      return true;
    } catch (e) { return false; }
  })());
}

// ================= ② 模型基础 =================
head('模型:一份 LevelData 真值,地形 / 出生点 / 对象 / 元信息');
{
  const m = RA.EditorModel.create({ cols: 10, rows: 8, title: '模型测试' });
  check('新建有合法 id', /^[A-Za-z0-9_-]+$/.test(m.id), m.id);
  check('新建尺寸 / 标题 / 难度 / 接口', m.cols === 10 && m.rows === 8 &&
    m.title === '模型测试' && m.difficulty === 1 && m.data.ports === null);
  check('模型没有第二份 cells 真值', m.cells === undefined && m.data.terrain.tiles.length === 8);
  check('getTile 界外返回空气', m.getTile(-1, 0) === 0 && m.getTile(0, 99) === 0);
  check('setTile 改的是唯一地形真值', m.setTile(2, 3, 3) === true &&
    m.getTile(2, 3) === 3 && m.data.terrain.tiles[3][2] === 3);
  check('setTile 拒绝非法地块编号', m.setTile(2, 3, 9) === false && m.getTile(2, 3) === 3);
  m.setSpawn(4, 5);
  check('出生点是显式数据', m.spawn && m.spawn.col === 4 && m.spawn.row === 5 &&
    m.getChar(4, 5) === 'P');
  const obj = m.placeObject('spring', 6, 2);
  check('placeObject 生成唯一 id 与默认参数', obj.ok && obj.value.id === 'spring_1' &&
    obj.value.type === 'spring' && m.data.objects.length === 1);
  const obj2 = m.placeObject('spring', 7, 2);
  check('同类型对象 id 递增', obj2.ok && obj2.value.id === 'spring_2');
  check('对象格子的地形是空的', m.getTile(6, 2) === 0);
  check('未注册类型不能放', m.placeObject('dragon', 1, 1).error.code === 'UNKNOWN_ENTITY');
  check('改标题不改变逻辑 id', (() => {
    const before = m.id;
    m.setTitle('新标题');
    return m.title === '新标题' && m.id === before;
  })());
  check('setId 校验格式 / 长度', m.setId('bad id!') === false && m.setId('good_id') === true &&
    m.id === 'good_id');
  check('难度只接受 1~4', m.setDifficulty(3) === true && m.setDifficulty(5) === false &&
    m.difficulty === 3);
  check('背景只接受内置 id 或 null', m.setBackground('sky4') === true &&
    m.backgroundId === 'sky4' && m.setBackground('sky99') === false &&
    m.setBackground(null) === true && m.backgroundId === null);
  check('groundBelow 找到地面 / 没有地面返回 null',
    (() => {
      const g = RA.EditorModel.create({ cols: 4, rows: 4 });
      g.setTile(1, 3, 1);
      return g.groundBelow(1, 0) === 3 && g.groundBelow(2, 0) === null;
    })());
  check('worldW / worldH 按 45px', m.worldW() === m.cols * TS && m.worldH() === m.rows * TS);
}

// ================= ③ 画笔映射 =================
head('画笔:字符只是边界适配,写进数据的仍然是 LevelData');
{
  const m = RA.EditorModel.create({ cols: 8, rows: 6 });
  check('地块字符 → 整数地块', m.applyChar(1, 1, '=') === true && m.getTile(1, 1) === 4);
  check('P → spawn,且每层只有一个', m.applyChar(2, 2, 'P') === true &&
    m.spawn.col === 2 && m.spawn.row === 2 &&
    m.applyChar(3, 2, 'P') === true && m.spawn.col === 3 &&
    m.data.spawn !== null);
  check('S → spring 对象(默认参数)', m.applyChar(4, 2, 'S') === true &&
    m.objects.length === 1 && m.objects[0].type === 'spring' &&
    JSON.stringify(m.objects[0].params) === '{}');
  m.applyChar(1, 2, 'x');
  m.applyChar(2, 4, 'y');
  const blink = m.objects.filter((o) => o.type === 'blink_platform')[0];
  check('x / y 映射到 crumble_door / blink_platform,并带注册默认参数',
    m.objects.some((o) => o.type === 'crumble_door') && !!blink &&
    blink.params.warningSeconds === RA.C.OBJECT_PARAMS.blink_platform.warningSeconds.def);
  check('对象格子上不能再有地形/出生点', m.getTile(4, 2) === 0 &&
    !(m.spawn.col === 4 && m.spawn.row === 2));
  check('橡皮擦掉地形、对象和出生点', (() => {
    m.applyChar(1, 1, AIR);
    m.applyChar(4, 2, AIR);
    m.applyChar(3, 2, AIR);
    return m.getTile(1, 1) === 0 && !m.objects.some((o) => o.col === 4 && o.row === 2) &&
      m.data.spawn === null;
  })());
  check('往对象格上画地块会移除对象', (() => {
    m.applyChar(5, 3, 'S');
    m.applyChar(5, 3, '~');
    return m.getTile(5, 3) === 3 && !m.objects.some((o) => o.col === 5 && o.row === 3);
  })());
  check('G 不能画(出口是 ports,不是字符)', m.applyChar(6, 1, 'G') === false &&
    m.applyChar(6, 2, 'Q') === false);
  check('界外画笔不生效', m.applyChar(-1, 0, '^') === false);

  // 对象上的未知字段被保留:模型不重建对象
  const m2 = RA.EditorModel.fromJSON(demoText).value;
  const unknown = m2.objects.filter((o) => o.type === 'future_enemy')[0];
  check('未知对象的额外字段与断引用都还在模型里',
    unknown.behavior.keep === 'author-data' && unknown.priority === 3 &&
    unknown.pathId === 'missing_route');
  check('未知对象的 getChar 返回 null(画笔不能取它,但位置保留)',
    m2.getChar(unknown.col, unknown.row) === null);
}

// ================= ④ 批量绘制 / 检查 =================
head('矩形 / 油漆桶 / 吸管与共用校验');
{
  const m = RA.EditorModel.create({ cols: 10, rows: 10 });
  m.fillRect(1, 1, 3, 3, '=');
  check('fillRect 填一片', m.getTile(1, 1) === 4 && m.getTile(3, 3) === 4 &&
    m.getTile(4, 4) === 0);
  const n = m.floodFill(1, 1, '~');
  check('floodFill 只换连成一片的', n === 9 && m.getTile(2, 2) === 3 &&
    m.getTile(5, 5) === 0);
  check('findChar 走的是画笔显示层', m.findChar('~').length === 9);

  const v = RA.EditorModel.create({ cols: 6, rows: 6 }).validate();
  check('新空关卡的检查:缺接口是提醒,不是硬错误', v.errors.length === 0 &&
    v.warnings.some((w) => w.indexOf('INVALID_PORT') >= 0), v.warnings.join(' | '));
  const g = RA.EditorModel.create({ cols: 8, rows: 6, withGround: true });
  const gv = g.validate();
  check('带地面新建:出生点贴地,没有"下面没地面"的提醒',
    gv.warnings.every((w) => w.indexOf('出生点下面') < 0));
  check('检查里报告 id / 难度 / 背景 / 接口状态',
    gv.notes.some((x) => x.indexOf('id: ') >= 0) &&
    gv.notes.some((x) => x.indexOf('ports=null') >= 0));
  const demoModel = RA.EditorModel.fromJSON(demoText).value;
  const dv = demoModel.validate();
  check('演示 JSON 的草稿校验 0 个 error', dv.errors.length === 0, dv.errors.join(' | '));
  check('演示 JSON 的未知对象与断引用以提醒出现',
    dv.warnings.some((w) => w.indexOf('UNKNOWN_ENTITY') >= 0) &&
    dv.warnings.some((w) => w.indexOf('BROKEN_REFERENCE') >= 0));
  const legacyModel = RA.EditorModel.fromLegacy(
    { id: 'legacy_check', asc: ['+++G+++', '++^^^^^', '+P+++++'] },
    { id: 'legacy_check' }).value;
  check('迁移草稿的检查里出现旧出口 G 的说明',
    legacyModel.validate().notes.some((x) => x.indexOf('旧出口 G') >= 0));
  const emptyTitle = RA.EditorModel.create({ cols: 4, rows: 4 });
  emptyTitle.setTitle('');
  check('空标题只是提醒,不阻塞导出', emptyTitle.validate().warnings.some(
    (w) => w.indexOf('标题为空') >= 0) && emptyTitle.toJSON().ok);
}

// ================= ⑤ JSON 往返 =================
head('JSON 往返:元信息 / 对象 / 路线 / 未知字段全保真');
{
  const res = RA.EditorModel.fromJSON(demoText);
  check('演示 JSON 能打开', res.ok, res.ok ? '' : res.error.code);
  const m = res.value;
  check('难度 3 / 标题 / 背景保真', m.difficulty === 3 && m.title === 'T02A 演示关卡' &&
    m.backgroundId === 'sky3');
  check('两个参数对象 + 未知对象都在', m.objects.length === 3 &&
    m.objects.some((o) => o.type === 'fireball_static') &&
    m.objects.some((o) => o.type === 'gear' && o.pathId === 'p1'));
  check('pingpong 路线与点保真', m.paths.length === 1 && m.paths[0].mode === 'pingpong' &&
    m.paths[0].points.length === 2 && m.paths[0].points[1].col === 12);
  check('路线上的未知字段保留(label)', m.paths[0].label === '往返巡逻');
  check('装饰与扩展字段保留', m.data.visuals.decorations[0].opacity === 0.8 &&
    m.data.extensions.authorNote === '未认证演示草稿');
  check('toData 返回深复制,不暴露内部引用', (() => {
    const copy = m.toData();
    copy.objects[0].params.damage = 999;
    return m.objects[0].params.damage === 20;
  })());

  const enc = m.toJSON();
  check('模型能导出 JSON', enc.ok, enc.ok ? '' : enc.error.code);
  const reopened = RA.EditorModel.fromJSON(enc.value);
  check('导出后能重新打开', reopened.ok);
  check('重开后内容等价(除派生 hash)', reopened.ok &&
    LD.canonical(LD.contentOf(reopened.value.data)) === LD.canonical(LD.contentOf(m.data)));
  check('重开后未知对象字段仍在',
    reopened.ok && reopened.value.objects.filter((o) => o.type === 'future_enemy')[0]
      .behavior.keep === 'author-data');

  // 打开 JSON → 改地形 → 导出 → 重开:只有目标格与派生字段变化
  const before = clone(m.toData());
  m.setTile(1, 1, 2);
  const enc2 = m.toJSON();
  const back2 = RA.EditorModel.fromJSON(enc2.value).value;
  const a = clone(before); const b = clone(back2.toData());
  a.terrain.tiles[1][1] = 2;
  check('改一格后只有目标地形与派生 hash 变化',
    LD.canonical(LD.contentOf(back2.data)) === LD.canonical(LD.contentOf(a)) &&
    before.terrain.tiles[1][1] !== b.terrain.tiles[1][1]);
  check('导出会写入新的 contentHash', /^sha256:[0-9a-f]{64}$/.test(JSON.parse(enc2.value).contentHash));

  const future = JSON.stringify({ schemaVersion: 3, terrain: { tiles: [[0]] } });
  check('未来 schema 被拒绝,不降级',
    RA.EditorModel.fromJSON(future).error.code === 'UNSUPPORTED_SCHEMA');
  check('坏 JSON 被拒绝', RA.EditorModel.fromJSON('{nope').error.code === 'INVALID_JSON');
}

// ================= ⑥ 旧图迁移 =================
head('旧 TXT / 旧 JSON:只作为迁移入口');
{
  const text = ['// name: 旧图测试', '++++++++G', '++^^^+++', '+++S+x+y', '+P++++++'].join('\n');
  const res = RA.EditorModel.fromLegacy(text, { id: 'legacy_editor', fallbackId: 'legacy_editor' });
  check('旧图能迁移成模型', res.ok, res.ok ? '' : res.error.message);
  const m = res.value;
  check('迁移后保留标题 / 出生点', m.title === '旧图测试' && m.spawn &&
    m.spawn.col === 1 && m.spawn.row === 3);
  check('S / x / y 变成对象', m.objects.length === 3 &&
    m.objects.some((o) => o.type === 'spring') &&
    m.objects.some((o) => o.type === 'crumble_door' || o.type === 'blink_platform'));
  check('迁移草稿 ports=null 且带警告', m.data.ports === null && m.importWarnings.length > 0);
  check('迁移后仍能导出 JSON', m.toJSON().ok);
  check('迁移不会把旧 verified 当认证', m.data.certification === null);
  check('垃圾旧图不会被当成合法数据',
    RA.EditorModel.fromLegacy('', { id: 'x' }).ok === false);
}

// ================= ⑦ 尺寸 / 平移 =================
head('改尺寸与扩展:显式确认、整次提交、可撤销');
{
  const m = RA.EditorModel.fromJSON(demoText).value;
  const before = LD.canonical(m.toData());
  const impact = m.resizeImpact(8, 8);
  check('缩小影响能提前统计', impact.tiles > 0 && impact.objects > 0 && impact.total > 0,
    JSON.stringify(impact));
  const refused = m.resize(8, 8);
  check('未确认的缩小被拒绝(NEEDS_CONFIRM)且零变更',
    !refused.ok && refused.error.code === 'NEEDS_CONFIRM' &&
    LD.canonical(m.toData()) === before);
  const grown = m.grow(2, 0, 1, 0);
  check('向左/上扩展成功', grown.ok && m.cols === 18 && m.rows === 13);
  check('扩展后地形整体平移', m.getTile(7, 8) === demoData.terrain.tiles[7][5] &&
    m.getTile(5, 7) === demoData.terrain.tiles[6][3]);
  check('扩展后对象 / 路线 / 出生点 / 装饰 / 接口 col 一起平移', (() => {
    const gear = m.objects.filter((o) => o.type === 'gear')[0];
    const spawn = m.spawn;
    const deco = m.data.visuals.decorations[0];
    return gear.col === 11 && gear.row === 7 &&
      spawn.col === 4 && spawn.row === 10 &&
      m.paths[0].points[0].col === 11 &&
      deco.col === 3 && deco.row === 3;
  })(), JSON.stringify(m.spawn));
  check('extensions.legacy 的历史坐标不被改写', (() => {
    m.data.extensions.legacy = { exit: { col: 13, row: 0 } };
    m.grow(1, 0, 0, 0);
    return m.data.extensions.legacy.exit.col === 13;
  })());
  check('扩展超出契约上限会失败', (() => {
    const big = RA.EditorModel.create({ cols: 600, rows: 10 });
    return big.grow(1, 0, 0, 0).error.code === 'LIMIT_EXCEEDED';
  })());
  const m3 = RA.EditorModel.fromJSON(demoText).value;
  const okResize = m3.resize(8, 8, { allowLoss: true });
  check('确认后的缩小会裁掉界外内容', okResize.ok && m3.cols === 8 && m3.rows === 8 &&
    m3.objects.every((o) => o.col < 8 && o.row < 8) &&
    m3.paths.every((p) => p.points.every((pt) => pt.col < 8 && pt.row < 8)));
}

// ================= ⑧ 界面:画图 / 撤销 / 重做 =================
head('界面:模拟鼠标画图、撤销/重做整份数据');
let ed = null;
try {
  ed = new RA.Editor(board);
  check('编辑器能起来', !!ed);
} catch (e) {
  check('编辑器能起来', false, (e && e.message) + '\n' + (e && e.stack));
}

if (ed) {
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      ed.update(1 / 60);
      ed.draw();
      ed.input.endFrame();
    }
  };
  const toScreen = (c, r) => {
    const p = ed.cellToScreen(c, r);
    return { x: p.x + TS * ed.view.zoom / 2, y: p.y + TS * ed.view.zoom / 2 };
  };
  const mouseAt = (c, r) => { ed.input.mouse = toScreen(c, r); ed.input.mouse.outside = false; };
  const press = () => { ed.input.buttons[0] = true; };
  const release = () => { ed.input.buttons[0] = false; };
  const clickCell = (c, r) => { mouseAt(c, r); press(); step(); release(); step(); };

  ed.newLevel(12, 10, false);
  ed.fitView();
  ed.selectChar('^');
  clickCell(3, 5);
  check('按住左键真的画了一格', ed.model.getTile(3, 5) === 1, 'tile ' + ed.model.getTile(3, 5));
  mouseAt(3, 5); press(); step(); mouseAt(7, 5); step(); release(); step();
  check('拖动时中间不断(Bresenham 补格)',
    [3, 4, 5, 6, 7].every((c) => ed.model.getTile(c, 5) === 1));
  check('画图会标 dirty', ed.dirty === true);

  ed.undo();
  check('撤销把这一笔整段收回去', ed.model.getTile(5, 5) === 0);
  ed.redo();
  check('重做又回来', ed.model.getTile(5, 5) === 1);

  ed.setTool('erase');
  clickCell(5, 5);
  check('橡皮能擦掉', ed.model.getTile(5, 5) === 0);
  ed.setTool('brush');

  ed.setBrush(3);
  ed.selectChar('=');
  clickCell(2, 8);
  let block = true;
  for (let r = 7; r <= 9; r++) for (let c = 1; c <= 3; c++) if (ed.model.getTile(c, r) !== 4) block = false;
  check('笔刷 3 会画 3×3 一块', block);
  ed.setBrush(1);

  ed.setTool('rect');
  ed.selectChar('~');
  mouseAt(6, 7); press(); step(); mouseAt(9, 9); step(); release(); step();
  check('矩形工具填出一整块',
    ed.model.getTile(6, 7) === 3 && ed.model.getTile(9, 9) === 3 &&
    ed.model.getTile(5, 7) === 0);

  ed.setTool('fill');
  ed.selectChar('_');
  clickCell(7, 8);
  check('油漆桶把连成一片的都换掉',
    ed.model.getTile(6, 7) === 2 && ed.model.getTile(9, 9) === 2);

  ed.setTool('pick');
  clickCell(6, 7);
  check('吸管取到地块并切回画笔', ed.ch === '_' && ed.tool === 'brush');

  const cols0 = ed.model.cols;
  ed.setTool('brush');
  ed.selectChar('^');
  clickCell(cols0 + 2, 2);
  check('画到界外会自动扩展地图', ed.model.cols > cols0 && ed.model.getTile(cols0 + 2, 2) === 1);

  // 对象画笔 + 撤销覆盖对象
  ed.newLevel(10, 8, true);
  ed.fitView();
  ed.selectChar('S');
  clickCell(4, 4);
  check('对象画笔放下 spring', ed.model.objects.length === 1 &&
    ed.model.objects[0].type === 'spring');
  ed.undo();
  check('撤销把对象一起收回', ed.model.objects.length === 0);
  ed.redo();
  check('重做把对象放回来', ed.model.objects.length === 1);

  // 标题 / 难度 / 背景的撤销
  const t0 = ed.model.title;
  ed.$('name').value = '改过的标题';
  ed.$('name').dispatch('input');
  ed.$('name').dispatch('change');
  check('标题输入写进模型', ed.model.title === '改过的标题');
  ed.undo();
  check('撤销恢复旧标题', ed.model.title === t0);
  ed.redo();
  check('重做恢复新标题', ed.model.title === '改过的标题');

  const d0 = ed.model.difficulty;
  ed.$('difficulty-select').value = '3';
  ed.$('difficulty-select').dispatch('change');
  check('难度选择写进模型', ed.model.difficulty === 3);
  ed.undo();
  check('撤销恢复旧难度', ed.model.difficulty === d0);

  ed.$('sky-select').value = 'sky4';
  ed.$('sky-select').dispatch('change');
  check('背景选择写进 visuals.backgroundId', ed.model.backgroundId === 'sky4');
  ed.undo();
  check('撤销恢复背景', ed.model.backgroundId === null);

  // 历史预算:100 步
  ed.newLevel(4, 4, false);
  ed.selectChar('^');
  clickCell(0, 0);
  for (let i = 0; i < 105; i++) ed.pushUndo();
  check('撤销栈按 100 步预算淘汰旧的', ed.undoStack.length === 100, String(ed.undoStack.length));
  check('历史按字节计数', ed.undoBytes > 0);

  // 导出 / 复制 / 查看
  const blobs0 = globalThis.__RA_BLOBS__.length;
  check('导出 JSON 成功', ed.downloadJSON() === true);
  check('导出产出 Blob 且内容是 LevelData JSON',
    globalThis.__RA_BLOBS__.length === blobs0 + 1 &&
    JSON.parse(globalThis.__RA_BLOBS__[blobs0].text).schemaVersion === 2);
  check('导出不清 dirty(只表示已发起)', ed.dirty === true);
  ed.copyJSON();
  check('复制 JSON 走剪贴板', globalThis.__RA_CLIPBOARD__.length > 0 &&
    JSON.parse(globalThis.__RA_CLIPBOARD__[globalThis.__RA_CLIPBOARD__.length - 1]).id === ed.model.id);
  ed.showJSON();
  check('查看 JSON 把内容塞进文本框',
    ed.$('modal-text').value.indexOf('"schemaVersion": 2') >= 0);
  ed.closeModal();

  // 旧链路确实不在界面上
  check('没有「保存到游戏 / 下载 txt」方法',
    typeof ed.saveToFolder === 'undefined' && typeof ed.applyToGamePool === 'undefined' &&
    typeof ed.download === 'undefined' && typeof ed.exportText === 'undefined' &&
    typeof ed.copyText === 'undefined');
  check('试玩入口明确禁用并解释,不转旧 TXT',
    ed.openPlaytest() === false && ed.msg.indexOf('T03') >= 0);
  check('新格式试玩不会打开新标签页',
    (() => { const n = globalThis.__OPENED__ ? globalThis.__OPENED__.length : 0; ed.openPlaytest(); return (globalThis.__OPENED__ ? globalThis.__OPENED__.length : 0) === n; })());
}

// ================= ⑨ 导入界面 / 失败不改图 =================
head('打开 JSON / 导入旧图:失败不替换当前图');
if (ed) {
  ed.newLevel(6, 6, false);
  const before = LD.canonical(ed.model.toData());
  check('坏 JSON 打开失败且不替换当前图',
    ed.openJSONText('{oops') === false && LD.canonical(ed.model.toData()) === before);
  check('未来 schema 打开失败且不替换当前图',
    ed.openJSONText(JSON.stringify({ schemaVersion: 3 })) === false &&
    LD.canonical(ed.model.toData()) === before);
  check('打开演示 JSON 成功', ed.openJSONText(demoText, 'demo.json') === true &&
    ed.model.id === 't02a_demo');
  check('打开后历史清空', ed.undoStack.length === 0);
  check('打开后未知对象仍在', ed.model.objects.some((o) => o.type === 'future_enemy'));
  check('导入旧图成功并保留警告', ed.importLegacyText(
    ['// name: 导入测试', '+++G++', '+P++++'].join('\n'),
    { id: 'import_test' }) === true && ed.model.importWarnings.length > 0);

  // 从内置关卡打开:只读副本
  ed.$('pool-select').value = Object.keys(RA.LEVEL_TEXT)[0];
  const poolId = ed.$('pool-select').value;
  check('打开内置关卡副本成功', ed.openFromPool() !== false && ed.model.id === poolId);
  check('内置副本 ports=null、带迁移警告', ed.model.data.ports === null &&
    ed.model.importWarnings.length > 0);

  // 尺寸:取消零变更,确认后可撤销
  const origCols = ed.model.cols;
  const origRows = ed.model.rows;
  const bigBefore = LD.canonical(ed.model.toData());
  const savedConfirm = globalThis.confirm;
  globalThis.confirm = () => false;
  const undoLen = ed.undoStack.length;
  check('取消缩小:模型与撤销栈都不变',
    ed.changeSize(2, 2) === false && LD.canonical(ed.model.toData()) === bigBefore &&
    ed.undoStack.length === undoLen);
  globalThis.confirm = () => true;
  const grew = ed.changeSize(origCols + 2, origRows + 1);
  check('确认后改尺寸成功且可撤销', grew === true && ed.model.cols === origCols + 2);
  ed.undo();
  check('撤销回到改尺寸之前', ed.model.cols === origCols && ed.model.rows === origRows);
  globalThis.confirm = savedConfirm;
}

// ================= ⑩ 认证失效 / 演示文件 =================
head('认证失效与演示 JSON');
{
  const data = clone(demoData);
  data.contentHash = LD.hashSync(data);
  data.certification = {
    contentHash: data.contentHash,
    rulesVersion: 'demo-rules',
    rulesFingerprint: 'demo-fp',
    profileId: 'standard-v1',
    status: 'passed',
    completedAt: '2026-10-31T08:00:00Z',
    source: 'local-playtest'
  };
  const res = RA.EditorModel.fromData(data);
  check('带合法认证的草稿能打开', res.ok && res.value.data.certification !== null);
  const m = res.value;
  m.setTile(0, 0, 1);
  check('第一次编辑立即清除认证与旧 hash',
    m.data.certification === null && m.data.contentHash === null);
  check('编辑后导出的 JSON 不带认证', (() => {
    const enc = m.toJSON();
    return enc.ok && JSON.parse(enc.value).certification === null;
  })());
  check('导出不会改写输入对象', (() => {
    const src = clone(demoData);
    const snapshot = LD.canonical(src);
    const opened = RA.EditorModel.fromData(src).value;
    opened.toJSON();
    return LD.canonical(src) === snapshot;
  })());
  check('打开模型不会和输入共享地形数组', (() => {
    const src = clone(demoData);
    const opened = RA.EditorModel.fromData(src).value;
    opened.setTile(0, 0, 1);
    return src.terrain.tiles[0][0] === 0;
  })());

  // undo 不恢复旧通关资格
  const ed2 = new RA.Editor(board);
  ed2.replaceModel(RA.EditorModel.fromData(clone(data)).value);
  ed2.pushUndo();
  ed2.model.setTile(0, 0, 2);
  ed2.undo();
  check('undo 不恢复旧认证(首版保守策略)', ed2.model.data.certification === null);

  check('演示 JSON 文件存在且在 levels/demo/', existsSync(demoPath));
  const dec = LD.decode(demoText);
  check('演示 JSON 是合法 v2 且自报 hash 匹配', dec.ok);
  check('演示 JSON 有难度 3 / 两个参数对象 / pingpong 路线 / 未知对象',
    dec.value.difficulty === 3 && dec.value.objects.length >= 3 &&
    dec.value.paths[0].mode === 'pingpong' &&
    dec.value.objects.some((o) => o.type === 'future_enemy'));
  check('演示 JSON 未认证、接口待修复(ports=null)',
    dec.value.certification === null && dec.value.ports === null);
}

// ================= ⑪ 页面接线 =================
head('页面接线:editor.html 的 id / 脚本与 editor.js 对得上');
{
  const html = readFileSync(join(ROOT, 'editor.html'), 'utf8');
  const src = readFileSync(join(ROOT, 'js/editor.js'), 'utf8');
  const ids = new Set();
  for (const m of src.matchAll(/\.\$\('([^']+)'\)/g)) ids.add(m[1]);
  for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) ids.add(m[1]);
  const missing = [...ids].filter((id) => html.indexOf('id="' + id + '"') < 0);
  check('editor.js 用到的 id 在 editor.html 里都有', missing.length === 0, missing.join(','));
  check('抓到的 id 数合理', ids.size > 20, String(ids.size));

  const scripts = [];
  for (const m of html.matchAll(/<script\s+src="([^"]+)"/g)) scripts.push(m[1]);
  check('editor.html 的脚本顺序 = 引擎 + editor.js',
    scripts.join(',') === EDITOR_SCRIPTS.join(','),
    scripts.length + ' vs ' + EDITOR_SCRIPTS.length);
  check('编辑器脚本存在 js/editor.js',
    scripts[scripts.length - 1] === 'js/editor.js');

  check('页面不再有旧 TXT / 保存到游戏控件',
    html.indexOf('btn-save-folder') < 0 && html.indexOf('btn-download') < 0 &&
    html.indexOf('chk-autosave') < 0 && html.indexOf('btn-pick-folder') < 0 &&
    html.indexOf('btn-forget-folder') < 0 && html.indexOf('btn-view-text') < 0);
  check('页面不再写「保存到游戏 / 下载 txt」',
    html.indexOf('保存到游戏') < 0 && html.indexOf('下载 txt') < 0);
  check('代码里不再调用旧 TXT 导出/旧池',
    src.indexOf('applyToGamePool') < 0 && src.indexOf('toText(') < 0 &&
    src.indexOf('LevelFolder') < 0 && src.indexOf('putOverride') < 0);
  check('导出入口与草稿占位都在页面上',
    html.indexOf('id="btn-export"') >= 0 && html.indexOf('id="btn-import-legacy"') >= 0 &&
    html.indexOf('id="btn-draft"') >= 0 && html.indexOf('disabled') >= 0);
  check('演示 JSON 在文档目录里被引用', (() => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    return readme.indexOf('levels/demo/t02a-demo.json') >= 0;
  })());
}

// ================= 收尾 =================
export const result = { pass, fail, fails, name: '编辑器自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`编辑器自检:合计 PASS ${pass}  FAIL ${fail}  用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✓');
  process.exit(0);
}
