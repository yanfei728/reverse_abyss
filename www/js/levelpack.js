/* -*- coding: utf-8 -*- */
/*
 * levelpack.js —— 关卡池:把一堆关卡数据变成"可以拿来选层的模板"
 * ==========================================================
 * 关卡池的三个来源:
 *   ① levels/*.json               —— 内容源头,一个 json = 一层模板
 *                                    (地形写在 asc 里,元信息写在同一个 json 里)
 *   ② levels/levels.js            —— 由 tools/sync_levels.mjs 从 ① 打包生成
 *                                    (双击 index.html 用 file:// 打开时,
 *                                     浏览器不许读本地文件,只能靠这份内嵌的)
 *   ③ 玩家在设置面板里导入的 txt / json,以及编辑器「保存到游戏」的覆盖
 *
 * 老格式(只有 `// name:` 注释 + 地图的纯文本 txt)仍然认 —— 编辑器这一轮还没改,
 * 它写出来的东西要能照旧读进来。判断方式见 RA.Level.dataOf:字符串且不以 { 开头
 * 就当成一段地图文本。
 *
 * 用 http 打开时(比如 python -m http.server),这里会顺手 fetch 一遍
 * levels/<id>.json:能拿到就用磁盘上的实时内容 —— 改完存盘刷新页面就生效,
 * 不用再跑 sync。双击打开(file://)时 fetch 会失败,自动退回 ② 的内嵌内容。
 */
