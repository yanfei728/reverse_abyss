#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * test_engine.mjs —— 命令行自检(不开浏览器也能验证)
 * ==================================================
 *     node tools/test_engine.mjs            全套(含逐跳物理模拟)
 *     node tools/test_engine.mjs --fast     跳过逐跳模拟(快)
 *
 * 检查内容:
 *   ① levels.js 是不是和 levels/*.json 同步(改了 json 忘了 sync 会在这里报)
 *   ② 物理自检:站着、跳跃、二段跳、翻滚、落脚容错、弹簧板、出口判定
 *   ③ 主循环:掉出世界回起点、碰到出口切下一层(渐出→暗场→渐入)
 *   ④ 塔:同一个种子 = 同一座塔、层数、相邻层不重复、镜像
 *   ⑤ 关卡池:每一层的"从出生点爬到出口"都真的模拟过一遍
 *   ⑥ 绘制冒烟:开局界面 / 设置 / 游玩 / 关卡切换 / 结算 / 关卡池为空,全都画一遍不崩
 *
 * 全 PASS 退出码 0。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import vm from 'node:vm';
import { loadEngine, buildPack, ROOT, ENGINE } from './loader.mjs';

const FAST = process.argv.includes('--fast');
const t0 = Date.now();
let pass = 0, fail = 0;
const fails = [];

function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }

const RA = loadEngine();
const canvas = RA.__canvas;
const ctx = canvas.getContext('2d');

// ================= ① levels.js 与 levels/*.json 同步 =================
head('关卡数据:levels/*.json 与内嵌 levels.js 是否一致');
{
  const dir = join(ROOT, 'levels');
  const jsons = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  const embedded = RA.LEVEL_DATA || {};
  check('levels.js 存在并且有内容', Object.keys(embedded).length > 0,
    Object.keys(embedded).length + ' 个关卡');
  jsons.forEach((f) => {
    const id = basename(f, '.json');
    const disk = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const same = JSON.stringify(embedded[id]) === JSON.stringify(disk);
    check(`levels.js 里的 ${id} 和 ${f} 一模一样`, same,
      same ? '' : '跑一下 node tools/sync_levels.mjs');
  });
  const extra = Object.keys(embedded).filter((k) => jsons.indexOf(k + '.json') < 0);
  check('levels.js 里没有已经删掉的关卡', extra.length === 0, extra.join(','));
  // 编辑器这一轮还没接新格式,它「保存到游戏」写出来的还是老格式 txt ——
  // 那种文件能读、但游戏不把它当关卡源头(同步不打包它),所以只提醒,不算失败。
  const legacy = readdirSync(dir).filter((f) => f.endsWith('.txt') && !f.startsWith('_'));
  if (legacy.length) {
    console.log('  ⚠  levels/ 里还有老格式的 txt(编辑器这轮写的):' + legacy.join('、') +
      ' —— 引擎能读,但不会被 sync 打包成关卡;下一轮编辑器接新格式后就不会再有');
  }
}

// ================= ①b 页面引用的脚本 =================
head('页面引用的脚本:路径对不对、顺序和引擎清单一致吗');
{
  const scripts = (file, prefix) => {
    const html = readFileSync(join(ROOT, file), 'utf8');
    const out = [];
    const re = /<script\s+src="([^"]+)"\s*>/g;
    let m;
    while ((m = re.exec(html))) out.push(m[1].replace(prefix, ''));
    return out;
  };
  const idx = scripts('index.html', '');
  check('index.html 引用了全部引擎脚本(顺序和 loader.mjs 一致)',
    idx.slice(0, -1).join(',') === ENGINE.join(','),
    idx.length + ' 个 / 期望 ' + (ENGINE.length + 1));
  check('index.html 最后引的是 main.js', idx[idx.length - 1] === 'js/main.js');
  idx.forEach((s) => check('index.html 里 ' + s + ' 这个文件存在', existsSync(join(ROOT, s))));

  const br = scripts('tests/browser.html', '../');
  check('tests/browser.html 引用的脚本和 index.html 一样',
    br.slice(0, -1).join(',') === ENGINE.join(','), br.length + ' 个');
  br.forEach((s) => check('tests/browser.html 里 ' + s + ' 这个文件存在', existsSync(join(ROOT, s))));

  check('css/style.css 存在', existsSync(join(ROOT, 'css/style.css')));
  check('README.md 存在', existsSync(join(ROOT, 'README.md')));
}

// ================= ② 关卡池体检 =================
head('关卡池体检');
const pack = buildPack(RA);
check('关卡池非空', pack.pool.length > 0, pack.pool.length + ' 个模板');
pack.pool.forEach((e) => {
  check(`${e.id} 尺寸合理`, e.rows >= 8 && e.cols >= 6, `${e.rows}×${e.cols}`);
});
pack.bad.forEach((b) => console.log('  ⚠  ' + b.id + ': ' + b.messages.join('; ')));

// 关卡数据本身:id / 难度 / 验过没有 / 大小 / objects / asc(名字已经去掉了)
pack.pool.forEach((e) => {
  const d = e.data || {};
  check(e.id + ' 的数据里 id 和池子里的键一致', d.id === e.id, String(d.id));
  check(e.id + ' 的 difficulty 是 1~4 档的整数',
    Number.isInteger(d.difficulty) && d.difficulty >= 1 && d.difficulty <= 4,
    String(d.difficulty));
  check(e.id + ' 的 verified 是布尔值', typeof d.verified === 'boolean', String(d.verified));
  check(e.id + ' 的 size 和 asc 对得上',
    !!d.size && d.size.cols === e.cols && d.size.rows === e.rows,
    JSON.stringify(d.size) + ' / 实际 ' + e.cols + '×' + e.rows);
  check(e.id + ' 的 objects 是数组', Array.isArray(d.objects), JSON.stringify(d.objects));
  check(e.id + ' 的 asc 是一行一项的数组,行数和 size.rows 一致',
    Array.isArray(d.asc) && d.asc.length === e.rows,
    (Array.isArray(d.asc) ? d.asc.length : typeof d.asc) + ' 行');
  check(e.id + ' 的 asc 里没有注释残留',
    (d.asc || []).every((l) => !/^\s*\/\//.test(l)));
  check(e.id + ' 的关卡数据里没有名字字段(名字已经去掉了)', d.name === undefined);
});

head('关卡数据:id / 难度 / verified / size / objects / asc 怎么读');
{
  // 难度:1~4 档,超范围夹回来,没写就是 1 档;能认数字也能认字符串
  const dOk = RA.Level.fromData({ id: 'd', difficulty: 3, verified: false, asc: ['++G', '+P+', '^^^'] });
  check('难度 3 读出来就是 3', dOk.difficulty === 3, String(dOk.difficulty));
  check('verified: false 读出来就是没验过', dOk.verified === false);
  check('难度写字符串也能认', RA.Level.fromData({ id: 'd', difficulty: '2', asc: ['++G', '+P+', '^^^'] })
    .difficulty === 2);
  check('难度超范围会夹回 1~4',
    RA.Level.fromData({ id: 'd', difficulty: 99, asc: ['++G', '+P+', '^^^'] }).difficulty === 4 &&
    RA.Level.fromData({ id: 'd', difficulty: 0, asc: ['++G', '+P+', '^^^'] }).difficulty === 1);
  check('没写难度就是 1 档,没写 verified 当成验过',
    (() => {
      const lv = RA.Level.fromData({ id: 'd', asc: ['++G', '+P+', '^^^'] });
      return lv.difficulty === 1 && lv.verified === true;
    })());

  // 大小:json 里写的 size 和 asc 对不上要提醒,而且以 asc 为准
  const bad = RA.Level.fromData({ id: 's', size: { cols: 9, rows: 9 }, asc: ['++G', '+P+', '^^^'] });
  check('size 和 asc 对不上会提醒一句',
    bad.warnings.length === 1 && bad.warnings[0].indexOf('大小') >= 0, bad.warnings.join('; '));
  check('大小以 asc 为准(3×3)', bad.cols === 3 && bad.rows === 3);
  const good = RA.Level.fromData({ id: 's', size: { cols: 3, rows: 3 }, asc: ['++G', '+P+', '^^^'] });
  check('size 对得上就没有提醒', good.warnings.length === 0, good.warnings.join('; '));

  // objects:带参数的元素。还没实现的东西只留数据不报错;注册过的类型会真的生成实体
  const ob = RA.Level.fromData({
    id: 'o',
    objects: [{ type: 'fireball', col: 1, row: 1, params: { speed: 120 } }],
    asc: ['++G', '+P+', '^^^']
  });
  check('objects 会读进 level.objects', ob.objects.length === 1 &&
    ob.objects[0].type === 'fireball' && ob.objects[0].params.speed === 120,
    JSON.stringify(ob.objects));
  check('还没实现的怪物(火球)只留数据,不生成实体也不报错',
    ob.entities.filter((e) => e.constructor.name === 'Fireball').length === 0 &&
    ob.warnings.length === 0);
  class FakeMonster extends RA.Entity {}
  FakeMonster.type = 'fake-monster';
  RA.register(FakeMonster);
  const ob2 = RA.Level.fromData({
    id: 'o2',
    objects: [{ type: 'fake-monster', col: 0, row: 0, params: { a: 1 } }],
    asc: ['++G', '+P+', '^^^']
  });
  check('在实体类上写了 type 再注册,objects 里那一条就会生成实体',
    ob2.entities.some((e) => e instanceof FakeMonster));
  delete RA.BY_TYPE['fake-monster'];

  // 三种写法都要能读:json 对象 / JSON 字符串(导入 .json 文件)/ 老格式纯地图文本
  const asJsonText = JSON.stringify({
    id: 'imported', difficulty: 2, verified: false,
    size: { cols: 3, rows: 3 }, objects: [], asc: ['++G', '+P+', '^^^']
  });
  const rImport = RA.LevelPack.validate(asJsonText, 'imported');
  check('导入一个 .json 字符串也能读(还带着难度和 verified)',
    rImport.ok && rImport.difficulty === 2 && rImport.verified === false);
  const rLegacy = RA.LevelPack.validate('// name: 老格式\n++G\n+P+\n^^^\n', 'legacy');
  check('老格式的地图文本照样读得进来(编辑器这一轮还没改)',
    rLegacy.ok && rLegacy.name === '老格式' && rLegacy.rows === 3,
    rLegacy.name + ' ' + rLegacy.rows + ' 行');
}

head('http 打开时会 fetch levels/<id>.json(磁盘上的内容盖过内嵌那份)');
{
  const realFetch = globalThis.fetch;
  const realLoc = globalThis.location;
  const dir = join(ROOT, 'levels');
  const files = {};
  readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .forEach((f) => { files['levels/' + f] = readFileSync(join(dir, f), 'utf8'); });

  globalThis.location = { protocol: 'http:', search: '', href: 'http://localhost:8000/' };
  globalThis.fetch = (url) => Promise.resolve({
    ok: Object.prototype.hasOwnProperty.call(files, url),
    status: Object.prototype.hasOwnProperty.call(files, url) ? 200 : 404,
    text: () => Promise.resolve(files[url] || '')
  });

  // ① 内嵌那份故意写坏:id 一样但地图完全不同,看 fetch 到的会不会盖回来
  const fake = {
    floor01: { id: 'floor01', difficulty: 1, verified: false, size: { cols: 3, rows: 3 }, asc: ['++G', '+P+', '^^^'] },
    floor02: { id: 'floor02', asc: ['++G', '+P+', '^^^'] }
  };
  let packLive = null;
  RA.LevelPack.load(fake, (p) => { packLive = p; });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const e1 = packLive && packLive.pool.filter((e) => e.id === 'floor01')[0];
  check('http 下真的去 fetch 了 levels/<id>.json',
    !!packLive && !!packLive.live && packLive.pool.every((e) => e.liveText));
  check('磁盘上那份盖过了内嵌那份(尺寸/verified 都跟着变)',
    !!e1 && e1.rows === 32 && e1.cols === 22 && e1.verified === true,
    e1 ? (e1.cols + '×' + e1.rows + ' verified=' + e1.verified) : '没有这一层');

  // ② 只有老格式 txt 的层:json 读不到就退回 txt
  const files2 = { 'levels/tenant.txt': '// name: 老 txt 层\n++G\n+P+\n^^^\n' };
  globalThis.fetch = (url) => Promise.resolve({
    ok: Object.prototype.hasOwnProperty.call(files2, url),
    status: Object.prototype.hasOwnProperty.call(files2, url) ? 200 : 404,
    text: () => Promise.resolve(files2[url] || '')
  });
  let packTxt = null;
  RA.LevelPack.load({ tenant: { id: 'tenant', asc: ['+++', '+++', '+++'] } }, (p) => { packTxt = p; });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const e2 = packTxt && packTxt.pool[0];
  check('没有 json 时会退回读老格式的 txt',
    !!e2 && e2.liveText && e2.rows === 3 && e2.name === '老 txt 层',
    e2 ? (e2.name + ' ' + e2.rows + ' 行') : '没读到');

  // ③ 两种都没有:保留内嵌那份,不报错
  globalThis.fetch = () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
  let packNone = null;
  RA.LevelPack.load({ nowhere: { id: 'nowhere', asc: ['++G', '+P+', '^^^'] } }, (p) => { packNone = p; });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  check('磁盘上什么都没有时,继续用内嵌那份(不报错、不空池子)',
    !!packNone && packNone.pool.length === 1 && !packNone.pool[0].liveText);

  globalThis.fetch = realFetch;
  globalThis.location = realLoc;
}

head('跳跃包络:粗筛不许把真能跳的边拦掉(回归)');
{
  // ① envelope 必须单调:往上越高,允许的横向距离不能反而变大
  // 单调 = 跳得越低,允许的横向距离只能更大(不能反过来)
  let mono = true, worst = '';
  for (let dy = 10; dy <= 300; dy += 10) {
    for (let dx = 0; dx <= 640; dx += 20) {
      if (RA.Reach.envelope(dy, dx) && !RA.Reach.envelope(dy - 10, dx)) {
        mono = false; worst = dy + 'px 高说能到 ' + dx + 'px,但 ' + (dy - 10) + 'px 高反而说不行';
      }
    }
  }
  check('envelope 单调(老表:180px 高说能横跨 300px,130px 高却说不行)', mono, worst);

  // ② 造一条老写法会误杀的边:往上 3 格(135px),两块平台之间横着差 4 格(180px)
  const rows = [];
  for (let r = 0; r < 12; r++) rows.push(new Array(16).fill('+').join(''));
  const put = (r, c, s) => { rows[r] = rows[r].slice(0, c) + s + rows[r].slice(c + s.length); };
  for (let c = 1; c <= 4; c++) { put(10, c, '^'); put(11, c, '='); }
  put(9, 2, 'P');
  for (let c = 10; c <= 12; c++) put(7, c, '~');
  put(6, 10, 'G');
  const lv = RA.Level.fromText(rows.join('\n'), { fallbackName: 'hop' });
  const list = RA.Reach.platforms(lv);
  const A = list.filter((p) => p.row === 10)[0];
  const B = list.filter((p) => p.row === 7)[0];
  check('造出来的边是"往上 135px、横向 225px"',
    !!A && !!B && A.top - B.top === 135 && RA.Reach.gapX(A, B) === 225,
    A && B ? ((A.top - B.top) + 'px 高,' + RA.Reach.gapX(A, B) + 'px 远') : '没造出来');
  check('保守包络不敢确认这一跳(所以绝不能拿它当门槛)',
    RA.Reach.envelope(135, 225) === false);
  check('粗筛 couldReach 放行这一跳', RA.Reach.couldReach(135, 225) === true);
  check('真物理模拟:这一跳跳得上去', RA.Reach.findHop(lv, A, B).ok === true,
    RA.Reach.findHop(lv, A, B).reason || '');
  const rp = RA.Reach.path(lv, { sim: true });
  check('整条路线也通(以前这一步会被误报"爬不上去")', rp.ok === true, rp.reason || '');
  check('gapX 算的是两块落脚面之间的空隙(重叠 = 0)',
    RA.Reach.gapX({ left: 0, right: 100 }, { left: 150, right: 200 }) === 50 &&
    RA.Reach.gapX({ left: 150, right: 200 }, { left: 0, right: 100 }) === 50 &&
    RA.Reach.gapX({ left: 0, right: 200 }, { left: 100, right: 300 }) === 0);
}

// ================= ③④⑤ 自检主体 =================
const game = new RA.Game(canvas, pack);
const res = RA.Smoke.runAll(game, (line, kind) => {
  if (!line) return;
  if (kind === 'pass') { pass++; }
  else if (kind === 'fail') {
    if (line.indexOf('自检未通过') < 0) {
      fail++;
      fails.push(line.replace(/^\s*FAIL\s+/, '').trim());
    }
  }
  console.log(line);
}, { sim: !FAST });

// ================= ⑥ 绘制冒烟 =================
// 浏览器里改过的层:读不到 txt(file://)时游戏要用浏览器那份
const ovId0 = pack.pool[0].id;
RA.LevelPack.putOverride(ovId0, '// name: 起攀(改过)\n+++G+\n+++++\n+P+++\n+^^^+\n+===+\n');
const g2 = new RA.Game(canvas, pack);
check('游戏会拿浏览器里的覆盖换掉同一层', g2.pool()[0].text === RA.LevelPack.readOverrides()[ovId0]);
check('覆盖之后名字也换成新的', g2.pool()[0].name.indexOf('改过') >= 0, g2.pool()[0].name);
check('池子里没有多出一层(还是同一个 id)', g2.pool()[0].id === ovId0);
RA.LevelPack.removeOverride(ovId0);
const g3 = new RA.Game(canvas, pack);
check('清掉覆盖之后回到 txt / 内嵌那份',
  g3.pool()[0].text === RA.LEVEL_TEXT[ovId0]);
check('读得到 txt 时以 txt 为准(liveText 的层不会被覆盖盖住)',
  (() => {
    RA.LevelPack.putOverride(ovId0, '// name: 不该赢\n+++G+\n+++++\n+P+++\n+^^^+\n+===+\n');
    const p2 = buildPack(RA);
    p2.pool[0].liveText = true;                 // 假装 http 下 fetch 到了 txt
    const g4 = new RA.Game(canvas, p2);
    const got = g4.pool()[0].text === RA.LEVEL_TEXT[ovId0];
    RA.LevelPack.removeOverride(ovId0);
    return got;
  })());

head('绘制冒烟:每个状态都画一遍,不许抛异常');
function drawSafe(label, frames, before) {
  try {
    if (before) before();
    for (let i = 0; i < frames; i++) {
      game.input.endFrame();
      game.update(1 / 60);
      game.draw(ctx);
    }
    check(label, true);
  } catch (e) {
    check(label, false, (e && e.message) + '\n' + (e && e.stack));
  }
}

drawSafe('开局界面能画(8 层)', 3, () => { game.setFloors(8); game.toTitle(); });
drawSafe('开局界面能画(24 层)', 3, () => { game.setFloors(24); game.toTitle(); });
drawSafe('设置面板能画(24 层,列表会被压缩)', 3, () => {
  game.setFloors(24); game.toTitle(); game.openSettings();
});
drawSafe('设置面板能画(最少 3 层)', 3, () => {
  game.setFloors(3); game.toTitle(); game.openSettings();
});
drawSafe('设置面板里的种子输入框能画', 3, () => {
  game.setFloors(8); game.openSettings();
  game.seedEditing = true; game.seedBuffer = 'RA-ABC';
});
drawSafe('设置面板里的导入提示能画', 3, () => {
  game.seedEditing = false; game.importMsg = '已导入「测试」'; game.importT = 0;
});
drawSafe('告别页能画', 2, () => { game.closeSettings(); game.quitGame(); });
drawSafe('游玩中能画(按住右+跳)', 150, () => {
  game.setFloors(8);
  game.startRun();
  game.input.down = { left: false, right: true, jump: false };
});
drawSafe('爬升过渡能画', 90, () => {
  game.player.x = game.level.goalX + (game.level.tile - game.player.w) / 2;
  game.player.y = game.level.goalFeet - game.player.h;
  game.update(1 / 60);
  game.draw(ctx);
});
drawSafe('登顶结算能画', 60, () => {
  game.floor = game.tower.height - 1;
  game.beginClimb();
  let guard = 0;
  while (game.state === 'climb' && guard++ < 200) { game.update(1 / 60); game.draw(ctx); }
  game.draw(ctx);
});
check('爬到塔顶会进结算状态', game.state === 'victory', 'state=' + game.state);

// 关卡池为空时:开局界面要能画,并且不能开始游戏
{
  const quiet = console.warn;
  console.warn = () => { };                 // 这一条本来就会打警告,自检里静音
  const empty = new RA.Game(canvas, { pool: [], bad: [] });
  let ok = true, msg = '';
  try {
    for (let i = 0; i < 3; i++) { empty.update(1 / 60); empty.draw(ctx); }
    ok = empty.startRun() === false && empty.state === 'title';
  } catch (e) { ok = false; msg = e && e.message; }
  console.warn = quiet;
  check('关卡池为空时不崩、也进不了游戏', ok, msg);
}

// ================= ⑥b 界面布局(看不到浏览器,就用数字检查) =================
head('界面布局:控件都在画布里、不互相压住');
{
  const W = RA.C.WIDTH, H = RA.C.HEIGHT;
  const inside = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---- 开局界面:只有 开始 / 退出 / 右下角齿轮 ----
  const L = RA.UI.titleLayout();
  const tkeys = ['start', 'quit', 'gear'];
  check('开局界面只有三个控件:开始 / 退出 / 设置齿轮',
    Object.keys(L).join(',') === tkeys.join(','), Object.keys(L).join(','));
  check('开局界面的控件都在画布内', tkeys.every((k) => inside(L[k])));
  check('开始 / 退出 / 齿轮 互不重叠',
    !hit(L.start, L.quit) && !hit(L.start, L.gear) && !hit(L.quit, L.gear));
  check('齿轮在右下角', L.gear.x > W * 0.85 && L.gear.y > H * 0.8);
  check('开始按钮比退出按钮显眼(更大更靠上)',
    L.start.h > L.quit.h && L.start.y < L.quit.y);

  // ---- 设置面板:以前那些选项都挪进来了 ----
  const S = RA.UI.settingsLayout();
  const skeys = ['panel', 'close', 'list', 'seed', 'floorsMinus', 'floorsPlus',
    'mirror', 'reroll', 'importer', 'editor', 'info'];
  check('设置面板里有 种子 / 塔高 / 镜像 / 重构 / 导入 / 编辑器',
    skeys.every((k) => !!S[k]), skeys.filter((k) => !S[k]).join(','));
  check('设置面板在画布内', inside(S.panel));
  check('设置面板里的东西都在面板里',
    skeys.filter((k) => k !== 'panel').every((k) =>
      S[k].x >= S.panel.x && S[k].x + S[k].w <= S.panel.x + S.panel.w &&
      S[k].y >= S.panel.y && S[k].y + S[k].h <= S.panel.y + S.panel.h),
    skeys.filter((k) => k !== 'panel' && !(S[k].x >= S.panel.x &&
      S[k].x + S[k].w <= S.panel.x + S.panel.w && S[k].y >= S.panel.y &&
      S[k].y + S[k].h <= S.panel.y + S.panel.h)).join(','));
  const srows = ['close', 'list', 'seed', 'floorsMinus', 'floorsPlus', 'mirror',
    'reroll', 'importer', 'editor', 'info'];
  let overlap = '';
  for (let i = 0; i < srows.length; i++) {
    for (let j = i + 1; j < srows.length; j++) {
      if (hit(S[srows[i]], S[srows[j]])) overlap += srows[i] + '×' + srows[j] + ' ';
    }
  }
  check('设置面板里的控件互不重叠', overlap === '', overlap);
  check('设置面板里的行都在右侧那一列',
    ['seed', 'mirror', 'reroll', 'importer', 'editor', 'info'].every((k) =>
      S[k].x >= S.panel.x + S.panel.w / 2));
  check('设置面板不会压住开局界面(它是覆盖层)', S.panel.x < L.start.x &&
    S.panel.x + S.panel.w > L.start.x + L.start.w,
    '设置面板 ' + S.panel.w + ' 宽,盖住中间');

  const V = RA.UI.victoryLayout();
  const vkeys = ['again', 'reroll', 'title'];
  check('结算面板在画布内', inside(V.panel));
  check('结算按钮都在面板里且不重叠',
    vkeys.every((k) => V[k].x >= V.panel.x && V[k].x + V[k].w <= V.panel.x + V.panel.w &&
      V[k].y >= V.panel.y && V[k].y + V[k].h <= V.panel.y + V.panel.h) &&
    !hit(V.again, V.reroll) && !hit(V.reroll, V.title) && !hit(V.again, V.title));
  check('结算按钮不会压住标题文字(面板上半部留空)',
    vkeys.every((k) => V[k].y > V.panel.y + 200));
}

// ================= ⑥c 关卡切换:渐出 → 暗场 → 渐入 =================
head('关卡切换:旧层渐出 → 中间压暗 → 新层渐入');
{
  const g = new RA.Game(canvas, pack);
  g.setFloors(8);
  g.startRun();
  g.player.x = g.level.goalX + (g.level.tile - g.player.w) / 2;
  g.player.y = g.level.goalFeet - g.player.h;
  g.update(1 / 60);
  const c = g.climb;
  check('碰到出口进入 climb 状态', g.state === 'climb' && !!c && !!c.next);

  if (c && c.next) {
    // 每一帧"画一层"时的透明度都记下来:过渡必须是靠透明度,不是把整层上下推
    const alphas = [];
    const real = g.drawWorldFade;
    g.drawWorldFade = function (ctx, level, cam, player, alpha) {
      if (level && alpha > 0.004) alphas.push(alpha);      // 和真实现一样:太淡就不画
      return real.call(this, ctx, level, cam, player, alpha);
    };

    let f = g.climbFade(c);
    check('刚开始:旧层还全亮、新层还没出现、还没压暗',
      f.old > 0.95 && f.next < 0.05 && f.dim < 0.05,
      'old=' + f.old.toFixed(2) + ' next=' + f.next.toFixed(2) + ' dim=' + f.dim.toFixed(2));
    check('过渡不再靠"把旧层往下推 / 新层从上面降"',
      c.oldCam.panY === 0 && c.nextCam.panY === 0);
    check('旧层和新层都在自己的镜头上(过渡里镜头不跳)',
      !!c.oldCam && !!c.nextCam && c.nextCam.panY === 0);

    g.draw(ctx);
    check('第一帧画的是"旧层"这一个(不透明),新层还没画',
      alphas.length === 1 && alphas[0] > 0.95, JSON.stringify(alphas.map((a) => +a.toFixed(2))));

    // 跑到一半:旧层淡出得差不多、新层刚起来、中间那层暗场最浓
    const total = Math.ceil(RA.C.CLIMB_TIME * 60);
    for (let i = 0; i < Math.floor(total / 2) - 1 && g.state === 'climb'; i++) {
      g.update(1 / 60); g.draw(ctx);
    }
    if (g.state === 'climb') {
      f = g.climbFade(g.climb);
      check('一半:旧层几乎淡没了', f.old < 0.1, 'old=' + f.old.toFixed(2));
      check('一半:新层还没完全亮起来', f.next < 0.4, 'next=' + f.next.toFixed(2));
      check('一半:中间压暗最浓(两层不会叠着看)',
        f.dim > 0.9 && RA.C.CLIMB_DIM > 0, 'dim=' + f.dim.toFixed(2));
      check('一半:确实两层都在淡(同一帧里画了旧层和新层)',
        alphas.some((a) => a > 0.05 && a < 0.95) && alphas.length > 2,
        JSON.stringify(alphas.slice(0, 8).map((a) => +a.toFixed(2))));
    } else {
      check('一半的时候还在过渡里', false, 'state=' + g.state);
    }

    // 快到终点:最后一帧过渡里,新层应该基本全亮、旧层已经没了
    let lastFade = null;
    let guard2 = 0;
    while (g.state === 'climb' && guard2++ < 200) {
      lastFade = g.climbFade(g.climb);
      g.update(1 / 60); g.draw(ctx);
    }
    check('快结束时:新层基本全亮、旧层已经没了',
      !!lastFade && lastFade.next > 0.9 && lastFade.old < 0.1,
      lastFade ? ('old=' + lastFade.old.toFixed(2) + ' next=' + lastFade.next.toFixed(2))
        : '过渡没有在跑');

    g.drawWorldFade = real;
    check('过渡结束后站进新楼层、镜头偏移归零',
      g.state === 'play' && g.floor === 1 && g.camera.panY === 0);
    check('过渡结束后画的是新的那层(透明度回到 1)',
      g.climbFade({ t: RA.C.CLIMB_TIME }).next === 1);
  }
}
head('开局界面 + 设置面板交互');
{
  const g = new RA.Game(canvas, pack);
  const T = RA.UI.titleLayout();
  const S = RA.UI.settingsLayout();
  const click = (rect) => { g.input.clicks.push({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }); };
  const step = () => { g.update(1 / 60); g.input.endFrame(); };

  g.setFloors(8);
  g.toTitle();
  check('开局界面默认不显示设置', g.settings === false && g.state === 'title');
  check('开局界面不显示种子 / 塔高这些(它们只在设置里)',
    !T.seed && !T.floorsPlus && !T.reroll && !T.mirror,
    Object.keys(T).join(','));

  // 点右下角齿轮 → 设置
  click(T.gear); step();
  check('点右下角齿轮打开设置', g.settings === true && g.state === 'title');

  const seed0 = g.tower.seedLabel;
  click(S.reroll); step();
  check('设置里点「重构塔」会换一座塔', g.tower.seedLabel !== seed0,
    seed0 + ' → ' + g.tower.seedLabel);

  const h0 = g.tower.height;
  click(S.floorsPlus); step();
  check('设置里点「＋」塔高 +1', g.tower.height === h0 + 1, h0 + ' → ' + g.tower.height);
  click(S.floorsMinus); step();
  check('设置里点「−」塔高 -1', g.tower.height === h0);

  const mirror0 = g.mirror;
  click(S.mirror); step();
  check('设置里点「镜像」会开关', g.mirror !== mirror0);

  const seedA = g.tower.seedLabel;
  g.input.edge.reroll = true; step();
  check('设置里按 R 也能重构', g.tower.seedLabel !== seedA);

  g.input.edge.up = true; step();
  check('设置里按 ↑ 能加塔高', g.tower.height === h0 + 1);
  g.input.edge.down = true; step();

  // 种子编辑:点种子框 → 输入 → 回车
  click(S.seed); step();
  check('设置里点种子框进入输入状态', g.seedEditing === true);
  g.input.typed = 'ABCDEF'; step();
  g.input.edge.confirm = true; step();
  check('输入种子 + 回车会按那个种子重构',
    RA.labelToSeed(g.tower.seedLabel) === RA.labelToSeed('ABCDEF'),
    g.tower.seedLabel);

  // 设置开着的时候,点"开始"的位置不应该误开始
  const hBefore = g.tower.height;
  click(T.start); step();
  check('设置覆盖时点「开始」不会误开始游戏', g.state === 'title',
    'state=' + g.state + ' height=' + hBefore);

  // Esc 关掉设置
  g.input.edge.back = true; step();
  check('按 Esc 关闭设置', g.settings === false && g.state === 'title');

  // 开始
  click(T.start); step();
  check('点「开始攀爬」能进游戏', g.state === 'play' && g.floor === 0);

  // 游玩中按 Esc 回开局界面
  g.input.edge.back = true; step();
  check('游玩中按 Esc 回开局界面', g.state === 'title' && g.settings === false);

  // 关卡编辑器按钮(在设置里):点一下不该崩(浏览器里会开 editor.html)
  let editorOk = true, editorErr = '';
  try {
    click(T.gear); step();
    click(S.editor); step();
  } catch (e) { editorOk = false; editorErr = e && e.message; }
  check('设置里点「关卡编辑器」不会崩(会去开 editor.html)', editorOk, editorErr);
  check('点了编辑器之后有提示文字', String(g.importMsg || '').indexOf('编辑器') >= 0,
    g.importMsg);

  // 退出游戏 → 告别页(浏览器不让关标签页时的兜底)
  g.input.edge.back = true; step();               // 先关设置
  click(T.quit); step();
  check('点「退出游戏」会进告别页', g.state === 'bye', 'state=' + g.state);
  let byeDraw = true;
  try { g.draw(ctx); } catch (e) { byeDraw = false; }
  check('告别页画得出来', byeDraw);
  g.input.edge.back = true; step();
  check('告别页按 Esc 回开局界面', g.state === 'title');

  // 自定义关卡(编辑器存进来的那种)会被并进关卡池,且不会重复
  RA.LevelPack.putCustom('自检自定义层',
    '// name: 自检自定义层\n+++G+\n+++++\n+P+++\n+^^^+\n+===+\n');
  const g2 = new RA.Game(canvas, pack);
  const ids = g2.pool().map((e) => e.id);
  check('自定义关卡进了关卡池', ids.indexOf(RA.LevelPack.customId('自检自定义层')) >= 0);
  check('关卡池里没有重复的 id', ids.length === new Set(ids).size);
  RA.LevelPack.removeCustom(RA.LevelPack.customId('自检自定义层'));

  // ---------- 编辑器新存的层,不刷新页面也得能进场(回归) ----------
  // 编辑器「保存到游戏」给**新**关卡写的是 overrides[id](id 还不在关卡池里,
  // 因为没跑过 node tools/sync_levels.mjs)。这里盯着它:
  // 池子必须立刻多出这一层,重构塔要抽得到,名字要进得了塔结构表。
  const g3 = new RA.Game(canvas, pack);
  const newId = '自检新存的层';
  const newText = '// name: 自检新存的层\n+++G+\n++++\n+P++\n+^^^+\n+===+\n';
  const before = g3.pool().length;
  RA.LevelPack.putOverride(newId, newText);
  const afterStore = g3.pool();
  check('编辑器刚存的新层立刻进了关卡池(不用刷新页面、不用重构)',
    afterStore.length === before + 1 &&
    afterStore.map((e) => e.id).indexOf(newId) >= 0,
    before + ' → ' + afterStore.length + ' 个模板');
  check('它被标成"只在浏览器里"(等下次 sync 才正式进 levels.js)',
    !!afterStore.filter((e) => e.id === newId)[0].overrideOnly);
  check('那一层用的是编辑器里的文本(名字也是它)',
    afterStore.filter((e) => e.id === newId)[0].text === newText,
    afterStore.filter((e) => e.id === newId)[0].name);

  const beforeReroll = g3.pool().length;
  g3.openSettings();                            // 设置面板里的「重构塔」(R)
  g3.input.edge.reroll = true;
  g3.update(1 / 60); g3.input.endFrame();
  check('设置里按 R 重构塔之后,它还在池子里(而且没有多出第二条)',
    g3.pool().length === beforeReroll &&
    g3.pool().filter((e) => e.id === newId).length === 1,
    g3.pool().map((e) => e.id).join(','));

  // 塔结构表读的就是 tower.floors —— 多重构几次,新层必须真的抽到过
  g3.setFloors(24);
  let pickedName = 0, pickedId = 0, built = 0;
  for (let round = 0; round < 6; round++) {
    g3.newTower('EDITOR-NEW-' + round);
    for (let i = 0; i < g3.tower.height; i++) {
      if (g3.tower.floors[i].name === newId) pickedName++;
      if (g3.tower.floors[i].id === newId) pickedId++;
      if (g3.tower.level(i)) built++;
    }
  }
  check('重构出来的塔里能抽出编辑器新存的层(塔结构表会显示它的名字)',
    pickedId > 0 && pickedName === pickedId, pickedId + ' 层');
  check('抽到的层都建得出来(名字 / 地形都在)', built === 6 * g3.tower.height);

  // 老关卡(池子里已经有这个 id)那条路不能被改坏:只换内容,不多出一层
  const poolIds = g3.pool().map((e) => e.id);
  const oldId = poolIds[0];
  const oldText = RA.LevelPack.readOverrides()[oldId] || RA.LEVEL_TEXT[oldId]
    || (pack.pool.filter((e) => e.id === oldId)[0] || {}).text;
  RA.LevelPack.putOverride(oldId, oldText.replace('// name:', '// name:'));
  g3.retower();
  const afterIds = g3.pool().map((e) => e.id);
  check('改过的老关卡只换内容,池子里不会多出一层',
    afterIds.length === poolIds.length && afterIds.length === new Set(afterIds).size,
    before + ' → ' + afterIds.length);
  RA.LevelPack.removeOverride(newId);
  RA.LevelPack.removeOverride(oldId);

  // ---------- 同一个关卡名在两把钥匙里(编辑器存过 + 游戏里导入过)只能算一层 ----------
  // 名字一样、来源不同(custom_xxx / overrides)其实是同一层的两份副本。
  // 不管的话塔结构表里会冒出两个同名的层。
  const g4 = new RA.Game(canvas, pack);
  const dupId = '两把钥匙的层';
  const dupText = '// name: 两把钥匙的层\n+++G+\n++++\n+P++\n+^^^+\n+===+\n';
  RA.LevelPack.putCustom(dupId, dupText);        // 游戏里「导入关卡」那份
  RA.LevelPack.putOverride(dupId, dupText);      // 编辑器「保存到游戏」那份
  const dupPool = g4.pool();
  const dupNames = dupPool.map((e) => e.name).filter((n) => n === dupId);
  check('同一个名字在两把钥匙里时,关卡池里只留一层(不会抽出两个同名层)',
    dupNames.length === 1, dupNames.length + ' 次 / ' + dupPool.map((e) => e.id).join(','));
  check('池子里的 id 依然是唯一的',
    dupPool.length === new Set(dupPool.map((e) => e.id)).size);
  // 反过来说:名字不同的两层都得留着(不能为了去重把别的层吃掉)
  RA.LevelPack.putOverride('另一个名字的层',
    dupText.replace(/两把钥匙的层/g, '另一个名字的层'));
  const bothPool = g4.pool();
  check('名字不同的两层都还在',
    bothPool.map((e) => e.name).indexOf(dupId) >= 0 &&
    bothPool.map((e) => e.name).indexOf('另一个名字的层') >= 0,
    bothPool.map((e) => e.name).join(','));
  RA.LevelPack.removeCustom(RA.LevelPack.customId(dupId));
  RA.LevelPack.removeOverride(dupId);
  RA.LevelPack.removeOverride('另一个名字的层');
}

// ================= ⑧ 真实入口 main.js 能不能跑起来 =================
head('浏览器入口 main.js:整条启动链路');
{
  let ok = true, msg = '';
  try {
    vm.runInThisContext(readFileSync(join(ROOT, 'js/main.js'), 'utf8'),
      { filename: 'js/main.js' });
  } catch (e) { ok = false; msg = (e && e.message) + '\n' + (e && e.stack); }
  check('main.js 能跑起来(它会自己 boot)', ok, msg);
  check('入口把 Game 建好了并挂在 RA.game 上', RA.game instanceof RA.Game);
  check('入口建好的游戏停在开局界面', RA.game && RA.game.state === 'title');

  if (RA.game) {
    let ran = true, err = '';
    try {
      RA.game.setFloors(6);
      RA.game.startRun();
      RA.game.input.down = { left: false, right: true, jump: false };
      for (let i = 0; i < 90; i++) {
        RA.game.input.endFrame();
        RA.game.update(1 / 60);
        RA.game.draw(ctx);
      }
    } catch (e) { ran = false; err = e && e.message; }
    check('从入口建出来的游戏能自己跑 90 帧(带输入)', ran, err);
    check('跑完之后角色在本层世界里(没掉出去)',
      RA.game.player.y < RA.game.level.worldH + RA.C.FALL_MARGIN);
  }
}

// ================= 收尾 =================
export const result = { pass, fail, fails, name: '引擎自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`合计:PASS ${pass}  FAIL ${fail}   用时 ${((Date.now() - t0) / 1000).toFixed(1)}s` +
    (FAST ? '(--fast:跳过了逐跳物理模拟)' : ''));
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✔');
  process.exit(0);
}
