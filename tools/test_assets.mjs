#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * test_assets.mjs —— 贴图自检
 * ============================
 *     node tools/test_assets.mjs
 *
 * 检查:
 *   ① 实体 / 天空 / 界面贴图真的在,都是真 PNG,而且和 tools/build_assets.mjs
 *      现在会画出来的内容**逐字节一致**(改了生成代码忘了重跑,这里会报);
 *      地块贴图(assets/tiles)不是这边生成的 —— 它们来自 textures/block 那套像素画,
 *      只检查"在不在、是不是方形、确实换成了贴图包里的图";
 *   ② 引擎的贴图表(Assets.FILES / TILE_IMAGES)和文件对得上;
 *   ③ 文件读不到时的兜底:没有 Image、图片加载失败都不能崩,继续用现画的那张;
 *   ④ 天空怎么选:不写按层循环 sky1→sky8→sky1,写了 // sky: N 就固定用它;
 *   ⑤ 背景真的画的是对应那张贴图,爬升过渡里两张天空都出现(淡入淡出);
 *   ⑥ 弹簧板 / 出口 / 浮石画的是 assets/entities 里自己那张贴图(压下去、
 *      收拢、呼吸这些动画还在);
 *   ⑦ 地块绘制:贴图和格子尺寸不一样时(16×16 像素画 / 128×128 大图 / 45×45 兜底)
 *      都铺满一格,云板只画上面一截,编辑器走的是同一套 RA.drawTile。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadEngine, buildPack, makeCanvas, ROOT } from './loader.mjs';
import { generateBuffers, pngSize, SKIES } from './build_assets.mjs';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }

const RA = loadEngine();
const C = RA.C;
const board = makeCanvas(960, 540);
const ctx = board.getContext('2d');
// 25号卡:活动内置普通池已清空;绘制/背景冒烟用只读归档的旧图(与旧原型行为一致)
const ARCHIVE = {};
const ARCHIVE_DIR = join(ROOT, 'levels', 'archive', 'legacy-pool-2026-11-09');
if (existsSync(ARCHIVE_DIR)) {
  readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith('.json')).sort().forEach((f) => {
    ARCHIVE[basename(f, '.json')] = JSON.parse(readFileSync(join(ARCHIVE_DIR, f), 'utf8'));
  });
}
const pack = buildPack(RA, ARCHIVE);

