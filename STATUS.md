# 当前状态

更新：2026-10-31（T01-R 修复后）。**T00 已验收；T01 主体交付；T01-R 的 R1～R5 已修复并补回归，等待复验。复验通过前不开始 T02。** 当前可玩的仍是旧平台跳跃原型；v0.1 / v0.2 是计划版本，没有 APK。

## 版本与回退基线

- T00 原型基线：`f56cdce`；T01 实现：`6a7e712`；验收时 HEAD：`570c122`；T01-R 修复在当前工作区（未再次初始化 Git）。
- 已有本地 Git，无远程上传；不要重复初始化。保存当前工作后，在独立目录查看基线，不丢弃他人未提交内容。
- 本轮修复保留了验收 agent 的未提交报告、复现脚本与文档，只在其上追加实现和检查记录。

## 任务状态

| 任务 | 状态 | 说明 |
|---|---|---|
| 需求、设计与任务卡 | 已完成当前轮整理 | 规则可在后续讨论中更新 |
| T00 | 已验收 | 可回退基线和检查记录存在；浏览器人工检查未测 |
| T01 | 已交付，随 T01-R 复验 | 编解码、参数描述、12 图迁移、测试接入存在 |
| T01-R | **已修复，待复验** | R1～R5 已修并补 98 项回归；证据见 [修复报告](docs/checks/T01R-fix-report.md) |
| T02A / T02B | 待开始 | 原 T02 拆分为模型/文件往返、仓库/保存状态两部分 |
| T03～T10 | 待开始 | 共用会话、连续世界、战斗与编辑发布、短塔、安卓 |

## 当前实现事实

- 已有：原型移动/碰撞/机关/画图交互；新增 LevelData/LevelCodec、EntityRegistry 数据描述、LegacyImport 和迁移工具。
- 原始 12 张图仍在 levels/，未修改；levels/v2/ 为 12 张独立迁移草稿，ports=null、certification=null，不能直接试玩或发布。
- 原型仍有镜像、独立淡出换层和坠落回本层；编辑器仍是 TXT 模型，尚未接入新 JSON。
- 未实现：目标连续世界、共用 GameSession、生命/技能/敌人运行行为、Boss、认证发布、草稿仓库、安卓触控与打包。
- 参数描述不代表敌人已实现；数据层支持 JSON 不代表编辑器保存已经保真。

## 检查与证据

原始 T00 基线：940 PASS / 4 FAIL。修复前复验 `node tools/test_all.mjs`：**1089 PASS / 4 FAIL**（引擎 587/4、编辑器 238/0、贴图 126/0、数据 138/0）。

