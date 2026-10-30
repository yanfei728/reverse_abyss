#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * test_editor.mjs —— 关卡编辑器的自检
 * ====================================
 *     node tools/test_editor.mjs
 *
 * 编辑器是给人点着用的,没法在命令行里真的拿鼠标画 —— 所以这里两头夹:
 *   · 数据模型(EditorModel)是纯逻辑,直接调 set / fillRect / toText / validate 走一遍;
 *   · 界面(Editor)在 DOM 替身里真的起一个,把鼠标按住、拖动、松开,
 *     看格子有没有真的变、撤销能不能回去、"保存到游戏"有没有写文件 / 记进关卡池。
 *   · 最后再验一遍"调色板是从引擎推导的":临时往引擎里塞一种新地块和一个新实体,
 *     调色板里必须自动多出这两个笔刷 —— 这就是"以后加的地物也能画"的保证。
 *   · 还有试玩页(play.html):编辑器给出的那一层,在试玩页里必须玩得起来、
 *     通关/按 Esc 之后能重开,也能回编辑器。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  makeCanvas, loadEditor, buildPack, ROOT, EDITOR_SCRIPTS, PLAYTEST_SCRIPTS
} from './loader.mjs';

/** 试玩页的脚本(引擎 + js/playtest.js)按浏览器里的顺序跑一遍 */
function vmRunPlaytest(RA) {
  if (RA.Playtest) return RA;
  globalThis.RA_PLAYTEST_NO_BOOT = true;
  vm.runInThisContext(readFileSync(join(ROOT, 'js/playtest.js'), 'utf8'),
    { filename: 'js/playtest.js' });
  return RA;
}

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }

const RA = loadEditor();
const C = RA.C;
const AIR = RA.EMPTY_CHARS[0];
const TS = C.TS;
const board = makeCanvas(900, 600);
board.clientWidth = 900;
board.clientHeight = 600;
const ctx = board.getContext('2d');

// ================= ① 调色板:从引擎推导 =================
head('调色板:所有地物都是从引擎的字符表推出来的');
{
  const items = RA.EditorPalette.build();
  const chars = items.map((i) => i.ch);
  check('有"空气"这一项', chars.indexOf(AIR) >= 0);
  check('每一种地块都在调色板里(' + Object.keys(RA.TILE_IMAGES).join('') + ')',
    Object.keys(RA.TILE_IMAGES).every((ch) => chars.indexOf(ch) >= 0));
  check('单向云板也能从调色板里选(它是地块,虽然不实心)',
    chars.indexOf('-') >= 0 && RA.isOnewayChar('-') &&
    RA.EditorPalette.known('-') === true);
  check('起点标记在调色板里(' + RA.SPAWN_CHARS + ')',
    RA.SPAWN_CHARS.split('').every((ch) => chars.indexOf(ch) >= 0));
  check('所有注册的地物都在调色板里(' + Object.keys(RA.BY_LETTER).join('') + ')',
    Object.keys(RA.BY_LETTER).every((ch) => chars.indexOf(ch) >= 0));
  check('出口和弹簧板都能在调色板里认出来',
    items.some((i) => i.cls === RA.Goal) && items.some((i) => i.cls === RA.Spring));

  // 新加的两样机关:调色板里自动出现,而且卡片的图标画得出来
  const ghostItem = items.filter((i) => i.ch === 'x')[0];
  const blinkItem = items.filter((i) => i.ch === 'y')[0];
  check('「触之即散(x)」自动出现在调色板里,名字用的是它自己的 NAME',
    !!ghostItem && ghostItem.cls === RA.Ghost &&
    String(ghostItem.name).indexOf(RA.Ghost.NAME) === 0,
    ghostItem ? ghostItem.name : '没找到');
  check('「浮石(y)」自动出现在调色板里,名字用的是它自己的 NAME',
    !!blinkItem && blinkItem.cls === RA.Blink &&
    String(blinkItem.name).indexOf(RA.Blink.NAME) === 0,
    blinkItem ? blinkItem.name : '没找到');
  check('这两个的图标画得出来(自己写的 drawIcon 不抛异常)', (() => {
    try {
      const cv = makeCanvas(38, 38);
      const c2 = cv.getContext('2d');
      RA.Ghost.prototype.drawIcon(c2, 0, 0, 38);
      RA.Blink.prototype.drawIcon(c2, 0, 0, 38);
      return true;
    } catch (e) { return false; }
  })());

  // —— 关键:以后加的东西也必须自动出现 ——
  // 注意:这里是**临时**往引擎里塞地块,所以要把原来的表存下来、用完原样恢复。
  // (别用 Object.keys(TILE_IMAGES).join('') 重新推导:那会把单向云板也算进"实心"。)
  const savedSolid = RA.SOLID_CHARS;
  RA.TILE_IMAGES['%'] = ['tiles/sand', '沙地'];
  RA.SOLID_CHARS = RA.SOLID_CHARS + '%';      // 沙地是实心的
  class Coin extends RA.Entity { }
  Coin.letter = 'c';
  Coin.NAME = '金币';
  RA.register(Coin);
  const items2 = RA.EditorPalette.build();
  const chars2 = items2.map((i) => i.ch);
  check('临时加一种新地块(沙地 %)之后,调色板自动多出它',
    chars2.indexOf('%') >= 0);
  check('临时加一个新实体(金币 c)之后,调色板自动多出它',
    chars2.indexOf('c') >= 0);
  check('新实体的名字显示的是它自己的 NAME', 
    items2.filter((i) => i.ch === 'c')[0].name.indexOf('金币') === 0);
  check('模型校验认识新地物(新实体不算"不认识的字符")',
    new RA.EditorModel(3, 3).cells.length === 3);
  check('默认的 drawIcon 对新实体也能画(不用自己写图标)',
    typeof Coin.prototype.drawIcon === 'function');

  // 复原,免得影响后面的用例(云板那几条也会读 RA.SOLID_CHARS)
  delete RA.TILE_IMAGES['%'];
  RA.SOLID_CHARS = savedSolid;
  delete RA.BY_LETTER['c'];
}

