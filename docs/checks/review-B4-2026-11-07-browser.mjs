// Preserve original delivery evidence even if the browser check succeeds.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT} from '../../tools/loader.mjs';
const dir=join(ROOT,'docs/checks'), prefix='review-B4-2026-11-07-';
const names=readdirSync(dir).filter(n=>/^b4-.*\.png$/.test(n)||n==='browser-b4-2026-11-07.json');
const backup=names.map(n=>[n,readFileSync(join(dir,n))]);
let result;
try {
  const r=spawnSync(process.execPath,['tools/browser_b4.mjs'],{cwd:ROOT,encoding:'utf8',timeout:45000,windowsHide:true});
  result={exitCode:r.status,error:r.error?String(r.error):null};
  writeFileSync(join(dir,prefix+'browser.txt'),(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):''));
  if(r.status===0&&!r.error) for(const n of names)writeFileSync(join(dir,prefix+n),readFileSync(join(dir,n)));
} finally {
  for(const [name,bytes] of backup)writeFileSync(join(dir,name),bytes);
}
writeFileSync(join(dir,prefix+'browser-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
process.exit(result?.exitCode===0&&!result?.error?0:1);
