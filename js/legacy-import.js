/* -*- coding: utf-8 -*- */
/*
 * legacy-import.js —— 旧地图(asc / TXT / 旧 JSON)一次性迁移成 v2 草稿
 * ==================================================================
 * 输入是**只读**的:这里只把老格式读成新 LevelData,绝不写回、不裁剪、不缩放,
 * 也不继承旧的 verified(那只是历史字段,不是人工通关认证)。
 *
 * 映射规则(docs/design/data-and-interfaces.md 第 7 节):
 *   · 地形字符 → 整数网格: '+'/空格 = 0, '^' = 1, '_' = 2, '~' = 3, '=' = 4, '-' = 5;
 *     老地图的 '.' 当空气(0);不认识的字符也按空气(0),但会逐个记录警告,不静默丢。
 *   · 'P' → spawn(第一个为准),'G' → 旧出口位置,记进 extensions.legacy.exit;
 *   · 'S' → spring 对象,'x' → crumble_door,'y' → blink_platform(与新注册表同名);
 *   · json 里的 objects[] 原样保留:类型映射(fireball → fireball_static)、
 *     必填参数按注册默认补全、未知类型/参数保留并警告;
 *   · sky → visuals.backgroundId('sky3'),0/缺失 → null(按层循环);
 *   · difficulty / verified 等原值记进 extensions.legacy,可见但不冒充认证;
 *   · ports 一律 null:旧图的出入口没有按 vertical-v1 的开口与安全带绘制,
 *     不能自动贴一个"合格"标签。修复和端口可视化在 T04。
 *
 * 之所以不在这里生成 ports,也不自动裁掉越界的对象:迁移只负责保真搬运,
 * 判定合格与否交给 LevelData.validate({purpose:'play'|'publish'})。
 */
