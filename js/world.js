/* -*- coding: utf-8 -*- */
/*
 * world.js —— 连续楼层运行时(共用 GameSession 的世界部分)
 * =========================================================
 * 一份 World 持有若干 FloorInstance:
 *   active   当前层,完整模拟;
 *   preview  下一层,只跑非攻击的环境运动与计时,不接触玩家;
 *   snapshot 上一层,只保留地形,不再模拟。
 *
 * 楼层原点由相邻接口对齐:
 *   next.origin.x = cur.origin.x + (cur.exit.col - next.entry.col) * TS
 *   next.origin.y = cur.origin.y - next.rows * TS
 * 全局再平移到 x >= 0。端口开口宽 4 格、按世界坐标对齐;过界判定用玩家脚底,
 * 一次越线只提交一次。
 *
 * 这里不做攻击/伤害/Boss;预热用路径对象的占位运动证明"下一层在动但不打人"。
 */
(function (RA) {
  'use strict';

  var C = RA.C;
  var LD = RA.LevelData;
  var TS = C.TS;
  var OPEN = LD.PORT.openingCols;

  function ok(value) { return { ok: true, value: value }; }
  function fail(code, message, issues) {
    return { ok: false, error: { code: code, message: message, issues: issues || [] } };
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  function tilesToAsc(tiles) {
    return tiles.map(function (row) {
      return row.map(function (id) { return LD.charOf(id) || '+'; }).join('');
    }).join('\n');
  }

  /** 单层运行时:模板只读,运动状态放在实例副本里 */
  class FloorInstance {
    constructor(data, index, opts) {
      opts = opts || {};
      this.index = index;
      this.data = data;
      this.cols = data.size.cols;
      this.rows = data.size.rows;
      this.spawn = data.spawn;
      this.ports = data.ports;
      this.entryCol = data.ports.entry.col;
      this.exitCol = data.ports.exit.col;
      this.origin = { x: 0, y: 0 };
      this.state = 'preview';
      this.activeTime = 0;
      this.previewTime = 0;
      this.entered = false;
      this.hasNext = !!opts.hasNext;
      this.objects = (data.objects || []).map(function (o) {
        var rec = clone(o);
        rec._phase = 0;
        return rec;
      });
      this.paths = {};
      (data.paths || []).forEach(function (p) { this.paths[p.id] = p; }, this);

      var level = RA.Level.fromData({
        id: data.id + '_runtime',
        asc: tilesToAsc(data.terrain.tiles),
        size: { cols: this.cols, rows: this.rows }
      }, { id: data.id + '_runtime' });
      level.startX = this.spawn.col * TS + 8;
      level.startFeet = (this.spawn.row + 1) * TS;
      level.spawnCol = this.spawn.col;
      level.spawnRow = this.spawn.row;
      this.level = level;
      this.view = new FloorView(this);
    }

    get originTileX() { return Math.round(this.origin.x / TS); }
    get originTileY() { return Math.round(this.origin.y / TS); }
    get bottomY() { return this.origin.y + this.rows * TS; }
    get seamY() { return this.origin.y; }

    /** 顶边这一列能不能通过(只在有下一层时开放端口) */
    topOpenAt(localCol) {
      if (!this.hasNext) return false;
      return localCol >= this.exitCol && localCol < this.exitCol + OPEN;
    }

    /** 非攻击的环境运动:路径对象沿路径来回走;不产生伤害 */
    updateAmbient(dt) {
      this.objects.forEach(function (o) {
        if (!o.pathId || !this.paths[o.pathId]) return;
        var path = this.paths[o.pathId];
        var pts = path.points || [];
        if (pts.length < 2) return;
        var speed = 40;                      // 诊断用像素速度
        var total = 0, segs = [];
        for (var i = 1; i < pts.length; i++) {
          var dx = (pts[i].col - pts[i - 1].col) * TS;
          var dy = (pts[i].row - pts[i - 1].row) * TS;
          var len = Math.sqrt(dx * dx + dy * dy) || 0.001;
          segs.push({ a: pts[i - 1], b: pts[i], len: len, dx: dx, dy: dy });
          total += len;
        }
        if (path.mode === 'pingpong') {
          var p = o._phase % 2;
          o._phase = p + dt * speed / total;
        } else {
          o._phase = (o._phase + dt * speed / total) % 1;
        }
        var u = o._phase % 1;
        var acc = u * total;
        for (var s = 0; s < segs.length; s++) {
          if (acc <= segs[s].len || s === segs.length - 1) {
            var k = segs[s].len ? Math.min(1, acc / segs[s].len) : 0;
            o.rx = (segs[s].a.col + (segs[s].b.col - segs[s].a.col) * k) * TS + TS / 2;
            o.ry = (segs[s].a.row + (segs[s].b.row - segs[s].a.row) * k) * TS + TS / 2;
            break;
          }
          acc -= segs[s].len;
        }
      }, this);
    }
  }

  /** 交给现有 Player 的楼层适配层:世界坐标 ↔ 当前层局部坐标 */
  class FloorView {
    constructor(inst) {
      this.inst = inst;
      this.tile = TS;
      this.worldW = Infinity;            // Player 自己不再把 x 夹到单层宽度
      this.spawnCol = inst.spawn.col;
      this.spawnRow = inst.spawn.row;
      this.startX = inst.origin.x + inst.spawn.col * TS + 8;
      this.startFeet = inst.origin.y + (inst.spawn.row + 1) * TS;
    }
    _lr(worldRow) { return worldRow - this.inst.originTileY; }
    _lc(worldCol) { return worldCol - this.inst.originTileX; }

    /** Player/落脚容错用世界行列查询;越界按地面边界处理 */
    blockedAt(worldRow, worldCol) {
      var lr = this._lr(worldRow), lc = this._lc(worldCol);
      if (lc < 0 || lc >= this.inst.cols) return lr >= 0 && lr < this.inst.rows;
      if (lr < 0) return false;                   // 地图上方没有地块;顶边由 move 处理
      if (lr >= this.inst.rows) return true;      // 底边:防回落/防掉出世界
      return !!this.inst.level.grid[lr][lc] || !!this.inst.level.oneway[lr][lc];
    }

    standingOn(worldX, feet, w) {
      var inst = this.inst;
      var lx = worldX - inst.origin.x;
      var lf = feet - inst.origin.y;
      if (lf >= inst.rows * TS - 0.6) return true;  // 底部梯板(接口处也不回落到下一层)
      return inst.level.standingOn(lx, lf, w);
    }

    move(worldX, worldY, w, h, vx, vy, dt) {
      var inst = this.inst;
      var origin = inst.origin;
      var r = inst.level.move(worldX - origin.x, worldY - origin.y, w, h, vx, vy, dt);
      var nx = r.x, ny = r.y, nvx = r.vx, nvy = r.vy, grounded = r.grounded;

      // 左右外墙
      if (nx < 0) { nx = 0; nvx = 0; }
      if (nx > inst.cols * TS - w) { nx = inst.cols * TS - w; nvx = 0; }

      // 顶边:只有身体完全在出口开口内才允许越线;否则当天花板
      if (ny < 0) {
        var openL = inst.exitCol * TS;
        var openR = openL + OPEN * TS;
        var inside = nx >= openL - 0.01 && nx + w <= openR + 0.01;
        if (!inside || !inst.hasNext) { ny = 0; nvy = 0; }
      }

      // 底边:进入本层后是一块单向梯板,防止从入口回落到下一层
      if (ny + h > inst.rows * TS) {
        ny = inst.rows * TS - h;
        nvy = 0;
        grounded = true;
      }

      return {
        x: nx + origin.x, y: ny + origin.y,
        vx: nvx, vy: nvy, grounded: grounded
      };
    }
  }

  class World {
    constructor(floors, opts) {
      opts = opts || {};
      this.floors = floors;
      this.instances = new Map();
      this.events = [];
      this.current = opts.startFloor || 0;
      this.maxLive = 3;

      // 先算所有原点;再整体平移到 x>=0
      var origins = [{ x: 0, y: 0 }];
      for (var i = 1; i < floors.length; i++) {
        origins.push({
          x: origins[i - 1].x + (floors[i - 1].ports.exit.col - floors[i].ports.entry.col) * TS,
          y: origins[i - 1].y - floors[i].size.rows * TS
        });
      }
      var minX = Math.min.apply(null, origins.map(function (o) { return o.x; }));
      var shift = minX < 0 ? -minX : 0;
      origins.forEach(function (o) { o.x += shift; });
      this.origins = origins;

      var self = this;
      this._spawn = function (index, state) {
        var inst = new FloorInstance(floors[index], index, {
          hasNext: index < floors.length - 1
        });
        inst.origin = { x: origins[index].x, y: origins[index].y };
        inst.state = state;
        inst.view = new FloorView(inst);
        self.instances.set(index, inst);
        return inst;
      };
      this._spawn(this.current, 'active').entered = true;
      if (floors[this.current + 1]) this._spawn(this.current + 1, 'preview');
    }

    get currentFloor() { return this.instances.get(this.current); }
    get floorCount() { return this.floors.length; }
    get floorsData() { return this.floors; }

    floorAt(i) { return this.instances.get(i); }

    liveStates() {
      return Array.from(this.instances.keys()).sort(function (a, b) { return a - b; })
        .map(function (i) {
          var f = this.instances.get(i);
          return {
            index: i, state: f.state,
            activeTime: f.activeTime, previewTime: f.previewTime,
            hasNext: f.hasNext
          };
        }, this);
    }

    /** 每步:active 完整计时 + ambient;preview 只走非攻击计时 + ambient */
    tick(dt) {
      var active = this.currentFloor;
      if (active) {
        active.activeTime += dt;
        active.updateAmbient(dt);
      }
      var preview = this.instances.get(this.current + 1);
      if (preview && preview.state === 'preview') {
        preview.previewTime += dt;
        preview.updateAmbient(dt);
      }
    }

    /** 脚底越过当前层顶边且身体在开口内 → 提交一次 */
    afterPlayerStep(player, prevFeet) {
      var active = this.currentFloor;
      var next = this.instances.get(this.current + 1);
      if (!active || !next) return null;
      if (!(prevFeet >= active.seamY && player.feet < active.seamY)) return null;
      var openL = active.origin.x + active.exitCol * TS;
      var openR = openL + OPEN * TS;
      if (player.x < openL - 0.01 || player.x + player.w > openR + 0.01) return null;
      return this.commitNext();
    }

    commitNext() {
      var from = this.currentFloor;
      var to = this.instances.get(this.current + 1);
      if (!from || !to) return null;
      from.state = 'snapshot';
      to.state = 'active';
      to.entered = true;
      to.activeTime = 0;
      this.current = to.index;

      if (this.player) this.player.level = to.view;

      var nextIndex = this.current + 1;
      if (this.floors[nextIndex] && !this.instances.has(nextIndex)) {
        this._spawn(nextIndex, 'preview');
      }
      // 上一层的地形保留到再上一层才释放
      var releaseBelow = this.current - 2;
      Array.from(this.instances.keys()).forEach(function (i) {
        if (i <= releaseBelow) this.instances.delete(i);
      }, this);

      var ev = { type: 'floorEntered', from: from.index, to: to.index, simTime: this.simTime || 0 };
      this.events.push(ev);
      return ev;
    }

    /** Session 注入 player 引用,用于提交后切换适配层与过界判定 */
    attachPlayer(player) {
      this.player = player;
      player.level = this.currentFloor.view;
    }

    drainEvents() {
      var out = this.events.slice();
      this.events.length = 0;
      return out;
    }

    /** 给页面用的调试/验收快照 */
    snapshot() {
      return {
        current: this.current,
        floorCount: this.floors.length,
        live: this.liveStates(),
        events: this.events.slice()
      };
    }
  }

  RA.FloorInstance = FloorInstance;
  RA.FloorView = FloorView;
  RA.World = World;
})(globalThis.RA = globalThis.RA || {});
