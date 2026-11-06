// 独立复验 B2-R1。保留历史输出原字节，新结果写独立文件；不写用户存储/认证。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/loader.mjs';
const dir = join(ROOT, 'docs/checks');
const summary = {};
function run(name, script) {
  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true
  });
  const log = (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '');
  writeFileSync(join(dir, `review-B2R1-2026-11-06-${name}.txt`), log);
  const entry = { exitCode: r.status, error: r.error ? String(r.error) : null };
  summary[name] = entry;
  console.log(name + ': ' + JSON.stringify(entry));
  return r;
}
const all = run('test_all', 'tools/test_all.mjs');
const probeName = 'review-B2-2026-11-06-probes.json';
const probeBefore = readFileSync(join(dir, probeName));
try {
  run('probes', 'docs/checks/review-B2-2026-11-06-probes.mjs');
  writeFileSync(join(dir, 'review-B2R1-2026-11-06-probes.json'), readFileSync(join(dir, probeName)));
} finally { writeFileSync(join(dir, probeName), probeBefore); }

// 传入 --browser 时仅尝试一轮；原浏览器输出在 finally 中恢复。
if (process.argv.includes('--browser')) {
  const names = ['browser-b2r1-2026-11-06.json', 'b2r1-browser-short-start.png',
    'b2r1-browser-short-floor2.png', 'b2r1-browser-short-retry.png',
    'b2r1-browser-editor-tools.png', 'b2r1-browser-standard-start.png'];
  const backups = new Map(names.map(n => [n, readFileSync(join(dir, n))]));
  try {
    const browser = run('browser', 'tools/browser_b2.mjs');
    if (browser.status === 0) for (const name of names) if (existsSync(join(dir, name)))
      writeFileSync(join(dir, 'review-B2R1-2026-11-06-' + name), readFileSync(join(dir, name)));
  } finally { for (const [name, bytes] of backups) writeFileSync(join(dir, name), bytes); }
}
writeFileSync(join(dir, 'review-B2R1-2026-11-06-results.json'), JSON.stringify(summary, null, 2) + '\n');
const counts = (all.stdout || '').match(/合计\s+PASS\s+(\d+)\s+FAIL\s+(\d+)/);
console.log('TOTAL=' + (counts ? counts[1] + '/' + counts[2] : 'not reported'));
process.exitCode = Object.values(summary).some(r => r.error || (r.exitCode !== 0 && r !== summary.test_all)) ? 1 : all.status ?? 1;
