#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_b3.mjs —— B3 语义输入/布局/生命周期/文件边界/JSON 导入/Android 包
 * ===================================================================
 *     node tools/test_b3.mjs
 * 只验证可替换的边界和真实数据流;真机、系统文件选择与 APK 安装仍按人工记录。
 * 测试里带证书的内容是隔离内存夹具,不写入交付内容库,也不生成 local-playtest。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEditor, loadPlatform, ROOT } from './loader.mjs';

const RA = loadEditor();
loadPlatform();
const LD = RA.LevelData;
const clone = (v) => JSON.parse(JSON.stringify(v));

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }
function ld(n) { return JSON.parse(readFileSync(join(ROOT, 'levels/b2', n + '.json'), 'utf8')); }
function certFor(data) {
  return {
    contentHash: LD.hashSync(data),
    rulesVersion: RA.RULES.rulesVersion,
    rulesFingerprint: RA.RULES.rulesFingerprint,
    profileId: 'standard-v1', status: 'passed',
    completedAt: '2026-11-06T00:00:00Z', source: 'local-playtest'
  };
}

head('ActionInput:多来源、左右抵消、一次性按下边沿');
{
  const a = new RA.ActionInput();
  a.setHeld('key:A', 'left', true);
  a.setHeld('pointer:1', 'jump', true);
  let s = a.snapshot();
  check('多来源同时按住', s.held.left === true && s.held.jumpHeld === true);
  a.setHeld('pointer:2', 'right', true);
  s = a.snapshot();
  check('左右同时按住互相抵消', s.held.left === false && s.held.right === false);
  a.releaseSource('pointer:2');
  s = a.snapshot();
  check('释放右来源后左来源仍有效', s.held.left === true && s.held.right === false);
  a.releaseSource('key:A');
  s = a.snapshot();
  check('释放左来源不会误放跳跃来源', s.held.left === false && s.held.jumpHeld === true);
  a.press('skill'); a.press('skill');
  let c = a.consume();
  check('同帧多次 press 只消费一次', c.pressed.skill === true && a.consume().pressed.skill === false);
  a.press('pause'); a.consume();
  check('consume 清 pressed 但保留 held', a.snapshot().held.jumpHeld === true && a.snapshot().pressed.pause === false);
  a.clearAll();
  check('clearAll 清全部来源与边沿', a.snapshot().sources === 0 && a.snapshot().held.jumpHeld === false);
}

head('ControlLayout:默认/夹回/保存失败保留旧值');
{
  const d = RA.ControlLayout.defaults();
  check('默认四个动作', RA.ControlLayout.ACTIONS.every((k) => !!d.buttons[k]));
  const weird = RA.ControlLayout.normalize({ buttons: { left: { x: -5, y: 9, size: 99 } } });
  check('越界值夹回合法范围', weird.buttons.left.x >= 0.03 && weird.buttons.left.x <= 0.97 &&
    weird.buttons.left.y >= 0.03 && weird.buttons.left.y <= 0.97 &&
    weird.buttons.left.size >= RA.ControlLayout.MIN_SIZE && weird.buttons.left.size <= RA.ControlLayout.MAX_SIZE);
  const boxes = RA.ControlLayout.resolve(d, { width: 800, height: 400 });
  check('resolve 输出可见像素框', Object.values(boxes).every((b) => b.left >= 0 && b.top >= 0 &&
    b.left + b.w <= 800.001 && b.top + b.h <= 400.001));
  const store = { value: null, fail: false, getItem() { return this.value; }, setItem(k, v) { if (this.fail) throw new Error('no space'); this.value = v; } };
  const saved = RA.ControlLayout.save(store, d);
  check('可保存布局', saved.ok && typeof store.value === 'string');
  const loaded = RA.ControlLayout.load(store);
  check('可恢复布局', loaded.ok && loaded.value.buttons.jump.size === d.buttons.jump.size);
  const before = store.value;
  store.fail = true;
  const failed = RA.ControlLayout.save(store, d);
  check('存储失败报错且不声称保存', !failed.ok && failed.error.code === 'LAYOUT_SAVE_FAILED');
  check('存储失败保留旧持久化值', store.value === before);
}