// ================= ② 数据模型 =================
head('模型:画、擦、缩放、导出、检查');
{
  const m = new RA.EditorModel(15, 24, '测试层');
  check('新建出来是空的、尺寸对', m.cols === 15 && m.rows === 24 &&
    m.cells.every((row) => row.every((ch) => ch === AIR)));

  m.set(2, 3, '^');
  check('set / get 能用', m.get(2, 3) === '^');
  check('界外的 get 返回空气、set 不生效',
    m.get(-1, 0) === AIR && m.set(99, 0, '^') === false);

  // 自动扩展
  const grew = m.grow(2, 3, 4, 1);          // grow(左, 右, 上, 下)
  check('往上/往左撑大可以', grew && m.cols === 20 && m.rows === 29,
    m.cols + '×' + m.rows);
  check('撑大以后原来的内容跟着挪(坐标补偿正确)', m.get(2 + 2, 3 + 4) === '^');

  const m2 = new RA.EditorModel(5, 5);
  m2.grow(0, 5, 0, 0);
  check('往右撑大', m2.cols === 10);
  check('setSize 能改小(外面的内容被裁掉)', m2.setSize(4, 4) && m2.cols === 4 && m2.rows === 4);

  const m5 = new RA.EditorModel(4, 4);
  check('ensure 能把界外的点整个包进来(左上和右下都算)',
    m5.ensure(-2, 5) === true && m5.cols === 6 && m5.rows === 6,
    m5.cols + '×' + m5.rows);

  // 高度不限
  const tall = new RA.EditorModel(10, 20000);
  check('模型能建两万行的关卡(高度没有上限)', tall.rows === 20000 && tall.cells.length === 20000);
  check('往上画还能继续长高', tall.ensure(2, 20050) === true && tall.rows === 20051,
    '现在 ' + tall.rows + ' 行');
  check('宽度仍然有上限', tall.ensure(9999, 0) === false && tall.cols === 10);

  // 矩形 / 油漆桶
  const m3 = new RA.EditorModel(10, 10);
  m3.fillRect(1, 1, 3, 3, '=');
  check('fillRect 填一片', m3.get(1, 1) === '=' && m3.get(3, 3) === '=' && m3.get(4, 4) === AIR);
  m3.fillRect(4, 4, 6, 6, '=');
  check('两片之间还连着(4,1 是空气)', m3.get(4, 1) === AIR);
  const n = m3.floodFill(1, 1, '~');
  check('floodFill 只换连成一片的', n === 9 && m3.get(5, 5) === '=');
  check('findChar 能找到所有同字符的格子', m3.findChar('~').length === 9);
  check('groundBelow 找得到下面的地面',
    m3.groundBelow(1, 0) === 1 && m3.groundBelow(9, 0) === null);
  const mCloud = new RA.EditorModel(6, 6, '云板测试');
  mCloud.set(2, 2, '-');                       // set(行, 列)
  check('编辑器也认云板当"地面"(起点/出口落到它上面是合理的)',
    mCloud.groundBelow(2, 0) === 2);           // 注意:编辑器这个是 groundBelow(列, 行)
  const vCloud = mCloud.validate();
  check('云板不会被编辑器当成"不认识的字符"',
    vCloud.warnings.concat(vCloud.notes).join(' ').indexOf('不认识') < 0 &&
    mCloud.toText().indexOf('-') >= 0);

  // 导出 / 读回
  m3.name = '折返测试';
  m3.header = ['// name: 老名字', '// 这是作者写的注释,导出时要留着'];
  const text = m3.toText();
  check('导出里用的是新名字(改掉原来那行)',
    text.indexOf('// name: 折返测试') >= 0 && text.indexOf('老名字') < 0);
  check('导出里留着原来的注释', text.indexOf('作者写的注释') >= 0);
  const back = RA.EditorModel.fromText(text, 'x');
  check('导出 → 读回:名字一样', back.name === '折返测试');
  check('导出 → 读回:尺寸一样(行尾空气被裁掉后宽度可能变小,内容不能变)',
    back.get(1, 1) === '~' && back.get(5, 5) === '=' && back.get(0, 0) === AIR);
  check('导出 → 读回 → 再导出:两次一模一样',
    back.toText() === text, text === back.toText() ? '' : JSON.stringify([text, back.toText()]));

  const m4 = RA.EditorModel.fromText('// name: 老写法\n+++\n+.+\n+++\n', 'x');
  check("老地图的 '.' 会被当成空气读进来", m4.get(1, 1) === AIR);

  // 元信息: // sky: N(这一层固定用哪张天空贴图)
  const ms = new RA.EditorModel(10, 6, '天空测试');
  check('默认没有 // sky 这一行', ms.getMeta('sky') === '');
  ms.setMeta('sky', '4');
  check('setMeta 之后读得回来', ms.getMeta('sky') === '4');
  check('导出里带着 // sky: 4', ms.toText().indexOf('// sky: 4') >= 0);
  const msBack = RA.EditorModel.fromText(ms.toText(), 'x');
  check('导出 → 读回,元信息还在', msBack.getMeta('sky') === '4');
  msBack.setMeta('sky', '6');
  check('再改是替换同一行,不会多出一行',
    msBack.toText().split('// sky:').length === 2,
    msBack.toText().split('// sky:').length + ' 行');
  check('引擎也认这个值', RA.Level.fromText(msBack.toText(), {}).sky === 6);
  msBack.removeMeta('sky');
  check('removeMeta 删掉之后引擎回到自动',
    msBack.getMeta('sky') === '' && msBack.toText().indexOf('// sky') < 0 &&
    RA.Level.fromText(msBack.toText(), {}).sky === 0);
  const msNew = new RA.EditorModel(4, 4, 'x');
  msNew.setMeta('sky', '2');
  check('新建的关卡也能插进 // sky(插在 // name: 后面)',
    msNew.toText().split('\n')[0] === '// name: x' &&
    msNew.toText().split('\n')[1] === '// sky: 2');
}

// ================= ③ 检查(必须画起点和出口) =================
head('检查:没画全就不让试玩 / 不让存');
{
  const m = new RA.EditorModel(10, 10);
  let v = m.validate();
  check('空关卡:报"缺起点"和"缺出口"', v.errors.length >= 2 &&
    v.errors.join().indexOf('出生点') >= 0 && v.errors.join().indexOf('出口') >= 0);

  m.set(1, 7, 'P');
  v = m.validate();
  check('画了起点:缺出口 + 起点下面没地面,两条错',
    v.errors.length === 2 &&
    v.errors.join(' ').indexOf('出口') >= 0 &&
    v.errors.join(' ').indexOf('地面') >= 0, v.errors.join('; '));

  // 铺一整条地面
  for (let c = 0; c < 10; c++) m.set(c, 8, '^');
  m.set(8, 1, 'G');
  v = m.validate();
  check('起点 + 出口都画好、起点站在地面上 → 没错误了',
    v.errors.length === 0, v.errors.join('; '));
  check('出口在起点上面 → 不报"出口在下面"',
    v.warnings.join().indexOf('出口在起点下面') < 0);
  check('提示里报了地图尺寸和世界大小',
    v.notes.join().indexOf('10 × 10') >= 0 && v.notes.join().indexOf('450') >= 0);

  m.set(4, 5, 'Q');
  v = m.validate();
  check("不认识的字符 'Q' → 报错并指出位置",
    v.errors.join().indexOf("'Q'") >= 0 && v.errors.join().indexOf('第 6 行') >= 0);
  m.set(4, 5, AIR);

  m.set(3, 7, 'P');
  v = m.validate();
  check('两个起点 → 报错', v.errors.join().indexOf('2 个起点') >= 0);
  m.set(3, 7, AIR);

  m.set(2, 3, 'S');
  v = m.validate();
  check('弹簧板悬空 → 提醒', v.warnings.join().indexOf('悬空') >= 0);
  m.set(2, 3, AIR);
  m.set(2, 7, 'S');
  v = m.validate();
  check('弹簧板贴着地面 → 不提醒', v.warnings.join().indexOf('悬空') < 0);
  m.set(2, 7, AIR);

  m.set(6, 2, 'G');
  v = m.validate();
  check('两个出口 → 提醒"只有第一个算数"', v.warnings.join().indexOf('2 个出口') >= 0);
}

