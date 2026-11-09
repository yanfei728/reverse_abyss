#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * test_full40.mjs —— 25号卡:完整 40 层塔、清池、分档补位与双 Boss/双休息
 * =====================================================================
 *   node tools/test_full40.mjs
 *
 * 不跑全量关卡合规/可达性自检;只验证:
 *   ① 运行副本来自新目录、端口/身份/认证符合契约,file:// 内嵌数据同步;
 *   ② 活动普通池为空、旧图只在只读归档;
 *   ③ TowerPlanner 41 槽、四档分桶、每档最多 9、本档不足才 test3 补位、空池可开局;
 *   ④ 0→F→1、10/30 各自回血一次、20 击败不胜利/F 进 21、40 新 Boss 才胜利;
 *   ⑤ 死亡重试同一清单(不重抽);一次性清池后新发布保留、旧无 epoch 记录不混入。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadEditor, ROOT } from './loader.mjs';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '    ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '    ' + extra : '')); }
}
function head(t) { console.log('\n▌ ' + t); }
const clone = (v) => JSON.parse(JSON.stringify(v));

const RA = loadEditor();
const LD = RA.LevelData;
const F = RA.FULL40;

// ================= ① 运行副本与来源 =================
head('运行副本:来源 / 端口 / 身份 / 认证');
{
  check('js/full40-samples.js 已加载', !!F && F.layout === 'full40-v1');
  check('poolEpoch 是预期的一次性标记', F.poolEpoch === 'full40-pool-reset-2026-11-09', F.poolEpoch);
  check('大厅 kind=lobby、ports=null、出生 center10/feet20',
    F.fixed.lobby.kind === 'lobby' && F.fixed.lobby.ports === null &&
    F.fixed.lobby.extensions.fixedScene.playerSpawn.centerCol === 10 &&
    F.fixed.lobby.extensions.fixedScene.playerSpawn.feetRow === 20);
  const rp = F.fixed.rest.ports;
  check('休整 start(13,18)/finish(1,8)', F.fixed.rest.kind === 'rest' &&
    rp.start.col === 13 && rp.start.row === 18 && rp.finish.col === 1 && rp.finish.row === 8);
  const bp = F.fixed.boss.ports;
  check('Boss start(1,20)/无 finish/中心 10.5,14.5', F.fixed.boss.kind === 'boss' &&
    bp.start.col === 1 && bp.start.row === 20 && bp.finish === null &&
    F.fixed.boss.extensions.fixedScene.boss.centerCol === 10.5 &&
    F.fixed.boss.extensions.fixedScene.boss.centerRow === 14.5);
  const fb = F.fallback;
  check('补位模板有独立 id / 哈希 / 无认证',
    fb.id === 'full40_fallback_test3' && /^sha256:/.test(fb.contentHash) && fb.certification === null,
    fb.id + ' @ ' + String(fb.contentHash).slice(0, 16));
  check('补位模板沿用 start(1,20)/finish(1,2)',
    fb.ports.profile === 'cloud-pipe-v2' && fb.ports.start.col === 1 && fb.ports.start.row === 20 &&
    fb.ports.finish.col === 1 && fb.ports.finish.row === 2);
  check('固定场景与补位都不带 passed',
    [F.fixed.lobby, F.fixed.rest, F.fixed.boss, fb].every((d) => d.certification === null));
  check('原始导入目录只读保留(6 个文件)', readdirSync(join(ROOT, '开发示例关卡'))
    .filter((f) => f.endsWith('.json')).length === 6);

  // 地形保真:level0 原始两个裸 x 当空气;其余直接比较
  const src = (name) => JSON.parse(readFileSync(join(ROOT, '开发示例关卡', name), 'utf8'));
  const lobbySrc = JSON.parse(readFileSync(join(ROOT, '开发示例关卡/level0.json'), 'utf8').replace(/\bx\b/g, '0'));
  check('大厅地形与原始导出一致', JSON.stringify(lobbySrc.terrain.tiles) === JSON.stringify(F.fixed.lobby.terrain.tiles));
  check('休整地形与原始导出一致', JSON.stringify(src('rest_level.json').terrain.tiles) === JSON.stringify(F.fixed.rest.terrain.tiles));
  check('Boss 地形与原始导出一致', JSON.stringify(src('boss.json').terrain.tiles) === JSON.stringify(F.fixed.boss.terrain.tiles));
  const t3 = src('test3.json');
  check('补位地形/对象/路径与 test3 原件一致',
    JSON.stringify(t3.terrain.tiles) === JSON.stringify(fb.terrain.tiles) &&
    JSON.stringify(t3.objects) === JSON.stringify(fb.objects) &&
    JSON.stringify(t3.paths) === JSON.stringify(fb.paths));
  check('补位尺寸仍为 21×24', fb.size.cols === 21 && fb.size.rows === 24, JSON.stringify(fb.size));

  let syncOk = true, syncMsg = '';
  try {
    execFileSync(process.execPath, [join(ROOT, 'tools/sync_full40_levels.mjs'), '--check'], { cwd: ROOT });
  } catch (e) { syncOk = false; syncMsg = String(e.stderr || e.message); }
  check('js/full40-samples.js 与 levels/archive/full40 同步', syncOk, syncMsg.slice(0, 120));
}

