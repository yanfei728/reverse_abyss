// 独立验收的两条非阻塞发现。仅运行时fixture，不改模板/浏览器库，不写通关认证。
import { loadEngine } from '../../tools/loader.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = loadEngine(), clone = (x) => JSON.parse(JSON.stringify(x));
const plan = R.TowerPlanner.buildFull40({ fixedLevels: R.FULL40.fixed,
  fallback: R.FULL40.fallback, candidates: [], seed: 1 }).value;
function fresh() {
  const s = R.GameSession.create({ floors: plan.floors.map((f) => clone(f.data)),
    manifest: clone(plan), profile: 'run-v1', requireCloud: true }).value;
  s.setActions({ interactPressed: true }); s.update(1 / 60); return s;
}
const s = fresh(), w = s.world, p = s.player, link = w.links[1];
p.x = (link.openingLeft + link.openingRight - p.w) / 2; p.y = link.finishY - p.h;
p.vx = p.vy = 0; p.onGround = true; p.coyote = 0.1; p.jumpsUsed = 0;
p.prevJump = false; p.jumpBuffer = 0; p.ledgeUsed = false;
const pendingTrace = [];
for (let frame = 0; frame < 140; frame++) {
  const had = !!w.pendingEntry;
  s.setActions({ jumpHeld: frame < 13 || (frame >= 24 && frame < 60),
    right: frame >= 14 && frame < 40, left: frame >= 40 && frame < 52 });
  s.update(1 / 60);
  if (!!w.pendingEntry !== had) pendingTrace.push({ frame, pending: !!w.pendingEntry,
    current: w.current, feet: p.feet, commitY: link.commitY, abovePlane: p.feet < link.commitY });
}
const zero = fresh(), floor = zero.world.currentFloor, zp = zero.player;
floor.objects = [{ id: 'isolated-zero-damage-probe', type: 'fireball_static',
  col: 0, row: 0, params: { radiusTiles: 0.5, damage: 0 }, alive: true,
  rx: zp.x + zp.w / 2 - floor.origin.x, ry: zp.y + zp.h / 2 - floor.origin.y }];
const beforeHp = zero.run.hp; floor.updateActiveObjects(1 / 60, zero);
const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = ['js/level.js', 'js/world.js', 'js/session.js', 'js/short.js',
  'js/boss.js', 'js/full40-samples.js', 'js/rules.js', 'levels/levels.js'];
const report = {
  date: '2026-11-09', kind: 'targeted-engine-audit',
  limits: 'Node fixture, not human play or browser evidence. No map qualification, persistent user storage or certification changes.',
  pending: { input: 'finish-center fixture; jump frames 0..12 and 24..59; right14..39, left40..51',
    trace: pendingTrace, finalCurrent: w.current,
    clearedWhileAbove: pendingTrace.some((r) => !r.pending && r.abovePlane && r.current === 1),
    recoveredInThisCase: w.current === 2 },
  zeroDamage: { type: 'fireball_static', registryMin: R.C.OBJECT_PARAMS.fireball_static.damage.min,
    configuredDamage: 0, beforeHp, afterHp: zero.run.hp, effectiveDamage: beforeHp - zero.run.hp },
  www: files.map((path) => ({ path, identical: hash(resolve(root, path)) === hash(resolve(root, 'www', path)) }))
};
const output = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(
  new URL('./review-B4R10-2026-11-09-audit.json', import.meta.url));
if (!process.argv[2] && existsSync(output)) console.log('Evidence preserved; pass a new output filename to save this run.');
else writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
process.exit(0); // 诊断完成；不表示发现项已修复。