// ================= ④ 界面:在 DOM 替身里起一个编辑器 =================
head('界面:模拟鼠标真的画一笔');
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
  const place = (c, r, ch) => {
    ed.selectChar(ch);
    mouseAt(c, r);
    press(); step(); release(); step();
  };

  ed.newLevel(15, 24, false);
  ed.fitView();
  ed.selectChar('^');
  mouseAt(3, 5);
  press(); step(); release(); step();
  check('按住左键画了一格', ed.model.get(3, 5) === '^', '得到 ' + ed.model.get(3, 5));

  // 拖动:从 (3,5) 拖到 (8,5) 应该连成一条
  mouseAt(3, 5); press(); step();
  mouseAt(8, 5); step();
  release(); step();
  let line = true;
  for (let c = 3; c <= 8; c++) if (ed.model.get(c, 5) !== '^') line = false;
  check('拖动时中间不会断(Bresenham 补格)', line);

  // 撤销 / 重做
  const before = ed.model.get(4, 5);
  ed.undo();
  check('撤销把这一笔整段收回去了', ed.model.get(4, 5) === AIR, '之前是 ' + before);
  const afterUndo = ed.model.get(4, 5);
  ed.redo();
  check('重做又回来了', ed.model.get(4, 5) === '^' && afterUndo === AIR);

  // 橡皮
  ed.setTool('erase');
  ed.brush = 1;
  mouseAt(5, 5); press(); step(); release(); step();
  check('橡皮能擦掉', ed.model.get(5, 5) === AIR);

  // 笔刷大小
  ed.setTool('brush');
  ed.setBrush(3);
  ed.selectChar('=');
  mouseAt(2, 10); press(); step(); release(); step();
  let block = true;
  for (let r = 9; r <= 11; r++) for (let c = 1; c <= 3; c++) {
    if (ed.model.get(c, r) !== '=') block = false;
  }
  check('笔刷调到 3 会画 3×3 一块', block);
  ed.setBrush(1);

  // 矩形
  ed.setTool('rect');
  ed.selectChar('~');
  mouseAt(6, 12); press(); step();
  mouseAt(9, 14); step();
  release(); step();
  check('矩形工具填出一整块',
    ed.model.get(6, 12) === '~' && ed.model.get(9, 14) === '~' &&
    ed.model.get(7, 13) === '~' && ed.model.get(5, 12) === AIR);

  // 油漆桶
  ed.setTool('fill');
  ed.selectChar('_');
  mouseAt(7, 13); press(); step(); release(); step();
  check('油漆桶把这一片都换掉', ed.model.get(6, 12) === '_' && ed.model.get(9, 14) === '_');

  // 吸管
  ed.setTool('pick');
  mouseAt(6, 12); press(); step(); release(); step();
  check('吸管取到了那格的地物,而且工具切回了画笔',
    ed.ch === '_' && ed.tool === 'brush');

  // 自动扩展
  const cols0 = ed.model.cols;
  ed.setTool('brush');
  ed.selectChar('^');
  mouseAt(cols0 + 3, 2); press(); step(); release(); step();
  check('画到右边界外面会自动把地图撑大', ed.model.cols > cols0,
    cols0 + ' → ' + ed.model.cols);
  check('撑大之后那一格确实画上了', ed.model.get(cols0 + 3, 2) === '^');

  // 关掉自动扩展就画不出界
  ed.$('chk-autogrow').checked = false;
  ed.autoGrow = false;
  const cols1 = ed.model.cols;
  mouseAt(cols1 + 2, 1); press(); step(); release(); step();
  check('关掉自动扩展就不会再撑大', ed.model.cols === cols1);
  ed.autoGrow = true;

  // 导出 / 检查联动
  ed.newLevel(15, 24, true);
  const v = ed.model.validate();
  check('"新建(带地面)"出来的关卡检查通过(起点和出口都放好了)',
    v.errors.length === 0, v.errors.join('; '));
  const txt = ed.exportText();
  check('导出的 txt 里有 // name: 和 P / G',
    txt.indexOf('// name:') >= 0 && txt.indexOf('P') > 0 && txt.indexOf('G') > 0);

  // 导出的东西引擎真的能读、能玩
  const lv = RA.Level.fromText(txt, { fallbackName: '编辑器' });
  check('引擎能读编辑器导出的关卡', !!lv && lv.rows > 0 && !!lv.goal);
  check('引擎读出来的出生点和出口都在地面上',
    lv.groundBelow(lv.spawnRow, lv.spawnCol) === lv.spawnRow &&
    lv.groundBelow(lv.goal.row, lv.goal.col) === lv.goal.row);

  // 关卡池内容:这里单独验一次"新层用关卡名当池子里的 id(= 以后的 txt 文件名)"
  ed.model.name = '编辑器测试层';
  const ovId = ed.poolId();
  ed.applyToGamePool();
  check('关卡池里记下了这一层(保存到游戏会顺带更新它)',
    RA.LevelPack.hasOverride(ovId), ovId);
  check('关卡池 id 就是关卡名(= 以后的 txt 文件名)', ovId === '编辑器测试层', ovId);
  check('存进去的文本能被关卡池读出来',
    RA.LevelPack.validate(RA.LevelPack.readOverrides()[ovId], ovId).ok);
  check('游戏那边会把它并进池子',
    RA.LevelPack.mergeCustom(RA.LEVEL_TEXT)[ovId] === RA.LevelPack.readOverrides()[ovId]);
  check('编辑器里已经没有"只存进游戏 / 可达性检查"这两个动作了',
    typeof ed.storeToGame === 'undefined' && typeof ed.checkReach === 'undefined');

  // 下载 / 复制 / 看 txt
  const blobs0 = globalThis.__RA_BLOBS__.length;
  ed.download();
  check('下载会产出一个 Blob,里面就是导出的 txt',
    globalThis.__RA_BLOBS__.length === blobs0 + 1 &&
    globalThis.__RA_BLOBS__[blobs0].text.indexOf('// name:') >= 0);
  ed.copyText();
  check('复制走的是剪贴板 API(自检里记了下来)',
    globalThis.__RA_CLIPBOARD__.length > 0);
  ed.showText();
  check('"看 txt" 把内容塞进了文本框',
    ed.$('modal-text').value.indexOf('// name:') >= 0);

  // ================= 关卡名:自动分配 + 必填 + 就是 txt 文件名 =================
  check('自动起名会跳过已经用掉的',
    RA.EditorModel.autoName(['新楼层 1', '新楼层 2', '别的层']) === '新楼层 3');
  check('内置关卡的名字也算"用掉了"',
    ed.takenNames().length >= Object.keys(RA.LEVEL_TEXT || {}).length);
  const blankName = new RA.EditorModel(6, 6, '   ');
  check('名字空着时检查里会报一条 error',
    blankName.validate().errors.join(' ').indexOf('起名字') >= 0);
  blankName.name = '有名字了';
  check('起了名字就不报名字的问题',
    blankName.validate().errors.filter((e) => e.indexOf('名字') >= 0).length === 0);
  check('超长的名字会给个提醒',
    new RA.EditorModel(4, 4, 'x'.repeat(41)).validate().warnings.join(' ').indexOf('短一点') >= 0);
  check('txt 文件名就是关卡名',
    new RA.EditorModel(4, 4, '天梯 A/B').fileName() === '天梯_A_B.txt',
    new RA.EditorModel(4, 4, '天梯 A/B').fileName());
  check('名字里不能做文件名的字符会换掉',
    new RA.EditorModel(4, 4, 'a:b*c?d"e<f>g|h').fileName() === 'a_b_c_d_e_f_g_h.txt',
    new RA.EditorModel(4, 4, 'a:b*c?d"e<f>g|h').fileName());
  const noName = new RA.EditorModel(4, 4, 'x');
  noName.name = '';                          // 用户把名字清空
  check('名字被清空时给个兜底文件名', noName.fileName() === '未命名楼层.txt',
    noName.fileName());

  const nameA = ed.model.name;
  ed.newLevel(15, 24, true);
  const nameB = ed.model.name;
  check('新建的楼层自动就有名字(新楼层 N)', /^新楼层 \d+$/.test(nameB), nameB);
  check('再新建一个不会重名', nameA !== nameB, nameA + ' → ' + nameB);
  check('自动起的名字已经写进 // name: 注释',
    ed.exportText().indexOf('// name: ' + nameB) === 0);
  check('新建的关卡注释头只有 // name: 一行(和 levels/ 里的 txt 同格式)',
    ed.exportText().split('\n').filter((l) => l.trimStart().startsWith('//')).length === 1,
    ed.exportText().split('\n').filter((l) => l.trimStart().startsWith('//')).join(' / '));

  // 名字空着:所有导出动作都要被拦住(新建的层必须有名字)
  ed.newLevel(15, 24, true);
  ed.model.name = '';
  const blobs1 = globalThis.__RA_BLOBS__.length;
  const clip1 = globalThis.__RA_CLIPBOARD__.length;
  ed.download();
  check('名字空着时不给下载',
    globalThis.__RA_BLOBS__.length === blobs1 && ed.msg.indexOf('起个名字') >= 0, ed.msg);
  check('名字空着时不给复制',
    ed.copyText() === false && globalThis.__RA_CLIPBOARD__.length === clip1);
  check('新建的层没名字时不给「保存到游戏」', ed.saveToFolder() === false);
  check('被拦住的时候会说是"名字"的问题(不是别的)',
    ed.msg.indexOf('起个名字') >= 0, ed.msg);
  check('检查面板也会提醒"还没起名字"',
    ed.model.validate().errors.join(' ').indexOf('起名字') >= 0);
  ed.model.name = '有名字的层';
  ed.applyToGamePool();
  check('起了名字就写进关卡池',
    !!RA.LevelPack.readOverrides()['有名字的层'], ed.poolId());
  check('保存到游戏的池子 id 用的就是"关卡名"',
    ed.poolId() === '有名字的层', ed.poolId());

  // ============ 存到 levels/ 文件夹(拿假的文件夹句柄走一遍真流程) ============
  const written = {};
  const fakeDir = {
    name: 'levels',
    getFileHandle(fileName) {
      return Promise.resolve({
        createWritable() {
          return Promise.resolve({
            write(text) { written[fileName] = text; return Promise.resolve(); },
            close() { return Promise.resolve(); }
          });
        }
      });
    },
    removeEntry(fileName) { delete written[fileName]; return Promise.resolve(); }
  };
  let pickCalls = 0;
  globalThis.showDirectoryPicker = () => { pickCalls++; return Promise.resolve(fakeDir); };
  // ⑤ 端到端那一段还要用这个假的 levels/ 文件夹,所以挂到 globalThis 上
  globalThis.__RA_FAKE_DIR__ = fakeDir;
  globalThis.__RA_WRITTEN__ = written;
  check('有 showDirectoryPicker 时 LevelFolder 认为支持',
    ed.folder.supported() === true);
  ed.pickFolder();
  await new Promise((r) => globalThis.setTimeout(r, 0));
  check('选了文件夹之后记住了它', ed.folder.handle === fakeDir && pickCalls === 1);
  check('提示行会显示目标文件夹',
    ed.$('folder-label').textContent.indexOf('levels') >= 0,
    ed.$('folder-label').textContent);

  ed.model.name = '存盘测试层';
  await ed.saveToFolder();
  check('真的写出了 txt,文件名 = 关卡名', !!written['存盘测试层.txt'],
    Object.keys(written).join(','));
  check('保存同时把浏览器里的关卡池也换成新的(双写)',
    !!RA.LevelPack.hasOverride('存盘测试层'), RA.LevelPack.overrideCount() + ' 条覆盖');
  check('关卡池里那份文本和写出去的文件一模一样',
    RA.LevelPack.readOverrides()['存盘测试层'] === written['存盘测试层.txt']);
  check('txt 第一行就是 // name: 注释',
    (written['存盘测试层.txt'] || '').indexOf('// name: 存盘测试层') === 0);
  check('写出去的 txt 关卡池读得出来',
    RA.LevelPack.validate(written['存盘测试层.txt'], 'x').ok);

  ed.model.name = '改名后的层';
  await ed.saveToFolder();
  check('改名后再存:写新文件 + 删掉旧文件',
    !!written['改名后的层.txt'] && !written['存盘测试层.txt'],
    Object.keys(written).join(','));
  check('改名的同时,关卡池里旧的 id 也被清掉了',
    !!RA.LevelPack.hasOverride('改名后的层') && !RA.LevelPack.hasOverride('存盘测试层'));
  check('提示行记住刚写的文件名',
    ed.$('folder-label').textContent.indexOf('改名后的层.txt') >= 0);

  // 游戏里「导入关卡」那份是按关卡名存成 custom_xxx 的:同一个名字在那边也有一份的话,
  // 编辑器改名之后必须把旧名字那份也清掉 —— 不然塔里会出现两个同名的层。
  RA.LevelPack.putCustom('新楼层 1', '// name: 新楼层 1\n+++G+\n++++\n+P++\n+^^^+\n+===+\n');
  ed.newLevel(15, 24, true);
  ed.model.name = '新楼层 1';                 // 名字和那份 custom 撞上
  await ed.saveToFolder();
  const staleId = RA.LevelPack.customId('新楼层 1');
  check('新层和"导入进来的同名层"重名时:保存后那份 custom_ 副本被清掉',
    !!RA.LevelPack.hasOverride('新楼层_1') && !RA.LevelPack.readCustom()[staleId],
    'custom=' + Object.keys(RA.LevelPack.readCustom()).join(',') +
    ' / ov=' + Object.keys(RA.LevelPack.readOverrides()).join(','));
  ed.model.name = '换了个名字';
  await ed.saveToFolder();
  check('改名再存:上一份覆盖也被清掉(塔里不会留两个同名层)',
    !!RA.LevelPack.hasOverride('换了个名字') && !RA.LevelPack.hasOverride('新楼层 1'),
    Object.keys(RA.LevelPack.readOverrides()).join(','));
  // 池子里同一个"层"只留一条:内嵌 floor01 和内容一样的 custom_ 副本不会各占一行
  // (名字去掉之后,"同一层"靠 id 认:custom_floor01 的显示名就是 floor01)
  RA.LevelPack.putCustom('floor01', RA.LEVEL_TEXT['floor01']);
  const poolList = RA.LevelPack.poolOf(RA.LevelPack.build(RA.LEVEL_TEXT || {})).list;
  const primary = RA.LevelPack.primaryOf(poolList);
  check('池子里的重复层(内嵌 + 内容一样的浏览器副本)在列表里只算一条',
    primary.filter((e) => e.name === 'floor01').length === 1,
    primary.map((e) => e.id).join(','));
  RA.LevelPack.removeCustom(RA.LevelPack.customId('floor01'));

  const chkAuto = ed.$('chk-autosave');
  if (chkAuto && chkAuto.dispatch) {
    ed.autoSaveDelay = 0;                    // 自检里不等 1.5 秒
    chkAuto.checked = true;
    chkAuto.dispatch('change');
    check('勾上"自动写入"就打开了开关', ed.autoSave === true);
    ed.model.name = '自动写入的层';
    ed.markDirty();                          // 模拟改了一笔
    await new Promise((r) => globalThis.setTimeout(r, 30));
    check('改完一会儿会自动写进文件夹', !!written['自动写入的层.txt'],
      Object.keys(written).join(','));
    chkAuto.checked = false;
    chkAuto.dispatch('change');
    check('取消勾选就关掉自动写入', ed.autoSave === false);
  }

  ed.forgetFolder();
  await new Promise((r) => globalThis.setTimeout(r, 0));
  check('忘掉之后句柄就没了', ed.folder.handle === null);
  check('提示行变回"还没选文件夹"',
    ed.$('folder-label').textContent.indexOf('还没选') >= 0);
  // 没有句柄时再点一次:会重新请求一次文件夹授权,然后照样写进去
  ed.model.name = '重新选文件夹的层';
  const picks0 = pickCalls;
  await ed.saveToFolder();
  check('句柄被忘掉后再存会重新请求授权,并且照样写进去',
    pickCalls === picks0 + 1 && !!written['重新选文件夹的层.txt'],
    Object.keys(written).join(','));
  // —— 下拉框:能认出浏览器里存的那几份、也能改到"正在用的那份" ——
  RA.LevelPack.putCustom('浏览器里存的层', '// name: 浏览器里存的层\n+++G+\n+++++\n+P+++\n+^^^+\n+===+\n');
  const storedId = RA.LevelPack.customId('浏览器里存的层');
  RA.LevelPack.putOverride('floor01', '// name: 起攀(我改过)\n+++G+\n+++++\n++P++\n+^^^+\n+===+\n');
  ed.syncUI();
  check('下拉框里能认出"★ 浏览器里存的"',
    ed.$('pool-select').children.some((o) => String(o.textContent).indexOf('★') === 0),
    ed.$('pool-select').children.map((o) => o.textContent).join(' | ').slice(0, 80));
  check('下拉框给"改过的层"打上 ✎ 标记',
    ed.$('pool-select').children.some((o) => String(o.textContent).indexOf('✎') === 0));
  check('下拉框里列了关卡池里的 id(文件名),同名也分得清',
    ed.$('pool-select').children.some((o) => String(o.value) === 'floor01' &&
      String(o.textContent).indexOf('floor01') >= 0),
    ed.$('pool-select').children.map((o) => o.textContent).join(' | ').slice(0, 100));
  check('编辑器里已经没有"删掉选中的"这个动作了',
    typeof ed.deleteFromPool === 'undefined' &&
    !/btn-delete-pool/.test(readFileSync(join(ROOT, 'editor.html'), 'utf8')));

  // ★ 打开选中的必须是"游戏里正在用的那份"(以前会打开旧的内嵌文本)
  ed.$('pool-select').value = 'floor01';
  ed.openFromPool();
  check('打开改过的过关卡:拿到的是浏览器里那份(不是旧的内嵌文本)',
    ed.exportText().indexOf('起攀(我改过)') >= 0, ed.model.name);
  check('它的来源 id 还是 floor01(存回去不会多出一份)', ed.sourceId === 'floor01');
  RA.LevelPack.removeOverride('floor01');
  ed.$('pool-select').value = 'floor01';
  ed.openFromPool();
  check('清掉覆盖之后,打开的就是内嵌那层',
    ed.exportText().indexOf('起攀(我改过)') < 0 && ed.sourceId === 'floor01');

  // 浏览器里存的层:能打开、能改、能存回去
  ed.$('pool-select').value = storedId;
  ed.openFromPool();
  check('能打开浏览器里存的层', ed.model.name === '浏览器里存的层' && ed.sourceId === '',
    ed.model.name + '/' + ed.sourceId);
  RA.LevelPack.removeCustom(storedId);

  ed.forgetFolder();
  await new Promise((r) => globalThis.setTimeout(r, 0));
  delete globalThis.showDirectoryPicker;
  check('没有这个 API 时 supported() 是 false', ed.folder.supported() === false);

  // 新层起了个和内置关卡一样的名字(floor02)。
  // 关卡数据换成"固定 id + asc/json"之后,内置关卡是 levels/floor02.json,
  // 而编辑器这一轮写的还是 floor02.txt —— 盖不掉那个 json,所以撞车检查这轮先不生效。
  // 下一轮把编辑器接到新格式时,这里要改成"按 id 拦住撞车"(见 log.txt 的已知问题)。
  ed.newLevel(15, 24, true);
  ed.model.name = 'floor02';
  check('编辑器这轮不按名字拦撞车了(内置关卡已经是 .json,写 txt 盖不掉它)',
    ed.fileNameClash() === '', ed.fileNameClash());
  globalThis.showDirectoryPicker = () => Promise.resolve(fakeDir);
  ed.pickFolder();
  await new Promise((r) => globalThis.setTimeout(r, 0));
  check('照样能保存 = 用这份内容覆盖池子里的 floor02',
    (await ed.saveToFolder()) === true, ed.msg);
  check('写出来的是 floor02.txt,levels/floor02.json 一点没动',
    !!written['floor02.txt'] && existsSync(join(ROOT, 'levels/floor02.json')));
  check('池子里 floor02 还是只有一条(内容换成刚存的这份,不多出一层)',
    RA.LevelPack.poolOf(RA.LevelPack.build(RA.LEVEL_TEXT || {})).list
      .filter((e) => e.id === 'floor02').length === 1);
  RA.LevelPack.removeOverride('floor02');
  ed.model.name = '不撞车的层';
  check('换个名字就不拦了', ed.fileNameClash() === '');

  // 打开关卡池里的一层
  const firstId = Object.keys(RA.LEVEL_TEXT)[0];
  ed.$('pool-select').value = firstId;
  ed.openFromPool();
  check('能打开关卡池里已有的楼层', ed.model.name.length > 0 &&
    ed.model.rows > 5, firstId + ' → ' + ed.model.name + ' ' + ed.model.cols + '×' + ed.model.rows);

  // 从关卡池 / txt 打开的层:存盘沿用原来的文件名,免得 levels/ 里出现两份一样的东西
  check('打开的层记住了来源 id,存盘文件名也沿用它',
    ed.sourceId === firstId && ed.saveFileName() === firstId + '.txt', ed.saveFileName());
  globalThis.showDirectoryPicker = () => Promise.resolve(fakeDir);
  ed.pickFolder();
  await new Promise((r) => globalThis.setTimeout(r, 0));
  ed.model.name = '改了个显示名';
  await ed.saveToFolder();
  check('改显示名之后存盘:文件名还是原来的 id',
    !!written[firstId + '.txt'] && !written['改了个显示名.txt'],
    Object.keys(written).join(','));
  check('打开的层保存时覆盖的是同一把 id(池子里不会多一层)',
    RA.LevelPack.hasOverride(firstId) && !RA.LevelPack.hasOverride('改了个显示名'),
    firstId);
  check('覆盖的内容就是刚写出去的那份',
    RA.LevelPack.readOverrides()[firstId] === written[firstId + '.txt']);
  check('txt 里的 // name: 是新的显示名',
    (written[firstId + '.txt'] || '').indexOf('// name: 改了个显示名') === 0);

  // 老关卡(关卡池里打开的那层)**不需要**现起名字 —— 它沿用原来的名字和文件名
  ed.$('pool-select').value = firstId;
  ed.openFromPool();
  const keptFile = firstId + '.txt';
  ed.model.name = '';                          // 用户把输入框清空了
  check('老关卡没名字时也允许「保存到游戏」(沿用原来的名字)',
    ed.requireNameToSave() === true, ed.msg);
  await ed.saveToFolder();
  check('老关卡照样按原文件名存回去', !!written[keptFile], Object.keys(written).join(','));
  check('老关卡存回去之后,注释里的名字没被清空',
    (written[keptFile] || '').indexOf('// name: ') === 0 &&
    (written[keptFile] || '').split('\n')[0].length > '// name: '.length);
  ed.newLevel(15, 24, true);
  check('新建的层没有来源 id(按关卡名当文件名)',
    ed.sourceId === '' && ed.saveFileName() === ed.model.fileName(), ed.saveFileName());
  check('新建的层没名字就必须先起名(requireNameToSave 会拦住)',
    (() => { const keep = ed.model.name; ed.model.name = ''; const r = ed.requireNameToSave();
      ed.model.name = keep; return r === false; })());

  // ================= 「← 回游戏」:有改动先问要不要存 =================
  const realClose = globalThis.close;
  const realConfirm = globalThis.confirm;
  const realWarn = globalThis.console.warn;
  let closes = 0, asks = 0, askAnswer = false, visited = '';
  globalThis.close = () => { closes++; globalThis.closed = false; };   // 浏览器:关不掉
  globalThis.console.warn = () => { };
  const locate = (url) => { visited = url; };

  // ① 没改过:直接回,不该问
  globalThis.showDirectoryPicker = () => Promise.resolve(fakeDir);
  ed.pickFolder();
  await new Promise((r) => globalThis.setTimeout(r, 0));
  await ed.saveToFolder();                       // 存一次 → dirty 归零
  check('存过之后 dirty 清掉了', ed.dirty === false);
  globalThis.confirm = () => { asks++; return true; };
  ed.$('back-link').dispatch('click', { preventDefault() { } });
  check('没改过的时候不问,直接回游戏', asks === 0 && (closes > 0 || visited === 'index.html'),
    'asks=' + asks + ' closes=' + closes + ' visited=' + visited);

  // ② 改过 + 选「是」→ 先保存到游戏,再离页
  ed.selectChar('^');
  ed.model.set(2, 20, '^');
  ed.afterEdit();
  check('改一笔之后 dirty = true', ed.dirty === true);
  asks = 0; closes = 0; visited = '';
  globalThis.confirm = () => { asks++; return true; };
  ed.$('back-link').dispatch('click', { preventDefault() { } });
  check('有改动会先问一句', asks === 1, 'asks=' + asks);
  await new Promise((r) => globalThis.setTimeout(r, 30));
  check('选「是」= 走了一遍「保存到游戏」(文件写出去了)',
    !!written[ed.saveFileName()], Object.keys(written).slice(-3).join(','));
  check('存完才离页', closes > 0 || visited === 'index.html',
    'closes=' + closes + ' visited=' + visited);
  check('存过之后 dirty 归零(不会再问一次)', ed.dirty === false);

  // ③ 改过 + 选「否」→ 不保存,直接回
  asks = 0; closes = 0; visited = '';
  ed.model.set(3, 20, '=');
  ed.afterEdit();
  const filesBefore = Object.keys(written).length;
  globalThis.confirm = () => { asks++; return false; };
  ed.$('back-link').dispatch('click', { preventDefault() { } });
  check('选「否」也会离页(不保存)', asks === 1 &&
    (closes > 0 || visited === 'index.html'), 'asks=' + asks);
  check('选「否」不会写出新文件', Object.keys(written).length === filesBefore);

  // ④ 新建的层没名字 + 选「是」→ 先拦住要名字,不离页(和「保存到游戏」一条路)
  asks = 0; closes = 0; visited = '';
  ed.newLevel(15, 24, true);
  ed.model.name = '';
  ed.afterEdit();
  globalThis.confirm = () => { asks++; return true; };
  ed.$('back-link').dispatch('click', { preventDefault() { } });
  check('没名字时会被拦住(提示去起名),不会离页',
    closes === 0 && visited === '' && ed.msg.indexOf('起个名字') >= 0, ed.msg);
  ed.model.name = '回游戏测试层';
  closes = 0; visited = '';
  globalThis.confirm = () => true;
  ed.$('back-link').dispatch('click', { preventDefault() { } });
  await new Promise((r) => globalThis.setTimeout(r, 30));
  check('起了名字再点「回游戏」→ 存成 then 离页',
    !!written['回游戏测试层.txt'] && (closes > 0 || visited === 'index.html'),
    Object.keys(written).slice(-3).join(','));

  globalThis.close = realClose;
  globalThis.confirm = realConfirm;
  globalThis.console.warn = realWarn;
  delete globalThis.showDirectoryPicker;

  // leavePage():能关标签页就关;关不掉就跳回 index.html
  globalThis.close = () => { globalThis.closed = true; };
  globalThis.closed = false;
  check('浏览器让关标签页时,leavePage 关了就不跳转',
    ed.leavePage() === true && globalThis.closed === true);
  globalThis.close = () => { closes++; globalThis.closed = false; };
  globalThis.location = { protocol: 'file:', search: '', href: 'file:///reverse_abyss/editor.html' };
  ed.leavePage();
  check('关不掉标签页时,leavePage 把页面跳到 index.html',
    globalThis.location.href === 'index.html', globalThis.location.href);
  globalThis.close = realClose;

  // 尺寸输入
  ed.changeSize(40, 30);
  check('尺寸能直接改', ed.model.cols === 40 && ed.model.rows === 30);
  ed.changeSize(99999, 30);
  check('超过上限会被夹住', ed.model.cols === C.EDITOR_MAX_COLS,
    'EDITOR_MAX_COLS=' + C.EDITOR_MAX_COLS);

  // 试玩:编辑器只负责"把这一层交给新标签页"(真正的游戏在 play.html,见 ④c)
  ed.newLevel(15, 24, true);
  const opened = [];
  const realOpen = globalThis.open;
  globalThis.open = (url, target) => { opened.push({ url: url, target: target }); return {}; };
  const okPlay = ed.openPlaytest();
  globalThis.open = realOpen;
  check('检查通过的关卡能开试玩页', okPlay === true && opened.length === 1,
    opened.map((o) => o.url).join(','));
  check('试玩开在新标签页(_blank)的 play.html', !!opened[0] &&
    opened[0].target === '_blank' && opened[0].url.indexOf('play.html') === 0, 
    opened[0] ? opened[0].url : '没开');
  check('编辑器把这一层的快照挂出来了(试玩页会问 opener 要)',
    ed.playTests.length === 1 && ed.playTests[0].text.indexOf('// name:') === 0 &&
    ed.playTests[0].name === ed.model.name, ed.model.name);
  check('试玩页的编号写在 url 上', opened[0].url === 'play.html?i=0', opened[0].url);
  check('开过试玩之后编辑器自己还是编辑器(模型 / 画布都没被换掉)',
    !!ed.model && ed.model.cols > 0 && !!ed.$('board'));

  // 没画完的关卡不让试玩
  ed.newLevel(15, 24, false);
  const shots0 = ed.playTests.length;
  const opened2 = [];
  globalThis.open = (url) => { opened2.push(url); return {}; };
  const badPlay = ed.openPlaytest();
  globalThis.open = realOpen;
  check('没画起点/出口时不给试玩', badPlay === false && opened2.length === 0,
    ed.msg);
  check('被拦住时不会往试玩快照里塞东西', ed.playTests.length === shots0);

  // 浏览器拦弹窗时要明说,不能假装开过了
  ed.newLevel(15, 24, true);
  globalThis.open = () => null;
  const blocked = ed.openPlaytest();
  globalThis.open = realOpen;
  check('弹窗被拦时返回 false,并提示允许弹窗', blocked === false &&
    ed.msg.indexOf('弹窗') >= 0, ed.msg);

  // 天空:选了就写进 // sky: N,选"自动"就把那行删掉
  const skySel = ed.$('sky-select');
  check('天空下拉框建好了(自动 + ' + C.SKY_COUNT + ' 张)',
    !!skySel && skySel.children.length === 1 + C.SKY_COUNT,
    skySel ? (skySel.children.length + ' 项') : '没找到');
  if (skySel && skySel.dispatch) {
    ed.model.removeMeta('sky');
    skySel.value = '5';
    skySel.dispatch('change');
    check('选「天空 5」→ 关卡里写进 // sky: 5', ed.model.getMeta('sky') === '5');
    check('导出里带着 // sky: 5', ed.model.toText().indexOf('// sky: 5') >= 0);
    skySel.value = '';
    skySel.dispatch('change');
    check('选回「自动」→ // sky 那行被删掉', ed.model.getMeta('sky') === '');
  }
  ed.model.setMeta('sky', '99');
  check('// sky 超范围时检查面板会提醒',
    ed.model.validate().warnings.join(' ').indexOf('超出范围') >= 0);
  ed.model.removeMeta('sky');

  // ---------- 视图开关:网格 / 地物(回归:以前勾了没反应) ----------
  // 浏览器的勾选框在派发 click 之前就把 checked 翻过来了,所以"在 click 里取反"
  // 等于没变。这里按浏览器的真实顺序模拟:先改 checked,再派发 change。
  const setChk = (id, val) => {
    const el = ed.$(id);
    el.checked = val;
    if (el.dispatch) el.dispatch('change');
  };
  ed.newLevel(15, 24, true);          // 自带地面 + P + G
  ed.fitView();

  // 用"画布上真的画了多少根线 / 多少个地物图标"来判断效果
  const realLine = RA.line;
  const realGoalIcon = RA.Goal.prototype.drawIcon;
  let lines = 0, icons = 0;
  RA.line = function () { lines++; return realLine.apply(null, arguments); };
  RA.Goal.prototype.drawIcon = function () {
    icons++;
    return realGoalIcon.apply(this, arguments);
  };
  const drawCount = () => {
    lines = 0; icons = 0;
    ed.draw();
    return { lines: lines, icons: icons };
  };

  setChk('chk-grid', true);
  check('勾上"网格"→ 内部状态是 true(不是反的)', ed.grid === true);
  const gridOn = drawCount();
  setChk('chk-grid', false);
  check('取消"网格"→ 内部状态是 false', ed.grid === false);
  const gridOff = drawCount();
  check('取消之后真的不画网格线了', gridOn.lines > 0 && gridOff.lines === 0,
    gridOn.lines + ' 根 → ' + gridOff.lines + ' 根');
  setChk('chk-grid', true);
  check('再勾回来又开始画网格', drawCount().lines > 0);

  setChk('chk-entities', true);
  const entOn = drawCount();
  setChk('chk-entities', false);
  check('取消"显示地物"→ 内部状态是 false', ed.showEntities === false);
  const entOff = drawCount();
  check('取消之后不画地物图标了', entOn.icons > 0 && entOff.icons === 0,
    entOn.icons + ' 个 → ' + entOff.icons + ' 个');
  setChk('chk-entities', true);
  check('再勾回来又开始画地物', drawCount().icons > 0);

  RA.line = realLine;
  RA.Goal.prototype.drawIcon = realGoalIcon;

  setChk('chk-autogrow', false);
  check('取消"自动扩展"→ 内部状态是 false', ed.autoGrow === false);
  setChk('chk-autogrow', true);
  check('勾回来 → true', ed.autoGrow === true);
  check('勾选框的显示状态一直跟着内部状态',
    ed.$('chk-grid').checked === true && ed.$('chk-entities').checked === true &&
    ed.$('chk-autogrow').checked === true);
  check('用 G 快捷键切网格时,勾选框也跟着变', (() => {
    ed.input.codes.KeyG = true;
    ed.prevCodes = {};
    ed.update(1 / 60);
    ed.input.codes.KeyG = false;
    return ed.grid === false && ed.$('chk-grid').checked === false;
  })());

  // ---------- 高度不限 ----------
  ed.changeSize(20, 3000);
  check('高度没有上限:直接填 3000 行', ed.model.rows === 3000,
    ed.model.cols + '×' + ed.model.rows);
  check('3000 行的地图照样能画 / 能校验', (() => {
    ed.selectChar('^');
    // 缩到最小之后,可视范围是世界中间那一段;在看得见的地方画
    const row = Math.round(ed.view.y / TS) + 20;
    const p = toScreen(3, row);                  // 瞄准格子正中间
    ed.input.mouse = { x: p.x, y: p.y, outside: false };
    ed.input.buttons[0] = true; ed.update(1 / 60); ed.input.buttons[0] = false;
    ed.update(1 / 60);
    const v = ed.model.validate();
    return ed.model.get(3, row) === '^' && !!v && v.notes.join(' ').indexOf('3000') >= 0;
  })());
  ed.changeSize(99999, 40);
  check('宽度还是有上限的', ed.model.cols === C.EDITOR_MAX_COLS,
    'EDITOR_MAX_COLS=' + C.EDITOR_MAX_COLS);
  check('config 里高度默认不限(EDITOR_MAX_ROWS = 0)', C.EDITOR_MAX_ROWS === 0);
}

