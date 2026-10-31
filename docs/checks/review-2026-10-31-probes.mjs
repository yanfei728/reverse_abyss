// 验收复现脚本；不修改游戏代码、原图或已有迁移输出。
// node docs/checks/review-2026-10-31-probes.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEngine, ROOT } from '../../tools/loader.mjs';

const RA = loadEngine();
const LD = RA.LevelData;
const clone = x => JSON.parse(JSON.stringify(x));
const source = JSON.parse(readFileSync(join(ROOT,'levels/v2/floor01.json'),'utf8'));
function fixture() {
  const d=clone(source);
  d.contentHash=null;
  d.certification=null;
  d.objects=[];d.paths=[];
  d.ports={profile:'vertical-v1',entry:{col:2},exit:{col:2}};
  d.spawn={col:3,row:d.size.rows-1};
  return d;
}
const results=[];
{
  const d=fixture();
  d.objects=[{id:'future_1',type:'future_enemy',col:3,row:4,
    params:{speed:2},pathId:null,behavior:{keep:'author-data'}}];
  const direct=LD.decode(JSON.stringify(d));
  const encoded=LD.encode(d);
  const reopened=encoded.ok?LD.decode(encoded.value):encoded;
  results.push({probe:'R1 unknown object field roundtrip',
    inputBehavior:d.objects[0].behavior,
    decodeOk:direct.ok,
    decodedBehavior:direct.ok?(direct.value.objects[0].behavior??null):null,
    decodeWarnings:direct.warnings??[],
    encodeOk:encoded.ok,reopenOk:reopened.ok,reopenCode:reopened.error?.code??null});
}
{
  const d=fixture();
  d.schemaVersion=3;
  d.futureSystem={keep:'v3-data'};
  const r=LD.encode(d);
  results.push({probe:'R1 future schema encode',inputSchema:3,encodeOk:r.ok,
    outputSchema:r.ok?JSON.parse(r.value).schemaVersion:null,
    futureSystemPreserved:r.ok?Object.hasOwn(JSON.parse(r.value),'futureSystem'):null,
    warnings:r.warnings??[]});
}
{
  const d=fixture();
  d.contentHash=LD.hashSync(d);
  d.certification={contentHash:d.contentHash,profileId:'standard-v1',status:'passed',
    source:'local-playtest',completedAt:'2026-10-31T00:00:00Z'};
  const issues=LD.validate(d,{purpose:'publish',rules:{}});
  results.push({probe:'R3 empty current and certificate rules',
    errorCount:LD.errorsOf(issues).length,issues});
}
{
  const migrated=RA.LegacyImport.migrate({id:'unknown_grid',
    asc:['?'.repeat(80),'+P++++G'],objects:[]},{id:'unknown_grid'});
  results.push({probe:'R4 legacy unknown characters',inputUnknownCount:80,
    migrateOk:migrated.ok,
    retainedUnknownCount:migrated.ok?migrated.value.draft.extensions.legacy.unknownChars.length:null});
}
{
  const old={id:'unknown_object',asc:['+P++++G'],objects:[{
    type:'unknown_enemy',id:'enemy_1',col:2,row:0,params:{keep:true},
    pathId:'old_route',behavior:{keep:'author-data'}}]};
  const r=RA.LegacyImport.migrate(old,{id:old.id});
  results.push({probe:'R4 legacy object extra fields',migrateOk:r.ok,
    inputObject:old.objects[0],outputObject:r.ok?r.value.draft.objects[0]:null,
    originalObjectInExtensions:r.ok?JSON.stringify(r.value.draft.extensions).includes('author-data'):null});
}
{
  const d=fixture();
  d.objects=[{id:'unknown_big',type:'future_enemy',col:3,row:4,
    params:{blob:'x'.repeat(LD.LIMITS.BYTES)},pathId:null}];
  const r=LD.encode(d);
  const reopened=r.ok?LD.decode(r.value):r;
  results.push({probe:'R5 export larger than own import limit',encodeOk:r.ok,
    encodedBytes:r.ok?Buffer.byteLength(r.value):null,limit:LD.LIMITS.BYTES,
    reopenOk:reopened.ok,reopenCode:reopened.error?.code??null});
}
{
  // 只在系统临时目录中验证 --in/--out 相同的行为，正式 levels/ 完全不动。
  const dir=mkdtempSync(join(tmpdir(),'reverse-abyss-review-'));
  const file=join(dir,'sample.json');
  const old={id:'sample',difficulty:1,verified:false,size:{cols:6,rows:4},
    sky:0,objects:[],asc:['+G++++','^---^^','+P++++','^^^^^^']};
  const before=JSON.stringify(old);
  writeFileSync(file,before,'utf8');
  const rel=relative(ROOT,dir);
  const child=spawnSync(process.execPath,['tools/migrate_levels.mjs','--in',rel,'--out',rel,
    '--report',relative(ROOT,join(dir,'_report.md'))],{cwd:ROOT,encoding:'utf8'});
  const after=readFileSync(file,'utf8');
  results.push({probe:'R2 migration writes over input before detecting change',
    exitCode:child.status,sourceChanged:before!==after,
    sourceNowSchema:JSON.parse(after).schemaVersion??null,
    detectedAfterWrite:(child.stdout+child.stderr).includes('原文件在迁移过程中被改动')});
}
console.log(JSON.stringify({reviewDate:'2026-10-31',results},null,2));