// ================= ① 贴图文件 =================
head('贴图文件:在不在、是不是真 PNG、和生成代码一不一致');
const generated = generateBuffers();                        // 代码画的:实体 / 天空 / 界面
const proceduralTiles = generateBuffers({ tiles: true });   // --restore-tiles 那套老地块
const tileKeys = Object.keys(RA.Assets.FILES).filter((n) => n.indexOf('tiles/') === 0);
{
  const files = Object.keys(generated);
  const skies = files.filter((f) => f.startsWith('assets/sky/'));
  const ents = files.filter((f) => f.startsWith('assets/entities/'));
  check('地块贴图独立放在 assets/tiles/(5 张)', tileKeys.length === 5, tileKeys.join(' '));
  check('天空贴图独立放在 assets/sky/,张数 = config.SKY_COUNT',
    skies.length === C.SKY_COUNT, skies.length + ' 张 / SKY_COUNT=' + C.SKY_COUNT);
  check('开局界面背景独立放在 assets/ui/', files.indexOf('assets/ui/title.png') >= 0);
  check('实体贴图独立放在 assets/entities/(弹簧板/出口/浮石,3 张)',
    ents.length === 3, ents.join(' '));
  check('代码生成的贴图一共 ' + (C.SKY_COUNT + 1 + 3) + ' 张',
    files.length === C.SKY_COUNT + 1 + 3, files.length + ' 张');
  check('地块不在这里生成(跑 build_assets 不会把贴图包覆盖掉)',
    !files.some((f) => f.startsWith('assets/tiles/')));

  // 代码画的那几张:和生成代码逐字节一致
  files.forEach((rel) => {
    const p = join(ROOT, rel);
    if (!existsSync(p)) {
      check('文件存在:' + rel, false, '跑 node tools/build_assets.mjs');
      return;
    }
    const disk = readFileSync(p);
    const size = pngSize(disk);
    check(rel + ' 是真 PNG(' + (size ? size.w + '×' + size.h : '?') + ')', !!size);
    check(rel + ' 和 tools/build_assets.mjs 现在会画的一样',
      disk.equals(generated[rel]),
      disk.equals(generated[rel]) ? '' : '跑一下 node tools/build_assets.mjs');
  });

  // 地块:来自 textures/block 那套像素画,尺寸不一定是 45×45(画的时候缩放到一格)
  tileKeys.forEach((name) => {
    const rel = RA.Assets.FILES[name];
    const p = join(ROOT, rel);
    if (!existsSync(p)) {
      check('地块文件存在:' + rel, false);
      return;
    }
    const disk = readFileSync(p);
    const sz = pngSize(disk);
    check(rel + ' 是真 PNG(' + (sz ? sz.w + '×' + sz.h : '?') + ')', !!sz);
    check(rel + ' 是正方形(一格,画的时候缩放到 ' + C.TS + '×' + C.TS + ')',
      !!sz && sz.w === sz.h, sz ? sz.w + '×' + sz.h : '?');
    check(rel + ' 用的是贴图包里的图(不是代码现画的那张)',
      !disk.equals(proceduralTiles[rel]),
      '文件和 --restore-tiles 生成的一模一样,说明贴图包没换上去');
  });
  check('--restore-tiles 那套老地块还在(45×45,后路留着)',
    ['grass_top', 'dirt', 'brick', 'stone', 'cloud'].every((n) => {
      const sz = pngSize(proceduralTiles['assets/tiles/' + n + '.png']);
      return sz && sz.w === C.TS && sz.h === C.TS;
    }));

  check('天空贴图是 960×540(和画布一样)',
    pngSize(generated['assets/sky/sky1.png']).w === C.WIDTH &&
    pngSize(generated['assets/sky/sky1.png']).h === C.HEIGHT);
  check('开局界面背景是 960×540',
    pngSize(generated['assets/ui/title.png']).w === C.WIDTH);
  check('弹簧板和浮石是 45×45(一格,和 config.TS 一样)',
    pngSize(generated['assets/entities/spring.png']).w === C.TS &&
    pngSize(generated['assets/entities/spring.png']).h === C.TS &&
    pngSize(generated['assets/entities/blink.png']).w === C.TS &&
    pngSize(generated['assets/entities/blink.png']).h === C.TS);
  check('出口光柱是 config.GOAL_WIDTH×GOAL_HEIGHT(判定盒那么大)',
    pngSize(generated['assets/entities/goal.png']).w === C.GOAL_WIDTH &&
    pngSize(generated['assets/entities/goal.png']).h === C.GOAL_HEIGHT);
  check('三张实体贴图长得都不一样',
    new Set(ents.map((f) => generated[f].toString('base64'))).size === 3);
  const b64 = (rel) => generated[rel].toString('base64');
  const uniq = new Set(skies.map((f) => b64(f)));
  check('8 张天空互不相同', uniq.size === C.SKY_COUNT, uniq.size + ' 种');
  check('天空的名字/配色表长度和贴图张数一致', SKIES.length === C.SKY_COUNT);
}

