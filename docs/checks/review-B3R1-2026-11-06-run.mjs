// 独立复验；仅新增证据，原探针/浏览器输出按字节备份并恢复。
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/loader.mjs';
const dir = join(ROOT, 'docs/checks'), prefix = 'review-B3R1-2026-11-06-', results = {};
function run(name, script) {
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true });
  writeFileSync(join(dir, prefix + name + '.txt'), (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : ''));
  results[name] = { exitCode: r.status, error: r.error ? String(r.error) : null };
  console.log(name + ': ' + JSON.stringify(results[name]));
  return r.status === 0 && !r.error;
}
function preserve(names, action) {
  const backup = names.map(n => [n, existsSync(join(dir, n)) ? readFileSync(join(dir, n)) : null]);
  try {
    const completed = action();
    if (completed) for (const n of names) if (existsSync(join(dir, n))) writeFileSync(join(dir, prefix + n), readFileSync(join(dir, n)));
  } finally {
    for (const [n, bytes] of backup) {
      if (bytes) writeFileSync(join(dir, n), bytes);
      else if (existsSync(join(dir, n))) unlinkSync(join(dir, n));
    }
  }
}
run('test_all', 'tools/test_all.mjs');
preserve(['review-B3-2026-11-06-probes.json'], () => run('probes', 'docs/checks/review-B3-2026-11-06-probes.mjs'));
preserve(['browser-b3r1-2026-11-06.json', 'b3r1-browser-touch-menu.png', 'b3r1-browser-touch-layout.png',
  'b3r1-browser-offline-package.png'], () => run('browser', 'tools/browser_b3.mjs'));
writeFileSync(join(dir, prefix + 'results.json'), JSON.stringify(results, null, 2) + '\n');
process.exitCode = Object.values(results).some(r => r.exitCode !== 0 || r.error) ? 1 : 0;