head('PlatformLifecycle:后台清输入、前台不自动继续、dispose 不重复');
{
  const a = new RA.ActionInput();
  a.setHeld('key:A', 'left', true);
  a.press('skill');
  const calls = [];
  const lc = RA.PlatformLifecycle.create({
    input: a,
    onBackground() { calls.push('background'); check('后台回调前已清输入', a.snapshot().sources === 0 && a.snapshot().pressed.skill === false); },
    onForeground() { calls.push('foreground'); },
    onBack() { calls.push('back'); return true; }
  });
  lc.triggerBackground();
  lc.triggerForeground();
  lc.triggerBack();
  check('生命周期回调顺序', calls.join(',') === 'background,foreground,back');
  lc.dispose(); lc.dispose(); lc.triggerBackground();
  check('dispose 后不再触发', calls.length === 3);
}

head('PlatformFiles:Web 只发起下载,Android 写 Documents 后才报 written');
{
  let clicked = 0;
  const anchor = {
    style: {}, click() { clicked++; }, remove() {}, setAttribute() {}
  };
  const fakeDoc = {
    body: { appendChild() {} },
    createElement() { return anchor; }
  };
  const r = await RA.PlatformFiles.exportJSON({ name: 'a/b.json', text: '{"x":1}' }, { document: fakeDoc });
  check('Web 导出返回 download-started', r.ok && r.value.status === 'download-started' && clicked === 1);
  check('导出文件名去路径/补扩展', r.value.name === 'a_b.json');

  let shared = 0;
  const bridge = {
    Capacitor: { isNativePlatform: () => true },
    Directory: { Documents: 'DOCUMENTS' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: { async writeFile(o) { check('原生写目标是 Documents', o.directory === 'DOCUMENTS' && o.encoding === 'utf8'); return { uri: 'content://doc/a.json' }; } },
    Share: { async share() { shared++; return {}; } }
  };
  const n = await RA.PlatformFiles.exportJSON({ name: 'a.json', text: '{}' }, { bridge });
  check('原生写入并打开分享', n.ok && n.value.status === 'share-opened' && n.value.shareOpened === true && shared === 1);
  const badBridge = Object.assign({}, bridge, {
    Filesystem: { async writeFile() { throw new Error('permission'); } }
  });
  const bad = await RA.PlatformFiles.exportJSON({ name: 'a.json', text: '{}' }, { bridge: badBridge });
  check('原生写入失败不报成功', !bad.ok && bad.error.code === 'EXPORT_FAILED');
}

head('Repository import:合法草稿/幂等/认证门槛/显式入池');
{
  const repo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  const plain = clone(ld('normal-1'));
  plain.certification = null;
  plain.contentHash = null;
  const text = LD.encode(plain).value;
  const first = await repo.importLevel(text);
  check('未认证合法关卡保存为不可选草稿', first.ok && first.value.eligible === false &&
    first.value.source === 'uncertified');
  check('导入不会自动发布', (await repo.listEligible({ difficulty: 1 })).value.length === 0);
  const again = await repo.importLevel(text);
  check('同 id+hash 导入幂等', again.ok && again.value.draftId === first.value.draftId &&
    again.value.revision === first.value.revision);
  const bad = await repo.importLevel('{not json');
  check('坏 JSON 明确失败', !bad.ok && bad.error.code === 'INVALID_JSON');
  check('坏 JSON 不改内容库', (await repo.listDrafts()).value.length === 1);

  const certified = clone(plain);
  certified.certification = certFor(certified);
  certified.contentHash = null;
  const imp = await repo.importLevel(JSON.stringify(certified));
  check('当前规则认证导入 eligible=true/来源 imported-declaration',
    imp.ok && imp.value.eligible === true && imp.value.source === 'imported-declaration');
  const pub = await repo.publishImported({ draftId: imp.value.draftId, expectedRevision: imp.value.revision });
  check('用户显式加入正式池', pub.ok && pub.value.source === 'imported-declaration');
  const pool = await repo.listEligible({ difficulty: 1 });
  check('正式池有导入来源且未生成 local-playtest', pool.ok && pool.value.length === 1 &&
    pool.value[0].source === 'imported-declaration');

  const staleRepo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  const stale = clone(plain);
  stale.certification = Object.assign(certFor(stale), { rulesVersion: 'b2-1' });
  stale.contentHash = null;
  const st = await staleRepo.importLevel(JSON.stringify(stale));
  check('旧规则声明不会 eligible', st.ok && st.value.eligible === false);
  const stalePub = st.ok ? await staleRepo.publishImported({ draftId: st.value.draftId, expectedRevision: st.value.revision }) : null;
  check('旧规则导入不能被加入正式池', !stalePub || !stalePub.ok);

  const repo2 = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  const failAdapter = repo2.adapter;
  failAdapter.failNextPut('模拟存储满');
  const failed = await repo2.importLevel(text);
  check('导入存储失败不改池', !failed.ok && (await repo2.listDrafts()).value.length === 0);
}

head('R2/R3:旧认证重导入、未知草稿保真与持久化');
{
  const repo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  const plain = clone(ld('normal-1'));
  plain.certification = null; plain.contentHash = null;
  const curCert = certFor(plain);
  const oldCert = Object.assign({}, curCert, { rulesVersion: 'old-review-fixture' });
  const oldData = clone(plain); oldData.certification = oldCert; oldData.contentHash = null;
  const oldImp = await repo.importLevel(JSON.stringify(oldData));
  check('旧规则认证先保存为不可选草稿', oldImp.ok && oldImp.value.eligible === false &&
    oldImp.value.revision === 1);
  const curData = clone(plain); curData.certification = curCert; curData.contentHash = null;
  const curImp = await repo.importLevel(JSON.stringify(curData));
  check('同内容当前认证重导入更新旧草稿', curImp.ok && curImp.value.eligible === true &&
    curImp.value.revision === 2);
  const reopened = await repo.loadDraft(curImp.value.draftId);
  check('库内认证已变为当前规则', reopened.ok && reopened.value.data.certification.rulesVersion === RA.RULES.rulesVersion);
  const again = await repo.importLevel(JSON.stringify(curData));
  check('同有效声明重复导入幂等', again.ok && again.value.revision === 2 && again.value.eligible === true);
  const oldAgain = await repo.importLevel(JSON.stringify(oldData));
  check('旧声明不能覆盖已有当前认证', oldAgain.ok && oldAgain.value.eligible === true &&
    oldAgain.value.revision === 2 &&
    (await repo.loadDraft(curImp.value.draftId)).value.data.certification.rulesVersion === RA.RULES.rulesVersion);
  const pub = await repo.publishImported({ draftId: curImp.value.draftId, expectedRevision: 2 });
  check('重认证草稿可由用户明确加入正式池', pub.ok && pub.value.source === 'imported-declaration');

  const failRepo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  await failRepo.importLevel(JSON.stringify(oldData));
  failRepo.adapter.failNextPut('模拟写入失败');
  const failUp = await failRepo.importLevel(JSON.stringify(curData));
  check('重认证写失败返回失败且旧草稿仍在', !failUp.ok &&
    (await failRepo.loadDraft('b2_normal_1')).value.data.certification.rulesVersion === 'old-review-fixture');
  const readRepo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  await readRepo.importLevel(JSON.stringify(oldData));
  const origGet = readRepo.adapter.get.bind(readRepo.adapter);
  readRepo.adapter.get = async function () { return { ok: false, error: { code: 'STORAGE_FAILED', message: '模拟读取失败' } }; };
  const failRead = await readRepo.importLevel(JSON.stringify(curData));
  check('重认证读取失败返回失败', !failRead.ok && failRead.error.code === 'STORAGE_FAILED');
  readRepo.adapter.get = origGet;

  const conflictRepo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  await conflictRepo.importLevel(JSON.stringify(oldData));
  conflictRepo.adapter.put = async function () { return { ok: false, error: { code: 'CONFLICT', message: '模拟 revision 冲突' } }; };
  const conflict = await conflictRepo.importLevel(JSON.stringify(curData));
  check('重认证 revision 冲突返回失败且旧草稿不变', !conflict.ok && conflict.error.code === 'CONFLICT' &&
    (await conflictRepo.loadDraft('b2_normal_1')).value.data.certification.rulesVersion === 'old-review-fixture');

  const demo = JSON.parse(readFileSync(join(ROOT, 'levels/demo/t02a-demo.json'), 'utf8'));
  const unknownRepo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  const unknown = await unknownRepo.importLevel(JSON.stringify(demo));
  check('未知对象/断引用/ports=null 可保存草稿', unknown.ok && unknown.value.runnable === false &&
    unknown.value.eligible === false);
  const stored = await unknownRepo.loadDraft(unknown.value.draftId);
  check('未知内容读回保真', stored.ok && stored.value.data.objects.some((o) => o.type === 'future_enemy') &&
    stored.value.data.objects.some((o) => o.type === 'future_enemy' && o.behavior && o.behavior.keep === 'author-data' && o.priority === 3) &&
    stored.value.data.extensions && stored.value.data.extensions.authorNote === '未认证演示草稿');
  check('未知草稿不进入正式池', (await unknownRepo.listEligible({ difficulty: 3 })).value.length === 0);
  check('未知草稿不能加入正式池', !(await unknownRepo.publishImported({
    draftId: unknown.value.draftId, expectedRevision: unknown.value.revision
  })).ok);

  const badRepo = RA.ContentRepository.create({ adapter: new RA.ContentRepository.MemoryAdapter(), storage: 'memory' });
  const badShape = clone(plain); badShape.ports = {};
  const bad = await badRepo.importLevel(JSON.stringify(badShape));
  check('结构错误草稿仍拒绝且不写', !bad.ok && (await badRepo.listDrafts()).value.length === 0);
}

head('Android 包:版本锁定、离线 www、最小内容、横屏 APK');
{
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const want = {
    '@capacitor/core': '7.6.10', '@capacitor/android': '7.6.10', '@capacitor/cli': '7.6.10',
    '@capacitor/app': '7.1.2', '@capacitor/filesystem': '7.1.9', '@capacitor/share': '7.0.4'
  };
  check('Capacitor 版本精确锁定', Object.keys(want).every((k) =>
    (pkg.dependencies[k] || pkg.devDependencies[k]) === want[k]));
  check('锁文件存在', existsSync(join(ROOT, 'package-lock.json')));
  const cfg = JSON.parse(readFileSync(join(ROOT, 'capacitor.config.json'), 'utf8'));
  check('Capacitor webDir=www', cfg.webDir === 'www');
  const vars = readFileSync(join(ROOT, 'android/variables.gradle'), 'utf8');
  check('Android compile/target SDK 35', vars.indexOf('compileSdkVersion = 35') >= 0 &&
    vars.indexOf('targetSdkVersion = 35') >= 0);
  const wrapper = readFileSync(join(ROOT, 'android/gradle/wrapper/gradle-wrapper.properties'), 'utf8');
  check('Gradle wrapper 8.11.1', wrapper.indexOf('gradle-8.11.1-all.zip') >= 0);
  const manifest = readFileSync(join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  check('Android 横屏声明', manifest.indexOf('sensorLandscape') >= 0);
  const www = join(ROOT, 'www');
  check('www 离线入口存在', existsSync(join(www, 'index.html')));
  const page = readFileSync(join(www, 'index.html'), 'utf8');
  check('www 不打包编辑器/旧原型链接', page.indexOf('editor.html') < 0 && page.indexOf('legacy.html') < 0);
  check('www 不引用远端 URL', !/https?:\/\//.test(page));
  check('bridge 产物存在', existsSync(join(www, 'js/vendor/capacitor-plugins.js')));
  const appGradle = readFileSync(join(ROOT, 'android/app/build.gradle'), 'utf8');
  check('Android debug 版本 0.3.1/versionCode 4', appGradle.indexOf('versionCode 4') >= 0 &&
    appGradle.indexOf('versionName "0.3.1"') >= 0);
  check('Android debug 构建配置存在', existsSync(join(ROOT, 'android/app/build.gradle')));
  check('APK 输出目录约定', readFileSync(join(ROOT, 'android/app/build.gradle'), 'utf8').indexOf('com.android.application') >= 0);
}

export const result = { pass, fail, fails, name: 'B3 自检' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`B3 自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    console.log('失败的项:');
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✓');
  process.exit(0);
}
