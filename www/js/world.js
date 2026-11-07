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
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

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
      this.cloud = !!(RA.CloudPipe && RA.CloudPipe.isCloud(data.ports));
      if (this.cloud) {
        this.start = data.ports.start;
        this.finish = data.ports.finish;
        this.entryCol = this.start.col;
        this.exitCol = this.finish.col;
      } else {
        this.start = null;
        this.finish = null;
        this.entryCol = data.ports.entry.col;
        this.exitCol = data.ports.exit.col;
      }
      this.origin = { x: 0, y: 0 };
      this.state = 'preview';
      this.activeTime = 0;
      this.previewTime = 0;
      this.entered = false;
      this.hasNext = !!opts.hasNext;
      this.exitOpen = data.kind !== 'boss';
      this.objects = (data.objects || []).map(function (o) {
        var rec = clone(o);
        rec._phase = 0;
        rec.alive = true;
        rec.broken = false;
        rec.state = 'idle';
        rec.timer = 0;
        rec.cycle = 0;
        rec.rx = rec.col * TS + TS / 2;
        rec.ry = rec.row * TS + TS / 2;
        return rec;
      });
      this.paths = {};
      (data.paths || []).forEach(function (p) { this.paths[p.id] = p; }, this);

      var level = RA.Level.fromData({
        id: data.id + '_runtime',
        asc: tilesToAsc(data.terrain.tiles),
        size: { cols: this.cols, rows: this.rows }
      }, { id: data.id + '_runtime' });
      var pose = this.cloud && RA.CloudPipe ? RA.CloudPipe.startPose(data, { w: 20, h: 36 }) : null;
      if (pose) {
        level.startX = this.origin.x + pose.x;
        level.startFeet = this.origin.y + pose.feet;
        level.startLocalX = pose.x;
        level.startLocalFeet = pose.feet;
        level.spawnCol = pose.col;
        level.spawnRow = Math.max(0, pose.row - 1);
      } else {
        level.startX = this.spawn.col * TS + 8;
        level.startFeet = (this.spawn.row + 1) * TS;
        level.spawnCol = this.spawn.col;
        level.spawnRow = this.spawn.row;
      }
      var self = this;
      level.solidEntityAt = function (r, c) { return self.solidAt(r, c); };
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

    /** 路径几何(loop 含末点→首点;pingpong 折返) */
    pathSegments(path) {
      var pts = (path && path.points) || [];
      if (pts.length < 2) return null;
      var segs = [];
      for (var i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
      if (path.mode === 'loop' && pts.length >= 2) segs.push([pts[pts.length - 1], pts[0]]);
      var total = 0;
      segs = segs.map(function (s) {
        var dx = (s[1].col - s[0].col) * TS;
        var dy = (s[1].row - s[0].row) * TS;
        var len = Math.sqrt(dx * dx + dy * dy) || 0.001;
        total += len;
        return { a: s[0], b: s[1], len: len };
      });
      return { segs: segs, total: total };
    }

    /** 路径对象运动;preview 只动不打人 */
    moveObjects(dt) {
      this.objects.forEach(function (o) {
        if (!o.pathId || !this.paths[o.pathId]) return;
        var geo = this.pathSegments(this.paths[o.pathId]);
        if (!geo) return;
        var speed = (o.params && Number(o.params.speedTilesPerSecond) || 0) * TS || 90;
        if (this.paths[o.pathId].mode === 'pingpong') {
          var p = o._phase % 2;
          o._phase = p + dt * speed / geo.total;
        } else {
          o._phase = (o._phase + dt * speed / geo.total) % 1;
        }
        var u = o._phase % 2;
        if (this.paths[o.pathId].mode === 'pingpong' && u > 1) u = 2 - u;
        var acc = u * geo.total;
        for (var s = 0; s < geo.segs.length; s++) {
          if (acc <= geo.segs[s].len || s === geo.segs.length - 1) {
            var k = geo.segs[s].len ? Math.min(1, acc / geo.segs[s].len) : 0;
            var a = geo.segs[s].a, b = geo.segs[s].b;
            o.rx = (a.col + (b.col - a.col) * k) * TS + TS / 2;
            o.ry = (a.row + (b.row - a.row) * k) * TS + TS / 2;
            break;
          }
          acc -= geo.segs[s].len;
        }
      }, this);
    }

    updateAmbient(dt) { this.moveObjects(dt); }

    /** 对象是否提供实心碰撞(门/浮石/地刺底座) */
    solidAt(localRow, localCol) {
      if (this.wallCells && this.wallCells[localRow + ':' + localCol]) return true;
      for (var i = 0; i < this.objects.length; i++) {
        var o = this.objects[i];
        if (o.col !== localCol || o.row !== localRow) continue;
        if (o.type === 'crumble_door' && !o.broken) return true;
        if (o.type === 'blink_platform' && o.state !== 'gone') return true;
        if (o.type === 'spike') return true;          // 底座始终实心
      }
      return false;
    }

    /** 活动层对象行为:弹簧/门/浮石/地刺;伤害交给 session */
    updateActiveObjects(dt, session) {
      var self = this;
      this.objects.forEach(function (o) {
        if (o.type === 'spike') {
          var p = (o.params || {});
          var warn = Number(p.warningSeconds); if (!isFinite(warn)) warn = 0.5;
          var active = Number(p.activeSeconds); if (!isFinite(active)) active = 0.8;
          var cool = Number(p.cooldownSeconds); if (!isFinite(cool)) cool = 1.0;
          var span = warn + active + cool;
          o.cycle = (o.cycle + dt) % Math.max(0.01, span);
          o.state = o.cycle < warn ? 'warning' : (o.cycle < warn + active ? 'active' : 'cooldown');
        }
        if (o.type === 'blink_platform') {
          var bp = (o.params || {});
          var bw = Number(bp.warningSeconds); if (!isFinite(bw)) bw = 0.5;
          var bg = Number(bp.goneSeconds); if (!isFinite(bg)) bg = 1.6;
          if (o.state === 'warning') {
            o.timer -= dt;
            if (o.timer <= 0) { o.state = 'gone'; o.timer = bg; }
          } else if (o.state === 'gone') {
            o.timer -= dt;
            if (o.timer <= 0) {
              // 恢复时不夹人:玩家仍重叠就延后
              if (self.playerOverlap(o, session.player)) o.timer = 0.2;
              else o.state = 'idle';
            }
          }
        }
      });
      // 接触/伤害:同一模拟步最多一次受伤由 session 保证
      var player = session.player;
      // 对象框/路径都在实例局部坐标;Player 是世界坐标,比较前统一到局部
      var px = player.x - this.origin.x;
      var py = player.y - this.origin.y;
      var pfeet = player.feet - this.origin.y;
      this.objects.forEach(function (o) {
        if (!o.alive) return;
        var box = self.objectBox(o);
        var pr = { x: px, y: py, w: player.w, h: player.h };
        var touched = { x: pr.x - 6, y: pr.y - 6, w: pr.w + 12, h: pr.h + 12 };
        var hit = overlap(pr, box);
        var near = overlap(touched, box);
        var feetOnTop = pfeet >= box.y - 8 && pfeet <= box.y + 10 &&
          pr.x + pr.w > box.x && pr.x < box.x + box.w;
        if (o.type === 'spring') {
          if (hit && player.vy >= 0 && pfeet >= box.y - 10) {
            player.vy = (o.params && Number(o.params.bounceVel)) || -1180;
            player.onGround = false;
            session.events.push({ type: 'springBounce', simTime: session.time });
          }
        } else if (o.type === 'crumble_door') {
          if (!o.broken && near) {
            o.broken = true;
            session.events.push({ type: 'doorBroken', simTime: session.time });
          }
        } else if (o.type === 'blink_platform') {
          if (o.state === 'idle' && feetOnTop) {
            o.state = 'warning';
            o.timer = (o.params && Number(o.params.warningSeconds)) || 0.5;
          }
        } else if (o.type === 'spike') {
          if (o.state === 'active' && feetOnTop) session.damage((o.params && o.params.damage) || 20, 'spike');
        } else if (o.type === 'fireball_static') {
          if (hit) session.damage((o.params && o.params.damage) || 20, 'fireball');
        } else if (o.type === 'gear') {
          if (hit) session.damage((o.params && o.params.damage) || 20, 'gear');
        }
      });
    }

    objectBox(o) {
      var r = (o.params && Number(o.params.radiusTiles)) || 0.5;
      return { x: o.rx - r * TS, y: o.ry - r * TS, w: r * 2 * TS, h: r * 2 * TS };
    }

    playerOverlap(o, player) {
      return overlap({
        x: player.x - this.origin.x, y: player.y - this.origin.y,
        w: player.w, h: player.h
      }, this.objectBox(o));
    }
  }

  /** 交给现有 Player 的楼层适配层:世界坐标 ↔ 当前层局部坐标 */
  class FloorView {
    constructor(inst) {
      this.inst = inst;
      this.tile = TS;
      this.worldW = Infinity;            // Player 自己不再把 x 夹到单层宽度
      this.spawnCol = inst.cloud && inst.start ? inst.start.col : (inst.spawn ? inst.spawn.col : 0);
      this.spawnRow = inst.cloud && inst.start ? Math.max(0, inst.start.row - 1) : (inst.spawn ? inst.spawn.row : 0);
      this.startX = inst.origin.x + (inst.level.startLocalX !== undefined ? inst.level.startLocalX : inst.spawn.col * TS + 8);
      this.startFeet = inst.origin.y + (inst.level.startLocalFeet !== undefined ? inst.level.startLocalFeet : (inst.spawn.row + 1) * TS);
    }
    _lr(worldRow) { return worldRow - this.inst.originTileY; }
    _lc(worldCol) { return worldCol - this.inst.originTileX; }

    /** Player/落脚容错用世界行列查询;越界按地面边界处理 */
    blockedAt(worldRow, worldCol) {
      var lr = this._lr(worldRow), lc = this._lc(worldCol);
      if (lc < 0 || lc >= this.inst.cols) return lr >= 0 && lr < this.inst.rows;
      if (lr < 0) return false;                   // 地图上方没有地块;顶边由 move 处理
      if (lr >= this.inst.rows) return true;      // 底边:防回落/防掉出世界
      return !!this.inst.level.grid[lr][lc] || !!this.inst.level.oneway[lr][lc] || this.inst.solidAt(lr, lc);
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
        if (!inside || !inst.hasNext || !inst.exitOpen) { ny = 0; nvy = 0; }
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
      var links = [];
      for (var i = 1; i < floors.length; i++) {
        var lower = floors[i - 1], upper = floors[i];
        if (RA.CloudPipe && RA.CloudPipe.isCloud(lower.ports) && RA.CloudPipe.isCloud(upper.ports)) {
          var no = RA.CloudPipe.nextOrigin(lower, upper, origins[i - 1]);
          origins.push(no);
        } else {
          origins.push({
            x: origins[i - 1].x + (lower.ports.exit.col - upper.ports.entry.col) * TS,
            y: origins[i - 1].y - upper.size.rows * TS
          });
        }
      }
      var minX = Math.min.apply(null, origins.map(function (o) { return o.x; }));
      var shift = minX < 0 ? -minX : 0;
      origins.forEach(function (o) { o.x += shift; });
      this.origins = origins;
      for (var k = 1; k < floors.length; k++) {
        var lf = floors[k - 1], uf = floors[k];
        var kind = k === 1 ? 'lobby-direct' : 'stone-pipe';
        var link = (RA.CloudPipe && RA.CloudPipe.isCloud(lf.ports) && RA.CloudPipe.isCloud(uf.ports))
          ? RA.CloudPipe.buildLink(lf, uf, origins[k - 1], kind) : null;
        if (link) { link.lowerIndex = k - 1; link.upperIndex = k; }
        links.push(link);
      }
      this.links = links;

      var self = this;
      this._spawn = function (index, state) {
        var inst = new FloorInstance(floors[index], index, {
          hasNext: index < floors.length - 1
        });
        inst.origin = { x: origins[index].x, y: origins[index].y };
        inst.linkUp = links[index] || null;
        inst.linkDown = links[index - 1] || null;
        inst.wallCells = {};
        if (inst.linkUp && inst.linkUp.kind === 'stone-pipe' && inst.cloud && inst.finish) {
          var set = function (r, c) { inst.wallCells[r + ':' + c] = true; };
          for (var wr = inst.finish.row - 3; wr <= inst.finish.row - 1; wr++) {
            set(wr, inst.finish.col - 1);
            set(wr, inst.finish.col + 2);
          }
        }
        if (inst.cloud && inst.level.startLocalX !== undefined) {
          inst.level.startX = inst.origin.x + inst.level.startLocalX;
          inst.level.startFeet = inst.origin.y + inst.level.startLocalFeet;
        }
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
        active.moveObjects(dt);
      }
      var preview = this.instances.get(this.current + 1);
      if (preview && preview.state === 'preview') {
        preview.previewTime += dt;
        preview.moveObjects(dt);
      }
    }

    /** 脚底越过当前层顶边且身体在开口内 → 提交一次 */
    afterPlayerStep(player, prevFeet) {
      var active = this.currentFloor;
      var next = this.instances.get(this.current + 1);
      if (!active || !next) return null;
      if (active.cloud && active.linkUp) {
        var link = active.linkUp;
        if (!(prevFeet >= link.commitY && player.feet < link.commitY)) return null;
        if (player.x < link.openingLeft - 0.01 || player.x + player.w > link.openingRight + 0.01) return null;
        return this.commitNext();
      }
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