T01-R 修复后（2026-10-31，当前工作区）：

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_all.mjs` | **1188 PASS / 4 FAIL**（引擎 587/4、编辑器 238/0、贴图 126/0、数据 139/0、修复自检 98/0） | `1` |
| `node tools/test_leveldata.mjs` | 139 PASS / 0 FAIL | `0` |
| `node tools/test_t01r.mjs` | 98 PASS / 0 FAIL | `0` |
| `node tools/migrate_levels.mjs` | 12/12 幂等跳过（`unchanged`），`levels/v2/` 未重写 | `0` |
| 隔离重迁（临时目录） | 12/12 成功，输出与 `levels/v2/` 逐字节相同 | `0` |

4 条失败仍为 floor09/floor11 的逐跳可达性各被重复报告一次，不能据此作人工通关结论；本卡未修、未跳过。

[验收报告](docs/checks/review-2026-10-31.md)、[修复报告](docs/checks/T01R-fix-report.md)、[原始自检输出](docs/checks/review-2026-10-31-test_all.txt)、[复现脚本](docs/checks/review-2026-10-31-probes.mjs)、[复现结果（修复前）](docs/checks/review-2026-10-31-probes.json)、[复现结果（修复后）](docs/checks/T01R-postfix-probes.json)、[修复后完整自检](docs/checks/T01R-test_all.txt)、[隔离迁移记录](docs/checks/T01R-migration-isolated.txt)。

已用 Git 对照确认原始图、模板、levels.js、assets 与旧编辑器/游戏/试玩代码均未偏离基线。危险路径测试仅使用系统临时目录，且测试结束复核正式 `levels/` 与 `levels/v2/` 文件 sha256 未变。未执行真实浏览器画面/手感、安卓或性能测量；当前 Python 静态服务器环境仍未验证。

## 验收待修问题

2026-10-31 T01-R：以下 5 项均已修复并补回归测试，**等待复验确认**；逐项证据见 [修复报告](docs/checks/T01R-fix-report.md)。

| ID | 优先级 | 复现与影响 |
|---|---|---|
| R1 | P1 | 未知对象额外字段在 decode 时无提示丢失；encode 后重开 HASH_MISMATCH；未来 schema 被 encode 降级 |
| R2 | P1 | 迁移输入输出同目录时先覆盖源文件，后报错；需写前检查路径与冲突 |
| R3 | P2 | 认证与当前 rules 都缺版本/指纹时，publish 校验错误地通过 |
| R4 | P1 | 80 个未知格只保留 64 个；旧未知对象额外字段和路径引用被删除 |
| R5 | P2 | encode 可成功导出超过自身导入上限的文件，随后无法重新打开 |

## T01-R 修复结果（待复验）

- **R1**：`decode`/`encode`/`hash` 统一走 `LevelData.project()`；未知顶层/对象/路径/子字段保留并进入 hash；`encode` 与 `decode` 都拒绝非 2 的 schema；`encode` 写后回读自检。复现脚本：`decodedBehavior` 保留、`reopenOk=true`、v3 导出被拒。
- **R2**：迁移改为“先规划后写入”，写入前检查同目录、大小写/别名、输出 id 碰撞、报告/源文件冲突；已有输出内容不同默认报冲突，`--force` 才覆盖；失败不写任何文件。复现脚本：`sourceChanged=false`、退出码 `1`。
- **R3**：认证与当前 rules 的版本/指纹先分别验证非空字符串再比较；`completedAt` 校验 ISO8601 带时区。复现脚本：`errorCount` 从 0 变 3。
- **R4**：未知格/旧实体不再截断（超容量明确 `LIMIT_EXCEEDED`）；旧对象额外字段、`pathId`/`legacyPathId`、`legacyType`、`legacyId`、旧注释与未识别顶层字段均保留；迁移后草稿必须可保存。
- **R5**：`encode` 按 UTF-8 实际字节数检查总上限，超限 `LIMIT_EXCEEDED`，不再导出打不开的文件。
- 附带修正：`decode` 的同一条警告不再重复出现（有断言）。

新增回归：`tools/test_t01r.mjs`（98 项，R2 路径冲突全部使用系统临时目录）。`tools/test_leveldata.mjs` 的“断路径”断言按新契约拆分（草稿可存、试玩拒绝），旧断言不是被跳过而是被替换并说明原因。

具体改动：`js/level-data.js`、`js/legacy-import.js`、`tools/migrate_levels.mjs`、`tools/test_leveldata.mjs`、`tools/test_all.mjs`，以及重生成的 [迁移报告](docs/checks/T01-legacy-migration.md)。

其他原型限制仍在：旧编辑器保存先改池后写盘；未验证旧关卡可抽选；旧种子受池排序/内容影响；主游戏和试玩分叉；浮石立即消失与最终目标不符。这些分别由后续卡处理，不混入 T01-R。

## 下一步

1. 复验 T01-R：按 [修复报告](docs/checks/T01R-fix-report.md) 的 R1～R5 证据与复现脚本检查；通过后把 T01 标完成。
2. 再做 T02A（EditorModel 与无损文件往返），然后 T02B（IndexedDB 草稿、revision 冲突与保存 UI）。
3. 之后按 T03/T04 进入共用会话与连续世界；保持 PC 短塔 → 安卓 → 完整内容的顺序。

尚未确认的接缝规格、光环半径、无敌时间、Boss 节奏等提案继续见设计决定，不因本次代码修复自动转成用户要求。

## 独立用户任务 · 七圣召唤工具（2026-10-31）

按用户新指令新增 [gi-tcg-tool](gi-tcg-tool/README.md)，与本仓库玩法路线独立，不推进 T01-R。对原神 7.1.0 安装目录仅只读检查；应用使用固定 v7.1.0 公开数据（629 张可组牌卡、共 1,502 条记录），不声称已完成本机全量解包。支持分享码与卡牌双向转换、中文查询和 ID 表导出。专项测试 22/22 通过；该工具加入当时的完整仓库检查为 1089 PASS / 4 FAIL，T01-R 修复后当前为 1188 PASS / 4 FAIL（见上表）。浏览器真实显示与原神导入未测，详细限制与下一步见工具 README。保留了原有未提交修改。