// ================= ② 引擎的贴图表 =================
head('引擎的贴图表:素材名和文件对得上');
{
  const FILES = RA.Assets.FILES;
  ['tiles/grass_top', 'tiles/dirt', 'tiles/brick', 'tiles/stone'].forEach((n) => {
    check('Assets.FILES 里有 ' + n, !!FILES[n]);
  });
  for (let i = 1; i <= C.SKY_COUNT; i++) {
    check('Assets.FILES 里有 sky/' + i + ' → assets/sky/sky' + i + '.png',
      FILES['sky/' + i] === 'assets/sky/sky' + i + '.png');
  }
  check('Assets.FILES 里有 ui/title', FILES['ui/title'] === 'assets/ui/title.png');
  ['entities/spring', 'entities/goal', 'entities/blink'].forEach((n) => {
    check('Assets.FILES 里有 ' + n + ' → assets/' + n + '.png',
      FILES[n] === 'assets/' + n + '.png', FILES[n]);
  });
  check('每个文件路径都真的存在',
    Object.keys(FILES).every((n) => existsSync(join(ROOT, FILES[n]))),
    Object.keys(FILES).filter((n) => !existsSync(join(ROOT, FILES[n]))).join(','));
  check('level.js 的 TILE_IMAGES 用的素材名都有文件',
    Object.keys(RA.TILE_IMAGES).every((ch) => !!FILES[RA.TILE_IMAGES[ch][0]]));
  check('地块贴图名和字符表一一对应(' + Object.keys(RA.TILE_IMAGES).length + ' 种)',
    Object.keys(RA.TILE_IMAGES).length === 5);
  check('新加的云板也有贴图:' + RA.TILE_IMAGES['-'][0],
    RA.Assets.FILES[RA.TILE_IMAGES['-'][0]] === 'assets/tiles/cloud.png');
  check('云板是"单向"的:不算实心,但算地块 / 算地面',
    RA.SOLID_CHARS.indexOf('-') < 0 && RA.isTileChar('-') &&
    RA.isOnewayChar('-') && RA.isGroundChar('-'));
  check('实心地块一个都没少(^ _ ~ =)',
    ['^', '_', '~', '='].every((ch) => RA.SOLID_CHARS.indexOf(ch) >= 0));
}

// ================= ③ 加载与兜底 =================
head('加载与兜底:读不到文件也不能崩,继续用现画的');
{
  const a = new RA.Assets();
  let called = false;
  a.loadAll(() => { called = true; });
  check('没有 Image 可用时 loadAll 也会回调', called && a.ready === true);
  check('每个素材名都能取到图(兜底画出来的)',
    a.names().every((n) => !!a.image(n) && a.image(n).width > 0));
  check('天空兜底图是 960×540',
    a.image('sky/3').width === C.WIDTH && a.image('sky/3').height === C.HEIGHT);
  check('地块兜底图是 45×45', a.image('tiles/dirt').width === C.TS);
  check('实体兜底图尺寸也对(弹簧板/浮石 45×45、出口 ' + C.GOAL_WIDTH + '×' + C.GOAL_HEIGHT + ')',
    a.image('entities/spring').width === C.TS &&
    a.image('entities/spring').height === C.TS &&
    a.image('entities/blink').width === C.TS &&
    a.image('entities/blink').height === C.TS &&
    a.image('entities/goal').width === C.GOAL_WIDTH &&
    a.image('entities/goal').height === C.GOAL_HEIGHT);
  check('没真的加载到文件时 hasFile 是 false', a.hasFile('sky/1') === false);

  // 假装有一个 Image:sky2 能读到,别的都失败
  const W = globalThis;
  const savedImage = W.Image;
  const savedRoot = W.RA_ASSET_ROOT;
  W.RA_ASSET_ROOT = '../';                 // 试试前缀(tests/ 下的页面就是这么用的)
  const seenSrc = [];
  W.Image = function () {
    const self = this;
    this.width = 0; this.height = 0;
    Object.defineProperty(this, 'src', {
      set(v) {
        seenSrc.push(String(v));
        globalThis.setTimeout(() => {
          if (String(v).indexOf('sky2') >= 0) {
            self.width = C.WIDTH; self.height = C.HEIGHT;
            if (self.onload) self.onload();
          } else if (self.onerror) self.onerror();
        }, 0);
      }
    });
  };
  const b = new RA.Assets();
  await new Promise((res) => b.loadAll(res));
  check('读到的素材进了缓存,hasFile 为 true',
    b.loaded === 1 && b.hasFile('sky/2'), 'loaded=' + b.loaded);
  check('读不到的都记在 missing 里,并且继续给兜底图',
    b.missing.length === b.names().length - 1 && !!b.image('tiles/dirt'),
    'missing=' + b.missing.length + '/' + b.names().length);
  check('图片路径会带上 RA_ASSET_ROOT 前缀(自检页在 tests/ 下也能读到图)',
    seenSrc.length > 0 && seenSrc.every((p) => p.indexOf('../assets/') === 0),
    seenSrc[0]);
  W.Image = savedImage;
  if (savedRoot === undefined) delete W.RA_ASSET_ROOT; else W.RA_ASSET_ROOT = savedRoot;
}

