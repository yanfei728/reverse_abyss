/* -*- coding: utf-8 -*- */
/*
 * player-art.js —— 40:方块冒险者图集接入
 * =====================================
 * 1536×1024、3×2 格,每格 512×512;固定 sourceRect(96,64,320,440)
 * 裁成 45×54 透明帧,脚底锚点 53。原图不重生成,缺图走 45×54 兜底。
 *
 * 只提供“素材名 → 45×54 canvas”的静态分帧;物理碰撞 20×36、翻转、
 * 二段跳、正式/Trial/小屋共用 Player.draw 全部保持。
 */
(function (RA) {
  'use strict';
  var FRAME_W = 45, FRAME_H = 54, FEET_ANCHOR = 53;
  var CROP = { w: 320, h: 440 };
  var KEYS = {
    'player/idle': { x: 96, y: 64 },
    'player/run0': { x: 608, y: 64 },
    'player/run1': { x: 1120, y: 64 },
    'player/run2': { x: 96, y: 576 },
    'player/air': { x: 608, y: 576 }
  };
  var cache = Object.create(null);

  /** 真实图集存在时,按固定格内裁剪生成 45×54;否则返回 null 让 Assets 用兜底。 */
  function frame(key, assets) {
    var src = KEYS[key];
    if (!src) return null;
    var atlas = assets && typeof assets.image === 'function' ? assets.image('player/atlas') : null;
    if (!atlas || !(atlas.width > 0)) return null;
    var rec = cache[key];
    if (rec && rec.atlas === atlas) return rec.canvas;
    var cv = RA.makeCanvas(FRAME_W, FRAME_H);
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, src.x, src.y, CROP.w, CROP.h, 0, 0, FRAME_W, FRAME_H);
    cache[key] = { atlas: atlas, canvas: cv };
    return cv;
  }

  /** 缺图兜底:旧程序角色 64×84/脚底80 → 45×54/脚底53,不改变物理。 */
  function normalizeLegacy(img) {
    var cv = RA.makeCanvas(FRAME_W, FRAME_H);
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (!img || !(img.width > 0) || !(img.height > 0)) return cv;
    var scale = FEET_ANCHOR / 80;                 // 旧画布脚底在 80
    var w = img.width * scale;
    var h = img.height * scale;
    ctx.drawImage(img, (FRAME_W - w) / 2, FEET_ANCHOR - h, w, h);
    return cv;
  }

  RA.PlayerArt = {
    frameWidth: FRAME_W,
    frameHeight: FRAME_H,
    feetAnchor: FEET_ANCHOR,
    crop: { w: CROP.w, h: CROP.h },
    keys: KEYS,
    frame: frame,
    normalizeLegacy: normalizeLegacy
  };
})(globalThis.RA = globalThis.RA || {});
