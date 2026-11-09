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
  var DB_VERSION = 3;
  var STORE = 'drafts';
  var PUBLISHED = 'published';
  var META = 'meta';

  function ok(value) { return { ok: true, value: value }; }
  function fail(code, message, issues) {
    return { ok: false, error: { code: code, message: message, issues: issues || [] } };
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function isoNow() { return new Date().toISOString(); }
  function currentEpoch() {
    return (RA.FULL40 && RA.FULL40.poolEpoch) ? String(RA.FULL40.poolEpoch) : '';
  }
  function validDifficulty(d) { return Number.isInteger(d) && d >= 1 && d <= 4; }
  function validPublishedIdentity(levelId, hash) {
    return typeof levelId === 'string' && /^[A-Za-z0-9_-]+$/.test(levelId) &&
      typeof hash === 'string' && /^sha256:[0-9a-f]{64}$/.test(hash);
  }
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
      this.meta = new Map();
      this.failPutMessage = '';
    }
    /** 一次性清池:只在标记与当前 epoch 不同时清 published,然后写入标记。 */
    async ensurePoolEpoch(epoch) {
      var key = 'poolEpoch';
      var applied = this.meta.get(key);
      if (applied === epoch) return ok({ epoch: epoch, resetApplied: false });
      this.published.clear();
      this.meta.set(key, epoch);
      return ok({ epoch: epoch, resetApplied: true });
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
          rulesFingerprint: r.rulesFingerprint, profile: r.profile, poolEpoch: r.poolEpoch || '',
          source: r.source || 'local-playtest', publishedAt: r.publishedAt,
          data: r.data === undefined ? null : clone(r.data) };
      }));
    }
    async getPublished(levelId, hash) {
      var r = this.published.get(levelId + ':' + hash);
      return ok(r ? clone(r) : null);
    }
    async unpublish(levelId, hash) {
      if (!validPublishedIdentity(levelId, hash)) return fail('INVALID_FIELD', '缺少合法的关卡 id / 内容 hash');
      if (this.failPutMessage) {
        var msg = this.failPutMessage, code = this.failPutCode;
        this.failPutMessage = ''; this.failPutCode = '';
        return fail(code, msg);
      }
      return ok({ levelId: levelId, contentHash: hash, removed: this.published.delete(levelId + ':' + hash) });
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
          if (!db.objectStoreNames.contains(META)) {
            db.createObjectStore(META, { keyPath: 'key' });
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
    async _withStore(mode, fn, storeName) {
      var db;
      var name = storeName || STORE;
      try { db = await this.open(); }
      catch (e) { return e && e.ok === false ? e : fail('STORAGE_FAILED', String(e)); }
      return new Promise(function (resolve) {
        var tx = db.transaction(name, mode);
        var store = tx.objectStore(name);
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

    /**
     * 一次性清空旧 published 池:
     *  同一 readwrite 事务里检查 meta.poolEpoch →
     *  未应用时 clear published + 写标记;已应用则什么都不清。
     * 失败返回失败,不报“已清空”;可重试。不 deleteDatabase、不碰 drafts。
     */
    async ensurePoolEpoch(epoch) {
      var db;
      try { db = await this.open(); }
      catch (e) { return e && e.ok === false ? e : fail('STORAGE_FAILED', String(e)); }
      return new Promise(function (resolve) {
        var tx = db.transaction([PUBLISHED, META], 'readwrite');
        var pub = tx.objectStore(PUBLISHED);
        var meta = tx.objectStore(META);
        var settled = false, resetApplied = false, err = null;
        function done(res) { if (!settled) { settled = true; resolve(res); } }
        var get = meta.get('poolEpoch');
        get.onsuccess = function () {
          var applied = get.result ? get.result.value : null;
          if (applied === epoch) return;      // 已应用:不清,等事务提交
          try {
            pub.clear();
            meta.put({ key: 'poolEpoch', value: epoch });
            resetApplied = true;
          } catch (e) { err = e; try { tx.abort(); } catch (e2) { /* 已结束 */ } }
        };
        get.onerror = function () {
          err = get.error || new Error('读取 poolEpoch 失败');
          try { tx.abort(); } catch (e) { /* 已结束 */ }
        };
        tx.oncomplete = function () { done(ok({ epoch: epoch, resetApplied: resetApplied })); };
        tx.onabort = function () {
          done(fail('STORAGE_FAILED', '清空旧发布池事务被取消:' +
            (err && err.message || tx.error && tx.error.message || '未知原因')));
        };
        tx.onerror = function () {
          done(fail('STORAGE_FAILED', '清空旧发布池失败:' +
            (err && err.message || tx.error && tx.error.message || '未知原因')));
        };
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
    async unpublish(levelId, hash) {
      if (!validPublishedIdentity(levelId, hash)) return fail('INVALID_FIELD', '缺少合法的关卡 id / 内容 hash');
      try {
        var db = await this.open();
        return await new Promise(function (resolve) {
          var tx = db.transaction(PUBLISHED, 'readwrite');
          var store = tx.objectStore(PUBLISHED), removed = false, error = null;
          tx.oncomplete = function () { resolve(ok({ levelId: levelId, contentHash: hash, removed: removed })); };
          tx.onabort = function () { resolve(fail('STORAGE_FAILED', '移出发布池事务被取消:' +
            (error && error.message || tx.error && tx.error.message || '未提交'))); };
          tx.onerror = function () { error = tx.error; }; // 等 abort/complete，不能在 request 成功时报告成功
          var req = store.get(levelId + ':' + hash);
          req.onsuccess = function () {
            if (req.result === undefined) return;
            try { store.delete(levelId + ':' + hash); removed = true; }
            catch (e) { error = e; tx.abort(); }
          };
        });
      } catch (e) { return e && e.ok === false ? e : fail('STORAGE_FAILED', String(e)); }
    }
    async listPublished() {
      // 必须读 published 这个 store(以前误用了草稿 store,正式池在真实 IndexedDB 里会读出草稿记录)
      var res = await this._withStore('readonly', function (store, done) {
        var out = [];
        var req = store.openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) { done(ok(out)); return; }
          out.push(cur.value); cur.continue();
        };
        req.onerror = function () { done(fail('STORAGE_FAILED', '读取发布池失败')); };
      }, PUBLISHED);
      return res;
    }
    async getPublished(levelId, hash) {
      var res = await this._withStore('readonly', function (store, done) {
        var req = store.get(levelId + ':' + hash);
        req.onsuccess = function () { done(ok(req.result ? clone(req.result) : null)); };
        req.onerror = function () { done(fail('STORAGE_FAILED', '读取发布内容失败')); };
      }, PUBLISHED);
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
  function acceptedProfile(id) {
    var rules = RA.RULES || {};
    if (rules.acceptsProfile) return rules.acceptsProfile(id);
    return id === 'run-v1' || id === 'standard-v1';
  }
  function certState(data, hash, rules) {
    var cert = data && data.certification;
    if (!cert) return { ok: false, reason: '未认证' };
    if (!acceptedProfile(cert.profileId) || cert.status !== 'passed') {
      return { ok: false, reason: '认证来源/状态不支持' };
    }
    if (cert.contentHash !== hash) return { ok: false, reason: '认证 hash 与内容不一致' };
    // 24号卡:技术规则版本/指纹只记录当次条件,不再要求等于当前版本。
    // 同内容 + 完整人工通过声明即可用;来源仍按原样保留(imported-declaration 不冒充本机)。
    void rules;
    // 只读门槛:内容能读、运行必需的起终点/对象引用可用;几何/净空/可达性不再裁决
    var errors = LD.readableIssues ? LD.readableIssues(data)
      : LD.errorsOf(LD.validate(data, { purpose: 'load' }));
    if (errors.length) return { ok: false, reason: '内容读取未通过:' + errors[0].code + ' ' + errors[0].path };
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
     * 一次性清空旧普通发布池(用户 25 号卡已授权):
     * 同一事务检查 metadata 标记;只有未应用时才 clear published + 写标记。
     * 之后新发布记录带当前 poolEpoch,listEligible 只取当前 epoch,旧无 epoch 记录不再混入。
     */
    ensurePoolEpoch(epoch) {
      var target = epoch === undefined || epoch === null ? currentEpoch() : String(epoch);
      if (!this.adapter || typeof this.adapter.ensurePoolEpoch !== 'function') {
        return Promise.resolve(ok({ epoch: target, resetApplied: false }));
      }
      return this.adapter.ensurePoolEpoch(target).then(function (res) {
        if (!res || !res.ok) return res;
        return ok({ epoch: res.value.epoch, resetApplied: !!res.value.resetApplied });
      });
    }

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
      if (!receipt || receipt.status !== 'passed' || !acceptedProfile(receipt.profileId)) {
        return fail('CERT_REQUIRED', '发布需要一份绑定当前内容的通过记录(profile run-v1)');
      }
      var loaded = await this.adapter.get(draftId);
      if (!loaded.ok) return loaded;
      if (!loaded.value) return fail('DRAFT_NOT_FOUND', '找不到草稿 ' + draftId);
      if (expected !== undefined && expected !== null && loaded.value.revision !== expected) {
        return fail('CONFLICT', '草稿 revision 已变化,没有发布');
      }
      var data = loaded.value.data;
      var hash = LD.hashSync(data);
      if (!data.certification || !acceptedProfile(data.certification.profileId) ||
        data.certification.status !== 'passed') {
        return fail('CERT_REQUIRED', '草稿没有与当前内容匹配的通过记录;先「试玩」实际通关一次');
      }
      if (data.certification.contentHash !== receipt.contentHash) {
        return fail('HASH_MISMATCH', '通过记录回执和草稿里的内容 hash 不一致');
      }
      if (data.certification.rulesVersion !== receipt.rulesVersion ||
        data.certification.rulesFingerprint !== receipt.rulesFingerprint) {
        return fail('RULES_MISMATCH', '通过记录回执和草稿里记录的规则版本不一致(回执来路不明)');
      }
      if (receipt.contentHash !== hash) {
        return fail('HASH_MISMATCH', '通过记录绑定的是别的内容(改图后要重新试玩),不能发布');
      }
      if (data.kind !== 'normal') {
        return fail('INVALID_FIELD', '固定场景不进入普通发布池');
      }
      if (!validDifficulty(data.difficulty)) {
        return fail('INVALID_DIFFICULTY', '发布需要 1–4 档难度(当前为 ' +
          JSON.stringify(data.difficulty) + ');请在编辑器「难度」里选择后重新试玩');
      }
      // 内容可读即可发布;几何/净空/可达性等旧自动门槛不再否决人工通过
      var readable = LD.readableIssues ? LD.readableIssues(data) : LD.errorsOf(LD.validate(data, { purpose: 'load' }));
      if (readable.length) {
        return fail(readable[0].code, '内容读取失败:' + readable[0].path + ' ' + readable[0].message, readable);
      }
      var prep = await this.ensurePoolEpoch();
      if (!prep.ok) return prep;
      var record = {
        key: data.id + ':' + hash,
        levelId: data.id,
        contentHash: hash,
        data: clone(data),
        poolEpoch: currentEpoch(),
        // 保留人工通过当时的条件记录,不参与"地图是否合格"的判断,也不冒充按当前版本重测
        rulesVersion: receipt.rulesVersion || (RA.RULES && RA.RULES.rulesVersion) || '',
        rulesFingerprint: receipt.rulesFingerprint || (RA.RULES && RA.RULES.rulesFingerprint) || '',
        profile: receipt.profileId,
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
      // runnable 只看"能不能读/运行必需字段";几何/净空/可达性不在这里裁决
      var playErrors = LD.readableIssues ? LD.readableIssues(data)
        : LD.errorsOf(LD.validate(data, { purpose: 'load' }));
      var runnable = playErrors.length === 0;
      var enc = LD.encode(data);
      if (!enc.ok) return fail(enc.error.code, '导入内容编码失败:' + enc.error.message, enc.error.issues || []);
      var canonical = JSON.parse(enc.value);
      var hash = LD.hashSync(data);
      var rules = RA.RULES || {};
      var certInfo = certState(data, hash, rules);
      var certOk = certInfo.ok && runnable && validDifficulty(data.difficulty);
      var certReason = certInfo.reason || '';
      if (certInfo.ok && runnable && !validDifficulty(data.difficulty)) {
        certReason = '普通层需要 1–4 档难度(当前 ' + JSON.stringify(data.difficulty) + ')';
      }
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
      // 24号卡:与本地 publish/listEligible 采用同一解释——内容可读、普通图、passed/profile 受支持、
      // 声明 hash = 当前内容。技术规则版本/指纹只记录,不与当前版本强制相等。
      if (!cert || !acceptedProfile(cert.profileId) || cert.status !== 'passed' ||
        cert.contentHash !== hash) {
        return fail('CERT_REQUIRED', '导入内容没有绑定当前内容的通过记录(不自动入池;无记录/改图不能假通过)');
      }
      if (data.kind !== 'normal') {
        return fail('INVALID_FIELD', '固定场景不进入普通发布池');
      }
      if (!validDifficulty(data.difficulty)) {
        return fail('INVALID_DIFFICULTY', '导入内容需要 1–4 档难度(当前为 ' +
          JSON.stringify(data.difficulty) + ');请在编辑器选择后重新试玩');
      }
      // 只读门槛:几何/净空/可达性由作者人工试玩决定,不在这里再次否决
      var errors = LD.readableIssues ? LD.readableIssues(data) : LD.errorsOf(LD.validate(data, { purpose: 'load' }));
      if (errors.length) {
        return fail(errors[0].code, '导入内容读取失败:' + errors[0].path + ' ' + errors[0].message, errors);
      }
      var prep = await this.ensurePoolEpoch();
      if (!prep.ok) return prep;
      var record = {
        key: data.id + ':' + hash, levelId: data.id, contentHash: hash, data: clone(data),
        poolEpoch: currentEpoch(),
        // 保留声明当时的通过条件,不改写成本版本字段冒充重新测试
        rulesVersion: cert.rulesVersion || rules.rulesVersion,
        rulesFingerprint: cert.rulesFingerprint || rules.rulesFingerprint,
        profile: cert.profileId, source: 'imported-declaration', publishedAt: isoNow(),
        revision: loaded.value.revision
      };
      var put = await this.adapter.publish(record);
      if (!put.ok) return put;
      return ok({ levelId: data.id, contentHash: hash, source: 'imported-declaration' });
    }

    getPublished(levelId, hash) { return this.adapter.getPublished(levelId, hash); }

    async listPublishedVersions() {
      try {
        var prep = await this.ensurePoolEpoch();
        if (!prep.ok) return prep;
        var res = await this.adapter.listPublished();
        if (!res.ok) return res;
        var epoch = currentEpoch();
        return ok(res.value.filter(function (r) { return !epoch || r.poolEpoch === epoch; })
          .map(function (r) {
            var d = r.data || {};
            return { levelId: r.levelId, contentHash: r.contentHash, title: d.title || r.title || r.levelId,
              difficulty: d.difficulty, source: r.source || 'local-playtest' };
          }).sort(function (a, b) {
            return (a.levelId + a.contentHash).localeCompare(b.levelId + b.contentHash);
          }));
      } catch (e) { return fail('STORAGE_FAILED', String(e)); }
    }

    async unpublish(opts) {
      opts = opts || {};
      if (!validPublishedIdentity(opts.levelId, opts.contentHash)) return fail('INVALID_FIELD', '缺少合法的关卡 id / 内容 hash');
      // 列表/正式入口沿用既有 epoch 准备；精确删除本身绝不触发清池或改 metadata。
      try { return await this.adapter.unpublish(opts.levelId, opts.contentHash); }
      catch (e) { return fail('STORAGE_FAILED', String(e)); }
    }

    async listEligible(opts) {
      opts = opts || {};
      var prep = await this.ensurePoolEpoch();
      if (!prep.ok) return prep;
      var res = await this.adapter.listPublished();
      if (!res.ok) return res;
      var epoch = currentEpoch();
      var out = res.value.filter(function (r) {
        var d = r.data;
        if (!d || d.kind !== 'normal') return false;
        // 只取当前一次性 epoch 的新发布;旧无 epoch/旧 epoch 记录不能混回池
        if (epoch && r.poolEpoch !== epoch) return false;
        if (!validDifficulty(d.difficulty)) return false;
        if (opts.difficulty !== undefined && d.difficulty !== opts.difficulty) return false;
        // 通过记录绑定内容 hash 才可用于正式候选;规则版本/指纹变化只作记录,
        // 不在此自动批量作废作者已经人工通过并发布的内容
        if (!d.certification || d.certification.status !== 'passed') return false;
        if (!acceptedProfile(d.certification.profileId)) return false;
        if (d.certification.contentHash !== LD.hashSync(d)) return false;
        return true;
      }).map(function (r) {
        return { levelId: r.levelId, contentHash: r.contentHash, source: r.source || 'local-playtest',
          data: clone(r.data), requiredDifficulty: r.data.difficulty };
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
  ContentRepository.certState = certState;
  RA.ContentRepository = ContentRepository;
})(globalThis.RA = globalThis.RA || {});
