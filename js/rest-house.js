/* -*- coding: utf-8 -*- */
/*
 * rest-house.js —— 37:休息小屋固定侧场景
 * =====================================
 * 同一 GameSession/Player 的独立静态 Level(不是第四个 FloorInstance/World/Trial)。
 * 只负责:地形/背景/地块外观、门与三件奖励的重叠提示、领取后隐藏、释放。
 * 生命/上限/领取状态的唯一真值在 GameSession.run;本模块不写模板/不存档。
 */
(function (RA) {
  'use strict';

  var TS = function () { return RA.C.TS; };
  var LABELS = { milk: '牛奶', berries: '浆果', carrot: '胡萝卜' };
  // 37:上限增量与直接回复;berries 的“总+40”= 直接20 + 上限附带20
  var REWARDS = {
    milk: { id: 'milk', label: '牛奶', maxDelta: 0, heal: 60, text: '回复 60 生命' },
    berries: { id: 'berries', label: '浆果', maxDelta: 20, heal: 20, text: '生命上限 +20,当前生命合计 +40' },
    carrot: { id: 'carrot', label: '胡萝卜', maxDelta: 30, heal: 0, text: '生命上限 +30,当前生命 +30' }
  };

  function fail(code, message) { return { ok: false, error: { code: code, message: message } }; }
  function ok(value) { return { ok: true, value: value }; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function overlap(px, py, w, h, rect) {
    return px < rect.x + rect.w && px + w > rect.x && py < rect.y + rect.h && py + h > rect.y;
  }
  function rectOf(col, row, cols, rows) {
    var t = TS();
    return { x: col * t, y: row * t, w: (cols || 1) * t, h: (rows || 1) * t };
  }
  function tilesToAsc(tiles) {
    return tiles.map(function (row) {
      return row.map(function (id) { return RA.LevelData.charOf(id) || '.'; }).join('');
    }).join('\n');
  }

  function validateTemplate(t) {
    if (!t || typeof t !== 'object') return '缺少小屋模板';
    if (!t.size || !t.terrain || !Array.isArray(t.terrain.tiles)) return '小屋模板缺少尺寸/地形';
    var fs = t.extensions && t.extensions.fixedScene;
    if (!fs || fs.role !== 'rest-house') return '小屋模板缺少 fixedScene.role=rest-house';
    if (!fs.playerSpawn || !fs.exitRegion) return '小屋模板缺少出生/出口区';
    if (!Array.isArray(fs.choices) || fs.choices.length !== 3) return '小屋模板必须恰好三个奖励';
    for (var i = 0; i < fs.choices.length; i++) {
      var c = fs.choices[i];
      if (!c || !REWARDS[c.id]) return '未知奖励 ' + (c && c.id);
    }
    return '';
  }

  class RestHouseScene {
    constructor(template, opts) {
      var fs = template.extensions.fixedScene;
      this.template = template;
      this.ownerFloorSlot = opts.ownerFloorSlot;
      this.ownerInstanceId = opts.ownerInstanceId;
      this.disposed = false;
      this.cols = template.size.cols;
      this.rows = template.size.rows;
      this.backgroundId = template.visuals && template.visuals.backgroundId || null;
      var level = RA.Level.fromData({
        id: template.id + '_runtime',
        asc: tilesToAsc(template.terrain.tiles),
        size: template.size,
        visuals: template.visuals || null
      }, { id: template.id + '_runtime' });
      level.tile = TS();
      level.worldW = this.cols * TS();
      level.worldH = this.rows * TS();
      level.startX = fs.playerSpawn.centerCol * TS() - 10;
      level.startFeet = fs.playerSpawn.feetRow * TS();
      level.spawnCol = Math.floor(fs.playerSpawn.centerCol);
      level.spawnRow = Math.max(0, fs.playerSpawn.feetRow - 1);
      var skinMap = {};
      var skins = template.visuals && template.visuals.tileSkins;
      if (Array.isArray(skins)) {
        skins.forEach(function (s) {
          if (s && typeof s.skinId === 'string' && Number.isInteger(s.row) && Number.isInteger(s.col)) {
            skinMap[s.row + ':' + s.col] = s.skinId;
          }
        });
      }
      level.tileSkins = function (r, c) { return skinMap[r + ':' + c] || null; };
      this.level = level;
      this.fixedScene = clone(fs);
      this.props = fs.choices.map(function (c) {
        var r = REWARDS[c.id];
        return { id: c.id, col: c.col, row: c.row, label: r.label, text: r.text };
      });
      this.startPose = {
        x: fs.playerSpawn.centerCol * TS() - 10,
        feet: fs.playerSpawn.feetRow * TS()
      };
      this.exitRegion = clone(fs.exitRegion);
      this.used = !!opts.used;
    }

    static create(template, opts) {
      var bad = validateTemplate(template);
      if (bad) return fail('BAD_REST_HOUSE', bad);
      opts = opts || {};
      if (!(opts.ownerFloorSlot === 10 || opts.ownerFloorSlot === 30)) {
        return fail('BAD_OWNER', '小屋只属于第10/30层休息区');
      }
      return ok(new RestHouseScene(template, opts));
    }

    /** 玩家是否与出口/奖励重叠;返回纯数据提示,不读 DOM */
    prompt(player) {
      if (this.disposed || !player) return null;
      var er = this.exitRegion;
      if (overlap(player.x, player.y, player.w, player.h, rectOf(er.col, er.row, er.cols, er.rows))) {
        return { kind: 'leave-rest-house', action: 'leave-rest-house', text: '按 F 返回休息区' };
      }
      if (this.used) return null;
      var hit = this.choiceAt(player);
      if (!hit) return null;
      var r = REWARDS[hit.id];
      return {
        kind: 'rest-reward', action: 'choose-rest-reward', choice: hit.id,
        text: '按 F 领取' + r.label + '(' + r.text + ')'
      };
    }

    choiceAt(player) {
      if (this.used || !player) return null;
      for (var i = 0; i < this.props.length; i++) {
        var p = this.props[i];
        if (overlap(player.x, player.y, player.w, player.h,
          rectOf(p.col, p.row, 1, 1))) return p;
      }
      return null;
    }

    /** 固定地物显示数据(领取后本轮全部隐藏) */
    renderData(used) {
      var hide = used === undefined ? this.used : !!used;
      return this.props.map(function (p) {
        return {
          id: p.id, col: p.col, row: p.row, label: p.label, text: p.text,
          visible: !hide, asset: 'fixed/rest-house/' + p.id
        };
      });
    }

    dispose() {
      this.disposed = true;
    }
  }

  RestHouseScene.REWARDS = REWARDS;
  RestHouseScene.LABELS = LABELS;
  RestHouseScene.validateTemplate = validateTemplate;
  RA.RestHouseScene = RestHouseScene;
})(globalThis.RA = globalThis.RA || {});
