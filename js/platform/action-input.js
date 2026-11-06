/* -*- coding: utf-8 -*- */
/*
 * action-input.js —— 语义输入与多来源合并
 * =========================================
 * 键盘、触点、鼠标/手柄适配器都只调用这里。sourceId 区分来源:
 *   key:KeyA / pointer:17 / pad:0 ...
 * 一个来源释放只删除自己的按住状态,不会误放开其他仍按住的来源。
 * left/right 同时按住互相抵消;松开一个后另一个仍有效。
 * press 是一次性边沿,consume() 取走并清空;同一帧多次按下也只触发一次。
 */
(function (RA) {
  'use strict';

  var HELD_ACTIONS = { left: 1, right: 1, jump: 1 };
  var PRESS_ACTIONS = { skill: 1, interact: 1, pause: 1 };

  class ActionInput {
    constructor() {
      this.sources = new Map();
      this.pressed = { skill: false, interact: false, pause: false };
    }

    _source(sourceId) {
      var id = String(sourceId);
      var s = this.sources.get(id);
      if (!s) {
        s = { left: false, right: false, jump: false };
        this.sources.set(id, s);
      }
      return s;
    }

    setHeld(sourceId, action, down) {
      if (!HELD_ACTIONS[action]) return false;
      var s = this._source(sourceId);
      s[action] = !!down;
      if (!s.left && !s.right && !s.jump) this.sources.delete(String(sourceId));
      return true;
    }

    press(action) {
      if (!PRESS_ACTIONS[action]) return false;
      this.pressed[action] = true;
      return true;
    }

    releaseSource(sourceId) {
      this.sources.delete(String(sourceId));
    }

    clearAll() {
      this.sources.clear();
      this.pressed.skill = false;
      this.pressed.interact = false;
      this.pressed.pause = false;
    }

    /** 当前合并状态;不消费按下边沿 */
    snapshot() {
      var left = false, right = false, jump = false;
      this.sources.forEach(function (s) {
        if (s.left) left = true;
        if (s.right) right = true;
        if (s.jump) jump = true;
      });
      return {
        held: { left: left && !right, right: right && !left, jumpHeld: jump },
        pressed: {
          skill: !!this.pressed.skill,
          interact: !!this.pressed.interact,
          pause: !!this.pressed.pause
        },
        sources: this.sources.size
      };
    }

    /** 取走 held 与一次性 pressed;pressed 清空,held 继续由来源维持 */
    consume() {
      var out = this.snapshot();
      out.pressed = {
        skill: this.pressed.skill,
        interact: this.pressed.interact,
        pause: this.pressed.pause
      };
      this.pressed.skill = false;
      this.pressed.interact = false;
      this.pressed.pause = false;
      return out;
    }
  }

  RA.ActionInput = ActionInput;
  RA.ActionInput.HELD_ACTIONS = HELD_ACTIONS;
  RA.ActionInput.PRESS_ACTIONS = PRESS_ACTIONS;
})(globalThis.RA = globalThis.RA || {});
