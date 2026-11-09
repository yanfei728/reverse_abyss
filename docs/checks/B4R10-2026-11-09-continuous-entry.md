# B4-R10 / 26号卡交付记录：连续接口可靠入层、实存石管几何、邻层云板/管壁碰撞

2026-11-09。工作区在 HEAD `d41e07d` 之上，保留 B4-R7/R8/R9 全部未提交成果；本轮只做 [26号卡](../tasks/26-continuous-floor-entry.md) 与必要回归。23/24 已人工通过不重做；没有重新清池、改地图/跳跃参数、改四档池/test3 补位或固定场景。**可见浏览器没有自动完成一张完整地图的连续平台攀爬**，因此浏览器证据是“每个接缝合法 finish 站位 fixture + 真实键盘上穿”，连续 1→6 的物理步进证据是 Node 引擎；两者都在下面分开写明，不冒充真人全塔通关。

## 三个一起修的环节

### 1. 合法上穿漏提交

- `Level._hitTiles` 一直用 `x+w-1` / `y+h-1` 选格（末端内缩 1px），但 `World.afterPlayerStep` 用 `x+w` 与 0.01px 容差检查整身入开口。真实右移上穿时右缘可超出 0.6388888889px：移动放行、提交拒绝。
- 现在提交判断使用**与移动相同的有效碰撞体右缘**（`x + w - 1`），0.01 只吸收浮点误差，不是放宽入口。
- 增加 `pendingEntry`：若上穿帧身体尚未完全进入开口，但已越过上层 start 顶面且与开口有交叠，记住这次合法上穿；随后真正进入（整身）时**一次**提交。脚底落回 `commitY` 以下 0.5px 则清除；`commitNext`/`transferNext`/`activateSlot` 都清理。
- 提交仍只走 `commitNext`：current/active/entered/Player.view/新 preview/旧快照释放一次完成，不重建 Player、不改 HP/光环/CD、不用传送吸附。

### 2. short.render 不再画未加载的规划管道

- `World` 区分规划 `links` 与运行 `runtimeLinks`：只有石管**两端实例都实存**时才进入 `liveStoneLinks()`。
- `_refreshRuntimeLinks()` 在构造、`commitNext`、`transferNext`、`activateSlot` 后重建；同时只为实存石管重建下层 `wallCells`。
- `js/short.js` 的无条件 `world.links.forEach` 改为 `world.liveStoneLinks()`；目标地图没加载时不再显示悬空管壁，加载后地图和管道一起出现。

### 3. 邻层静态碰撞完整且保留 oneWay

- `Level` 新增 `solidTileAt` / `onewayTileAt`，`_hitTiles`/`blockedAt`/`standingOn` 都改用它；`FloorInstance` 给 Level 注入 `extraSolidAt`/`extraOnewayAt`，按世界坐标查询 `World.staticAtWorld`。
- `World.staticAtWorld` 合并**所有已实存实例**的 tile1–4（solid）、tile5（oneWay）与已实存石管墙（solid）；未实存规划链接不产生幽灵墙。
- 单向云板只进入 `includeOneway` 的向下/站立分支，横向和向上仍可穿过；派生石管墙保持四向实心。active/snapshot/preview 任一 FloorView 对同一 live 云板/管壁结果一致。

## 修复前后定向证据

### seams 探针

命令（新路径，不覆盖原验收 JSON）：
- 修复前：`node docs/checks/review-B4R9-2026-11-09-seams.mjs docs/checks/26-before-seams.json`
- 修复后：`node docs/checks/review-B4R9-2026-11-09-seams.mjs docs/checks/26-after-seams.json`

| 接缝 | 修复前 current / preview / live | 修复后 current / preview / live |
|---|---|---|
| 1→2 右移 | 1，3未创建，0/1/2 | 2，3已创建，1/2/3 |
| 8→9 右移 | 8，10未创建，7/8/9 | 9，10已创建，8/9/10 |
| 14→15 右移 | 14，16未创建，13/14/15 | 15，16已创建，14/15/16 |

两次都退出 0；退出 0 只表示诊断执行完成。修复前 `bugReproduced=true`，修复后 `bugReproduced=false`；居中 19 次换层与左移对照仍正常。

### missing-map 探针

命令：
- 修复前：`node docs/checks/review-B4R9-2026-11-09-missing-map.mjs docs/checks/26-before-missing-map.json`
- 修复后：`node docs/checks/review-B4R9-2026-11-09-missing-map.mjs docs/checks/26-after-missing-map.json`

