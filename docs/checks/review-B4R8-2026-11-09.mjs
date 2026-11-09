// Read-only acceptance/scope audit. No map qualification, real pool clearing, or user certification.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadEditor,ROOT,makeCanvas} from '../../tools/loader.mjs';
const RA=loadEditor(),LD=RA.LevelData,clone=x=>JSON.parse(JSON.stringify(x)),records=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
RA.Assets=class{loadAll(cb){cb();}frames(){return {};}image(){return null;}};
RA.SoundBank=class{resume(){}};
const e=new RA.Editor(makeCanvas());RA.editor=e;
e.theme='light';document.body.dataset.theme='light';e.dirty=false;
const beforeTheme=LD.hashSync(e.model.toData());
document.getElementById('btn-theme').dispatch('click',{});
const html=readFileSync(join(ROOT,'editor.html'),'utf8');
records.push({name:'24 theme/old panel acceptance',afterSingleClick:e.theme,bodyTheme:document.body.dataset.theme,
  hasInlineThemeHandler:/<button[^>]*id="btn-theme"[^>]*onclick=/.test(html),
  hashUnchanged:beforeTheme===LD.hashSync(e.model.toData()),dirty:e.dirty,
  oldParameterFormPresent:html.includes('id="obj-params"')||html.includes('id="path-points"'),
  hasGearMode:html.includes('id="gear-mode"')});
const beforeGear={hash:LD.hashSync(e.model.toData()),undo:e.undoStack.length,redo:e.redoStack.length,dirty:e.dirty};
document.getElementById('gear-mode').value='loop';
e.beginGearGesture({c:5,r:12});e.appendGearNode({c:7,r:12});e.cancelGearGesture();
records.push({name:'24 gear cancellation',before:beforeGear,
  after:{hash:LD.hashSync(e.model.toData()),undo:e.undoStack.length,redo:e.redoStack.length,dirty:e.dirty},
  objects:e.model.data.objects.length,paths:e.model.data.paths.length});
const d=clone(RA.B4_SAMPLES.normal1);d.id='review25_history_fixture';d.title='isolated historical declaration';d.contentHash=null;
d.certification={contentHash:LD.hashSync(d),rulesVersion:'old-review',rulesFingerprint:'old-review',profileId:'run-v1',
  status:'passed',completedAt:'2026-11-09T00:00:00Z',source:'local-playtest'};
const repo=RA.ContentRepository.create({adapter:new RA.ContentRepository.MemoryAdapter()});
const imported=await repo.importLevel(LD.encode(d).value);
records.push({name:'24 historical JSON declaration policy',eligible:imported.value.eligible,
  runnable:imported.value.runnable,issues:imported.value.issues,
  note:'Synthetic memory history fixture only; no real author record or browser pool changed.'});
records.push({name:'24 old entry scripts disabled',pages:['standard.html','devplay.html'].map(f=>({file:f,
  scripts:(readFileSync(join(ROOT,f),'utf8').match(/<script\b/g)||[]).length})),
  returnUsesDraftIdentity:readFileSync(join(ROOT,'js/trial.js'),'utf8').includes('from=trial&draft=')});
const sourceFiles=[];
for(const name of ['level0','test1','test2','test3','rest_level','boss']) {
  const rel='开发示例关卡/'+name+'.json',buf=readFileSync(join(ROOT,rel)),raw=buf.toString('utf8');
  let data,error=null,markers=[];
  try{data=JSON.parse(raw);}catch(err){
    error=err.message;
    if(name==='level0') {
      const part=raw.slice(raw.indexOf('"tiles"'),raw.indexOf('"ports"'));
      const rows=[...part.matchAll(/\[([^\[\]\r\n]*)\]/g)];
      rows.forEach((m,row)=>m[1].split(',').forEach((t,col)=>{if(t.trim()==='x')markers.push({col,row});}));
      // Inspect only the documented lobby markers; never write back or relax shared JSON.
      if(markers.length===2)data=JSON.parse(raw.replace(/(?<=[,\[])\s*x(?=\s*[,\]])/g,'0'));
    }
  }
  sourceFiles.push({file:rel,bytes:buf.length,sha256:sha(buf),parseError:error,rawLobbyMarkers:markers,
    id:data?.id,kind:data?.kind,size:data?.size,ports:data?.ports,objectCount:data?.objects?.length,
    matchesCurrentRuntimeTerrain: data?JSON.stringify(data.terrain.tiles)===JSON.stringify((name==='level0'?RA.B4_SAMPLES.lobby:
      name==='rest_level'?RA.B4_SAMPLES.rest:name==='boss'?RA.B4_SAMPLES.boss:RA.B4_SAMPLES['normal'+name.slice(-1)]).terrain.tiles):null});
}
records.push({name:'Moved author sources, read/identity facts only',files:sourceFiles});
const normal=clone(RA.B4_SAMPLES.normal1),rest=clone(RA.B4_SAMPLES.rest);
const res=RA.GameSession.create({floors:[normal,clone(normal),rest,clone(normal),clone(rest)],profile:'run-v1'});
if(!res.ok)throw Error(JSON.stringify(res.error));
const s=res.value,rests=[];
for(let i=1;i<=4;i++) {
  const ev=s.world.commitNext(); // Lifecycle isolation, not a real playthrough or map certification.
  if(s.world.currentFloor.data.kind==='rest')s.run.hp=40;
  s._onFloorEntered(ev);
  if(s.world.currentFloor.data.kind==='rest')rests.push({index:i,instanceId:s.world.currentFloor.instanceId??null,
    hpAfterEntry:s.run.hp,liveInstances:s.world.instances.size});
}
records.push({name:'Repeated rest lifecycle needed for floors10/30',rests,
  note:'Explicit lifecycle transitions isolate identity bug; not physical traversal or an automatic clear.'});
const runtimeFiles=['editor.html','js/editor.js','js/content-repository.js','js/tower-planner.js','js/session.js','js/world.js','js/short.js','js/boss.js'];
const result={date:'2026-11-09',head:'d41e07d',delivery:'uncommitted B4-R7/B4-R8 working tree',
  scope:'User manually accepted editor. Targeted controller/lifecycle/source audit only; no real browser/pool/data mutation.',records,
  fileHashes:Object.fromEntries(runtimeFiles.map(f=>[f,sha(readFileSync(join(ROOT,f)))]))};
writeFileSync(join(ROOT,'docs/checks/review-B4R8-2026-11-09.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exit(0);
