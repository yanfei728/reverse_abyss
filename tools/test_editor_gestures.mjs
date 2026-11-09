#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_editor_gestures.mjs —— 19号卡：端点鼠标标记、裁剪坐标/安全包络、直角齿轮路径
 * 只测模型/控制器/共享几何;浏览器真实鼠标由 browser_editor19 单独验证。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { loadEditor, ROOT } from './loader.mjs';

const RA = loadEditor();
const LD = RA.LevelData, PG = RA.PathGeometry;
let pass = 0, fail = 0;
const fails = [];
const clone = (v) => JSON.parse(JSON.stringify(v));
function check(name, fn) {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; fails.push(name); console.log('  FAIL  ' + name + '    ' + (e && e.message)); }
}
function stubEditor(model) {
  const e = Object.create(RA.Editor.prototype);
  e.model = model; e.undoStack = []; e.redoStack = []; e.undoBytes = 0; e.redoBytes = 0;
  e.selection = null; e.portMark = null; e.gearGesture = null;
  e.dirty = false; e.consumeUntilRelease = false;
  e.say = () => {}; e.markDirty = () => { e.dirty = true; }; e.syncUI = () => {};
  e.pushUndo = () => { const json = JSON.stringify(model.toData()); e.undoStack.push({ json: json, bytes: json.length }); e.undoBytes += json.length; e.redoStack = []; e.redoBytes = 0; };
  e.popUndo = () => { const old = e.undoStack.pop(); if (old) e.undoBytes -= old.bytes; };
  e.snapshotJSON = () => JSON.stringify(model.toData());
  e.$ = (id) => ({ value: id === 'gear-mode' ? 'pingpong' : '' });
  e.setTool = (t) => { e.tool = t; e.stroke = null; };
  return e;
}

