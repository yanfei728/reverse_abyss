// Independent review: use the delivered modules; never write gameplay data/certification.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { loadEditor, ROOT } from '../../tools/loader.mjs';

const RA = loadEditor(), TS = RA.C.TS, LD = RA.LevelData;
const clone = v => JSON.parse(JSON.stringify(v));
const rows = [];
const record = (name, value) => rows.push({ name, ...value });
const make = () => RA.GameSession.create({
  floors: ['lobby','normal1','normal2','normal3','rest','boss'].map(k => clone(RA.B4_SAMPLES[k])),
  profile: 'run-v1'
}).value;
const overlap = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;

// Place the player at a seam for isolation, then run the real fixed step with real input.
// This is a collision reproduction, NOT evidence of traversing an entire level.
{
  const s = make(), w = s.world;
  w.commitNext(); // setup: ordinary test1 is current, test2 is preview
  const link = w.links[1], upper = w.instances.get(2), p = s.player;
  p.x = link.openingLeft + 1; p.y = link.startY + 2;
  p.vx = -300; p.vy = 0; p.onGround = false;
  const wall = { x:link.openingLeft-TS, y:link.startY, w:TS, h:TS };
  const before = { x:p.x, y:p.y, feet:p.feet };
  s.setActions({left:true}); s.stepOnce();
  record('R2: before commit, preview endpoint stone is ignored by active collision', {
    reproduced: overlap(p,wall), current:w.current, previewState:upper.state,
    previewStone:upper.data.terrain.tiles[upper.start.row][upper.start.col-1],
    startY:link.startY, openingLeft:link.openingLeft, before,
    after:{x:p.x,y:p.y,feet:p.feet}, wall
  });
}
{
  const s=make(), w=s.world;
  w.commitNext(); w.commitNext(); w.commitNext(); // setup: test3 active
  const f=w.currentFloor, link=w.links[3], p=s.player;
  const wall=link.walls[0];
  p.x=link.openingLeft+1; p.y=wall.y+2; p.vx=-300; p.vy=0; p.onGround=false;
  const localRow=Math.floor((p.y-f.origin.y)/TS), localCol=f.finish.col-1;
  const recordedSolid=f.solidAt(localRow,localCol);
  s.setActions({left:true}); s.stepOnce();
  record('R2: test3 generated pipe wall outside raw grid is not collidable', {
    reproduced:recordedSolid && overlap(p,wall), localRow, recordedSolid,
    current:w.current, origin:f.origin, wall, after:{x:p.x,y:p.y,feet:p.feet}
  });
}
{
  const s=make(), w=s.world;
  w.commitNext(); w.commitNext(); w.commitNext();
  const f=w.currentFloor, link=w.links[3], p=s.player;
  p.x=link.openingLeft+TS-p.w/2; p.y=link.startY-p.h+10; p.vx=0; p.vy=-400; p.onGround=false;
  const beforeFeet=p.feet;
  s.stepOnce();
  record('control: centered ascent remains possible in this one step', {
    movedUp:p.feet<beforeFeet,
    beforeFeet, afterFeet:p.feet, commitY:link.commitY,
    current:w.current, localTop:f.origin.y
  });
}
{
  const s=make(), w=s.world;
  w.commitNext();
  const f=w.currentFloor, link=w.links[1], upper=w.instances.get(2);
  const x=link.openingLeft+TS-10, y=link.startY-36+0.2;
  const r=f.view.move(x,y,20,36,0,120,1/60);
  record('control: descending from within a one-way cloud remains passable', {
    movedDown:r.y>y+0.1 && !r.grounded,
    oldFeet:y+36, nextFeet:r.y+36, cloudY:link.startY,
    previewCloud:upper.data.terrain.tiles[upper.start.row][upper.start.col],
    note:'Descending from below the cloud top should remain passable; this probe records coverage, not a defect by itself.'
  });
}
{
  const base=RA.EditorModel.create({cols:20,rows:20,withGround:false});
  base.data.terrain.tiles[5][5]=4;
  base.data.objects=[{id:'fb',type:'fireball_static',col:8,row:8,params:{radiusTiles:1}}];
  const m=RA.EditorModel.fromData(base.toData()).value;
  const plan=m.cropCandidate();
  record('R4: crop ignores the known fireball radius', {
    reproduced:plan.ok && plan.value.changed && plan.value.afterSize.cols<5,
    ok:plan.ok, afterSize:plan.value?.afterSize, offset:plan.value?.offset,
    bounds:m.contentBounds(), object:m.data.objects[0],
    note:'Object center is (8.5,8.5), radius 1; crop ends at 9 in each axis, excluding half a tile of its live footprint.'
  });
}
{
  const base=RA.EditorModel.create({cols:20,rows:20,withGround:false});
  base.data.terrain.tiles[5][5]=4;
  base.data.objects=[{id:'future',type:'future_spatial',col:8,row:8,params:{anchor:{col:15,row:15}}}];
  const m=RA.EditorModel.fromData(base.toData()).value;
  const plan=m.cropCandidate();
  record('R4: crop accepts unknown spatial semantics instead of refusing', {
    reproduced:plan.ok && plan.value.changed, ok:plan.ok,
    afterSize:plan.value?.afterSize, preservedUnknown:plan.value?.model?.data.objects[0]
  });
}
try {
  const result=RA.GameSession.create({floors:[clone(RA.B4_SAMPLES.normal1),clone(RA.DEV_SAMPLES.floorB)]});
  record('R3: editor development handoff mixes cloud and old sample B',{reproduced:false,result});
} catch(e) {
  record('R3: editor development handoff mixes cloud and old sample B',{
    reproduced:true,error:String(e),stack:e.stack,
    note:'The delivered Editor.openPlaytest constructs exactly this floor pair.'
  });
}
const external='C:/Users/beilu/Documents/blcreate/开发示例关卡';
for(const name of ['level0','boss','test1','test2','test3']) {
  const raw=readFileSync(join(external,name+'.json'));
  const info={bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};
  let data;
  try { data=JSON.parse(raw.toString('utf8')); info.validJSON=true; }
  catch(e) {
    info.validJSON=false; info.parseError=e.message;
    // Isolated inspection only: preserve every x as a string marker, not executable text.
    data=JSON.parse(raw.toString('utf8').replace(/\bx\b/g,'"x"'));
  }
  const markers=[], clouds=[];
  data.terrain.tiles.forEach((r,y)=>r.forEach((t,x)=>{
    if(t==='x')markers.push({col:x,row:y});
    if(t===5)clouds.push({col:x,row:y});
  }));
  Object.assign(info,{id:data.id,kind:data.kind,size:data.size,ports:data.ports,spawn:data.spawn,markers,clouds});
  if(info.validJSON) {
    info.draftErrors=LD.errorsOf(LD.validate(data,{purpose:'draft'}));
    info.hashMatches=LD.hashSync(data)===data.contentHash;
  }
  if(name.startsWith('test')) {
    const b=readFileSync(join(ROOT,'levels/authored/source-2026-11-07',name+'.json'));
    info.matchesPreviousOriginal=raw.equals(b);
  }
  record('source: '+name,info);
}
const short=readFileSync(join(ROOT,'js/short.js'),'utf8');
record('R1: pipe renderer uses its own rectangle style',{
  reproduced:short.includes("ctx.fillStyle = '#4b5563'") && short.includes('ctx.fillRect(w.x - cam.x'),
  existingStone:LD.TILES.find(t=>t.id===4), existingTexture:RA.TILE_IMAGES['='][0]
});
const out={head:'4b997df',date:'2026-11-07',scope:'PC independent logic probes; no human clear, certification or APK',records:rows};
writeFileSync(join(ROOT,'docs/checks/review-B4-2026-11-07-probes.json'),JSON.stringify(out,null,2)+'\n');
for(const r of rows)console.log(r.name+': '+JSON.stringify(r));