// ================= ④b 页面入口:走一遍浏览器打开 editor.html 的那条路 =================
head('页面入口:editor.html 加载完自己起来(和浏览器里一样)');
{
  const g = globalThis;
  let ok = true, err = '';
  try {
    g.RA_EDITOR_NO_BOOT = false;
    g.RA_EDITOR_READY = false;
    g.RA.editor = null;
    g.RA.EditorBoot();                     // 页面加载完就是调它
    for (let i = 0; i < 5; i++) {
      g.RA.editor.update(1 / 60);
      g.RA.editor.draw();
      g.RA.editor.input.endFrame();
    }
  } catch (e) { ok = false; err = (e && e.message) + '\n' + (e && e.stack); }
  check('editor.html 的入口能自己起来并画出来', ok && !!g.RA.editor, err);
  check('起来之后标记了 RA_EDITOR_READY', g.RA_EDITOR_READY === true);
  check('起来之后画布按 devicePixelRatio 设了尺寸(' +
    (g.RA.editor ? g.RA.editor.W + '×' + g.RA.editor.H : '?') + ')',
    !!g.RA.editor && g.RA.editor.W === 1800 && g.RA.editor.H === 1200);
  check('起来之后调色板按钮都建好了(和调色板条目数量一致)',
    !!g.RA.editor && g.RA.editor.paletteItems.length === RA.EditorPalette.build().length &&
    g.RA.editor.paletteItems.every((it) => !!it.btn));
}