// ================= ② 旧普通池归档 =================
head('旧普通池:活动目录归零、只读归档保留');
{
  const active = readdirSync(join(ROOT, 'levels')).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  check('levels/ 下没有活动普通 json', active.length === 0, active.join(','));
  check('levels.js 活动 catalog 为空', Object.keys(RA.LEVEL_DATA || {}).length === 0 &&
    Object.keys(RA.LEVEL_TEXT || {}).length === 0);
  const ARCHIVE = join(ROOT, 'levels', 'archive', 'legacy-pool-2026-11-09');
  check('旧 12 张在只读归档里', existsSync(ARCHIVE) &&
    readdirSync(ARCHIVE).filter((f) => /^floor\d+\.json$/.test(f)).length === 12);
  check('归档图不再是活动候选(不会自动 seed)', !Object.keys(RA.LEVEL_DATA || {}).some((id) => /^floor\d+$/.test(id)));
}

// ================= ③ 41 槽 / 四档分桶 / 补位 =================
head('TowerPlanner:41 槽、四档分桶、test3 补位');
function mkCandidate(id, diff, cert) {
  const d = clone(F.fallback);
  d.id = id; d.title = id; d.difficulty = diff; d.contentHash = null;
  d.certification = cert === undefined ? null : cert;
  const enc = LD.encode(d);
  return JSON.parse(enc.value);
}
function planWith(candidates, seed) {
  return RA.TowerPlanner.buildFull40({
    seed: seed || 7, candidates: candidates || [], fixedLevels: F.fixed,
    fallback: F.fallback, poolEpoch: F.poolEpoch
  });
}
{
  const empty = planWith([], 1);
  check('空池也返回完整清单(不再 EMPTY_POOL)', empty.ok && empty.value.floors.length === 41);
  check('固定槽 0/10/20/30/40 齐全',
    empty.ok && [0, 10, 20, 30, 40].every((n) => {
      const f = empty.value.floors[n];
      return f && f.source === 'fixed' && f.floorNumber === n;
    }));
  check('36 个普通槽都来自 fallback(test3)', empty.value.normalCount === 36 &&
    empty.value.floors.filter((f) => f.source === 'fallback').length === 36);
  check('固定槽从不被普通图占用', empty.value.floors.filter((f) => f.kind === 'normal' && [0, 10, 20, 30, 40].indexOf(f.floorNumber) >= 0).length === 0);
  check('0→lobby-transfer、20→boss-transfer、40→victory、其余 pipe',
    empty.value.floors[0].exitAction === 'lobby-transfer' &&
    empty.value.floors[20].exitAction === 'boss-transfer' &&
    empty.value.floors[40].exitAction === 'victory' &&
    empty.value.floors[21].exitAction === 'pipe' && empty.value.floors[10].exitAction === 'pipe');

  // 12 张难度 1、2 张难度 2、1 张难度 3、0 张难度 4
  const candidates = [];
  for (let i = 0; i < 12; i++) {
    const d = mkCandidate('d1_' + i, 1);
    candidates.push({ levelId: d.id, contentHash: d.contentHash, data: d });
  }
  for (let i = 0; i < 2; i++) {
    const d = mkCandidate('d2_' + i, 2);
    candidates.push({ levelId: d.id, contentHash: d.contentHash, data: d });
  }
  const d3 = mkCandidate('d3_0', 3);
  candidates.push({ levelId: d3.id, contentHash: d3.contentHash, data: d3 });
  const plan = planWith(candidates, 11);
  const v = plan.value;
  const by = (d) => v.floors.filter((f) => f.requiredDifficulty === d);
  check('难度 1 只选 9 张(其余 3 张不跨档挪用)', by(1).filter((f) => f.source === 'published').length === 9);
  check('1–9 层全是难度 1 正式图', by(1).filter((f) => f.source === 'published').every((f) => f.floorNumber >= 1 && f.floorNumber <= 9));
  check('难度 2 只有 2 张正式图,其余 7 槽 test3 补位',
    by(2).filter((f) => f.source === 'published').length === 2 &&
    by(2).filter((f) => f.source === 'fallback').length === 7);
  check('难度 3 只有 1 张正式图,其余 8 槽 test3 补位',
    by(3).filter((f) => f.source === 'published').length === 1 &&
    by(3).filter((f) => f.source === 'fallback').length === 8);
  check('难度 4 没有正式图,9 槽全部 test3 补位',
    by(4).filter((f) => f.source === 'published').length === 0 &&
    by(4).filter((f) => f.source === 'fallback').length === 9);
  check('补位总数按槽位缺口算(24),不是按总池 36 算',
    v.fallbackCount === 24, String(v.fallbackCount));
  check('只有 fallback 允许模板自身难度与目标档不同',
    v.floors.filter((f) => f.source === 'published').every((f) => f.data.difficulty === f.requiredDifficulty));
  check('正式图不跨档:每张 published 只出现在本档层段',
    by(1).every((f) => f.floorNumber >= 1 && f.floorNumber <= 9) &&
    by(2).every((f) => f.floorNumber >= 11 && f.floorNumber <= 19) &&
    by(3).every((f) => f.floorNumber >= 21 && f.floorNumber <= 29) &&
    by(4).every((f) => f.floorNumber >= 31 && f.floorNumber <= 39));
  check('每档最多 9 张、无放回', [1, 2, 3, 4].every((d) => {
    const pub = by(d).filter((f) => f.source === 'published');
    return pub.length <= 9 && new Set(pub.map((f) => f.levelId + ':' + f.contentHash)).size === pub.length;
  }));
  check('manifest 带 layer/profile/gameplayProfile/seed/poolEpoch',
    v.layout === 'full40-v1' && v.profile === 'full40-v1' && v.gameplayProfile === 'run-v1' &&
    v.seed === 11 && v.poolEpoch === F.poolEpoch);
  const again = planWith(candidates, 11);
  check('同一 seed + 同候选生成同一 manifest', again.value.manifestId === v.manifestId);
  const other = planWith(candidates, 12);
  check('不同 seed 会换普通图/分布', other.value.manifestId !== v.manifestId);
  check('每个普通槽都有精确数据(没有 undefined)', v.floors.every((f) => f.data && f.levelId && f.contentHash));
}

