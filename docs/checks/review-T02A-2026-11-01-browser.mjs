// 独立复跑既有浏览器测试；复制新证据后恢复原交付证据，避免覆盖历史记录。
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/loader.mjs';
const names=['t02a-browser-import.png','t02a-browser-draw.png','t02a-browser-reopen.png',
  't02a-browser-exported.json','browser-t02a-2026-10-31.json'];
const backup=new Map(names.map(n=>[n,readFileSync(join(ROOT,'docs/checks',n))]));
let status=1;
try {
  const r=spawnSync(process.execPath,['tools/browser_t02a.mjs'],{
    cwd:ROOT,encoding:'utf8',timeout:60000,windowsHide:true});
  const log=(r.stdout??'')+(r.stderr??'')+(r.error?String(r.error):'');
  writeFileSync(join(ROOT,'docs/checks/review-T02A-2026-11-01-browser.txt'),log);
  process.stdout.write(log);
  status=r.status??1;
  for(const n of names)if(status===0&&existsSync(join(ROOT,'docs/checks',n))) {
    writeFileSync(join(ROOT,'docs/checks','review-T02A-2026-11-01-'+n),
      readFileSync(join(ROOT,'docs/checks',n)));
  }
} finally {
  for(const [n,b]of backup)writeFileSync(join(ROOT,'docs/checks',n),b);
}
console.log('BROWSER_ACTUAL_EXIT_CODE='+status);
process.exitCode=status;