// ================= ④c 试玩页:编辑器交出去的那一层,在新标签页里真的能玩 =================
head('试玩页(play.html):新标签页里把编辑器那一层玩起来');
{
  const g = globalThis;
  const stageText = (() => {
    const m = new RA.EditorModel(15, 24, '试玩用的层');
    for (let c = 0; c < 15; c++) { m.set(c, 22, '^'); m.set(c, 23, '='); }
    m.set(1, 21, 'P');
    for (let c = 10; c < 14; c++) m.set(c, 3, '^');
    m.set(12, 2, 'G');
    return m.toText();
  })();

  // 装试玩页本体(和浏览器里一样:引擎 + js/playtest.js)
  vmRunPlaytest(RA);
  check('试玩页的脚本装上了(RA.Playtest)', typeof g.RA.Playtest === 'function');

  // ① 从 opener 拿:模拟"编辑器开了这个标签页"
  const fakeEditor = { RA: { editor: { playTests: [{ name: '试玩用的层', text: stageText }] } } };
  g.opener = fakeEditor;
  const resolved = g.RA.PlaytestStage(0);
  check('试玩页会问 opener 要这一层', resolved.text === stageText && resolved.name === '试玩用的层',
    resolved.name);

  // ② opener 不在(外面那页关了 / 刷新了)时走 sessionStorage
  g.opener = null;
  g.sessionStorage = {
    __d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.__d, k) ? this.__d[k] : null; },
    setItem(k, v) { this.__d[k] = String(v); },
    removeItem(k) { delete this.__d[k]; }
  };
  g.sessionStorage.setItem(g.RA.PLAYTEST_KEY, JSON.stringify({ name: '试玩用的层', text: stageText }));
  const resolved2 = g.RA.PlaytestStage(0);
  check('opener 不在了就从 sessionStorage 里兜回来',
    resolved2.text === stageText && resolved2.name === '试玩用的层');

  // ③ 真的把这一层玩起来(直接喂文本,不依赖浏览器)
  const pcv = makeCanvas(960, 540);
  pcv.clientWidth = 960;
  pcv.clientHeight = 540;
  const play = new g.RA.Playtest({ text: stageText, name: '试玩用的层', index: 0, canvas: pcv });
  check('试玩页把这一层读成了可玩的关卡',
    !!play.level && play.level.rows > 0 && !!play.player && !!play.camera);
  check('试玩页画得出来(不抛异常)', (() => {
    try { play.draw(); play.update(1 / 60); play.draw(); return true; } catch (e) { return false; }
  })());

  const px0 = play.player.x;
  play.input.down = { left: false, right: true, jump: false };
  for (let i = 0; i < 30; i++) { play.update(1 / 60); play.input.endFrame(); }
  check('试玩页里角色真的会走', play.player.x > px0 + 10,
    'x ' + px0.toFixed(0) + ' → ' + play.player.x.toFixed(0));
  play.input.down = { left: false, right: false, jump: false };

  // 走到出口 → 进结束面板(而不是像游戏里那样往上爬一层)
  play.player.x = play.level.goalX + (TS - play.player.w) / 2;
  play.player.y = play.level.goalFeet - play.player.h;
  play.update(1 / 60);
  check('碰到出口就算通关,并弹出结束面板', play.won === true && play.menu === true);
  const menuL = play.layout();
  check('通关后的结束面板有「重新开始」和「回编辑器」两个按钮',
    !!menuL.again && !!menuL.back && !menuL.cont);
  check('结束面板画得出来', (() => {
    try { play.draw(); return true; } catch (e) { return false; }
  })());
  check('结束面板上写着这一层的名字和"通关"',
    play.name === '试玩用的层' && play.won === true);

  // 重新开始之后回到起点,中途按 Esc → 结束面板(这一回多一个"继续玩")
  play.restart();
  check('重新开始之后又回到起点、也没通关',
    play.menu === false && play.won === false && !!play.level &&
    play.player.y < play.level.worldH, play.menu + '/' + play.won);
  play.input.edge.back = true;
  play.update(1 / 60);
  play.input.endFrame();
  check('中途按 Esc 也会进结束面板', play.menu === true && play.won === false);
  const menuL2 = play.layout();
  check('没通关时多给一个「继续玩」', !!menuL2.cont && !!menuL2.back);
  play.input.clicks = [{ x: menuL2.cont.x + 5, y: menuL2.cont.y + 5 }];
  play.update(1 / 60);
  play.input.endFrame();
  check('点「继续玩」回到关卡里', play.menu === false);

  // 「回编辑器」:外面那页还在 → 试着关掉自己,关不掉就把它拉到前面
  play.menu = true;                       // 再打开结束面板(点「回编辑器」)
  let closed = false, focused = false;
  const realClose = g.close;
  const openerObj = { closed: false, focus() { focused = true; } };
  g.opener = openerObj;
  check('外面那一页还在的时候算"能回编辑器"', play.openerAlive() === true);
  g.close = () => { closed = true; g.closed = false; };     // 浏览器说"关不掉"
  // 走真正的路径:在结束面板上点「回编辑器」
  const L3 = play.layout();
  play.input.clicks = [{ x: L3.back.x + 5, y: L3.back.y + 5 }];
  play.update(1 / 60);
  play.input.endFrame();
  check('点「回编辑器」会先试着关掉本页', closed === true, 'closed=' + closed);
  check('关不掉的时候就把编辑器那一页拉到前面(不假装关掉了)',
    focused === true, 'focused=' + focused);
  g.close = realClose;
  g.opener = null;

  // 拿不到关卡时不能崩,要画一句提示
  const empty = new g.RA.Playtest({ text: '', canvas: makeCanvas(960, 540) });
  check('没拿到关卡内容时给出提示而不是崩掉',
    !!empty.fail && empty.level === null);
  check('提示画面画得出来', (() => {
    try { empty.draw(); return true; } catch (e) { return false; }
  })());

  // ④ 页面入口:走一遍浏览器打开 play.html 的那条路
  let bootOk = true, bootErr = '';
  let booted = null;
  try {
    g.RA_PLAYTEST_NO_BOOT = false;
    g.RA_PLAYTEST_READY = false;
    g.RA.play = null;
    g.sessionStorage.setItem(g.RA.PLAYTEST_KEY,
      JSON.stringify({ name: '试玩用的层', text: stageText }));
    booted = g.RA.PlaytestBoot();          // 页面加载完就是调它
    if (booted) {
      booted.update(1 / 60);
      booted.draw();
      booted.input.endFrame();
    }
  } catch (e) { bootOk = false; bootErr = (e && e.message) + '\n' + (e && e.stack); }
  check('play.html 的入口能自己起来并画出来', bootOk && !!booted, bootErr);
  check('起来之后标记了 RA_PLAYTEST_READY', g.RA_PLAYTEST_READY === true);
  check('起来之后就把这一层玩起来了(有角色、有镜头)',
    !!booted && !!booted.player && !!booted.camera);
}