// ================= ④ 天空怎么选 =================
head('天空:默认随层数循环,关卡也能自己指定');
{
  const game = new RA.Game(board, pack);
  check('没写 // sky 时按层循环 sky1→sky8→sky1',
    [0, 1, 2, 6, 7, 8, 9].map((i) => game.skyOf(null, i)).join(',') === '1,2,3,7,8,1,2',
    [0, 1, 2, 6, 7, 8, 9].map((i) => game.skyOf(null, i)).join(','));

  const lv = (meta) => RA.Level.fromText('// name: t\n' + meta + '+P+\n+^+\n', {});
  check('// sky: 5 → level.sky = 5', lv('// sky: 5\n').sky === 5);
  check('// sky: 0 → 当成自动(0)', lv('// sky: 0\n').sky === 0);
  check('// sky: 99 超范围 → 当成自动(0)', lv('// sky: 99\n').sky === 0);
  check('// sky: abc → 当成自动(0)', lv('// sky: abc\n').sky === 0);
  check('没写 → 自动(0)', lv('').sky === 0);
  check('写了 sky 的关卡,skyOf 一直用它',
    game.skyOf(lv('// sky: 6\n'), 0) === 6 && game.skyOf(lv('// sky: 6\n'), 5) === 6);

  pack.pool.forEach((e) => {
    const l = RA.Level.fromText(e.text, { fallbackName: e.id });
    check(e.id + ' 的 sky 值在合法范围里', l.sky >= 0 && l.sky <= C.SKY_COUNT,
      'sky=' + l.sky);
  });
}

// ================= ⑤ 真的画出来了 =================
head('背景绘制:画的是对应那张贴图,爬升时两张天空淡入淡出');
{
  RA.assets = new RA.Assets();
  let ok = true, err = '';
  try {
    for (let i = -2; i <= C.SKY_COUNT + 2; i++) {
      RA.UI.drawBackground(ctx, i);              // 越界要夹住,不能崩
      RA.UI.drawBackground(ctx, i, 1800, 1200);  // 编辑器那种大画布
    }
    const game = new RA.Game(board, pack);
    RA.UI.drawMenuBackground(ctx);
    RA.UI.drawTitle(ctx, game);
    RA.UI.drawBye(ctx);
  } catch (e) { ok = false; err = (e && e.message); }
  check('天空 1~8 / 越界值 / 开局与告别背景都能画出来', ok, err);

  // 用假 ctx 抓"画了哪张图"
  const used = [];
  const spy = new Proxy({
    drawImage: (img) => used.push(img),
    createLinearGradient: () => ({ addColorStop() { } }),
    measureText: (s) => ({ width: String(s).length * 8 })
  }, {
    get(t, k) { return (k in t) ? t[k] : () => { }; },
    set() { return true; }
  });
  RA.UI.drawBackground(spy, 6);
  check('画第 6 张天空时用的就是 sky/6 那张图',
    used.indexOf(RA.assets.image('sky/6')) >= 0 && used.length > 0);
  used.length = 0;
  RA.UI.drawMenuBackground(spy);
  check('开局界面背景用的是 ui/title 那张图',
    used.indexOf(RA.assets.image('ui/title')) >= 0);

  // 爬升过渡:两张天空都画了(淡入淡出)
  const g = new RA.Game(board, pack);
  g.setFloors(8);
  g.startRun();
  check('第 1 层用 sky1', g.skyOf(g.level, g.floor) === 1);
  g.player.x = g.level.goalX + (g.level.tile - g.player.w) / 2;
  g.player.y = g.level.goalFeet - g.player.h;
  g.update(1 / 60);
  check('碰到出口进入过渡', g.state === 'climb');
  used.length = 0;
  g.draw(spy);
  check('过渡里 sky1 和 sky2 都出现(天空在淡入淡出)',
    used.indexOf(RA.assets.image('sky/1')) >= 0 &&
    used.indexOf(RA.assets.image('sky/2')) >= 0);
  let guard = 0;
  while (g.state === 'climb' && guard++ < 200) { g.update(1 / 60); g.draw(spy); }
  check('过渡结束后站到第 2 层,天空跟着换成 sky2',
    g.state === 'play' && g.skyOf(g.level, g.floor) === 2);
}

