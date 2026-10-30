/* -*- coding: utf-8 -*- */
/*
 * audio.js —— 音效合成(Web Audio)
 * =================================
 * 和 abyss/game/audio.py 一个思路:游戏不需要任何音频文件,波形是代码算出来的
 * (振荡器 + 滑动音高 + 指数衰减)。
 *
 * 浏览器有个"自动播放策略":没跟用户交互过不许出声,所以 AudioContext 是
 * **第一次按键 / 点击时才创建**的(见 input.js 的 onFirstInput)。
 * 取不到音频设备时全部静默,游戏照常跑 —— 和 abyss 一样。
 */
(function (RA) {
  'use strict';

  var C = RA.C;

  // 音效表:和 abyss 的 make_sound(时长, 起始频率, 结束频率, 音量, 波形, 衰减) 对应
  var SPECS = {
    jump: { d: 0.16, f0: 330, f1: 760, v: 0.20, shape: 'square', decay: 7 },
    step: { d: 0.06, f0: 150, f1: 90, v: 0.16, shape: 'sine', decay: 12 },
    land: { d: 0.07, f0: 110, f1: 70, v: 0.14, shape: 'sine', decay: 12 },
    spring: { d: 0.22, f0: 240, f1: 1250, v: 0.20, shape: 'square', decay: 5 }
  };
  // 爬到上一层的小三音上行(频率, 延迟秒)
  var CHIME = [[523.25, 0], [659.25, 0.09], [880.0, 0.18]];

  class SoundBank {
    constructor() {
      this.ctx = null;
      this.master = null;
      this._tried = false;
    }

    /** 第一次真的有用户交互时才能建 AudioContext */
    _ensure() {
      if (this._tried) return;
      this._tried = true;
      try {
        var AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = C.MIX_GAIN;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
      }
    }

    /** 用户第一次按键/点击时调一下:建上下文 + 从 suspended 唤醒 */
    resume() {
      this._ensure();
      if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) {
        try { this.ctx.resume(); } catch (e) { /* 忽略 */ }
      }
    }

    _tone(spec, delay) {
      var ctx = this.ctx;
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = spec.shape || 'sine';
      osc.frequency.setValueAtTime(spec.f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.f1), t0 + spec.d);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(spec.v, t0 + 0.004);   // 起音,避免"啪"的爆音
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.d);  // 指数衰减
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + spec.d + 0.03);
    }

    _chime() {
      var ctx = this.ctx;
      CHIME.forEach(function (n) {
        var t0 = ctx.currentTime + n[1];
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n[0], t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        osc.connect(g);
        g.connect(this.master);
        osc.start(t0);
        osc.stop(t0 + 0.4);
      });
    }

    /** 安全播放:没声卡 / 还没交互过 → 什么都不做 */
    play(name) {
      this._ensure();
      if (!this.ctx || this.ctx.state === 'suspended') return;
      try {
        if (name === 'floor') return this._chime();
        var spec = SPECS[name];
        if (spec) this._tone(spec, 0);
      } catch (e) { /* 忽略 */ }
    }
  }

  RA.SoundBank = SoundBank;
})(globalThis.RA = globalThis.RA || {});
