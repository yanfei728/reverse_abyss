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
  var DB_VERSION = 1;
  var STORE = 'drafts';

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

    deleteDraft(draftId, expectedRevision) {
      return this.adapter.remove(draftId, expectedRevision);
    }
  }

  ContentRepository.MemoryAdapter = MemoryAdapter;
  ContentRepository.IndexedDbAdapter = IndexedDbAdapter;
  RA.ContentRepository = ContentRepository;
})(globalThis.RA = globalThis.RA || {});
