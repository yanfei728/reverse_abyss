// 独立复跑；保留交付方证据，只在成功后另存本轮证据。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/loader.mjs';
const names = ['b1-browser-editor-saved.png', 'b1-browser-editor-restored.png',
  'b1-browser-devplay-start.png', 'b1-browser-devplay-floor2.png',
  'b1-browser-devplay-paused.png', 'browser-b1-2026-11-04.json'];
const out = join(ROOT, 'docs/checks');
const backup = new Map(names.map(n => [n, readFileSync(join(out, n))]));
let status = 1;
try {
  const r = spawnSync(process.execPath, ['tools/browser_b1.mjs'], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true
  });
  const log = (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '');
  writeFileSync(join(out, 'review-B1R1-2026-11-06-browser.txt'), log);
  process.stdout.write(log);
  status = r.status ?? 1;
  if (status === 0) for (const n of names) if (existsSync(join(out, n))) {
    writeFileSync(join(out, 'review-B1R1-2026-11-06-' + n), readFileSync(join(out, n)));
  }
} finally {
  for (const [n, bytes] of backup) writeFileSync(join(out, n), bytes);
}
console.log('BROWSER_ACTUAL_EXIT_CODE=' + status);
process.exitCode = status;
