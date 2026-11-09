// 28附加定向证据:动态方块移除后不再贴附/直飞,以及门/浮石状态在provider中的变化。
import { loadEditor } from '../../tools/loader.mjs';
import { writeFileSync } from 'node:fs';
const RA = loadEditor(), T = RA.C.TS;
let rev = 0;
const blocks = new Set(['4,4']);
const geom = RA.BlockGeometry.create({
  cols: 14, rows: 14, revision: () => rev, isBlock: (r, c) => blocks.has(r + ',' + c)
});
const st = RA.SoulMotion.attach(geom, 4 * T + T / 2, 3 * T + T / 2, 1, 0.5);
const before = st && { s: st.s, rx: st.rx, ry: st.ry, attached: st.attached };
if (st) for (let i = 0; i < 60; i++) RA.SoulMotion.step(st, 1 / 60, geom, 170);
const attachedAfter = st && { s: st.s, rx: st.rx, ry: st.ry, attached: st.attached };
rev++; blocks.delete('4,4');
if (st) for (let i = 0; i < 30; i++) RA.SoulMotion.step(st, 1 / 60, geom, 170);
const afterRemove = st && { s: st.s, rx: st.rx, ry: st.ry, attached: st.attached };

const d = JSON.parse(JSON.stringify(RA.FULL40.fallback));
d.id = 'dynamic_soul_probe'; d.contentHash = null; d.certification = null;
d.objects = [{
  id: 'soul_dyn', type: 'soul', col: 4, row: 3,
  params: { radiusTiles: 0.5, damage: 20, initialDirection: 1 }, pathId: null
}, {
  id: 'blink_dyn', type: 'blink_platform', col: 7, row: 4,
  params: { warningSeconds: 0.5, goneSeconds: 1.6 }, pathId: null, state: 'idle', timer: 0
}];
d.paths = [];
const enc = RA.LevelData.encode(d);
let engine = null;
if (enc.ok) {
  const made = RA.GameSession.create({ floors: [JSON.parse(enc.value)], profile: 'run-v1', requireCloud: true, mode: 'test28' });
  if (made.ok) {
    const s = made.value, inst = s.world.currentFloor;
    const so = inst.objects.find((o) => o.type === 'soul');
    const blink = inst.objects.find((o) => o.type === 'blink_platform');
    const beforeState = { soulAttached: !!(so && so._soul && so._soul.attached),
      blinkIdleBlock: inst.isBlockForSoul(4, 7), rev: inst.blockRevision };
    blink.state = 'warning'; blink.timer = 0.001;
    inst.updateActiveObjects(1 / 60, s);
    const afterState = { blinkState: blink.state, blinkGoneBlock: inst.isBlockForSoul(4, 7), rev: inst.blockRevision };
    engine = { beforeState, afterState };
  } else engine = { error: made.error };
} else engine = { error: enc.error };

const report = {
  date: '2026-11-09', kind: 'targeted-soul-dynamic',
  note: 'Node fixture; not full map route or human play. Shows attach→move→block removal and door/float provider state.',
  before, attachedAfter, afterRemove,
  engine
};
writeFileSync(new URL('./28-dynamic-soul.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