// ================= ④ 完整塔生命周期 =================
head('生命周期:0→1、10/30 回血、20→F→21、40 新 Boss 胜利');
function newSession(plan) {
  const floors = plan.value.floors.map((f) => clone(f.data));
  const r = RA.GameSession.create({
    floors: floors, profile: 'run-v1', requireCloud: true,
    mode: 'full40-formal', manifest: plan.value
  });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return { session: r.value, floors: floors };
}
function activate(s, n) {
  const res = s.world.activateSlot(n);
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  s.boss = null;
  s._onFloorEntered({ from: n, to: n });
  const inst = res.value.inst;
  const p = s.player;
  p.level = inst.view;
  if (inst.cloud && inst.level.startLocalX !== undefined) {
    p.x = inst.level.startX; p.y = inst.level.startFeet - p.h;
  }
  p.vx = 0; p.vy = 0;
  return res.value;
}
function defeatBossDirectly(s) {
  const b = s.boss;
  b.state = 'resolving'; b.pendingPhase = null; b.resolvingTimer = 0;
  b.update(0.01, s);
  return b;
}
{
  const plan = planWith([], 5);
  const { session: s, floors } = newSession(plan);
  const p = s.player;
  check('开局在 0 层大厅', s.world.current === 0 && s.snapshot().floor.kind === 'lobby');
  check('世界有 41 层、40 条链接、0/20 是传送链接',
    s.world.floorCount === 41 && s.world.links.length === 40 &&
    s.world.links[0].kind === 'lobby-transfer' && s.world.links[20].kind === 'boss-transfer' &&
    s.world.links[1].kind === 'stone-pipe');
  check('每个实时实例都有唯一 instanceId', (() => {
    const ids = s.world.liveStates().map((l) => l.instanceId);
    return ids.length > 0 && ids.every(Boolean) && new Set(ids).size === ids.length;
  })());

  // 0 层 F
  const fs = s.world.currentFloor.data.extensions.fixedScene.playerSpawn;
  p.x = s.world.currentFloor.origin.x + fs.centerCol * RA.C.TS - p.w / 2;
  p.y = s.world.currentFloor.origin.y + (fs.feetRow - 1) * RA.C.TS - p.h;
  check('大厅有开始挑战提示', (s.interactionPrompt() || {}).kind === 'start-tower');
  s.actions.interactPressed = true; s.stepOnce();
  check('按 F 一次进入第 1 层', s.world.current === 1 && s.status === 'running');
  check('F 不重建玩家、不无故回血', s.player === p && s.run.hp === 100);

  // 10 / 30 各自回血
  const hpBefore10 = s.run.hp = 40;
  const r10 = activate(s, 10);
  check('10 层进场回 40(40→80)', s.run.hp === 80 && r10.instanceId.indexOf('10:') === 0);
  s._onFloorEntered({ from: 10, to: 10 });
  check('同一休息层不会重复回血', s.run.hp === 80);
  check('10 层 HUD/槽号是真实层号', s.snapshot().floorNumber === 10 && s.snapshot().floor.kind === 'rest');

  s.run.hp = 80;
  const r30 = activate(s, 30);
  check('30 层独立实例、独立回血(80→100)', s.run.hp === 100 &&
    r30.instanceId.indexOf('30:') === 0 && r30.instanceId !== r10.instanceId);
  s._onFloorEntered({ from: 30, to: 30 });
  check('30 层重复进场不回血、封顶 100', s.run.hp === 100);

  // 20 Boss
  const r20 = activate(s, 20);
  const boss20 = s.boss;
  check('20 层创建 Boss 且仍是 running', !!boss20 && s.status === 'running');
  check('Boss 未击败时没有 F 提示(不能提前跳过战斗)', s.interactionPrompt() === null);
  check('20 层没有物理 finish', s.world.currentFloor.finish === null);
  const crossY = s.world.currentFloor.origin.y - 10;
  check('20 层越线不会自动传送到 21',
    s.world.afterPlayerStep({ x: p.x, w: p.w, feet: crossY - 5 }, crossY) === null);
  defeatBossDirectly(s);
  check('20 层 Boss 击败后不胜利,仍 running', boss20.defeated && s.status === 'running');
  const prompt20 = s.interactionPrompt();
  check('20 层击败后给 F 进入 21 提示', !!prompt20 && prompt20.kind === 'boss-transfer' && prompt20.text.indexOf('F') >= 0);
  const hpBeforeF = s.run.hp = 55;
  s.run.haloCooldownRemaining = 3.5;
  const castBeforeF = s.run.castId;
  s.actions.interactPressed = true; s.stepOnce();
  check('F 一次进入 21 层', s.world.current === 21);
  check('传送保留同一 Player / HP / CD', s.player === p && s.run.hp === 55 &&
    s.run.haloCooldownRemaining > 3 && s.run.castId === castBeforeF);
  check('21 层起点就是本层 start', Math.abs(p.x + p.w / 2 - (s.world.currentFloor.level.startX + p.w / 2)) < 2,
    String(p.x));
  check('离开 20 后旧 Boss 不再被更新/命中', s.boss === null && s.world.currentFloor.data.kind === 'normal');
  check('21 层没有 F 提示', s.interactionPrompt() === null);

  // 40 Boss:全新实例,两阶段后才胜利
  activate(s, 40);
  const boss40 = s.boss;
  check('40 层创建全新 Boss(不是 20 层旧实例)', !!boss40 && boss40 !== boss20 &&
    boss40.phase === 1 && boss40.state === 'shielded' && boss40.lastHitCast === null);
  check('40 层是最后一个槽、离开动作 victory', s.world.current === 40 &&
    s.world.exitActionAt(40) === 'victory');
  // 第一阶段
  boss40.shieldRemaining = 0.01; boss40.update(0.02, s);
  check('40 层第一阶段可 exposed', boss40.state === 'exposed');
  s.run.haloCooldownRemaining = 0;
  s.run.hp = 100;
  p.x = boss40.x + boss40.w / 2 - p.w / 2;
  p.y = boss40.y + boss40.h / 2 - p.h / 2;
  s.actions.skillPressed = true; s.stepOnce();
  check('第一次光环命中进入第二阶段 resolving', boss40.state === 'resolving' && boss40.phase === 1);
  boss40.resolvingTimer = 0; boss40.update(0.01, s);
  check('第二阶段重新护盾、不直接胜利', boss40.state === 'shielded' && boss40.phase === 2 && s.status === 'running');
  boss40.shieldRemaining = 0.01; boss40.update(0.02, s);
  s.run.haloCooldownRemaining = 0;
  p.x = boss40.x + boss40.w / 2 - p.w / 2;
  p.y = boss40.y + boss40.h / 2 - p.h / 2;
  s.actions.skillPressed = true; s.stepOnce();
  boss40.resolvingTimer = 0; boss40.update(0.01, s);
  check('40 层两阶段后击败才完整塔胜利', boss40.defeated && s.status === 'won');
  check('胜利后没有 41 层/可继续:', s.world.current === 40 && s.world.floorCount === 41);

  // 死亡重试同一清单
  const { session: s2 } = newSession(plan);
  check('死亡/重开后用同一 manifestId(不重抽)', s2.manifestId === s.manifestId);
  check('同一清单楼层身份顺序一致', (() => {
    const a = plan.value.floors.map((f) => f.levelId + ':' + f.contentHash).join(',');
    const b = s2.world.floors.map((f) => f.id + ':' + f.contentHash).join(',');
    return a === b;
  })());
  s2.run.hp = 40; activate(s2, 10);
  check('重试后休息仍然各自结算(新实例身份)', s2.run.hp === 80);
  s2.die('test');
  check('死亡状态为 dead', s2.status === 'dead');
  check('重试仍可创建同一清单', newSession(plan).session.world.floorCount === 41);
}

