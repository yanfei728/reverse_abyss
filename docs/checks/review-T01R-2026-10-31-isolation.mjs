// 验收专用：隔离重迁，不改正式 levels/ 或已有报告。
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planMigration, commitPlan, sha256 } from '../../tools/migrate_levels.mjs';
import { ROOT } from '../../tools/loader.mjs';

const files=readdirSync(join(ROOT,'levels')).filter(f=>f.endsWith('.json')).sort();
const before=files.map(f=>sha256(readFileSync(join(ROOT,'levels',f))));
const dir=mkdtempSync(join(tmpdir(),'reverse-abyss-reaccept-'));
const plan=planMigration({inDir:'levels',outDir:join(dir,'out'),report:join(dir,'report.md')});
const result=plan.ok?commitPlan(plan,new Date('2026-10-31T00:00:00Z')):null;
const migrated=files.filter(f=>!f.startsWith('_'));
const equal=migrated.every(f=>existsSync(join(dir,'out',f))&&
  readFileSync(join(dir,'out',f)).equals(readFileSync(join(ROOT,'levels/v2',f))));
const after=files.map(f=>sha256(readFileSync(join(ROOT,'levels',f))));

// 常用边界：--report 指向尚不存在的子目录。
const nested=mkdtempSync(join(tmpdir(),'reverse-abyss-report-path-'));
const src=join(nested,'input');mkdirSync(src);
const original=readFileSync(join(ROOT,'levels/floor01.json'));
writeFileSync(join(src,'floor01.json'),original);
const p=planMigration({inDir:src,outDir:join(nested,'output'),report:join(nested,'reports','report.md')});
let commitOk=false,error=null;
try { const r=commitPlan(p);commitOk=r.ok; } catch(e) {error={code:e.code,message:e.message};}
console.log(JSON.stringify({
  isolatedMigration:{planOk:plan.ok,commitOk:result?.ok??false,count:migrated.length,
    outputsByteEqual:equal,sourcesUnchanged:JSON.stringify(before)===JSON.stringify(after)},
  missingReportParent:{planOk:p.ok,commitOk,error,
    sourceUnchanged:readFileSync(join(src,'floor01.json')).equals(original),
    outputCreated:existsSync(join(nested,'output','floor01.json'))}
},null,2));
