/* -*- coding: utf-8 -*- */
/*
 * normal-catalog.js —— 普通关卡纯清单编译器(浏览器/Node 共用)
 * ==========================================================
 * 输入 [{path,text}]（path 形如 normal/difficulty-1/xxx.json），输出
 * {entries, script, skipped, problems}。不读文件/DOM/storage；调用方负责
 * 目录枚举与写入。通过判定仍走 ContentRepository.certState（人工 passed +
 * 内容 hash + readable/load），不按当前规则版本废旧通过，不跑几何/可达检查。
 */
(function (RA) {
  'use strict';
  var LD = RA.LevelData;
  var DIRS = [
    { dir: 'normal/difficulty-1', difficulty: 1 },
    { dir: 'normal/difficulty-2', difficulty: 2 },
    { dir: 'normal/difficulty-3', difficulty: 3 },
    { dir: 'normal/difficulty-4', difficulty: 4 }
  ];

  function compile(files) {
    var problems = [], skipped = [], entries = [], seen = {};
    (files || []).forEach(function (f) {
      var raw = String(f.path || '').replace(/\\/g, '/');
      var rel = raw.indexOf('levels/') === 0 ? raw.slice('levels/'.length) : raw;
      var dir = null;
      for (var i = 0; i < DIRS.length; i++) if (rel.indexOf(DIRS[i].dir + '/') === 0) dir = DIRS[i];
      if (!dir) return; // normal 四档以外不进入清单
      var data;
      try { data = JSON.parse(String(f.text == null ? '' : f.text)); }
      catch (e) { problems.push(rel + ': JSON 无法解析(' + e.message + ')'); return; }
      var read = LD.readableIssues ? LD.readableIssues(data)
        : LD.errorsOf(LD.validate(data, { purpose: 'load' }));
      if (read.length) {
        problems.push(rel + ': 读取检查失败 ' + read[0].code + ' ' + read[0].path + ' ' + read[0].message);
        return;
      }
      if (Number(data.difficulty) !== dir.difficulty || !Number.isInteger(data.difficulty)) {
        problems.push(rel + ': 目录 ' + dir.dir + ' 要求 difficulty=' + dir.difficulty +
          ',实际 ' + JSON.stringify(data.difficulty));
        return;
      }
      var hash = LD.hashSync(data);
      var pass = RA.ContentRepository && RA.ContentRepository.certState
        ? RA.ContentRepository.certState(data, hash, RA.RULES)
        : { ok: false, reason: '无通过判定' };
      if (!pass.ok) {
        skipped.push({ path: rel, reason: pass.reason || '未通过', levelId: data.id, contentHash: hash });
        return;
      }
      var key = String(data.id) + '\u0000' + hash;
      if (seen[key]) {
        skipped.push({ path: rel, reason: '同 id/hash 重复,已去重', levelId: data.id, contentHash: hash });
        return;
      }
      seen[key] = true;
      entries.push({ levelId: data.id, contentHash: hash, source: 'builtin', path: 'levels/' + rel,
        requiredDifficulty: dir.difficulty, data: data });
    });
    entries.sort(function (a, b) { return (a.levelId + a.contentHash).localeCompare(b.levelId + b.contentHash); });
    return { ok: problems.length === 0, entries: entries, skipped: skipped, problems: problems };
  }

  function script(entries) {
    return '/* -*- coding: utf-8 -*- */\n' +
      '/* 由 js/normal-catalog.js 从 levels/normal/difficulty-1..4 生成;不要手改。\n' +
      ' * 只包含有有效人工通过声明且当前内容可读取的普通图;fixed/fallback/archive 永不入池。\n' +
      ' * 改 JSON 后运行: node tools/sync_levels.mjs\n' +
      ' */\n' +
      '(function (RA) {\n  \'use strict\';\n  RA.NORMAL_LEVELS = ' +
      JSON.stringify(entries || []) + ';\n' +
      '  // 旧编辑器/旧页面读取的兼容别名;新正式入口只用 NORMAL_LEVELS。\n' +
      '  RA.LEVEL_DATA = {};\n  RA.LEVEL_TEXT = {};\n})(globalThis.RA = globalThis.RA || {});\n';
  }

  RA.NormalCatalog = { DIRS: DIRS, compile: compile, script: script };
})(globalThis.RA = globalThis.RA || {});
