/* -*- coding: utf-8 -*- */
/*
 * game.js —— 主循环 + 状态机
 * ===========================
 * 把各部分串起来:塔 → 这一层的关卡 → 角色 → 镜头 → 每帧更新 → 绘制。
 *
 * 状态:
 *   title   开局界面(只有 开始 / 退出 / 右下角齿轮)
 *   bye     点了退出之后(浏览器不让关标签页,就给你一个告别页)
 *   play    正在爬某一层
 *   climb   爬到出口了,关卡切换:旧层渐出 → 暗场 → 新层渐入(见 drawClimb)
 *   victory 爬到塔顶
 * 设置面板不是单独的状态,而是 title 上的一个开关(this.settings):
 * 种子、塔高、镜像、重构、导入关卡、关卡编辑器全在里面。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var W = C.WIDTH, H = C.HEIGHT;

  class Game {
    constructor(canvas, pack) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.pack = pack || { pool: [], bad: [] };

      this.assets = new RA.Assets();
      this.snd = new RA.SoundBank();
      this.input = new RA.Input(canvas);
      this.input.onFirstInput = () => { this.snd.resume(); };
      if (globalThis.document && globalThis.document.addEventListener) {
        this.input.attach(globalThis, globalThis.document);
      }

      this.floors = RA.clamp(C.TOWER_FLOORS, C.TOWER_FLOORS_MIN, C.TOWER_FLOORS_MAX);
      this.mirror = C.MIRROR_DEFAULT;

      this.state = 'title';
      this.settings = false;                   // 开局界面右下角齿轮打开的那个设置面板
      this.floor = 0;
      this.level = null;
      this.player = null;
      this.camera = null;
      this.climb = null;
      this.toast = null;
      this.stats = { time: 0, falls: 0 };

      this.seedEditing = false;
      this.seedBuffer = '';
      this.seedFresh = true;
      this.importMsg = '';
      this.importT = 99;
      this._told = {};

      this.tower = new RA.Tower(this.pool());
      this.newTower();
      this._reportPack();
    }

    // ================= 关卡池 / 塔 =================
    /**
     * 现在能用来选层的模板。组装只有一处:RA.LevelPack.poolOf(见那边注释)——
     * 它把 内嵌/实时关卡数据 + 浏览器里导入的 + 编辑器「保存到游戏」的覆盖 合成一份,
     * 同 id 只留一条。每次要抽层之前调一次,编辑器刚存的新层就能立刻进场。
     */
    pool() {
      return RA.LevelPack.poolOf(this.pack).list;
    }

    /** 重新排一座塔:seed 不给就随机一个新种子 */
    newTower(seed) {
      this.tower = new RA.Tower(this.pool());
      this.tower.generate({
        floors: this.floors,
        seed: (seed === undefined || seed === null) ? RA.randomSeed() : seed,
        mirror: this.mirror
      });
      return this.tower;
    }

    /** 关卡池 / 塔高 / 镜像 变了之后,用同一个种子重排(前几层会保持不变) */
    retower() {
      this.tower.pool = this.pool();       // 每次都重拼一遍:编辑器刚存的层要能立刻上场
      this.tower.generate({
        floors: this.floors,
        seed: this.tower.seedLabel,
        mirror: this.mirror
      });
      return this.tower;
    }

    setFloors(n) {
      this.floors = RA.clamp(Math.round(n), C.TOWER_FLOORS_MIN, C.TOWER_FLOORS_MAX);
      this.retower();
    }

    // ================= 开局 / 爬升 =================
    /** 从第 1 层开始爬(塔结构不变) */
    startRun() {
      if (!this.pool().length) return false;
      this.settings = false;
      this.seedEditing = false;
      this.input.textMode = false;
      this.stats = { time: 0, falls: 0 };
      this.tower.clearCache();                 // 实体状态要全新的(弹簧冷却之类)
      this.climb = null;
      this.loadFloor(0);
      if (!this.level) return false;
      this.state = 'play';
      return true;
    }

    /** 读入第 i 层(0 基),并在它的出生点造一个角色 */
    loadFloor(i) {
      this.floor = i;
      this.tower.current = i;
      var lv = this.tower.level(i);
      this.level = lv;
      if (!lv) {
        this.player = null;
        this.camera = null;
        return null;
      }
      lv.entities.forEach((e) => e.loadSprites(this.assets));
      // 角色由引擎创建(出生点位置写在关卡地图里)
      this.player = new RA.Player(lv);
      this.player.loadSprites(this.assets);
      this.camera = new RA.Camera(lv);
      this.camera.snapTo(this.player);
      this.toast = { text: this.tower.title(i), t: 0 };
      this._reportLevel(lv);
      return lv;
    }

    /** 碰到出口:开始往上一层滚 */
    beginClimb() {
      var to = this.floor + 1;
      var c = {
        t: 0,
        to: to,
        final: to >= this.tower.height,
        name: '',
        oldLevel: this.level,
        oldCam: this.camera,
        oldPlayer: this.player,
        next: null,
        nextCam: null,
        nextPlayer: null
      };
      if (!c.final) {
        var lv = this.tower.level(to);
        if (!lv) {
          c.final = true;
        } else {
          lv.entities.forEach((e) => e.loadSprites(this.assets));
          c.next = lv;
          c.nextPlayer = new RA.Player(lv);
          c.nextPlayer.loadSprites(this.assets);
          c.nextCam = new RA.Camera(lv);
          c.nextCam.snapTo(c.nextPlayer);
          c.name = this.tower.title(to);
        }
      }
      this.climb = c;
      this.floor = to;                                  // HUD / 塔进度条立刻往上跳一格
      this.tower.current = Math.min(to, this.tower.height - 1);
      this.toast = null;
      this.state = 'climb';
      this.snd.play('floor');
    }

    finishClimb() {
      var c = this.climb;
      this.climb = null;
      if (!c) return;
      if (c.final) {
        this.state = 'victory';
        return;
      }
      this.level = c.next;
      this.player = c.nextPlayer;
      this.camera = c.nextCam;
      this.camera.panY = 0;
      this.toast = { text: c.name, t: 0 };
      this.state = 'play';
    }

    toTitle() {
      this.state = 'title';
      this.settings = false;
      this.seedEditing = false;
      this.seedBuffer = '';
      this.input.textMode = false;
    }

    // ================= 每帧 =================
    update(dt) {
      RA.time = (RA.time || 0) + dt;
      if (this.importT < 99) this.importT += dt;
      switch (this.state) {
        case 'title':
          if (this.settings) this.updateSettings();
          else this.updateTitle();
          break;
        case 'bye': this.updateBye(); break;
        case 'play': this.updatePlay(dt); break;
        case 'climb': this.updateClimb(dt); break;
        case 'victory': this.updateVictory(dt); break;
      }
      if (this.toast) this.toast.t += dt;
    }

    updatePlay(dt) {
      var inp = this.input;
      this.stats.time += dt;
      this.player.update(dt, inp.down, this);
      var ents = this.level.entities;
      for (var i = 0; i < ents.length; i++) ents[i].update(dt, this);

      // 掉出本层世界 → 回本层起点。爬塔里这不算死,只记一次"坠落"。
      if (this.player.y > this.level.worldH + C.FALL_MARGIN) {
        this.player.reset();
        this.camera.snapTo(this.player);
        this.stats.falls++;
        this.snd.play('land');
      }
      if (this.level.win(this.player)) {
        this.beginClimb();
        return;
      }
      this.camera.update(dt, this.player);
      if (inp.pressed('back')) this.toTitle();
    }

    updateClimb(dt) {
      var c = this.climb;
      c.t += dt;
      // 让新楼层的角色在空中 / 地面上站稳,进场时不会僵着
      if (c.nextPlayer) c.nextPlayer.update(dt, {}, this);
      if (c.nextCam) c.nextCam.snapTo(c.nextPlayer);
      if (c.t >= C.CLIMB_TIME) this.finishClimb();
    }

    /** 开局界面:只有 开始 / 退出 / 右下角设置(别的都在设置里) */
    updateTitle() {
      var L = RA.UI.titleLayout();
      var inp = this.input;
      if (inp.pressed('back') || inp.clickedIn(L.gear)) { this.openSettings(); return; }
      if (inp.clickedIn(L.start) || (inp.pressed('confirm') && this.pool().length)) {
        this.startRun();
        return;
      }
      if (inp.clickedIn(L.quit)) { this.quitGame(); return; }
    }

    openSettings() {
      this.settings = true;
      this.seedEditing = false;
      this.input.textMode = false;
    }

    closeSettings() {
      this.settings = false;
      this.seedEditing = false;
      this.input.textMode = false;
    }

    /** 退出游戏:先试着把标签页关掉(浏览器多半不让),不行就给个告别页 */
    quitGame() {
      this.settings = false;
      this.seedEditing = false;
      this.input.textMode = false;
      try {
        if (typeof globalThis.close === 'function') globalThis.close();
      } catch (e) { /* 关不掉就算了 */ }
      this.state = 'bye';
    }

    updateBye() {
      if (this.input.pressed('back') || this.input.clicks.length) this.toTitle();
    }

    /** 设置面板:种子 / 塔高 / 镜像 / 重构 / 导入关卡 / 关卡编辑器 */
    updateSettings() {
      var L = RA.UI.settingsLayout();
      var inp = this.input;

      // ---------- 种子输入框(它优先:正在打字时 Esc 是"取消输入") ----------
      if (this.seedEditing) {
        inp.textMode = true;
        if (inp.typed) {
          // 刚点进输入框时里面是旧种子(像"全选"状态),第一次敲字直接替换掉
          if (this.seedFresh) { this.seedBuffer = ''; this.seedFresh = false; }
          this.seedBuffer = (this.seedBuffer + inp.typed).slice(0, 16);
        }
        if (inp.backspace) {
          this.seedFresh = false;
          this.seedBuffer = this.seedBuffer.slice(0, -1);
        }
        if (inp.pressed('confirm')) {
          this.seedEditing = false;
          inp.textMode = false;
          var n = RA.labelToSeed(this.seedBuffer);
          if (n !== null) this.newTower(n);
          this.seedBuffer = '';
        } else if (inp.pressed('back')) {
          this.seedEditing = false;
          inp.textMode = false;
          this.seedBuffer = '';
        }
        return;
      }

      // ---------- 关闭设置 ----------
      if (inp.pressed('back') || inp.clickedIn(L.close)) { this.closeSettings(); return; }
      inp.textMode = false;

      if (inp.clickedIn(L.seed)) {
        this.seedEditing = true;
        this.seedFresh = true;
        this.seedBuffer = this.tower.seedLabel;
        return;
      }
      if (inp.pressed('reroll') || inp.clickedIn(L.reroll)) { this.newTower(); return; }
      if (inp.pressed('mirror') || inp.clickedIn(L.mirror)) {
        this.mirror = !this.mirror;
        this.retower();
        return;
      }
      if (inp.pressed('up') || inp.clickedIn(L.floorsPlus)) { this.setFloors(this.floors + 1); return; }
      if (inp.pressed('down') || inp.clickedIn(L.floorsMinus)) { this.setFloors(this.floors - 1); return; }
      if (inp.pressed('importer') || inp.clickedIn(L.importer)) { this.openImporter(); return; }
      if (inp.pressed('editor') || inp.clickedIn(L.editor)) { this.openEditor(); return; }
    }

    updateVictory() {
      var L = RA.UI.victoryLayout();
      var inp = this.input;
      if (inp.pressed('confirm') || inp.clickedIn(L.again)) { this.startRun(); return; }
      if (inp.pressed('reroll') || inp.clickedIn(L.reroll)) {
        this.newTower();
        this.startRun();
        return;
      }
      if (inp.pressed('back') || inp.clickedIn(L.title)) { this.toTitle(); return; }
    }

    // ================= 绘制 =================
    /**
     * 第 i 层用哪张天空:
     *   关卡自己写了 // sky: N → 一直用它(关卡独立);
     *   否则按层循环(sky1 → sky2 → … → sky8 → sky1),默认就是这样。
     */
    skyOf(level, i) {
      if (level && level.sky) return level.sky;
      var n = C.SKY_COUNT || 8;
      return ((i % n) + n) % n + 1;
    }

    /** 第 i 层对应的"高度比例":0 = 塔底(暗) 1 = 塔顶(亮) */
    ratioFor(i) {
      var n = this.tower.height;
      if (n <= 1) return 1;
      return RA.clamp(i / (n - 1), 0, 1);
    }

    drawWorld(ctx, level, cam, player) {
      if (!level) return;
      level.draw(ctx, cam, this.assets);                 // 地形
      level.drawDecor(ctx, cam);                         // 地形装饰(起点箭头)
      for (var i = 0; i < level.entities.length; i++) {
        level.entities[i].draw(ctx, cam, this.assets);    // 出口、弹簧…
      }
      if (player) player.draw(ctx, cam, this.assets);     // 角色
    }

    /**
     * 关卡切换的"渐入渐出":前一半旧楼层淡出,后一半新楼层淡入,中间夹一层暗场。
     * 三个 alpha 只在这儿算 —— 画的时候和自检量的都是这一份,不会两处对不上。
     *   old  : 旧楼层的透明度 1 → 0(前一半)
     *   next : 新楼层的透明度 0 → 1(后一半)
     *   dim  : 中间那层黑的浓度 0 → 1 → 0(切到一半时最暗,两层就不会叠在一起)
     */
    climbFade(c) {
      var split = C.CLIMB_FADE_SPLIT;
      var e = RA.clamp(((c ? c.t : 0) / C.CLIMB_TIME), 0, 1);
      var fadeOut = RA.clamp(e / split, 0, 1);
      var fadeIn = RA.clamp((e - split) / (1 - split), 0, 1);
      var dim = 1 - Math.abs(e - split) / split;
      return { e: e, old: 1 - fadeOut, next: fadeIn, dim: RA.clamp(dim, 0, 1) };
    }

    /** 一层楼连同它的角色,按给定透明度画上去(渐入渐出用) */
    drawWorldFade(ctx, level, cam, player, alpha) {
      if (!level || alpha <= 0.004) return;
      ctx.save();
      ctx.globalAlpha = RA.clamp(alpha, 0, 1);
      this.drawWorld(ctx, level, cam, player);
      ctx.restore();
    }

    /** 关卡切换:背景交叉淡化,旧楼层渐出 → 暗场 → 新楼层渐入 */
    drawClimb(ctx) {
      var c = this.climb;
      var f = this.climbFade(c);
      var skyOld = this.skyOf(c.oldLevel, c.to - 1);
      var skyNew = this.skyOf(c.next, c.to);
      RA.UI.drawBackground(ctx, skyOld);
      if (skyNew !== skyOld) {
        ctx.save();
        ctx.globalAlpha = f.e;
        RA.UI.drawBackground(ctx, skyNew);
        ctx.restore();
      }

      this.drawWorldFade(ctx, c.oldLevel, c.oldCam, c.oldPlayer, f.old);
      this.drawWorldFade(ctx, c.next, c.nextCam, c.nextPlayer, f.next);

      // 中间压暗:切到一半时最黑,两层的交界就看不出来了
      var dimA = f.dim * C.CLIMB_DIM;
      if (dimA > 0.002) {
        ctx.save();
        ctx.fillStyle = 'rgba(4,6,14,' + dimA.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    draw(ctx) {
      if (this.state === 'title') {
        RA.UI.drawTitle(ctx, this);
        if (this.settings) RA.UI.drawSettings(ctx, this);
        return;
      }
      if (this.state === 'bye') {
        RA.UI.drawBye(ctx);
        return;
      }
      if (this.state === 'climb') {
        this.drawClimb(ctx);
      } else {
        RA.UI.drawBackground(ctx, this.skyOf(this.level, this.floor));
        this.drawWorld(ctx, this.level, this.camera, this.player);
      }
      if (this.level) RA.UI.drawHud(ctx, this);
      if (this.state === 'climb') RA.UI.drawClimbOverlay(ctx, this);
      RA.UI.drawToast(ctx, this);
      if (this.state === 'victory') RA.UI.drawVictory(ctx, this);
    }

    // ================= 导入自定义关卡 =================
    /** 按 I / 点按钮:选关卡文件(txt / json)加进关卡池 */
    openImporter() {
      var doc = globalThis.document;
      if (!doc || !doc.createElement) return;
      var self = this;
      if (!this.fileInput) {
        var el = doc.createElement('input');
        el.type = 'file';
        el.accept = '.txt,.json,.asc,text/plain,application/json';
        el.multiple = true;
        el.style.display = 'none';
        el.addEventListener('change', function () {
          if (el.files && el.files.length) self._readFiles(el.files);
          el.value = '';
        });
        if (doc.body && doc.body.appendChild) doc.body.appendChild(el);
        this.fileInput = el;
      }
      this.fileInput.click();
    }

    /** 直接把关卡文件(txt / json)拖到窗口里也能导入 */
    attachDrop() {
      var doc = globalThis.document;
      if (!doc || !doc.addEventListener) return;
      var self = this;
      doc.addEventListener('dragover', function (e) { e.preventDefault(); });
      doc.addEventListener('drop', function (e) {
        e.preventDefault();
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) self._readFiles(files);
      });
    }

    _readFiles(files) {
      var self = this;
      var arr = Array.prototype.slice.call(files);
      var left = arr.length;
      if (!left) return;
      arr.forEach(function (f) {
        var name = String(f.name || 'custom').replace(/\.(txt|json|asc)$/i, '');
        var done = function (text) {
          if (text) self.addCustomLevel(name, text);
          left--;
          if (left === 0) self.afterImport();
        };
        if (globalThis.FileReader) {
          var r = new globalThis.FileReader();
          r.onload = function () { done(String(r.result || '')); };
          r.onerror = function () { done(''); };
          r.readAsText(f, 'utf-8');
        } else {
          done('');
        }
      });
    }

    /** 加一个自定义模板进关卡池(同名会替换),并记进浏览器,刷新后还在 */
    addCustomLevel(name, value) {
      var id = RA.LevelPack.customId(name);
      var r = RA.LevelPack.validate(value, id);
      if (!r.ok) {
        this.importMsg = '读不出来:' + name + '(' + (r.error || '格式不对') + ')';
        this.importT = 0;
        return false;
      }
      var saved = RA.LevelPack.putCustom(name, value);
      this.importMsg = '已导入「' + r.id + '」,关卡池现在有 ' + this.pool().length +
        ' 个模板' + (saved ? '(已存在浏览器里)' : '(这个浏览器不让存,只在本次有效)');
      this.importT = 0;
      return true;
    }

    /** 打开关卡编辑器(新标签页);编辑器里「保存到游戏」之后回到这里刷新就有效果 */
    openEditor() {
      var open = globalThis.open;
      if (typeof open === 'function') {
        open('editor.html', '_blank');
      } else if (globalThis.location) {
        globalThis.location.href = 'editor.html';
      }
      this.importMsg = '已打开关卡编辑器:画完点「保存到游戏」,回到这里刷新 —— ' +
        '新的一份按 R 重构塔就会刷出来';
      this.importT = 0;
    }

    afterImport() {
      this.retower();
    }

    // ================= 主循环 =================
    /** 浏览器里的 rAF 主循环;自检会自己一帧一帧调 update/draw,不走这里 */
    loop() {
      var self = this;
      var last = null;
      function frame(now) {
        if (last === null) last = now;
        var dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        self.update(dt);
        self.draw(self.ctx);
        self.input.endFrame();
        globalThis.requestAnimationFrame(frame);
      }
      globalThis.requestAnimationFrame(frame);
    }

    // ================= 给控制台的提示 =================
    _reportPack() {
      var p = this.pack;
      if (!p.pool.length) {
        console.warn('[levelpack] 关卡池是空的:把 levels/*.json 放好,再运行 node tools/sync_levels.mjs');
      } else {
        console.log('[levelpack] 关卡池 ' + p.pool.length + ' 个模板(' +
          (p.live ? 'json 实时读取' : '内嵌 levels.js') + '):' +
          p.pool.map(function (e) { return ' ' + e.id; }).join(''));
      }
      (p.bad || []).forEach(function (b) {
        console.warn('[levelpack] ' + b.id + ': ' + b.messages.join('; '));
      });
    }

    _reportLevel(lv) {
      var key = lv.id + '|' + (lv.source || '');
      if (this._told[key]) return;
      this._told[key] = true;
      lv.warnings.forEach(function (w) {
        console.warn('[level] ' + lv.id + ': ' + w);
      });
    }
  }

  RA.Game = Game;
})(globalThis.RA = globalThis.RA || {});
