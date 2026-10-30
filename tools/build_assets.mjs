#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * build_assets.mjs —— 生成所有"代码画的"贴图文件
 * ================================================
 *     node tools/build_assets.mjs                   生成实体 / 天空 / 界面贴图
 *     node tools/build_assets.mjs --check           只对比磁盘上的图和代码画的一不一样
 *     node tools/build_assets.mjs --restore-tiles   连地块也重画(回到老样式的 45×45)
 *
 * 会生成的目录结构:
 *   assets/entities/ 实体贴图(弹簧板 S / 出口光柱 G / 浮石 y)
 *   assets/sky/     天空背景贴图 sky1~sky8 —— 爬塔时**按层循环**用(见 config.SKY_COUNT)
 *   assets/ui/      界面贴图(开局界面的背景 title.png)
 *
 * **地块贴图(assets/tiles)不在这里生成**:它们现在是 textures/block 那套 16×16
 * 像素画(第七轮换的,对应关系见 js/assets.js 的 FILES 注释),画的时候会缩放到一格。
 * 所以平时跑这个脚本不会动它们 —— 想改地块就直接改那几个 PNG。
 * 加 --restore-tiles 才会把老版本"现画的地块"重新生成到 assets/tiles(45×45),
 * 那是贴图包丢了、或者想回到以前风格时的后路。
 *
 * 为什么不用 canvas:这个脚本要在命令行里跑(CI、改完贴图直接重生成),
 * 所以带了一个很小的软件光栅器 + PNG 编码器,零依赖 —— 只实现画这些贴图
 * 需要的几种图形(矩形/圆角矩形/圆/椭圆/多边形/线段/竖直渐变),
 * 用 2×2 超采样做抗锯齿,最后 zlib 压成 PNG。
 *
 * 想换风格:直接改下面的画法然后重跑;或者把生成出来的 PNG 用画图软件改掉
 * (游戏读的就是这些 PNG,不会覆盖你的修改,除非你再跑一次这个脚本)。
 * 自检里有一条会拿"现在会画出来的内容"和磁盘上的 PNG 逐字节对比,
 * 所以改了代码忘了重跑会被测出来。
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TS = 45;                  // 一格多少像素(和 config.TS 一致)

// ============================================================
// 一、迷你软件画布(2×2 超采样 + alpha 混合)
// ============================================================
class Raster {
  constructor(w, h, ss = 2) {
    this.w = w; this.h = h; this.ss = ss;
    this.W = w * ss; this.H = h * ss;
    this.buf = new Float32Array(this.W * this.H * 4);   // 内部用 0~1 浮点
  }

