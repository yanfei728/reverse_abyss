// Audit actual editor/page methods with DOM/assets substitutes; never a human clear.
// No browser user data, certification or project runtime file is written.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {loadEditor,ROOT,makeCanvas} from '../../tools/loader.mjs';
const RA=loadEditor(),LD=RA.LevelData,clone=v=>JSON.parse(JSON.stringify(v)),records=[];
const messages=[];
function editor(data) {
  const e=Object.create(RA.Editor.prototype);
  Object.assign(e,{model:RA.EditorModel.fromData(data).value,workspaceToken:'review-workspace',draftId:'review-only',draftRevision:1,
    dirty:false,tool:'brush',ch:'~',brush:1,stroke:null,selection:null,portMark:null,gearGesture:null,autoGrow:false,undoStack:[],paletteItems:[]});
  e.say=(...a)=>messages.push(a);e.syncUI=()=>{};e.highlightTools=()=>{};e.highlightPalette=()=>{};
  e.markDirty=()=>{e.dirty=true};e.pushUndo=()=>e.undoStack.push(e.model.toData());e.popUndo=()=>e.undoStack.pop();
  e.saveDraft=async()=>{e.dirty=false;return true};e.cellAt=()=>({c:15,r:7});
  return e;
}
{
  const e=editor(RA.B4_SAMPLES.normal1);
  e.beginPortMark('finish');
  const brushAfterBegin=e.ch,before=e.model.data.terrain.tiles[7].slice(15,17);
  e.paintStep({x:0,y:0});
  const afterConfirm=e.model.data.terrain.tiles[7].slice(15,17),markAfterConfirm=e.portMark;
  // paintStep is invoked once per held-left frame by Editor.update.
  e.paintStep({x:0,y:0});
  records.push({name:'Mark does not switch brush; held-left next frame paints former material',
    brushBefore:'~',brushAfterBegin,before,afterConfirm,markAfterConfirm,afterHeldFrame:e.model.data.terrain.tiles[7].slice(15,17),
    port:e.model.data.ports.finish,errors:LD.errorsOf(LD.validate(e.model.toData(),{purpose:'play'})),
    scope:'Actual controller calls; UI/coordinates stubbed. No real screen test.'});
}
let handoff;
{
  const e=editor(RA.B4_SAMPLES.normal1),ok=await e.openPlaytest();
  handoff=JSON.parse(sessionStorage.getItem('RA_DEVPLAY_V1'));
  records.push({name:'Development launch uses an authored map as next, not safe exit support',ok,href:location.href,
    templateId:handoff.template.id,nextId:handoff.next.id,nextTitle:handoff.next.title,nextSize:handoff.next.size,
    nextEqualsAuthorTest2:LD.hashSync(handoff.next)===LD.hashSync(RA.B4_SAMPLES.normal2)});
}
// Run the real development page, consuming its real animation callback and key handlers.
const queue=[];globalThis.requestAnimationFrame=fn=>{queue.push(fn);return queue.length};
const getId=document.getElementById.bind(document),cv=makeCanvas(960,540);
document.getElementById=id=>id==='dev-canvas'?cv:getId(id);
RA.Assets=class {loadAll(cb){cb()}frames(){return {}}image(){return null}};
vm.runInThisContext(readFileSync(join(ROOT,'js/devplay.js'),'utf8'),{filename:'js/devplay.js'});
{
  const s=RA.devplay.session,w=s.world,p=s.player,l=w.links[0];
  p.x=(l.openingLeft+l.openingRight-p.w)/2;p.y=l.finishY-p.h;p.vx=p.vy=0;p.onGround=true;p.coyote=0.1;p.jumpsUsed=0;p.prevJump=false;
  let held=false,t=1000,frames=0;
  for(let n=0;n<180&&w.current===0;n++) {
    const next=n<20||(n>=24&&n<60);
    if(next!==held){globalThis.dispatch(next?'keydown':'keyup',{code:'Space',repeat:false});held=next;}
    const cb=queue.shift();if(!cb)throw Error('Missing animation callback');cb(t);t+=1000/60;frames++;
  }
  if(held)globalThis.dispatch('keyup',{code:'Space'});
  const atExit={floorIndex:s.floorIndex,status:s.status,time:s.time,id:w.currentFloor.data.id};
  for(let n=0;n<60;n++){const cb=queue.shift();if(!cb)break;cb(t);t+=1000/60;}
  records.push({name:'Actual devplay animation crosses subject exit but keeps playing next authored map',
    frames,atExit,afterOneSecond:{floorIndex:s.floorIndex,status:s.status,time:s.time,id:w.currentFloor.data.id},
    hud:getId('hud').textContent,statusText:getId('dev-status').textContent,
    profile:s.profile.profile||s.profile.profileId||null,
    note:'Initial fixture at the subject finish; afterward only real page key input and fixed simulation. Not a full-level/human clear.'});
}
const std=readFileSync(join(ROOT,'js/standard.js'),'utf8');
records.push({name:'Standard route inspected independently in source',
  floors:'[generated entry, template, generated exit]',profile:'standard-v1',
  hasFloor2WinGuard:std.includes("s.floorIndex === 2")&&std.includes("s.win('standardExit')"),
  hasHashRevisionGuards:std.includes('hash !== h.contentHash')&&std.includes('loaded.value.revision !== h.revision'),
  note:'Source inspection only. No standard page success or certification is simulated in this audit.'});
const result={head:'d614fe0',implementation:'e764910',date:'2026-11-08',records,messages};
writeFileSync(join(ROOT,'docs/checks/review-B4R3-2026-11-08-probes.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(0);