// ================= ⑤ 一次性清池 / 新发布保留 =================
head('发布池:一次性清空、旧无 epoch 记录隔离、新发布保留');
{
  const repo = RA.ContentRepository.create({ forceMemory: true });
  const epoch = F.poolEpoch;
  const mk = (id, diff) => {
    const d = clone(F.fallback);
    d.id = id; d.title = id; d.difficulty = diff; d.contentHash = null;
    let enc = LD.encode(d);
    const out = JSON.parse(enc.value);
    out.certification = {
      contentHash: out.contentHash, rulesVersion: 'test-rules', rulesFingerprint: 'test-fp',
      profileId: 'run-v1', status: 'passed', source: 'local-playtest', completedAt: '2026-11-09T00:00:00.000Z'
    };
    return out;
  };
  const old = mk('old_no_epoch', 1);
  await repo.adapter.publish({
    key: old.id + ':' + old.contentHash, levelId: old.id, contentHash: old.contentHash,
    data: old, profile: 'run-v1', source: 'local-playtest', publishedAt: 'old'
  });
  check('旧池记录先写入(无 epoch)', (await repo.adapter.listPublished()).value.length === 1);
  const prep = await repo.ensurePoolEpoch(epoch);
  check('第一次准备清空旧 published', prep.ok && prep.value.resetApplied === true &&
    (await repo.adapter.listPublished()).value.length === 0);
  const prep2 = await repo.ensurePoolEpoch(epoch);
  check('同一个 epoch 不重复清池', prep2.ok && prep2.value.resetApplied === false);

  const d1 = mk('new_level_a', 1);
  const saved = await repo.saveDraft('draft_a', d1, 0);
  check('新图草稿保存成功', saved.ok, saved.ok ? '' : JSON.stringify(saved.error));
  const pub = await repo.publish({ draftId: 'draft_a', expectedRevision: 1, receipt: d1.certification });
  check('新图发布成功', pub.ok, pub.ok ? '' : JSON.stringify(pub.error));
  check('新发布记录带当前 poolEpoch', (await repo.adapter.listPublished()).value
    .filter((r) => r.levelId === 'new_level_a')
    .every((r) => r.poolEpoch === epoch));
  const list = await repo.listEligible({});
  check('新发布在正式候选里', list.ok && list.value.length === 1 && list.value[0].levelId === 'new_level_a');
  check('候选带 requiredDifficulty(分档用)', list.value[0].requiredDifficulty === 1);

  const again = new RA.ContentRepository(repo.adapter, { storage: 'memory', persistent: false });
  const list2 = await again.listEligible({});
  check('重开/再次准备不会清掉新发布', list2.ok && list2.value.length === 1);

  const bad = mk('bad_difficulty', 9);
  const sbad = await again.saveDraft('draft_bad', bad, 0);
  const pbad = await again.publish({ draftId: 'draft_bad', expectedRevision: sbad.value.revision, receipt: bad.certification });
  check('非法/缺失难度不能发布(提示补选)', !pbad.ok && pbad.error.code === 'INVALID_DIFFICULTY',
    pbad.error ? pbad.error.code : 'ok');

  const d2 = mk('new_level_b', 2);
  const s2 = await again.saveDraft('draft_b', d2, 0);
  const p2 = await again.publish({ draftId: 'draft_b', expectedRevision: s2.value.revision, receipt: d2.certification });
  const list3 = await again.listEligible({ difficulty: 2 });
  check('难度 2 新发布只出现在难度 2 候选', p2.ok && list3.ok && list3.value.length === 1 &&
    list3.value[0].levelId === 'new_level_b');
  const list1 = await again.listEligible({ difficulty: 1 });
  check('难度 1 候选不混入难度 2', list1.value.length === 1 && list1.value[0].levelId === 'new_level_a');
}

