/* -*- coding: utf-8 -*- */
/*
 * short.js —— PC 短塔入口(开发短塔 / 正式短塔)
 * ===============================================
 * 页面只做菜单、键盘、渲染与结果;模拟/生命/技能/Boss 全在 GameSession。
 * 开发短塔使用未认证 B2 模板,明确标注;正式短塔只从已发布+已认证普通层抽选,
 * 固定大厅/休整/Boss 场景来自内置模板。死亡回大厅,重试同一 manifest。
 */
(function (RA) {
  'use strict';
  var C = RA.C, TS = C.TS, W = 960, H = 540;
  function $(id) { return document.getElementById(id); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  var state = {
    session: null,
    floors: [],
    manifest: null,
    mode: 'dev',
    assets: null,
    paused: false,
    overlay: '',
    cam: { x: 0, y: 0 },
    canvas: null,
    ctx: null,
    held: { left: false, right: false, jump: false },
    lastT: 0,
    dpr: 1,
    cw: W, ch: H,
    input: null,
    layout: null,
    layoutEdit: false,
    selectedAction: 'left',
    isTouch: false,
    bridge: null,
    lifecycle: null,
    imported: null,
    importedData: null,
    repo: null,
    poolInfo: null,
    seedText: 'RA-1',
    seedValue: 1,
    savedSeeds: [],
    stopped: false,
    raf: 0,
    // 30:只读的历史最高分(独立 key,只存一个 max;不存逐局记录)
    bestScore: 0,
    bestSubmitted: 0,
    highScoreError: '',
    // 36:游玩偏好(独立 key;失败不阻断,只提示本次未保存)
    prefs: null,
    prefsError: '',
    // 38:三层大背景视差状态(页面持有;纯视觉,不进 Session/存档)
    parallax: null,
    parallaxDiscontinuity: true,
    // 39:换组滑动过渡与当前显示组(只在页面;不写 Session/存档)
    transition: null,
    largeGroup: null,
    largeGroupReset: false
  };
  RA.short = { state: state, updateHud: updateHud };

  /**
   * 32:游玩镜头缩放 = C.VIEW.zoom(2/3)。状态里的 cw/ch 仍是 CSS 可见像素,
   * 世界可见宽高要除以 zoom;相机/裁剪/居中一律用世界尺寸。
   */
  function viewWorld() {
    var vz = RA.ViewZoom;
    if (!vz) return { w: state.cw, h: state.ch, zoom: 1 };
    return { w: vz.worldW(state.cw), h: vz.worldH(state.ch), zoom: vz.zoom() };
  }
  /** 让世界点 (wx, wy) 居中:相机世界坐标 */
  function camCenterOn(wx, wy) {
    var v = viewWorld();
    return { x: wx - v.w / 2, y: wy - v.h / 2 };
  }

  // ============ 36:游玩偏好(视野档位 / 正式换层额外回血) ============
  function prefsStore() {
    try {
      if (globalThis.localStorage && typeof localStorage.getItem === 'function' &&
        typeof localStorage.setItem === 'function') return localStorage;
    } catch (e) { /* 隐私模式等:当作没有存储 */ }
    return null;
  }
  function defaultPrefs() {
    return { version: 1, viewMode: 'wide', floorHealAmount: 0, towerMode: 'easy' };
  }
  function loadPlayPrefs() {
    var res;
    if (RA.PlayPreferences && RA.PlayPreferences.load) res = RA.PlayPreferences.load(prefsStore());
    else res = { ok: false, value: defaultPrefs(), error: { code: 'NO_MODULE', message: '缺少游玩偏好模块' } };
    state.prefs = res.value;
    state.prefsError = res.ok ? '' : (res.error && res.error.message || '读取游玩偏好失败');
    applyViewMode(state.prefs.viewMode);
    return res;
  }
  /** 立即应用视野档位;当前正式局只重算相机,不改玩家坐标/HP/技能/manifest */
  function applyViewMode(mode) {
    if (RA.ViewZoom && RA.ViewZoom.setMode) RA.ViewZoom.setMode(mode);
    if (state.session && state.session.player) {
      var p = state.session.player;
      var c = camCenterOn(p.x + p.w / 2, p.y + p.h / 2);
      state.cam.x = c.x;
      state.cam.y = c.y;
    }
  }
  function prefsStatusText(extra) {
    if (extra) return extra;
    if (state.prefsError) return state.prefsError + '(使用默认广视野/0)';
    return '';
  }
  function syncPlayPrefControls(keepStatus) {
    var p = state.prefs || defaultPrefs();
    ['set-view-mode', 'pause-view-mode'].forEach(function (id) {
      var el = $(id); if (el) el.value = p.viewMode;
    });
    ['set-floor-heal', 'pause-floor-heal'].forEach(function (id) {
      var el = $(id); if (el) el.value = String(p.floorHealAmount);
    });
    ['set-tower-mode', 'pause-tower-mode'].forEach(function (id) {
      var el = $(id); if (el) el.value = p.towerMode || 'easy';
    });
    if (!keepStatus) {
      ['play-prefs-status', 'pause-prefs-status'].forEach(function (id) {
        var el = $(id); if (el) el.textContent = prefsStatusText('');
      });
    }
  }
  /** 保存偏好:成功才说已保存;失败明确"本次已生效,未保存" */
  function savePlayPrefs(next, label) {
    state.prefs = next;
    var store = prefsStore();
    var res = (RA.PlayPreferences && RA.PlayPreferences.save)
      ? RA.PlayPreferences.save(store, next)
      : { ok: false, error: { message: '缺少游玩偏好模块' } };
    state.prefsError = res.ok ? '' : (res.error && res.error.message || '保存游玩偏好失败');
    var msg = res.ok ? (label || '') : ((label || '') + '本次已生效,但未能保存(' + state.prefsError + ')');
    ['play-prefs-status', 'pause-prefs-status'].forEach(function (id) {
      var el = $(id); if (el) el.textContent = msg;
    });
    return res.ok;
  }
  function changeViewMode(mode) {
    if (RA.ViewZoom && RA.ViewZoom.MODES.indexOf(mode) < 0) return false;
    var p = Object.assign({}, state.prefs || defaultPrefs(), { viewMode: mode });
    applyViewMode(mode);
    savePlayPrefs(p, '视野:' + (mode === 'classic' ? '标准' : '广'));
    return true;
  }
  function changeFloorHeal(v) {
    var n = Number(v);
    if (RA.PlayPreferences && RA.PlayPreferences.HEAL_AMOUNTS.indexOf(n) < 0) return false;
    var p = Object.assign({}, state.prefs || defaultPrefs(), { floorHealAmount: n });
    if (state.session && state.session.setFloorHealAmount) state.session.setFloorHealAmount(n);
    savePlayPrefs(p, '换层额外回血:' + n + '(从下一次真实换层起)');
    return true;
  }
  function changeTowerMode(v) {
    if (RA.PlayPreferences && RA.PlayPreferences.TOWER_MODES.indexOf(v) < 0) return false;
    var p = Object.assign({}, state.prefs || defaultPrefs(), { towerMode: v });
    savePlayPrefs(p, v === 'easy' ? '塔模式:简单(0–20，无Boss)' : '塔模式:经典(0–40，双Boss)');
    return true;
  }
  function bindPlayPrefs() {
    var mainView = $('set-view-mode'), pauseView = $('pause-view-mode');
    var mainHeal = $('set-floor-heal'), pauseHeal = $('pause-floor-heal');
    if (mainView) mainView.addEventListener('change', function () { changeViewMode(mainView.value); syncPlayPrefControls(true); });
    if (pauseView) pauseView.addEventListener('change', function () { changeViewMode(pauseView.value); syncPlayPrefControls(true); });
    if (mainHeal) mainHeal.addEventListener('change', function () { changeFloorHeal(mainHeal.value); syncPlayPrefControls(true); });
    if (pauseHeal) pauseHeal.addEventListener('change', function () { changeFloorHeal(pauseHeal.value); syncPlayPrefControls(true); });
    ['set-tower-mode', 'pause-tower-mode'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () { changeTowerMode(el.value); syncPlayPrefControls(true); });
    });
    syncPlayPrefControls();
  }

  function fixedFloors() {
    var fixed = RA.FULL40.fixed;
    return { lobby: clone(fixed.lobby), rest: clone(fixed.rest), boss: clone(fixed.boss), easyFinish: clone(RA.FULL40.easyFinish) };
  }

  function isFull40() {
    return !!(state.manifest && state.manifest.layout === 'full40-v1');
  }
  function isEasy() {
    return !!(state.manifest && state.manifest.layout === 'easy20-v1');
  }
  function prefTowerMode() {
    return (state.prefs && state.prefs.towerMode === 'classic') ? 'classic' : 'easy';
  }

  async function ensurePool() {
    var repo = state.repo;
    // 内置候选不依赖浏览器发布库;无 repo 时仍可开始(test3补位/内置图)
    if (!repo) return { ok: true, value: { resetApplied: false, noRepo: true } };
    var epoch = (RA.FULL40 && RA.FULL40.poolEpoch) || '';
    if (typeof repo.ensurePoolEpoch !== 'function') return { ok: true, value: { resetApplied: false } };
    return repo.ensurePoolEpoch(epoch);
  }

  function builtinCandidates() {
    return (RA.NORMAL_LEVELS || []).filter(function (r) {
      return r && r.data && (r.data.kind === 'normal') &&
        [1, 2, 3, 4].indexOf(Number(r.data.difficulty)) >= 0;
    }).map(function (r) {
      return { levelId: r.levelId, contentHash: r.contentHash, source: 'builtin', data: clone(r.data) };
    });
  }

  function collectCandidates(published) {
    var seen = {}, out = [];
    builtinCandidates().concat(published || []).forEach(function (r) {
      var d = r.data || r;
      if (!d || d.kind !== 'normal' || [1, 2, 3, 4].indexOf(Number(d.difficulty)) < 0) return;
      var hash = r.contentHash || (RA.LevelData && RA.LevelData.hashSync ? RA.LevelData.hashSync(d) : '');
      var k = String(d.id || r.levelId) + '\u0000' + hash;
      if (seen[k]) return;
      seen[k] = true;
      out.push({ levelId: d.id || r.levelId, contentHash: hash, source: r.source || 'published', data: clone(d) });
    });
    out.sort(function (a, b) { return (a.levelId + a.contentHash).localeCompare(b.levelId + b.contentHash); });
    return out;
  }

  async function refreshPoolStatus() {
    var el = $('pool-status');
    if (!el) return;
    var builtin = builtinCandidates();
    var published = [];
    var prep = await ensurePool();
    if (!prep.ok) { el.textContent = '正式池准备失败:[' + prep.error.code + '] ' + prep.error.message; return; }
    if (state.repo) {
      var list = await state.repo.listEligible({});
      if (!list.ok) { el.textContent = '发布库读取失败:[' + list.error.code + '] ' + list.error.message; return; }
      published = list.value;
    }
    var all = collectCandidates(published), by = { 1: 0, 2: 0, 3: 0, 4: 0 };
    all.forEach(function (r) { var d = r.data && r.data.difficulty; if (by[d] !== undefined) by[d]++; });
    el.textContent = '正式池:' + all.length + ' 张(1档 ' + by[1] + ' / 2档 ' + by[2] +
      ' / 3档 ' + by[3] + ' / 4档 ' + by[4] + ';内置 ' + builtin.length +
      ',浏览器发布 ' + published.length + ';每档最多9,不足test3补位)';
    return all;
  }


  function showMenu() {
    state.session = null;
    var ip0 = $('interact-prompt'); if (ip0) ip0.style.display = 'none';
    var score0 = $('score-text'); if (score0) score0.style.display = 'none';
    state.overlay = '';
    if (state.input) state.input.clearAll();
    clearTouchInput();
    closeSettings(true);
    document.body.classList.add('menu');
    document.body.classList.remove('playing');
    var menu = $('menu');
    if (menu) menu.style.display = 'flex';
    var pause = $('pause-overlay');
    if (pause) pause.style.display = 'none';
    var result = $('result-overlay');
    if (result) result.style.display = 'none';
    var hud = $('hud');
    if (hud) hud.style.display = 'none';
    var msg = $('menu-status');
    if (msg) msg.textContent = RA.short.lastMessage || '';
    refreshPoolStatus();
  }

  function start(floors, manifest, mode) {
    if (!Array.isArray(floors) || !floors.length) {
      $('menu-status').textContent = '没有可运行的楼层数据';
      return false;
    }
    var prevSession = state.session;
    var res = RA.GameSession.create({
      floors: floors, mode: mode, manifest: manifest || null, profile: 'run-v1', requireCloud: true,
      // 36:换层额外回血只对正式完整塔生效;传五档之一,非法值由 Session 归 0
      floorHealAmount: (state.prefs && state.prefs.floorHealAmount) || 0,
      // 37:固定休息小屋只做正式塔的独立侧场景;由页面显式注入,核心不读文件/DOM
      restHouseTemplate: ((mode === 'full40-formal' || mode === 'easy20-formal') && RA.FULL40 && RA.FULL40.restHouse) || null
    });
    if (!res.ok) {
      $('menu-status').textContent = '完整塔启动失败:[' + res.error.code + '] ' + res.error.message;
      return false;
    }
    state.session = res.value;
    if (prevSession && prevSession.dispose) prevSession.dispose();   // 30:旧局的箭/射击计时随会话释放
    if (state.assets) state.session.player.loadSprites(state.assets);
    state.floors = floors;
    state.manifest = manifest || null;
    state.mode = mode;
    state.paused = false;
    // 30:新局从 0 分开始;已保存的最高分不动。重试同塔也是新局 0(manifest 仍是原清单)。
    state.bestSubmitted = 0;
    state.held = { left: false, right: false, jump: false };
    if (state.input) state.input.clearAll();
    clearTouchInput();
    state.lastT = 0;
    // 38:新局重置视差参考,不把上一局的位置当真实水平移动
    state.parallax = RA.LargeBackground ? RA.LargeBackground.createParallaxState() : null;
    state.parallaxDiscontinuity = true;
    state.transition = RA.LargeBackground ? RA.LargeBackground.createTransitionState() : null;
    state.largeGroup = largeGroupOf(state.session);
    state.largeGroupReset = false;
    var c0 = camCenterOn(state.session.player.x + state.session.player.w / 2,
      state.session.player.y + state.session.player.h / 2);
    state.cam.x = c0.x;
    state.cam.y = c0.y;
    var menu = $('menu'); if (menu) menu.style.display = 'none';
    document.body.classList.remove('menu');
    document.body.classList.add('playing');
    applyLayout();
    var hud = $('hud'); if (hud) hud.style.display = 'flex';
    var pause = $('pause-overlay'); if (pause) pause.style.display = 'none';
    var result = $('result-overlay'); if (result) result.style.display = 'none';
    RA.short.lastMessage = '';
    return true;
  }

  async function startFormal(seedArg) {
    if (!RA.FULL40 || !RA.FULL40.fixed || !RA.FULL40.fallback) {
      $('menu-status').textContent = '缺少完整塔运行数据 js/full40-samples.js;运行 node tools/sync_full40_levels.mjs';
      return false;
    }
    var seedSource = seedArg;
    if (!seedSource) { var si = $('seed-input'); if (si && si.value.trim()) seedSource = si.value; }
    var parsed = RA.SeedText ? RA.SeedText.parse(seedSource || state.seedText) : { ok: false, message: '缺少种子模块' };
    if (!parsed.ok) {
      $('menu-status').textContent = '种子无效:' + (parsed.message || parsed.code);
      return false;
    }
    state.seedText = parsed.text;
    state.seedValue = parsed.value;
    var prep = await ensurePool();
    if (!prep.ok) {
      $('menu-status').textContent = '正式池准备失败:[' + prep.error.code + '] ' + prep.error.message;
      return false;
    }
    var published = [];
    if (state.repo) {
      var eligible = await state.repo.listEligible({});
      if (!eligible.ok) {
        $('menu-status').textContent = '读取正式池失败:[' + eligible.error.code + '] ' + eligible.error.message;
        return false;
      }
      published = eligible.value;
    }
    var candidates = collectCandidates(published);
    var mode = prefTowerMode();
    var plan = mode === 'classic' ? RA.TowerPlanner.buildFull40({
      seed: parsed.value, candidates: candidates, fixedLevels: fixedFloors(),
      fallback: RA.FULL40.fallback, poolEpoch: (RA.FULL40 && RA.FULL40.poolEpoch) || ''
    }) : RA.TowerPlanner.buildEasy20({
      seed: parsed.value, candidates: candidates, fixedLevels: fixedFloors(),
      fallback: RA.FULL40.fallback, poolEpoch: (RA.FULL40 && RA.FULL40.poolEpoch) || ''
    });
    if (!plan.ok) {
      $('menu-status').textContent = '生成完整塔失败:[' + plan.error.code + '] ' + plan.error.message;
      return false;
    }
    state.poolInfo = {
      published: published.length,
      builtin: builtinCandidates().length,
      candidates: candidates.length,
      fallback: plan.value.fallbackCount,
      perDifficulty: plan.value.perDifficulty
    };
    var floors = plan.value.floors.map(function (f) { return clone(f.data); });
    var okStart = start(floors, plan.value, mode === 'classic' ? 'full40-formal' : 'easy20-formal');
    if (okStart) {
      $('menu-status').textContent = '';
      refreshPoolStatus();
    }
    return okStart;
  }

  function retrySame() {
    if (!state.floors.length) { showMenu(); return false; }
    // 重试使用本局清单快照,不重新读取发布池
    return start(state.floors, state.manifest, state.mode);
  }

  function finish(kind) {
    updateHud();
    var ov = $('result-overlay');
    if (!ov) return;
    ov.style.display = 'flex';
    var full = isFull40();
    var easy = isEasy();
    $('result-title').textContent = kind === 'won' ? (full ? '完整塔通过' : (easy ? '简单模式通过' : '短塔通过')) : '死亡';
    $('result-text').textContent = kind === 'won'
      ? (full ? '0–40 完整塔已通关(20 层后按 F 进入 21,40 层 BOSS 击败)。本次为本地运行结果,不生成作者认证。'
        : (easy ? '0–20 简单模式已通关(真实进入 20 层即胜利,无 Boss)。本次为本地运行结果,不生成作者认证。'
          : '调试短塔已通关;这不是完整塔胜利,也不生成认证。'))
      : (full ? '已回到 0 层状态。可以重试同一座塔(同一份 41 槽清单),不会重新抽选。'
        : (easy ? '已回到大厅状态。可以重试同一座塔(同一份 21 槽清单),不会重新抽选。'
          : '已回到大厅状态。可以重试同一座塔,不会重新抽选。'));
    $('btn-retry').style.display = kind === 'dead' ? 'inline-block' : 'none';
    // 30:死亡/胜利界面显示本次得分(与被冻结的会话 score 一致);试玩/调试短塔没有分数
    var scoreEl = $('result-score');
    if (scoreEl) {
      var snap = state.session && state.session.snapshot ? state.session.snapshot() : null;
      if (snap && typeof snap.score === 'number') {
        scoreEl.style.display = 'block';
        scoreEl.textContent = '本次得分 ' + snap.score;
        // 结果界面再结算一次最高分(已写过的不会重复写;写失败会如实留着提示)
        retryHighScore();
        if (state.highScoreError) scoreEl.textContent += '(最高分未保存)';
      } else {
        scoreEl.style.display = 'none';
        scoreEl.textContent = '';
      }
    }
  }

  // ---------------- 30:只读历史最高分(独立 key,只存一个 max) ----------------
  /** 读回可信历史最高分;损坏/不可用时保留 0 并记下真实原因,不清理别的存储 */
  function readHighScore() {
    var store = RA.HighScoreStore;
    if (!store) { state.highScoreError = '缺少最高分模块'; return 0; }
    var res = store.read(globalThis.localStorage);
    if (res.ok) { state.highScoreError = ''; return res.value.bestScore; }
    state.highScoreError = (res.error && res.error.message) || '最高分不可用';
    return (res.value && res.value.bestScore) || 0;
  }

  function renderHighScore() {
    var v = $('high-score-value');
    if (v) v.textContent = String(state.bestScore || 0);
    var st = $('high-score-status');
    if (st) {
      st.textContent = state.highScoreError
        ? (state.highScoreError + ';本局得分仍正常,原最高分没有被覆盖')
        : '只保存一个历史最高值;没有逐局记录/日期/种子排行';
    }
  }

  /** 提交一次 max;只在破纪录时调用(不每帧写) */
  function submitHighScore(score) {
    var store = RA.HighScoreStore;
    if (!store) return false;
    var res = store.submit(globalThis.localStorage, score);
    if (res.ok) {
      state.bestScore = res.value.bestScore;
      state.highScoreError = '';
      renderHighScore();
      return true;
    }
    state.highScoreError = (res.error && res.error.message) || '最高分未保存';
    renderHighScore();
    return false;
  }

  /** 本局分数超过已尝试提交的最大值才写一次;失败后不会每帧重试 */
  function trackScore(score) {
    if (typeof score !== 'number' || !isFinite(score)) return;
    if (!(score > state.bestSubmitted)) return;
    state.bestSubmitted = score;
    if (score > state.bestScore) submitHighScore(score);
  }

  /** 显式重试(结果页/设置打开时):仍是取 max,旧合法最高分不会被降低 */
  function retryHighScore() {
    var s = state.session;
    if (!s || s.formal !== true) return false;
    var snap = s.snapshot ? s.snapshot() : null;
    if (!snap || typeof snap.score !== 'number') return false;
    if (snap.score <= state.bestScore) return false;
    state.bestSubmitted = Math.max(state.bestSubmitted, snap.score);
    return submitHighScore(snap.score);
  }

  // ---------------- B3 语义输入 / 触控 / 布局 / 生命周期 ----------------
  function setPaused(paused, reason) {
    if (!state.session) return;
    if (state.input) state.input.clearAll();
    if (paused) clearTouchInput();
    if (paused) { state.session.pause(); state.paused = true; }
    else { state.paused = false; state.session.resume(); }
    var ov = $('pause-overlay');
    if (ov) ov.style.display = paused ? 'flex' : 'none';
    var r = $('pause-reason'); if (r && reason) r.textContent = reason;
    // 36:暂停面板显示当前档位/回血设置,可当场改(从下一次换层起生效)
    if (paused) syncPlayPrefControls();
  }

  function togglePause() {
    if (!state.session || state.session.status !== 'running') return;
    setPaused(!state.session.paused, '手动暂停');
  }

  function setMenuNote(text) {
    var el = $('import-status');
    if (el) el.textContent = text || '';
  }

  function applyLayout() {
    var host = $('touch-controls');
    if (!host || !state.layout) return;
    var rect = host.getBoundingClientRect ? host.getBoundingClientRect() : { width: state.cw, height: state.ch };
    var w = rect.width || state.cw, h = rect.height || state.ch;
    // 安全区域由 #touch-controls 的 inset 提供;布局只在剩余区域内归一化
    var boxes = RA.ControlLayout.resolve(state.layout, { width: w, height: h });
    RA.ControlLayout.ACTIONS.forEach(function (action) {
      var btn = host.querySelector('[data-action="' + action + '"]');
      if (!btn) return;
      var b = boxes[action];
      btn.style.left = b.left + 'px';
      btn.style.top = b.top + 'px';
      btn.style.width = b.w + 'px';
      btn.style.height = b.h + 'px';
    });
  }

  function selectLayoutAction(action) {
    state.selectedAction = action;
    var sel = $('layout-selected'); if (sel) sel.textContent = action;
    var size = state.layout && state.layout.buttons[action] ? state.layout.buttons[action].size : 0.14;
    var slider = $('layout-size'); if (slider) slider.value = Math.round(size * 100);
    var lab = $('layout-size-label'); if (lab) lab.textContent = Math.round(size * 100) + '%';
    document.querySelectorAll('.tbtn').forEach(function (b) {
      b.classList.toggle('layout-on', b.dataset.action === action);
    });
  }

  function openSettings() {
    if (!state.session && !state.layout) return;
    if (state.session && state.session.status === 'running' && !state.session.paused) {
      setPaused(true, '布局设置,模拟已暂停');
    }
    state.layoutEdit = true;
    document.body.classList.add('settings');
    var ov = $('settings-overlay'); if (ov) ov.style.display = 'flex';
    var st = $('layout-status'); if (st) st.textContent = '';
    selectLayoutAction(state.selectedAction || 'left');
    applyLayout();
  }

  function closeSettings(silent) {
    state.layoutEdit = false;
    document.body.classList.remove('settings');
    var ov = $('settings-overlay'); if (ov) ov.style.display = 'none';
    document.querySelectorAll('.tbtn').forEach(function (b) { b.classList.remove('layout-on'); });
    if (!silent && state.session && state.session.paused) {
      var p = $('pause-overlay'); if (p) p.style.display = 'flex';
    }
  }

  function saveLayout() {
    var res = RA.ControlLayout.save(globalThis.localStorage, state.layout);
    var st = $('layout-status');
    if (!res.ok) {
      if (st) st.textContent = res.error.message + '(当前屏幕上的新位置未持久化)';
      return false;
    }
    state.layout = res.value;
    applyLayout();
    if (st) st.textContent = '布局已保存';
    return true;
  }

  function resetLayout() {
    state.layout = RA.ControlLayout.defaults();
    var st = $('layout-status'); if (st) st.textContent = '已恢复默认(点保存后持久化)';
    applyLayout(); selectLayoutAction(state.selectedAction || 'left');
  }

  var touchControllers = [];

  /** 清空所有按钮的触点追踪和视觉;后台/暂停/菜单/重开必须一起清 */
  function clearTouchInput() {
    touchControllers.forEach(function (c) { c.clear(); });
  }

  function setupTouchButtons() {
    var host = $('touch-controls');
    if (!host) return;
    var labels = { left: '◀', right: '▶', jump: '跳', skill: 'K' };
    touchControllers = [];
    RA.ControlLayout.ACTIONS.forEach(function (action) {
      var btn = document.createElement('button');
      btn.className = 'tbtn';
      btn.type = 'button';
      btn.dataset.action = action;
      btn.textContent = labels[action] || action;
      btn.setAttribute('aria-label', action);
      // 每个按钮维护 pointerId -> source 的实际活动触点,避免后来的触点覆盖旧来源
      var sources = new Map();
      var dragPointer = null;
      function release(pointerId) {
        var id = pointerId === undefined ? '' : String(pointerId);
        var source = sources.get(id);
        if (source && state.input) state.input.releaseSource(source);
        sources.delete(id);
        if (!sources.size) btn.classList.remove('active');
      }
      function clear() {
        sources.forEach(function (source) { if (state.input) state.input.releaseSource(source); });
        sources.clear();
        dragPointer = null;
        btn.classList.remove('active');
      }
      touchControllers.push({ clear: clear });
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (state.layoutEdit) {
          // 拖动锁定实际 pointerId;第二个触点不能劫持/提前结束拖动
          if (dragPointer !== null && dragPointer !== e.pointerId) return;
          dragPointer = e.pointerId;
          selectLayoutAction(action);
          try { btn.setPointerCapture(e.pointerId); } catch (err) {}
          return;
        }
        var id = String(e.pointerId);
        if (sources.has(id)) release(id);
        var source = 'pointer:' + id;
        sources.set(id, source);
        if (action === 'skill') {
          if (state.input) state.input.press('skill');
        } else if (state.input) {
          state.input.setHeld(source, action, true);
        }
        btn.classList.add('active');
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      });
      btn.addEventListener('pointermove', function (e) {
        if (!state.layoutEdit || dragPointer !== e.pointerId) return;
        var rect = host.getBoundingClientRect();
        state.layout = RA.ControlLayout.moveTo(state.layout, action,
          e.clientX - rect.left, e.clientY - rect.top, { width: rect.width, height: rect.height });
        applyLayout();
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
        btn.addEventListener(ev, function (e) {
          if (dragPointer === e.pointerId) dragPointer = null;
          release(e.pointerId);
        });
      });
      btn.addEventListener('pointerleave', function (e) { release(e.pointerId); });
      host.appendChild(btn);
    });
    selectLayoutAction(state.selectedAction || 'left');
  }

  function setupInput() {
    state.input = new RA.ActionInput();
    var KEY_LEFT = { ArrowLeft: 1, KeyA: 1 };
    var KEY_RIGHT = { ArrowRight: 1, KeyD: 1 };
    var KEY_JUMP = { Space: 1, ArrowUp: 1, KeyW: 1 };
    function keyAction(code) {
      if (KEY_LEFT[code]) return 'left';
      if (KEY_RIGHT[code]) return 'right';
      if (KEY_JUMP[code]) return 'jump';
      return '';
    }
    globalThis.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var tg = e.target;
      if (tg && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tg.tagName || '')) return;
      var a = keyAction(e.code);
      if (a) { e.preventDefault(); state.input.setHeld('key:' + e.code, a, true); return; }
      if (e.code === 'KeyK') { e.preventDefault(); state.input.press('skill'); return; }
      if (e.code === 'KeyF' || e.code === 'KeyE') { e.preventDefault(); state.input.press('interact'); return; }
      if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); state.input.press('pause'); }
    });
    globalThis.addEventListener('keyup', function (e) {
      var a = keyAction(e.code);
      if (a) state.input.releaseSource('key:' + e.code);
    });
  }

  function handleBack() {
    if (state.layoutEdit) { closeSettings(); return true; }
    var result = $('result-overlay');
    if (result && result.style.display === 'flex') { showMenu(); return true; }
    var pause = $('pause-overlay');
    if (pause && pause.style.display === 'flex') { showMenu(); return true; }
    if (state.session && state.session.status === 'running') {
      setPaused(true, '返回键,模拟已暂停'); return true;
    }
    if (state.bridge && state.bridge.Capacitor && state.bridge.Capacitor.isNativePlatform()) {
      try { state.bridge.App.exitApp(); } catch (e) {}
      return true;
    }
    return false;
  }

  function setupLifecycle() {
    var bridge = state.bridge;
    var native = !!(bridge && bridge.Capacitor && bridge.Capacitor.isNativePlatform());
    state.lifecycle = RA.PlatformLifecycle.create({
      input: state.input,
      document: document,
      subscribe: native ? bridge.App : null,
      onBackground: function () {
        clearTouchInput();
        if (state.session && state.session.status === 'running' && !state.session.paused) {
          setPaused(true, '切到后台/锁屏,模拟已暂停');
        }
      },
      onForeground: function () {
        // 保持暂停;由用户明确点继续,不按现实时间补算
        clearTouchInput();
        if (state.input) state.input.clearAll();
      },
      onBack: handleBack
    });
  }

  async function pickImport() {
    setMenuNote('正在打开系统文件选择…');
    var picked = await RA.PlatformFiles.pickJSON({ bridge: state.bridge, document: document });
    if (!picked.ok) {
      setMenuNote(picked.error.code === 'CANCELLED' ? '已取消导入,内容库没有变化' :
        ('导入失败:[' + picked.error.code + '] ' + picked.error.message));
      return false;
    }
    var repo = RA.short.repo;
    if (!repo) { setMenuNote('内容库不可用,未导入'); return false; }
    var res = await repo.importLevel(picked.value.text);
    if (!res.ok) {
      setMenuNote('导入被拒绝:[' + res.error.code + '] ' + res.error.message);
      return false;
    }
    state.imported = res.value;
    try { state.importedData = JSON.parse(picked.value.text); } catch (e) { state.importedData = null; }
    var extra;
    if (res.value.eligible) extra = '已通过当前内容/规则校验,可明确加入正式池';
    else if (res.value.runnable === false) extra = '已保存为不可运行草稿:' +
      ((res.value.issues || []).slice(0, 2).join(';') || '存在不支持内容');
    else extra = '仅保存为不可选草稿:' + (res.value.issues && res.value.issues[0] || '未认证');
    setMenuNote('已导入 ' + picked.value.name + ';' + extra);
    var add = $('btn-add-import');
    if (add) add.style.display = res.value.eligible ? 'inline-block' : 'none';
    return true;
  }

  async function addImported() {
    if (!state.imported) { setMenuNote('还没有成功导入的内容'); return false; }
    var repo = RA.short.repo;
    var res = await repo.publishImported({
      draftId: state.imported.draftId, expectedRevision: state.imported.revision
    });
    if (!res.ok) {
      setMenuNote('加入正式池失败:[' + res.error.code + '] ' + res.error.message);
      return false;
    }
    setMenuNote('已加入正式池(来源 imported-declaration);仍是本地内容,不冒充 PC 人工通关。');
    var add = $('btn-add-import'); if (add) add.style.display = 'none';
    await refreshPublishedVersions();
    await refreshSettingsPool();
    return true;
  }

  async function exportCurrent() {
    var data = state.importedData;
    if (!data && state.session) {
      var f = state.session.world.floorsData[state.session.world.current];
      if (f) data = clone(f);
    }
    if (!data) { setMenuNote('先导入一个关卡,或开始短塔后再导出当前关卡'); return false; }
    var enc = RA.LevelData.encode(data);
    if (!enc.ok) { setMenuNote('导出编码失败:' + enc.error.message); return false; }
    var name = (data.id || 'reverse_abyss-level') + '.json';
    var res = await RA.PlatformFiles.exportJSON({ name: name, text: enc.value },
      { bridge: state.bridge, document: document });
    if (!res.ok) { setMenuNote('导出失败:[' + res.error.code + '] ' + res.error.message); return false; }
    var s = res.value.status;
    setMenuNote(s === 'written' ? ('已写入 ' + res.value.location) :
      s === 'share-opened' ? ('已写入/打开系统分享:' + res.value.location) :
        '下载已发起(浏览器不保证写入完成)');
    return true;
  }

  // ---------------- 渲染 ----------------
  /** 从不依赖 inset/aspect-ratio 的 CSS 可见视口算 16:9 展示区域 */
  function layoutViewport() {
    var vw = Number(globalThis.innerWidth) || (document.documentElement && document.documentElement.clientWidth) || W;
    var vh = Number(globalThis.innerHeight) || (document.documentElement && document.documentElement.clientHeight) || H;
    if (!(vw > 0)) vw = W;
    if (!(vh > 0)) vh = H;
    var ratio = 16 / 9;
    var w = vw, h = vw / ratio;
    if (h > vh) { h = vh; w = vh * ratio; }
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    state.cw = w; state.ch = h;
    var wrap = $('wrap');
    if (wrap) {
      wrap.style.left = Math.floor((vw - w) / 2) + 'px';
      wrap.style.top = Math.floor((vh - h) / 2) + 'px';
      wrap.style.width = w + 'px';
      wrap.style.height = h + 'px';
    }
    resize();
  }

  function resize() {
    var cv = state.canvas;
    if (!cv) return;
    state.cw = Math.max(1, Math.round(state.cw || W));
    state.ch = Math.max(1, Math.round(state.ch || H));
    state.dpr = globalThis.devicePixelRatio || 1;
    cv.width = Math.round(state.cw * state.dpr);
    cv.height = Math.round(state.ch * state.dpr);
    if (state.ctx) state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    applyLayout();
  }

  function showFatal(message) {
    var ov = $('fatal-overlay');
    var tx = $('fatal-text');
    if (tx) tx.textContent = String(message || '未知错误') + '（可截图反馈；未清除本地草稿）';
    if (ov) ov.style.display = 'flex';
  }

  function diagnostics() {
    function rect(id) {
      var el = $(id);
      if (!el || !el.getBoundingClientRect) return null;
      var r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    }
    return {
      innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight,
      dpr: globalThis.devicePixelRatio || 1,
      visualViewport: globalThis.visualViewport ? {
        width: globalThis.visualViewport.width, height: globalThis.visualViewport.height,
        scale: globalThis.visualViewport.scale
      } : null,
      supports: {
        inset: globalThis.CSS && CSS.supports ? CSS.supports('top: 0px') : null,
        aspectRatio: globalThis.CSS && CSS.supports ? CSS.supports('aspect-ratio: 16 / 9') : null,
        env: globalThis.CSS && CSS.supports ? CSS.supports('padding-top: env(safe-area-inset-top)') : null
      },
      wrap: rect('wrap'), canvas: rect('short-canvas'),
      canvasBuffer: state.canvas ? { width: state.canvas.width, height: state.canvas.height } : null,
      menu: rect('menu'),
      menuBox: $('menu') ? (function(){var b=$('menu').querySelector('.box'); if(!b)return null;var r=b.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};})() : null,
      settings: rect('settings-overlay'),
      session: state.session ? { status: state.session.status, paused: state.session.paused } : null
    };
  }

  // 对象绘制与单图试玩共用同一份(位置/存活状态一致,不在页面里各写一套)
  function drawObject(ctx, inst, o, cam) {
    return RA.drawFloorObject(ctx, inst, o, cam, state.assets);
  }

  /** 38:当前活动场景对应的大背景组(正式按真实槽号;小屋/10/30 都第一组) */
  function largeGroupOf(s) {
    if (!RA.LargeBackground || !s) return null;
    if (s.sceneKind === 'rest-house') return RA.LargeBackground.groupForTower({ sceneKind: 'rest-house' });
    if (!s.world) return null;
    return RA.LargeBackground.groupForTower({ floorNumber: s.world.current });
  }

  function render() {
    var ctx = state.ctx;
    if (!ctx || !state.session) return;
    var cam = state.cam;
    var view = viewWorld();
    var g = ctx.createLinearGradient(0, 0, 0, state.ch);
    g.addColorStop(0, '#0a0f1e'); g.addColorStop(1, '#05060c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, state.cw, state.ch);
    // 38:三层大背景在 CSS 屏幕空间、ViewZoom 之前;缺组/缺图保留渐变
    if (RA.LargeBackground && state.parallax) {
      if (state.transition && state.transition.active) {
        RA.LargeBackground.drawTransition(ctx, {
          state: state.transition, width: state.cw, height: state.ch, u: state.parallax.u
        }, state.assets);
      } else {
        RA.LargeBackground.draw(ctx, {
          groupId: largeGroupOf(state.session), width: state.cw, height: state.ch, u: state.parallax.u
        }, state.assets);
      }
    }
    // 32:背景按屏幕画;世界层统一缩放 zoom(DPR 已由 resize 的 setTransform 处理,不重复)
    ctx.save();
    if (RA.ViewZoom) RA.ViewZoom.apply(ctx);
    // 37:休息小屋只画本图(底色/背景/地形/固定道具/光环/玩家),不叠整座塔
    var scene = state.session.activeSceneView ? state.session.activeSceneView() : null;
    if (scene && scene.kind === 'rest-house') {
      if (scene.level) {
        scene.level.draw(ctx, { ox: cam.x, oy: cam.y, vw: view.w, vh: view.h }, state.assets);
      }
      // 38:门只保留真实交互区,不再画黄色框/常驻 F 文字
      var props = state.session.restHouse ? state.session.restHouse.renderData() : [];
      props.forEach(function (prop) {
        if (!prop.visible) return;
        var img = state.assets.image(prop.asset);
        var x = prop.col * TS - cam.x;
        var y = (prop.row + 1) * TS - cam.y - TS;
        if (img) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, x, y, TS, TS);
        } else {
          ctx.fillStyle = prop.id === 'milk' ? '#e8eefb' : (prop.id === 'berries' ? '#c0507a' : '#e08a3c');
          ctx.fillRect(x + 6, y + 6, TS - 12, TS - 12);
        }
      });
      var hp = state.session.player;
      if (RA.drawPlayerHalo) RA.drawPlayerHalo(ctx, hp, state.session.run, cam, state.assets);
      if (Object.keys(hp.frames || {}).length) hp.draw(ctx, { ox: cam.x, oy: cam.y }, state.assets);
      else { ctx.fillStyle = '#ffcd6e'; ctx.fillRect(hp.x - cam.x, hp.y - cam.y, hp.w, hp.h); }
      ctx.restore();
      return;
    }
    var insts = state.session.world.instances;
    Array.from(insts.keys()).sort(function (a, b) { return a - b; }).forEach(function (i) {
      var inst = insts.get(i);
      if (inst.state === 'snapshot') {
        inst.level.draw(ctx, { ox: cam.x - inst.origin.x, oy: cam.y - inst.origin.y, vw: view.w, vh: view.h }, state.assets);
        return;
      }
      inst.level.draw(ctx, { ox: cam.x - inst.origin.x, oy: cam.y - inst.origin.y, vw: view.w, vh: view.h }, state.assets);
      // 33:齿轮轨道用作者图(共享 path 只画一遍);移动火球游玩中仍不显示路径
      if (RA.drawGearTracks) RA.drawGearTracks(ctx, inst, cam, state.assets);
      inst.objects.forEach(function (o) {
        if (o.type !== 'sewage_pool') return;
        drawObject(ctx, inst, o, cam);
      });
      inst.objects.forEach(function (o) {
        if (o.type === 'sewage_pool') return;
        drawObject(ctx, inst, o, cam);
      });
      // 30/32:箭与火焰弹只属于当前 active 实例
      if (RA.drawFloorArrows) RA.drawFloorArrows(ctx, inst, cam, state.assets);
      if (RA.drawFloorBolts) RA.drawFloorBolts(ctx, inst, cam, state.assets);
      var openL = inst.origin.x + inst.exitCol * TS - cam.x;
      var openR = openL + RA.LevelData.PORT.openingCols * TS;
      ctx.strokeStyle = inst.exitOpen === false ? 'rgba(255,120,100,.7)' : 'rgba(255,205,110,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(openL, inst.origin.y - cam.y); ctx.lineTo(openR, inst.origin.y - cam.y); ctx.stroke();
    });
    // 云板石管:只画“两端实例都已实存”的运行几何;规划链接不是加载状态
    (state.session.world.liveStoneLinks ? state.session.world.liveStoneLinks() : []).forEach(function (link) {
      if (!link || link.kind !== 'stone-pipe' || !link.walls) return;
      // 39:管底作者图(64×48)按外4×3贴,clip到真实内2×3;两侧换现有 stone_bricks
      var pipeImg = state.assets ? state.assets.image('background/pipe-bricks') : null;
      var ix = link.inner.x - cam.x, iy = link.inner.y - cam.y;
      if (pipeImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(ix, iy, link.inner.w, link.inner.h);
        ctx.clip();
        var pipeTinted = (RA.tintLevelBackgroundImage && RA.C.VISUAL.pipeBackgroundDarkenAlpha)
          ? (RA.tintLevelBackgroundImage(pipeImg, RA.C.VISUAL.pipeBackgroundDarkenAlpha) || pipeImg) : pipeImg;
        ctx.drawImage(pipeTinted, ix - TS, iy, 4 * TS, 3 * TS);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(8,10,16,.9)';
        ctx.fillRect(ix, iy, link.inner.w, link.inner.h);
      }
      var skin = RA.TileSkins && RA.TileSkins.get ? RA.TileSkins.get('stone_bricks') : null;
      var stone = skin && state.assets ? state.assets.image(skin.asset) : null;
      link.walls.forEach(function (w) {
        for (var row = 0; row < 3; row++) {
          if (stone) RA.drawTile(ctx, '=', stone, w.x - cam.x, w.y - cam.y + row * TS, TS, { nearest: true });
          else { ctx.fillStyle = '#8a6a4a'; ctx.fillRect(w.x - cam.x, w.y - cam.y + row * TS, TS, TS); }
        }
      });
    });
    // 38:休息区小屋门不画黄框/文字;只保留核心 prompt/action 与 F
    // boss + hazards
    var boss = state.session.boss;
    if (boss && !boss.defeated) {
      ctx.fillStyle = boss.state === 'exposed' ? '#ff9f43' : '#b06bff';
      ctx.fillRect(boss.x - cam.x, boss.y - cam.y, boss.w, boss.h);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(boss.state === 'exposed' ? 'EXPOSED' : ('SHIELD ' + boss.shieldRemaining.toFixed(1)),
        boss.x - cam.x, boss.y - cam.y - 8);
      boss.hazards.forEach(function (h) {
        if (h.type === 'laser') {
          ctx.fillStyle = 'rgba(255,80,80,.35)';
          ctx.fillRect(h.x - cam.x, h.y - cam.y, h.w, h.h);
        } else {
          ctx.fillStyle = 'rgba(255,120,80,.85)';
          ctx.beginPath(); ctx.arc(h.x - cam.x, h.y - cam.y, h.r, 0, Math.PI * 2); ctx.fill();
        }
      });
    }
    var p = state.session.player;
    // 33:正式塔原来漏画活动光环 —— 与独立试玩共用 RA.drawPlayerHalo(只读真实活动状态)
    if (RA.drawPlayerHalo) {
      RA.drawPlayerHalo(ctx, p, state.session.run, cam, state.assets);
    }
    if (Object.keys(p.frames || {}).length) p.draw(ctx, { ox: cam.x, oy: cam.y }, state.assets);
    else { ctx.fillStyle = '#ffcd6e'; ctx.fillRect(p.x - cam.x, p.y - cam.y, p.w, p.h); }
    ctx.restore();
  }

  function updateHud() {
    var s = state.session; if (!s) return;
    var snap = s.snapshot();
    var fill = $('hp-fill'); if (fill) fill.style.width = Math.max(0, snap.hp / snap.maxHp * 100) + '%';
    var hp = $('hp-text'); if (hp) hp.textContent = Math.max(0, Math.round(snap.hp)) + '/' + snap.maxHp;
    var halo = $('halo-text');
    if (halo) {
      if (snap.haloActiveRemaining > 0) halo.textContent = '光环 ' + snap.haloActiveRemaining.toFixed(1) + 's';
      else if (snap.haloCooldownRemaining > 0) halo.textContent = '冷却 ' + snap.haloCooldownRemaining.toFixed(1) + 's';
      else halo.textContent = '光环就绪 (K)';
    }
    var fl = $('floor-text');
    if (fl) {
      var fi = snap.floorNumber !== undefined ? snap.floorNumber : snap.floorIndex;
      var total = isFull40() ? 40 : (isEasy() ? 20 : (snap.floorCount - 1));
      var kind = snap.floor ? snap.floor.kind : 'normal';
      var label;
      var easyFinish = !!(snap.floor && snap.floor.easyFinish);
      if (kind === 'lobby') label = '大厅（0层）';
      else if (easyFinish) label = '第 ' + fi + '/' + total + ' 层 · 终点';
      else if (kind === 'rest') label = '第 ' + fi + '/' + total + ' 层 · 休整';
      else if (kind === 'boss') label = '第 ' + fi + '/' + total + ' 层 · BOSS';
      else label = '第 ' + fi + '/' + total + ' 层 · 普通';
      if (snap.sceneKind === 'rest-house') label += ' · 休息小屋';
      fl.textContent = label;
    }
    var prompt = $('interact-prompt');
    if (prompt) {
      var ip = (!s.paused && s.status === 'running' && s.interactionPrompt) ? s.interactionPrompt() : null;
      // 38:门交互仍走 prompt/action/F,但不显示 HUD 文字;道具/大厅/Boss 提示保留
      var doorHidden = ip && (ip.kind === 'enter-rest-house' || ip.kind === 'leave-rest-house' ||
        ip.action === 'enter-rest-house' || ip.action === 'leave-rest-house');
      prompt.style.display = (ip && !doorHidden) ? 'block' : 'none';
      if (ip && !doorHidden) prompt.textContent = ip.text;
    }
    var bs = $('boss-text');
    if (bs) {
      if (snap.boss) bs.textContent = 'Boss 阶段 ' + snap.boss.phase + ' · ' + snap.boss.state +
        (snap.boss.state === 'shielded' ? ' ' + snap.boss.shieldRemaining.toFixed(1) + 's' : '');
      else bs.textContent = '';
    }
    // 30:正式塔右上角显示得分;调试短塔/试玩 snapshot.score 为 null,不显示
    var scoreEl = $('score-text');
    if (scoreEl) {
      if (typeof snap.score === 'number') {
        scoreEl.style.display = 'block';
        scoreEl.textContent = '得分 ' + snap.score;
        trackScore(snap.score);
      } else {
        scoreEl.style.display = 'none';
      }
    }
  }

  function tick(now) {
    if (state.stopped) return;
    var dt = state.lastT ? (now - state.lastT) / 1000 : 0;
    state.lastT = now;
    if (dt > 0.25) dt = 0.25;
    var s = state.session;
    var act = state.input ? state.input.consume() : { held: state.held, pressed: {} };
    if (act.pressed && act.pressed.pause) togglePause();
    if (!s) return requestAnimationFrame(tick);
    if (act.pressed && act.pressed.skill && !s.paused && s.status === 'running') s.pressSkill();
    if (act.pressed && act.pressed.interact && !s.paused && s.status === 'running' && s.pressInteract) s.pressInteract();
    if (s) {
      if (!s.paused && s.status === 'running') {
        state.held = { left: act.held.left, right: act.held.right, jump: act.held.jumpHeld };
        s.setActions({ left: act.held.left, right: act.held.right, jumpHeld: act.held.jumpHeld });
        s.update(dt);
        var p = s.player;
        var cw2 = camCenterOn(p.x + p.w / 2, p.y + p.h / 2);
        var k = Math.min(1, dt * 7);
        state.cam.x += (cw2.x - state.cam.x) * k;
        state.cam.y += (cw2.y - state.cam.y) * k;
        // 39:先步进已有过渡;新组在事件处理里 begin,首帧进度 0。
        if (RA.LargeBackground && state.transition && state.transition.active) {
          RA.LargeBackground.stepTransition(state.transition, dt);
        }
        // 38:只有未暂停的真实步进才更新视差;只读 player.x,只水平
        if (RA.LargeBackground && state.parallax) {
          RA.LargeBackground.update(state.parallax, {
            playerX: p.x, groupId: largeGroupOf(s), discontinuity: state.parallaxDiscontinuity
          });
          state.parallaxDiscontinuity = false;
        }
      }
      var stepEvents = s.drainEvents();
      // 39:视觉换组只由真实石管接缝触发;F/小屋/调试/新局直接切组。
      var groupNow = largeGroupOf(s);
      var pipeChange = false;
      stepEvents.forEach(function (ev) {
        if (ev.type === 'sceneChanged' || (ev.type === 'floorEntered' && ev.transfer)) {
          if (RA.LargeBackground && state.transition) RA.LargeBackground.resetTransition(state.transition);
          state.largeGroup = groupNow;
          state.largeGroupReset = false;
          state.parallaxDiscontinuity = true;
        } else if (ev.type === 'floorEntered' && !ev.transfer) {
          pipeChange = true;
        }
      });
      if (state.largeGroupReset) {
        if (RA.LargeBackground && state.transition) RA.LargeBackground.resetTransition(state.transition);
        state.largeGroup = groupNow;
        state.largeGroupReset = false;
        state.parallaxDiscontinuity = true;
      } else if (pipeChange && state.largeGroup !== groupNow) {
        if (RA.LargeBackground && state.transition) {
          RA.LargeBackground.beginTransition(state.transition, {
            fromGroup: state.largeGroup, toGroup: groupNow,
            fromU: state.parallax ? state.parallax.u : 0, duration: (RA.C.VISUAL.largeBackground.transitionDuration || 0.5)
          });
        }
        state.largeGroup = groupNow;
      }
      stepEvents.forEach(function (ev) {
        if (ev.type === 'floorEntered' && ev.transfer) {
          // 传送后相机立即对准目标层,不缓慢穿过两段地图之间的空白
          // 38:传送重置视差参考;普通接缝不重置(组变才归0)
          state.parallaxDiscontinuity = true;
          var tp = s.player;
          var ct = camCenterOn(tp.x + tp.w / 2, tp.y + tp.h / 2);
          state.cam.x = ct.x;
          state.cam.y = ct.y;
        }
        if (ev.type === 'sceneChanged') {
          // 37:进门/出门立即按当前活动场景居中,并清掉仍按住的旧方向/交互
          // 38:场景切换后重置视差参考,避免把局部/世界坐标切换当水平移动
          state.parallaxDiscontinuity = true;
          var sp = s.player;
          var cs = camCenterOn(sp.x + sp.w / 2, sp.y + sp.h / 2);
          state.cam.x = cs.x;
          state.cam.y = cs.y;
          state.held = { left: false, right: false, jump: false };
          if (state.input) state.input.clearAll();
        }
        if (ev.type === 'dead' || ev.type === 'won') {
          if (RA.LargeBackground && state.transition) RA.LargeBackground.resetTransition(state.transition);
        }
        if (ev.type === 'dead') finish('dead');
        if (ev.type === 'won') finish('won');
      });
      render();
      updateHud();
    }
    state.raf = requestAnimationFrame(tick);
  }

  var SEED_KEY = 'ra_seed_texts_v1';

  function readSeedStore() {
    try {
      var raw = globalThis.localStorage && localStorage.getItem(SEED_KEY);
      var p = raw ? JSON.parse(raw) : null;
      if (!p || p.version !== 1) return { activeSeed: state.seedText, savedSeeds: [] };
      return {
        activeSeed: typeof p.activeSeed === 'string' ? p.activeSeed : state.seedText,
        savedSeeds: Array.isArray(p.savedSeeds) ? p.savedSeeds.filter(function (s) { return typeof s === 'string'; }) : []
      };
    } catch (e) { return { activeSeed: state.seedText, savedSeeds: [] }; }
  }
  function writeSeedStore(active, saved) {
    try {
      localStorage.setItem(SEED_KEY, JSON.stringify({ version: 1, activeSeed: active, savedSeeds: saved }));
      return true;
    } catch (e) { return false; }
  }
  function seedStatus(text) {
    var a = $('seed-status'); if (a) a.textContent = text || '';
    setMenuNote(text || '');
  }
  function refreshSeedUI() {
    var inp = $('seed-input');
    if (inp && document.activeElement !== inp) inp.value = state.seedText;
    var sel = $('seed-saved');
    if (sel) {
      sel.innerHTML = '';
      state.savedSeeds.forEach(function (s) {
        var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o);
      });
      if (!state.savedSeeds.length) { var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '(无)'; sel.appendChild(o0); }
    }
    // 发布池数量由当前仓库读取结果显示，不用已开始塔的 poolInfo 覆盖（下架不改旧塔）。
  }
  function applySeed(text) {
    var p = RA.SeedText ? RA.SeedText.parse(text) : { ok: false, code: 'NO_SEED', message: '缺少种子模块' };
    if (!p.ok) { seedStatus('种子未应用:' + (p.message || p.code)); return false; }
    state.seedText = p.text; state.seedValue = p.value;
    seedStatus('已按种子 ' + p.text + ' 重构;开始游戏会按当前正式池生成同一清单。');
    refreshSeedUI();
    previewSeed();
    return true;
  }
  function previewSeed() {
    if (!RA.TowerPlanner || !RA.FULL40 || !RA.FULL40.fallback) return;
    refreshPoolStatus().then(function (all) {
      var mode = prefTowerMode();
      var plan = mode === 'classic' ? RA.TowerPlanner.buildFull40({
        seed: state.seedValue, candidates: all || [], fixedLevels: fixedFloors(),
        fallback: RA.FULL40.fallback, poolEpoch: (RA.FULL40 && RA.FULL40.poolEpoch) || ''
      }) : RA.TowerPlanner.buildEasy20({
        seed: state.seedValue, candidates: all || [], fixedLevels: fixedFloors(),
        fallback: RA.FULL40.fallback, poolEpoch: (RA.FULL40 && RA.FULL40.poolEpoch) || ''
      });
      if (!plan.ok) { seedStatus('重构失败:[' + plan.error.code + '] ' + plan.error.message); return; }
      state.pendingPlan = plan.value;
      var by = plan.value.perDifficulty || {};
      seedStatus('已重构 ' + (mode === 'classic' ? 41 : 21) + ' 槽(种子 ' + state.seedText + ';每档 ' + JSON.stringify(by) + ');开始游戏时用当前池生成。');
    }).catch(function () { seedStatus('重构失败:正式池读取异常'); });
  }
  function randomSeed() {
    var r = RA.SeedText ? RA.SeedText.random(state.seedValue) : { text: 'RA-1', value: 1 };
    state.seedText = r.text; state.seedValue = r.value;
    seedStatus('已随机重构种子 ' + r.text + '(与之前不同)。');
    refreshSeedUI();
    previewSeed();
    return true;
  }
  function saveSeedText() {
    var p = RA.SeedText ? RA.SeedText.parse(state.seedText) : { ok: false, message: '缺少种子模块' };
    if (!p.ok) { seedStatus('保存失败:种子无效'); return false; }
    var saved = state.savedSeeds.slice();
    if (saved.indexOf(p.text) < 0) saved.push(p.text);
    saved.sort();
    if (!writeSeedStore(p.text, saved)) { seedStatus('保存失败:本地存储不可用;当前种子' + p.text + '仅本次有效'); return false; }
    state.savedSeeds = saved; state.seedText = p.text; state.seedValue = p.value;
    seedStatus('已保存种子文本 ' + p.text + '(只保存文本,不保存塔快照)。');
    refreshSeedUI();
    return true;
  }
  var publishedVersions = [], publishedBusy = false, publishedLoading = false, publishedRequest = 0;
  function publishedKey(r) { return JSON.stringify([r.levelId, r.contentHash]); }
  function selectedPublished() {
    var sel = $('published-version');
    return publishedVersions.find(function (r) { return sel && publishedKey(r) === sel.value; });
  }
  function builtinVersionNote(r) {
    var builtin = r && (RA.NORMAL_LEVELS || []).find(function (b) {
      return b.levelId === r.levelId && b.contentHash === r.contentHash;
    });
    return builtin ? '还有内置来源' + (builtin.path ? '（' + builtin.path + '）' : '') +
      '，需另删或移出 normal 源 JSON 并运行 node tools/sync_levels.mjs，刷新后才会完全退出新塔候选。' : '';
  }
  function publishedControls() {
    var sel = $('published-version'), btn = $('btn-unpublish'), refresh = $('btn-published-refresh');
    if (sel) sel.disabled = publishedBusy || publishedLoading || !publishedVersions.length;
    if (btn) btn.disabled = publishedBusy || publishedLoading || !selectedPublished();
    if (refresh) refresh.disabled = publishedBusy || publishedLoading;
    var source = $('published-source'), r = selectedPublished();
    if (source) source.textContent = r ? r.levelId + ' / ' + r.contentHash + '。' + builtinVersionNote(r) : '';
  }
  function unpublishStatus(message) { var el = $('unpublish-status'); if (el) el.textContent = message; }
  async function refreshSettingsPool() {
    await refreshPoolStatus();
    var d = $('pool-detail'), p = $('pool-status');
    if (d && p) d.textContent = p.textContent;
  }
  async function refreshPublishedVersions(preserveMessage) {
    if (publishedBusy) return false;
    var request = ++publishedRequest, sel = $('published-version');
    if (!sel) return false;
    var previous = sel.value;
    publishedLoading = true; publishedControls();
    try {
      if (!state.repo) throw new Error('浏览器发布库不可用');
      var res = await state.repo.listPublishedVersions();
      if (request !== publishedRequest) return false;
      if (!res.ok) throw new Error(res.error.message);
      publishedVersions = res.value;
      sel.textContent = '';
      publishedVersions.forEach(function (r) {
        var option = document.createElement('option'); option.value = publishedKey(r);
        option.textContent = r.title + ' · 难度 ' + (r.difficulty || '未知') + ' · ' + r.levelId +
          ' · ' + String(r.contentHash).replace(/^sha256:/, '').slice(0, 12) + (builtinVersionNote(r) ? ' · 另有内置' : '');
        sel.appendChild(option);
      });
      if (!publishedVersions.length) {
        var empty = document.createElement('option'); empty.value = ''; empty.textContent = '暂无浏览器发布版本'; sel.appendChild(empty);
      } else if (publishedVersions.some(function (r) { return publishedKey(r) === previous; })) sel.value = previous;
      if (!preserveMessage) unpublishStatus(state.repo.persistent ? '只列出当前浏览器发布记录。' : '当前为临时内存库，刷新后不保留。');
      return true;
    } catch (e) {
      if (request === publishedRequest) unpublishStatus('读取版本列表失败：' + e.message + '；保留原列表，可重试刷新。');
      return false;
    } finally {
      if (request === publishedRequest) { publishedLoading = false; publishedControls(); }
    }
  }
  async function unpublishSelected() {
    if (publishedBusy || publishedLoading) return false;
    var selected = selectedPublished();
    if (!selected) return false;
    // 捕获点击身份，不以异步返回时的新选择作为删除目标。
    var target = { levelId: selected.levelId, contentHash: selected.contentHash };
    if (!globalThis.confirm('移出浏览器发布池？\n' + selected.title + '\n' + target.levelId + '\n' + target.contentHash +
      '\n草稿、通过历史和磁盘文件保留。\n' + builtinVersionNote(target))) {
      unpublishStatus('已取消，发布池未变。'); return false;
    }
    publishedBusy = true; ++publishedRequest; publishedControls(); unpublishStatus('正在移出，等待存储事务完成…');
    try {
      var res = await state.repo.unpublish(target);
      if (!res.ok) throw new Error(res.error.message);
      unpublishStatus((res.value.removed ? '已移出浏览器发布池：' : '已不在浏览器发布池：') + target.levelId +
        ' / ' + target.contentHash + '。草稿和通过历史保留。' + builtinVersionNote(target));
      publishedBusy = false;
      await refreshPublishedVersions(true);
      await refreshSettingsPool();
      return true;
    } catch (e) {
      unpublishStatus('移出失败：' + e.message + '；未报告成功，请刷新或重试。'); return false;
    } finally { publishedBusy = false; publishedControls(); }
  }
  function openMainSettings() {
    var ov = $('main-settings'); if (ov) ov.style.display = 'flex';
    syncPlayPrefControls();
    // 30:设置只显示只读历史最高分;打开时读回可信值并给一次显式重试机会
    state.bestScore = readHighScore();
    retryHighScore();
    renderHighScore();
    refreshPublishedVersions();
    refreshPoolStatus().then(function () {
      var d = $('pool-detail'), p = $('pool-status');
      if (d && p) d.textContent = p.textContent;
      refreshSeedUI();
    }).catch(function () { refreshSeedUI(); });
  }
  function closeMainSettings() { var ov = $('main-settings'); if (ov) ov.style.display = 'none'; }
  function quitGame() {
    if (state.session && state.session.dispose) state.session.dispose();
    state.session = null;
    state.stopped = true;
    if (state.raf) { try { cancelAnimationFrame(state.raf); } catch (e) { /* ignore */ } state.raf = 0; }
    try { if (state.input) state.input.clearAll(); } catch (e) { /* ignore */ }
    showMenu();
    var ov = $('exit-overlay'); if (ov) ov.style.display = 'flex';
    var txt = $('exit-text');
    if (txt) txt.textContent = '本局已结束。浏览器不允许脚本关闭此标签页;请手动关闭标签页/窗口,或点返回主界面。';
    try { if (globalThis.close) globalThis.close(); } catch (e) { /* browser blocks it */ }
    return true;
  }
  function exitBack() {
    var ov = $('exit-overlay'); if (ov) ov.style.display = 'none';
    state.stopped = false; state.lastT = 0;
    if (!state.raf) state.raf = requestAnimationFrame(tick);
    showMenu();
  }

  function boot() {
    RA.short.diagnostics = diagnostics;
    globalThis.addEventListener('error', function (e) {
      if (e && e.message) showFatal(e.message);
    });
    globalThis.addEventListener('unhandledrejection', function (e) {
      showFatal(e && e.reason && e.reason.message || e && e.reason || 'Promise 失败');
    });
    state.canvas = $('short-canvas');
    state.ctx = state.canvas.getContext('2d');
    state.assets = new RA.Assets();
    state.bridge = globalThis.RA_CAP_BRIDGE || null;
    var native = !!(state.bridge && state.bridge.Capacitor && state.bridge.Capacitor.isNativePlatform());
    state.isTouch = native || (globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches) ||
      ((globalThis.navigator && navigator.maxTouchPoints) || 0) > 0 ||
      (globalThis.location && String(location.search).indexOf('touch=1') >= 0);
    if (state.isTouch) document.body.classList.add('touch');
    var loaded = RA.ControlLayout.load(globalThis.localStorage);
    state.layout = loaded.value;
    if (!loaded.ok) setMenuNote(loaded.error.message);
    setupInput();
    setupTouchButtons();
    globalThis.addEventListener('resize', layoutViewport);
    globalThis.addEventListener('orientationchange', layoutViewport);
    if (globalThis.visualViewport) globalThis.visualViewport.addEventListener('resize', layoutViewport);
    layoutViewport();
    // 36:先读游玩偏好(视野档位/换层回血),再建会话;失败按默认值并提示
    loadPlayPrefs();
    state.assets.loadAll(function () { if (state.session) state.session.player.loadSprites(state.assets); });
    setupLifecycle();
    RA.short.repo = RA.ContentRepository ? RA.ContentRepository.create() : null;
    state.repo = RA.short.repo;
    RA.short.startFormal = startFormal;
    RA.short.retrySame = retrySame;
    var startFormalBtn = $('btn-formal');
    if (startFormalBtn) startFormalBtn.addEventListener('click', function () { startFormal(); });
    var retryBtn = $('btn-retry');
    if (retryBtn) retryBtn.addEventListener('click', function () { retrySame(); });
    var menuBtn = $('btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', function () { showMenu(); });
    var resumeBtn = $('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', function () { setPaused(false); });
    var menuPauseBtn = $('btn-menu-pause');
    if (menuPauseBtn) menuPauseBtn.addEventListener('click', function () { showMenu(); });
    var pauseBtn = $('btn-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', function () { togglePause(); });
    var restartBtn = $('btn-restart');
    if (restartBtn) restartBtn.addEventListener('click', function () { retrySame(); });
    var settingsBtn = $('btn-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', function () { openSettings(); });
    bindPlayPrefs();
    var closeBtn = $('btn-layout-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeSettings(); });
    var saveBtn = $('btn-layout-save');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveLayout(); });
    var resetBtn = $('btn-layout-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () { resetLayout(); });
    var sizeInput = $('layout-size');
    if (sizeInput) sizeInput.addEventListener('input', function () {
      state.layout = RA.ControlLayout.setSize(state.layout, state.selectedAction, Number(sizeInput.value) / 100);
      var lab = $('layout-size-label'); if (lab) lab.textContent = Math.round(Number(sizeInput.value)) + '%';
      applyLayout();
    });
    var importBtn = $('btn-import');
    if (importBtn) importBtn.addEventListener('click', function () { pickImport(); });
    var addImportBtn = $('btn-add-import');
    if (addImportBtn) addImportBtn.addEventListener('click', function () { addImported(); });
    var seedStore = readSeedStore();
    state.seedText = seedStore.activeSeed; state.savedSeeds = seedStore.savedSeeds;
    var parsedSeed = RA.SeedText ? RA.SeedText.parse(state.seedText) : { ok: false };
    if (!parsedSeed.ok) { state.seedText = 'RA-1'; parsedSeed = { ok: true, value: 1, text: 'RA-1' }; }
    state.seedValue = parsedSeed.value;
    var bind = function (id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); };
    bind('btn-main-settings', openMainSettings);
    bind('btn-main-settings-close', closeMainSettings);
    bind('btn-unpublish', unpublishSelected);
    bind('btn-published-refresh', function () { refreshPublishedVersions(); });
    var publishedSelect = $('published-version');
    if (publishedSelect) publishedSelect.addEventListener('change', publishedControls);
    bind('btn-quit', quitGame);
    bind('btn-main-menu', showMenu);
    bind('btn-exit-back', exitBack);
    bind('btn-open-editor', function () { globalThis.location.href = 'editor.html'; });
    bind('btn-seed-apply', function () { applySeed($('seed-input') ? $('seed-input').value : state.seedText); });
    bind('btn-seed-random', randomSeed);
    bind('btn-seed-save', saveSeedText);
    bind('btn-seed-use', function () {
      var sel = $('seed-saved');
      if (!sel || !sel.value) { seedStatus('没有已保存种子可选'); return; }
      applySeed(sel.value);
    });
    var seedInput = $('seed-input');
    if (seedInput) seedInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') applySeed(seedInput.value); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var ov = $('main-settings');
      if (ov && ov.style.display === 'flex') { closeMainSettings(); e.preventDefault(); e.stopPropagation(); }
    }, true);
    refreshSeedUI();
    // 30:启动时读回历史最高分(只读显示);读失败/损坏不清理任何记录
    state.bestScore = readHighScore();
    renderHighScore();
    showMenu();
    applyLayout();
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.RA = globalThis.RA || {});
