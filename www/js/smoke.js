/* -*- coding: utf-8 -*- */
/*
 * smoke.js —— 冒烟自检(不用开窗口就能验证物理没坏)
 * =================================================
 *   Node:  node tools/test_engine.mjs        (跑的就是这个文件)
 *   浏览器: 打开 index.html?selftest=1
 *
 * 检查的东西分四块:
 *   ① 物理:站着不下陷、跳跃、二段跳、翻滚、落脚容错、弹簧板、出口判定
 *   ② 主循环:掉出世界会回起点、碰到出口会往上爬一层
 *   ③ 塔:同一个种子 = 同一座塔、层数、相邻层不重复、镜像
 *   ④ 关卡池:每张图都能解析、没有警告,而且**真的爬得上去**
 *      (爬得上去是靠 js/reach.js 用真物理一跳跃一跳跃模拟出来的)
 *
 * 坐标全部从关卡数据里推导(找某列最高的一块地面、找一堵左边是空的墙……),
 * 所以改关卡、换关卡都不用动这里的代码 —— 和 abyss 的 smoke.py 一个思路。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var DT = 1 / 60;

  // ===================== 打分的小工具 =====================
  function Runner(log) {
    this.log = log || function () { };
    this.fails = [];
    this.total = 0;
    this.skipped = 0;
  }
  Runner.prototype.section = function (t) { this.log('', 'info'); this.log('▌ ' + t, 'section'); };
  Runner.prototype.check = function (name, cond, extra) {
    this.total++;
    if (!cond) this.fails.push(name);
    this.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '    ' + extra : ''),
      cond ? 'pass' : 'fail');
  };
  Runner.prototype.skip = function (name, why) {
    this.skipped++;
    this.log('  SKIP  ' + name + '(' + why + ')', 'info');
  };
  Runner.prototype.info = function (s) { this.log('  · ' + s, 'info'); };

  // ===================== ① 物理(在任意一层上跑) =====================
  /**
   * level:要测试的那一层;assets:素材(角色贴图,只影响动画名)
   */
  function physics(level, assets, log) {
    var R = new Runner(log);
    var player = new RA.Player(level);
    player.loadSprites(assets);
    var cam = new RA.Camera(level);
    var ctx = { snd: null, player: player, level: level, camera: cam };

    var runFrames = function (hold, n) {
      var fell = false;
      for (var i = 0; i < n; i++) {
        player.update(DT, hold, ctx);
        if (player.y > level.worldH + C.FALL_MARGIN) { player.reset(); fell = true; }
      }
      return fell;
    };

    // 1) 站在起点不下陷
    player.reset();
    runFrames({}, 30);
    R.check('起点站立不下陷', player.onGround &&
      Math.abs(player.feet - level.startFeet) < 1);

    // 2) 静止 60 帧:动画必须一直是待机帧
    player.reset();
    var seen = {};
    for (var i = 0; i < 60; i++) { player.update(DT, {}, ctx); seen[player.cur] = 1; }
    R.check('静止时只显示待机帧', Object.keys(seen).length === 1 && seen.idle === 1);

    // 3) 跳起来之后还能落回原地
    player.reset();
    runFrames({}, 60);
    player.update(DT, { jump: true }, ctx);
    var apex = player.y;
    for (i = 0; i < 60; i++) {
      player.update(DT, {}, ctx);
      apex = Math.min(apex, player.y);
    }
    R.check('跳起再落地', player.onGround && apex < player.y - 20 &&
      Math.abs(player.feet - level.startFeet) < 1);

    // 3b) 二段跳:空中能再补一次,而且明显跳得更高;落地前只给补一次
    // 量的是**角色手感**,不是"这一层留了多少空间":量的时候把这一层的碰撞网格换成
    // "全空气"(起跳点还是它自己的出生点),于是不管这层是开阔竖井还是贴着天花板的
    // 窄走廊,量出来的都是同一份数据。以前直接在关卡里量,天花板一低就误报成引擎的问题。
    var realGrid = level.grid, realOneway = level.oneway;
    var emptyGrid = [];
    for (i = 0; i < level.rows; i++) emptyGrid.push(new Array(level.cols).fill(false));
    level.grid = emptyGrid;
    level.oneway = emptyGrid;
    var flight = function (releases) {
      player.reset();
      player.onGround = true;      // 网格是空的,踩不到地,就当它刚站稳
      player.jumpsUsed = 0;
      var base = player.y;
      var top = base, jumps = 0;
      var prevUsed = player.jumpsUsed;
      for (var k = 0; k < 150; k++) {
        player.update(DT, releases[k] ? {} : { jump: true }, ctx);
        if (player.jumpsUsed > prevUsed) jumps++;
        prevUsed = player.jumpsUsed;
        top = Math.min(top, player.y);
        if (k > 20 && player.onGround) break;
      }
      return { h: base - top, jumps: jumps };
    };
    var rel = {};
    rel[12] = 1; rel[13] = 1;
    var f1 = flight({});
    var f2 = flight(rel);
    R.check('二段跳能再跳一次且跳得更高',
      f1.jumps === 1 && f2.jumps === 2 && f2.h > f1.h + 20,
      '一段 ' + f1.h.toFixed(0) + 'px / 二段 ' + f2.h.toFixed(0) + 'px');
    var rel2 = { 12: 1, 13: 1, 40: 1, 41: 1 };
    R.check('落地前最多只补一次跳', flight(rel2).jumps === 2);

    // 手感量完了,把这一层的地形装回去(后面几条又要在真的地形上跑)
    level.grid = realGrid;
    level.oneway = realOneway;
    player.reset();
    runFrames({}, 30);

    // 3c) 一段跳不转,二段跳才转;最多一圈,落地立刻归零
    player.reset();
    runFrames({}, 30);
    for (i = 0; i < 12; i++) player.update(DT, { jump: true }, ctx);
    var spinSingle = player.spinAngle;
    player.update(DT, {}, ctx);
    player.update(DT, { jump: true }, ctx);          // 二段跳
    var spun = player.spinAngle;
    var maxA = 0;
    for (i = 0; i < 120; i++) {
      player.update(DT, {}, ctx);
      maxA = Math.max(maxA, player.spinAngle);
      if (player.onGround) break;
    }
    R.check('二段跳最多转一圈且落地归位',
      spinSingle === 0 && spun > 0 && maxA > 180 && maxA <= player.SPIN_DEG &&
      player.spinAngle === 0);

    // 3d) 落脚容错:贴着墙往上跳、只差一点点够不着 → 自动送上墙
    var ledge = null;
    for (var c = 1; c < level.cols; c++) {
      var t = level.topAt(c);
      if (t !== null && t > 0 && !level.solid(t - 1, c - 1) &&
        !level.solid(t, c - 1) && !level.solid(t + 1, c - 1)) {
        ledge = { c: c, t: t };
        break;
      }
    }
    if (ledge) {
      var top = ledge.t * level.tile;
      var jumpBesideWall = function (boost) {
        player.reset();
        player.x = ledge.c * level.tile - player.w - 1;   // 离墙 1px
        player.y = top + 40 - player.h;                   // 脚底在墙顶下面 40px
        player.vx = 0;
        player.vy = -Math.sqrt(2 * player.GRAVITY * boost);
        player.onGround = false;
        player.coyote = 0;
        for (var k = 0; k < 120; k++) {
          player.update(DT, { right: true }, ctx);
          if (player.onGround) break;
        }
        return { landed: player.onGround, onLedge: Math.abs(player.feet - top) < 1 };
      };
      var r1 = jumpBesideWall(30);
      R.check('跳得只差一点会自动送上墙', r1.landed && r1.onLedge);
      var assist = player.LEDGE_ASSIST;
      player.LEDGE_ASSIST = 0;
      var r2 = jumpBesideWall(30);
      player.LEDGE_ASSIST = assist;
      R.check('关掉容错就上不去(说明刚才不是撞运气)', !r2.onLedge);
    } else {
      R.skip('落脚容错', '这一层没有"左边是空的"墙');
    }

    // 4) 站到一块"和起点不同高度"的平台上,应该稳稳站着
    var plat = null;
    for (c = 0; c < level.cols; c++) {
      t = level.topAt(c);
      if (t !== null && t >= 1 && t !== level.spawnRow && t <= level.rows - 2) {
        plat = { c: c, t: t };
        break;
      }
    }
    if (plat) {
      player.reset();
      player.x = plat.c * level.tile + 4;
      player.y = plat.t * level.tile - player.h;
      player.vx = player.vy = 0;
      runFrames({}, 40);
      R.check('高台站立稳定', player.onGround &&
        Math.abs(player.feet - plat.t * level.tile) < 1);
    } else {
      R.skip('高台站立稳定', '这一层没有别的高台');
    }

    // 5) 镜头:站在半空中段原地起跳,纵向镜头不应该跟着抖
    var mid = null;
    var surfs = level.surfaces();
    for (var s = 0; s < surfs.length; s++) {
      var su = surfs[s];
      if (su.row > 6 && su.row < level.rows - 4 &&
        su.row * level.tile - cam.vh / 2 > 100 &&
        su.row * level.tile - cam.vh / 2 < level.worldH - cam.vh - 100) {
        mid = su;
        break;
      }
    }
    if (mid) {
      player.reset();
      player.x = mid.col * level.tile + 4;
      player.y = mid.row * level.tile - player.h;
      player.vx = player.vy = 0;
      cam.x = cam.y = 0;
      for (i = 0; i < 120; i++) { player.update(DT, {}, ctx); cam.update(DT, player); }
      var settled = cam.y;
      player.update(DT, { jump: true }, ctx);
      for (i = 0; i < 70; i++) { player.update(DT, {}, ctx); cam.update(DT, player); }
      R.check('半空起跳时镜头不上下抖', Math.abs(cam.y - settled) < 1.5,
        'cam.y ' + settled.toFixed(1) + ' → ' + cam.y.toFixed(1));
    } else {
      R.skip('镜头不抖', '这一层找不到合适的中间平台');
    }

    // 6) 出口判定:碰到就算到,离远了不算
    player.reset();
    player.x = level.goalX + (level.tile - player.w) / 2;
    player.y = level.goalFeet - player.h;
    player.vx = player.vy = 0;
    R.check('碰到出口就算爬上这一层', level.win(player));
    player.x = level.goalX - level.tile * 2;
    R.check('离出口两格远不算通关', !level.win(player));

    player.reset();
    return R;
  }

  // ===================== ② 弹簧板(合成一层,不依赖关卡池) =====================
  function springTest(assets, log) {
    var R = new Runner(log);
    var text = [
      '// name: 弹簧自检',
      '+++++++++',
      '+++++++++',
      '+S+++++++',
      '+^^^+++++',
      '+^^^+++++'
    ].join('\n');
    var level = RA.Level.fromText(text, { fallbackName: 'spring' });
    var player = new RA.Player(level);
    player.loadSprites(assets);
    var spring = null;
    level.entities.forEach(function (e) { if (e instanceof RA.Spring) spring = e; });
    if (!spring) {
      R.check('弹簧板被地图解析出来', false);
      return R;
    }
    R.check('弹簧板被地图解析出来', true);

    player.x = spring.x + 4;
    player.y = spring.y + spring.h - player.h;
    player.vx = player.vy = 0;
    player.onGround = true;
    player.jumpsUsed = 1;                       // 故意用掉一次,看弹簧会不会补满
    var ctx = { snd: null, player: player };
    var start = player.y, top = start;
    for (var i = 0; i < 120; i++) {
      player.update(DT, {}, ctx);
      spring.update(DT, ctx);
      top = Math.min(top, player.y);
    }
    R.check('弹簧板把人顶得比一段跳高', start - top > 200,
      '弹起 ' + (start - top).toFixed(0) + 'px');
    R.check('弹簧板会补满二段跳次数', player.jumpsUsed === 0);
    return R;
  }

  // ===================== ②a 会变的机关(x 触之即散 / y 浮石) =====================
  /**
   * 两样都合成一层来验(不放进关卡池 —— 它们是给编辑器画的设计工具):
   *   x:有碰撞体积,玩家从任何方向碰到 → 很快消失,然后就彻底让开(同一局不再出现);
   *   y:有碰撞体积、能站;踩够时间 → 消失一段时间 → 再回来;
   *     回来那一下如果格子里有人,就不出现,等下一个周期。
   */
  function vanishTest(assets, log) {
    var R = new Runner(log);

    // ---------- x:触之即散 ----------
    var gtext = [
      '// name: 碎影自检',
      '+++++++++',
      '+++++++++',
      '+Px++++++',
      '+^^^+++++',
      '+^^^+++++'
    ].join('\n');
    var gl = RA.Level.fromText(gtext, { fallbackName: 'ghost' });
    var gp = new RA.Player(gl);
    gp.loadSprites(assets);
    var ghost = null;
    gl.entities.forEach(function (e) { if (e instanceof RA.Ghost) ghost = e; });
    if (!ghost) {
      R.check('触之即散(x)能被地图解析出来', false);
      return R;
    }
    R.check('触之即散(x)能被地图解析出来', true);
    var gctx = { snd: null, player: gp, level: gl };
    gp.reset();
    R.check('x 在地形之外也算实心(能挡人)', gl.blockedAt(ghost.row, ghost.col) === true);
    R.check('x 的格子是真的空的(它不是地形)', gl.grid[ghost.row][ghost.col] === false);

    var blockedX = 0;
    for (var i = 0; i < 60; i++) {
      gp.update(DT, { right: true }, gctx);
      ghost.update(DT, gctx);
      if (gp.x + gp.w > ghost.x + 1 && gp.x < ghost.x) blockedX = gp.x;
      if (ghost.gone) break;
    }
    R.check('往 x 走会被它挡住(碰到之前过不去)',
      gp.x + gp.w <= ghost.x + 1.5, 'player 右边 ' + (gp.x + gp.w).toFixed(1) +
      ' / 方块左边 ' + ghost.x);
    R.check('碰到之后它开始消失(gone)', ghost.gone === true);
    for (i = 0; i < 20; i++) { gp.update(DT, { right: true }, gctx); ghost.update(DT, gctx); }
    R.check('消失之后就不再挡人(能走过去)', gl.blockedAt(ghost.row, ghost.col) === false);
    R.check('走过去之后玩家真的到了方块右边', gp.x > ghost.x + ghost.w - 4,
      'x=' + gp.x.toFixed(1));
    for (i = 0; i < 30; i++) ghost.update(DT, gctx);
    R.check('散完就彻底没了(alive = false,同一局不再出现)', ghost.alive === false);

    // 从下面顶、从上面踩也算"任何方向"
    var gl2 = RA.Level.fromText([
      '// name: 碎影自检 2',
      '+++++++++',
      '+++x+++++',
      '+++x+++++',
      '+++++++++',
      '+P+++++++',
      '+^^^+++++'
    ].join('\n'), { fallbackName: 'ghost2' });
    var g2 = new RA.Player(gl2);
    g2.loadSprites(assets);
    var ghosts = [];
    gl2.entities.forEach(function (e) { if (e instanceof RA.Ghost) ghosts.push(e); });
    g2.reset();
    // 站到方块正下方那一格,往上跳 → 顶到它
    g2.x = ghosts[0].x + 4;
    var g2ctx = { snd: null, player: g2, level: gl2 };
    for (i = 0; i < 90 && !ghosts[0].gone; i++) {
      g2.update(DT, { jump: true }, g2ctx);
      ghosts.forEach(function (e) { e.update(DT, g2ctx); });
    }
    R.check('从下面顶上去也算碰到(两个 x 至少碎一个)',
      ghosts[0].gone || ghosts[1].gone);

    // ---------- y:浮石 ----------
    var btext = [
      '// name: 浮石自检',
      '+++++++++',
      '+++++++++',
      '+++y+++++',
      '+++++++++',
      '+P+++++++',
      '+^^^+++++',
      '+^^^+++++'
    ].join('\n');
    var bl = RA.Level.fromText(btext, { fallbackName: 'blink' });
    var bp = new RA.Player(bl);
    bp.loadSprites(assets);
    var blink = null;
    bl.entities.forEach(function (e) { if (e instanceof RA.Blink) blink = e; });
    if (!blink) {
      R.check('浮石(y)能被地图解析出来', false);
      return R;
    }
    R.check('浮石(y)能被地图解析出来', true);
    var bctx = { snd: null, player: bp, level: bl };
    R.check('y 算实心(能挡人、能站)', bl.blockedAt(blink.row, blink.col) === true);

    // 把人放到方块正上方一点,让它自己落到上面踩一下
    bp.reset();
    bp.x = blink.x + 6;
    bp.y = blink.y - bp.h - 2;
    bp.vx = bp.vy = 0;
    bp.onGround = false;
    var stepped = null;                          // 踩到的那一帧:当时脚在哪
    for (i = 0; i < 12; i++) {
      bp.update(DT, {}, bctx);
      blink.update(DT, bctx);
      if (blink.hiddenNow) { stepped = { feet: bp.feet }; break; }
    }
    R.check('能踩到 y 上面(消失的那一刻脚就在顶面上)',
      !!stepped && Math.abs(stepped.feet - blink.y) <= 6,
      stepped ? ('feet=' + stepped.feet.toFixed(1) + ' 顶面=' + blink.y) : '一直没消失');
    R.check('踩到的那一下就消失(不用站一会儿)', blink.hiddenNow === true);
    R.check('消失的时候不挡人', bl.blockedAt(blink.row, blink.col) === false);

    // 方块没了 → 原来踩着的人开始往下掉
    var feetBeforeFall = bp.feet;
    for (i = 0; i < 20; i++) { bp.update(DT, {}, bctx); blink.update(DT, bctx); }
    R.check('它消失之后踩在上面的人会掉下去', bp.feet > feetBeforeFall + 5,
      'feet ' + feetBeforeFall.toFixed(1) + ' → ' + bp.feet.toFixed(1));

    // 消失期间玩家掉下去了 → 到点应该变回来
    for (i = 0; i < Math.ceil((blink.constructor.GONE / DT)) + 4; i++) {
      bp.update(DT, {}, bctx);
      blink.update(DT, bctx);
    }
    R.check('玩家离开那一格之后,过一段时间它会回来', blink.hiddenNow === false);
    R.check('变回来之后又挡人了', bl.blockedAt(blink.row, blink.col) === true);

    // 格子里有人 → 不重现,再等一个周期
    blink.hidden = blink.constructor.GONE;       // 手动让它进入"该回来了"的状态
    bp.x = blink.x + 4;                          // 把人放进那一格
    bp.y = blink.y + 6;
    bp.vx = bp.vy = 0;
    blink.update(DT, bctx);
    R.check('格子里有玩家时不会重现(再等一个周期)',
      blink.hiddenNow === true && blink.hidden > blink.constructor.GONE - 0.1,
      'hidden=' + blink.hidden.toFixed(2));
    // 人走开 → 下一个周期正常回来
    bp.x = blink.x + blink.w + 200;
    blink.hidden = 0.001;
    blink.update(DT, bctx);
    R.check('人走开之后下一个周期就正常回来了', blink.hiddenNow === false);

    return R;
  }

  // ===================== ②b 云板(单向地块) =====================
  /**
   * 云板 '-':从下往上能穿过去、从上面掉下来会被接住、横向也能穿过去。
   * 全部用合成的一层来验,不依赖关卡池。
   */
  function onewayTest(assets, log) {
    var R = new Runner(log);
    // 这一层用程序搭出来(手写地图容易数错行):
    //   第 8 行一块云板(第 3~9 列),第 10~11 行是地面,出生点在第 9 行,
    //   出口在第 0 行(会自动落到云板上)
    var COLS = 12, ROWS = 12, CLOUD_ROW = 8, GROUND_ROW = 10;
    var grid = [];
    for (var r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill('+'));
    for (var c = 3; c <= 9; c++) grid[CLOUD_ROW][c] = '-';
    for (c = 1; c <= 10; c++) { grid[GROUND_ROW][c] = '^'; grid[GROUND_ROW + 1][c] = '='; }
    grid[GROUND_ROW - 1][1] = 'P';
    grid[0][5] = 'G';
    var text = '// name: 云板自检\n' +
      grid.map(function (row) { return row.join(''); }).join('\n');
    var level = RA.Level.fromText(text, { fallbackName: 'oneway' });
    var player = new RA.Player(level);
    player.loadSprites(assets);
    var ctx = { snd: null, player: player, level: level };
    var TS = level.tile;
    var CLOUD_TOP = CLOUD_ROW * TS;             // 云板顶面

    var runFrames = function (hold, n) {
      var fell = false;
      for (var i = 0; i < n; i++) {
        player.update(DT, hold, ctx);
        if (player.y > level.worldH + C.FALL_MARGIN) { player.reset(); fell = true; }
      }
      return fell;
    };

    // 关卡解析:云板既不是"实心",又是"地块",还是"能站的地面"
    R.check('云板不在实心表里(RA.SOLID_CHARS 没有 \'-\')',
      RA.SOLID_CHARS.indexOf('-') < 0);
    R.check('云板在单向表里(RA.ONEWAY_CHARS)', RA.ONEWAY_CHARS.indexOf('-') >= 0);
    R.check('云板算地块(要画出来)', RA.isTileChar('-') === true &&
      RA.isTileChar('^') === true && RA.isTileChar('+') === false);
    R.check('level.solid 说它不是实心,onewayAt 说是单向',
      level.solid(CLOUD_ROW, 5) === false && level.onewayAt(CLOUD_ROW, 5) === true);
    R.check('云板算落脚面(surfaces 里能找到它)',
      level.surfaces().some(function (s) { return s.row === CLOUD_ROW && s.col === 5; }));
    R.check('groundBelow 认云板当"地面"', level.groundBelow(0, 5) === CLOUD_ROW);
    R.check('引擎解析云板没有任何警告', level.warnings.length === 0,
      level.warnings.join('; '));

    // ① 从下往上:能穿过去(旧写法会在云板底下被顶住)
    player.reset();
    runFrames({}, 30);
    var feetMin = player.feet;
    for (var i = 0; i < 90; i++) {
      player.update(DT, { jump: true }, ctx);
      feetMin = Math.min(feetMin, player.feet);
    }
    R.check('从下面往上能穿过云板', feetMin < CLOUD_TOP - 10,
      '最高到 feet=' + feetMin.toFixed(0) + ',云板顶=' + CLOUD_TOP);

    // ② 从上面掉下来:被接住
    player.reset();
    player.x = 5 * TS + 8;
    player.y = (CLOUD_ROW - 2) * TS - player.h;   // 云板上方两格
    player.vx = player.vy = 0;
    player.onGround = false;
    runFrames({}, 60);
    R.check('从上面掉下来会被云板接住',
      player.onGround && Math.abs(player.feet - CLOUD_TOP) < 1,
      'feet=' + player.feet.toFixed(1) + '(云板顶=' + CLOUD_TOP + ')');

    // ③ 站在云板上:稳稳的,不会陷下去也不会漏下去
    runFrames({}, 90);
    R.check('站在云板上稳稳的(不陷下去也不掉下去)',
      player.onGround && Math.abs(player.feet - CLOUD_TOP) < 1,
      'feet=' + player.feet.toFixed(1));

    // ④ 横向:云板不是墙,能穿过去
    player.reset();
    player.x = 3 * TS - player.w - 6;          // 云板左边
    player.y = CLOUD_ROW * TS + (TS - player.h);   // 身体正好和云板同一行
    player.vx = player.vy = 0;
    player.onGround = false;
    var x0 = player.x;
    for (var k = 0; k < 20; k++) {
      player.update(DT, { right: true }, ctx);
      player.vy = 0;                           // 不让它掉下去,只看横向有没有被挡
    }
    R.check('横向也能穿过云板(它不是墙)', player.x > 3 * TS + 10,
      x0.toFixed(0) + ' → ' + player.x.toFixed(0));

    // ⑤ 可达性分析要把云板当落脚点:地面 → 云板 → 上面那块实心台
    var lv2 = RA.Level.fromText([
      '// name: 云板可达',
      '++++++G++++',
      '+++++^^^+++',
      '+++++++++++',
      '+++++++++++',
      '+++-----+++',
      '+++++++++++',
      '+++++++++++',
      '+P+++++++++',
      '+^^^^^^^^^+',
      '+=========='
    ].join('\n'), { fallbackName: 'oneway-reach' });
    var r = RA.Reach.path(lv2, { sim: true });
    R.check('可达性分析会把云板当落脚点(地面→云板→高台)', r.ok,
      r.ok ? (r.hops.length + ' 跳') : (r.reason || ''));
    return R;
  }

  // ===================== ③ 主循环 / 爬塔流程 =====================
  function gameLoop(game, log) {
    var R = new Runner(log);
    R.check('关卡池非空', game.pool().length > 0,
      game.pool().length + ' 个模板');

    if (!game.startRun()) {
      R.check('能开始爬塔', false);
      return R;
    }
    R.check('开始后进入 play 状态并停在第 1 层',
      game.state === 'play' && game.floor === 0 && !!game.level && !!game.player);

    // 掉出世界 → 回本层起点,并且记一次坠落
    var before = game.stats.falls;
    game.player.y = game.level.worldH + C.FALL_MARGIN + 20;
    game.update(DT);
    R.check('掉出世界会回到本层起点',
      Math.abs(game.player.feet - game.level.startFeet) < 1 &&
      game.stats.falls === before + 1);

    // 碰到出口 → 进入爬升过渡 → 过渡完就站在上一层
    if (game.tower.height >= 2) {
      game.player.x = game.level.goalX + (game.level.tile - game.player.w) / 2;
      game.player.y = game.level.goalFeet - game.player.h;
      game.update(DT);
      R.check('碰到出口进入关卡切换过渡', game.state === 'climb' && !!game.climb);
      // 切换是"渐出 → 暗场 → 渐入":一开始旧层还全亮、新层还没出来
      var fade0 = game.climbFade(game.climb);
      R.check('过渡刚开始:旧层还亮着、新层还没出现',
        fade0.old > 0.95 && fade0.next < 0.05 && fade0.dim < 0.05,
        'old=' + fade0.old.toFixed(2) + ' next=' + fade0.next.toFixed(2));
      // 跑到一半:两层都淡了,中间那层暗场最浓
      var half = Math.ceil(C.CLIMB_TIME / 2 / DT);
      for (var hi = 0; hi < half && game.state === 'climb'; hi++) game.update(DT);
      if (game.state === 'climb') {
        var fadeM = game.climbFade(game.climb);
        R.check('过渡到一半:旧层淡出得差不多了、新层刚开始进,中间最暗',
          fadeM.old < 0.25 && fadeM.next < 0.25 && fadeM.dim > 0.8,
          'old=' + fadeM.old.toFixed(2) + ' next=' + fadeM.next.toFixed(2) +
          ' dim=' + fadeM.dim.toFixed(2));
      } else {
        R.skip('过渡到一半的渐入渐出', '过渡已经跑完了');
      }
      var guard = 0;
      while (game.state === 'climb' && guard++ < 200) game.update(DT);
      R.check('过渡结束后站在第 2 层',
        game.state === 'play' && game.floor === 1,
        'state=' + game.state + ' floor=' + game.floor);
      R.check('第 2 层的角色是从这一层出生点开始的',
        Math.abs(game.player.x - (game.level.startX)) < 2);
    } else {
      R.skip('爬升流程', '塔只有 1 层');
    }

    game.toTitle();
    R.check('能回到开局界面', game.state === 'title' && game.settings === false);
    return R;
  }

  // ===================== ④ 塔:结构 / 种子 =====================
  function tower(game, log) {
    var R = new Runner(log);
    var pool = game.pool();
    var seedA = 'RA-SMOKE1';
    var seedB = 'RA-SMOKE2';

    var t1 = new RA.Tower(pool).generate({ floors: 9, seed: seedA, mirror: true });
    var t2 = new RA.Tower(pool).generate({ floors: 9, seed: seedA, mirror: true });
    var same = JSON.stringify(t1.floors) === JSON.stringify(t2.floors);
    R.check('同一个种子生成同一座塔', same, t1.seedLabel);

    var t3 = new RA.Tower(pool).generate({ floors: 9, seed: seedB, mirror: true });
    R.check('换种子结构会变',
      JSON.stringify(t1.floors) !== JSON.stringify(t3.floors));

    R.check('层数按塔高来', t1.height === 9);

    // 相邻 N 层内不重复(池子够大时)
    var gap = C.TOWER_NO_REPEAT_GAP;
    var repeat = false;
    if (pool.length > gap) {
      for (var i = 0; i < t1.floors.length; i++) {
        for (var j = i + 1; j < Math.min(t1.floors.length, i + gap + 1); j++) {
          if (t1.floors[i].templateIndex === t1.floors[j].templateIndex) repeat = true;
        }
      }
    }
    R.check('相邻 ' + (gap + 1) + ' 层内不会用同一个模板', !repeat);

    // 镜像开关会改变结构
    var tNo = new RA.Tower(pool).generate({ floors: 9, seed: seedA, mirror: false });
    R.check('关掉镜像后不会再有镜像层',
      tNo.floors.every(function (f) { return !f.flip; }));
    R.check('开镜像时会出现镜像层(9 层里至少一个)',
      t1.floors.some(function (f) { return f.flip; }));

    // 每层都能真的建出 Level,并且层标题带层号
    var allOk = true, nameOk = true;
    for (i = 0; i < t1.height; i++) {
      var lv = t1.level(i);
      if (!lv || !lv.goal) allOk = false;
      if (t1.title(i).indexOf('第 ' + (i + 1) + ' 层') < 0) nameOk = false;
    }
    R.check('每一层都能建出可玩的关卡', allOk);
    R.check('层标题带层号', nameOk);

    // 塔高会被夹在允许范围里
    var tiny = new RA.Tower(pool).generate({ floors: 999, seed: 1 });
    R.check('塔高不会超过上限', tiny.height <= C.TOWER_FLOORS_MAX);
    return R;
  }

  // ===================== ⑤ 关卡池:能不能爬上去 =====================
  function pack(game, log, opts) {
    opts = opts || {};
    var sim = opts.sim !== false;
    var R = new Runner(log);
    var pool = game.pool();

    pool.forEach(function (entry) {
      var lv;
      try {
        lv = RA.Level.fromData(entry.data || { id: entry.id, asc: entry.text },
          { id: entry.id });
      } catch (e) {
        R.check(entry.id + ' 能解析', false, String(e && e.message || e));
        return;
      }
      var bad = lv.warnings.slice();
      R.check(entry.id + ' 没有解析警告', bad.length === 0, bad.join('; '));
      R.check(entry.id + ' 有出生点和出口', lv.spawnCol !== null && !!lv.goal);
      R.check(entry.id + ' 出生点站在地面上',
        lv.groundBelow(lv.spawnRow, lv.spawnCol) === lv.spawnRow);
      R.check(entry.id + ' 出口站在地面上',
        lv.groundBelow(lv.goal.row, lv.goal.col) === lv.goal.row);

      var r = RA.Reach.path(lv, { sim: sim });
      var extra = '';
      if (r.hops && r.hops.length) {
        extra = r.hops.length + ' 跳';
        var hardest = null;
        r.hops.forEach(function (h) {
          var dy = (h.from.row - h.to.row) * lv.tile;
          if (!hardest || dy > hardest) hardest = dy;
        });
        extra += ' · 最高一次往上 ' + hardest + 'px';
      }
      R.check(entry.id + ' 从起点爬得到出口' + (sim ? '(逐跳物理模拟)' : '(跳跃包络)'),
        r.ok, r.ok ? extra : (r.reason || '') +
          (r.highest ? '(最高只到第 ' + (r.highest.row + 1) + ' 行)' : ''));
    });
    return R;
  }

  // ===================== ④b 关卡数据(id / 难度 / 大小 / objects) =====================
  /**
   * 关卡数据那一层:每层有没有 id、难度在不在 1~4、verified 是不是布尔、
   * json 里写的 size 和 asc 对不对得上、objects 是不是数组,
   * 以及怪物参数表(js/monsters.js)还在不在。
   */
  function levelData(game, log) {
    var R = new Runner(log);
    var pool = game.pool();
    var ids = pool.map(function (e) { return e.id; });
    R.check('每一层都有 id', ids.every(function (id) { return !!id; }), ids.join(','));
    R.check('关卡池里的 id 不重复', ids.length === new Set(ids).size);

    pool.forEach(function (e) {
      R.check(e.id + ' 的难度在 1~4 档',
        e.difficulty >= 1 && e.difficulty <= 4, '难度 ' + e.difficulty);
      R.check(e.id + ' 有 verified 标记(是不是验过能通)',
        typeof e.verified === 'boolean', String(e.verified));
      var data = e.data || {};
      if (data.size) {
        R.check(e.id + ' 的 size 和 asc 对得上',
          data.size.cols === e.cols && data.size.rows === e.rows,
          JSON.stringify(data.size) + ' / 实际 ' + e.cols + '×' + e.rows);
      }
      if (data.objects !== undefined) {
        R.check(e.id + ' 的 objects 是数组', Array.isArray(data.objects),
          JSON.stringify(data.objects));
      }
    });

    // 怪物参数表(现在游戏里还没有怪物,只有火球一条,参数先空着)
    if (!RA.Monsters) {
      R.check('怪物参数表装上了(js/monsters.js)', false);
    } else {
      R.check('怪物表里有 fireball', !!RA.Monsters.get('fireball'),
        RA.Monsters.ids().join(',') || '(空)');
      R.check('fireball 的参数先空着',
        Object.keys(RA.Monsters.defaults('fireball') || {}).length === 0);
      R.check('没登记的怪物返回 null', RA.Monsters.get('还没做的怪物') === null);
    }

    /*
     * schemaVersion=2 编解码(js/level-data.js)。
     * 浏览器和 Node 跑的是同一份实现:固定样例的 hash 必须一模一样,
     * 否则编辑器保存的草稿在 Node 工具里会被判 HASH_MISMATCH。
     * 这段只验证数据契约,不碰画面。
     */
    var LD = RA.LevelData;
    if (!LD) {
      R.check('关卡数据编解码模块装上了(js/level-data.js)', false);
    } else {
      R.check('SHA-256 固定向量:abc',
        LD.sha256Hex('abc') ===
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      var sample = {
        schemaVersion: 2,
        id: 'codec_sample',
        title: '自检样例',
        kind: 'normal',
        difficulty: 3,
        size: { cols: 4, rows: 3 },
        terrain: { tiles: [[0, 0, 0, 0], [0, 1, 1, 0], [4, 4, 4, 4]] },
        ports: null,
        spawn: { col: 1, row: 1 },
        objects: [],
        paths: [],
        visuals: { backgroundId: null, decorations: [] },
        extensions: {},
        contentHash: null,
        certification: null
      };
      var coded = LD.encode(sample);
      R.check('样例关卡可以编码成 schemaVersion=2 JSON', coded.ok);
      R.check('固定样例的 contentHash 跨环境一致(Node 自检里有同一个值)',
        LD.hashSync(sample) ===
        'sha256:aa6888d6e947aaa6e1e2efe0270667a2c0761a171335618bf566205dbfa5273f');
      var decoded = coded.ok ? LD.decode(coded.value) : null;
      R.check('编码 → 解码内容等价(除派生 hash)',
        !!(decoded && decoded.ok) &&
        LD.canonical(LD.contentOf(decoded.value)) === LD.canonical(LD.contentOf(sample)));
      R.check('旧图迁移函数可用(js/legacy-import.js)',
        !!RA.LegacyImport && RA.LegacyImport.migrate('+P+G', { id: 'tiny' }).ok);
    }
    return R;
  }

  // ===================== 入口 =====================
  var Smoke = {};

  Smoke.runAll = function (game, log, opts) {
    opts = opts || {};
    log = log || function () { };
    var fails = [], total = 0, skipped = 0;
    var collect = function (r) {
      fails = fails.concat(r.fails);
      total += r.total;
      skipped += r.skipped;
    };

    log('=== reverse_abyss 自检 ===', 'section');
    log('塔:种子 ' + game.tower.seedLabel + ' · ' + game.tower.height + ' 层 · 关卡池 ' +
      game.pool().length + ' 个模板', 'info');

    var pool = game.pool();
    if (!pool.length) {
      log('  关卡池是空的,没法自检', 'fail');
      fails.push('关卡池为空');
    } else {
      pool.forEach(function (entry) {
        log('', 'info');
        log('▌ 物理:' + entry.id, 'section');
        var lv = RA.Level.fromData(entry.data || { id: entry.id, asc: entry.text },
          { id: entry.id });
        collect(physics(lv, game.assets, log));
      });
    }

    log('', 'info');
    log('▌ 弹簧板', 'section');
    collect(springTest(game.assets, log));

    log('', 'info');
    log('▌ 云板(单向地块)', 'section');
    collect(onewayTest(game.assets, log));

    log('', 'info');
    log('▌ 会变的机关(触之即散 / 浮石)', 'section');
    collect(vanishTest(game.assets, log));

    log('', 'info');
    log('▌ 主循环与爬升', 'section');
    collect(gameLoop(game, log));

    log('', 'info');
    log('▌ 塔的结构', 'section');
    collect(tower(game, log));

    log('', 'info');
    log('▌ 关卡数据(难度 / 验过没有 / 大小 / objects / 怪物表)', 'section');
    collect(levelData(game, log));

    log('', 'info');
    log('▌ 关卡池能不能爬上去', 'section');
    collect(pack(game, log, opts));

    log('', 'info');
    if (fails.length) {
      log('自检未通过:' + fails.length + ' 项失败 / 共 ' + total + ' 项' +
        (skipped ? '(跳过 ' + skipped + ' 项)' : ''), 'fail');
      fails.forEach(function (f) { log('    ✗ ' + f, 'fail'); });
    } else {
      log('自检全部通过 ✔  共 ' + total + ' 项' +
        (skipped ? ',跳过 ' + skipped + ' 项' : ''), 'pass');
    }
    return { ok: fails.length === 0, fails: fails, total: total, skipped: skipped };
  };

  Smoke.physics = physics;
  Smoke.springTest = springTest;
  Smoke.onewayTest = onewayTest;
  Smoke.gameLoop = gameLoop;
  Smoke.tower = tower;
  Smoke.levelData = levelData;
  Smoke.pack = pack;
  RA.Smoke = Smoke;
})(globalThis.RA = globalThis.RA || {});
