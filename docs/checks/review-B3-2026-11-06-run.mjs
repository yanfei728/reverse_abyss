// 保存真实退出码和独立输出；恢复浏览器原交付证据，不操作用户存储。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/loader.mjs';
const dir = join(ROOT, 'docs/checks'), results = {};
function run(name, script) {
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true });
  writeFileSync(join(dir, `review-B3-2026-11-06-${name}.txt`), (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : ''));
  results[name] = { exitCode: r.status, error: r.error ? String(r.error) : null };
  console.log(name + ': ' + JSON.stringify(results[name]));
}
run('test_all', 'tools/test_all.mjs');
run('probes', 'docs/checks/review-B3-2026-11-06-probes.mjs');
const names = ['browser-b3-2026-11-06.json', 'b3-browser-touch-menu.png',
  'b3-browser-touch-layout.png', 'b3-browser-offline-package.png'];
const backup = new Map(names.map(n => [n, readFileSync(join(dir, n))]));
try {
  run('browser', 'tools/browser_b3.mjs');
  if (results.browser.exitCode === 0) for (const name of names) if (existsSync(join(dir, name)))
    writeFileSync(join(dir, 'review-B3-2026-11-06-' + name), readFileSync(join(dir, name)));
} finally { for (const [name, bytes] of backup) writeFileSync(join(dir, name), bytes); }
writeFileSync(join(dir, 'review-B3-2026-11-06-results.json'), JSON.stringify(results, null, 2) + '\n');
process.exitCode = Object.values(results).some(r => r.exitCode !== 0 || r.error) ? 1 : 0;
