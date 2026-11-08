// Read-only review of delivered runtime. Initial placement isolates a connector;
// all subsequent motion uses real fixed steps and button input. No certification.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEditor,ROOT} from '../../tools/loader.mjs';
const RA=loadEditor(),TS=RA.C.TS,clone=v=>JSON.parse(JSON.stringify(v));
const records=[];
function session() {
  const r=RA.GameSession.create({floors:['lobby','normal1','normal2','normal3','rest','boss'].map(k=>clone(RA.B4_SAMPLES[k])),profile:'run-v1',requireCloud:true});
  if(!r.ok)throw Error(r.error.message);
  r.value.pressInteract();r.value.stepOnce();return r.value;
}
function atLowerBoard(s,index,side) {
  const l=s.world.links[index],p=s.player;
  p.x=side<0?l.openingLeft+1:side>0?l.openingRight-p.w-1:(l.openingLeft+l.openingRight-p.w)/2;
  p.y=l.finishY-p.h;p.vx=p.vy=0;p.onGround=true;p.coyote=0.1;p.jumpsUsed=0;p.prevJump=false;
}
function jump(n){return n<20||(n>=24&&n<60);}
function prepare(index) {
  const s=session();
  for(let i=1;i<index;i++) {
    atLowerBoard(s,i,0);
    for(let n=0;n<180&&s.world.current===i;n++){s.setActions({left:false,right:false,jumpHeld:jump(n)});s.stepOnce();}
    if(s.world.current!==i+1)throw Error('Control ascent failed at '+i);
  }
  return s;
}
for(const index of [1,2,3,4])for(const direction of [-1,1])for(const lateralStart of [0,17]) {
  const s=prepare(index),w=s.world,p=s.player,l=w.links[index],upper=w.instances.get(index+1);
  atLowerBoard(s,index,direction);
  const col=direction<0?upper.start.col-1:upper.start.col+2;
  const wall={x:upper.origin.x+col*TS,y:upper.origin.y+upper.start.row*TS,w:TS,h:TS};
  const initial={x:p.x,y:p.y,feet:p.feet};
  const hits=[];
  for(let n=0;n<90&&w.current===index;n++) {
    s.setActions({left:direction<0&&n>=lateralStart,right:direction>0&&n>=lateralStart,jumpHeld:jump(n)});
    s.stepOnce();
    const ox=Math.min(p.x+p.w,wall.x+wall.w)-Math.max(p.x,wall.x);
    const oy=Math.min(p.y+p.h,wall.y+wall.h)-Math.max(p.y,wall.y);
    // Ignore subpixel contact. Full-body overlap is much stronger evidence than
    // the existing +/-1px sampling convention.
    if(ox>1&&oy>1)hits.push({frame:n,x:p.x,y:p.y,feet:p.feet,vx:p.vx,vy:p.vy,
      overlapX:ox,overlapY:oy,current:w.current,upperState:upper.state,
      activeHits:w.currentFloor.level.hits(p.x-w.currentFloor.origin.x,p.y-w.currentFloor.origin.y,p.w,p.h),
      previewHits:upper.level.hits(p.x-upper.origin.x,p.y-upper.origin.y,p.w,p.h)});
  }
  records.push({name:'B4-R2 preview cloud side wall',index,lowerId:w.floorsData[index].id,upperId:upper.data.id,
    direction,lateralStart,initial,wall,wallTile:upper.data.terrain.tiles[upper.start.row][col],
    reproduced:hits.length>0,fullBodyInside:hits.some(h=>h.overlapX>=p.w-0.01&&h.overlapY>=p.h-0.01),
    firstHit:hits[0]||null,largestHit:hits.sort((a,b)=>b.overlapX*b.overlapY-a.overlapX*a.overlapY)[0]||null,
    end:{current:w.current,x:p.x,y:p.y,status:s.status}});
}
{
  const s=session(),f=s.world.currentFloor;
  const point={x:f.origin.x+(f.start.col+0.5)*TS,y:f.origin.y+f.start.row*TS+1};
  const wr=Math.floor(point.y/TS),wc=Math.floor(point.x/TS);
  records.push({name:'Coordinate consistency at actual cloud top+1px',origin:f.origin,tileSize:TS,
    originTileY:f.originTileY,actualCell:f.start,point,queriedWorldCell:{row:wr,col:wc},
    mappedLocalCell:{row:wr-f.originTileY,col:wc-f.originTileX},
    actualOneWay:!!f.level.oneway[f.start.row][f.start.col],blockedAt:f.view.blockedAt(wr,wc),
    note:'World origin -2000 is not a TS multiple; rounding the origin maps part of a tile to its neighbor. This affects ledge-assist queries.'});
}
const summary={cases:16,reproduced:records.slice(0,16).filter(r=>r.reproduced).length,
  fullBodyInside:records.slice(0,16).filter(r=>r.fullBodyInside).length};
const result={head:'9219fc3',implementation:'7fff152',date:'2026-11-08',summary,records,
  scope:'Real runtime collision reproduction from lower-board initial fixtures; not full-level playthrough or a passed certification.'};
writeFileSync(join(ROOT,'docs/checks/review-B4R1-2026-11-08-probes.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(summary));
for(const r of records)console.log(JSON.stringify(r.name.startsWith('Coordinate')?r:{index:r.index,direction:r.direction,lateralStart:r.lateralStart,reproduced:r.reproduced,fullBodyInside:r.fullBodyInside,firstHit:r.firstHit}));
