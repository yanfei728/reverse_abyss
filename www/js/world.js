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

  /** 缺省才取默认;显式 0 有效(N05)。 */
  function paramNumber(o, name, fallback) {
    var p = o && o.params;
    if (!p || !Object.prototype.hasOwnProperty.call(p, name)) return fallback;
    var n = Number(p[name]);
    return isFinite(n) ? n : fallback;
  }
  function objectRadius(o) { return Math.max(0, paramNumber(o, 'radiusTiles', 0.5)); }
  function objectDamage(o) { return Math.max(0, paramNumber(o, 'damage', 20)); }
  function spikeGeom(o) {
    // 与绘制同一组常量:底座 + 只在实际伸出的尖刺区域判定伤害
    var C = RA.C.MONSTER || {};
    var baseH = C.spikeBaseHeight || 12;
    var spikeH = C.spikeHeight || 16;
    var cx = o.col * TS + TS / 2, cy = o.row * TS + TS / 2;
    return {
      base: { x: cx - TS / 2 + 2, y: cy + TS / 2 - baseH, w: TS - 4, h: baseH },
      spike: { x: cx - TS / 2 + 3, y: cy + TS / 2 - baseH - spikeH, w: TS - 6, h: spikeH }
    };
  }
  function flailAnchor(o) {
    return { x: o.col * TS + TS / 2, y: o.row * TS + TS / 2 };
  }
  function flailHead(o) {
    var a = flailAnchor(o);
    var R = (RA.MonsterRules && RA.MonsterRules.flailOrbitPx ? RA.MonsterRules.flailOrbitPx() : 4 * TS);
    var ang = isFinite(o._angle) ? o._angle : Math.PI / 2;
    return { x: a.x + R * Math.cos(ang), y: a.y + R * Math.sin(ang), anchor: a, radius: objectRadius(o) * TS, angle: ang };
  }

  // ===================== 30:金币 / 弓箭手 / 箭矢 =====================
  /** 金币判定半径(格);只被玩家身体拾取,不被光环代捡 */
  function coinRadiusTiles() {
    return (RA.C.COLLECT && RA.C.COLLECT.coinRadiusTiles) || 0.25;
  }
  function coinBox(o) {
    var r = coinRadiusTiles() * TS;
    return { x: o.rx - r, y: o.ry - r, w: r * 2, h: r * 2 };
  }
  function archerConf() { return RA.C.ARCHER || {}; }
  function archerAim(o, player, inst) {
    // 方向只由发射瞬间的玩家位置决定;局部坐标比较,避免非零 origin 混淆
    var px = player.x - inst.origin.x + player.w / 2;
    var py = player.y - inst.origin.y + player.h / 2;
    var dx = px - o.rx, dy = py - o.ry;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 1e-6) || !isFinite(len)) return { x: 1, y: 0 };  // 重合中心:确定兜底,避免 NaN
    return { x: dx / len, y: dy / len };
  }

  /**
   * 箭的所属域(实例局部坐标):左右 = 本图;上 = 本层 finish 顶面;下 = 本层 start 云板底面;
   * 再与实际地图矩形取交集。连接管道不延长箭的飞行区域,固定场景/单图试玩按地图边界。
   */
  function arrowDomainRect(inst) {
    var left = 0, right = inst.cols * TS;
    var top = 0, bottom = inst.rows * TS;
    if (inst.finish) top = Math.max(top, inst.finish.row * TS);
    if (inst.start) bottom = Math.min(bottom, (inst.start.row + 1) * TS);
    if (!(bottom > top + 1e-6)) { top = 0; bottom = inst.rows * TS; }   // 端点异常时不把域压成 0
    return { left: left, right: right, top: top, bottom: bottom };
  }

  /**
   * 把线段裁到矩形内(Liang–Barsky)。返回 {x0,y0,x1,y1,t1} 或 null(完全在外)。
   * t1 < 1 表示这一步越过了所属域边界 —— 只判域内那一段,不能先伤到邻层再销毁。
   */
  function clipSegmentToRect(x0, y0, x1, y1, rect) {
    var dx = x1 - x0, dy = y1 - y0;
    var t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy];
    var q = [x0 - rect.left, rect.right - x0, y0 - rect.top, rect.bottom - y0];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
      } else {
        var r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) return null;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return null;
          if (r < t1) t1 = r;
        }
      }
    }
    return {
      x0: x0 + dx * t0, y0: y0 + dy * t0,
      x1: x0 + dx * t1, y1: y0 + dy * t1,
      t0: t0, t1: t1
    };
  }

  /** 线段与轴对齐矩形的交点(含端点相交),用于连续命中判定 */
  function segmentHitsRect(seg, box) {
    if (!seg || !box) return false;
    // 线段两端都在盒内
    if (seg.x0 >= box.x && seg.x0 <= box.x + box.w && seg.y0 >= box.y && seg.y0 <= box.y + box.h) return true;
    if (seg.x1 >= box.x && seg.x1 <= box.x + box.w && seg.y1 >= box.y && seg.y1 <= box.y + box.h) return true;
    // 逐边求交
    var dx = seg.x1 - seg.x0, dy = seg.y1 - seg.y0;
    var edges = [
      { x: box.x, y: box.y, w: box.w, h: 0 },
      { x: box.x, y: box.y + box.h, w: box.w, h: 0 },
      { x: box.x, y: box.y, w: 0, h: box.h },
      { x: box.x + box.w, y: box.y, w: 0, h: box.h }
    ];
    for (var i = 0; i < edges.length; i++) {
      var hit = segmentIntersects(seg, edges[i]);
      if (hit) return true;
    }
    // 完全在盒内的情况已在两端点判断;退化线段(零长度)也已被端点判断覆盖
    return false;
  }
  function segmentIntersects(seg, edge) {
    var ex = edge.x, ey = edge.y;
    var ex2 = edge.w ? edge.x + edge.w : edge.x, ey2 = edge.h ? edge.y + edge.h : edge.y;
    var d1 = cross(seg.x0, seg.y0, seg.x1, seg.y1, ex, ey);
    var d2 = cross(seg.x0, seg.y0, seg.x1, seg.y1, ex2, ey2);
    var d3 = cross(ex, ey, ex2, ey2, seg.x0, seg.y0);
    var d4 = cross(ex, ey, ex2, ey2, seg.x1, seg.y1);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    if (Math.abs(d1) < 1e-9 && onSegment(ex, ey, ex2, ey2, seg.x0, seg.y0)) return true;
    if (Math.abs(d2) < 1e-9 && onSegment(ex, ey, ex2, ey2, seg.x1, seg.y1)) return true;
    if (Math.abs(d3) < 1e-9 && onSegment(seg.x0, seg.y0, seg.x1, seg.y1, ex, ey)) return true;
    if (Math.abs(d4) < 1e-9 && onSegment(seg.x0, seg.y0, seg.x1, seg.y1, ex2, ey2)) return true;
    return false;
  }
  function cross(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }
  function onSegment(ax, ay, bx, by, px, py) {
    return px >= Math.min(ax, bx) - 1e-9 && px <= Math.max(ax, bx) + 1e-9 &&
      py >= Math.min(ay, by) - 1e-9 && py <= Math.max(ay, by) + 1e-9;
  }

  /** 箭的绘制:细长占位图,朝向与实际速度一致(短塔与单图试玩共用) */
  function drawFloorArrows(ctx, inst, cam) {
    if (!inst || !inst.arrows || !inst.arrows.length) return;
    var conf = archerConf();
    var len = conf.arrowLengthPx || 18;
    inst.arrows.forEach(function (a) {
      if (!a || a.alive === false) return;
      var sx = inst.origin.x + a.x - cam.x;
      var sy = inst.origin.y + a.y - cam.y;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.atan2(a.vy, a.vx));
      ctx.strokeStyle = '#ffe6a3';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(-2, 0); ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-6, -4); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }

  /** 单层运行时:模板只读,运动状态放在实例副本里 */
  /**
   * 场景对象绘制(短塔与单图试玩共用同一份):位置用实例局部坐标 rx/ry + 实例原点,
   * 再减相机。未存活/已消失的对象不能继续画成活物(光环清掉的火球、碎掉的门等)。
   */
  function drawFloorObject(ctx, inst, o, cam) {
    var x = o.rx !== undefined ? o.rx : o.col * TS + TS / 2;
    var y = o.ry !== undefined ? o.ry : o.row * TS + TS / 2;
    var sx = inst.origin.x + x - cam.x;
    var sy = inst.origin.y + y - cam.y;
    if (o.type === 'coin') {
      // 已被玩家拾取的金币不再画成活物;金币只被身体拾取,光环不代捡
      if (o.collected || o.alive === false) return;
      var cr = coinRadiusTiles() * TS;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(sx, sy, cr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, cr * 0.5, 0, Math.PI * 2); ctx.stroke();
    } else if (o.type === 'archer') {
      if (!o.alive) return;
      // 本体:静止的人形占位;弓与瞄准方向随当前玩家位置(发射方向在发射瞬间另存)
      var bodyR = Math.max(6, TS * 0.3);
      ctx.fillStyle = '#8ef0c0';
      ctx.beginPath(); ctx.arc(sx, sy, bodyR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1f7a5a'; ctx.lineWidth = 2; ctx.stroke();
      var f = o._facing || { x: 1, y: 0 };
      var fl = Math.sqrt(f.x * f.x + f.y * f.y) || 1;
      var ux = f.x / fl, uy = f.y / fl;
      ctx.strokeStyle = '#f4f7ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ux * TS * 0.7, sy + uy * TS * 0.7); ctx.stroke();
      ctx.fillStyle = '#c9f7e4';
      ctx.beginPath();
      ctx.moveTo(sx + ux * TS * 0.85, sy + uy * TS * 0.85);
      ctx.lineTo(sx + ux * TS * 0.55 - uy * 5, sy + uy * TS * 0.55 + ux * 5);
      ctx.lineTo(sx + ux * TS * 0.55 + uy * 5, sy + uy * TS * 0.55 - ux * 5);
      ctx.closePath(); ctx.fill();
      // 瞄准辅助虚线(短,只表示朝向)
      ctx.save();
      if (ctx.setLineDash) ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(201,247,228,.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ux * TS * 1.4, sy + uy * TS * 1.4); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.restore();
    } else if (o.type === 'fireball_static' || o.type === 'fireball_moving') {
      if (!o.alive) return;
      ctx.fillStyle = o.type === 'fireball_moving' ? '#ff5e3a' : '#ff7043';
      ctx.beginPath(); ctx.arc(sx, sy, objectRadius(o) * TS, 0, Math.PI * 2); ctx.fill();
      if (o.type === 'fireball_moving') {
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke();
      }
    } else if (o.type === 'soul') {
      if (!o.alive) return;
      var srad = objectRadius(o) * TS;
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath(); ctx.arc(sx, sy, srad, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, srad * 0.55, 0, Math.PI * 2); ctx.stroke();
      var sdir = (o._soul && o._soul.dir) || 0;
      var sdv = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][sdir] || { x: 0, y: -1 };
      ctx.strokeStyle = '#d8f1ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sdv.x * srad * 0.8, sy + sdv.y * srad * 0.8); ctx.stroke();
    } else if (o.type === 'sewage_pool') {
      // 单格池画在怪物下方(short/trial 会先画池);半透明保留底层地形轮廓
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#4f8f45';
      ctx.fillRect(sx - TS / 2 + 1, sy - TS / 2 + 1, TS - 2, TS - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#9dd47a'; ctx.lineWidth = 2;
      ctx.strokeRect(sx - TS / 2 + 1, sy - TS / 2 + 1, TS - 2, TS - 2);
    } else if (o.type === 'gear') {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(sx, sy, objectRadius(o) * TS, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b4f00'; ctx.lineWidth = 2; ctx.stroke();
    } else if (o.type === 'flail') {
      if (!o.alive) return;
      var f = flailHead(o);
      var ax = inst.origin.x + f.anchor.x - cam.x;
      var ay = inst.origin.y + f.anchor.y - cam.y;
      var hx = inst.origin.x + f.x - cam.x;
      var hy = inst.origin.y + f.y - cam.y;
      // 端点
      ctx.fillStyle = '#c7d2fe';
      ctx.beginPath(); ctx.arc(ax, ay, Math.max(3, TS * 0.12), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 2; ctx.stroke();
      // 锁链(端点到当前锤头;无伤害)
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = Math.max(2, TS * 0.06);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke();
      // 锤头
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.arc(hx, hy, f.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 2; ctx.stroke();
    } else if (o.type === 'spring') {
      ctx.fillStyle = '#7ee0a8';
      ctx.fillRect(sx - TS / 2 + 4, sy + TS / 2 - 10, TS - 8, 8);
    } else if (o.type === 'spike') {
      var sg = spikeGeom(o);
      ctx.fillStyle = '#9aa8c7';
      ctx.fillRect(inst.origin.x + sg.base.x - cam.x, inst.origin.y + sg.base.y - cam.y, sg.base.w, sg.base.h);
      if (o.state === 'active') {
        ctx.fillStyle = '#ff8a65';
        var bx = inst.origin.x + sg.base.x - cam.x;
        var by = inst.origin.y + sg.base.y - cam.y;
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(bx + 2 + i * 12, by);
          ctx.lineTo(bx + 8 + i * 12, by - sg.spike.h);
          ctx.lineTo(bx + 14 + i * 12, by);
          ctx.fill();
        }
      }
    } else if (o.type === 'crumble_door') {
      if (o.broken) return;
      ctx.fillStyle = '#9c7bd8';
      ctx.fillRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4);
    } else if (o.type === 'blink_platform') {
      if (o.state === 'gone') return;
      ctx.fillStyle = o.state === 'warning' ? '#ffd166' : '#7fb3ff';
      ctx.fillRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4);
    }
  }

  function drawObjectTrack(ctx, inst, o, cam) {
    // 只给齿轮画实存实例的轨道;移动火球正式/试玩不画路径;流星锤画链不画整圈。
    if (!o || o.type !== 'gear' || !o.pathId) return;
    var path = inst.paths[o.pathId];
    var geo = RA.PathGeometry && RA.PathGeometry.compile(path);
    if (!geo || !geo.ok || !geo.value.segments.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,209,102,.55)';
    ctx.lineWidth = Math.max(2, TS * 0.07);
    geo.value.segments.forEach(function (s) {
      var ax = inst.origin.x + (s.a.col + 0.5) * TS - cam.x;
      var ay = inst.origin.y + (s.a.row + 0.5) * TS - cam.y;
      var bx = inst.origin.x + (s.b.col + 0.5) * TS - cam.x;
      var by = inst.origin.y + (s.b.row + 0.5) * TS - cam.y;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    });
    ctx.restore();
  }

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
      this.fixedLobby = !!(data.kind === 'lobby' && !data.ports && data.extensions && data.extensions.fixedScene);
      if (this.cloud) {
        this.start = data.ports.start;
        this.finish = data.ports.finish || null;
        this.entryCol = this.start.col;
        this.exitCol = this.finish ? this.finish.col : this.start.col;
      } else if (this.fixedLobby) {
        this.start = null;
        this.finish = null;
        this.entryCol = 0;
        this.exitCol = 0;
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
        if (rec.type === 'flail') {
          rec._angle = (RA.MonsterRules && RA.MonsterRules.RULES.flailInitialAngle) || Math.PI / 2;
          var fh = flailHead(rec);
          rec.rx = fh.x; rec.ry = fh.y;
        } else if (rec.pathId) {
          var first = null;
          (data.paths || []).forEach(function (p) {
            if (p.id === rec.pathId && p.points && p.points.length) first = p.points[0];
          });
          if (first) { rec.rx = first.col * TS + TS / 2; rec.ry = first.row * TS + TS / 2; }
        }
        return rec;
      });
      this.paths = {};
      (data.paths || []).forEach(function (p) { this.paths[p.id] = p; }, this);

      var level = RA.Level.fromData({
        id: data.id + '_runtime',
        asc: tilesToAsc(data.terrain.tiles),
        size: { cols: this.cols, rows: this.rows }
      }, { id: data.id + '_runtime' });
      var inst = this;
      // 静态碰撞的邻层部分:按世界坐标向 World 查询“已实存实例 + 已实存石管”的几何。
      // 保留类型:solidTileAt 返回实心,onewayTileAt 单独返回单向云板。
      level.extraSolidAt = function (r, c) {
        if (!inst.world) return false;
        return !!inst.world.staticAtWorld(inst.origin.x + c * TS + TS / 2,
          inst.origin.y + r * TS + TS / 2, inst).solid;
      };
      level.extraOnewayAt = function (r, c) {
        if (!inst.world) return false;
        return !!inst.world.staticAtWorld(inst.origin.x + c * TS + TS / 2,
          inst.origin.y + r * TS + TS / 2, inst).oneWay;
      };
      var pose = RA.CloudPipe ? RA.CloudPipe.startPose(data, { w: 20, h: 36 }) : null;
      if (pose) {
        level.startX = this.origin.x + pose.x;
        level.startFeet = this.origin.y + pose.feet;
        level.startLocalX = pose.x;
        level.startLocalFeet = pose.feet;
        level.spawnCol = pose.col !== undefined ? pose.col : (this.start ? this.start.col : 0);
        level.spawnRow = pose.row !== undefined ? Math.max(0, pose.row - 1) : 0;
      } else {
        level.startX = this.spawn.col * TS + 8;
        level.startFeet = (this.spawn.row + 1) * TS;
        level.spawnCol = this.spawn.col;
        level.spawnRow = this.spawn.row;
      }
      var self = this;
      level.solidEntityAt = function (r, c) { return self.solidAt(r, c); };
      this.level = level;
      this.blockRevision = 0;
      this.blockGeometry = RA.BlockGeometry ? RA.BlockGeometry.create({
        cols: this.cols, rows: this.rows,
        revision: function () { return self.blockRevision; },
        isBlock: function (r, c) { return self.isBlockForSoul(r, c); }
      }) : null;
      this.initSouls();
      // 30:箭只属于本实例;运行状态不回模板。离开本层/死亡/重试时整体清理。
      this.arrows = [];
      this.arrowSeq = 0;
      this.arrowDomain = arrowDomainRect(this);
      this.view = new FloorView(this);
    }

    /** 灵魂的“真实方块”来源:本层 terrain/云板、当前门浮石弹簧、实存管壁;不含怪物/轨道/池。 */
    isBlockForSoul(r, c) {
      if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return false;
      var lv = this.level;
      if (lv && ((lv.grid && lv.grid[r][c]) || (lv.oneway && lv.oneway[r][c]))) return true;
      if (this.wallCells && this.wallCells[r + ':' + c]) return true;
      for (var i = 0; i < this.objects.length; i++) {
        var o = this.objects[i];
        if (o.col !== c || o.row !== r) continue;
        if (o.type === 'crumble_door' && !o.broken) return true;
        if (o.type === 'blink_platform' && o.state !== 'gone') return true;
        if (o.type === 'spring') return true;
      }
      return false;
    }

    initSouls() {
      if (!this.blockGeometry || !RA.SoulMotion) return;
      this.objects.forEach(function (o) {
        if (o.type !== 'soul') return;
        var dir = Number(o.params && o.params.initialDirection);
        if (!isFinite(dir) || Math.floor(dir) !== dir || dir < 0 || dir > 3) dir = 0;
        var cx = o.col * TS + TS / 2, cy = o.row * TS + TS / 2;
        var r = objectRadius(o);
        var st = RA.SoulMotion.attach(this.blockGeometry, cx, cy, dir, r);
        if (st) {
          o._soul = st; o.rx = st.rx; o.ry = st.ry;
        } else {
          // 修改/删掉邻块后无初始贴附边:保留作者方向,从格中心直飞搜寻
          o._soul = { attached: false, rx: cx, ry: cy, dir: dir, radiusTiles: r, loop: null, s: 0, reverse: false };
          o.rx = cx; o.ry = cy;
        }
      }, this);
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

    /** 路径几何:与编辑器/裁剪/校验共享 PathGeometry;旧非法路径只作保真回退 */
    pathSegments(path) {
      var pts = (path && path.points) || [];
      if (!pts.length) return null;
      var c = RA.PathGeometry && RA.PathGeometry.compile(path);
      if (c && c.ok) {
        var segs = c.value.segments.map(function (s) {
          return { a: s.a, b: s.b, len: s.lenTiles * TS };
        });
        return { segs: segs, total: c.value.totalTiles * TS || 0.001 };
      }
      if (pts.length < 2) return null;
      var old = [];
      for (var i = 1; i < pts.length; i++) old.push([pts[i - 1], pts[i]]);
      if (path.mode === 'loop' && pts.length >= 2) old.push([pts[pts.length - 1], pts[0]]);
      var total = 0;
      old = old.map(function (s) {
        var dx = (s[1].col - s[0].col) * TS, dy = (s[1].row - s[0].row) * TS;
        var len = Math.sqrt(dx * dx + dy * dy) || 0.001; total += len;
        return { a: s[0], b: s[1], len: len };
      });
      return { segs: old, total: total };
    }

    /** 路径对象运动;preview 只动不打人 */
    moveObjects(dt) {
      this.objects.forEach(function (o) {
        if (o.type === 'soul' && o.alive) {
          if (!o._soul) {
            var sd = Number(o.params && o.params.initialDirection);
            if (!isFinite(sd) || Math.floor(sd) !== sd || sd < 0 || sd > 3) sd = 0;
            var sr = objectRadius(o);
            var sst = RA.SoulMotion && RA.SoulMotion.attach(this.blockGeometry,
              o.rx, o.ry, sd, sr);
            o._soul = sst || { attached: false, rx: o.rx, ry: o.ry, dir: sd, radiusTiles: sr, loop: null, s: 0, reverse: false };
          }
          var speedSoul = RA.MonsterRules && RA.MonsterRules.speedPx ? RA.MonsterRules.speedPx('soul') : 170;
          var outSoul = RA.SoulMotion.step(o._soul, dt, this.blockGeometry, speedSoul);
          if (outSoul) o._soul = outSoul;
          o.rx = o._soul.rx; o.ry = o._soul.ry;
          return;
        }
        if (o.type === 'flail' && o.alive) {
          var mr = RA.MonsterRules;
          var omega = mr && mr.flailOmega ? mr.flailOmega() : (2 * (RA.C.MAX_VX || 340) / 3) / (4 * TS);
          o._angle = (isFinite(o._angle) ? o._angle : Math.PI / 2) + omega * dt;
          var fh = flailHead(o);
          o.rx = fh.x; o.ry = fh.y;
          return;
        }
        if (!o.pathId || !this.paths[o.pathId]) return;
        var geo = this.pathSegments(this.paths[o.pathId]);
        if (!geo) return;
        if (!geo.segs.length) { var pt0 = (this.paths[o.pathId].points || [])[0]; if (pt0) { o.rx = pt0.col * TS + TS / 2; o.ry = pt0.row * TS + TS / 2; } return; }
        // 27:齿轮固定 V,移动火球固定 V/2;旧 speedTilesPerSecond 只保真,不覆盖运行速度
        var speed = RA.MonsterRules && RA.MonsterRules.speedPx
          ? RA.MonsterRules.speedPx(o.type)
          : (o.type === 'fireball_moving' ? (RA.C.MAX_VX || 340) / 2 : (RA.C.MAX_VX || 340));
        if (!(speed > 0)) speed = 90;
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

    /** 其他已实存楼层/已实存石管的静态地形,以当前层局部格推导世界像素 */
    otherStaticAt(localRow, localCol) {
      if (!this.world) return false;
      var wx = this.origin.x + localCol * TS + TS / 2;
      var wy = this.origin.y + localRow * TS + TS / 2;
      return !!this.world.staticAtWorld(wx, wy, this).solid;
    }

    /** 对象/派生墙是否提供实心碰撞(门/浮石/地刺底座) */
    solidAt(localRow, localCol) {
      if (this.wallCells && this.wallCells[localRow + ':' + localCol]) return true;
      var wx = this.origin.x + localCol * TS + TS / 2;
      var wy = this.origin.y + localRow * TS + TS / 2;
      if (this.world && this.world.wallAtWorld(wx, wy)) return true;
      if (this.otherStaticAt(localRow, localCol)) return true;
      for (var i = 0; i < this.objects.length; i++) {
        var o = this.objects[i];
        if (o.col !== localCol || o.row !== localRow) continue;
        if (o.type === 'crumble_door' && !o.broken) return true;
        if (o.type === 'blink_platform' && o.state !== 'gone') return true;
      }
      return false;
    }

    /** 活动层对象行为:弹簧/门/浮石/地刺;伤害交给 session */
    updateActiveObjects(dt, session) {
      var self = this;
      var geomChanged = false;
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
            if (o.timer <= 0) { o.state = 'gone'; o.timer = bg; geomChanged = true; }
          } else if (o.state === 'gone') {
            o.timer -= dt;
            if (o.timer <= 0) {
              // 恢复时不夹人:玩家仍重叠就延后
              if (self.playerOverlap(o, session.player)) o.timer = 0.2;
              else { o.state = 'idle'; geomChanged = true; }
            }
          }
        }
      });
      if (geomChanged) this.blockRevision++;
      // 30:金币拾取、弓箭手计时/发射、箭推进(只在这里 = 只有 active 层)
      this.updateAmmoAndPickups(dt, session);
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
            self.blockRevision++;
            session.events.push({ type: 'doorBroken', simTime: session.time });
          }
        } else if (o.type === 'blink_platform') {
          if (o.state === 'idle' && feetOnTop) {
            o.state = 'warning';
            o.timer = (o.params && Number(o.params.warningSeconds)) || 0.5;
          }
        } else if (o.type === 'spike') {
          if (o.state === 'active') {
            var sg = spikeGeom(o);
            if (overlap(pr, sg.spike)) session.damage(objectDamage(o), 'spike');
          }
        } else if (o.type === 'fireball_static' || o.type === 'fireball_moving' || o.type === 'soul') {
          if (hit) session.damage(objectDamage(o), o.type === 'soul' ? 'soul' :
            (o.type === 'fireball_moving' ? 'fireball-moving' : 'fireball'));
        } else if (o.type === 'gear') {
          if (hit) session.damage(objectDamage(o), 'gear');
        } else if (o.type === 'flail') {
          // 只有锤头伤害;端点/锁链不参与
          if (hit) session.damage(objectDamage(o), 'flail');
        } else if (o.type === 'archer') {
          // 本体接触 20;箭命中在 updateAmmoAndPickups 里单独结算
          if (hit) session.damage((RA.C.ARCHER && RA.C.ARCHER.contactDamage) || 20, 'archer');
        } else if (o.type === 'sewage_pool') {
          if (overlap(pr, { x: o.col * TS, y: o.row * TS, w: TS, h: TS })) {
            session.damage((RA.C.MONSTER && RA.C.MONSTER.sewageDamage) || 20, 'sewage');
          }
        }
      });
    }

    objectBox(o) {
      var r = objectRadius(o);
      return { x: o.rx - r * TS, y: o.ry - r * TS, w: r * 2 * TS, h: r * 2 * TS };
    }

    /**
     * 30:金币拾取 + 弓箭手计时/发射 + 箭推进。
     * 只在 active 层的 updateActiveObjects 里调用:preview 不累计射击时间/不射/不伤害。
     * 所有比较先统一到实例局部坐标;Player 是世界坐标,只能经 origin 转换。
     */
    updateAmmoAndPickups(dt, session) {
      var player = session && session.player;
      if (!player) return;
      var px = player.x - this.origin.x;
      var py = player.y - this.origin.y;
      var pr = { x: px, y: py, w: player.w, h: player.h };
      var conf = archerConf();
      var interval = conf.fireIntervalSeconds || 2;
      var speed = conf.arrowSpeedPx || 170;
      var domain = this.arrowDomain || (this.arrowDomain = arrowDomainRect(this));
      var self = this;

      this.objects.forEach(function (o) {
        if (o.type === 'coin') {
          if (o.collected) return;
          if (!overlap(pr, coinBox(o))) return;
          o.collected = true;
          // 计分只由正式 GameSession 的 onCoinCollected 负责;试玩没有这个回调
          if (typeof session.onCoinCollected === 'function') session.onCoinCollected(o);
          return;
        }
        if (o.type !== 'archer' || !o.alive) return;
        // 瞄准只用于显示;发射方向在发射瞬间按玩家位置另取
        o._facing = archerAim(o, player, self);
        o.shotElapsed = (isFinite(o.shotElapsed) ? o.shotElapsed : 0) + dt;
        if (o.shotElapsed < interval) return;
        o.shotElapsed -= interval;
        if (o.shotElapsed < 0) o.shotElapsed = 0;     // 不补发一串
        self.arrowSeq = (self.arrowSeq || 0) + 1;
        var aim = archerAim(o, player, self);
        self.arrows.push({
          id: self.instanceId + ':arrow_' + self.arrowSeq,
          ownerInstanceId: self.instanceId,
          sourceObjectId: o.id,
          x: o.rx, y: o.ry, prevX: o.rx, prevY: o.ry,
          vx: aim.x, vy: aim.y, alive: true, age: 0
        });
      });

      // 箭:先裁到所属层域,再判这一段与玩家身体的连续命中
      var hitR = conf.arrowHitRadiusPx || 3;
      var dmg = conf.arrowDamage || 20;
      var pb = { x: pr.x - hitR, y: pr.y - hitR, w: pr.w + hitR * 2, h: pr.h + hitR * 2 };
      var keep = [];
      this.arrows.forEach(function (a) {
        if (!a || a.alive === false) return;
        a.age = (a.age || 0) + dt;
        a.prevX = a.x; a.prevY = a.y;
        var nx = a.x + a.vx * speed * dt;
        var ny = a.y + a.vy * speed * dt;
        var seg = clipSegmentToRect(a.x, a.y, nx, ny, domain);
        if (!seg) return;                              // 出界/离层:直接消失,不伤害别处
        var trimmed = seg.t1 < 1 - 1e-9;
        if (segmentHitsRect(seg, pb)) {
          session.damage(dmg, 'arrow');                // 命中即消费;玩家无敌时不扣血也消失
          return;
        }
        a.x = nx; a.y = ny;
        if (trimmed || a.age > (conf.arrowMaxAgeSeconds || 30)) return;
        keep.push(a);
      });
      this.arrows = keep;
    }

    /** 清掉本层所有箭与发射计时(离层/死亡/胜利/重试);已发箭不跨层 */
    clearArrows() {
      this.arrows = [];
      this.objects.forEach(function (o) {
        if (o.type === 'archer') o.shotElapsed = 0;
      });
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
      if (lc < 0 || lc >= this.inst.cols) return false;
      if (lr < 0) return this.inst.solidAt(lr, lc);                   // 地图上方没有地块;顶边由 move 处理
      if (lr >= this.inst.rows) return true;      // 底边:防回落/防掉出世界
      return this.inst.level.solidTileAt(lr, lc) ||
        this.inst.level.onewayTileAt(lr, lc) || this.inst.solidAt(lr, lc);
    }

    standingOn(worldX, feet, w) {
      var inst = this.inst;
      var lx = worldX - inst.origin.x;
      var lf = feet - inst.origin.y;
      if (!inst.cloud && !inst.fixedLobby && lf >= inst.rows * TS - 0.6) return true;
      return inst.level.standingOn(lx, lf, w);
    }

    /** 只看本层自己的地形;用于判定是否已站在上层自身上,避免把下层地形误当上层支撑。 */
    standingOnOwn(worldX, feet, w) {
      var inst = this.inst;
      return inst.level.standingOnOwn(worldX - inst.origin.x, feet - inst.origin.y, w);
    }

    move(worldX, worldY, w, h, vx, vy, dt) {
      var inst = this.inst;
      var origin = inst.origin;
      var r = inst.level.move(worldX - origin.x, worldY - origin.y, w, h, vx, vy, dt);
      var nx = r.x, ny = r.y, nvx = r.vx, nvy = r.vy, grounded = r.grounded;

      // 云板场景/固定大厅不使用旧数组边框隐形墙;真实地形/连接墙负责碰撞
      if (!inst.cloud && !inst.fixedLobby) {
        if (nx < 0) { nx = 0; nvx = 0; }
        if (nx > inst.cols * TS - w) { nx = inst.cols * TS - w; nvx = 0; }
        if (ny < 0) {
          var openL = inst.exitCol * TS;
          var openR = openL + OPEN * TS;
          var inside = nx >= openL - 0.01 && nx + w <= openR + 0.01;
          if (!inside || !inst.hasNext || !inst.exitOpen) { ny = 0; nvy = 0; }
        }
        if (ny + h > inst.rows * TS) {
          ny = inst.rows * TS - h;
          nvy = 0;
          grounded = true;
        }
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
      this.runtimeLinks = [];
      this.pendingEntry = null;
      this.events = [];
      this.current = opts.startFloor || 0;
      this.maxLive = 3;

      // 先算所有原点;再整体平移到 x>=0
      var origins = [{ x: 0, y: 0 }];
      var links = [];
      for (var i = 1; i < floors.length; i++) {
        var lower = floors[i - 1], upper = floors[i];
        if (i === 1 && lower.kind === 'lobby' && !lower.ports) {
          origins.push({ x: 0, y: -(45 * TS) }); // TS 对齐;不制造 -2000/TS 的 round 偏差
        } else if (lower.kind === 'boss') {
          // 20→21:两段无管道 F 传送。Boss 没有 finish,不能按连接几何算原点;
          // 21 独立放在上方,留出 4 格空白,避免两层地形相邻产生假碰撞。
          var lo = lower.ports && lower.ports.start ? lower.ports.start.col : 0;
          var uo = upper.ports && upper.ports.start ? upper.ports.start.col : 0;
          origins.push({
            x: origins[i - 1].x + (lo - uo) * TS,
            y: origins[i - 1].y - upper.size.rows * TS - 4 * TS
          });
        } else if (RA.CloudPipe && RA.CloudPipe.isCloud(lower.ports) && RA.CloudPipe.isCloud(upper.ports)) {
          origins.push(RA.CloudPipe.nextOrigin(lower, upper, origins[i - 1]));
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
        var kind = 'stone-pipe';
        var link;
        if (k === 1 && lf.kind === 'lobby' && !lf.ports) {
          link = { kind: 'lobby-transfer', lowerIndex: 0, upperIndex: 1, commitY: null, walls: null };
        } else if (lf.kind === 'boss') {
          // 不按玩家越线自动提交;只由 Session 在 Boss 击败后的一次 F 触发
          link = { kind: 'boss-transfer', lowerIndex: k - 1, upperIndex: k, commitY: null, walls: null };
        } else {
          link = (RA.CloudPipe && RA.CloudPipe.isCloud(lf.ports) && RA.CloudPipe.isCloud(uf.ports))
            ? RA.CloudPipe.buildLink(lf, uf, origins[k - 1], kind) : null;
          if (link) { link.lowerIndex = k - 1; link.upperIndex = k; }
        }
        links.push(link);
      }
      this.links = links;

      var self = this;
      this._spawn = function (index, state) {
        var inst = new FloorInstance(floors[index], index, {
          hasNext: index < floors.length - 1
        });
        inst.origin = { x: origins[index].x, y: origins[index].y };
        inst.world = self;
        inst.linkUp = links[index] || null;
        inst.linkDown = links[index - 1] || null;
        // 唯一实例身份:槽号 + 模板身份;10/30 两个休息、20/40 两个 Boss 都不同
        var contentKey = (floors[index].contentHash || '').replace(/^sha256:/, '').slice(0, 12) || 'nohash';
        inst.instanceId = index + ':' + (floors[index].id || 'level') + ':' + contentKey;
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
      this._refreshRuntimeLinks();
    }

    /**
     * 规划链接只是 manifest 数据。只有石管两端实例都已实存,才生成运行几何;
     * 绘制和碰撞都只读这份 runtimeLinks,避免“画了管但地图没加载”。
     */
    _refreshRuntimeLinks() {
      var out = [];
      // 运行几何:先清空所有派生墙,再只给“两端都实存”的石管重建
      this.instances.forEach(function (inst) {
        inst.wallCells = {};
        inst.blockRevision = (inst.blockRevision || 0) + 1;
      });
      for (var i = 0; i < this.links.length; i++) {
        var link = this.links[i];
        if (!link || link.kind !== 'stone-pipe') continue;
        if (!this.instances.has(i) || !this.instances.has(i + 1)) continue;
        out.push(link);
        var lower = this.instances.get(i);
        if (lower && lower.finish) {
          for (var wr = lower.finish.row - 3; wr <= lower.finish.row - 1; wr++) {
            lower.wallCells[wr + ':' + (lower.finish.col - 1)] = true;
            lower.wallCells[wr + ':' + (lower.finish.col + 2)] = true;
          }
        }
      }
      this.runtimeLinks = out;
    }

    liveStoneLinks() { return this.runtimeLinks; }

    /** 世界坐标是否落在某个“两端都实存”的石管墙内 */
    wallAtWorld(wx, wy) {
      var links = this.runtimeLinks;
      for (var i = 0; i < links.length; i++) {
        var walls = links[i].walls || [];
        for (var j = 0; j < walls.length; j++) {
          var w = walls[j];
          if (wx >= w.x && wx < w.x + w.w && wy >= w.y && wy < w.y + w.h) return true;
        }
      }
      return false;
    }

    /**
     * 已实存实例的静态几何查询(世界坐标):
     * 地形 tile1–4 = solid,tile5 = oneWay,已实存石管墙 = solid。
     * 规划但未加载的连接不在这里产生几何。
     */
    staticAtWorld(wx, wy, exclude) {
      var hit = { solid: false, oneWay: false };
      this.instances.forEach(function (inst) {
        if (inst === exclude || hit.solid) return;
        var lx = wx - inst.origin.x, ly = wy - inst.origin.y;
        if (lx < 0 || ly < 0 || lx >= inst.cols * TS || ly >= inst.rows * TS) return;
        var c = Math.floor(lx / TS), r = Math.floor(ly / TS);
        var tile = inst.data.terrain.tiles[r][c];
        if (tile >= 1 && tile <= 4) hit.solid = true;
        else if (tile === 5) hit.oneWay = true;
      }, this);
      if (this.wallAtWorld(wx, wy)) hit.solid = true;
      return hit;
    }

    clearPendingEntry() { this.pendingEntry = null; }

    /** 30:会话死亡/胜利/重开/回主菜单/退出时释放所有箭与射击计时 */
    clearArrows() {
      this.instances.forEach(function (inst) {
        if (inst && typeof inst.clearArrows === 'function') inst.clearArrows();
      });
    }

    /** 当前 active 层正在飞的箭(只给验收/诊断读) */
    liveArrows() {
      var out = [];
      this.instances.forEach(function (inst, i) {
        if (inst.state === 'active' && inst.arrows) inst.arrows.forEach(function (a) { out.push({ floor: i, arrow: a }); });
      });
      return out;
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
            index: i, instanceId: f.instanceId, kind: f.data.kind || 'normal',
            state: f.state, activeTime: f.activeTime, previewTime: f.previewTime,
            hasNext: f.hasNext
          };
        }, this);
    }

    /** 槽位离开方式:lobby-transfer / pipe / boss-transfer / victory */
    exitActionAt(index) {
      var i = index === undefined ? this.current : index;
      var f = this.floors[i];
      if (!f) return '';
      if (i === 0 && f.kind === 'lobby' && !f.ports) return 'lobby-transfer';
      if (f.kind === 'boss') return (i === this.floors.length - 1) ? 'victory' : 'boss-transfer';
      return 'pipe';
    }

    /**
     * 调试跳层/验收定位:直接激活第 index 槽(含 preview 下一层),不模拟物理通关。
     * 只给显式调试入口/诊断使用;不写认证,不是正式流程。
     */
    activateSlot(index) {
      var i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i >= this.floors.length) {
        return { ok: false, error: { code: 'NO_FLOOR', message: '槽位超出 0–' + (this.floors.length - 1) } };
      }
      this.current = i;
      this.instances.clear();
      this.pendingEntry = null;
      var inst = this._spawn(i, 'active');
      inst.entered = true;
      if (this.floors[i + 1]) this._spawn(i + 1, 'preview');
      this._refreshRuntimeLinks();
      this.transferred = true;
      return { ok: true, value: { floor: i, instanceId: inst.instanceId, kind: inst.data.kind, inst: inst } };
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

    /** 脚底越过当前层顶边且身体在开口内 → 提交一次(临界帧允许一次延后确认) */
    afterPlayerStep(player, prevFeet) {
      var active = this.currentFloor;
      var next = this.instances.get(this.current + 1);
      if (!active || !next) return null;
      // 传送链接(0→1 / 20→21)不按越线自动提交,只能由 Session 的 F 分派触发
      if (active.linkUp && active.linkUp.kind !== 'stone-pipe') return null;
      if (active.cloud && active.linkUp) {
        var link = active.linkUp;
        // 与移动解算相同的有效碰撞体:Level._hitTiles 用 x+w-1 选格,
        // 所以入口判断也用右缘 -1px;0.01 只吸收浮点误差,不是放宽入口。
        var bodyRight = player.x + player.w - 1;
        var inside = player.x >= link.openingLeft - 0.01 &&
          bodyRight <= link.openingRight + 0.01;
        var overlapping = player.x < link.openingRight && bodyRight > link.openingLeft;
        if (this.pendingEntry &&
          (this.current !== this.pendingEntry.lowerIndex || this.pendingEntry.link !== link)) {
          this.pendingEntry = null;
        }
        if (prevFeet >= link.commitY && player.feet < link.commitY) {
          if (inside) return this.commitNext();
          if (overlapping) {
            // 这一帧身体还没完全进入开口:记住合法上穿,等真正进入时提交一次
            this.pendingEntry = {
              lowerIndex: this.current, upperIndex: this.current + 1, link: link,
              since: this.simTime || 0
            };
          }
          return null;
        }
        if (this.pendingEntry && player.feet <= link.commitY + 0.01 && inside) {
          return this.commitNext();
        }
        // 临界帧已越过上层 start 顶面、后来站到上层自身上(即使身体不在开口正中):
        // 也确认一次,避免长期“人在 preview 图、current 仍在下层”。
        if (!inside && player.feet <= link.commitY + 0.01 &&
          next.view.standingOnOwn(player.x, player.feet, player.w)) {
          return this.commitNext();
        }
        if (this.pendingEntry && player.feet > link.commitY + 0.5) this.pendingEntry = null;
        return null;
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
      from.clearArrows();               // 30:离开本层,已发箭与射击计时一起清掉,不跨层
      to.state = 'active';
      to.entered = true;
      to.activeTime = 0;
      this.current = to.index;
      this.pendingEntry = null;

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
      this._refreshRuntimeLinks();

      var ev = { type: 'floorEntered', from: from.index, to: to.index, simTime: this.simTime || 0 };
      this.events.push(ev);
      return ev;
    }

    /** 当前向上的链接是否是显式传送(0→1 大厅 / 20→21 Boss 后) */
    transferKindAt(index) {
      var link = this.links[index === undefined ? this.current : index];
      if (!link) return '';
      return (link.kind === 'lobby-transfer' || link.kind === 'boss-transfer') ? link.kind : '';
    }

    /**
     * 显式传送一次(同一 Player,不重建):0→1 大厅出发、20→21 Boss 后。
     * 只允许当前槽位是有传送动作的链接;不按高度/普通云板自动触发。
     */
    transferNext(player) {
      var from = this.currentFloor;
      var to = this.instances.get(this.current + 1);
      var kind = this.transferKindAt();
      if (!from || !to) return { ok: false, error: { code: 'NO_FLOOR', message: '缺少当前层或目标层' } };
      if (!kind) return { ok: false, error: { code: 'NOT_TRANSFER', message: '当前层没有可用的传送动作' } };
      from.state = 'snapshot';
      from.clearArrows();               // 30:F 传送同样清掉本层箭与射击计时
      to.state = 'active';
      to.entered = true;
      to.activeTime = 0;
      this.current = to.index;
      this.pendingEntry = null;
      if (player) {
        player.level = to.view;
        player.x = to.level.startX;
        player.y = to.level.startFeet - player.h;
        player.vx = 0; player.vy = 0;
        player.onGround = false;
        player.coyote = 0; player.jumpBuffer = 0;
        player.jumpsUsed = 0;
        player.prevJump = false;
      }
      this.transferred = true;
      var nextIndex = this.current + 1;
      if (this.floors[nextIndex] && !this.instances.has(nextIndex)) this._spawn(nextIndex, 'preview');
      var releaseBelow = this.current - 2;
      Array.from(this.instances.keys()).forEach(function (i) {
        if (i <= releaseBelow) this.instances.delete(i);
      }, this);
      this._refreshRuntimeLinks();
      var ev = {
        type: 'floorEntered', from: from.index, to: to.index,
        simTime: this.simTime || 0, transfer: true, transferKind: kind
      };
      this.events.push(ev);
      return { ok: true, value: ev };
    }

    /** 兼容旧入口:仅大厅 F 出发;实现委托给普通 transport。 */
    enterFirstFloor(player) {
      var from = this.currentFloor;
      if (!from || !(from.data.kind === 'lobby' && from.fixedLobby) || this.current !== 0) {
        return { ok: false, error: { code: 'NOT_LOBBY', message: '只能从作者大厅 F 出发' } };
      }
      return this.transferNext(player);
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
  RA.drawFloorObject = drawFloorObject;
  RA.drawFloorArrows = drawFloorArrows;
  RA.drawObjectTrack = drawObjectTrack;
  RA.flailHead = flailHead;
  RA.spikeGeom = spikeGeom;
  RA.arrowDomainRect = arrowDomainRect;
  RA.clipSegmentToRect = clipSegmentToRect;
})(globalThis.RA = globalThis.RA || {});
