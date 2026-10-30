/* -*- coding: utf-8 -*- */
/*
 * level-data.js —— 关卡数据 schemaVersion=2 的编解码 / 校验 / 内容 hash
 * ==================================================================
 * 这是 T01 的共用契约模块:编辑器、运行时、导入工具和自检以后都调这一份,
 * 不允许各自再写一套默认值或字段检查。它只处理数据,不画图、不读 DOM、
 * 不依赖浏览器文件选择 —— Node 与浏览器里跑出来必须完全一样(尤其是 hash)。
 *
 * 数据长这样(完整字段与语义见 docs/design/data-and-interfaces.md 第 2 节):
 *
 *   LevelData {
 *     schemaVersion: 2,
 *     id, title, kind, difficulty,
 *     size: { cols, rows },
 *     terrain: { tiles: 整数矩阵 },          ← 唯一可编辑地形真值,不再有 asc 双写
 *     ports: null | { profile, entry:{col}, exit:{col} },
 *     spawn: null | { col, row },
 *     objects: [{ id, type, col, row, params, pathId }],
 *     paths:   [{ id, mode, points:[{col,row}] }],
 *     visuals: { backgroundId, decorations:[…] },
 *     extensions: {},                        ← 只存 JSON 数据,不执行
 *     contentHash: null | 'sha256:…',        ← 派生值,不进 hash
 *     certification: null | {…}              ← 认证,也不进 hash
 *   }
 *
 * 三个概念不要混:
 *   · decode  只回答"这份数据能不能安全读成 LevelData",草稿允许不完整;
 *   · validate 回答"按什么用途(draft/play/publish)还差什么",问题带 code/path;
 *   · encode  先重新校验(草稿级),再重算 contentHash 输出 JSON 文本。
 *
 * 校验严重度:结构问题(类型、越界、引用断开)一律是 error;只有"草稿可以暂时
 * 缺的东西"(没有接口、对象在界外、路径不到两个点、未知对象类型)在 draft 用途
 * 下降为 warning —— 保存备份不要求可通,试玩/发布必须过严格检查。
 */
