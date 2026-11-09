// Read-only reproduction using the exact script list in delivered trial.html.
// Fake DOM/canvas only; no level acceptance, user certification, or storage writes.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {loadEditor,ROOT,makeCanvas} from '../../tools/loader.mjs';
loadEditor(); // Install the existing DOM harness; replace RA before replaying HTML.
globalThis.RA={};
const getId=document.getElementById.bind(document),cv=makeCanvas();
document.getElementById=id=>id==='dev-canvas'?cv:getId(id);
const html=readFileSync(join(ROOT,'trial.html'),'utf8');
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1]);
const d={schemaVersion:2,id:'startup-review-only',title:'startup-only',kind:'normal',difficulty:1,
  size:{cols:12,rows:10},spawn:null,ports:{profile:'cloud-pipe-v2',start:{col:2,row:6},finish:{col:2,row:2}},
  terrain:{tiles:Array.from({length:10},()=>Array(12).fill(0))},objects:[],paths:[],
  visuals:{backgroundId:'sky1',decorations:[]},extensions:{},certification:null,contentHash:null};
for(const row of [2,6]){d.terrain.tiles[row][1]=d.terrain.tiles[row][4]=1;d.terrain.tiles[row][2]=d.terrain.tiles[row][3]=5;}
let startupError=null,scheduled=0;
globalThis.requestAnimationFrame=()=>++scheduled;
for(const rel of scripts) {
  if(rel==='js/trial.js') {
    const h={version:3,kind:'editor-validation',profileId:'standard-v1',template:d,
      subjectRef:{levelId:d.id,contentHash:RA.LevelData.hashSync(d)},draftRef:{draftId:'review-only',revision:1},
      rules:{rulesVersion:RA.RULES.rulesVersion,rulesFingerprint:RA.RULES.rulesFingerprint},requestId:'review-only'};
    sessionStorage.setItem('RA_TRIAL_V3',JSON.stringify(h));
    getId('trial-info').textContent='正在启动试玩验证…';
  }
  try {vm.runInThisContext(readFileSync(join(ROOT,rel),'utf8'),{filename:rel});}
  catch(e){startupError={script:rel,name:e.name,message:e.message,stack:e.stack.split('\n').slice(0,4)};break;}
}
const first={name:'Exact delivered HTML dependency order',actionInputType:typeof RA.ActionInput,
  includesActionInput:scripts.includes('js/platform/action-input.js'),scheduledRAF:scheduled,
  trialExposed:!!RA.trial,loadingText:getId('trial-info').textContent,error:startupError};
// Isolate the missing dependency without editing the HTML; this is an audit-only diagnostic.
vm.runInThisContext(readFileSync(join(ROOT,'js/platform/action-input.js'),'utf8'),{filename:'js/platform/action-input.js'});
RA.Assets=class{loadAll(cb){cb();}frames(){return {};}image(){return null;}};
const queue=[];globalThis.requestAnimationFrame=fn=>{queue.push(fn);return queue.length;};
vm.runInThisContext(readFileSync(join(ROOT,'js/trial.js'),'utf8'),{filename:'js/trial.js'});
const s=RA.trial.session;
let now=1000;function frame(){const cb=queue.shift();if(!cb)throw Error('No scheduled RAF');cb(now);now+=1000/60;}
function key(code){globalThis.dispatch('keydown',{code,repeat:false});globalThis.dispatch('keyup',{code,repeat:false});}
frame();key('KeyP');frame();const paused=s.status;key('KeyP');frame();
const second={name:'Audit-only load of missing dependency permits boot',trialExposed:!!RA.trial,
  afterFirstPause:paused,afterSecondPauseKey:s.status,
  actionSnapshot:(()=>{const i=new RA.ActionInput();i.setHeld('key:Space','jump',true);return i.consume();})(),
  sessionJumpPropertyInPage:/jumpHeld:\s*a\.held\.jump\s*[},]/.test(readFileSync(join(ROOT,'js/trial.js'),'utf8')),
  note:'Input module emits jumpHeld, page reads held.jump; pause edge consumed only while running.'};
getId('btn-resume').dispatch('click',{});
globalThis.dispatch('keydown',{code:'Space',repeat:false});
for(let i=0;i<6;i++)frame();
const third={name:'Actual page holding Space after audit-only dependency injection',status:s.status,
  actions:{...s.actions},jumpsUsed:s.player.jumpsUsed,feet:s.player.feet,startFeet:s.plan.spawn.row*RA.C.TS};
const result={date:'2026-11-08',head:'d41e07d',scope:'Exact HTML script-order and controller audit with DOM/canvas substitutes; not a screen/manual clear.',records:[first,second,third]};
writeFileSync(join(ROOT,'docs/checks/review-B4R6-2026-11-08-startup.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(0);
