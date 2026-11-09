// 旧入口/旧池来源和levels文件盘点。仅Node隔离存储，不读取用户浏览器，不移动文件。
import { loadEditor } from '../../tools/loader.mjs';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const R = loadEditor();
const legacyHtml = readFileSync(join(root, 'legacy.html'), 'utf8');
const oldFile = join(root, 'levels/archive/legacy-pool-2026-11-09/floor01.json');
let legacyFixture = { available: false, poolIds: [] };
if (R.LevelPack?.putCustom && R.LevelPack?.poolOf && existsSync(oldFile)) {
  const key = R.LevelPack.putCustom('old_menu_only_probe', JSON.parse(readFileSync(oldFile, 'utf8')));
  legacyFixture = { available: true, insertedKey: key,
    poolIds: R.LevelPack.poolOf({ pool: [] }).list.map((x) => x.id),
    storageKey: R.LevelPack.LS_KEY, overridesKey: R.LevelPack.OV_KEY };
}
const repo = R.ContentRepository.create({ adapter: new R.ContentRepository.MemoryAdapter(), persistent: false });
const formal = await repo.listEligible({});
const inventory = [];
function scan(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { scan(p); continue; }
    if (!e.name.endsWith('.json')) continue;
    const bytes = readFileSync(p);
    let data, error = null;
    try { data = JSON.parse(bytes.toString('utf8')); } catch (err) { error = err.message; }
    inventory.push({ path: relative(root, p).replaceAll('\\', '/'), bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), modifiedAt: statSync(p).mtime.toISOString(),
      id: data?.id ?? null, title: data?.title ?? null, kind: data?.kind ?? null,
      difficulty: data?.difficulty ?? null, certificationStatus: data?.certification?.status ?? null,
      parseError: error });
  }
}
scan(join(root, 'levels')); inventory.sort((a, b) => a.path.localeCompare(b.path));
const report = { date: '2026-11-09',
  limits: 'Isolated Node DOM/MemoryAdapter/localStorage stubs; no actual browser storage inspected. File inventory is read-only. This is not a clear or publish operation.',
  legacyBootsOldMain: legacyHtml.includes('src="js/main.js"'),
  activeCatalogCount: Object.keys(R.LEVEL_DATA || {}).length,
  formalMemoryPublishedCount: formal.ok ? formal.value.length : null,
  legacyFixture,
  oldPoolCanAppearIndependently: legacyFixture.available && legacyFixture.poolIds.length > 0 && formal.value?.length === 0,
  levelsDirectories: readdirSync(join(root, 'levels'), { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name),
  inventory
};
const output = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(
  new URL('./review-B4R12-2026-11-09-entry-sources.json', import.meta.url));
if (!process.argv[2] && existsSync(output)) console.log('Evidence preserved; pass a new output path to save this run.');
else writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ legacyBootsOldMain: report.legacyBootsOldMain,
  activeCatalogCount: report.activeCatalogCount, formalMemoryPublishedCount: report.formalMemoryPublishedCount,
  oldPoolCanAppearIndependently: report.oldPoolCanAppearIndependently,
  oldBrowserKeys: [legacyFixture.storageKey, legacyFixture.overridesKey],
  jsonFiles: inventory.length, directories: report.levelsDirectories }, null, 2));
process.exit(0); // 盘点完成，不表示旧入口已清理。
