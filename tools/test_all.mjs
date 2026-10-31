#!/usr/bin/env node
/* -*- coding: utf-8 -*- */
/*
 * test_all.mjs —— 一条命令跑完全部自检
 * =====================================
 *     node tools/test_all.mjs            引擎 + 编辑器 + 贴图 + 关卡数据 + 验收修复(含逐跳物理模拟)
 *     node tools/test_all.mjs --fast     跳过模拟(快,适合改完随手跑)
 *
 * 它就是把 tools/test_engine.mjs / test_editor.mjs / test_assets.mjs /
 * test_leveldata.mjs / test_t01r.mjs 依次跑一遍,最后合成一个总账。全 PASS 退出码 0。
 */
const t0 = Date.now();
const fast = process.argv.includes('--fast');

// 让子自检别自己 process.exit(它们都是"被 import 的",不是入口)
const engine = (await import('./test_engine.mjs')).result;
const editor = (await import('./test_editor.mjs')).result;
const assets = (await import('./test_assets.mjs')).result;
const leveldata = (await import('./test_leveldata.mjs')).result;
const t01r = (await import('./test_t01r.mjs')).result;

const pass = engine.pass + editor.pass + assets.pass + leveldata.pass + t01r.pass;
const fail = engine.fail + editor.fail + assets.fail + leveldata.fail + t01r.fail;
const fails = engine.fails.concat(editor.fails, assets.fails, leveldata.fails, t01r.fails);

console.log('\n' + '='.repeat(70));
console.log(`引擎自检    PASS ${engine.pass}  FAIL ${engine.fail}`);
console.log(`编辑器自检  PASS ${editor.pass}  FAIL ${editor.fail}`);
console.log(`贴图自检    PASS ${assets.pass}  FAIL ${assets.fail}`);
console.log(`数据自检    PASS ${leveldata.pass}  FAIL ${leveldata.fail}`);
console.log(`修复自检    PASS ${t01r.pass}  FAIL ${t01r.fail}`);
console.log('-'.repeat(70));
console.log(`合计        PASS ${pass}  FAIL ${fail}   用时 ${((Date.now() - t0) / 1000).toFixed(1)}s` +
  (fast ? '  (--fast:跳过了逐跳物理模拟)' : ''));
if (fail) {
  console.log('失败的项:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✔');
process.exit(0);
