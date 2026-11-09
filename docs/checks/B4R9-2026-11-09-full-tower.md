# B4-R9 / 25号卡交付记录：正式入口接入完整 0–40 塔

2026-11-09。工作区在 HEAD `d41e07d` 之上，保留 B4-R7/R8 全部未提交成果；本轮只做 [25号卡](../tasks/25-full-tower-formal-game.md) 与必要依赖。**24号编辑器已由用户人工确认，不重做编辑器/单图试玩；真人从 0 走完整 40 层仍未执行。**

## 实际改动

### 1. 数据来源与运行副本

- `开发示例关卡/`（level0/test1/test2/test3/rest_level/boss）保持原样只读，`level0.json` 的两个裸 `x` 不修改，也不直接塞进运行。
- 新增 `levels/full40/`：
  - `lobby.json` = 已验 `b4_lobby`（kind=lobby、ports=null、fixedScene centerCol10/feetRow20）；
  - `rest.json` = `b4_rest`（start 13,18 / finish 1,8）；
  - `boss.json` = `b4_boss`（start 1,20 / finish=null / 中心 10.5,14.5）；
  - `fallback_test3.json` = test3 规范运行副本，独立 id `full40_fallback_test3`、重新计算 hash、`certification=null`、start(1,20)/finish(1,2)，地形/尺寸/对象/路径与 test3 原件一致。
- 新增 `tools/sync_full40_levels.mjs`：校验端口/固定出生/身份/无认证，并与新目录原文件做地形保真比对；生成 `js/full40-samples.js`（layout `full40-v1`、gameplayProfile `run-v1`、poolEpoch、固定场景、fallback、来源 SHA-256 登记）。`--check` 可做同步检查。
- `short.html`/`editor.html`/`legacy.html`/`tests/browser.html`/`tools/loader.mjs` 加载新脚本；`www` 已按新 `short.html` 重建（未 `cap sync`、未构建 APK）。

### 2. 旧普通池清空（用户已授权的例外）

- `levels/floor01–12.json` 逐个移动到 `levels/archive/legacy-pool-2026-11-09/`，原文件未删、未改；`levels/levels.js` 重新生成为空 catalog（`RA.LEVEL_DATA={}`、`RA.LEVEL_TEXT={}`）。
- `tools/sync_levels.mjs` 允许空池，不再因 0 个 json 失败，也不会重新 seed 旧图。
- 编辑器内置下拉不再枚举 floor01–12（只保留固定场景只读副本），`test_editor` 改为断言活动池为空。
- 历史引擎/贴图自检显式读归档目录，不通过活动池重新激活旧图；`test_leveldata` 的 12 张迁移保真检查改读归档。

### 3. 一次性发布池重置（DB v3 + pool epoch）

- `js/content-repository.js`：`DB_VERSION=2→3`，新增 `meta` store（升级只补缺失 store，不清 drafts）。
- `ensurePoolEpoch(epoch)`：同一 `readwrite` 事务读 `meta.poolEpoch`；未应用时 `clear(published)` + 写标记，提交后才成功；已应用则不清；失败返回失败、可重试。
- `publish`/`publishImported`/`listEligible` 都先准备同一 epoch；新记录写 `poolEpoch`，候选只取当前 epoch，旧无 epoch 记录不能混回池；`drafts`、通过历史、偏好不受影响。
- 内存适配同语义，便于自检。
- 真实浏览器验证：同事务清空 published 但保留 drafts；同一 epoch 再开不清；旧无 epoch 写入被候选隔离；新发布刷新后仍在。

### 4. TowerPlanner `full40-v1`

- 41 槽：0 固定大厅、10/30 固定休整、20/40 固定 Boss、其余 36 普通。
- 正式候选按 `difficulty` 1–4 分桶，分别填 1–9/11–19/21–29/31–39；每档按 `levelId+contentHash` 无放回最多 9 张；本档缺口用 fallback 模板补齐（补位数量按每档 9 槽缺口，不按总池数量）。
- 只有 `source='fallback'` 允许模板自身难度与目标档不同；正式图不跨档。
- 池为空也返回完整 41 槽，不再 `EMPTY_POOL`；manifestId 包含布局、seed、epoch、每槽 levelId/hash/source/exitAction；同 seed 可复现。
- 兼容旧 `short-v1` 抽选只留给调试短塔。

### 5. 世界/会话：显式传送、双 Boss、双休息、真实层号