  /** 源覆叠混合:把颜色 col=[r,g,b(,a 0~255)] 以 alpha 盖到 (x,y) */
  _put(x, y, col, alpha) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const a = (col.length > 3 ? col[3] / 255 : 1) * (alpha === undefined ? 1 : alpha);
    if (a <= 0) return;
    const i = (y * this.W + x) * 4;
    const b = this.buf;
    const da = b[i + 3];
    const outA = a + da * (1 - a);
    if (outA <= 0) return;
    b[i] = (col[0] / 255 * a + b[i] * da * (1 - a)) / outA;
    b[i + 1] = (col[1] / 255 * a + b[i + 1] * da * (1 - a)) / outA;
    b[i + 2] = (col[2] / 255 * a + b[i + 2] * da * (1 - a)) / outA;
    b[i + 3] = outA;
  }

  /** 铺一层底色(会盖掉原来的内容) */
  clear(col) {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = (y * this.W + x) * 4;
        this.buf[i] = col[0] / 255;
        this.buf[i + 1] = col[1] / 255;
        this.buf[i + 2] = col[2] / 255;
        this.buf[i + 3] = col.length > 3 ? col[3] / 255 : 1;
      }
    }
  }

  /**
   * 逐像素跑一个"在不在形状里"的判断。
   * bbox = [x0,y0,x1,y1](逻辑坐标)只扫这一块 —— 小图形快非常多,
   * 天空那种一张图里有几十个 ellipses 的,不加包围盒会慢十倍。
   */
  _fill(sdf, col, bbox) {
    const ss = this.ss;
    let x0 = 0, y0 = 0, x1 = this.W, y1 = this.H;
    if (bbox) {
      x0 = Math.max(0, Math.floor(bbox[0] * ss));
      y0 = Math.max(0, Math.floor(bbox[1] * ss));
      x1 = Math.min(this.W, Math.ceil(bbox[2] * ss));
      y1 = Math.min(this.H, Math.ceil(bbox[3] * ss));
    }
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        // 取像素中心
        if (sdf((x + 0.5) / ss, (y + 0.5) / ss) <= 0) this._put(x, y, col);
      }
    }
  }

  /** 圆角矩形(半径 r,不给就是直角) */
  fillRect(x, y, w, h, col, r) {
    r = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    const cx = x + w / 2, cy = y + h / 2;
    const hx = Math.abs(w) / 2 - r, hy = Math.abs(h) / 2 - r;
    this._fill((px, py) => {
      const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
    }, col, [x, y, x + w, y + h]);
  }

  /** 圆角矩形描边(线宽 wd,画在矩形内侧) */
  strokeRect(x, y, w, h, col, wd, r) {
    wd = wd || 1;
    r = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    const cx = x + w / 2, cy = y + h / 2;
    const hx = Math.abs(w) / 2 - r, hy = Math.abs(h) / 2 - r;
    this._fill((px, py) => {
      const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const d = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
      return (d <= 0 && d >= -wd) ? -1 : 1;
    }, col, [x - wd - 1, y - wd - 1, x + w + wd + 1, y + h + wd + 1]);
  }

  circle(cx, cy, r, col) {
    this._fill((px, py) => {
      const dx = px - cx, dy = py - cy;
      return Math.sqrt(dx * dx + dy * dy) - Math.abs(r);
    }, col, [cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1]);
  }

  ellipse(cx, cy, rx, ry, col) {
    this._fill((px, py) => {
      const dx = (px - cx) / Math.abs(rx), dy = (py - cy) / Math.abs(ry);
      return dx * dx + dy * dy - 1;
    }, col, [cx - Math.abs(rx) - 1, cy - Math.abs(ry) - 1,
      cx + Math.abs(rx) + 1, cy + Math.abs(ry) + 1]);
  }

  polygon(pts, col) {
    this._fill((px, py) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside ? -1 : 1;
    }, col, bboxOf(pts));
  }

  /** 线段(圆头,和引擎里 capsule 的画法一致) */
  line(x1, y1, x2, y2, wd, col) {
    const half = wd / 2;
    this._fill((px, py) => {
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = px - (x1 + t * dx), qy = py - (y1 + t * dy);
      return Math.sqrt(qx * qx + qy * qy) - half;
    }, col, [Math.min(x1, x2) - half - 1, Math.min(y1, y2) - half - 1,
      Math.max(x1, x2) + half + 1, Math.max(y1, y2) + half + 1]);
  }

  /** 竖直渐变(铺满一个矩形) */
  gradientV(x, y, w, h, stops) {
    const x0 = Math.round(x * this.ss), x1 = Math.round((x + w) * this.ss);
    const y0 = Math.round(y * this.ss), y1 = Math.round((y + h) * this.ss);
    for (let py = Math.max(0, y0); py < Math.min(this.H, y1); py++) {
      const t = (py - y0) / Math.max(1, y1 - y0 - 1);
      const col = sampleStops(stops, t);
      for (let px = Math.max(0, x0); px < Math.min(this.W, x1); px++) {
        this._put(px, py, col);
      }
    }
  }

  /** 把另一块画布整张贴上来(云就是先画在小画布上再贴的,这样云内部没有缝) */
  blit(src, dx, dy, alpha) {
    const ox = Math.round(dx * this.ss), oy = Math.round(dy * this.ss);
    for (let y = 0; y < src.H; y++) {
      for (let x = 0; x < src.W; x++) {
        const i = (y * src.W + x) * 4;
        const a = src.buf[i + 3];
        if (a <= 0) continue;
        this._put(ox + x, oy + y,
          [src.buf[i] * 255, src.buf[i + 1] * 255, src.buf[i + 2] * 255, 255],
          a * (alpha === undefined ? 1 : alpha));
      }
    }
  }

  /** 下采样 + 编码成 PNG(Buffer) */
  toPNG() {
    const { w, h, ss, W, H, buf } = this;
    const rgba = Buffer.alloc(w * h * 4);
    const n = ss * ss;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < ss; sy++) {
          for (let sx = 0; sx < ss; sx++) {
            const i = ((y * ss + sy) * W + (x * ss + sx)) * 4;
            const sa = buf[i + 3];
            r += buf[i] * sa; g += buf[i + 1] * sa; b += buf[i + 2] * sa; a += sa;
          }
        }
        const o = (y * w + x) * 4;
        if (a <= 0) { rgba[o] = rgba[o + 1] = rgba[o + 2] = rgba[o + 3] = 0; continue; }
        rgba[o] = clamp255(r / a * 255);
        rgba[o + 1] = clamp255(g / a * 255);
        rgba[o + 2] = clamp255(b / a * 255);
        rgba[o + 3] = clamp255(a / n * 255);
      }
    }
    return encodePNG(w, h, rgba);
  }
}