(function (RA) {
  'use strict';

  /** 从一份关卡数据里抠出老格式 `// name:` 的名字(没有就是 fallback,也就是 id) */
  function levelName(value, fallback) {
    var data = RA.Level.dataOf(value, fallback);
    var meta = data ? RA.Level.parseComments(data.asc) : {};
    return meta.name || fallback || '未命名楼层';
  }

  /** 关卡数据里的地图 → 一整段文本(给还在用文本的地方:编辑器 / 老工具 / 自检) */
  function textOf(value) {
    var data = RA.Level.dataOf(value, '');
    if (!data) return '';
    return Array.isArray(data.asc) ? data.asc.join('\n') : String(data.asc);
  }

  /**
   * custom_新楼层_1 → 新楼层_1。
   * 关卡的"名字"已经从数据里去掉了,但游戏设置里「导入关卡」留下的自定义层是按
   * custom_<名字> 存的 —— 给它一个能看的显示名,关卡池里就不会只显示 custom_xxx。
   * 数据里自己写了 name(老格式的 // name: 注释)时以那个为准。
   */
  function displayName(id, ownName) {
    if (ownName) return ownName;
    if (isCustomId(id)) return String(id).slice('custom_'.length) || id;
    return id;
  }

  /**
   * 把一份关卡数据读成 Level,返回体检报告 ——
   * 关卡池、设置面板、编辑器和关卡检查工具都靠它。
   * value 可以是新格式对象 / JSON 字符串 / 老格式纯文本(见 RA.Level.dataOf)。
   */
  function validate(value, id) {
    var out = {
      ok: false, id: id || '', name: id || '', rows: 0, cols: 0,
      warnings: [], error: '', ascText: '', objects: [],
      data: { id: id, asc: '' },
      difficulty: 1, verified: true
    };
    var data = RA.Level.dataOf(value, id);
    if (!data) {
      out.error = '这份关卡既不是 json 也不是地图文本';
      return out;
    }
    out.data = data;
    try {
      var lv = RA.Level.fromData(out.data, { id: id, source: String(id || '?') });
      out.ok = lv.rows > 0 && lv.cols > 0;
      out.id = lv.id;
      // 数据里没写名字(新格式本来就没有)时:自定义层用 custom_ 后面的那一截当显示名
      out.name = displayName(lv.id, lv.meta && lv.meta.name);
      out.rows = lv.rows;
      out.cols = lv.cols;
      out.warnings = lv.warnings.slice();
      out.difficulty = lv.difficulty;
      out.verified = lv.verified;
      out.objects = lv.objects.slice();
      out.ascText = textOf(out.data);
      if (!out.ok) out.error = '这张图一行地形都没有';
    } catch (e) {
      out.error = String((e && e.message) || e);
    }
    return out;
  }

  /** 体检报告 → 池子里的那一项 */
  function entryFrom(r) {
    return {
      id: r.id,
      name: r.name,
      text: r.ascText,             // 地图文本(老接口;要用元信息就一起看 data)
      data: r.data,                // 完整关卡数据:asc + id / difficulty / verified / size / objects / sky
      rows: r.rows,
      cols: r.cols,
      warnings: (r.warnings || []).slice(),
      difficulty: r.difficulty,
      verified: r.verified,
      objects: (r.objects || []).slice()
    };
  }

  /** 把体检报告里的内容盖到池子里的那一项上(实时 txt / 覆盖都用它) */
  function applyTo(entry, r) {
    entry.text = r.ascText;
    entry.data = r.data;
    entry.name = r.name;
    entry.rows = r.rows;
    entry.cols = r.cols;
    entry.warnings = (r.warnings || []).slice();
    entry.difficulty = r.difficulty;
    entry.verified = r.verified;
    entry.objects = (r.objects || []).slice();
  }

  /**
   * src = {id: 关卡数据} → {pool, bad}
   * pool 里每项:{id, name, text, data, rows, cols, difficulty, verified, objects, warnings}
   * bad 里是"读不出来 / 有警告"的条目,设置面板会显示"有几个模板有问题"。
   */
  function build(src) {
    var pool = [], bad = [];
    Object.keys(src || {}).forEach(function (id) {
      var r = validate(src[id], id);
      if (!r.ok) {
        bad.push({ id: id, kind: 'error', messages: [r.error || '读不出来'] });
        return;
      }
      pool.push(entryFrom(r));
      if (r.warnings.length) bad.push({ id: id, kind: 'warn', messages: r.warnings });
    });
    return { pool: pool, bad: bad };
  }

  /** fetch 一段文本;读不到(404 / 网络错 / 没有 fetch)就 reject */
  function fetchText(url) {
    return globalThis.fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  }

  /**
   * 浏览器里取关卡池。done(pack) 是回调 —— 因为 http 下要等一下 fetch。
   * 拿不到 fetch(比如 Node 自检里)就直接用内嵌内容。
   */
  function load(src, done) {
    var pack = build(src);
    var loc = globalThis.location;
    var canFetch = typeof globalThis.fetch === 'function' && loc &&
      /^https?:$/.test(loc.protocol) && pack.pool.length;
    if (!canFetch) {
      done(pack);
      return;
    }
    var pending = pack.pool.length;
    pack.live = true;
    pack.pool.forEach(function (entry) {
      var finish = function () {
        pending--;
        if (pending === 0) done(pack);
      };
      // 存在浏览器里的自定义关卡没有对应的文件,不用去 fetch
      if (isCustomId(entry.id)) { finish(); return; }
      var base = 'levels/' + entry.id;
      // 先读新格式 floor01.json;没有就退回老格式 floor01.txt(编辑器写出来的那种)
      fetchText(base + '.json').then(function (text) {
        var data = RA.Level.dataOf(text, entry.id);
        if (!data) throw new Error('不是合法的 json');
        var r = validate(data, entry.id);
        if (!r.ok) throw new Error(r.error || '读不出来');
        applyTo(entry, r);
        entry.liveText = true;      // 这层的内容是从磁盘上的文件实时读到的
      }).catch(function () {
        return fetchText(base + '.txt').then(function (text) {
          if (!text || !text.trim()) return;
          var r = validate(text, entry.id);
          if (!r.ok) return;
          applyTo(entry, r);
          entry.liveText = true;
        });
      }).catch(function () { /* 读不到就用内嵌的那份 */ })
        .then(finish);
    });
  }

  // ================= 存在浏览器里的自定义关卡 =================
  /*
   * 关卡编辑器画好的关卡、以及在设置面板里导入的 txt / json,都放在 localStorage 里,
   * 这样刷新页面、重开浏览器还在,而且游戏和编辑器共用同一份。
   * 「保存到游戏」写进 levels/ 的同时,也会往这里的 overrides 记一份(见下)。
   * 拿不到 localStorage(file:// + 某些浏览器会禁)就全部降级成"只在内存里",
   * 编辑器那边会提示你改用下载 txt。
   */
  var LS_KEY = 'reverse_abyss.customLevels';
  var memoryStore = null;                    // localStorage 不可用时的兜底

  function store() {
    try {
      var s = globalThis.localStorage;
      if (s) { s.getItem(LS_KEY); return s; }     // 试探一下(某些环境会直接抛)
    } catch (e) { /* 用不了 */ }
    return null;
  }

  /** 自定义关卡的 id 前缀(load 时靠它跳过 fetch) */
  function customId(name) {
    return 'custom_' + String(name || '未命名').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
  }

  function isCustomId(id) {
    return String(id || '').indexOf('custom_') === 0;
  }

  /**
   * 关卡 id → 比较用的统一写法(空格、斜杠这些不能做文件名的字符都换成 _)。
   * 为什么需要它:"同一层"在浏览器里可能有几把不同的钥匙 ——
   *   · overrides 用 id
   *   · customLevels 用 custom_名字(游戏里「导入关卡」留下的)
   *   · 文件夹里的名字又是归一化过的版本
   * 想判断"这两条其实是同一层",就得先归一化,否则会留下重复的层。
   */
  function fileNameOf(name) {
    return String(name || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || '未命名楼层';
  }

  function sameLevelName(a, b) {
    return fileNameOf(a) === fileNameOf(b);
  }

  /** 读出全部自定义关卡 {id: 关卡数据} */
  function readCustom() {
    var s = store();
    if (!s) return memoryStore ? JSON.parse(JSON.stringify(memoryStore)) : {};
    try {
      var raw = s.getItem(LS_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      return {};
    }
  }

  /** 写回全部自定义关卡,成功返回 true */
  function writeCustom(map) {
    var s = store();
    if (!s) { memoryStore = map; return false; }
    try {
      s.setItem(LS_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 存一个自定义关卡(同名会覆盖),返回它的 id */
  function putCustom(name, value) {
    var map = readCustom();
    var id = customId(name);
    map[id] = value;
    writeCustom(map);
    return id;
  }

  function removeCustom(id) {
    var map = readCustom();
    delete map[id];
    writeCustom(map);
    return map;
  }

  /** 把自定义关卡并进关卡池的来源表(src 优先,自定义覆盖同名的) */
  function mergeCustom(src) {
    var out = {};
    var custom = readCustom();
    Object.keys(src || {}).forEach(function (k) { out[k] = src[k]; });
    Object.keys(custom).forEach(function (k) { out[k] = custom[k]; });
    // 最后盖一层"浏览器里改过的"覆盖(见下面 readOverrides)
    var ov = readOverrides();
    Object.keys(ov).forEach(function (k) { out[k] = ov[k]; });
    return out;
  }

  // ================= 浏览器里的"覆盖"(改过的内置层) =================
  /*
   * 编辑器的「保存到游戏」会同时做两件事:
   *   ① 把这一层写进 levels/(文件夹内容,源头);
   *   ② 把同一份数据按 id 记在这儿(关卡内容)。
   * 为什么要有 ②:双击 index.html 是 file:// 打开的,浏览器读不了本地文件,
   * 关卡池只能用 levels/levels.js 这份**内嵌副本** —— 你改了 floor01.json 但没跑
   * node tools/sync_levels.mjs 的话,游戏里还是旧地图。有了这份覆盖,存完刷新就是新地图。
   *
   * 优先级:http 下 fetch 到了文件就以文件为准(liveText),这份覆盖只是兜底;
   * file:// 下读不到文件,就用这份覆盖。它和关卡池怎么拼起来见下面 poolOf();
   * 想去掉某一份覆盖,用控制台:RA.LevelPack.removeOverride('floor01')。
   */
  var OV_KEY = 'reverse_abyss.overrides';
  var memoryOv = null;

  function readOverrides() {
    var s = store();
    if (!s) return memoryOv ? JSON.parse(JSON.stringify(memoryOv)) : {};
    try {
      var raw = s.getItem(OV_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function writeOverrides(map) {
    var s = store();
    if (!s) { memoryOv = map; return false; }
    try {
      s.setItem(OV_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 记一条覆盖:id = 关卡池里的 id(floor01 / custom_xxx),返回它 */
  function putOverride(id, value) {
    var map = readOverrides();
    map[String(id)] = value;
    writeOverrides(map);
    return String(id);
  }

  function removeOverride(id) {
    var map = readOverrides();
    delete map[String(id)];
    writeOverrides(map);
    return map;
  }

  function hasOverride(id) {
    return !!readOverrides()[String(id)];
  }

  function overrideCount() {
    return Object.keys(readOverrides()).length;
  }

  /** 自定义关卡能不能真的存下来(不能的话编辑器会提示改用下载) */
  function canStore() {
    return !!store();
  }

  // ================= 拼出"真正能用的关卡池" =================
  /*
   * 关卡池的**唯一组装点**。游戏(Game)、编辑器、自检都走这一条,
   * 免得三个地方各拼一遍、越改越不一致。
   *
   * 输入:
   *   pack —— LevelPack.load() 出来的 {pool, bad, live};
   *           http 下 pool 里的 entry.liveText = true 表示"内容刚从磁盘上读到"。
   * 三份来源,优先级从低到高:
   *   ① pack.pool                  —— levels/*.json 内嵌(levels.js)或实时 fetch 到的
   *   ② customLevels(custom_xxx)   —— 游戏里「导入关卡」留下的
   *   ③ overrides                  —— 编辑器「保存到游戏」写下的那层新内容
   *
   * 每条覆盖的两种归宿:
   *   a) 关卡池里已经有这个 id   → 换掉那一层的内容(改过的老关卡,塔里那层不会变两层);
   *      但 entry.liveText 为真(读到了磁盘上的文件)时以文件为准,覆盖只是兜底;
   *   b) 关卡池里还没有这个 id   → 当成"只在浏览器里的关卡"补进池子(新层还没 sync 过)。
   *
   * 同 id 只留一条;补进来的覆盖标 overrideOnly,方便分清楚它是从哪儿来的。
   */
  function poolOf(pack) {
    var src = (pack && pack.pool) || [];
    var ov = readOverrides();
    var merged = readCustom();
    Object.keys(ov).forEach(function (k) { merged[k] = ov[k]; });
    var browserOnly = {};                       // 只在浏览器里的 id(custom_xxx / 孤儿覆盖)

    var byId = {}, order = [], nameSlot = {};
    var add = function (entry, nameWhileFresh) {
      if (nameWhileFresh) {
        // 同一个**名字**在浏览器里可能有两把钥匙(custom_xxx 和 overrides[id]),
        // 那是同一层的两份副本 —— 后面遇到的那份说了算(改名/新存的优先),
        // 前面那条标记成被顶掉。不这么办的话,塔里会抽出两个同名的层。
        var nm = fileNameOf(nameWhileFresh);
        var prev = nameSlot[nm];
        if (prev && prev !== entry) {
          prev.superseded = true;
          var i = order.indexOf(prev);
          if (i >= 0) order.splice(i, 1);
        }
        nameSlot[nm] = entry;
      }
      if (order.indexOf(entry) < 0) order.push(entry);
    };

    src.forEach(function (e) {
      var entry = {
        id: e.id, name: e.name, text: e.text, data: e.data,
        rows: e.rows, cols: e.cols, warnings: (e.warnings || []).slice(),
        difficulty: e.difficulty, verified: e.verified, objects: (e.objects || []).slice(),
        liveText: !!e.liveText, custom: false, overridden: false
      };
      if (!byId[e.id]) { byId[e.id] = entry; add(entry, entry.name); }
      else { byId[e.id] = entry; }
    });

    Object.keys(merged).forEach(function (id) {
      var value = merged[id];
      if (!value) return;
      var r = validate(value, id);
      if (!r.ok) return;                        // 读不出来的那份直接跳过
      var hit = byId[id];
      if (hit) {
        if (hit.liveText) return;               // 能读到磁盘上的文件就以文件为准
        applyTo(hit, r);
        hit.overridden = true;                  // 改过的老关卡
        browserOnly[id] = true;
        // 这一层的名字可能刚换过(编辑器改了显示名):重新登记一次,
        // 让新名字占住位置、把另一个旧名字的副本顶掉。
        add(hit, hit.name);
      } else {
        var entry = entryFrom(r);
        entry.custom = isCustomId(id);
        entry.overridden = false;
        entry.liveText = false;
        if (!entry.custom) entry.overrideOnly = true;   // 编辑器新建、还没进 levels.js
        byId[id] = entry;
        browserOnly[id] = true;
        add(entry, entry.name);
      }
    });

    return {
      list: order.filter(function (e) { return e && !e.superseded; }),
      browserOnly: browserOnly
    };
  }

  /**
   * 关卡池下拉框要用的 id:一轮下来同一个"层"只留一条。
   * 池子里可能同时有 floor01(内置)和 custom_floor01(浏览器里存过、内容一样的副本),
   * 名字一样(新格式里名字就是 id)就只留内置那条;名字不一样说明是两层不同的关卡,都留着。
   */
  function primaryOf(list) {
    var byName = {}, out = [];
    (list || []).forEach(function (e) {
      var nm = String(e.name || '').trim();
      if (nm && byName[nm]) return;
      if (nm) byName[nm] = e.id;
      out.push(e);
    });
    return out;
  }

  RA.LevelPack = {
    load: load,
    build: build,
    validate: validate,
    levelName: levelName,
    textOf: textOf,
    poolOf: poolOf,
    primaryOf: primaryOf,
    customId: customId,
    isCustomId: isCustomId,
    fileNameOf: fileNameOf,
    sameLevelName: sameLevelName,
    readCustom: readCustom,
    writeCustom: writeCustom,
    putCustom: putCustom,
    removeCustom: removeCustom,
    mergeCustom: mergeCustom,
    readOverrides: readOverrides,
    writeOverrides: writeOverrides,
    putOverride: putOverride,
    removeOverride: removeOverride,
    hasOverride: hasOverride,
    overrideCount: overrideCount,
    canStore: canStore,
    LS_KEY: LS_KEY,
    OV_KEY: OV_KEY
  };
})(globalThis.RA = globalThis.RA || {});