- `World`：0→1 为 `lobby-transfer`、20→21 为 `boss-transfer`，其余 38 条仍按石头管/真实碰撞；传送链接在访问 `lower.finish` 前分派，Boss 无 finish 不再空指针；21 层独立放置并留 4 格空白。
- `afterPlayerStep` 不再提交传送链接，0/20 只能由 Session 的 F 分派触发；`transferNext(player)` 保持同一 Player，只重置必要运动状态，HP/光环/CD 保留。
- 所有 `_spawn`（含 preview）都赋唯一 `instanceId=槽号:模板id:hash`；10/30 两个休息、20/40 两个 Boss 不再共享身份。
- 休息回血按 `instanceId` 记录，10/30 各一次 +40 封顶 100；重复进入不重复回血。
- Boss 击败回报 `GameSession.onBossDefeated`：20 只停攻、清伤害物、给 F 提示、保持 running；40 才 `win`。离开 20 后旧 Boss 置空，进 40 创建全新 phase1/shielded/timers 实例。
- HUD 使用真实 `floorNumber`：0 大厅、10/30 休整、20/40 BOSS、其余普通，`x/40`；不再 `index>4 就 Boss`。

### 6. 入口与编辑器难度

- `index.html`/`short.html` 默认「开始完整塔 (0–40)」；旧六图短塔只留「调试:旧六图短塔」。
- 菜单显示正式池张数/四档数量和 test3 补位说明；空池可直接开始。
- 编辑器保留 1–4 档难度选择，并说明对应层段；试玩/发布要求有效 `difficulty=1..4`，缺失/非法明确提示，不静默补 1；难度进入内容 hash，改后旧通过失效。
- `short.js` 暴露 `RA.short.debugJumpTo(n)` 供验收定位 10/20/30/40；HUD 标“调试跳层”，不进正式流程、不产生认证。

## 实际执行结果

| 命令 | 结果 |
|---|---|
| `node tools/test_full40.mjs` | **96 PASS / 0 FAIL** |
| `node tools/browser_full40.mjs`（真实 Chrome 156 headless + 真实键盘） | **38 PASS / 0 FAIL**，8 张截图 + JSON |
| `node tools/test_all.mjs` | **1638 PASS / 4 FAIL**（4 条仍是历史 floor09/floor11 逐跳可达诊断；引擎 607/4、编辑器 266/0、贴图 126/0、数据 139/0、25 完整塔 96/0、23 试玩页 13/0 等） |
| `node tools/browser_b2.mjs` 回归 | 20/0 |
| `node tools/browser_b3r2.mjs` 回归（含重建后的 www） | 47/0 |
| `node tools/browser_trial23.mjs` 回归 | 40/0 |
| `node tools/browser_editor24.mjs` 回归 | 44/0 |

真实 Chrome 检查覆盖：空池菜单/启动、0 层 F→1、10/30 独立回血、20 击败不提前胜利/F→21/保留 HP/CD、40 新 Boss 两阶段胜利、死亡重试同一 manifestId、真实 IndexedDB 一次性清池（保留 drafts）、旧无 epoch 记录隔离、新发布刷新后保留且只进 11–19（难度 2）。

截图：`docs/checks/full40-menu-empty-pool.png`、`full40-floor0-lobby.png`、`full40-floor10-rest.png`、`full40-floor30-rest.png`、`full40-floor20-boss-cleared.png`、`full40-floor21-after-boss.png`、`full40-dead-retry.png`、`full40-floor40-victory.png`；逐项结果 `docs/checks/browser-full40-2026-11-09.json`。

## 未做 / 仍需人工

1. **真人从 0 走到 40 未执行**：脚本用 `debugJumpTo` 定位 10/20/30/40，不能冒充物理通关；20/40 Boss 的两阶段在脚本里用受控状态推进，不是真人战斗。
2. 普通层全是 test3 补位时的长度/手感/难度曲线未人工体验；正式图仍需作者在编辑器选难度→试玩→发布。
3. 没有验证真实双窗口同时清池/发布；DB 升级被旧页阻塞时给出可见错误，但未在真实旧页并发下复现。
4. 未构建新 APK、未 `cap sync`；Android 仍是 0.3.2。`www` 已重建，但未做真机安装验证。
5. `browser_b4.mjs` 仍是历史脚本，含早于 24/25 号卡的过时断言，未整体重写。

## 人工复测最短步骤

1. 打开 `index.html`：确认菜单显示「正式池:0 张…旧内置普通图已归档」，点「开始完整塔 (0–40)」能进 0 层，HUD 是 0/40。
2. 0 层出生处按 `F` 进 1；走跳/二段跳/血条/K/暂停；到 10 层应回 40，30 层再独立回 40，不能共用一次。
3. 到 20 层打两阶段 Boss：击败后**不胜利**，按 `F` 进 21，HP/光环/CD 还在；到 40 层是新的 Boss，两阶段击败才出现「完整塔通过」。
4. 故意死亡/重试：回 0 层，楼层清单不变（不重抽）。
5. 编辑器做一张普通图，选难度 2→试玩通过→发布；刷新后不被清掉；开始完整塔应在 11–19 出现该图，其余缺口仍是 test3；把难度改成 3 后旧通过失效，需重新试玩。
6. 打开 `standard.html`/`devplay.html`：只显示停用说明和回编辑器，不启动旧三层/CD20。
