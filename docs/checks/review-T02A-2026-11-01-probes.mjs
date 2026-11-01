// 验收边界复现，不修改实现、地图或浏览器存储。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEditor,makeCanvas,ROOT } from '../../tools/loader.mjs';
const RA=loadEditor();
const results=[];
{
  const m=RA.EditorModel.create({cols:10,rows:8});
  for(let i=0;i<60;i++)m.applyChar(4,4,'S');
  results.push({probe:'A1 repeated brush in same cell',paintCalls:60,
    objectCount:m.objects.length,ids:m.objects.slice(0,4).map(o=>o.id)});
}
{
  const canvas=makeCanvas(900,600);canvas.clientWidth=900;canvas.clientHeight=600;
  const ed=new RA.Editor(canvas);
  ed.model.setTitle('keep-current-work');ed.dirty=true;
  const original=ed.model.toData();
  const bad=JSON.parse(readFileSync(join(ROOT,'levels/demo/t02a-demo.json'),'utf8'));
  bad.id='bad_ports';bad.contentHash=null;
  bad.ports={profile:'vertical-v1'};
  let returned=null,exception=null;
  try{returned=ed.openJSONText(JSON.stringify(bad),'bad-ports.json');}
  catch(e){exception={name:e.name,message:e.message};}
  results.push({probe:'A2 malformed ports import changes current model',returned,exception,
    originalId:original.id,currentId:ed.model.id,currentTitle:ed.model.title,
    oldWorkPreserved:ed.model.id===original.id&&ed.model.title===original.title,
    dirty:ed.dirty});
}
{
  const m=RA.EditorModel.create({cols:20,rows:12});
  m.data.ports={profile:'vertical-v1',entry:{col:10},exit:{col:10}};
  const impact=m.resizeImpact(8,12);
  const resized=m.resize(8,12);
  const encoded=m.toJSON();
  results.push({probe:'A3 shrink across ports without warning',impact,
    resizeOk:resized.ok,remainingPorts:m.data.ports,
    exportOk:encoded.ok,exportCode:encoded.error?.code??null,
    issues:encoded.error?.issues?.map(x=>({code:x.code,path:x.path}))??[]});
}
console.log(JSON.stringify({reviewDate:'2026-11-01',results},null,2));
