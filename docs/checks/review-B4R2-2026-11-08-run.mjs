// Independent verification. Restore original reproduction/browser artifacts by bytes.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT} from '../../tools/loader.mjs';
const dir=join(ROOT,'docs/checks'),prefix='review-B4R2-2026-11-08-',results={};
function run(name,script,timeout=60000) {
  const r=spawnSync(process.execPath,[script],{cwd:ROOT,encoding:'utf8',timeout,windowsHide:true});
  writeFileSync(join(dir,prefix+name+'.txt'),(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):''));
  results[name]={exitCode:r.status,error:r.error?String(r.error):null};
  console.log(name+': '+JSON.stringify(results[name]));return r;
}
run('test_all','tools/test_all.mjs');
const oldName='review-B4R1-2026-11-08-probes.json',oldBytes=readFileSync(join(dir,oldName));
try {
  const r=run('probes','docs/checks/review-B4R1-2026-11-08-probes.mjs');
  if(r.status===0){const d=JSON.parse(readFileSync(join(dir,oldName),'utf8'));d.head='ba80e23';d.implementation='eba80a6 + ba80e23';d.scope+=' Re-run against B4-R2; original B4-R1 artifact restored.';const coord=d.records.find(x=>x.name.startsWith('Coordinate'));if(coord)coord.note='Re-run after fix: origin is -2025, a TS45 multiple; actual and queried local row agree.';writeFileSync(join(dir,prefix+'probes.json'),JSON.stringify(d,null,2)+'\n');results.probes.summary=d.summary;}
}finally{writeFileSync(join(dir,oldName),oldBytes);}
const names=readdirSync(dir).filter(n=>/^b4r1-.*\.png$/.test(n)||n==='browser-b4r1-2026-11-07.json');
const backup=names.map(n=>[n,readFileSync(join(dir,n))]);
try {
  const r=run('browser','tools/browser_b4r1.mjs',45000);
  if(r.status===0)for(const n of names)writeFileSync(join(dir,prefix+n),readFileSync(join(dir,n)));
}finally{for(const[n,b]of backup)writeFileSync(join(dir,n),b);}
writeFileSync(join(dir,prefix+'results.json'),JSON.stringify(results,null,2)+'\n');
process.exit(Object.values(results).some(r=>r.exitCode!==0||r.error)?1:0);
