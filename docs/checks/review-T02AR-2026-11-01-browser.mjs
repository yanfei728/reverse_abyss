// 独立复跑并保留交付方原始证据；成功才复制本轮截图与下载文件。
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/loader.mjs';
const names=['t02ar-browser-import.png','t02ar-browser-bad-import.png',
 't02ar-browser-resize.png','t02ar-browser-exported.json','browser-t02a-r-2026-11-01.json'];
const backup=new Map(names.map(n=>[n,readFileSync(join(ROOT,'docs/checks',n))]));
let status=1;
try {
 const r=spawnSync(process.execPath,['tools/browser_t02a_r.mjs'],
  {cwd:ROOT,encoding:'utf8',timeout:60000,windowsHide:true});
 const log=(r.stdout??'')+(r.stderr??'')+(r.error?String(r.error):'');
 writeFileSync(join(ROOT,'docs/checks/review-T02AR-2026-11-01-browser.txt'),log);
 process.stdout.write(log);status=r.status??1;
 if(status===0)for(const n of names)if(existsSync(join(ROOT,'docs/checks',n)))
  writeFileSync(join(ROOT,'docs/checks','review-T02AR-2026-11-01-'+n),readFileSync(join(ROOT,'docs/checks',n)));
} finally {for(const [n,b] of backup)writeFileSync(join(ROOT,'docs/checks',n),b);}
console.log('BROWSER_ACTUAL_EXIT_CODE='+status);process.exitCode=status;
