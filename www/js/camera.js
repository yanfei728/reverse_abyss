/* -*- coding: utf-8 -*- */
/*
 * camera.js —— 双轴镜头
 * ======================
 * 世界可以比屏幕大得多,镜头负责决定"现在看世界里的哪一块"。
 * 这一份和 abyss/game/camera.py 的策略完全一样,只在两处做了适配:
 *
 *   水平:一直跟着角色,到世界边缘就夹住。**世界比屏幕窄时改成居中** ——
 *         爬塔的楼层是竖井(比屏幕窄),居中了才好看。
 *   垂直:故意做得"安静" ——
 *         · 站在地上时,平滑地把角色摆到屏幕中间;
 *         · **跳在空中时镜头不动**,所以原地起跳画面不会上下抖;
 *         · 只有角色快贴到屏幕上下边(比如长距离上升 / 坠落)才强制跟上。
 *
 * panX / panY 是"额外偏移量":爬升过渡动画里把整层楼往下推就是用它们
 * (见 game.js 的 drawClimb),平时永远是 0。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  class Camera {
    constructor(level, viewW, viewH) {
      this.level = level;
      this.vw = viewW || C.WIDTH;
      this.vh = viewH || C.HEIGHT;
      this.x = 0;
      this.y = 0;
      this.panX = 0;
      this.panY = 0;
    }

    // ---------- 世界边界 ----------
    /** 某一轴上这个坐标该待的位置:世界比屏幕小就居中(可能为负) */
    _axis(v, world, view) {
      if (world <= view) return (world - view) / 2;
      return RA.clamp(v, 0, world - view);
    }

    _clamp() {
      this.x = this._axis(this.x, this.level.worldW, this.vw);
      this.y = this._axis(this.y, this.level.worldH, this.vh);
    }

    // ---------- 跟谁 ----------
    /** 瞬间贴到目标身上(切楼层 / 重生的那一帧用,避免画面拖一下) */
    snapTo(ent) {
      this.x = ent.x + ent.w / 2 - this.vw / 2;
      this.y = ent.y + ent.h / 2 - this.vh / 2;
      this._clamp();
    }

    update(dt, ent) {
      // --- 水平:一直跟 ---
      this.x = ent.x + ent.w / 2 - this.vw / 2;

      // --- 垂直:落地才归位,空中只在快出屏时跟 ---
      var cy = ent.y + ent.h / 2;               // 角色中心的世界 y
      var sy = cy - this.y;                     // 角色中心在屏幕上的 y
      var target = null;
      var factor = C.CAM_FOLLOW_LERP;
      if (ent.onGround) {
        target = cy - this.vh / 2;
      } else if (sy < C.CAM_MARGIN_TOP) {
        target = cy - C.CAM_MARGIN_TOP;
        factor = C.CAM_FAST_LERP;
      } else if (sy > this.vh - C.CAM_MARGIN_BOTTOM) {
        target = cy - (this.vh - C.CAM_MARGIN_BOTTOM);
        factor = C.CAM_FAST_LERP;
      }
      if (target !== null) {
        target = this._axis(target, this.level.worldH, this.vh);
        this.y += (target - this.y) * Math.min(1, factor * dt);
      }
      this._clamp();
    }

    // ---------- 取整后的偏移量(给绘制用) ----------
    get ox() { return Math.round(this.x + this.panX); }
    get oy() { return Math.round(this.y + this.panY); }

    /** 世界坐标大概在不在画面里(用来做简单剔除) */
    onScreen(wx, wy, margin) {
      margin = margin === undefined ? 80 : margin;
      var sx = wx - this.x, sy = wy - this.y;
      return sx > -margin && sx < this.vw + margin && sy > -margin && sy < this.vh + margin;
    }
  }

  RA.Camera = Camera;

  /*
   * 32:游玩镜头缩放的共用小工具(正式 js/short.js 与独立试玩 js/trial.js 都用这一份)。
   *
   *   zoom   = C.VIEW.zoom(默认 2/3)
   *   可见世界宽 = CSS 宽 / zoom;可见世界高 = CSS 高 / zoom
   *   屏幕坐标 = (世界坐标 - 相机世界坐标) * zoom
   *
   * 约定:
   *   · 只缩"世界"绘制;HTML 的 HUD/按钮/暂停层保持 CSS 尺寸;
   *   · DPR 仍只处理画布像素密度,不能在这里乘第二遍;
   *   · 相机/裁剪/居中跟随全部用世界可见宽高,不能用 CSS 宽高;
   *   · 坐标判伤、玩家物理、技能半径、索敌 10 格仍是原世界单位。
   * 历史 Camera 类仍保持原样(旧页面/历史测试在用),不强行改成缩放版。
   */
  /**
   * 36:两档视野。wide=当前 zoom 2/3(默认),classic=旧 zoom 1。
   * 只影响世界绘制与相机可见范围;HTML HUD/按钮、DPR、物理/索敌/地图尺寸都不变。
   * 页面从游玩偏好读出档位后调用 setMode;核心不读 DOM/storage。
   */
  var VIEW_MODES = ['wide', 'classic'];
  function viewZoomOf(mode) {
    var v = (RA.C && RA.C.VIEW) || {};
    if (mode === 'classic') {
      var c = v.classicZoom;
      return (typeof c === 'number' && isFinite(c) && c > 0) ? c : 1;
    }
    var z = v.wideZoom;
    if (!(typeof z === 'number' && isFinite(z) && z > 0)) z = v.zoom;
    return (typeof z === 'number' && isFinite(z) && z > 0) ? z : 1;
  }
  var currentMode = (function () {
    var d = RA.C && RA.C.VIEW && RA.C.VIEW.defaultMode;
    return VIEW_MODES.indexOf(d) >= 0 ? d : 'wide';
  })();
  function viewZoom() { return viewZoomOf(currentMode); }
  RA.ViewZoom = {
    MODES: VIEW_MODES.slice(),
    mode: function () { return currentMode; },
    /** 只接受两档;返回是否真的改了(非法值不改) */
    setMode: function (m) {
      if (VIEW_MODES.indexOf(m) < 0) return false;
      if (currentMode === m) return true;
      currentMode = m;
      return true;
    },
    zoom: viewZoom,
    /** CSS 可见尺寸 → 世界可见尺寸 */
    worldW: function (cssW) { return Math.max(1, cssW) / viewZoom(); },
    worldH: function (cssH) { return Math.max(1, cssH) / viewZoom(); },
    /** 相机世界坐标:让世界点 (wx, wy) 落在可见区域中心 */
    camFor: function (wx, wy, cssW, cssH) {
      return {
        x: wx - RA.ViewZoom.worldW(cssW) / 2,
        y: wy - RA.ViewZoom.worldH(cssH) / 2
      };
    },
    /** 把绘制缩放到 zoom;调用方负责 save/restore(DPR 变换之前已由页面设好) */
    apply: function (ctx) {
      var z = viewZoom();
      if (z !== 1) ctx.scale(z, z);
      return z;
    }
  };
})(globalThis.RA = globalThis.RA || {});