function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

/** 一组点的包围盒([x0,y0,x1,y1]) */
function bboxOf(pts) {
  let x0 = pts[0][0], y0 = pts[0][1], x1 = x0, y1 = y0;
  pts.forEach(([x, y]) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  });
  return [x0, y0, x1, y1];
}

/** 在渐变的色标上取一个颜色 */
function sampleStops(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return [
        a[1][0] + (b[1][0] - a[1][0]) * k,
        a[1][1] + (b[1][1] - a[1][1]) * k,
        a[1][2] + (b[1][2] - a[1][2]) * k,
        (a[1][3] === undefined ? 255 : a[1][3]) +
        (((b[1][3] === undefined ? 255 : b[1][3]) -
          (a[1][3] === undefined ? 255 : a[1][3])) * k)
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// ============================================================
// 二、PNG 编码(零依赖,只用 node:zlib)
// ============================================================
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;        // bit depth
  ihdr[9] = 6;        // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** 读一个 PNG 的尺寸(自检里验文件用) */
export function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** 固定种子的伪随机(星星 / 小石子的位置要每次都一样,不然没法对比文件) */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// 三、地块贴图(只在 --restore-tiles 时生成)
//     一格 45×45,完全不透明(不然铺开会看到缝)
//     游戏现在用的是 textures/block 那套 16×16 像素画,见 js/assets.js 的 FILES
// ============================================================
const OUT = [36, 34, 44];

function tileGrass() {
  const c = new Raster(TS, TS);
  c.clear([176, 138, 106]);                        // 土
  c.fillRect(0, TS - 14, TS, 14, [140, 106, 78]);  // 下方暗一点
  [[7, 14], [30, 24], [16, 33], [37, 11], [9, 40]].forEach(([x, y]) => {
    c.fillRect(x, y, 5, 4, [124, 92, 66], 2);
  });
  c.fillRect(0, 0, TS, 9, [112, 186, 92]);          // 草皮
  c.fillRect(0, 9, TS, 5, [96, 168, 80]);           // 草过渡
  for (let x = 0; x < TS; x += 7) c.fillRect(x, 14, 7, 3, [96, 168, 80]);
  c.fillRect(2, 1, 12, 3, [150, 214, 118]);         // 草尖高光
  c.fillRect(24, 1, 9, 2, [150, 214, 118]);
  c.strokeRect(0, 0, TS, TS, OUT, 2);
  return c;
}

function tileDirt() {
  const c = new Raster(TS, TS);
  c.clear([170, 132, 102]);
  c.fillRect(0, 0, TS, 4, [140, 106, 78]);
  [[5, 9], [28, 16], [12, 30], [34, 37], [20, 22], [8, 40]].forEach(([x, y]) => {
    c.fillRect(x, y, 5, 4, [126, 94, 70], 2);
  });
  c.strokeRect(0, 0, TS, TS, OUT, 2);
  return c;
}

function tileBrick() {
  const c = new Raster(TS, TS);
  c.clear([172, 100, 80]);
  const mortar = [120, 64, 54];
  for (let row = 0; row < 3; row++) {
    const y = row * 15;
    c.fillRect(0, y, TS, 2, mortar);                // 横缝
    const off = (row % 2 === 0) ? 0 : 7;
    for (let k = 0; k < 3; k++) {
      c.fillRect((off + k * 15) % TS, y, 2, 15, mortar);   // 竖缝
    }
    c.fillRect(0, y + 2, TS, 2, [206, 132, 108]);   // 砖面高光
  }
  c.strokeRect(0, 0, TS, TS, OUT, 2);
  return c;
}

function tileCloud() {                             // 云板:上面一条,下面是空的(能从下往上穿)
  const c = new Raster(TS, TS);                     // 新画布本来就是全透明的
  c.fillRect(0, 0, TS, 13, [222, 234, 250], 6);
  c.circle(12, 7, 6, [236, 244, 255]);
  c.circle(24, 6, 7, [242, 248, 255]);
  c.circle(35, 8, 5, [232, 242, 254]);
  c.fillRect(3, 1, TS - 6, 3, [255, 255, 255, 200], 2);
  c.fillRect(2, 9, TS - 4, 3, [176, 196, 226], 2);
  c.strokeRect(1, 0, TS - 2, 13, [120, 140, 176], 2, 6);
  return c;
}

function tileStone() {
  const c = new Raster(TS, TS);
  c.clear([150, 154, 164]);
  c.fillRect(0, 0, TS, 11, [170, 174, 184]);
  c.fillRect(0, TS - 11, TS, 11, [130, 134, 144]);
  const crack = [112, 116, 126];
  [[[8, 12], [14, 20]], [[14, 20], [11, 30]],
    [[30, 8], [36, 16]], [[21, 32], [33, 36]]].forEach(([p, q]) => {
    c.line(p[0], p[1], q[0], q[1], 2, crack);
  });
  [[24, 14], [7, 24], [30, 27], [17, 38]].forEach(([x, y]) => {
    c.fillRect(x, y, 6, 4, [166, 170, 180], 2);
    c.fillRect(x, y + 4, 6, 2, [136, 140, 150], 1);
  });
  c.strokeRect(0, 0, TS, TS, OUT, 2);
  return c;
}

// ============================================================
// 四、实体自己的贴图(弹簧板 S / 出口光柱 G / 浮石 y)
//     这三张原来是在 js/entities/*.js 里运行时用 canvas 现画的,
//     现在搬到这里生成 PNG,实体只负责把它贴到屏幕上。
//     贴图的原点就是实体绘制时用的那一点:
//       · 弹簧板 / 浮石:一格 45×45,贴图底边 = 格子底边(S 的贴图上面留了
//         那块箭头要占的地方,所以顶部是空的)
//       · 出口光柱:正好是判定盒 GOAL_W×GOAL_H(和 config.GOAL_WIDTH/HEIGHT 一致)
//     出口的底座比光柱宽、贴图塞不下,「上一层」要跟字体走 —— 这两个还是
//     由 js/entities/goal.js 自己画,没进贴图。
// ============================================================
export const GOAL_W = 34;    // 和 config.GOAL_WIDTH 一致
export const GOAL_H = 96;    // 和 config.GOAL_HEIGHT 一致

/**
 * 把"圆角矩形里的一段竖直渐变"画出来。
 * 光栅器没有"把渐变裁进圆角"这一步,所以按半像素一行一行收角:
 * 每行算出圆角往里缩多少,再铺一条只有这一行高的渐变条,拼起来就是圆角渐变。
 */
function gradientRoundRect(c, x, y, w, h, r, stops) {
  const step = 1 / c.ss;
  for (let i = 0; i < h * c.ss; i++) {
    const cy = (i + 0.5) * step;                  // 这一条的中心(逻辑坐标)
    const dy = Math.min(cy, h - cy);
    const inset = dy < r ? r - Math.sqrt(Math.max(0, r * r - (r - dy) * (r - dy))) : 0;
    c.fillRect(x + inset, y + i * step, w - inset * 2, step, sampleStops(stops, cy / h));
  }
}

/** 弹簧板 S:底座 + 两圈弹簧 + 黄色板面 + 往上顶的箭头(= 没被踩下去的那一帧) */
function entitySpring() {
  const c = new Raster(TS, TS);
  const W = TS, sy = TS;                          // 贴图底边 = 格子底边
  c.fillRect(0, sy - 12, W, 14, [26, 28, 40], 5);          // 底座的外描边
  c.fillRect(2, sy - 10, W - 4, 10, [70, 76, 104], 3);     // 底座
  c.line(W / 2 - 8, sy - 14, W / 2 + 8, sy - 17, 3, [150, 158, 186]);   // 弹簧圈
  c.line(W / 2 - 8, sy - 20, W / 2 + 8, sy - 23, 3, [150, 158, 186]);
  c.fillRect(-1, sy - 28, W + 2, 13, [26, 28, 40], 6);     // 板面的外描边
  c.fillRect(1, sy - 26, W - 2, 9, [246, 196, 96], 4);     // 板面
  c.fillRect(4, sy - 25, W - 8, 3, [255, 232, 160], 2);    // 板面高光
  c.polygon([[W / 2, sy - 34], [W / 2 - 6, sy - 28], [W / 2 + 6, sy - 28]],
    [255, 226, 140, 190]);                                 // 往上顶的箭头
  return c;
}

/** 出口光柱 G:圆角光柱 + 一圈亮边 + 两层往上抽的箭头(pulse 取中间值那一帧) */
function entityGoal() {
  const c = new Raster(GOAL_W, GOAL_H);
  const pulse = 0.5;            // 贴图存"中间亮度",呼吸交给实体调 globalAlpha
  gradientRoundRect(c, 0, 0, GOAL_W, GOAL_H, 10, [
    [0, [255, 235, 170, Math.round((0.05 + 0.14 * pulse) * 255)]],
    [0.65, [255, 210, 120, Math.round((0.20 + 0.16 * pulse) * 255)]],
    [1, [255, 190, 90, Math.round(0.55 * 255)]]
  ]);
  c.strokeRect(0, 0, GOAL_W, GOAL_H,
    [255, 232, 168, Math.round((0.35 + 0.4 * pulse) * 255)], 2, 10);
  const cx = GOAL_W / 2;
  const ay = GOAL_H * 0.45 - (1 - pulse) * 6;
  c.polygon([[cx, ay], [cx - 11, ay + 13], [cx + 11, ay + 13]], [255, 240, 190, 200]);
  c.polygon([[cx, ay + 15], [cx - 11, ay + 28], [cx + 11, ay + 28]], [255, 240, 190, 120]);
  return c;
}

/** 浮石 y:一块发蓝的石头(踩到之后由实体把它缩小 + 留一圈虚影) */
function entityBlink() {
  const c = new Raster(TS, TS);
  c.fillRect(-1, -1, TS + 2, TS + 2, [26, 30, 44], 7);     // 外描边
  c.fillRect(1, 1, TS - 2, TS - 2, [96, 132, 156], 5);     // 石面
  c.fillRect(5, 4, TS - 10, 3, [226, 240, 250], 2);        // 顶上的高光
  c.line(6, TS * 0.55, TS - 6, TS * 0.55, 1, [206, 224, 236]);   // 中间那条纹
  return c;
}

// ============================================================
// 五、天空贴图(8 张,爬塔时按层循环)
//     sky1 是最底下的深渊,sky8 是云上;想换配色就改这张表
// ============================================================
export const SKIES = [
  { name: '深渊底层', w: 960, h: 540,
    stops: [[0, [8, 8, 18]], [0.55, [24, 16, 40]], [1, [58, 30, 62]]],
    stars: 1.1, embers: 26, glow: [122, 58, 92], glowA: 0.30 },
  { name: '深渊', w: 960, h: 540,
    stops: [[0, [12, 14, 32]], [0.55, [30, 26, 60]], [1, [54, 46, 96]]],
    stars: 1.0, embers: 16, glow: [104, 92, 168], glowA: 0.26 },
  { name: '地下蓝', w: 960, h: 540,
    stops: [[0, [10, 24, 40]], [0.55, [20, 50, 78]], [1, [40, 82, 112]]],
    stars: 0.7, glow: [96, 156, 200], glowA: 0.22 },
  { name: '夜空', w: 960, h: 540,
    stops: [[0, [6, 12, 38]], [0.55, [18, 32, 76]], [1, [44, 64, 116]]],
    stars: 1.3, moon: 1, glow: [120, 150, 220], glowA: 0.18 },
  { name: '黎明', w: 960, h: 540,
    stops: [[0, [22, 28, 70]], [0.5, [86, 68, 122]], [0.82, [226, 152, 118]], [1, [248, 206, 154]]],
    stars: 0.45, clouds: 0.5, cloudCol: [255, 226, 220], glow: [255, 196, 150], glowA: 0.22 },
  { name: '黄昏', w: 960, h: 540,
    stops: [[0, [34, 24, 66]], [0.5, [136, 78, 108]], [0.84, [240, 168, 104]], [1, [252, 214, 142]]],
    stars: 0.25, clouds: 0.7, cloudCol: [255, 214, 186], glow: [255, 190, 120], glowA: 0.24 },
  { name: '晴空', w: 960, h: 540,
    stops: [[0, [34, 92, 168]], [0.55, [88, 154, 216]], [1, [190, 224, 246]]],
    clouds: 1.0, cloudCol: [255, 255, 255], glow: [255, 255, 255], glowA: 0.16 },
  { name: '云上', w: 960, h: 540,
    stops: [[0, [70, 138, 206]], [0.5, [152, 198, 238]], [1, [240, 250, 255]]],
    clouds: 1.5, cloudCol: [255, 255, 255], glow: [255, 255, 255], glowA: 0.22 }
];

/** 一朵云:几个椭圆叠成一体,底下压一点暗面(画在临时画布上,再整朵贴) */
function drawCloud(c, cx, cy, s, col) {
  const parts = [
    [-1.00, 0.10, 0.62, 0.55], [-0.35, -0.20, 0.82, 0.80],
    [0.35, -0.06, 0.72, 0.66], [1.00, 0.14, 0.54, 0.46],
    [0.00, 0.24, 1.28, 0.40]
  ];
  parts.forEach(([dx, dy, rx, ry]) => {
    c.ellipse(cx + dx * s, cy + dy * s, rx * s, ry * s * 0.72, [...col, 255]);
  });
  const shade = [Math.round(col[0] * 0.74), Math.round(col[1] * 0.78), Math.round(col[2] * 0.90)];
  c.ellipse(cx, cy + s * 0.36, s * 1.20, s * 0.19, [...shade, 255]);
  c.ellipse(cx - s * 0.45, cy + s * 0.28, s * 0.55, s * 0.14, [...shade, 255]);
}

function drawSky(i) {
  const s = SKIES[i];
  const c = new Raster(s.w, s.h, 2);
  c.gradientV(0, 0, s.w, s.h, s.stops);

  // 星尘(越往下越多)
  if (s.stars) {
    const r = rng(1000 + i * 77);
    for (let k = 0; k < 130 * s.stars; k++) {
      const x = r() * s.w, y = r() * s.h * 0.75;
      const rad = 0.5 + r() * 1.3;
      const a = (0.25 + r() * 0.6) * Math.min(1, s.stars) * (1 - y / (s.h * 0.9) * 0.5);
      c.circle(x, y, rad, [255, 255, 255, Math.round(a * 255)]);
    }
  }
  // 月亮(夜空才有)
  if (s.moon) {
    c.circle(s.w * 0.76, s.h * 0.20, 34, [246, 246, 226, 30]);
    c.circle(s.w * 0.76, s.h * 0.20, 26, [250, 250, 232, 235]);
    c.circle(s.w * 0.76 - 9, s.h * 0.20 - 6, 4, [226, 228, 214, 200]);
    c.circle(s.w * 0.76 + 7, s.h * 0.20 + 8, 5, [226, 228, 214, 180]);
  }
  // 云(越往上越多;远处的更小更淡)
  if (s.clouds) {
    const r = rng(4000 + i * 131);
    const col = s.cloudCol || [255, 255, 255];
    const n = Math.round(7 * s.clouds);
    const temp = new Raster(360, 240, 2);           // 一朵云先画这儿,再整朵贴上去
    for (let k = 0; k < n; k++) {
      const far = r();                       // 0 = 远,1 = 近
      const cx = 70 + r() * (s.w - 140);
      const cy = s.h * (0.30 + r() * 0.60);
      const sc = 26 + far * 50;
      const a = (0.14 + far * 0.22) * Math.min(1.25, s.clouds);
      temp.clear([0, 0, 0, 0]);
      drawCloud(temp, 180, 120, sc, col);
      c.blit(temp, cx - 180, cy - 120, a);
    }
  }
  // 深渊底部的余烬
  if (s.embers) {
    const r = rng(7000 + i * 53);
    for (let k = 0; k < s.embers; k++) {
      const x = r() * s.w, y = s.h * (0.55 + r() * 0.45);
      c.circle(x, y, 1 + r() * 2.2, [255, 190, 120, Math.round((0.25 + r() * 0.5) * 255)]);
    }
  }
  // 竖井底部的一层柔光(塔里那点光)
  const gx = s.w * 0.5, gy = s.h * 0.98;
  for (let k = 0; k < 26; k++) {
    const t = k / 26;
    c.ellipse(gx, gy, s.w * (0.10 + t * 0.42), s.h * (0.05 + t * 0.30),
      [...s.glow, Math.round(s.glowA * (1 - t) * 0.10 * 255)]);
  }
  return c;
}

// ============================================================
// 六、界面贴图:开局界面的背景
// ============================================================
function titleBg() {
  const w = 960, h = 540;
  const c = new Raster(w, h, 2);
  c.gradientV(0, 0, w, h, [
    [0, [6, 8, 24]], [0.45, [20, 22, 58]], [0.78, [46, 38, 88]], [1, [86, 54, 96]]
  ]);
  // 星星
  const r = rng(20260101);
  for (let k = 0; k < 190; k++) {
    const x = r() * w, y = r() * h * 0.78;
    const a = (0.25 + r() * 0.7) * (1 - y / h);
    c.circle(x, y, 0.5 + r() * 1.4, [255, 255, 255, Math.round(a * 255)]);
  }
  // 月亮
  c.circle(w * 0.80, h * 0.17, 44, [250, 246, 226, 26]);
  c.circle(w * 0.80, h * 0.17, 33, [252, 250, 236, 240]);
  c.circle(w * 0.80 - 11, h * 0.17 - 8, 5, [228, 230, 216, 210]);
  c.circle(w * 0.80 + 8, h * 0.17 + 9, 6, [228, 230, 216, 190]);
  // 远处的山
  c.polygon([[0, h * 0.84], [w * 0.16, h * 0.66], [w * 0.34, h * 0.84]], [22, 24, 48]);
  c.polygon([[w * 0.30, h * 0.84], [w * 0.52, h * 0.62], [w * 0.74, h * 0.84]], [27, 29, 56]);
  c.polygon([[w * 0.66, h * 0.84], [w * 0.86, h * 0.68], [w, h * 0.84]], [22, 24, 48]);
  // 中间那座塔(它是往上爬的) —— 下宽上窄,带楼层线和亮着的窗。
  // 故意偏左放:中间要留给「开始 / 退出」两个按钮。
  const tw = w * 0.15;
  const cx = w * 0.27;
  const topY = h * 0.12, botY = h * 0.90;
  const seg = 10;
  for (let k = 0; k < seg; k++) {
    const t0 = k / seg, t1 = (k + 1) / seg;
    const y0 = botY + (topY - botY) * t0, y1 = botY + (topY - botY) * t1;
    const w0 = tw * (1 - t0 * 0.42), w1 = tw * (1 - t1 * 0.42);
    c.polygon([
      [cx - w0 / 2, y0], [cx + w0 / 2, y0],
      [cx + w1 / 2, y1], [cx - w1 / 2, y1]
    ], [30, 30, 56]);
    c.fillRect(cx - w1 / 2 - 2, y1 - 3, w1 + 4, 4, [46, 46, 78]);      // 楼层线
  }
  // 亮着的窗
  const r2 = rng(99);
  for (let k = 0; k < 46; k++) {
    const t = 0.02 + r2() * 0.9;
    const y = botY + (topY - botY) * t;
    const ww = tw * (1 - t * 0.42);
    const x = cx + (r2() - 0.5) * ww * 0.6;
    const lit = r2() < 0.55;
    c.fillRect(x - 2.5, y - 6, 5, 7,
      lit ? [255, 206, 120, 235] : [70, 74, 108, 200], 1);
  }
  // 塔顶的一点光
  c.circle(cx, topY - 6, 9, [255, 224, 150, 60]);
  c.circle(cx, topY - 6, 5, [255, 236, 180, 230]);
  // 地面剪影
  c.fillRect(0, h * 0.92, w, h * 0.08, [14, 14, 28]);
  // 底部压暗一点,让按钮更清楚
  c.gradientV(0, h * 0.55, w, h * 0.45, [
    [0, [0, 0, 0, 0]], [1, [0, 0, 0, 150]]
  ]);
  return c;
}

// ============================================================
// 七、全部贴图清单 + 生成 / 检查
// ============================================================
/**
 * 返回 {相对路径: Raster}。游戏读的就是这些路径(见 js/assets.js 的 FILES)。
 *
 * **地块贴图(assets/tiles)默认不在这里生成**:它们现在是 textures/block 那套
 * 16×16 像素画(第七轮换的,对应关系见 js/assets.js 的 FILES 注释 / README)。
 * 跑这个脚本不会覆盖它们 —— 想改地块就直接改那几个 PNG。
 *
 * 传 opts.tiles = true(命令行 `--restore-tiles`)才会把老版本那套"现画的地块"
 * 重新画进 assets/tiles(45×45),那是"贴图包丢了 / 想回到以前的风格"时的后路。
 */
export function generate(opts) {
  const out = {};
  if (opts && opts.tiles) {
    out['assets/tiles/grass_top.png'] = tileGrass();
    out['assets/tiles/dirt.png'] = tileDirt();
    out['assets/tiles/brick.png'] = tileBrick();
    out['assets/tiles/stone.png'] = tileStone();
    out['assets/tiles/cloud.png'] = tileCloud();
  }
  out['assets/entities/spring.png'] = entitySpring();
  out['assets/entities/goal.png'] = entityGoal();
  out['assets/entities/blink.png'] = entityBlink();
  SKIES.forEach((s, i) => { out['assets/sky/sky' + (i + 1) + '.png'] = drawSky(i); });
  out['assets/ui/title.png'] = titleBg();
  return out;
}

/** 生成出来但先不落盘(自检里拿它和磁盘上的文件对比) */
export function generateBuffers(opts) {
  const files = generate(opts);
  const out = {};
  Object.keys(files).forEach((k) => { out[k] = files[k].toPNG(); });
  return out;
}

function writeAll(opts, verbose = true) {
  const files = generateBuffers(opts);
  Object.keys(files).forEach((rel) => {
    const p = join(ROOT, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, files[rel]);
    if (verbose) {
      const sz = pngSize(files[rel]);
      console.log('  ✓ ' + rel + '  ' + sz.w + '×' + sz.h +
        '  ' + (files[rel].length / 1024).toFixed(1) + ' KB');
    }
  });
  return files;
}

function checkAll(opts) {
  const files = generateBuffers(opts);
  let bad = 0;
  Object.keys(files).forEach((rel) => {
    const p = join(ROOT, rel);
    if (!existsSync(p)) {
      console.log('  缺文件:' + rel + '(跑 node tools/build_assets.mjs 生成)');
      bad++;
      return;
    }
    if (!readFileSync(p).equals(files[rel])) {
      console.log('  和代码画出来的不一致:' + rel);
      bad++;
    }
  });
  console.log(bad ? ('有 ' + bad + ' 个贴图和代码对不上') : '贴图都和代码一致 ✔');
  return bad;
}

const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (IS_MAIN) {
  const opts = { tiles: process.argv.includes('--restore-tiles') };
  if (process.argv.includes('--check')) {
    process.exit(checkAll(opts) ? 1 : 0);
  }
  console.log(opts.tiles
    ? '生成贴图(=--restore-tiles:地块也重画成 45×45 的旧样式):'
    : '生成贴图(地块不在这里生成,它们是 textures/block 那套 16×16 像素画):');
  writeAll(opts);
  console.log('\n全部写好了。文件都在 assets/ 下面,可以直接用画图软件改。');
}