(function (RA) {
  'use strict';

  var LD = RA.LevelData;

  var GOAL_CHAR = 'G';
  var LEGACY_EMPTY = RA.LEGACY_EMPTY || '.';
  var EMPTY_CHARS = RA.EMPTY_CHARS || '+ ';
  // 旧数据里出现过的对象类型名 → 首版注册名(旧图目前没有对象,留着兼容手写的旧文件)
  var LEGACY_TYPE = Object.create(null);
  LEGACY_TYPE.fireball = 'fireball_static';

  function cleanId(raw) {
    return String(raw == null ? '' : raw).trim().replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, LD.LIMITS.ID);
  }

  function sanitizeId(raw, fallback) {
    var id = cleanId(raw);
    var changed = false;
    if (!id) { id = cleanId(fallback) || 'imported'; changed = true; }
    return { id: id, changed: changed };
  }

  /**
   * 旧图 → v2 草稿。input 可以是:
   *   · 旧 JSON 对象 / JSON 文本(带 asc、difficulty、objects…)
   *   · 一整段地图文本(老 txt:注释行 + 字符画)
   * opts.id / opts.fallbackId 是文件名或调用方给的身份。
   * 返回 Result<{draft, warnings}>。
   */
  function migrate(input, opts) {
    opts = opts || {};
    var warnings = [];
    var data = RA.Level && RA.Level.dataOf ? RA.Level.dataOf(input, opts.id || opts.fallbackId) : null;
    if (!data) {
      return LD.fail('INVALID_JSON', '这份旧数据既不是 json 也不是地图文本', [
        LD.issue('INVALID_JSON', '', '读不出旧图内容')
      ]);
    }
    if (input === null || input === undefined || input === '') {
      return LD.fail('INVALID_JSON', '旧图是空的', []);
    }

    var meta = RA.Level.parseComments(data.asc);
    var fallback = opts.fallbackId || opts.id || 'imported';
    var sane = sanitizeId(data.id || opts.id, fallback);
    var id = sane.id;
    if (sane.changed) warnings.push('旧 id 不能直接当新 id,已规范成 "' + id + '"');

    var title = String(meta.name || data.title || id).replace(/\s+/g, ' ').trim() || id;
    if (title.length > LD.LIMITS.TITLE) {
      title = title.slice(0, LD.LIMITS.TITLE);
      warnings.push('显示名超过 ' + LD.LIMITS.TITLE + ' 个字符,已截断(原值请从原文件保留)');
    }

    var lines = RA.Level.normalizeRows(data.asc, false);
    var rowCount = lines.length;
    if (!rowCount || !lines[0]) {
      return LD.fail('INVALID_JSON', '这张旧图一行地形都没有', [
        LD.issue('INVALID_JSON', '/terrain', '空地图')
      ]);
    }
    var colCount = lines[0].length;
    if (rowCount > LD.LIMITS.ROWS || colCount > LD.LIMITS.COLS) {
      return LD.fail('LIMIT_EXCEEDED',
        '旧图 ' + colCount + '×' + rowCount + ' 超出新格式上限 ' +
        LD.LIMITS.COLS + '×' + LD.LIMITS.ROWS + '(不自动裁剪,请先分拆或调整)', []);
    }

    var tiles = [];
    var objects = [];
    var spawn = null;
    var exitPos = null;
    var unknownChars = [];
    var legacyDots = 0;
    var unknownObjects = [];

    function pushObject(rec) {
      var used = Object.create(null);
      objects.forEach(function (o) { used[o.id] = true; });
      var base = cleanId(rec.id) || ('obj_' + (objects.length + 1));
      var oid = base;
      var n = 2;
      while (used[oid]) { oid = base + '_' + n; n++; }
      rec.id = oid;
      objects.push(rec);
    }

    for (var r = 0; r < rowCount; r++) {
      var line = lines[r];
      var row = [];
      for (var c = 0; c < colCount; c++) {
        var ch = line.charAt(c);
        var tile = null;
        if (ch === ' ' || EMPTY_CHARS.indexOf(ch) >= 0) {
          tile = 0;
        } else if (ch === LEGACY_EMPTY) {
          tile = 0;
          legacyDots++;
        } else if (LD.idOf(ch) !== null) {
          tile = LD.idOf(ch);
        } else if ((RA.SPAWN_CHARS || 'P').indexOf(ch) >= 0) {
          tile = 0;
          if (!spawn) spawn = { col: c, row: r };
          else warnings.push('第 ' + (r + 1) + ' 行第 ' + (c + 1) + ' 列还有第二个出生点,已忽略');
        } else if (ch === GOAL_CHAR) {
          tile = 0;
          if (!exitPos) exitPos = { col: c, row: r };
          else warnings.push('第 ' + (r + 1) + ' 行第 ' + (c + 1) + ' 列还有第二个出口标记 G,已忽略');
        } else {
          var type = RA.EntityRegistry ? RA.EntityRegistry.typeOfLetter(ch) : null;
          if (type) {
            tile = 0;
            pushObject({
              id: 'obj_' + (objects.length + 1),
              type: type,
              col: c,
              row: r,
              params: defaultParams(type),
              pathId: null
            });
          } else if (RA.BY_LETTER && RA.BY_LETTER[ch]) {
            // 旧引擎认识、但首版注册表还没收录的字符:保留成待处理对象(草稿可存、试玩报错)
            tile = 0;
            pushObject({
              id: 'obj_' + (objects.length + 1),
              type: 'legacy_entity_' + ch,
              col: c,
              row: r,
              params: {},
              pathId: null
            });
            unknownObjects.push({ ch: ch, col: c, row: r });
          } else {
            tile = 0;
            unknownChars.push({ ch: ch, col: c, row: r });
          }
        }
        row.push(tile);
      }
      tiles.push(row);
    }

    // ---- 旧 json 的 objects[] ----
    (Array.isArray(data.objects) ? data.objects : []).forEach(function (o, i) {
      if (!o || typeof o !== 'object') {
        warnings.push('objects[' + i + '] 不是对象,已跳过');
        return;
      }
      var oldType = typeof o.type === 'string' ? o.type.trim() : '';
      if (!oldType) {
        warnings.push('objects[' + i + '] 没有 type,已跳过');
        return;
      }
      var type = LEGACY_TYPE[oldType] || oldType;
      if (type !== oldType) {
        warnings.push('objects[' + i + '] 的旧类型 "' + oldType + '" 映射为 "' + type + '"');
      }
      var params = {};
      var defaults = defaultParams(type);
      if (defaults) Object.keys(defaults).forEach(function (k) { params[k] = defaults[k]; });
      if (o.params && typeof o.params === 'object' && !Array.isArray(o.params)) {
        Object.keys(o.params).forEach(function (k) { params[k] = o.params[k]; });
      } else if (o.params !== undefined) {
        warnings.push('objects[' + i + '] 的 params 不是对象,已按空对象处理');
      }
      if (o.pathId !== undefined && o.pathId !== null) {
        warnings.push('objects[' + i + '] 引用了旧数据里不存在的路径 "' + o.pathId + '",已移除引用');
      }
      pushObject({
        id: o.id || ('obj_' + (i + 1)),
        type: type,
        col: o.col,
        row: o.row,
        params: params,
        pathId: null
      });
      if (RA.EntityRegistry && !RA.EntityRegistry.has(type)) {
        unknownObjects.push({ type: type, col: o.col, row: o.row });
      }
    });

    // ---- 尺寸 / 背景 / 难度 ----
    var declared = data.size && typeof data.size === 'object' ? data.size : null;
    if (!declared) {
      warnings.push('旧图没有 size,按地图实际尺寸 ' + colCount + '×' + rowCount + ' 迁移');
    } else if (declared.cols !== colCount || declared.rows !== rowCount) {
      warnings.push('旧图 size 写的是 ' + declared.cols + '×' + declared.rows +
        ',实际是 ' + colCount + '×' + rowCount + '(以地图为准,未裁剪)');
    }

    var sky = parseInt(data.sky, 10);
    var skyIds = RA.EntityRegistry ? RA.EntityRegistry.backgroundIds() : [];
    var backgroundId = null;
    if (!isNaN(sky) && sky > 0) {
      backgroundId = 'sky' + sky;
      if (skyIds.length && skyIds.indexOf(backgroundId) < 0) {
        warnings.push('旧图 sky:' + sky + ' 超出内置天空数量,改成"按层循环"(null)');
        backgroundId = null;
      }
    }

    var difficulty = null;
    if (data.difficulty !== undefined && data.difficulty !== null) {
      var d = parseInt(data.difficulty, 10);
      if (!isNaN(d) && d >= 1 && d <= 4) difficulty = d;
      else warnings.push('旧图 difficulty=' + JSON.stringify(data.difficulty) +
        ' 不是 1~4,已置空(草稿需要作者补填)');
    } else {
      warnings.push('旧图没有 difficulty,已置空(旧引擎默认按 1 处理;新格式要求作者明确 1~4)');
    }

    if (legacyDots) warnings.push('有 ' + legacyDots + " 处老的 '.' 空气标记,已按空气迁移");
    if (unknownChars.length) {
      warnings.push('有 ' + unknownChars.length + ' 个不认识的字符,已按空气迁移(位置记在 extensions.legacy.unknownChars)');
    }
    if (unknownObjects.length) {
      warnings.push('有 ' + unknownObjects.length + ' 个首版未支持的对象/实体,已保留为待处理对象(草稿可存,试玩/发布会报错)');
    }
    if (exitPos) {
      warnings.push('旧出口 G 在 (' + exitPos.col + ',' + exitPos.row +
        ');新格式的出口是顶边接口,ports 留空需要作者修复');
    } else {
      warnings.push('旧图没有出口标记 G;ports 留空需要作者修复');
    }
    if (!spawn) {
      warnings.push('旧图没有出生点 P;spawn 留空需要作者补上');
    }

    var extensions = {
      legacy: {
        sourceFormat: 'asc-v1',
        sky: isNaN(sky) ? 0 : sky,
        verified: !!data.verified,          // 只是旧字段,不是认证
        exit: exitPos,
        entry: spawn,
        proposedPorts: (spawn && exitPos) ? {
          profile: 'vertical-v1',
          entry: { col: spawn.col },
          exit: { col: exitPos.col }
        } : null,
        declaredSize: declared ? { cols: declared.cols, rows: declared.rows } : null,
        unknownChars: unknownChars.slice(0, 64),
        legacyEntities: unknownObjects.slice(0, 64)
      }
    };
    if (data.verified !== undefined) {
      warnings.push('旧 verified=' + JSON.stringify(data.verified) +
        ' 不继承为认证;需要重新标准试玩后才谈发布');
    }

    var draft = {
      schemaVersion: LD.SCHEMA_VERSION,
      id: id,
      title: title,
      kind: 'normal',
      difficulty: difficulty,
      size: { cols: colCount, rows: rowCount },
      terrain: { tiles: tiles },
      ports: null,
      spawn: spawn,
      objects: objects,
      paths: [],
      visuals: { backgroundId: backgroundId, decorations: [] },
      extensions: extensions,
      contentHash: null,
      certification: null
    };

    return LD.ok({ draft: draft, warnings: warnings });
  }

  /** 注册表里必填参数的默认值;类型未知返回 null */
  function defaultParams(type) {
    if (!RA.EntityRegistry || !RA.EntityRegistry.has(type)) return null;
    return RA.EntityRegistry.defaults(type);
  }

  RA.LegacyImport = {
    migrate: migrate,
    LEGACY_TYPE: LEGACY_TYPE,
    cleanId: cleanId
  };
})(globalThis.RA = globalThis.RA || {});