| 状态 | 修复前 | 修复后 |
|---|---|---|
| HUD/current、Player.view | 4、4 | 5、5 |
| live 实例 | 3、4、5 | 4、5、6 |
| 6 号槽地图 | 未加载 | 已加载 |
| 对 5 号出口云板向下 move | 旧 view 穿过、grounded=false | active/preview 都接住、grounded=true |
| 对 5→6 管壁横移 | 旧 view 穿过、vx=-180 | active/preview 都停住、vx=0 |
| `symptomsReproduced` | true | false |

修复后把该连接真正加载了，所以探针中原来的 5→6 墙从“未实存幽灵/漏查”变成“已实存且两边一致阻挡”；这符合新契约，不是保留旧缺陷。未实存连接的独立负例在 `test_26_continuous` 中断言：0 层时 1→2 规划墙不进入 runtimeLinks、不产生 wallCells、不在世界碰撞里。

### 连续物理步进（Node 引擎，非浏览器）

`node docs/checks/26-continuous-route.mjs`：从大厅真实 F 0→1 开始，使用真实 Session/Player、按 test3 平台路线给出输入，**不使用 debugJumpTo/activateSlot，也不设置 finish 站位**，连续完成 `1>2、2>3、3>4、4>5`，最终到 6 层，live=5/6/7、Player.view=6、status=running。结果在 `docs/checks/26-continuous-route.json`。这是引擎连续证据，不是可见浏览器或真人通关。

## 实际执行结果

| 命令 | 结果 |
|---|---|
| `node tools/test_26_continuous.mjs` | **39 PASS / 0 FAIL** |
| `node tools/test_full40.mjs` | 96 / 0 |
| `node tools/test_all.mjs` | **1677 PASS / 4 FAIL**（4 条仍是历史 floor09/floor11） |
| `node tools/browser_26_seams.mjs`（真实 Chrome 156 headless + 真实键盘） | **17 PASS / 0 FAIL**，4 张截图 |
| `node tools/browser_trial23.mjs` / `browser_editor24.mjs` / `browser_b2.mjs` / `browser_b3r2.mjs` | 40/0、44/0、20/0、47/0 回归 |

`test_26_continuous` 覆盖：1/8/14 右移上穿一次提交、Player.view/current同步、同一 Player/HP/CD、preview 创建、最多 3 实例；规划 vs 实存石管（0层无1→2墙、F进1后生成）；云板下落/上穿、管壁横向从 active/snapshot/preview 一致；未实存连接无墙；反复跳不重复入层；`short.render` 只用 liveStoneLinks。

浏览器证据（每个接缝前一次明确标注的 finish 站位 fixture，随后真实键盘）：`26-browser-floor1-start.png`、`26-browser-floor4-before-cross.png`、`26-browser-floor5-map6-loaded.png`、`26-browser-floor6-continued.png`；逐项 `docs/checks/browser-26-seams-2026-11-09.json`。它验证了 1→2、2→3、3→4、4→5（右移）、5→6 的真实键盘上穿，以及第4层缺图组合修复后的 HUD5/live4,5,6/6已加载、云板可站/可穿、管壁挡住。

## 未测 / 仍需人工

1. **可见浏览器没有自动完成一张完整地图的连续平台攀爬**：自动键盘控制器在浏览器实时帧率下无法稳定复现 Node 的整张图路线，因此浏览器证据用逐接缝 fixture；没有把它写成“连续路线”。真人从 0 实际爬到第4层及以后的连续手感仍未记录。
2. 没有真人完整塔通关、20 后 F21、30 休息、40 终局的真人复测；这些由 25 号卡与本次 Node/浏览器定点回归覆盖，不代表真人全塔通过。
3. 未构建 APK；`www` 已随 26 修改重建，但未真机验证。未重置发布池，未改原图/草稿/认证。

## 作者人工复测步骤

1. 打开根目录 `index.html`（自动进 `short.html` 正式完整塔），点「开始完整塔 (0–40)」，0 层按 `F` 进 1。
2. 实际向上走到第 4 层，重点在 3→4、4→5 接缝：交替居中/右移上穿；确认 HUD 到 4/5、上方下一张地图已出现、角色可见并还能继续上行。
3. 在第4/5层出口云板处：从上方落下能站住，从下方上穿能穿过；贴着已实存石管左右横移会被管壁挡住。
4. 继续到 10 层看休整、20 层击败后 F 进 21、40 层胜利；仍缺图时记录 current、Player.view、玩家世界坐标、live 实例、目标槽和最后一次 floorEntered，不清存储、不换图。