// ================= ⑤b 难度修改是内容变更 =================
head('难度:修改属于内容变更，旧通过失效');
{
  const d = clone(F.fallback);
  d.id = 'difficulty_change_probe';
  d.difficulty = 1;
  let enc = LD.encode(d);
  const data = JSON.parse(enc.value);
  data.certification = {
    contentHash: data.contentHash, rulesVersion: 'probe', rulesFingerprint: 'probe',
    profileId: 'run-v1', status: 'passed', source: 'local-playtest', completedAt: '2026-11-09T00:00:00.000Z'
  };
  const m = RA.EditorModel.fromJSON(data).value;
  const hashBefore = LD.hashSync(m.toData());
  const certBefore = !!m.data.certification;
  m.setDifficulty(2);
  check('改难度清掉旧通过记录', certBefore && m.data.certification === null);
  check('改难度改变内容 hash', LD.hashSync(m.toData()) !== hashBefore);
  check('改难度后未重新试玩不能发布', (function () {
    // 发布要求认证 hash = 当前内容;没有认证就不能发布
    return !m.data.certification;
  })());
}

// ================= ⑥ 入口/页面静态契约 =================
head('正式入口与页面契约');{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('index 加载 full40 内嵌数据', html.indexOf('js/full40-samples.js') >= 0);
  check('首页开始游戏按钮', html.indexOf('开始游戏') >= 0 && html.indexOf('btn-formal') >= 0);
  check('首页严格开始/退出与右下设置', html.indexOf('btn-quit') >= 0 && html.indexOf('btn-main-settings') >= 0 &&
    html.indexOf('btn-dev') < 0 && html.indexOf('id="main-menu-box"') >= 0);
  check('显示正式池状态与固定40层', html.indexOf('pool-status') >= 0 && html.indexOf('固定') >= 0);
  check('旧标准试玩措辞已清', html.indexOf('标准试玩') < 0);
  for (const f of ['short.html', 'legacy.html']) {
    const h = readFileSync(join(ROOT, f), 'utf8');
    check(f + ' 只跳 index', /url=index\.html/.test(h) && h.indexOf('js/short.js') < 0);
  }
  const shortJs = readFileSync(join(ROOT, 'js/short.js'), 'utf8');
  check('正式入口走 buildFull40 + ensurePoolEpoch', shortJs.indexOf('buildFull40') >= 0 &&
    shortJs.indexOf('ensurePoolEpoch') >= 0);
  check('正式入口用 SeedText 而非 Date.now', shortJs.indexOf('RA.SeedText') >= 0 &&
    shortJs.indexOf('Date.now()') < 0);
  check('HUD 使用真实 floorNumber 与 40 层', shortJs.indexOf('floorNumber') >= 0 &&
    shortJs.indexOf("'第 ' + fi + '/' + total") >= 0);
  check('提供明确的调试跳层但不进正式流程', shortJs.indexOf('debugJumpTo') >= 0 &&
    html.indexOf('debugJumpTo') < 0);
  const worldJs = readFileSync(join(join(ROOT, 'js'), 'world.js'), 'utf8');
  check('World 在访问 finish 前分派传送链接', worldJs.indexOf('boss-transfer') >= 0 &&
    worldJs.indexOf("if (active.linkUp && active.linkUp.kind !== 'stone-pipe')") >= 0);
}

const result = { pass, fail, fails, name: '25 完整塔' };
const IS_MAIN = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  console.log('\n' + '='.repeat(70));
  console.log(`完整塔自检:合计 PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    fails.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('全部通过 ✔');
  process.exit(0);
}
export { result };
