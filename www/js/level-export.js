/* -*- coding: utf-8 -*- */
/*
 * level-export.js —— 41:已通过关卡的浏览器/本地导出
 * =================================================
 * 纯候选判定与目录写入分开：
 *   - 候选必须是 normal、难度1..4、certState 当前 hash 通过、可读、encode 保真；
 *   - 批量读已保存的 published + drafts 快照，按 id/hash 去重；
 *   - 本地写入由用户选择的 FileSystemDirectoryHandle 完成，JSON 与 levels.js
 *     都用 js/normal-catalog.js 的共享编译器；不删除、不改认证、不写 epoch。
 * 无目录 API 时只生成 bundle 下载，并明确“尚未写入 levels”。
 */
(function (RA) {
  'use strict';
  var LD = RA.LevelData;
  var TS = RA.C.TS;

  function ok(value) { return { ok: true, value: value }; }
  function fail(code, message, issues) {
    return { ok: false, error: { code: code, message: message, issues: issues || [] } };
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function validDifficulty(d) { return Number.isInteger(d) && d >= 1 && d <= 4; }
  function currentEpoch() { return String((RA.FULL40 && RA.FULL40.poolEpoch) || ''); }

  function candidate(data, opts) {
    opts = opts || {};
    if (!data || data.kind !== 'normal') return fail('NOT_NORMAL', '只有普通关卡能导出到正式池');
    if (!validDifficulty(data.difficulty)) return fail('INVALID_DIFFICULTY', '导出前先选择 1–4 档难度');
    var hash = LD.hashSync(data);
    var cert = data.certification;
    var state = RA.ContentRepository && RA.ContentRepository.certState
      ? RA.ContentRepository.certState(data, hash, RA.RULES) : { ok: false, reason: '无通过判定' };
    if (!state.ok) return fail('CERT_REQUIRED', '当前内容没有有效人工通过:' + (state.reason || '未通过'));
    var read = LD.readableIssues ? LD.readableIssues(data)
      : LD.errorsOf(LD.validate(data, { purpose: 'load' }));
    if (read.length) return fail(read[0].code, '内容读取失败:' + read[0].path + ' ' + read[0].message, read);
    var enc = LD.encode(data);
    if (!enc.ok) return fail(enc.error.code, '内容编码失败:' + enc.error.message, enc.error.issues || []);
    return ok({
      levelId: data.id, contentHash: hash, difficulty: data.difficulty,
      data: clone(data), text: enc.value, source: opts.source || 'current',
      draftId: opts.draftId || null, revision: opts.revision === undefined ? null : opts.revision
    });
  }

  function current(data, meta) { return candidate(data, Object.assign({ source: 'current' }, meta || {})); }

  async function list(repo) {
    if (!repo) return fail('NO_REPO', '当前环境没有草稿/发布库');
    var entries = [], skipped = [], dup = 0, seen = {};
    function add(c, source) {
      if (!c.ok) { skipped.push({ source: source, levelId: c.error && c.error.message, reason: c.error ? c.error.reason || c.error.message : '不合格' }); return; }
      var key = c.value.levelId + '\u0000' + c.value.contentHash;
      if (seen[key]) { dup++; skipped.push({ source: source, levelId: c.value.levelId, contentHash: c.value.contentHash, reason: '同 id/hash 已去重' }); return; }
      seen[key] = true;
      entries.push(c.value);
    }
    var pub = await repo.listEligible();
    if (!pub.ok) return pub;
    var epoch = currentEpoch();
    (pub.value || []).forEach(function (r) {
      if (r.poolEpoch && epoch && r.poolEpoch !== epoch) {
        skipped.push({ source: 'published', levelId: r.levelId, contentHash: r.contentHash, reason: '旧池版本不复活' });
        return;
      }
      add(candidate(r.data, { source: 'published', revision: r.revision }), 'published');
    });
    var drafts = await repo.listDrafts();
    if (!drafts.ok) return drafts;
    for (var i = 0; i < (drafts.value || []).length; i++) {
      var m = drafts.value[i];
      var d = await repo.loadDraft(m.draftId);
      if (!d.ok) { skipped.push({ source: 'draft', levelId: m.draftId, reason: d.error.message }); continue; }
      if (!d.value) { skipped.push({ source: 'draft', levelId: m.draftId, reason: '草稿读取为空' }); continue; }
      add(candidate(d.value.data, { source: 'draft', draftId: m.draftId, revision: d.value.revision }), 'draft');
    }
    entries.sort(function (a, b) { return (a.levelId + a.contentHash).localeCompare(b.levelId + b.contentHash); });
    return ok({ entries: entries, skipped: skipped, duplicates: dup });
  }

  function fileName(c) {
    return 'level-' + c.levelId + '__' + String(c.contentHash).replace(/^sha256:/, '') + '.json';
  }

  async function readTree(root) {
    // 读取 levels/normal 四档 JSON 与 levels.js；只读，不写。
    var files = [];
    for (var d = 1; d <= 4; d++) {
      var dir;
      try { dir = await root.getDirectoryHandle('normal', { create: false }); }
      catch (e) { return fail('NOT_LEVELS_DIR', '所选目录缺少 normal/'); }
      var sub;
      try { sub = await dir.getDirectoryHandle('difficulty-' + d, { create: true }); }
      catch (e) { sub = null; }
      if (!sub) continue;
      for await (var entry of sub.values()) {
        if (!entry || entry.kind !== 'file' || !/\.json$/i.test(entry.name)) continue;
        var f = await entry.getFile();
        files.push({ path: 'normal/difficulty-' + d + '/' + entry.name, text: await f.text() });
      }
    }
    return ok(files);
  }

  async function writeTextFile(dir, name, text) {
    var fh = await dir.getFileHandle(name, { create: true });
    var w = await fh.createWritable();
    try { await w.write(text); await w.close(); } catch (e) { try { await w.abort(); } catch (e2) { /* ignore */ } throw e; }
    var back = await (await fh.getFile()).text();
    if (back !== text) throw new Error('写回校验失败:' + name);
  }

  async function writeDirectory(root, candidates) {
    var tree = await readTree(root);
    if (!tree.ok) return tree;
    var files = tree.value.slice();
    var added = [], skipped = [];
    var byPath = {};
    var pre = RA.NormalCatalog.compile(files);
    if (!pre.ok) return fail('CATALOG_INVALID', '既有目录清单预检失败', pre.problems);
    var seen = {};
    pre.entries.forEach(function (e) { seen[e.levelId + '\u0000' + e.contentHash] = true; });
    files.forEach(function (f) { byPath[f.path] = f; });
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var ck = c.levelId + '\u0000' + c.contentHash;
      if (seen[ck]) { skipped.push({ levelId: c.levelId, contentHash: c.contentHash, reason: '同 id/hash 已存在(文件名可不同)' }); continue; }
      seen[ck] = true;
      var rel = 'normal/difficulty-' + c.difficulty + '/' + fileName(c);
      if (byPath[rel]) {
        if (byPath[rel].text === c.text) { skipped.push({ levelId: c.levelId, contentHash: c.contentHash, path: rel, reason: '同版本已存在' }); continue; }
        return fail('CONFLICT', '目标文件已存在且内容不同:' + rel);
      }
      files.push({ path: rel, text: c.text });
      byPath[rel] = { path: rel, text: c.text };
      added.push({ c: c, rel: rel });
    }
    var compiled = RA.NormalCatalog.compile(files);
    if (!compiled.ok) return fail('CATALOG_INVALID', '目录清单预检失败', compiled.problems);
    var written = [];
    try {
      for (var a = 0; a < added.length; a++) {
        var item = added[a];
        var parts = item.rel.split('/');
        var normal = await root.getDirectoryHandle('normal', { create: true });
        var sub = await normal.getDirectoryHandle(parts[1], { create: true });
        await writeTextFile(sub, parts[2], item.c.text);
        written.push(item.rel);
      }
      var levelText = RA.NormalCatalog.script(compiled.entries);
      await writeTextFile(root, 'levels.js', levelText);
    } catch (e) {
      return fail('WRITE_FAILED', '写入未完成:' + (e && e.message || e) + ';已写 ' + written.length + ' 个 JSON,清单未更新');
    }
    return ok({ written: written, skipped: skipped, entries: compiled.entries.length, levelScript: 'levels.js' });
  }

  function bundle(entries) {
    return {
      format: 'reverse-abyss-level-bundle-v1',
      createdAt: new Date().toISOString(),
      levels: entries.map(function (e) { return clone(e.data); })
    };
  }

  RA.LevelExport = {
    current: current,
    candidate: candidate,
    list: list,
    fileName: fileName,
    writeDirectory: writeDirectory,
    readTree: readTree,
    bundle: bundle
  };
})(globalThis.RA = globalThis.RA || {});
