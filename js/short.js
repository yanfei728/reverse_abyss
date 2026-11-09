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
    debugJumped: false,
    seedText: 'RA-1',
    seedValue: 1,
    savedSeeds: [],
    stopped: false,
    raf: 0,
    // 30:只读的历史最高分(独立 key,只存一个 max;不存逐局记录)
    bestScore: 0,
    bestSubmitted: 0,
    highScoreError: ''
  };
  RA.short = { state: state };

  function sampleSet() { return RA.B4_SAMPLES || RA.B2_SAMPLES; }

  function hasSamples() {
    var s = sampleSet();
    return s && s.lobby && s.normal1 && s.normal2 && s.normal3 && s.rest && s.boss;
  }

  function fixedFloors() {
    if (RA.FULL40 && RA.FULL40.fixed) {
      return { lobby: clone(RA.FULL40.fixed.lobby), rest: clone(RA.FULL40.fixed.rest), boss: clone(RA.FULL40.fixed.boss) };
    }
    var s = sampleSet();
    return { lobby: clone(s.lobby), rest: clone(s.rest), boss: clone(s.boss) };
  }

  function devFloors() {
    var s = sampleSet();
    return ['lobby', 'normal1', 'normal2', 'normal3', 'rest', 'boss'].map(function (k) {
      return clone(s[k]);
    });
  }

  function isFull40() {
    return !!(state.manifest && state.manifest.layout === 'full40-v1');
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
      floors: floors, mode: mode, manifest: manifest || null, profile: 'run-v1', requireCloud: true
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
    state.debugJumped = false;
    // 30:新局从 0 分开始;已保存的最高分不动。重试同塔也是新局 0(manifest 仍是原清单)。
    state.bestSubmitted = 0;
    state.held = { left: false, right: false, jump: false };
    if (state.input) state.input.clearAll();
    clearTouchInput();
    state.lastT = 0;
    state.cam.x = state.session.player.x - state.cw / 2;
    state.cam.y = state.session.player.y - state.ch / 2;
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

  async function startDev() {
    if (!hasSamples()) {
      $('menu-status').textContent = '缺少开发模板 js/b2-samples.js;运行 node tools/sync_b2_levels.mjs';
      return false;
    }
    var s = RA.B2_SAMPLES;
    var floors = devFloors();
    var manifest = {
      manifestId: 'dev-short-v1',
      layout: 'short-v1',
      profile: 'short-v2',
      gameplayProfile: 'run-v1',
      dev: true,
      floors: floors.map(function (f) { return { levelId: f.id, contentHash: f.contentHash }; })
    };
    return start(floors, manifest, 'short-dev');
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
    var plan = RA.TowerPlanner.buildFull40({
      seed: parsed.value,
      candidates: candidates,
      fixedLevels: fixedFloors(),
      fallback: RA.FULL40.fallback,
      poolEpoch: (RA.FULL40 && RA.FULL40.poolEpoch) || ''
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
    var okStart = start(floors, plan.value, 'full40-formal');
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

  /**
   * 调试跳层:只用于定位 10/20/30/40 生命周期与验收,不是正式流程,
   * 不产生认证、不冒充真人从 0 通关;HUD 会标“调试跳层”。
   */
  function debugJumpTo(n) {
    var s = state.session;
    if (!s || !s.world) return false;
    var res = s.world.activateSlot(n);
    if (!res.ok) return res;
    var inst = res.value.inst;
    s.boss = null;
    s._onFloorEntered({ from: res.value.floor, to: res.value.floor });
    var p = s.player;
    p.level = inst.view;
    if (inst.cloud && inst.level.startLocalX !== undefined) {
      p.x = inst.level.startX;
      p.y = inst.level.startFeet - p.h;
    } else if (inst.fixedLobby) {
      var fs = inst.data.extensions && inst.data.extensions.fixedScene;
      var sp = fs && fs.playerSpawn;
      if (sp) {
        p.x = inst.origin.x + sp.centerCol * TS - p.w / 2;
        p.y = inst.origin.y + (sp.feetRow - 1) * TS - p.h;
      }
    } else {
      p.x = inst.origin.x + 2 * TS;
      p.y = inst.origin.y + 2 * TS;
    }
    p.vx = 0; p.vy = 0; p.onGround = false;
    p.coyote = 0; p.jumpBuffer = 0; p.jumpsUsed = 0;
    state.cam.x = p.x + p.w / 2 - state.cw / 2;
    state.cam.y = p.y + p.h / 2 - state.ch / 2;
    state.debugJumped = true;
    return res;
  }

  function finish(kind) {
    var ov = $('result-overlay');
    if (!ov) return;
    ov.style.display = 'flex';
    var full = isFull40();
    $('result-title').textContent = kind === 'won' ? (full ? '完整塔通过' : '短塔通过') : '死亡';
    $('result-text').textContent = kind === 'won'
      ? (full ? '0–40 完整塔已通关(20 层后按 F 进入 21,40 层 BOSS 击败)。本次为本地运行结果,不生成作者认证。'
        : '调试短塔已通关;这不是完整塔胜利,也不生成认证。')
      : (full ? '已回到 0 层状态。可以重试同一座塔(同一份 41 槽清单),不会重新抽选。'
        : '已回到大厅状态。可以重试同一座塔,不会重新抽选。');
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
  function drawObject(ctx, inst, o, cam) { return RA.drawFloorObject(ctx, inst, o, cam); }

  function render() {
    var ctx = state.ctx;
    if (!ctx || !state.session) return;
    var cam = state.cam;
    var g = ctx.createLinearGradient(0, 0, 0, state.ch);
    g.addColorStop(0, '#0a0f1e'); g.addColorStop(1, '#05060c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, state.cw, state.ch);
    var insts = state.session.world.instances;
    Array.from(insts.keys()).sort(function (a, b) { return a - b; }).forEach(function (i) {
      var inst = insts.get(i);
      if (inst.state === 'snapshot') {
        inst.level.draw(ctx, { ox: cam.x - inst.origin.x, oy: cam.y - inst.origin.y, vw: state.cw, vh: state.ch }, state.assets);
        return;
      }
      inst.level.draw(ctx, { ox: cam.x - inst.origin.x, oy: cam.y - inst.origin.y, vw: state.cw, vh: state.ch }, state.assets);
      inst.objects.forEach(function (o) {
        if (o.type !== 'sewage_pool') return;
        if (RA.drawObjectTrack) RA.drawObjectTrack(ctx, inst, o, cam);
        drawObject(ctx, inst, o, cam);
      });
      inst.objects.forEach(function (o) {
        if (o.type === 'sewage_pool') return;
        if (RA.drawObjectTrack) RA.drawObjectTrack(ctx, inst, o, cam);
        drawObject(ctx, inst, o, cam);
      });
      // 30:箭只属于当前 active 实例,朝发射方向画细长占位图
      if (RA.drawFloorArrows) RA.drawFloorArrows(ctx, inst, cam);
      var openL = inst.origin.x + inst.exitCol * TS - cam.x;
      var openR = openL + RA.LevelData.PORT.openingCols * TS;
      ctx.strokeStyle = inst.exitOpen === false ? 'rgba(255,120,100,.7)' : 'rgba(255,205,110,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(openL, inst.origin.y - cam.y); ctx.lineTo(openR, inst.origin.y - cam.y); ctx.stroke();
    });
    // 云板石管:只画“两端实例都已实存”的运行几何;规划链接不是加载状态
    (state.session.world.liveStoneLinks ? state.session.world.liveStoneLinks() : []).forEach(function (link) {
      if (!link || link.kind !== 'stone-pipe' || !link.walls) return;
      ctx.fillStyle = 'rgba(8,10,16,.9)';
      ctx.fillRect(link.inner.x - cam.x, link.inner.y - cam.y, link.inner.w, link.inner.h);
      var stone = state.assets && RA.TILE_IMAGES['='] ? state.assets.image(RA.TILE_IMAGES['='][0]) : null;
      link.walls.forEach(function (w) {
        for (var row = 0; row < 3; row++) {
          if (stone) RA.drawTile(ctx, '=', stone, w.x - cam.x, w.y - cam.y + row * TS, TS);
          else { ctx.fillStyle = '#8a6a4a'; ctx.fillRect(w.x - cam.x, w.y - cam.y + row * TS, TS, TS); }
        }
      });
    });
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
    if (Object.keys(p.frames || {}).length) p.draw(ctx, { ox: cam.x, oy: cam.y }, state.assets);
    else { ctx.fillStyle = '#ffcd6e'; ctx.fillRect(p.x - cam.x, p.y - cam.y, p.w, p.h); }
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
      var total = (state.manifest && state.manifest.layout === 'full40-v1') ? 40 : (snap.floorCount - 1);
      var kind = snap.floor ? snap.floor.kind : 'normal';
      var label;
      if (kind === 'lobby') label = '大厅（0层）';
      else if (kind === 'rest') label = '第 ' + fi + '/' + total + ' 层 · 休整';
      else if (kind === 'boss') label = '第 ' + fi + '/' + total + ' 层 · BOSS';
      else label = '第 ' + fi + '/' + total + ' 层 · 普通';
      if (state.debugJumped) label += ' · 调试跳层';
      fl.textContent = label;
    }
    var prompt = $('interact-prompt');
    if (prompt) {
      var ip = (!s.paused && s.status === 'running' && s.interactionPrompt) ? s.interactionPrompt() : null;
      prompt.style.display = ip ? 'block' : 'none';
      if (ip) prompt.textContent = ip.text;
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
        var tx = p.x + p.w / 2 - state.cw / 2;
        var ty = p.y + p.h / 2 - state.ch / 2;
        var k = Math.min(1, dt * 7);
        state.cam.x += (tx - state.cam.x) * k;
        state.cam.y += (ty - state.cam.y) * k;
      }
      s.drainEvents().forEach(function (ev) {
        if (ev.type === 'floorEntered' && ev.transfer) {
          // 传送后相机立即对准目标层,不缓慢穿过两段地图之间的空白
          var tp = s.player;
          state.cam.x = tp.x + tp.w / 2 - state.cw / 2;
          state.cam.y = tp.y + tp.h / 2 - state.ch / 2;
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
      var plan = RA.TowerPlanner.buildFull40({
        seed: state.seedValue,
        candidates: all || [],
        fixedLevels: fixedFloors(),
        fallback: RA.FULL40.fallback,
        poolEpoch: (RA.FULL40 && RA.FULL40.poolEpoch) || ''
      });
      if (!plan.ok) { seedStatus('重构失败:[' + plan.error.code + '] ' + plan.error.message); return; }
      state.pendingPlan = plan.value;
      var by = plan.value.perDifficulty || {};
      seedStatus('已重构 41 槽(种子 ' + state.seedText + ';每档 ' + JSON.stringify(by) + ');开始游戏时用当前池生成。');
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
    state.assets.loadAll(function () { if (state.session) state.session.player.loadSprites(state.assets); });
    setupLifecycle();
    RA.short.repo = RA.ContentRepository ? RA.ContentRepository.create() : null;
    state.repo = RA.short.repo;
    RA.short.debugJumpTo = debugJumpTo;
    RA.short.startFormal = startFormal;
    RA.short.retrySame = retrySame;
    var startDevBtn = $('btn-dev');
    if (startDevBtn) startDevBtn.addEventListener('click', function () { startDev(); });
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
