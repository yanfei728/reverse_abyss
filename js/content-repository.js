/* -*- coding: utf-8 -*- */
/*
 * content-repository.js —— 浏览器草稿仓库(T02B)
 * =================================================
 * 只负责"名字 → 一份完整 LevelData + revision"的持久化,不发布、不碰旧关卡池。
 * 正式存储用 IndexedDB;没有 IndexedDB 时退回内存仓库(页面刷新会丢),并明确告诉 UI。
 *
 * 需要显式失败:
 *   · 校验/编码失败:返回原错误,不写;
 *   · revision 冲突:不覆盖另一窗口的草稿;
 *   · 写入失败:不清 dirty、不报成功。
 *
 * 保存内容 = 发起保存时的完整快照(encode 后的规范 JSON),保存期间继续编辑
 * 不会把新改动误标成已保存;由编辑器比较快照 hash 与当前内容决定 dirty。
 */
(function (RA) {
  'use strict';

  var LD = RA.LevelData;
  var DB_NAME = 'ra_drafts';
  var DB_VERSION = 2;
  var STORE = 'drafts';
  var PUBLISHED = 'published';

  function ok(value) { return { ok: true, value: value }; }
  function fail(code, message, issues) {
    return { ok: false, error: { code: code, message: message, issues: issues || [] } };
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function isoNow() { return new Date().toISOString(); }
  function metaOf(rec) {
    return {
      draftId: rec.draftId,
      revision: rec.revision,
      title: rec.title || '',
      updatedAt: rec.updatedAt,
      contentHash: rec.contentHash || null
    };
  }

  // ---------------- 内存适配器(自检 / 无 IndexedDB 兜底) ----------------
  class MemoryAdapter {
    constructor() {
      this.records = new Map();
      this.published = new Map();
      this.failPutMessage = '';
    }
    /** 让下一次写入失败一次(自检用;不改变正常行为) */
    failNextPut(message, code) {
      this.failPutMessage = message || '模拟存储失败';
      this.failPutCode = code || 'STORAGE_FAILED';
    }
    async list() {
      var list = Array.from(this.records.values())
        .map(metaOf)
        .sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
      return ok(list);
    }
    async get(id) {
      var rec = this.records.get(id);
      return ok(rec ? clone(rec) : null);
    }
    async put(record, expectedRevision) {
      if (this.failPutMessage) {
        var msg = this.failPutMessage, code = this.failPutCode;
        this.failPutMessage = '';
        this.failPutCode = '';
        return fail(code, msg);
      }
      var cur = this.records.get(record.draftId);
      var rev = cur ? cur.revision : 0;
      var expected = expectedRevision === undefined || expectedRevision === null ? 0 : expectedRevision;
      if (expected !== rev) {
        return fail('CONFLICT', '草稿已被另一个页面保存(revision ' + rev +
          ',你基于 ' + expected + ');没有覆盖对方内容');
      }
      var rec = clone(record);
      rec.revision = rev + 1;
      this.records.set(rec.draftId, rec);
      return ok(metaOf(rec));
    }
    async publish(record) {
      var key = record.levelId + ':' + record.contentHash;
      if (this.published.has(key)) return ok(metaOf(record));
      this.published.set(key, clone(record));
      return ok(metaOf(record));
    }
    async listPublished() {
      return ok(Array.from(this.published.values()).map(function (r) {
        return { levelId: r.levelId, contentHash: r.contentHash, rulesVersion: r.rulesVersion,
          rulesFingerprint: r.rulesFingerprint, profile: r.profile,
          source: r.source || 'local-playtest', publishedAt: r.publishedAt,
          data: clone(r.data) };
      }));
    }
    async getPublished(levelId, hash) {
      var r = this.published.get(levelId + ':' + hash);
      return ok(r ? clone(r) : null);
    }
    async remove(id, expectedRevision) {
      var cur = this.records.get(id);
      if (!cur) return ok({ removed: false });
      if (expectedRevision !== undefined && expectedRevision !== null &&
        expectedRevision !== cur.revision) {
        return fail('CONFLICT', '草稿已被另一个页面修改;没有删除');
      }
      this.records.delete(id);
      return ok({ removed: true });
    }
  }

  // ---------------- IndexedDB 适配器 ----------------
  class IndexedDbAdapter {
    constructor(dbName) {
      this.dbName = dbName || DB_NAME;
      this.dbPromise = null;
    }
    static supported() {
      try { return !!globalThis.indexedDB; } catch (e) { return false; }
    }
    open() {
      if (this.dbPromise) return this.dbPromise;
      var self = this;
      this.dbPromise = new Promise(function (resolve, reject) {
        var req = globalThis.indexedDB.open(self.dbName, DB_VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'draftId' });
          }
          if (!db.objectStoreNames.contains(PUBLISHED)) {
            db.createObjectStore(PUBLISHED, { keyPath: 'key' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () {
          reject(fail('STORAGE_FAILED', '打不开浏览器草稿库:' + (req.error && req.error.message)));
        };
        req.onblocked = function () {
          reject(fail('STORAGE_FAILED', '草稿库升级被其它页面阻塞,请关闭旧页面重试'));
        };
      });
      return this.dbPromise;
    }
    async _withStore(mode, fn) {
      var db;
      try { db = await this.open(); }
      catch (e) { return e && e.ok === false ? e : fail('STORAGE_FAILED', String(e)); }
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var settled = false;
        function done(res) { if (!settled) { settled = true; resolve(res); } }
        tx.oncomplete = function () { done(ok(null)); };
        tx.onerror = function () {
          done(fail('STORAGE_FAILED', '浏览器草稿库写入失败:' +
            (tx.error && tx.error.message || '未知错误')));
        };
        tx.onabort = function () {
          done(fail('STORAGE_FAILED', '浏览器草稿库事务被取消:' +
            (tx.error && tx.error.message || '未知原因')));
        };
        fn(store, done, tx);
      });
    }
    async list() {
      var res = await this._withStore('readonly', function (store, done) {
        var out = [];
        var req = store.openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) { done(ok(out.map(metaOf))); return; }
          out.push(cur.value);
          cur.continue();
        };
        req.onerror = function () { done(fail('STORAGE_FAILED', '读取草稿列表失败')); };
      });
      if (!res.ok) return res;
      res.value.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
      return res;
    }
    async get(id) {
      var res = await this._withStore('readonly', function (store, done) {
        var req = store.get(id);
        req.onsuccess = function () { done(ok(req.result ? clone(req.result) : null)); };
        req.onerror = function () { done(fail('STORAGE_FAILED', '读取草稿失败')); };
      });
      return res;
    }
    put(record, expectedRevision) {
      var self = this;
      return self.open().then(function (database) {
        return new Promise(function (resolve) {
          var tx = database.transaction(STORE, 'readwrite');
          var store = tx.objectStore(STORE);
          var expected = expectedRevision === undefined || expectedRevision === null
            ? 0 : expectedRevision;
          var conflict = false, writeError = null, saved = null;
          var req = store.get(record.draftId);
          req.onsuccess = function () {
            var cur = req.result;
            var rev = cur ? cur.revision : 0;
            if (expected !== rev) {
              conflict = true;
              try { tx.abort(); } catch (e) { /* 已结束 */ }
              return;
            }
            var rec = clone(record);
            rec.revision = rev + 1;
            saved = metaOf(rec);
            try { store.put(rec); }
            catch (e) { writeError = e; }
          };
          req.onerror = function () { writeError = req.error; };
          tx.oncomplete = function () { resolve(ok(saved)); };
          tx.onabort = function () {
            if (conflict) {
              resolve(fail('CONFLICT', '草稿已被另一个页面保存;没有覆盖对方内容'));
            } else {
              resolve(fail('STORAGE_FAILED', '浏览器草稿库事务被取消:' +
                (tx.error && tx.error.message || (writeError && writeError.message) || '未知原因')));
            }
          };
        });
      }, function (e) {
        return e && e.ok === false ? e : fail('STORAGE_FAILED', String(e));
      });
    }
    async publish(record) {
      var self = this;
      var db = await self.open();
      if (!db || db.ok === false) return db || fail('STORAGE_FAILED', '草稿库不可用');
      return new Promise(function (resolve) {
        var tx = db.transaction(PUBLISHED, 'readwrite');
        var store = tx.objectStore(PUBLISHED);
        var rec = clone(record); rec.key = rec.levelId + ':' + rec.contentHash;
        var req = store.get(rec.key);
        req.onsuccess = function () {
          if (!req.result) store.put(rec);
        };
        req.onerror = function () { resolve(fail('STORAGE_FAILED', '读取发布记录失败')); };
        tx.oncomplete = function () { resolve(ok({ levelId: rec.levelId, contentHash: rec.contentHash })); };
        tx.onabort = function () { resolve(fail('STORAGE_FAILED', '发布事务被取消')); };
      });
    }
    async listPublished() {
      var res = await this._withStore('readonly', function (store, done) {
        var out = [];
        var req = store.openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) { done(ok(out)); return; }
          out.push(cur.value); cur.continue();
        };
        req.onerror = function () { done(fail('STORAGE_FAILED', '读取发布池失败')); };
      });
      return res;
    }
    async getPublished(levelId, hash) {
      var res = await this._withStore('readonly', function (store, done) {
        var req = store.get(levelId + ':' + hash);
        req.onsuccess = function () { done(ok(req.result ? clone(req.result) : null)); };
        req.onerror = function () { done(fail('STORAGE_FAILED', '读取发布内容失败')); };
      });
      return res;
    }
    async remove(id, expectedRevision) {
      var res = await this._withStore('readwrite', function (store, done, tx) {
        var req = store.get(id);
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) { done(ok({ removed: false })); return; }
          if (expectedRevision !== undefined && expectedRevision !== null &&
            expectedRevision !== cur.revision) {
            try { tx.abort(); } catch (e) { /* 已结束 */ }
            done(fail('CONFLICT', '草稿已被另一个页面修改;没有删除'));
            return;
          }
          store.delete(id);
          done(ok({ removed: true }));
        };
        req.onerror = function () { done(fail('STORAGE_FAILED', '读取草稿失败')); };
      });
      return res;
    }
  }

  // ---------------- 仓库 ----------------
  function certState(data, hash, rules) {
    var cert = data && data.certification;
    if (!cert) return { ok: false, reason: '未认证' };
    if (cert.profileId !== 'standard-v1' || cert.status !== 'passed') {
      return { ok: false, reason: '认证来源/状态不支持' };
    }
    if (cert.contentHash !== hash) return { ok: false, reason: '认证 hash 与内容不一致' };
    if (cert.rulesVersion !== rules.rulesVersion || cert.rulesFingerprint !== rules.rulesFingerprint) {
      return { ok: false, reason: '认证规则版本已过期' };
    }
    var errors = LD.errorsOf(LD.validate(data, {
      purpose: 'publish',
      rules: { rulesVersion: rules.rulesVersion, rulesFingerprint: rules.rulesFingerprint }
    }));
    if (errors.length) return { ok: false, reason: '发布校验未通过:' + errors[0].code + ' ' + errors[0].path };
    return { ok: true, reason: '' };
  }

  class ContentRepository {
    constructor(adapter, info) {
      this.adapter = adapter;
      this.storage = (info && info.storage) || 'memory';
      this.persistent = !!(info && info.persistent);
    }

    /** 有 IndexedDB 就用;否则内存仓库(明确 persistent=false) */
    static create(opts) {
      opts = opts || {};
      if (opts.adapter) {
        return new ContentRepository(opts.adapter, {
          storage: opts.storage || 'custom',
          persistent: opts.persistent !== false
        });
      }
      if (IndexedDbAdapter.supported()) {
        return new ContentRepository(new IndexedDbAdapter(opts.dbName), {
          storage: 'indexedDB', persistent: true
        });
      }
      return new ContentRepository(new MemoryAdapter(), { storage: 'memory', persistent: false });
    }

    listDrafts() { return this.adapter.list(); }
    loadDraft(draftId) { return this.adapter.get(draftId); }

    /**
     * 保存"发起时快照"。
     * expectedRevision:调用方加载/上次保存得到的 revision;新草稿传 0 或 null。
     * 成功返回 {draftId,revision,title,updatedAt,contentHash};失败保留原 record。
     */
    async saveDraft(draftId, data, expectedRevision) {
      if (!draftId || typeof draftId !== 'string') {
        return fail('INVALID_DRAFT_ID', '草稿缺少合法 id');
      }
      var issues = LD.validate(data, { purpose: 'draft' });
      var errors = LD.errorsOf(issues);
      if (errors.length) {
        return fail(errors[0].code,
          '草稿还有结构错误,不能保存:' + errors[0].path + ' ' + errors[0].message, errors);
      }
      var enc = LD.encode(data);
      if (!enc.ok) {
        var list = enc.error.issues || [];
        return fail((list[0] && list[0].code) || enc.error.code,
          '草稿编码失败,没有保存:' + enc.error.message, list);
      }
      var canonical = JSON.parse(enc.value);
      var record = {
        draftId: draftId,
        revision: 0,                    // 由适配器原子递增
        title: canonical.title || '',
        updatedAt: isoNow(),
        contentHash: canonical.contentHash || null,
        data: canonical
      };
      return this.adapter.put(record, expectedRevision);
    }

    async publish(opts) {
      opts = opts || {};
      var draftId = opts.draftId;
      var expected = opts.expectedRevision;
      var receipt = opts.receipt;
      if (!receipt || receipt.status !== 'passed' || receipt.profileId !== 'standard-v1') {
        return fail('CERT_REQUIRED', '发布需要 standard-v1 通关认证回执');
      }
      var loaded = await this.adapter.get(draftId);
      if (!loaded.ok) return loaded;
      if (!loaded.value) return fail('DRAFT_NOT_FOUND', '找不到草稿 ' + draftId);
      if (expected !== undefined && expected !== null && loaded.value.revision !== expected) {
        return fail('CONFLICT', '草稿 revision 已变化,没有发布');
      }
      var data = loaded.value.data;
      var hash = LD.hashSync(data);
      if (!data.certification || data.certification.profileId !== 'standard-v1' ||
        data.certification.status !== 'passed') {
        return fail('CERT_REQUIRED', '草稿没有 standard-v1 passed 认证');
      }
      if (data.certification.contentHash !== receipt.contentHash) {
        return fail('HASH_MISMATCH', '认证回执和草稿里的内容 hash 不一致');
      }
      if (data.certification.rulesVersion !== receipt.rulesVersion ||
        data.certification.rulesFingerprint !== receipt.rulesFingerprint) {
        return fail('RULES_MISMATCH', '认证回执和草稿里的规则版本不一致');
      }
      if (receipt.contentHash !== hash) {
        return fail('HASH_MISMATCH', '认证回执和当前草稿内容不一致,不能发布');
      }
      var rules = RA.RULES || {};
      var issues = LD.validate(data, {
        purpose: 'publish',
        rules: { rulesVersion: rules.rulesVersion, rulesFingerprint: rules.rulesFingerprint }
      });
      var errors = LD.errorsOf(issues);
      if (errors.length) {
        return fail(errors[0].code, '发布校验失败:' + errors[0].path + ' ' + errors[0].message, errors);
      }
      var record = {
        key: data.id + ':' + hash,
        levelId: data.id,
        contentHash: hash,
        data: clone(data),
        rulesVersion: rules.rulesVersion,
        rulesFingerprint: rules.rulesFingerprint,
        profile: 'standard-v1',
        source: 'local-playtest',
        publishedAt: isoNow(),
        revision: loaded.value.revision
      };
      var put = await this.adapter.publish(record);
      if (!put.ok) return put;
      return ok({ levelId: data.id, contentHash: hash, revision: loaded.value.revision });
    }

    async importLevel(text, opts) {
      opts = opts || {};
      var parsed;
      try { parsed = typeof text === 'string' ? JSON.parse(text) : clone(text); }
      catch (e) { return fail('INVALID_JSON', '不是合法 JSON:' + (e && e.message || e)); }
      var dec = LD.decode(parsed);
      if (!dec.ok) return fail(dec.error.code, dec.error.message, dec.error.issues || []);
      var data = dec.value;
      var draftErrors = LD.errorsOf(LD.validate(data, { purpose: 'draft' }));
      if (draftErrors.length) {
        return fail(draftErrors[0].code, '草稿结构不能保存:' + draftErrors[0].path + ' ' + draftErrors[0].message, draftErrors);
      }
      var playErrors = LD.errorsOf(LD.validate(data, { purpose: 'play' }));
      var runnable = playErrors.length === 0;
      var enc = LD.encode(data);
      if (!enc.ok) return fail(enc.error.code, '导入内容编码失败:' + enc.error.message, enc.error.issues || []);
      var canonical = JSON.parse(enc.value);
      var hash = LD.hashSync(data);
      var rules = RA.RULES || {};
      var certInfo = certState(data, hash, rules);
      var certOk = certInfo.ok && runnable;
      var certReason = certInfo.reason || '';
      var runIssues = playErrors.map(function (e) { return e.code + ' ' + e.path + ' ' + e.message; });
      var issues = [].concat(certReason ? [certReason] : [], runIssues);
      var existingList = await this.adapter.list();
      if (!existingList.ok) return existingList;
      var same = existingList.value.filter(function (m) { return m.contentHash === hash; })[0];
      if (same) {
        var loadedSame = await this.adapter.get(same.draftId);
        if (!loadedSame.ok) return loadedSame;
        if (!loadedSame.value) return fail('STORAGE_FAILED', '目录里有同 hash 记录,但读取详情为空');
        var oldData = loadedSame.value.data;
        var oldHash = LD.hashSync(oldData);
        var oldInfo = certState(oldData, oldHash, rules);
        var oldCert = oldData && oldData.certification ? oldData.certification : null;
        var oldOk = oldInfo.ok;
        if (certOk && !oldOk) {
          var updated = clone(loadedSame.value);
          updated.data = canonical;
          updated.contentHash = hash;
          updated.title = canonical.title || '';
          updated.updatedAt = isoNow();
          var up = await this.adapter.put(updated, loadedSame.value.revision);
          if (!up.ok) return up;
          return ok({ draftId: same.draftId, revision: up.value.revision,
            levelRef: { levelId: data.id, contentHash: hash }, eligible: true,
            runnable: runnable, source: 'imported-declaration', issues: [] });
        }
        if (certOk && oldOk) {
          return ok({ draftId: same.draftId, revision: loadedSame.value.revision,
            levelRef: { levelId: data.id, contentHash: hash }, eligible: true,
            runnable: true, source: (oldCert && oldCert.source) || 'imported-declaration', issues: [] });
        }
        return ok({ draftId: same.draftId, revision: loadedSame.value.revision,
          levelRef: { levelId: data.id, contentHash: hash }, eligible: oldOk,
          runnable: oldOk, source: oldOk ? ((oldCert && oldCert.source) || 'imported-declaration') : 'uncertified',
          issues: oldOk ? [] : issues });
      }
      var draftId = data.id;
      if (existingList.value.some(function (m) { return m.draftId === draftId; })) {
        draftId = data.id + '@' + hash.slice(7, 19);
      }
      var record = {
        draftId: draftId, revision: 0, title: canonical.title || '',
        updatedAt: isoNow(), contentHash: hash, data: canonical
      };
      var put = await this.adapter.put(record, 0);
      if (!put.ok) return put;
      return ok({ draftId: draftId, revision: put.value.revision,
        levelRef: { levelId: data.id, contentHash: hash }, eligible: certOk,
        runnable: runnable, source: certOk ? 'imported-declaration' : 'uncertified',
        issues: issues });
    }

    async publishImported(opts) {
      opts = opts || {};
      var loaded = await this.adapter.get(opts.draftId);
      if (!loaded.ok) return loaded;
      if (!loaded.value) return fail('DRAFT_NOT_FOUND', '找不到导入草稿 ' + opts.draftId);
      if (opts.expectedRevision !== undefined && opts.expectedRevision !== null &&
        loaded.value.revision !== opts.expectedRevision) {
        return fail('CONFLICT', '导入草稿 revision 已变化,没有加入正式池');
      }
      var data = loaded.value.data;
      var hash = LD.hashSync(data);
      var cert = data.certification;
      var rules = RA.RULES || {};
      if (!cert || cert.profileId !== 'standard-v1' || cert.status !== 'passed' ||
        cert.contentHash !== hash ||
        cert.rulesVersion !== rules.rulesVersion ||
        cert.rulesFingerprint !== rules.rulesFingerprint) {
        return fail('CERT_REQUIRED', '导入内容没有匹配当前内容/规则的声明认证');
      }
      var errors = LD.errorsOf(LD.validate(data, {
        purpose: 'publish',
        rules: { rulesVersion: rules.rulesVersion, rulesFingerprint: rules.rulesFingerprint }
      }));
      if (errors.length) {
        return fail(errors[0].code, '导入内容发布校验失败:' + errors[0].path + ' ' + errors[0].message, errors);
      }
      var record = {
        key: data.id + ':' + hash, levelId: data.id, contentHash: hash, data: clone(data),
        rulesVersion: rules.rulesVersion, rulesFingerprint: rules.rulesFingerprint,
        profile: 'standard-v1', source: 'imported-declaration', publishedAt: isoNow(),
        revision: loaded.value.revision
      };
      var put = await this.adapter.publish(record);
      if (!put.ok) return put;
      return ok({ levelId: data.id, contentHash: hash, source: 'imported-declaration' });
    }

    getPublished(levelId, hash) { return this.adapter.getPublished(levelId, hash); }

    async listEligible(opts) {
      opts = opts || {};
      var res = await this.adapter.listPublished();
      if (!res.ok) return res;
      var rules = RA.RULES || {};
      var out = res.value.filter(function (r) {
        var d = r.data;
        if (!d || d.kind !== 'normal') return false;
        if (opts.difficulty !== undefined && d.difficulty !== opts.difficulty) return false;
        if (r.rulesVersion !== rules.rulesVersion || r.rulesFingerprint !== rules.rulesFingerprint) return false;
        if (!d.certification || d.certification.status !== 'passed') return false;
        if (d.certification.contentHash !== LD.hashSync(d)) return false;
        return true;
      }).map(function (r) {
        return { levelId: r.levelId, contentHash: r.contentHash, source: r.source || 'local-playtest', data: clone(r.data) };
      });
      out.sort(function (a, b) { return (a.levelId + a.contentHash).localeCompare(b.levelId + b.contentHash); });
      return ok(out);
    }

    deleteDraft(draftId, expectedRevision) {
      return this.adapter.remove(draftId, expectedRevision);
    }
  }

  ContentRepository.MemoryAdapter = MemoryAdapter;
  ContentRepository.IndexedDbAdapter = IndexedDbAdapter;
  RA.ContentRepository = ContentRepository;
})(globalThis.RA = globalThis.RA || {});
