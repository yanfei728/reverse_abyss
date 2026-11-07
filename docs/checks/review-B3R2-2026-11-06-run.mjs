// 独立复验，只新增证据；浏览器原截图与 JSON 按字节恢复。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/loader.mjs';
const dir = join(ROOT, 'docs/checks'), prefix = 'review-B3R2-2026-11-06-', results = {};
function run(name, script) {
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true });
  writeFileSync(join(dir, prefix + name + '.txt'), (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : ''));
  results[name] = { exitCode: r.status, error: r.error ? String(r.error) : null };
  console.log(name + ': ' + JSON.stringify(results[name]));
  return r.status === 0 && !r.error;
}
run('test_all', 'tools/test_all.mjs');
const names = readdirSync(dir).filter(n => /^b3r2-.*\.png$/.test(n) || n === 'browser-b3r2-2026-11-06.json');
const backup = names.map(n => [n, readFileSync(join(dir, n))]);
try {
  if (run('browser', 'tools/browser_b3r2.mjs')) {
    for (const n of names) writeFileSync(join(dir, prefix + n), readFileSync(join(dir, n)));
  }
} finally {
  for (const [n, bytes] of backup) writeFileSync(join(dir, n), bytes);
}
writeFileSync(join(dir, prefix + 'results.json'), JSON.stringify(results, null, 2) + '\n');
process.exit(Object.values(results).some(r => r.exitCode !== 0 || r.error) ? 1 : 0);