(function (RA) {
  'use strict';

  var C = RA.C || {};
  var LIMITS = C.DATA_LIMITS || {};
  var PORT_SPEC = C.PORT || {};

  var L = {
    BYTES: LIMITS.MAX_IMPORT_BYTES || 2 * 1024 * 1024,
    COLS: LIMITS.MAX_COLS || 600,
    ROWS: LIMITS.MAX_ROWS || 4096,
    TILES: LIMITS.MAX_TILES || 250000,
    OBJECTS: LIMITS.MAX_OBJECTS || 400,
    PATHS: LIMITS.MAX_PATHS || 200,
    POINTS: LIMITS.MAX_PATH_POINTS || 128,
    DECORATIONS: LIMITS.MAX_DECORATIONS || 200,
    ID: LIMITS.MAX_ID_LEN || 64,
    TITLE: LIMITS.MAX_TITLE_LEN || 120,
    STR: LIMITS.MAX_STRING_LEN || 256,
    EXT: LIMITS.MAX_EXTENSIONS_BYTES || 32768
  };

  var PORT = {
    profile: PORT_SPEC.PROFILE || 'vertical-v1',
    openingCols: PORT_SPEC.OPENING_COLS || 4,
    safeRows: PORT_SPEC.SAFE_ROWS || 3,
    sideMargin: PORT_SPEC.SIDE_MARGIN_COLS || 1
  };

  var SCHEMA_VERSION = 2;
  var KINDS = ['normal', 'lobby', 'rest', 'boss'];
  var MODES = ['loop', 'pingpong'];
  var ID_RE = /^[A-Za-z0-9_-]+$/;
  var ASSET_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/;

  /*
   * 地块字典:0 空、1 草、2 土、3 砖、4 石、5 单向梯板(云板)。
   * 字符只用于旧格式迁移、诊断输出和(将来的)调试;正式真值就是整数矩阵。
   * 与旧引擎 level.js 的 TILE_IMAGES 对应关系由 12 张旧图迁移验证。
   */
  var TILES = [
    { id: 0, ch: '+', name: '空气', solid: false, oneway: false },
    { id: 1, ch: '^', name: '草地', solid: true, oneway: false },
    { id: 2, ch: '_', name: '泥土', solid: true, oneway: false },
    { id: 3, ch: '~', name: '砖块', solid: true, oneway: false },
    { id: 4, ch: '=', name: '石块', solid: true, oneway: false },
    { id: 5, ch: '-', name: '云板(单向)', solid: false, oneway: true }
  ];
  var CHAR_TO_TILE = {};
  var TILE_TO_CHAR = [];
  TILES.forEach(function (t) {
    CHAR_TO_TILE[t.ch] = t.id;
    TILE_TO_CHAR[t.id] = t.ch;
  });

  // ===================== Result / Issue =====================
  function ok(value, extra) {
    var r = { ok: true, value: value };
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }

  function fail(code, message, issues) {
    return { ok: false, error: { code: code, message: message, issues: issues || [] } };
  }

  function issue(code, path, message, severity) {
    return { code: code, path: path, message: message, severity: severity || 'error' };
  }

  function errorsOf(issues) {
    return (issues || []).filter(function (i) { return i.severity !== 'warning'; });
  }

  function warningsOf(issues) {
    return (issues || []).filter(function (i) { return i.severity === 'warning'; });
  }

  // ===================== 基础判断 =====================
  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v) &&
      Object.prototype.toString.call(v) === '[object Object]';
  }

  function isInt(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
  }

  function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim() !== '';
  }

  /** UTF-8 字节数(和真实文件大小一致,不用 blob 估算) */
  function utf8Bytes(str) {
    var s = String(str);
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { n += 4; i++; }
        else n += 3;
      } else n += 3;
    }
    return n;
  }

  function byteLength(str) {
    if (typeof globalThis.TextEncoder === 'function') {
      try { return new globalThis.TextEncoder().encode(str).length; } catch (e) { /* 退回手算 */ }
    }
    return utf8Bytes(str);
  }

  /** 只允许 JSON 能表达的值:undefined / 函数 / NaN / Infinity 都当场报错 */
  function assertJsonValue(v, path) {
    if (v === null) return;
    var t = typeof v;
    if (t === 'string' || t === 'boolean') return;
    if (t === 'number') {
      if (!isFinite(v)) throw dataError('INVALID_FIELD', path, '数字必须是有限值(NaN / Infinity 不能写进关卡)');
      return;
    }
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) assertJsonValue(v[i], path + '/' + i);
      return;
    }
    if (isPlainObject(v)) {
      Object.keys(v).forEach(function (k) { assertJsonValue(v[k], path + '/' + k); });
      return;
    }
    throw dataError('INVALID_FIELD', path, '不能序列化的类型:' + (t === 'undefined' ? 'undefined' : t));
  }

  function jsonClone(v, path) {
    assertJsonValue(v, path || '');
    return JSON.parse(JSON.stringify(v));
  }

  /** 用户可控的键(对象 id / 路径 id / 类型名)一律用无原型字典,避免 __proto__ 污染 */
  function dict() { return Object.create(null); }

  function dataError(code, path, message) {
    var e = new Error(message);
    e.dataCode = code;
    e.dataPath = path || '';
    return e;
  }

  // ===================== 规范化 JSON(canonical)=====================
  /*
   * 对象键递归按字典序、数组保持顺序、无多余空白。contentHash 就建立在这份
   * 规范文本上,所以"键顺序不同"不能改变 hash;而任何内容变化(包括名字、
   * 背景、extensions)都会改变 hash —— 首版不做"是否影响玩法"的猜测(B08)。
   */
  function canonical(v) {
    if (v === null) return 'null';
    var t = typeof v;
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'number') {
      if (!isFinite(v)) throw dataError('INVALID_FIELD', '', '数字必须是有限值');
      return JSON.stringify(v);
    }
    if (t === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) {
      var parts = [];
      for (var i = 0; i < v.length; i++) parts.push(canonical(v[i]));
      return '[' + parts.join(',') + ']';
    }
    if (t === 'object') {
      var keys = Object.keys(v).sort();
      var out = [];
      keys.forEach(function (k) {
        if (v[k] === undefined) return;              // undefined 等同"没写"
        out.push(JSON.stringify(k) + ':' + canonical(v[k]));
      });
      return '{' + out.join(',') + '}';
    }
    throw dataError('INVALID_FIELD', '', '不能序列化的类型:' + t);
  }

  // ===================== SHA-256(纯 JS,Node / 浏览器一致)=====================
  /*
   * 为什么不直接用 crypto.subtle:file:// 打开时浏览器不保证给 WebCrypto,
   * 而要求编辑器保存与 Node 校验得到同一个 hash。这里实现一次,两端共用。
   * 自检会用 node:crypto 交叉验证(含中文与长字符串),不靠背下来的向量。
   */
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function utf8Array(str) {
    var s = String(str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) {
          var cp = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00);
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
            0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
          i++;
        } else {
          out.push(0xEF, 0xBF, 0xBD);              // 孤立代理项按替换字符处理
        }
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        out.push(0xEF, 0xBF, 0xBD);
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return out;
  }

  function sha256Hex(str) {
    var bytes = utf8Array(str);
    var len = bytes.length;
    var total = Math.ceil((len + 9) / 64) * 64;
    var buf = new Uint8Array(total);
    for (var i = 0; i < len; i++) buf[i] = bytes[i];
    buf[len] = 0x80;
    var bits = len * 8;
    var hi = Math.floor(bits / 4294967296);
    var lo = bits >>> 0;
    buf[total - 8] = (hi >>> 24) & 255;
    buf[total - 7] = (hi >>> 16) & 255;
    buf[total - 6] = (hi >>> 8) & 255;
    buf[total - 5] = hi & 255;
    buf[total - 4] = (lo >>> 24) & 255;
    buf[total - 3] = (lo >>> 16) & 255;
    buf[total - 2] = (lo >>> 8) & 255;
    buf[total - 1] = lo & 255;

    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var t = 0; t < 16; t++) {
        var p = off + t * 4;
        w[t] = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3];
      var e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var temp1 = (hh + S1 + ch + K256[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      h[0] = (h[0] + a) | 0;
      h[1] = (h[1] + b) | 0;
      h[2] = (h[2] + c) | 0;
      h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0;
      h[5] = (h[5] + f) | 0;
      h[6] = (h[6] + g) | 0;
      h[7] = (h[7] + hh) | 0;
    }
    var hex = '';
    for (var k = 0; k < 8; k++) {
      hex += ('00000000' + (h[k] >>> 0).toString(16)).slice(-8);
    }
    return hex;
  }

  // ===================== 可读的 JSON 文本 =====================
  /*
   * encode 输出给人看,不是机器格式:地形每一行写在一行里([0, 0, 5, …]),
   * 其余对象/路径按常规缩进展开。纯数字数组内联,其他数组不内联 ——
   * 这样 23×16 的地图不会变成 300 行单个数字。输出仍是标准 JSON,
   * JSON.parse 回来与结构完全一致;hash 也不受排版影响。
   */
  function pretty(v, indent) {
    var depth = indent || 0;
    var pad = new Array(depth + 1).join('  ');
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'number') {
      if (!isFinite(v)) throw dataError('INVALID_FIELD', '', '数字必须是有限值');
      return JSON.stringify(v);
    }
    if (t === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      var onlyNumbers = v.every(function (x) { return typeof x === 'number' && isFinite(x); });
      if (onlyNumbers) return '[' + v.join(', ') + ']';
      var items = v.map(function (x) { return pad + '  ' + pretty(x, depth + 1); });
      return '[\n' + items.join(',\n') + '\n' + pad + ']';
    }
    if (t === 'object') {
      var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; });
      if (!keys.length) return '{}';
      var lines = keys.map(function (k) {
        return pad + '  ' + JSON.stringify(k) + ': ' + pretty(v[k], depth + 1);
      });
      return '{\n' + lines.join(',\n') + '\n' + pad + '}';
    }
    throw dataError('INVALID_FIELD', '', '不能序列化的类型:' + t);
  }

  // ===================== 内容与 hash =====================
  /** 参与 hash 的字段:除 contentHash / certification 外的完整 LevelData */
  function contentOf(data) {
    if (!isPlainObject(data)) throw dataError('INVALID_FIELD', '', 'LevelData 必须是一个对象');
    return {
      schemaVersion: data.schemaVersion,
      id: data.id,
      title: data.title,
      kind: data.kind,
      difficulty: data.difficulty === undefined ? null : data.difficulty,
      size: data.size,
      terrain: data.terrain,
      ports: data.ports === undefined ? null : data.ports,
      spawn: data.spawn === undefined ? null : data.spawn,
      objects: data.objects || [],
      paths: data.paths || [],
      visuals: data.visuals,
      extensions: data.extensions || {}
    };
  }

  function hashSync(data) {
    return 'sha256:' + sha256Hex(canonical(contentOf(data)));
  }

  /** 契约里的异步签名;实现是同步的,但调用方按 Promise 用,换实现不用改调用处 */
  function hash(data) {
    return new Promise(function (resolve) { resolve(hashSync(data)); });
  }

  function sameContent(a, b) {
    return hashSync(a) === hashSync(b);
  }

  // ===================== 解码 =====================
  /**
   * 把外部输入(JSON 文本 / 已 parse 的对象)读成 LevelData。
   * opts.allowDraft !== false:草稿允许缺接口/出生点(结构必须合法)。
   * opts.verifyHash !== false:文件里带了 contentHash 就必须和实际内容一致。
   * 返回 {ok:true, value, warnings} 或 {ok:false, error:{code,message,issues}}。
   */
  function decode(input, opts) {
    opts = opts || {};
    var warnings = [];
    var raw = input;

    if (typeof raw === 'string') {
      var text = raw;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      var bytes = byteLength(text);
      if (bytes > L.BYTES) {
        return fail('LIMIT_EXCEEDED',
          '文件有 ' + bytes + ' 字节,超过导入上限 ' + L.BYTES + ' 字节', [
            issue('LIMIT_EXCEEDED', '', '文件太大,不能一次读入')
          ]);
      }
      var s = text.trim();
      if (!s) return fail('INVALID_JSON', '文件是空的', [issue('INVALID_JSON', '', '空文件')]);
      if (s.charAt(0) !== '{') {
        return fail('INVALID_JSON',
          '这不是 schemaVersion=2 的关卡 JSON(看起来是地图文本或别的文件);' +
          '旧 asc / TXT 请先走迁移入口(js/legacy-import.js 或 tools/migrate_levels.mjs)', [
            issue('INVALID_JSON', '', '顶层不是 JSON 对象')
          ]);
      }
      try { raw = JSON.parse(s); } catch (e) {
        return fail('INVALID_JSON', 'JSON 解析失败:' + (e && e.message), [
          issue('INVALID_JSON', '', String((e && e.message) || e))
        ]);
      }
    }

    if (!isPlainObject(raw)) {
      return fail('INVALID_JSON', '关卡数据必须是一个 JSON 对象', [
        issue('INVALID_JSON', '', '顶层不是对象')
      ]);
    }

    var ver = raw.schemaVersion;
    if (ver !== SCHEMA_VERSION) {
      var shown = ver === undefined ? '(没有这个字段)' : JSON.stringify(ver);
      var hint = ver === undefined
        ? '旧版本没有 schemaVersion,要用迁移工具转成 v2 草稿,不能直接当新格式读'
        : (typeof ver === 'number' && ver > SCHEMA_VERSION
          ? '这是更新版本的数据,当前程序不能降级读取,请更新程序;原文件必须保留'
          : '只支持 schemaVersion=2');
      return fail('UNSUPPORTED_SCHEMA', 'schemaVersion=' + shown + ':' + hint, [
        issue('UNSUPPORTED_SCHEMA', '/schemaVersion', hint)
      ]);
    }

    var built;
    try {
      built = normalize(raw, warnings, opts);
    } catch (e) {
      if (e && e.dataCode) {
        return fail(e.dataCode, e.message, [issue(e.dataCode, e.dataPath, e.message)]);
      }
      throw e;
    }
    var data = built.data;
    warnings = warnings.concat(built.warnings || []);

    if (data.contentHash !== null && opts.verifyHash !== false) {
      var actual;
      try { actual = hashSync(data); } catch (e2) {
        return fail('INVALID_FIELD', '无法计算 contentHash:' + (e2 && e2.message), [
          issue('INVALID_FIELD', '', '内容不可序列化')
        ]);
      }
      if (actual !== data.contentHash) {
        return fail('HASH_MISMATCH',
          '文件自报的 contentHash 和实际内容不一致(自报 ' + shortHash(data.contentHash) +
          ', 实际 ' + shortHash(actual) + ');不能信任自报值', [
            issue('HASH_MISMATCH', '/contentHash', '内容 hash 不匹配')
          ]);
      }
    }

    // 不允许草稿时(例如今后的正式运行入口),读入就要能直接玩
    if (opts.allowDraft === false) {
      var playIssues = validate(data, { purpose: 'play', registry: opts.registry });
      var playErrs = errorsOf(playIssues);
      if (playErrs.length) {
        return fail('INVALID_FIELD',
          '这份关卡不能直接试玩/运行(缺 ' + playErrs.length + ' 项):' + playErrs[0].message,
          playErrs);
      }
    }

    return ok(data, { warnings: warnings });
  }

  function shortHash(h) {
    return String(h || '').slice(0, 18) + '…';
  }

  /** 把外部对象规整成固定字段;结构问题抛 dataError,值问题留给 validate */
  function normalize(raw, warnings) {
    var knownTop = ['schemaVersion', 'id', 'title', 'kind', 'difficulty', 'size', 'terrain',
      'ports', 'spawn', 'objects', 'paths', 'visuals', 'extensions', 'contentHash', 'certification'];
    Object.keys(raw).forEach(function (k) {
      if (knownTop.indexOf(k) < 0) {
        warnings.push('未知的顶层字段 "' + k + '" 没有进入 LevelData(要保留就放进 extensions)');
      }
    });

    var terrainRaw = raw.terrain;
    if (!isPlainObject(terrainRaw) || !Array.isArray(terrainRaw.tiles)) {
      throw dataError('INVALID_FIELD', '/terrain',
        '缺少 terrain.tiles(整数地块矩阵);旧 asc 地图请先走 LegacyImport 迁移');
    }
    var srcRows = terrainRaw.tiles;
    var rowCount = srcRows.length;
    var colCount = 0;
    for (var r = 0; r < rowCount; r++) {
      if (!Array.isArray(srcRows[r])) {
        throw dataError('INVALID_FIELD', '/terrain/tiles/' + r, '每一行地形必须是整数数组');
      }
      colCount = Math.max(colCount, srcRows[r].length);
    }
    if (rowCount === 0 || colCount === 0) {
      throw dataError('INVALID_FIELD', '/terrain/tiles', '地形是空的(至少要一行一列)');
    }
    if (rowCount > L.ROWS) {
      throw dataError('LIMIT_EXCEEDED', '/terrain/tiles', '行数 ' + rowCount + ' 超过上限 ' + L.ROWS);
    }
    if (colCount > L.COLS) {
      throw dataError('LIMIT_EXCEEDED', '/terrain/tiles', '列数 ' + colCount + ' 超过上限 ' + L.COLS);
    }
    if (rowCount * colCount > L.TILES) {
      throw dataError('LIMIT_EXCEEDED', '/terrain/tiles',
        '地块总数 ' + (rowCount * colCount) + ' 超过上限 ' + L.TILES);
    }

    var tiles = [];
    for (r = 0; r < rowCount; r++) {
      var line = [];
      for (var c = 0; c < srcRows[r].length; c++) {
        var v = srcRows[r][c];
        if (typeof v !== 'number') {
          throw dataError('INVALID_FIELD', '/terrain/tiles/' + r + '/' + c,
            '地块必须是整数编号(0~5),现在是 ' + JSON.stringify(v));
        }
        line.push(v);
      }
      tiles.push(line);
    }

    var size = { cols: colCount, rows: rowCount };
    if (raw.size !== undefined && raw.size !== null) {
      if (!isPlainObject(raw.size)) {
        throw dataError('INVALID_FIELD', '/size', 'size 必须是 {cols, rows}');
      }
      if (raw.size.cols !== undefined) size.cols = raw.size.cols;
      if (raw.size.rows !== undefined) size.rows = raw.size.rows;
      if (size.cols !== colCount || size.rows !== rowCount) {
        warnings.push('size 写的是 ' + size.cols + '×' + size.rows + ',但地形实际是 ' +
          colCount + '×' + rowCount + '(校验会报错,不会自动裁剪)');
      }
    } else {
      warnings.push('没有 size,按地形实际尺寸补成 ' + colCount + '×' + rowCount);
    }

    var data = {
      schemaVersion: SCHEMA_VERSION,
      id: typeof raw.id === 'string' ? raw.id.trim() : '',
      title: raw.title === undefined || raw.title === null ? '' :
        (typeof raw.title === 'string' ? raw.title : String(raw.title)),
      kind: typeof raw.kind === 'string' ? raw.kind : 'normal',
      difficulty: raw.difficulty === undefined ? null : raw.difficulty,
      size: size,
      terrain: { tiles: tiles },
      ports: null,
      spawn: null,
      objects: [],
      paths: [],
      visuals: { backgroundId: null, decorations: [] },
      extensions: {},
      contentHash: null,
      certification: null
    };

    if (data.kind !== raw.kind && raw.kind !== undefined) {
      warnings.push('kind 不是字符串,已按 normal 读入');
    }
    if (raw.title !== undefined && raw.title !== null && typeof raw.title !== 'string') {
      warnings.push('title 不是字符串,已按文本读入(保存后就是字符串)');
    }

    // ---- ports / spawn ----
    if (raw.ports !== undefined && raw.ports !== null) {
      if (!isPlainObject(raw.ports)) {
        throw dataError('INVALID_FIELD', '/ports', 'ports 必须是对象或 null');
      }
      data.ports = jsonClone(raw.ports, '/ports');
    }
    if (raw.spawn !== undefined && raw.spawn !== null) {
      if (!isPlainObject(raw.spawn)) {
        throw dataError('INVALID_FIELD', '/spawn', 'spawn 必须是 {col,row} 或 null');
      }
      data.spawn = jsonClone(raw.spawn, '/spawn');
    }

    // ---- objects ----
    if (raw.objects !== undefined && raw.objects !== null) {
      if (!Array.isArray(raw.objects)) {
        throw dataError('INVALID_FIELD', '/objects', 'objects 必须是数组');
      }
      if (raw.objects.length > L.OBJECTS) {
        throw dataError('LIMIT_EXCEEDED', '/objects',
          '对象数 ' + raw.objects.length + ' 超过上限 ' + L.OBJECTS);
      }
      var usedObjIds = dict();
      raw.objects.forEach(function (o, i) {
        var at = '/objects/' + i;
        if (!isPlainObject(o)) {
          throw dataError('INVALID_FIELD', at, '对象必须是 JSON 对象');
        }
        if (o.params !== undefined && o.params !== null && !isPlainObject(o.params)) {
          throw dataError('INVALID_FIELD', at + '/params', 'params 必须是对象');
        }
        var id = typeof o.id === 'string' ? o.id.trim() : '';
        if (!id) {
          id = 'obj_' + (i + 1);
          warnings.push('第 ' + (i + 1) + ' 个对象没有 id,已补成 "' + id + '"(保存后会写进文件)');
        } else if (usedObjIds[id]) {
          warnings.push('对象 id "' + id + '" 重复,校验会报错');
        }
        usedObjIds[id] = true;
        var pathId = null;
        if (typeof o.pathId === 'string' && o.pathId.trim()) pathId = o.pathId.trim();
        else if (o.pathId !== undefined && o.pathId !== null) {
          warnings.push('对象 "' + id + '" 的 pathId 不是字符串,已按"没有路径"读入');
        }
        data.objects.push({
          id: id,
          type: typeof o.type === 'string' ? o.type.trim() : '',
          col: o.col,
          row: o.row,
          params: o.params === undefined || o.params === null ? {} : jsonClone(o.params, at + '/params'),
          pathId: pathId
        });
      });
    }

    // ---- paths ----
    if (raw.paths !== undefined && raw.paths !== null) {
      if (!Array.isArray(raw.paths)) {
        throw dataError('INVALID_FIELD', '/paths', 'paths 必须是数组');
      }
      if (raw.paths.length > L.PATHS) {
        throw dataError('LIMIT_EXCEEDED', '/paths',
          '路径数 ' + raw.paths.length + ' 超过上限 ' + L.PATHS);
      }
      raw.paths.forEach(function (p, i) {
        var at = '/paths/' + i;
        if (!isPlainObject(p)) throw dataError('INVALID_FIELD', at, '路径必须是 JSON 对象');
        if (p.points !== undefined && p.points !== null && !Array.isArray(p.points)) {
          throw dataError('INVALID_FIELD', at + '/points', '路径点必须是数组');
        }
        var points = [];
        (p.points || []).forEach(function (pt, j) {
          var pat = at + '/points/' + j;
          if (!isPlainObject(pt)) {
            throw dataError('INVALID_FIELD', pat, '路径点必须是 {col,row}');
          }
          points.push({ col: pt.col, row: pt.row });
        });
        if (points.length > L.POINTS) {
          throw dataError('LIMIT_EXCEEDED', at + '/points',
            '一条路径有 ' + points.length + ' 个点,超过上限 ' + L.POINTS);
        }
        data.paths.push({
          id: typeof p.id === 'string' ? p.id.trim() : '',
          mode: typeof p.mode === 'string' ? p.mode : '',
          points: points
        });
      });
    }

    // ---- visuals ----
    if (raw.visuals !== undefined && raw.visuals !== null) {
      if (!isPlainObject(raw.visuals)) {
        throw dataError('INVALID_FIELD', '/visuals', 'visuals 必须是对象');
      }
      if (raw.visuals.backgroundId !== undefined && raw.visuals.backgroundId !== null &&
        typeof raw.visuals.backgroundId !== 'string') {
        throw dataError('INVALID_FIELD', '/visuals/backgroundId', 'backgroundId 必须是字符串或 null');
      }
      data.visuals.backgroundId = typeof raw.visuals.backgroundId === 'string'
        ? raw.visuals.backgroundId.trim() : null;
      if (raw.visuals.decorations !== undefined && raw.visuals.decorations !== null) {
        if (!Array.isArray(raw.visuals.decorations)) {
          throw dataError('INVALID_FIELD', '/visuals/decorations', 'decorations 必须是数组');
        }
        if (raw.visuals.decorations.length > L.DECORATIONS) {
          throw dataError('LIMIT_EXCEEDED', '/visuals/decorations',
            '装饰数 ' + raw.visuals.decorations.length + ' 超过上限 ' + L.DECORATIONS);
        }
        data.visuals.decorations = jsonClone(raw.visuals.decorations, '/visuals/decorations');
      }
    }

    // ---- extensions ----
    if (raw.extensions !== undefined && raw.extensions !== null) {
      if (!isPlainObject(raw.extensions)) {
        throw dataError('INVALID_FIELD', '/extensions', 'extensions 必须是 JSON 对象');
      }
      data.extensions = jsonClone(raw.extensions, '/extensions');
    }

    // ---- contentHash / certification ----
    if (raw.contentHash !== undefined && raw.contentHash !== null) {
      if (typeof raw.contentHash !== 'string') {
        warnings.push('contentHash 不是字符串,已当作"没有 hash"');
      } else if (raw.contentHash.trim()) {
        data.contentHash = raw.contentHash.trim();
      }
    }
    if (raw.certification !== undefined && raw.certification !== null) {
      if (!isPlainObject(raw.certification)) {
        warnings.push('certification 不是对象,已忽略');
      } else {
        data.certification = jsonClone(raw.certification, '/certification');
      }
    }

    return { data: data, warnings: warnings };
  }

  // ===================== 校验 =====================
  /**
   * 分层校验。opts.purpose = 'draft' | 'play' | 'publish';
   * opts.rules = {rulesVersion, rulesFingerprint}(publish 时必填);
   * opts.registry 可替换对象注册表(默认 RA.EntityRegistry)。
   * 返回 Issue[]:结构性错误 severity=error,草稿可暂缺的东西在 draft 下是 warning。
   */
  function validate(data, opts) {
    opts = opts || {};
    var purpose = opts.purpose || 'draft';
    var strict = purpose === 'play' || purpose === 'publish';
    var issues = [];
    var registry = opts.registry || RA.EntityRegistry || null;

    function add(code, path, message, severity) {
      issues.push(issue(code, path, message, severity));
    }
    function bad(code, path, message) { add(code, path, message, 'error'); }
    function warn(code, path, message) { add(code, path, message, 'warning'); }
    /** strict 用途下的错误、草稿用途下的警告 */
    function need(ok, code, path, message) {
      if (ok) return;
      if (strict) bad(code, path, message); else warn(code, path, message);
    }

    if (!isPlainObject(data)) {
      bad('INVALID_FIELD', '/', 'LevelData 必须是对象');
      return issues;
    }

    // ---- 版本 / 身份 ----
    if (data.schemaVersion !== SCHEMA_VERSION) {
      bad('UNSUPPORTED_SCHEMA', '/schemaVersion',
        'schemaVersion 必须是 ' + SCHEMA_VERSION + ',现在是 ' + JSON.stringify(data.schemaVersion));
    }
    if (!isNonEmptyString(data.id)) {
      bad('INVALID_FIELD', '/id', 'id 不能为空');
    } else if (data.id.length > L.ID || !ID_RE.test(data.id)) {
      bad('INVALID_FIELD', '/id',
        'id 只能用字母、数字、下划线、短横线,长度 1~' + L.ID + '(现在是 "' + data.id + '")');
    }
    if (typeof data.title !== 'string') {
      bad('INVALID_FIELD', '/title', 'title 必须是字符串(显示名,可以为空)');
    } else if (data.title.length > L.TITLE) {
      bad('LIMIT_EXCEEDED', '/title', 'title 超过 ' + L.TITLE + ' 个字符');
    }
    if (KINDS.indexOf(data.kind) < 0) {
      bad('INVALID_FIELD', '/kind', 'kind 必须是 ' + KINDS.join(' / '));
    }

    var fixed = data.kind === 'lobby' || data.kind === 'rest' || data.kind === 'boss';
    if (fixed) {
      if (data.difficulty !== null) {
        need(false, 'INVALID_FIELD', '/difficulty', '固定场景的 difficulty 必须是 null');
      }
    } else if (!isInt(data.difficulty) || data.difficulty < 1 || data.difficulty > 4) {
      need(false, 'INVALID_FIELD', '/difficulty',
        '普通层的 difficulty 必须是 1~4 的整数(现在是 ' + JSON.stringify(data.difficulty) + ')');
    }
    if (purpose === 'publish' && data.kind !== 'normal') {
      bad('INVALID_FIELD', '/kind', '固定场景(lobby/rest/boss)不进入普通发布池,由场景控制器管理');
    }

    // ---- 尺寸 / 地形 ----
    var size = data.size;
    var tiles = data.terrain && data.terrain.tiles;
    if (!isPlainObject(size) || !isInt(size.cols) || !isInt(size.rows) ||
      size.cols < 1 || size.rows < 1) {
      bad('INVALID_FIELD', '/size', 'size 必须是正整数 {cols, rows}');
    } else {
      if (size.cols > L.COLS) {
        bad('LIMIT_EXCEEDED', '/size/cols', '宽度 ' + size.cols + ' 超过上限 ' + L.COLS);
      }
      if (size.rows > L.ROWS) {
        bad('LIMIT_EXCEEDED', '/size/rows', '高度 ' + size.rows + ' 超过上限 ' + L.ROWS);
      }
      if (size.cols * size.rows > L.TILES) {
        bad('LIMIT_EXCEEDED', '/size',
          '地块总数 ' + (size.cols * size.rows) + ' 超过上限 ' + L.TILES);
      }
    }
    if (!isPlainObject(data.terrain) || !Array.isArray(tiles)) {
      bad('INVALID_FIELD', '/terrain', 'terrain.tiles 必须是整数矩阵');
    } else if (isPlainObject(size) && isInt(size.cols) && isInt(size.rows)) {
      if (tiles.length !== size.rows) {
        bad('INVALID_FIELD', '/terrain/tiles',
          '地形有 ' + tiles.length + ' 行,但 size.rows 是 ' + size.rows + '(必须精确一致)');
      }
      for (var r = 0; r < tiles.length; r++) {
        var row = tiles[r];
        if (!Array.isArray(row)) {
          bad('INVALID_FIELD', '/terrain/tiles/' + r, '第 ' + r + ' 行不是数组');
          continue;
        }
        if (row.length !== size.cols) {
          bad('INVALID_FIELD', '/terrain/tiles/' + r,
            '第 ' + r + ' 行有 ' + row.length + ' 格,但 size.cols 是 ' + size.cols +
            '(必须精确一致,不会自动补空)');
        }
        for (var c = 0; c < row.length; c++) {
          var v = row[c];
          if (!isInt(v) || !(v >= 0 && v <= 5)) {
            bad('INVALID_FIELD', '/terrain/tiles/' + r + '/' + c,
              '地块编号必须是 0~5 的整数,现在是 ' + JSON.stringify(v));
          }
        }
      }
    }

    var cols = isPlainObject(size) && isInt(size.cols) ? size.cols : 0;
    var rows = isPlainObject(size) && isInt(size.rows) ? size.rows : 0;

    // ---- 接口 / 出生点 ----
    validatePorts(data.ports, data.kind, cols, rows, purpose, bad, need);
    validateSpawn(data.spawn, cols, rows, data.kind, purpose, add, bad, need);

    // ---- 对象 / 路径 ----
    var pathById = dict();
    if (!Array.isArray(data.paths)) {
      bad('INVALID_FIELD', '/paths', 'paths 必须是数组');
    } else {
      if (data.paths.length > L.PATHS) {
        bad('LIMIT_EXCEEDED', '/paths', '路径数超过上限 ' + L.PATHS);
      }
      data.paths.forEach(function (p, i) {
        validatePath(p, i, cols, rows, purpose, pathById, add, bad, need);
      });
    }

    if (!Array.isArray(data.objects)) {
      bad('INVALID_FIELD', '/objects', 'objects 必须是数组');
    } else {
      if (data.objects.length > L.OBJECTS) {
        bad('LIMIT_EXCEEDED', '/objects', '对象数超过上限 ' + L.OBJECTS);
      }
      var seenObjId = dict();
      data.objects.forEach(function (o, i) {
        validateObject(o, i, cols, rows, purpose, pathById, registry, seenObjId, add, bad, need);
      });
    }

    // ---- 视觉 ----
    validateVisuals(data.visuals, cols, rows, purpose, registry, add, bad, need, warn);

    // ---- extensions ----
    if (!isPlainObject(data.extensions)) {
      bad('INVALID_FIELD', '/extensions', 'extensions 必须是 JSON 对象(不能是数组)');
    } else {
      var extText;
      try {
        extText = canonical(data.extensions);
      } catch (e) {
        bad('INVALID_FIELD', '/extensions', 'extensions 里有不能序列化的值:' + (e && e.message));
      }
      if (extText && byteLength(extText) > L.EXT) {
        bad('LIMIT_EXCEEDED', '/extensions',
          'extensions 有 ' + byteLength(extText) + ' 字节,超过上限 ' + L.EXT);
      }
    }

    // ---- contentHash / certification ----
    var actualHash = null;
    try { actualHash = hashSync(data); } catch (e3) { actualHash = null; }
    if (data.contentHash !== null && data.contentHash !== undefined) {
      if (typeof data.contentHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(data.contentHash)) {
        bad('INVALID_FIELD', '/contentHash', 'contentHash 格式必须是 sha256:<64 位小写十六进制>');
      } else if (actualHash && actualHash !== data.contentHash) {
        bad('HASH_MISMATCH', '/contentHash',
          'contentHash 和内容不一致(自报 ' + shortHash(data.contentHash) + ', 实际 ' + shortHash(actualHash) + ')');
      }
    }
    if (data.certification !== null && data.certification !== undefined) {
      validateCertification(data, opts, purpose, actualHash, add, bad, warn);
    } else if (purpose === 'publish') {
      bad('CERT_REQUIRED', '/certification',
        '没有认证:发布前必须在正式运行逻辑里由作者本人通关(标准试玩)');
    }

    return issues;
  }

  function validatePorts(ports, kind, cols, rows, purpose, bad, need) {
    var required = kind === 'normal';           // 固定场景的进出由场景控制器处理
    if (ports === null || ports === undefined) {
      need(!required, 'INVALID_PORT', '/ports',
        '普通层必须有上下接口(ports):底入口 + 顶出口');
      return;
    }
    if (!isPlainObject(ports)) {
      bad('INVALID_PORT', '/ports', 'ports 必须是对象或 null');
      return;
    }
    if (ports.profile !== PORT.profile) {
      bad('INVALID_PORT', '/ports/profile',
        'ports.profile 必须是 "' + PORT.profile + '",现在是 ' + JSON.stringify(ports.profile));
    }
    ['entry', 'exit'].forEach(function (key) {
      var label = key === 'entry' ? '入口' : '出口';
      var end = ports[key];
      if (!isPlainObject(end) || !isInt(end.col)) {
        bad('INVALID_PORT', '/ports/' + key, label + '必须是 {col: 整数}');
        return;
      }
      if (end.col < 0 || end.col + PORT.openingCols > cols) {
        bad('INVALID_PORT', '/ports/' + key + '/col',
          label + '开口宽 ' + PORT.openingCols + ' 格,需要 col 在 0~' +
          Math.max(0, cols - PORT.openingCols) + ' 之间(现在是 ' + end.col + ')');
      }
      if (purpose === 'publish' && end.col < PORT.sideMargin) {
        bad('INVALID_PORT', '/ports/' + key + '/col',
          label + '开口与左外墙至少隔 ' + PORT.sideMargin + ' 格');
      }
      if (purpose === 'publish' && end.col + PORT.openingCols > cols - PORT.sideMargin) {
        bad('INVALID_PORT', '/ports/' + key + '/col',
          label + '开口与右外墙至少隔 ' + PORT.sideMargin + ' 格');
      }
    });
    void rows;
  }

  function validateSpawn(spawn, cols, rows, kind, purpose, add, bad, need) {
    var required = kind === 'normal';
    if (spawn === null || spawn === undefined) {
      need(!required, 'INVALID_FIELD', '/spawn', '普通层必须有出生点 spawn');
      return;
    }
    if (!isPlainObject(spawn) || !isInt(spawn.col) || !isInt(spawn.row)) {
      bad('INVALID_FIELD', '/spawn', 'spawn 必须是 {col, row} 整数');
      return;
    }
    if (spawn.col < 0 || spawn.col >= cols || spawn.row < 0 || spawn.row >= rows) {
      need(false, 'INVALID_FIELD', '/spawn',
        '出生点 (' + spawn.col + ',' + spawn.row + ') 在 ' + cols + '×' + rows + ' 的地图外');
    }
    void add;
  }

  function validatePath(p, i, cols, rows, purpose, pathById, add, bad, need) {
    var at = '/paths/' + i;
    if (!isPlainObject(p)) {
      bad('INVALID_FIELD', at, '路径必须是对象');
      return;
    }
    var id = typeof p.id === 'string' ? p.id.trim() : '';
    if (!id) {
      bad('INVALID_FIELD', at + '/id', '路径必须有非空 id');
    } else if (id.length > L.ID || !ID_RE.test(id)) {
      bad('INVALID_FIELD', at + '/id', '路径 id 只能用字母、数字、下划线、短横线');
    } else if (pathById[id]) {
      bad('INVALID_FIELD', at + '/id', '路径 id "' + id + '" 重复');
    } else {
      pathById[id] = { path: p, index: i };
    }
    if (MODES.indexOf(p.mode) < 0) {
      bad('INVALID_FIELD', at + '/mode', 'mode 必须是 ' + MODES.join(' / '));
    }
    var pts = p.points;
    if (!Array.isArray(pts)) {
      bad('INVALID_FIELD', at + '/points', 'points 必须是数组');
      return;
    }
    if (pts.length < 2) {
      need(false, 'INVALID_FIELD', at + '/points', '路径至少要两个不同的点');
    }
    for (var j = 0; j < pts.length; j++) {
      var pt = pts[j];
      if (!isPlainObject(pt) || !isInt(pt.col) || !isInt(pt.row)) {
        bad('INVALID_FIELD', at + '/points/' + j, '路径点必须是 {col, row} 整数');
        continue;
      }
      if (pt.col < 0 || pt.col >= cols || pt.row < 0 || pt.row >= rows) {
        need(false, 'INVALID_FIELD', at + '/points/' + j,
          '路径点 (' + pt.col + ',' + pt.row + ') 在地图外');
      }
      if (j > 0 && pts[j - 1] && isInt(pts[j - 1].col) && isInt(pts[j - 1].row) &&
        pts[j - 1].col === pt.col && pts[j - 1].row === pt.row) {
        need(false, 'INVALID_FIELD', at + '/points/' + j,
          '路径相邻两点重复(零长度段)');
      }
    }
    if (purpose === 'publish' && pts.length >= 2 && isInt(pts[0].col) && isInt(pts[0].row)) {
      var last = pts[pts.length - 1];
      if (p.mode === 'loop' && isInt(last.col) && isInt(last.row) &&
        last.col === pts[0].col && last.row === pts[0].row) {
        bad('INVALID_FIELD', at + '/points', 'loop 路径不该把首点再写一遍当尾点');
      }
    }
    void add;
  }

  function validateObject(o, i, cols, rows, purpose, pathById, registry, seenIds, add, bad, need) {
    var at = '/objects/' + i;
    if (!isPlainObject(o)) {
      bad('INVALID_FIELD', at, '对象必须是 JSON 对象');
      return;
    }
    var id = typeof o.id === 'string' ? o.id.trim() : '';
    if (!id) {
      bad('INVALID_FIELD', at + '/id', '对象必须有非空 id');
    } else if (id.length > L.ID || !ID_RE.test(id)) {
      bad('INVALID_FIELD', at + '/id', '对象 id 只能用字母、数字、下划线、短横线');
    } else if (seenIds[id]) {
      bad('INVALID_FIELD', at + '/id', '对象 id "' + id + '" 在同一层里重复');
    }
    seenIds[id] = true;

    var type = typeof o.type === 'string' ? o.type.trim() : '';
    if (!type) {
      bad('INVALID_FIELD', at + '/type', '对象必须有 type');
    } else if (!registry || !registry.has(type)) {
      need(false, 'UNKNOWN_ENTITY', at + '/type',
        '未注册的对象类型 "' + type + '"(草稿可以保留,试玩/发布必须换成已支持的类型)');
    } else {
      var info = registry.get(type);
      var params = isPlainObject(o.params) ? o.params : {};
      if (!isPlainObject(o.params)) {
        bad('INVALID_FIELD', at + '/params', 'params 必须是对象');
      }
      var known = dict();
      info.params.forEach(function (p) {
        known[p.name] = p;
        if (params[p.name] === undefined) {
          if (!p.optional) {
            need(false, 'INVALID_FIELD', at + '/params/' + p.name,
              '缺少必填参数 "' + p.label + '"(默认 ' + p.def + (p.unit ? ' ' + p.unit : '') + ')');
          }
          return;
        }
        var v = params[p.name];
        if (typeof v !== 'number' || !isFinite(v)) {
          need(false, 'INVALID_FIELD', at + '/params/' + p.name,
            '参数 "' + p.label + '" 必须是数字');
        } else if (v < p.min || v > p.max) {
          need(false, 'INVALID_FIELD', at + '/params/' + p.name,
            '参数 "' + p.label + '" 必须在 ' + p.min + '~' + p.max +
            (p.unit ? ' ' + p.unit : '') + ' 之间(现在是 ' + v + ')');
        }
      });
      Object.keys(params).forEach(function (k) {
        if (known[k]) return;
        need(false, 'UNKNOWN_PARAM', at + '/params/' + k,
          '对象类型 "' + type + '" 没有注册参数 "' + k + '"(不能静默忽略)');
      });
      if (info.requiresPath) {
        need(!!o.pathId, 'INVALID_FIELD', at + '/pathId',
          '"' + info.name + '" 必须引用一条路径(pathId)');
      }
    }

    var posOk = isInt(o.col) && isInt(o.row);
    if (!posOk) {
      bad('INVALID_FIELD', at, '对象位置必须是 {col, row} 整数');
    } else if (o.col < 0 || o.col >= cols || o.row < 0 || o.row >= rows) {
      need(false, 'INVALID_FIELD', at,
        '对象在 (' + o.col + ',' + o.row + '),超出 ' + cols + '×' + rows + ' 的地图');
    }

    if (o.pathId !== null && o.pathId !== undefined) {
      if (typeof o.pathId !== 'string' || !o.pathId.trim()) {
        bad('INVALID_FIELD', at + '/pathId', 'pathId 必须是路径 id 或 null');
      } else if (!pathById[o.pathId]) {
        bad('BROKEN_REFERENCE', at + '/pathId',
          '引用了不存在的路径 "' + o.pathId + '"');
      } else {
        var path = pathById[o.pathId].path;
        var first = path && path.points && path.points[0];
        if (first && isInt(first.col) && isInt(first.row) &&
          posOk && (first.col !== o.col || first.row !== o.row)) {
          need(false, 'INVALID_FIELD', at,
            '对象的初始格必须等于路径首点 (' + first.col + ',' + first.row + ')');
        }
        if (purpose === 'publish') {
          checkPathInsideForbidden(path, cols, rows, at, add);
        }
      }
    }
    void add;
  }

  function checkPathInsideForbidden(path, cols, rows, at, add) {
    // 接口保护区禁止路径穿过(接口 v1 提案):上 SAFE_ROWS 行与下 SAFE_ROWS 行
    if (!path || !Array.isArray(path.points)) return;
    path.points.forEach(function (pt, j) {
      if (!isInt(pt.row)) return;
      if (pt.row < PORT.safeRows || pt.row >= rows - PORT.safeRows) {
        add('INVALID_PORT', at + '/pathId',
          '路径第 ' + (j + 1) + ' 个点落在接口安全保护带里(' + pt.col + ',' + pt.row + ')', 'error');
      }
    });
    void cols;
  }

  function validateVisuals(visuals, cols, rows, purpose, registry, add, bad, need, warn) {
    if (!isPlainObject(visuals)) {
      bad('INVALID_FIELD', '/visuals', 'visuals 必须是对象');
      return;
    }
    var knownBackgrounds = registry ? registry.backgroundIds() : null;
    if (visuals.backgroundId !== null && visuals.backgroundId !== undefined) {
      if (typeof visuals.backgroundId !== 'string' || !ASSET_RE.test(visuals.backgroundId)) {
        bad('INVALID_FIELD', '/visuals/backgroundId', 'backgroundId 必须是内置资源 id 或 null');
      } else if (knownBackgrounds && knownBackgrounds.indexOf(visuals.backgroundId) < 0) {
        if (purpose === 'publish') {
          bad('MISSING_ASSET', '/visuals/backgroundId',
            '背景资源 "' + visuals.backgroundId + '" 不是首版内置资源(' +
            knownBackgrounds.join(', ') + ' 或 null=自动)');
        } else {
          warn('MISSING_ASSET', '/visuals/backgroundId',
            '背景资源 "' + visuals.backgroundId + '" 不是内置资源,会显示占位');
        }
      }
    }
    var decos = visuals.decorations;
    if (!Array.isArray(decos)) {
      bad('INVALID_FIELD', '/visuals/decorations', 'decorations 必须是数组');
      return;
    }
    if (decos.length > L.DECORATIONS) {
      bad('LIMIT_EXCEEDED', '/visuals/decorations', '装饰数超过上限 ' + L.DECORATIONS);
    }
    var seen = dict();
    decos.forEach(function (d, i) {
      var at = '/visuals/decorations/' + i;
      if (!isPlainObject(d)) { bad('INVALID_FIELD', at, '装饰必须是对象'); return; }
      var id = typeof d.id === 'string' ? d.id.trim() : '';
      if (!id) bad('INVALID_FIELD', at + '/id', '装饰必须有 id');
      else if (id.length > L.ID || !ID_RE.test(id)) bad('INVALID_FIELD', at + '/id', '装饰 id 只能用字母、数字、下划线、短横线');
      else if (seen[id]) bad('INVALID_FIELD', at + '/id', '装饰 id 重复');
      seen[id] = true;
      if (typeof d.assetId !== 'string' || !d.assetId.trim() || !ASSET_RE.test(d.assetId)) {
        bad('MISSING_ASSET', at + '/assetId', '装饰必须有稳定资源 id');
      } else if (d.assetId.length > L.STR) {
        bad('LIMIT_EXCEEDED', at + '/assetId', '资源 id 太长');
      }
      if (!isInt(d.col) || !isInt(d.row)) {
        bad('INVALID_FIELD', at, '装饰位置必须是 {col, row} 整数');
      } else if (d.col < 0 || d.col >= cols || d.row < 0 || d.row >= rows) {
        need(false, 'INVALID_FIELD', at, '装饰在地图外');
      }
      if (d.layer !== 'back' && d.layer !== 'front') {
        bad('INVALID_FIELD', at + '/layer', 'layer 必须是 back / front');
      }
    });
    void rows;
  }

  function validateCertification(data, opts, purpose, actualHash, add, bad, warn) {
    var cert = data.certification;
    var certBad = purpose === 'publish' ? bad : warn;
    if (!isPlainObject(cert)) {
      certBad('INVALID_FIELD', '/certification', 'certification 必须是对象或 null');
      return;
    }
    if (typeof cert.contentHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(cert.contentHash)) {
      certBad('INVALID_FIELD', '/certification/contentHash', '认证缺少合法的 contentHash');
    } else if (actualHash && cert.contentHash !== actualHash) {
      certBad('HASH_MISMATCH', '/certification/contentHash',
        '认证绑定的内容 hash 和当前内容不一致(改图后认证必须失效)');
    }
    if (cert.status !== 'passed') {
      certBad('CERT_REQUIRED', '/certification/status', '认证状态必须是 passed');
    }
    if (cert.profileId !== 'standard-v1') {
      certBad('CERT_REQUIRED', '/certification/profileId', '认证必须使用 standard-v1 标准试玩');
    }
    var sources = ['local-playtest', 'imported-declaration'];
    if (sources.indexOf(cert.source) < 0) {
      certBad('INVALID_FIELD', '/certification/source', '认证来源必须是 ' + sources.join(' / '));
    }
    if (typeof cert.completedAt !== 'string' || !cert.completedAt.trim()) {
      certBad('INVALID_FIELD', '/certification/completedAt', '认证必须记录完成时间');
    }
    var rules = opts.rules || null;
    if (purpose === 'publish') {
      if (!rules) {
        bad('RULES_MISMATCH', '/certification',
          '发布校验必须带上当前 rulesVersion / rulesFingerprint,不能只信认证字段');
      } else {
        if (cert.rulesVersion !== rules.rulesVersion) {
          bad('RULES_MISMATCH', '/certification/rulesVersion',
            '认证的规则版本 "' + cert.rulesVersion + '" 和当前 "' + rules.rulesVersion + '" 不一致');
        }
        if (cert.rulesFingerprint !== rules.rulesFingerprint) {
          bad('RULES_MISMATCH', '/certification/rulesFingerprint',
            '认证的规则指纹和当前玩法常量不一致');
        }
      }
    }
    void add;
  }

  // ===================== 编码 =====================
  /**
   * 输出"即将写进文件的那一份"字段(不含派生 hash / 认证),再对它做草稿级校验。
   * 先构造再校验而不是直接校验入参:入参里的 contentHash / certification 是派生值,
   * 编辑后本来就会过期;encode 的职责是重算 hash,不该因为"旧 hash 过期"而拒绝保存。
   * 输出字段顺序固定(方便人读),但 contentHash 建立在规范化文本上,和字段顺序无关。
   * 认证已失效(绑定的 hash 与当前内容不同)时,输出里移除认证并给出 warning,
   * 避免产生"看起来有认证"的文件。
   */
  function encode(data) {
    if (!isPlainObject(data)) {
      return fail('INVALID_FIELD', 'LevelData 必须是对象', [
        issue('INVALID_FIELD', '', '不是对象')
      ]);
    }
    var warnings = [];
    var out;
    try {
      out = {
        schemaVersion: SCHEMA_VERSION,
        id: data.id,
        title: data.title,
        kind: data.kind,
        difficulty: data.difficulty === undefined ? null : data.difficulty,
        size: isPlainObject(data.size) ? { cols: data.size.cols, rows: data.size.rows } : data.size,
        terrain: isPlainObject(data.terrain) ? { tiles: data.terrain.tiles } : data.terrain,
        ports: data.ports === undefined ? null : data.ports,
        spawn: data.spawn === undefined ? null : data.spawn,
        objects: data.objects || [],
        paths: data.paths || [],
        visuals: {
          backgroundId: data.visuals && data.visuals.backgroundId !== undefined
            ? data.visuals.backgroundId : null,
          decorations: data.visuals && data.visuals.decorations || []
        },
        extensions: data.extensions || {},
        contentHash: null,
        certification: null
      };
      out = jsonClone(out, '');
    } catch (e2) {
      return fail('INVALID_FIELD', '数据里有不能序列化的值:' + (e2 && e2.message), [
        issue('INVALID_FIELD', e2.dataPath || '', e2.message)
      ]);
    }
    var issues;
    try {
      issues = validate(out, { purpose: 'draft' });
    } catch (e3) {
      return fail('INVALID_FIELD', '校验时出错:' + (e3 && e3.message), []);
    }
    var errs = errorsOf(issues);
    if (errs.length) {
      return fail('INVALID_FIELD',
        '这份关卡还有 ' + errs.length + ' 个结构问题,不能序列化(先修好再保存)', errs);
    }
    var h = hashSync(out);
    out.contentHash = h;
    if (data.certification) {
      if (data.certification.contentHash === h) {
        out.certification = jsonClone(data.certification, '/certification');
      } else {
        warnings.push('内容变了,原认证已失效并从输出里移除(需要重新标准试玩)');
      }
    }
    var text = pretty(out) + '\n';
    return ok(text, { warnings: warnings, contentHash: h });
  }

  // ===================== 汇总(工具/报告用) =====================
  function summarize(data) {
    var counts = { tiles: 0, solid: 0, oneway: 0, objects: 0, paths: 0, decorations: 0 };
    var byType = dict();
    var tiles = data.terrain && data.terrain.tiles || [];
    tiles.forEach(function (row) {
      row.forEach(function (v) {
        counts.tiles++;
        if (v === 5) counts.oneway++;
        else if (v >= 1 && v <= 4) counts.solid++;
      });
    });
    (data.objects || []).forEach(function (o) {
      counts.objects++;
      byType[o.type] = (byType[o.type] || 0) + 1;
    });
    counts.paths = (data.paths || []).length;
    counts.pathPoints = (data.paths || []).reduce(function (n, p) {
      return n + (p.points ? p.points.length : 0);
    }, 0);
    counts.decorations = data.visuals && Array.isArray(data.visuals.decorations)
      ? data.visuals.decorations.length : 0;
    return {
      id: data.id, title: data.title, kind: data.kind, difficulty: data.difficulty,
      cols: data.size ? data.size.cols : 0, rows: data.size ? data.size.rows : 0,
      counts: counts, objectsByType: byType,
      hasPorts: !!data.ports, hasSpawn: !!data.spawn,
      contentHash: data.contentHash || null
    };
  }

  // ===================== 地块字典查询 =====================
  function charOf(id) {
    return Object.prototype.hasOwnProperty.call(TILE_TO_CHAR, id) ? TILE_TO_CHAR[id] : null;
  }

  function idOf(ch) {
    return Object.prototype.hasOwnProperty.call(CHAR_TO_TILE, ch) ? CHAR_TO_TILE[ch] : null;
  }

  function tileInfo(id) {
    for (var i = 0; i < TILES.length; i++) if (TILES[i].id === id) return TILES[i];
    return null;
  }

  RA.LevelData = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    KINDS: KINDS.slice(),
    MODES: MODES.slice(),
    LIMITS: L,
    PORT: PORT,
    TILES: TILES.map(function (t) { return { id: t.id, ch: t.ch, name: t.name, solid: t.solid, oneway: t.oneway }; }),
    charOf: charOf,
    idOf: idOf,
    tileInfo: tileInfo,
    isSolidId: function (id) { var t = tileInfo(id); return !!(t && t.solid); },
    isOnewayId: function (id) { var t = tileInfo(id); return !!(t && t.oneway); },

    decode: decode,
    validate: validate,
    encode: encode,
    hash: hash,
    hashSync: hashSync,
    sameContent: sameContent,
    canonical: canonical,
    pretty: pretty,
    contentOf: contentOf,
    summarize: summarize,
    sha256Hex: sha256Hex,
    byteLength: byteLength,

    ok: ok,
    fail: fail,
    issue: issue,
    errorsOf: errorsOf,
    warningsOf: warningsOf
  };
  // docs/design/data-and-interfaces.md 里的名字
  RA.LevelCodec = RA.LevelData;
})(globalThis.RA = globalThis.RA || {});