// ================= ⑤ 编辑出来的关卡真的能爬 =================
head('端到端:用编辑器搭一层,导出后必须"爬得上去"');
{
  const m = new RA.EditorModel(15, 28, '编辑器搭的塔');
  // 地面
  for (let c = 0; c < 15; c++) { m.set(c, 26, '^'); m.set(c, 27, '='); }
  m.set(1, 25, 'P');
  // 3 行一级的台阶,左右折返
  const steps = [
    [23, 3, 6], [20, 7, 10], [17, 2, 5], [14, 6, 9],
    [11, 1, 4], [8, 5, 8], [5, 9, 12], [2, 11, 14]
  ];
  steps.forEach(function (s) {
    for (let c = s[1]; c <= s[2]; c++) m.set(c, s[0], '^');
  });
  m.set(12, 1, 'G');
  const v = m.validate();
  check('编辑器搭出来的这一层没有错误', v.errors.length === 0, v.errors.join('; '));

  const text = m.toText();
  const lv = RA.Level.fromText(text, { fallbackName: 'editor-built' });
  check('引擎读出来没有警告', lv.warnings.length === 0, lv.warnings.join('; '));
  const r = RA.Reach.path(lv, { sim: true });
  check('逐跳物理模拟:从起点真的爬得到出口', r.ok,
    r.ok ? (r.hops.length + ' 跳') : (r.reason || ''));

  // 顺便把物理自检也在这一层上跑一遍
  const assets = new RA.Assets();
  const runner = RA.Smoke.physics(lv, assets, function () { });
  check('物理自检在这一层上全过(站立/跳跃/二段跳/出口判定)', runner.fails.length === 0,
    runner.fails.join('; '));

  // 再验一次"关卡池里有这一层 → 塔抽得到"
  RA.LevelPack.putCustom('编辑器搭的塔', text);
  const pack = buildPack(RA, RA.LevelPack.readCustom());
  const entry = pack.pool.filter((e) => e.name.indexOf('编辑器搭的塔') >= 0)[0];
  check('关卡池里多出这一层', !!entry, entry ? entry.id : '没找到');
  if (entry) {
    const tower = new RA.Tower(pack.pool).generate({ floors: 6, seed: 'EDITOR-TEST' });
    let built = 0;
    for (let i = 0; i < tower.height; i++) if (tower.level(i)) built++;
    check('塔能用含自定义关卡的池子正常抽层', built === tower.height);
  }

  // ---------- 「保存到游戏」之后,游戏里到底变了没有 ----------
  // 先把假的 levels/ 文件夹重新接回来(前面有一段测过"忘掉句柄")
  const fakeDir = globalThis.__RA_FAKE_DIR__;
  const written = globalThis.__RA_WRITTEN__;
  globalThis.showDirectoryPicker = () => Promise.resolve(fakeDir);
  ed.pickFolder();
  await new Promise((r) => globalThis.setTimeout(r, 0));

  // 塔里本来就有的那一层:改完存进游戏 → 关卡池里那一层(同一个 id)换成新文本
  const towerId = Object.keys(RA.LEVEL_TEXT)[0];
  const towerText = RA.LEVEL_TEXT[towerId];
  check('塔里那层的原文本和关卡池一致(还没改的时候)',
    RA.LevelPack.mergeCustom(RA.LEVEL_TEXT)[towerId] === towerText);
  ed.$('pool-select').value = towerId;
  ed.openFromPool();
  // 直接改一格,模拟"手改老关卡"
  const oldCell = ed.model.get(0, 0);
  const newCell = oldCell === '+' ? '^' : '+';
  ed.model.set(0, 0, newCell);
  await ed.saveToFolder();
  const savedNow = RA.LevelPack.mergeCustom(RA.LEVEL_TEXT)[towerId];
  check('老关卡改完「保存到游戏」:关卡池里那一层换成了新文本(刷新后塔里那层就变了)',
    savedNow !== towerText && savedNow.indexOf('// name:') === 0, towerId);
  check('存进去的文本里真的带着刚改的那一格',
    RA.LevelPack.validate(savedNow, towerId).ok, ed.msg);
  check('只改了内容,没有多出一层(池子里还是同一个 id)',
    !!RA.LevelPack.readOverrides()[towerId] &&
    Object.keys(RA.LevelPack.mergeCustom(RA.LEVEL_TEXT)).filter((k) => k === towerId).length === 1,
    towerId);

  // 新的一份:存进游戏之后,关卡池里多出一个"新 id",塔重构就有机会抽到它
  ed.newLevel(15, 24, true);
  ed.model.name = '新抽得到的层';
  const beforeCount = Object.keys(RA.LevelPack.mergeCustom(RA.LEVEL_TEXT)).length;
  await ed.saveToFolder();
  const afterPool = RA.LevelPack.mergeCustom(RA.LEVEL_TEXT);
  check('新的一份存进游戏之后关卡池里多了一层',
    Object.keys(afterPool).length === beforeCount + 1 &&
    !!afterPool['新抽得到的层'], Object.keys(afterPool).join(','));
  check('多出来的那一层就是编辑器里这份文本',
    afterPool['新抽得到的层'] === ed.exportText());
  const pack2 = buildPack(RA, RA.LevelPack.readOverrides());
  const tower2 = new RA.Tower(pack2.pool).generate({ floors: 40, seed: 'PICK-ME' });
  let picked = false;
  for (let i = 0; i < tower2.height; i++) {
    if (tower2.floors[i].id === '新抽得到的层') picked = true;
  }
  check('重构出来的塔有概率抽到这一层(40 层里至少抽中一次)', picked);
  delete globalThis.showDirectoryPicker;
}

