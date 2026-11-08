// Inspect delivered editor behavior using actual model/controller methods.
// No user draft, browser storage, gameplay data or certification is changed.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEditor,ROOT} from '../../tools/loader.mjs';
const RA=loadEditor(),LD=RA.LevelData,records=[];
{
  const model=RA.EditorModel.fromData(RA.B4_SAMPLES.normal1).value;
  const e=Object.create(RA.Editor.prototype),messages=[];
  e.model=model;e.selection={c0:15,r0:7,c1:16,r1:7};e.undoStack=[];
  e.say=(...args)=>messages.push(args);e.pushUndo=()=>e.undoStack.push(e.model.toData());e.popUndo=()=>e.undoStack.pop();
  e.markDirty=()=>{e.dirty=true};e.fitView=()=>{};e.syncUI=()=>{};
  // Real coordinate fields after crop; applyCloudEndpoint still prefers stale selection.
  e.$=id=>({value:id.endsWith('-col')?'15':id.endsWith('-row')?'0':''});
  const before=e.model.toData(),cropped=e.cropUI();
  const after=e.model.toData(),staleSelection=JSON.parse(JSON.stringify(e.selection));
  const marked=e.applyCloudEndpoint('finish');
  records.push({name:'Crop leaves old selection; marker ignores current coordinate fields',cropped,
    beforeSize:before.size,afterSize:after.size,beforePort:before.ports.finish,afterPort:after.ports.finish,
    staleSelection,markWithCurrentFields:marked,messages,
    evidence:'Controller uses selection (15,7), though model and coordinate fields say (15,0). Minimal UI harness, not full browser reproduction.'});
}
{
  const m=RA.EditorModel.fromData(RA.B4_SAMPLES.normal1).value;
  const encoded=m.toJSON(),decoded=encoded.ok?LD.decode(encoded.value):encoded;
  records.push({name:'Existing author endpoint roundtrip before crop',ok:decoded.ok,ports:decoded.ok?decoded.value.ports:null});
}
const m=RA.EditorModel.create({cols:20,rows:20,withGround:false});
m.data.paths=[{id:'one',mode:'pingpong',points:[{col:8,row:8}]}];
m.data.objects=[{id:'gear1',type:'gear',col:8,row:8,pathId:'one',params:RA.EntityRegistry.defaults('gear')}];
const norm=RA.EditorModel.fromData(m.toData());
records.push({name:'Current single-node gear play issues',normalized:norm.ok,
  issues:LD.validate(norm.ok?norm.value.toData():m.toData(),{purpose:'play'}).filter(i=>String(i.path).includes('path')||String(i.message).includes('路径'))});
const result={date:'2026-11-08',head:'ba80e23',records,
  scope:'Read-only inspection. New mouse markers and orthogonal gear gestures are requirements, not implemented behavior.'};
writeFileSync(join(ROOT,'docs/checks/editor-gesture-scope-2026-11-08.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
