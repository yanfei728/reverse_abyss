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
    importedData: null
  };
  RA.short = { state: state };

  function sampleSet() { return RA.B4_SAMPLES || RA.B2_SAMPLES; }

  function hasSamples() {
    var s = sampleSet();
    return s && s.lobby && s.normal1 && s.normal2 && s.normal3 && s.rest && s.boss;
  }

  function fixedFloors() {
    var s = sampleSet();
    return { lobby: clone(s.lobby), rest: clone(s.rest), boss: clone(s.boss) };
  }

  function devFloors() {
    var s = sampleSet();
    return ['lobby', 'normal1', 'normal2', 'normal3', 'rest', 'boss'].map(function (k) {
      return clone(s[k]);
    });
  }

  function showMenu() {
    state.session = null;
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
  }

  function start(floors, manifest, mode) {
    if (!hasSamples()) {
      $('menu-status').textContent = '缺少开发模板 js/b2-samples.js;运行 node tools/sync_b2_levels.mjs';
      return false;
    }
    var res = RA.GameSession.create({
      floors: floors, mode: mode, manifest: manifest || null, profile: 'run-v1'
    });
    if (!res.ok) {
      $('menu-status').textContent = '短塔启动失败:[' + res.error.code + '] ' + res.error.message;
      return false;
    }
    state.session = res.value;
    if (state.assets) state.session.player.loadSprites(state.assets);
    state.floors = floors;
    state.manifest = manifest || null;
    state.mode = mode;
    state.paused = false;
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
    var s = RA.B2_SAMPLES;
    var floors = devFloors();
    var manifest = {
      manifestId: 'dev-short-v1',
      profile: 'short-v2',
      dev: true,
      floors: floors.map(function (f) { return { levelId: f.id, contentHash: f.contentHash }; })
    };
    return start(floors, manifest, 'short-dev');
  }

  async function startFormal() {
    var repo = RA.short.repo;
    if (!repo) { $('menu-status').textContent = '浏览器草稿/发布库不可用'; return false; }
    var eligible = await repo.listEligible({ difficulty: 1, rules: RA.RULES });
    if (!eligible.ok) {
      $('menu-status').textContent = '读取正式池失败:[' + eligible.error.code + '] ' + eligible.error.message;
      return false;
    }
    if (!eligible.value.length) {
      $('menu-status').textContent = '正式池还没有已认证并发布的普通层。请先在编辑器制作、标准试玩通关并发布;或用开发短塔。';
      return false;
    }
    var fixed = fixedFloors();
    var plan = RA.TowerPlanner.build({
      profile: 'short-v1', seed: Date.now(), fixedLevels: fixed,
      candidates: eligible.value, rules: RA.RULES
    });
    if (!plan.ok) {
      $('menu-status').textContent = '抽塔失败:[' + plan.error.code + '] ' + plan.error.message;
      return false;
    }
    var floors = plan.value.floors.map(function (f) { return clone(f.data); });
    return start(floors, plan.value, 'short-formal');
  }

  function retrySame() {
    if (!state.floors.length) { showMenu(); return; }
    start(state.floors, state.manifest, state.mode);
  }

  function finish(kind) {
    var ov = $('result-overlay');
    if (!ov) return;
    ov.style.display = 'flex';
    $('result-title').textContent = kind === 'won' ? '短塔通过' : '死亡';
    $('result-text').textContent = kind === 'won'
      ? '开发短塔/正式短塔已通关。未通过标准试玩的草稿不会因此获得认证。'
      : '已回到大厅状态。可以重试同一座塔,不会重新抽选。';
    $('btn-retry').style.display = kind === 'dead' ? 'inline-block' : 'none';
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
      var a = keyAction(e.code);
      if (a) { e.preventDefault(); state.input.setHeld('key:' + e.code, a, true); return; }
      if (e.code === 'KeyK') { e.preventDefault(); state.input.press('skill'); return; }
      if (e.code === 'KeyE') { e.preventDefault(); state.input.press('interact'); return; }
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

  function drawObject(ctx, inst, o, cam) {
    var x = o.rx !== undefined ? o.rx : o.col * TS + TS / 2;
    var y = o.ry !== undefined ? o.ry : o.row * TS + TS / 2;
    var sx = inst.origin.x + x - cam.x;
    var sy = inst.origin.y + y - cam.y;
    if (o.type === 'fireball_static') {
      if (!o.alive) return;
      ctx.fillStyle = '#ff7043';
      ctx.beginPath(); ctx.arc(sx, sy, (o.params.radiusTiles || 0.5) * TS, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'gear') {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(sx, sy, (o.params.radiusTiles || 0.5) * TS, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b4f00'; ctx.lineWidth = 2; ctx.stroke();
    } else if (o.type === 'spring') {
      ctx.fillStyle = '#7ee0a8';
      ctx.fillRect(sx - TS / 2 + 4, sy + TS / 2 - 10, TS - 8, 8);
    } else if (o.type === 'spike') {
      ctx.fillStyle = '#9aa8c7';
      var base = sy + TS / 2 - 12;
      ctx.fillRect(sx - TS / 2 + 2, base, TS - 4, 12);
      if (o.state === 'active') {
        ctx.fillStyle = '#ff8a65';
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(sx - TS / 2 + 5 + i * 12, base);
          ctx.lineTo(sx - TS / 2 + 11 + i * 12, base - 16);
          ctx.lineTo(sx - TS / 2 + 17 + i * 12, base);
          ctx.fill();
        }
      }
    } else if (o.type === 'crumble_door') {
      if (o.broken) return;
      ctx.fillStyle = '#9c7bd8';
      ctx.fillRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4);
    } else if (o.type === 'blink_platform') {
      if (o.state === 'gone') return;
      ctx.fillStyle = o.state === 'warning' ? '#ffd166' : '#7fb3ff';
      ctx.fillRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4);
    }
  }

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
      inst.objects.forEach(function (o) { drawObject(ctx, inst, o, cam); });
      var openL = inst.origin.x + inst.exitCol * TS - cam.x;
      var openR = openL + RA.LevelData.PORT.openingCols * TS;
      ctx.strokeStyle = inst.exitOpen === false ? 'rgba(255,120,100,.7)' : 'rgba(255,205,110,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(openL, inst.origin.y - cam.y); ctx.lineTo(openR, inst.origin.y - cam.y); ctx.stroke();
    });
    // 云板石管:管内只读几何,按 World 生成坐标画,不写回模板
    (state.session.world.links || []).forEach(function (link) {
      if (!link || link.kind !== 'stone-pipe' || !link.walls) return;
      ctx.fillStyle = 'rgba(8,10,16,.9)';
      ctx.fillRect(link.inner.x - cam.x, link.inner.y - cam.y, link.inner.w, link.inner.h);
      ctx.fillStyle = '#4b5563';
      link.walls.forEach(function (w) {
        ctx.fillRect(w.x - cam.x, w.y - cam.y, w.w, w.h);
      });
      ctx.strokeStyle = 'rgba(150,165,190,.45)'; ctx.lineWidth = 1;
      link.walls.forEach(function (w) {
        ctx.strokeRect(w.x - cam.x, w.y - cam.y, w.w, w.h);
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
    if (fl) fl.textContent = '第 ' + (snap.floorIndex + 1) + '/' + snap.floorCount + ' 层 · ' + (snap.floor ? snap.floor.kind : '');
    var bs = $('boss-text');
    if (bs) {
      if (snap.boss) bs.textContent = 'Boss 阶段 ' + snap.boss.phase + ' · ' + snap.boss.state +
        (snap.boss.state === 'shielded' ? ' ' + snap.boss.shieldRemaining.toFixed(1) + 's' : '');
      else bs.textContent = '';
    }
  }

  function tick(now) {
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
        if (ev.type === 'dead') finish('dead');
        if (ev.type === 'won') finish('won');
      });
      render();
      updateHud();
    }
    requestAnimationFrame(tick);
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
    var exportBtn = $('btn-export');
    if (exportBtn) exportBtn.addEventListener('click', function () { exportCurrent(); });
    showMenu();
    applyLayout();
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.RA = globalThis.RA || {});