// ================= ⑥ editor.html 和 editor.js 对得上吗 =================
head('页面接线:editor.js 要的 id、脚本路径');
{
  const html = readFileSync(join(ROOT, 'editor.html'), 'utf8');
  const src = readFileSync(join(ROOT, 'js/editor.js'), 'utf8');

  const ids = new Set();
  let m;
  const grab = (re) => { while ((m = re.exec(src))) ids.add(m[1]); };
  grab(/getElementById\(\s*'([^']+)'\s*\)/g);     // 直接找
  grab(/\$\(\s*'([^']+)'\s*\)/g);                 // this.$('x')
  grab(/\bon\(\s*'([^']+)'\s*,/g);                // wire() 里的 on('id', 'event', ...)
  grab(/\bclick\(\s*'([^']+)'\s*,/g);             // wire() 里的 click('id', ...)
  check('editor.js 里用到的 id 抓齐了(' + ids.size + ' 个)', ids.size > 30);
  const missing = [...ids].filter((id) => html.indexOf('id="' + id + '"') < 0);
  check('editor.html 里都有这些 id', missing.length === 0, missing.join(','));

  const srcs = [];
  const reScript = /<script\s+src="([^"]+)"\s*>/g;
  while ((m = reScript.exec(html))) srcs.push(m[1]);
  check('editor.html 引用的脚本 = 引擎 + js/editor.js',
    srcs.join(',') === EDITOR_SCRIPTS.join(','),
    srcs.length + ' 个 / 期望 ' + EDITOR_SCRIPTS.length + ' 个');
  check('editor.html 里引用的脚本都存在',
    srcs.every((s) => existsSync(join(ROOT, s))));
  check('editor.html 里已经没有"可达性检查 / 只存进游戏"这两个按钮了',
    html.indexOf('btn-reach') < 0 && html.indexOf('btn-store') < 0 &&
    html.indexOf('可达性检查') < 0 && html.indexOf('只存进游戏') < 0);
  check('最上面只留了 试玩 / 下载 txt / 保存到游戏 这几条路',
    html.indexOf('id="btn-play"') > 0 && html.indexOf('id="btn-download"') > 0 &&
    html.indexOf('id="btn-save-folder"') > 0);

  // 试玩页(play.html)也是同一套接线:脚本清单对得上、文件都在
  const playHtml = readFileSync(join(ROOT, 'play.html'), 'utf8');
  const psrcs = [];
  const reP = /<script\s+src="([^"]+)"\s*>/g;
  while ((m = reP.exec(playHtml))) psrcs.push(m[1]);
  check('play.html 引用的脚本 = 引擎 + js/playtest.js',
    psrcs.join(',') === PLAYTEST_SCRIPTS.join(','),
    psrcs.length + ' 个 / 期望 ' + PLAYTEST_SCRIPTS.length + ' 个');
  check('play.html 里引用的脚本都存在', psrcs.every((s) => existsSync(join(ROOT, s))));
  check('play.html 里有一个 <canvas id="game">', playHtml.indexOf('id="game"') > 0);
  check('css/editor.css 存在', existsSync(join(ROOT, 'css/editor.css')));
  check('config 里有 EDITOR_MAX_COLS / EDITOR_MAX_ROWS',
    typeof C.EDITOR_MAX_COLS === 'number' && C.EDITOR_MAX_COLS > 0 &&
    C.EDITOR_MAX_ROWS === 0,
    '宽 ' + C.EDITOR_MAX_COLS + ' / 高 ' + (C.EDITOR_MAX_ROWS === 0 ? '不限' : C.EDITOR_MAX_ROWS));
}

// ================= 收尾 =================
export const result = { pass, fail, fails, name: '编辑器自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`编辑器自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✔');
  process.exit(0);
}
