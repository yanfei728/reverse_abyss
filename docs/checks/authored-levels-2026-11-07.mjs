// 作者三图只读检查。原件保存在 levels/authored/source-2026-11-07，未写运行标记/认证。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEditor, ROOT } from '../../tools/loader.mjs';
const RA = loadEditor(), LD = RA.LevelData;
const records = [];
for (const name of ['test1.json', 'test2.json', 'test3.json']) {
  const relative = 'levels/authored/source-2026-11-07/' + name;
  const bytes = readFileSync(join(ROOT, relative)), data = JSON.parse(bytes.toString('utf8'));
  const runs = [], occupied = [];
  data.terrain.tiles.forEach((row, r) => {
    row.forEach((id, c) => { if (id !== 0) occupied.push({ col: c, row: r }); });
    for (let c = 0; c < row.length;) {
      if (row[c] !== 5) { c++; continue; }
      let end = c; while (row[end] === 5) end++;
      runs.push({ col: c, row: r, width: end - c }); c = end;
    }
  });
  const candidates = runs.filter(r => r.width === 2).sort((a,b) => a.row-b.row);
  const localTwoRowClearanceBlocks = [];
  for (const [role, point, direction] of [['finish',candidates[0],1],['start',candidates.at(-1),-1]]) {
    if (!point) continue;
    for (let n=1;n<=2;n++) for (let dc=0;dc<2;dc++) {
      const row=point.row+direction*n, col=point.col+dc, tile=data.terrain.tiles[row]?.[col];
      if (tile !== 0) localTwoRowClearanceBlocks.push({role,col,row,tile});
    }
  }
  const currentPlay = LD.errorsOf(LD.validate(data, {purpose:'play'}));
  const endpointSideSupports = candidates.map(p=>({col:p.col,row:p.row,
    left:data.terrain.tiles[p.row]?.[p.col-1],right:data.terrain.tiles[p.row]?.[p.col+2]}));
  records.push({ file:relative, bytes:bytes.length,
    fileSha256:createHash('sha256').update(bytes).digest('hex'),
    id:data.id, title:data.title, size:data.size, spawn:data.spawn, ports:data.ports,
    objects:data.objects.length, paths:data.paths.length, certification:data.certification,
    contentHashMatches:LD.hashSync(data) === data.contentHash,
    occupiedRows:{top:Math.min(...occupied.map(p=>p.row)),bottom:Math.max(...occupied.map(p=>p.row))},
    cloudRuns:runs, proposedStart:candidates.at(-1), proposedFinish:candidates[0],
    localTwoRowClearanceBlocks,
    endpointSideSupports,
    currentDraftErrors:LD.errorsOf(LD.validate(data,{purpose:'draft'})),
    currentPlayErrors:currentPlay,
    note:'candidate 仅为检查报告，不等于已标记接口或通过试玩/认证'
  });
}
const result={date:'2026-11-07',sourceDirectory:'C:/Users/beilu/Documents/blcreate/开发实例关卡',
  duplicateIds:records.map(r=>r.id).filter((id,i,a)=>a.indexOf(id)!==i),records};
writeFileSync(join(ROOT,'docs/checks/authored-levels-2026-11-07.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(records.some(r=>!r.contentHashMatches || r.currentDraftErrors.length) ? 1 : 0);
