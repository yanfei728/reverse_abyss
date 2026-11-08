// Read-only audit of delivered runtime/controller with synthetic maps and fake DOM.
// Does not run successful certification, publish user content, or touch browser data.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { loadEditor, ROOT, makeCanvas } from '../../tools/loader.mjs';
const RA = loadEditor(), TS = RA.C.TS, records = [];
function level() {
  const cols = 80, rows = 50, tiles = Array.from({length: rows}, () => Array(cols).fill(0));
  tiles[40].fill(1); tiles[40][20] = tiles[40][21] = 5;
  tiles[0][60] = tiles[0][61] = 5; tiles[0][59] = tiles[0][62] = 1;
  return { schemaVersion: 2, id: 'review_r5_synthetic', title: 'review-only', kind: 'normal', difficulty: 1,
    size: {cols, rows}, terrain: {tiles}, spawn: null,
    ports: {profile: 'cloud-pipe-v2', start: {col:20,row:40}, finish:{col:60,row:0}},
    objects: [], paths: [], visuals: {backgroundId:'sky1',decorations:[]}, extensions:{}, certification:null, contentHash:null };
}
function handoff(d) { return { version:3, kind:'editor-validation', profileId:'standard-v1', template:d,
  subjectRef:{levelId:d.id,contentHash:RA.LevelData.hashSync(d)}, draftRef:{draftId:'review-only',revision:1},
  rules:{rulesVersion:RA.RULES.rulesVersion,rulesFingerprint:RA.RULES.rulesFingerprint}, requestId:'review-only' }; }
function pair(d=level()) {
  assert.equal(RA.LevelData.errorsOf(RA.LevelData.validate(d,{purpose:'play'})).length,0);
  const plan=RA.TrialSession.build(handoff(d)); assert.ok(plan.ok,JSON.stringify(plan.error));
  const game=RA.GameSession.create({floors:[d],profile:'standard-v1',requireCloud:true}); assert.ok(game.ok);
  return { trial:RA.TrialSession.create(plan.value), game:game.value };
}
function inst(s) { return s.inst || s.world.currentFloor; }
function snap(s) { return {x:s.player.x,feet:s.player.feet,vx:s.player.vx,vy:s.player.vy,
  jumpsUsed:s.player.jumpsUsed,onGround:s.player.onGround,hp:s.run.hp,time:s.time,status:s.status}; }
