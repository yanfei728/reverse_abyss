// 独立验收：旧入口反馈 + 非零原点的实际机关触发。仅用 Node 内存，不写用户存储。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEditor, ROOT } from '../../tools/loader.mjs';
const RA = loadEditor(), TS = RA.C.TS;
const clone = v => JSON.parse(JSON.stringify(v));
const read = name => JSON.parse(readFileSync(join(ROOT, 'levels/b2', name + '.json'), 'utf8'));
const lobby = read('lobby'), n1 = read('normal-1'), n2 = read('normal-2');
const report = {};

function legacy(letter) {
  const rows = Array.from({ length: 12 }, () => new Array(14).fill('+'));
  rows[4][6] = letter;
  rows[10][2] = 'P'; rows[11].fill('#');
  const level = RA.Level.fromData({ id: 'legacy_probe', asc: rows.map(r => r.join('')).join('\n') });
  const object = level.entities.find(e => e instanceof (letter === 'y' ? RA.Blink : RA.Ghost));
  const player = new RA.Player(level);
  return { level, object, player };
}

// 与旧 Game.update 一致：先移动/解碰撞，再更新对象。
{
  const { object, player } = legacy('y');
  player.x = object.x + TS / 2 - player.w / 2;
  player.y = object.y - player.h - 1; player.vy = 150;
  player.update(1 / 60, {}, {}); object.update(1 / 60, { player });
  report.legacyBlink = {
    hiddenOnLandingStep: object.hiddenNow,
    solidAfterLanding: object.solidAt(object.row, object.col),
    hiddenSeconds: object.hidden,
    expectedNewDefaultWarningSeconds: RA.C.OBJECT_PARAMS.blink_platform.warningSeconds.def
  };
}
{
  const results = {};
  for (const side of ['top', 'left']) {
    const { object, player } = legacy('x');
    if (side === 'top') {
      player.x = object.x + TS / 2 - player.w / 2;
      player.y = object.y - player.h - 1; player.vy = 150;
    } else {
      player.x = object.x - player.w - 1;
      player.y = object.y + 3; player.vx = 200;
    }
    player.update(1 / 60, side === 'left' ? { right: true } : {}, {});
    object.update(1 / 60, { player });
    results[side] = { gone: object.gone, solid: object.solidAt(object.row, object.col),
      feet: player.feet, objectTop: object.y, right: player.x + player.w, objectLeft: object.x };
  }
  report.legacyDoor = results;
}

function session(data, upper) {
  const res = RA.GameSession.create({ floors: upper ? [clone(lobby), clone(data)] : [clone(data)] });
  if (!res.ok) throw new Error(res.error.message);
  const s = res.value;
  // 激活上层诊断用，不生成认证，也不称为真人跨层通关。
  if (upper) s.world.commitNext();
  return s;
}
function objectAt(s, type) { return s.world.currentFloor.objects.find(o => o.type === type); }
function worldBox(s, o) {
  const f = s.world.currentFloor;
  return { x: f.origin.x + o.col * TS, y: f.origin.y + o.row * TS };
}
function doorContact(upper) {
  const s = session(n2, upper), f = s.world.currentFloor, o = objectAt(s, 'crumble_door');
  const b = worldBox(s, o), p = s.player;
  p.x = b.x - p.w - 1; p.y = b.y + 3; p.vx = 200;
  s.setActions({ right: true }); s.stepOnce();
  return { origin: f.origin, broken: o.broken, solid: f.solidAt(o.row, o.col) };
}
function blinkLanding(upper) {
  const data = clone(n2), sample = data.objects.find(o => o.type === 'blink_platform');
  // 原样例该格另有实心瓦片；先隔离这层遮挡，才能测浮石自身失去碰撞。
  data.terrain.tiles[sample.row][sample.col] = 0; data.contentHash = null;
  const s = session(data, upper), f = s.world.currentFloor, o = objectAt(s, 'blink_platform');
  const b = worldBox(s, o), p = s.player;
  p.x = b.x + TS / 2 - p.w / 2; p.y = b.y - p.h - 1; p.vy = 150;
  s.stepOnce();
  const first = { state: o.state, timer: o.timer, solid: f.solidAt(o.row, o.col) };
  const started = s.time;
  for (let i = 0; i < 60 && o.state !== 'gone'; i++) s.stepOnce();
  return { origin: f.origin, first, finalState: o.state,
    elapsedUntilGoneOrStop: +(s.time - started).toFixed(4) };
}
function fireContact(upper) {
  const data = clone(n1), sample = data.objects.find(o => o.type === 'fireball_static');
  data.terrain.tiles[sample.row][sample.col] = 0; data.contentHash = null;
  const s = session(data, upper), f = s.world.currentFloor, o = objectAt(s, 'fireball_static');
  s.player.x = f.origin.x + o.rx - s.player.w / 2;
  s.player.y = f.origin.y + o.ry - s.player.h / 2;
  s.stepOnce();
  return { origin: f.origin, hp: s.hp };
}
function blinkRecovery(upper) {
  const data = clone(n2), sample = data.objects.find(o => o.type === 'blink_platform');
  data.terrain.tiles[sample.row][sample.col] = 0; data.contentHash = null;
  const s = session(data, upper), f = s.world.currentFloor, o = objectAt(s, 'blink_platform');
  o.state = 'gone'; o.timer = 0.001;
  s.player.x = f.origin.x + o.rx - s.player.w / 2;
  s.player.y = f.origin.y + o.ry - s.player.h / 2;
  s.stepOnce();
  return { origin: f.origin, state: o.state, solid: f.solidAt(o.row, o.col) };
}
report.newRuntimeDoor = { atOrigin: doorContact(false), upperFloor: doorContact(true) };
report.newRuntimeBlink = { atOrigin: blinkLanding(false), upperFloor: blinkLanding(true) };
report.newRuntimeFire = { atOrigin: fireContact(false), upperFloor: fireContact(true) };
report.newRuntimeRecovery = { atOrigin: blinkRecovery(false), upperFloor: blinkRecovery(true) };
const blinkSample = n2.objects.find(o => o.type === 'blink_platform');
report.sampleBlinkHasSolidTile = n2.terrain.tiles[blinkSample.row][blinkSample.col] !== 0;

// 标准试玩应只在开局有 20 秒冷却，不能永久禁用正常技能。
{
  const s = RA.GameSession.create({ floors: [clone(lobby)], mode: 'standard', profile: 'standard-v1' }).value;
  for (let i = 0; i < 1220; i++) s.stepOnce();
  report.standardSkill = { time: s.time, cooldown: s.run.haloCooldownRemaining,
    allowSkill: s.profile.allowSkill, castAfterCooldown: s.castSkill() };
}
writeFileSync(join(ROOT, 'docs/checks/review-B2-2026-11-06-probes.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = !report.newRuntimeDoor.upperFloor.broken ||
  report.newRuntimeBlink.upperFloor.first.state !== 'warning' ||
  !report.standardSkill.castAfterCooldown ? 1 : 0;
