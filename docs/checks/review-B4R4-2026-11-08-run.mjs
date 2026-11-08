import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const results = [];
for (const [name, script] of [ ['full', 'tools/test_all.mjs'],
  ['gestures', 'tools/test_editor_gestures.mjs'],
  ['probes', 'docs/checks/review-B4R4-2026-11-08-probes.mjs'] ]) {
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true });
  writeFileSync(new URL(`review-B4R4-2026-11-08-${name}.txt`, import.meta.url), (r.stdout || '') + (r.stderr || ''));
  const item = { name, command: `node ${script}`, exitCode: r.status, signal: r.signal,
    error: r.error?.message || null };
  results.push(item); console.log(JSON.stringify(item));
}
writeFileSync(new URL('review-B4R4-2026-11-08-results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
process.exit(results.some(r => r.exitCode !== 0) ? 1 : 0);