function run(s,hz,seconds,action) {
  const start=snap(s); let top=s.player.feet, jumps=0;
  for(let i=0;i<Math.round(hz*seconds);i++) {
    const prev=s.player.jumpsUsed;
    s.setActions(action(i/hz)); s.update(1/hz);
    top=Math.min(top,s.player.feet); if(s.player.jumpsUsed>prev) jumps++;
  }
  return {dx:s.player.x-start.x,rise:start.feet-top,jumpStarts:jumps,...snap(s)};
}
for(const hz of [30,60,90,120,144]) {
  const p=pair(); for(const s of Object.values(p)) s.update(1/60);
  const trial=run(p.trial,hz,1,()=>({right:true}));
  const game=run(p.game,hz,1,()=>({right:true}));
  records.push({name:'One real second walking, same map/actions',hz,trial,game,displacementRatio:trial.dx/game.dx});
}
for(const hz of [30,60,120,144]) {
  const p=pair(); for(const s of Object.values(p)) s.update(1/60);
  // First press 0-.2s, release, second press .3-.45s, both in real time.
  const actions=t=>({jumpHeld:t<.2 || (t>=.3 && t<.45)});
  records.push({name:'Same real-time double-jump sequence',hz,
    trial:run(p.trial,hz,1.2,actions),game:run(p.game,hz,1.2,actions)});
}
{
  const p=pair(); const before={trial:snap(p.trial),game:snap(p.game)};
  for(const s of Object.values(p)) {s.setActions({right:true});s.update(0);}
  records.push({name:'Zero elapsed time still advances trial physics',before,after:{trial:snap(p.trial),game:snap(p.game)}});
}
for(const type of ['crumble_door','blink_platform','spring','gear','spike','fireball_static']) {
  const d=level(), o={id:'review-object',type,col:25,row:38,params:RA.EntityRegistry.defaults(type)};
  d.objects.push(o);
  if(type==='gear') {o.pathId='review-path';d.paths.push({id:o.pathId,mode:'pingpong',points:[{col:o.col,row:o.row}]});}
  const p=pair(d);
  for(const s of Object.values(p)) {
    const pl=s.player; pl.x=(o.col+.5)*TS-pl.w/2;
    if(type==='crumble_door') {pl.x=o.col*TS-pl.w-1;pl.y=(o.row+1)*TS-pl.h;}
    else if(type==='blink_platform'||type==='spike') pl.y=o.row*TS-pl.h;
    else if(type==='spring') pl.y=o.row*TS+5-pl.h;
    else pl.y=(o.row+.5)*TS-pl.h/2;
    pl.vx=pl.vy=0;pl.onGround=true;
    if(type==='fireball_static') {
      // Start halo just outside contact damage range but within the common radius.
      pl.x=o.col*TS-TS;pl.y=(o.row+.5)*TS-pl.h/2;
      s.run.haloCooldownRemaining=0;s.pressSkill();
    }
    for(let i=0;i<(type==='blink_platform'||type==='spike'?45:2);i++) s.update(1/60);
  }
  records.push({name:'Same registered object at 60Hz, isolated contact fixture',type,
    trial:{player:snap(p.trial),object:inst(p.trial).objects[0]},
    game:{player:snap(p.game),object:inst(p.game).objects[0]}});
}
// Real page callbacks; substituted canvas, no successful finish/certification.
sessionStorage.setItem('RA_TRIAL_V3',JSON.stringify(handoff(level())));
const queue=[],getId=document.getElementById.bind(document),cv=makeCanvas();
document.getElementById=id=>id==='dev-canvas'?cv:getId(id);
globalThis.requestAnimationFrame=fn=>{queue.push(fn);return queue.length;};
RA.Assets=class {loadAll(cb){cb();} frames(){return {};} image(){return null;}};
vm.runInThisContext(readFileSync(join(ROOT,'js/trial.js'),'utf8'),{filename:'js/trial.js'});
const s=RA.trial.session;let now=1000;
function frame(){const cb=queue.shift();assert.ok(cb);cb(now);now+=1000/60;}
function key(code,down){globalThis.dispatch(down?'keydown':'keyup',{code,repeat:false});}
key('KeyD',true);key('ArrowRight',true);frame();key('KeyD',false);frame();
records.push({name:'Real page releases D while ArrowRight remains down',actions:{...s.actions},player:snap(s)});
key('ArrowRight',false);key('Space',true);frame();key('KeyW',true);key('Space',false);frame();
records.push({name:'Real page releases Space while W remains down',actions:{...s.actions},player:snap(s)});
key('KeyW',false);key('KeyD',true);frame();globalThis.dispatch('blur',{});frame();
records.push({name:'Real page loses focus with D held',actions:{...s.actions},status:s.status,player:snap(s)});
key('KeyD',false);
records.push({name:'Visible pause/restart buttons have no click listeners in fake DOM',
  buttons:['btn-pause','btn-restart','btn-resume','btn-restart-pause','btn-done-restart'].map(id=>({id,
    clickListeners:(getId(id).__listeners?.click||[]).length}))});
const result={date:'2026-11-08',head:'7f4f295',implementation:'c4fcb53',
  scope:'Runtime/controller audit with synthetic maps and fake DOM; no screen, full-level clear, or user certification.',records};
writeFileSync(join(ROOT,'docs/checks/review-B4R5-2026-11-08-probes.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(0);