console.log('19 编辑器手势/路径');
check('单点路径合法,play 不报至少两点', () => {
  const m = stubEditor(RA.EditorModel.create({ cols: 10, rows: 10 }).model || RA.EditorModel.create({ cols: 10, rows: 10 }));
  const d = RA.EditorModel.fromData(RA.B4_SAMPLES.normal1).value;
  d.data.paths = [{ id: 'p', mode: 'pingpong', points: [{ col: 3, row: 10 }] }];
  d.data.objects = [{ id: 'g', type: 'gear', col: 3, row: 10, pathId: 'p', params: RA.EntityRegistry.defaults('gear') }];
  d.data.contentHash = null;
  assert.equal(LD.errorsOf(LD.validate(d.data, { purpose: 'play' })).length, 0);
});
check('直角追加:不同行列自动 L,斜段被校验拒绝', () => {
  const a = PG.appendOrthogonal([{ col: 3, row: 5 }], { col: 8, row: 9 });
  assert.equal(a.ok, true);
  assert.equal(a.value.points.length, 3);
  assert.equal(a.value.points[1].col, 8); assert.equal(a.value.points[1].row, 5);
  const bad = { mode: 'pingpong', points: [{ col: 3, row: 5 }, { col: 8, row: 9 }] };
  assert.ok(PG.validate(bad).length > 0);
});
check('闭合矩形保留4角/末首段,两点退化环拒绝', () => {
  const pts = [{ col: 3, row: 5 }, { col: 8, row: 5 }, { col: 8, row: 9 }, { col: 3, row: 9 }];
  const c = PG.closeOrthogonal(pts);
  assert.equal(c.ok, true); assert.equal(c.value.points.length, 4);
  const v = PG.validate({ mode: 'loop', points: pts }); assert.equal(v.length, 0);
  assert.equal(PG.closeOrthogonal([{ col: 1, row: 1 }, { col: 4, row: 1 }]).ok, false);
});
check('路径 compile/sample:往返/闭合不瞬移,单点静止', () => {
  const one = { mode: 'pingpong', points: [{ col: 2, row: 2 }] };
  assert.equal(PG.compile(one).ok, true);
  const rect = { mode: 'loop', points: [{ col: 3, row: 5 }, { col: 8, row: 5 }, { col: 8, row: 9 }, { col: 3, row: 9 }] };
  const c = PG.compile(rect); assert.equal(c.ok, true);
  const s = PG.sample(c.value, c.value.totalTiles - 0.01);
  assert.ok(s.col >= 3 && s.col <= 8 && s.row >= 5 && s.row <= 9);
});
check('裁剪候选带 beforeHash,应用后端点坐标从模型刷新', () => {
  const model = RA.EditorModel.fromData(RA.B4_SAMPLES.normal1).value;
  const p = model.cropCandidate(); assert.equal(p.ok, true);
  assert.ok(p.value.beforeHash);
  const before = LD.hashSync(model.toData());
  assert.equal(model.applyCrop(p.value).ok, true);
  assert.equal(model.data.ports.finish.row, 0);
  assert.notEqual(LD.hashSync(model.toData()), before);
});
check('安全包络:大半径对象/路径扫掠/未知对象', () => {
  const d = RA.EditorModel.create({ cols: 20, rows: 20 });
  d.data.objects = [{ id: 'f', type: 'fireball_static', col: 2, row: 2, params: { radiusTiles: 3 } }];
  assert.equal(d.contentBounds().col <= 0, true);
  d.data.objects = [{ id: 'u', type: 'future_enemy', col: 2, row: 2 }];
  const p = d.cropCandidate(); assert.equal(p.ok, false); assert.equal(p.error.code, 'CROP_UNKNOWN');
});
check('裁剪后旧selection不参与标记:控制器只用portMark anchor', () => {
  const model = RA.EditorModel.fromData(RA.B4_SAMPLES.normal1).value;
  const crop = model.cropCandidate(); assert.equal(crop.ok, true); model.applyCrop(crop.value);
  const e = stubEditor(model);
  e.selection = { c0: 15, r0: 7, c1: 16, r1: 7 };
  e.portMark = { role: 'finish', anchor: { col: 15, row: 0 }, valid: true };
  assert.equal(e.applyCloudEndpoint('finish'), true);
  assert.equal(model.data.ports.finish.row, 0);
  assert.equal(model.data.ports.finish.col, 15);
});
check('齿轮首点放置/追加/右键完成:单点静止,重复不生成零段', () => {
  const m = RA.EditorModel.create({ cols: 20, rows: 20 });
  const e = stubEditor(m);
  const undo0 = e.undoStack.length;
  assert.equal(e.beginGearGesture({ c: 3, r: 5 }), true);
  assert.equal(m.objects.length, 1); assert.equal(m.paths.length, 1);
  assert.equal(m.paths[0].points.length, 1);
  assert.equal(e.appendGearNode({ c: 8, r: 5 }), true);
  assert.equal(m.paths[0].points.length, 2);
  assert.equal(e.appendGearNode({ c: 8, r: 5 }), false);
  assert.equal(e.finishGearGesture(), true);
  assert.equal(e.gearGesture, null);
  // 一次画完只留一条撤销
  assert.equal(e.undoStack.length, undo0 + 1);
  assert.equal(e.consumeUntilRelease, true);
});
check('齿轮取消:零残留、dirty/撤销恢复,不影响之前操作', () => {
  const m = RA.EditorModel.create({ cols: 20, rows: 20 });
  const e = stubEditor(m);
  // 之前的一次用户操作(留一条撤销)
  e.pushUndo();
  m.data.title = 'before-gear';
  m.invalidate(); e.markDirty();
  const before = {
    hash: LD.hashSync(m.toData()), objs: m.data.objects.length, paths: m.data.paths.length,
    dirty: e.dirty, undo: e.undoStack.length, title: m.data.title
  };
  assert.equal(e.beginGearGesture({ c: 3, r: 5 }), true);
  assert.equal(e.model.data.objects.length, before.objs + 1);
  assert.equal(e.cancelGearGesture(), true);
  // 取消后控制器换成了"开始前"的模型,e.model 才是当前真值
  assert.equal(e.model.data.objects.length, before.objs, '不能留下齿轮');
  assert.equal(e.model.data.paths.length, before.paths, '不能留下路径');
  assert.equal(e.dirty, before.dirty, 'dirty 要回到开始前');
  assert.equal(e.undoStack.length, before.undo, '不能弹掉之前的撤销');
  assert.equal(LD.hashSync(e.model.toData()), before.hash, '内容要回到开始前');
  assert.equal(e.model.data.title, before.title);
  assert.equal(e.consumeUntilRelease, true, '同一次左键按下不能再放齿轮');
  // 取消后还能撤销之前那一步
  e.undo();
  assert.equal(e.undoStack.length, before.undo - 1);
});
check('标记自动选云板并消费左键至松手', () => {
  const m = RA.EditorModel.fromData(RA.B4_SAMPLES.normal1).value;
  const e = stubEditor(m);
  e.ch = '='; e.brush = 5;
  assert.equal(e.beginPortMark('start'), true);
  assert.equal(e.ch, '-'); assert.equal(e.brush, 1);
  e.portMark = { role: 'start', anchor: { col: 2, row: 22 }, valid: true };
  const tiles = JSON.stringify(m.data.terrain.tiles);
  assert.equal(e.commitPortMark(), true);
  assert.equal(e.consumeUntilRelease, true);
  assert.equal(JSON.stringify(m.data.terrain.tiles), tiles);
  assert.equal(m.data.ports.start.col, 2);
});
check('标记非法点击不改地形/端点', () => {
  const m = RA.EditorModel.fromData(RA.B4_SAMPLES.normal1).value;
  const e = stubEditor(m);
  e.portMark = { role: 'start', anchor: { col: 2, row: 22 }, valid: false, reason: 'bad' };
  const h = LD.hashSync(m.toData());
  assert.equal(e.commitPortMark(), false);
  assert.equal(LD.hashSync(m.toData()), h);
});

check('旧开发/标准/短塔页只跳 index,不再加载旧控制器', () => {
  for (const f of ['devplay.html', 'standard.html', 'short.html', 'legacy.html']) {
    const h = readFileSync(join(ROOT, f), 'utf8');
    assert.equal(/url=index\.html/.test(h), true, f + ' 缺 index 跳转');
    assert.equal(h.indexOf('js/devplay.js') < 0 && h.indexOf('js/standard.js') < 0 && h.indexOf('js/short.js') < 0, true, f + ' 仍加载旧控制器');
  }
});
check('路径规则进入 LevelData play 校验', () => {
  const d = RA.EditorModel.create({ cols: 10, rows: 10 });
  d.data.paths = [{ id: 'p', mode: 'pingpong', points: [{ col: 2, row: 2 }, { col: 5, row: 6 }] }];
  d.data.objects = [{ id: 'g', type: 'gear', col: 2, row: 2, pathId: 'p', params: RA.EntityRegistry.defaults('gear') }];
  assert.ok(LD.errorsOf(LD.validate(d.data, { purpose: 'play' })).length > 0);
});

console.log('\n19 编辑器手势自检:合计 PASS ' + pass + '  FAIL ' + fail);
export const result = { pass, fail, fails };
if (process.argv[1] && /test_editor_gestures\.mjs$/.test(process.argv[1])) process.exit(fail ? 1 : 0);
