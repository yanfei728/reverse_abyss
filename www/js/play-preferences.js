/* -*- coding: utf-8 -*-
/*
 * play-preferences.js —— 36:最小游玩偏好(视野档位 + 正式换层额外回血)
 * =================================================================
 * 只存两项:
 *   { version:1, viewMode:'wide'|'classic', floorHealAmount:0|20|40|60|100 }
 *
 * 约定(详见 docs/design/play-settings-visuals-and-blink-collision.md):
 *   · 独立 localStorage key `ra.play-preferences.v1`,不和编辑器/布局/种子/最高分混写;
 *   · 读写都返回显式结果;坏 JSON / 未知档位 / 非法恢复量 → 回到默认,不清其它存储;
 *   · 保存失败时页面可以让"本次已生效,但没能保存"生效,但绝不能假报已持久化;
 *   · 核心不直接访问 DOM/storage:调用方把 {getItem,setItem} 适配器传进来。
 */
(function (RA) {
  'use strict';

  var KEY = 'ra.play-preferences.v1';
  var VERSION = 1;
  var VIEW_MODES = ['wide', 'classic'];
  var TOWER_MODES = ['easy', 'classic'];
  var HEAL_AMOUNTS = [0, 20, 40, 60, 100];

  function defaults() {
    return { version: VERSION, viewMode: 'wide', floorHealAmount: 0, towerMode: 'easy' };
  }
  function sanitize(raw) {
    var out = defaults();
    if (raw && typeof raw === 'object') {
      if (VIEW_MODES.indexOf(raw.viewMode) >= 0) out.viewMode = raw.viewMode;
      var n = Number(raw.floorHealAmount);
      if (HEAL_AMOUNTS.indexOf(n) >= 0) out.floorHealAmount = n;
      if (TOWER_MODES.indexOf(raw.towerMode) >= 0) out.towerMode = raw.towerMode;
    }
    return out;
  }
  function storeOf(store) {
    if (store && typeof store.getItem === 'function' && typeof store.setItem === 'function') return store;
    return null;
  }

  var PlayPreferences = {
    KEY: KEY,
    VERSION: VERSION,
    VIEW_MODES: VIEW_MODES.slice(),
    HEAL_AMOUNTS: HEAL_AMOUNTS.slice(),
    TOWER_MODES: TOWER_MODES.slice(),
    defaults: defaults,
    sanitize: sanitize,
    /** 读偏好。没有记录 = ok + defaults(saved:false);坏 JSON/读失败 = ok:false + defaults */
    load: function (store) {
      var s = storeOf(store);
      var def = defaults();
      if (!s) {
        return { ok: true, value: def, saved: false, reason: 'no-storage' };
      }
      var raw;
      try { raw = s.getItem(KEY); } catch (e) {
        return { ok: false, value: def, saved: false, error: { code: 'READ_FAILED', message: '读取游玩偏好失败' } };
      }
      if (raw === null || raw === undefined || raw === '') return { ok: true, value: def, saved: false, reason: 'empty' };
      var parsed;
      try { parsed = JSON.parse(raw); } catch (e) {
        return { ok: false, value: def, saved: true, error: { code: 'BAD_JSON', message: '游玩偏好格式损坏,已按默认值' } };
      }
      var val = sanitize(parsed);
      var changed = !parsed || parsed.version !== VERSION ||
        parsed.viewMode !== val.viewMode || Number(parsed.floorHealAmount) !== val.floorHealAmount ||
        parsed.towerMode !== val.towerMode;
      return { ok: true, value: val, saved: true, adjusted: changed };
    },
    /** 写偏好。只有 setItem 真的成功才 ok:true */
    save: function (store, prefs) {
      var s = storeOf(store);
      var val = sanitize(prefs);
      if (!s) return { ok: false, value: val, error: { code: 'NO_STORAGE', message: '当前环境不能保存偏好' } };
      try {
        s.setItem(KEY, JSON.stringify(val));
      } catch (e) {
        return { ok: false, value: val, error: { code: 'WRITE_FAILED', message: '保存游玩偏好失败' } };
      }
      return { ok: true, value: val };
    }
  };

  RA.PlayPreferences = PlayPreferences;
})(globalThis.RA = globalThis.RA || {});
