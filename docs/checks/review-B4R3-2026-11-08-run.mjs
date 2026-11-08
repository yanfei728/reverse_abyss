// Capture the actual child exit code independently of the outer shell lifetime.
import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),p=resolve(root,'docs/checks/review-B4R3-2026-11-08-test_all.txt');
if(existsSync(p))copyFileSync(p,p.replace('.txt','-initial.txt'));
const r=spawnSync(process.execPath,['tools/test_all.mjs'],{cwd:root,encoding:'utf8',timeout:60000,windowsHide:true});
writeFileSync(p,(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):''));
const result={test_all:{exitCode:r.status,error:r.error?String(r.error):null},note:'Actual child result; initial shell output preserved separately.'};
writeFileSync(resolve(root,'docs/checks/review-B4R3-2026-11-08-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));process.exit(r.status===null?1:r.status);