// ================= ⑥ 三个实体贴的是 assets/entities 里的图 =================
head('实体绘制:弹簧板 S / 出口 G / 浮石 y 画的是自己的贴图');
{
  const usedImg = [];
  const spy = new Proxy({
    drawImage: (img) => usedImg.push(img),
    createLinearGradient: () => ({ addColorStop() { } }),
    measureText: (s) => ({ width: String(s).length * 8 })
  }, {
    get(t, k) { return (k in t) ? t[k] : () => { }; },
    set() { return true; }
  });
  const cam = { ox: 0, oy: 0, vw: C.WIDTH, vh: C.HEIGHT };
  const level = RA.Level.fromText('// name: t\n+P...+\n+SGy.+\n+^^^+\n', {});
  const byLetter = {};
  level.entities.forEach((e) => { byLetter[e.constructor.letter] = e; });
  check('地图里的 S / G / y 都建出来了',
    !!byLetter.S && !!byLetter.G && !!byLetter.y);
  [['S', 'entities/spring'], ['G', 'entities/goal'], ['y', 'entities/blink']]
    .forEach((pair) => {
      usedImg.length = 0;
      byLetter[pair[0]].draw(spy, cam, RA.assets);
      check(pair[0] + ' 画的是 ' + pair[1] + ' 这张贴图',
        usedImg.indexOf(RA.assets.image(pair[1])) >= 0,
        usedImg.length + ' 张贴图,用了 ' + pair[1]);
    });
  // 弹簧板踩下去:贴图还得往下挪(压扁的那一下)
  const spring = byLetter.S;
  spring.squash = 1;
  const seen = [];
  const spy2 = new Proxy({
    drawImage: (...a) => seen.push(a),
    measureText: (s) => ({ width: String(s).length * 8 })
  }, {
    get(t, k) { return (k in t) ? t[k] : () => { }; },
    set() { return true; }
  });
  spring.draw(spy2, cam, RA.assets);
  check('弹簧板被踩下去时贴图往下挪 7px(还是压下去的样子)',
    seen.length === 1 && Math.abs(seen[0][2] - (spring.y + 7)) < 1e-6,
    seen[0] ? ('y=' + seen[0][2]) : '没画');
  spring.squash = 0;
  // 浮石消失:收拢用的是同一张贴图,缩到 k 那么大
  const blink = byLetter.y;
  blink.vanishFor();
  seen.length = 0;
  blink.draw(spy2, cam, RA.assets);
  check('浮石消失时把同一张贴图缩到 k 倍(收拢动画)', seen.length >= 1 &&
    seen[0][3] === blink.w * blink.step && seen[0][4] === blink.h * blink.step,
    seen[0] ? ('w=' + seen[0][3] + ' k=' + blink.step) : '没画');
  blink.step = 0;
  blink.hidden = 0;
  // 出口:alpha 跟着 pulse 呼吸(0.75~1)
  const goal = byLetter.G;
  seen.length = 0;
  const alphas = [];
  const spy3 = new Proxy({
    drawImage: () => { alphas.push(spy3.globalAlpha); },
    measureText: (s) => ({ width: String(s).length * 8 })
  }, {
    get(t, k) { return (k in t) ? t[k] : () => { }; },
    set(t, k, v) { t[k] = v; return true; }
  });
  RA.time = 0;
  goal.draw(spy3, cam, RA.assets);
  RA.time = Math.PI / 2 / 3.0;                  // sin(3t) = 1 → pulse 拉满
  goal.draw(spy3, cam, RA.assets);
  RA.time = 0;
  check('出口光柱的透明度假在 0.75~1 之间呼吸(靠 globalAlpha)',
    alphas.length === 2 && alphas.every((v) => v >= 0.749 && v <= 1.001) &&
    alphas[1] > alphas[0] + 0.1, alphas.join(' → '));
}

