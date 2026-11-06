// 独立浏览器复跑；交付方原证据始终恢复原字节，成功时另存本轮证据。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/loader.mjs';
const out = join(ROOT, 'docs/checks');
const names = ['b2-browser-short-start.png', 'b2-browser-short-floor2.png',
  'b2-browser-short-retry.png', 'b2-browser-editor-tools.png',
  'b2-browser-standard-start.png', 'browser-b2-2026-11-06.json'];
const backup = new Map(names.map(n => [n, readFileSync(join(out, n))]));
let status = 1;
try {
  const r = spawnSync(process.execPath, ['tools/browser_b2.mjs'], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true
  });
  const log = (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '');
  writeFileSync(join(out, 'review-B2-2026-11-06-browser.txt'), log);
  process.stdout.write(log);
  status = r.status ?? 1;
  if (status === 0) for (const n of names) if (existsSync(join(out, n)))
    writeFileSync(join(out, 'review-B2-2026-11-06-' + n), readFileSync(join(out, n)));
} finally {
  for (const [n, bytes] of backup) writeFileSync(join(out, n), bytes);
}
console.log('BROWSER_ACTUAL_EXIT_CODE=' + status);
process.exitCode = status;