// ================= ⑦ 地块绘制:贴图尺寸和格子不一致也要铺满一格 =================
head('地块绘制:16×16 的贴图标成铺满一格,云板只画上面一截');
{
  /** 抓 drawImage 的调用参数 + 调用那一刻的 imageSmoothingEnabled */
  function spyOn() {
    const calls = [];
    const spy = new Proxy({
      drawImage: (...a) => calls.push({ args: a, smooth: spy.imageSmoothingEnabled }),
      measureText: (s) => ({ width: String(s).length * 8 })
    }, {
      get(t, k) { return (k in t) ? t[k] : () => { }; },
      set(t, k, v) { t[k] = v; return true; }
    });
    return { spy, calls };
  }
  const lv = RA.Level.fromData({
    id: 'tiles', asc: ['+P++++', '+^^^^+', '+----+', '+_~=_+', '+====+']
  }, {});
  const cam = { ox: 0, oy: 0, vw: C.WIDTH, vh: C.HEIGHT };

  // ① 16×16 像素画:每一格都要画成 45×45,而且放大时关掉平滑(硬边)
  const a = spyOn();
  lv.draw(a.spy, cam, { image: (n) => ({ width: 16, height: 16, name: n }) });
  const solid = a.calls.filter((c) => c.args.length === 5);
  const plate = a.calls.filter((c) => c.args.length === 9);
  check('贴图只有 16×16,画的时候铺满一格(' + C.TS + '×' + C.TS + ')',
    solid.length === 12 && solid.every((c) => c.args[3] === C.TS && c.args[4] === C.TS),
    solid.length + ' 次,尺寸 ' + (solid[0] ? solid[0].args[3] + '×' + solid[0].args[4] : '?'));
  check('放大像素画时关掉平滑(不然糊成一片)',
    solid.length > 0 && solid.every((c) => c.smooth === false),
    solid.length ? String(solid[0].smooth) : '没画');
  check('云板只画上面那一截(薄平台,不是整块砖)',
    plate.length === 4 && plate.every((c) => c.args[7] === C.TS &&
      Math.abs(c.args[8] - C.TS * RA.TILE_PLATE['-']) < 1e-6),
    plate.length + ' 次,高 ' + (plate[0] ? plate[0].args[8].toFixed(1) : '?'));
  check('云板取的是贴图上面 ' + Math.round(16 * RA.TILE_PLATE['-']) + ' 像素高(不整张拉扁)',
    plate.length > 0 && plate.every((c) => c.args[4] === Math.round(16 * RA.TILE_PLATE['-'])),
    plate[0] ? ('源高 ' + plate[0].args[4]) : '没画');

  // ② 换成比一格还大的贴图(128×128):照样铺满一格,但缩小要保留平滑
  const b = spyOn();
  lv.draw(b.spy, cam, { image: (n) => ({ width: 128, height: 128, name: n }) });
  const big = b.calls.filter((c) => c.args.length === 5);
  check('贴图比一格大时也一样铺满一格',
    big.length === 12 && big.every((c) => c.args[3] === C.TS && c.args[4] === C.TS),
    big.length + ' 次');
  check('缩小大贴图时保留平滑(免得出现摩尔纹)',
    big.length > 0 && big.every((c) => c.smooth === true));

  // ③ 兜底那张(代码现画的地块)本来就是 45×45:按原尺寸画,不放大
  const d = spyOn();
  lv.draw(d.spy, cam, { image: (n) => ({ width: C.TS, height: C.TS, name: n }) });
  const same = d.calls.filter((c) => c.args.length === 5);
  check('兜底贴图本来就是 45×45 时按原尺寸画',
    same.length === 12 && same.every((c) => c.args[3] === C.TS && c.args[4] === C.TS));

  // ④ 编辑器地图 / 调色板也得走同一个画法(不然编辑器和游戏里长得不一样)
  const edSrc = readFileSync(join(ROOT, 'js/editor.js'), 'utf8');
  check('编辑器画地块用的是引擎的 RA.drawTile(游戏 / 编辑器同一套缩放)',
    (edSrc.match(/RA\.drawTile\(/g) || []).length >= 2,
    (edSrc.match(/RA\.drawTile\(/g) || []).length + ' 处');
  check('编辑器里没有"直接按原尺寸画地块"的旧写法了',
    edSrc.indexOf('this.assets.image(RA.TILE_IMAGES[ch][0]), q.x, q.y, ts, ts') < 0);
}

console.log('\n' + '='.repeat(70));
export const result = { pass, fail, fails, name: '贴图自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log(`贴图自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✔');
  process.exit(0);
}
