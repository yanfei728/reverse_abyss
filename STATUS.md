# 当前状态

更新：2026-11-01（T02A-R 交付后）。**T00、T01 数据层、T01-R 已验收；T02A 主体已交付；T02A-R 的 A1～A3 已修复并补模型/UI/真实浏览器回归，等待复验。复验通过前不开始 T02B。** 当前可玩的仍是旧平台跳跃原型；v0.1 / v0.2 是计划版本，没有 APK。

## 版本与回退基线

- T00 原型基线：`f56cdce`；T01 实现：`6a7e712`；T01-R 修复：`c7c5490`；**T02A 交付：`f2a0e07`**。
- 本轮验收 HEAD `94377e9`；新增验收证据/任务卡/美术接入说明未提交 Git，没有修改实现代码、原图、素材或已有截图。
- 已有本地 Git，无远程上传；不要重复初始化。保存当前工作后，在独立目录查看基线，不丢弃他人未提交内容。
- 本次开始时的未提交文档、复验脚本与无关 ZIP 原样保留，没有恢复或处理无关内容；没有再次初始化 Git。

## 任务状态

| 任务 | 状态 | 说明 |
|---|---|---|
| 需求、设计与任务卡 | 已完成当前轮整理 | 规则可在后续讨论中更新 |
| T00 | 已验收 | 可回退基线和检查记录存在；浏览器人工检查未测 |
| T01 | 数据层验收通过 | 编解码、参数描述、12 图迁移、测试接入；不代表编辑器与运行时接入完成 |
| T01-R | **R1～R5 复验通过** | [独立复验报告](docs/checks/review-T01R-2026-10-31.md)；N01 为非阻塞工具限制 |
| T02A | **主体交付，随 T02A-R 复验** | 数据模型与普通 JSON 链路存在；A1～A3 已修，见 [T02A-R 交付记录](docs/checks/T02A-R-2026-11-01.md) |
| T02A-R | **已修复，待复验** | 画笔幂等、失败导入零替换、缩图接口确认与保真备份；模型/UI/浏览器回归已补 |
| T02B | 待开始 | IndexedDB 草稿仓库、revision 冲突、保存状态 UI |
| T03～T10 | 待开始 | 共用会话、连续世界、战斗与编辑发布、短塔、安卓 |

## 当前实现事实

- 已有：原型移动/碰撞/机关/画图交互；LevelData/LevelCodec、EntityRegistry 数据描述、LegacyImport、迁移工具；编辑器已接入完整 LevelData（T02A）。
- 原始 12 张图仍在 levels/，未修改；levels/v2/ 为 12 张独立迁移草稿，ports=null、certification=null，不能直接试玩或发布。
- 编辑器可打开 v2 JSON、导入旧图、画地块/出生点/S·x·y 机关、撤销重做、改尺寸、导出 JSON 并重开；未知对象与未知字段保留显示。草稿不会自动保存，刷新即丢（T02B）。
- 原型仍有镜像、独立淡出换层和坠落回本层；游戏本体仍读旧 levels/levels.js，新格式没有正式试玩与发布入口。
- 未实现：目标连续世界、共用 GameSession、生命/技能/敌人运行行为、Boss、认证发布、草稿仓库、端口编辑、安卓触控与打包。
- 参数描述不代表敌人已实现；编辑器能保存 JSON 不代表新格式已经能试玩或发布。

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

本次独立复验再次运行完整自检，仍为 1188/4、退出码 1；重跑上轮 7 个场景，行为均已修正；在新临时目录重迁 12 张图，输出与 levels/v2/ 逐字节相同、源文件未变。证据：[复验报告](docs/checks/review-T01R-2026-10-31.md)、[完整输出](docs/checks/review-T01R-2026-10-31-test_all.txt)、[场景输出](docs/checks/review-T01R-2026-10-31-probes.json)、[隔离迁移](docs/checks/review-T01R-2026-10-31-isolation.json)。本轮未修改实现代码。

## T02A 交付与独立验收

编辑器模型与 JSON 文件往返已完成，详见 [T02A 交付记录](docs/checks/T02A-2026-10-31.md)。

上句及下表记录交付方已实现的主体与测试结果，不代表验收通过。2026-11-01 独立复跑完整自检同为 1089/4、退出码 1；新增边界检查复现 A1～A3。Chrome 复跑因 DevTools 端口未启动而未完成，原有 18/0 与截图仍作为交付方证据保留，本轮不冒充已重现全部浏览器操作。

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_editor.mjs` | **139 PASS / 0 FAIL**（旧 TXT/改池/试玩测试替换为 T02A 契约测试） | `0` |
| `node tools/test_all.mjs` | **1089 PASS / 4 FAIL**（引擎 587/4、编辑器 139/0、贴图 126/0、数据 139/0、修复自检 98/0） | `1` |
| `node tools/browser_t02a.mjs` | **18 PASS / 0 FAIL**（本机 Chrome 156，headless + DevTools 协议，真实鼠标/滚轮/下载） | `0` |
| `node tools/migrate_levels.mjs` | 12/12 幂等跳过；原图与 levels/v2/ 未改 | `0` |

- 模型：`EditorModel.data` 是唯一真值，没有第二份 cells；对象/出生点/难度/背景/路径/装饰/extensions/未知字段都留在 LevelData 里；撤销/重做快照整份数据（100 步 / 32 MiB）。
- 导入导出：v2 JSON 走 LevelCodec（失败/未来 schema 不替换当前图）；旧 TXT/旧 JSON 只走 LegacyImport；导出只发起下载，不写 levels/、不清 dirty。
- UI：打开 JSON / 导入旧图 / 导出 JSON / 复制 / 查看 / 难度 / 背景；试玩禁用并解释；旧 TXT 导出、保存到游戏、文件夹授权、自动写入全部移除；G 不再是画笔，旧 G 只显示迁移位置。
- 浏览器证据：[截图](docs/checks/t02a-browser-import.png)（另有 draw / reopen 两张）、[浏览器下载的 JSON](docs/checks/t02a-browser-exported.json)、[逐项结果与版本](docs/checks/browser-t02a-2026-10-31.json)。
- 演示 JSON：[levels/demo/t02a-demo.json](levels/demo/t02a-demo.json)，未认证、`ports=null`，含难度 3、两个参数对象、一条 pingpong 路线、背景、装饰、extensions、未知对象与未知字段。
- 附带修复：`LevelData.decode` 的 size/terrain 不再与调用方共享引用（编辑模型不会改写传入数据；有回归断言）。
- 未做：T02B 草稿仓库（刷新不恢复）、正式试玩、发布认证、端口/参数/路径编辑；文件选择对话框无法在 headless 自动点击，改用同一处理函数并由用户可手动复验。
- 测试数量变化说明：编辑器测试 238 → 139 不是删断言，而是旧 TXT/旧池/旧试玩断言被目标契约替换；引擎、贴图、数据、修复自检数量未变。

### T02A-R 修复结果（待复验）

2026-11-01 A1～A3 已修复，详见 [T02A-R 交付记录](docs/checks/T02A-R-2026-11-01.md)。修复后实测：

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_editor.mjs` | **193 PASS / 0 FAIL**（新增 A1/A2/A3 模型 + UI 回归） | `0` |
| `node tools/test_all.mjs` | **1143 PASS / 4 FAIL**（引擎 587/4、编辑器 193/0、贴图 126/0、数据 139/0、修复自检 98/0） | `1` |
| `node tools/browser_t02a_r.mjs` | **21 PASS / 0 FAIL**（Chrome 156 headless；机关长按 1.2 秒、坏接口导入、缩图取消/确认/撤销） | `0` |
| `node tools/migrate_levels.mjs` | 12/12 幂等跳过；原图与 levels/v2 未改 | `0` |

- **A1**：机关画笔同格同类幂等（保留原 id/参数/未知字段、不占配额）；换类型才覆盖；矩形/油漆桶/多格笔刷同规则；按住 1 秒仍只有 1 个对象、一笔撤销。复现脚本 60 → 1。
- **A2**：`fromData/fromJSON/fromLegacy` 统一过共享 draft 校验，结构 error 不返回可提交模型；`replaceModel` 失败完整回滚模型/历史/dirty/视角；检查面板不再读坏 `ports.entry/exit`。复现脚本：无异常、旧图保留、`oldWorkPreserved=true`。
- **A3**：`resizeImpact` 计入接口开口，未确认拒绝；确认后原 ports 完整追加到 `extensions.retiredPorts`（不覆盖旧记录）、`ports=null`；不夹取 col；撤销还原。复现脚本：`impact.ports` 0 → 2。
- 浏览器证据（新文件名，保留 T02A 旧证据）：[导入后](docs/checks/t02ar-browser-import.png)、[坏接口导入后](docs/checks/t02ar-browser-bad-import.png)、[缩图后](docs/checks/t02ar-browser-resize.png)、[逐项结果](docs/checks/browser-t02a-r-2026-11-01.json)。
- 本轮 Chrome 启动成功并跑完 21 项；验收方 2026-11-01 的启动失败记录与旧 18/0 证据都保留，不互相冒充。
- 原关卡、v2 输出、assets、旧 game/playtest 与上一版无差异；原有 4 条 floor09/floor11 失败未修、未跳过。

## 已关闭的验收问题

2026-10-31 T01-R：以下 5 项均已修复并通过独立复验，表内描述是修复前的问题；详见 [复验结论](docs/checks/review-T01R-2026-10-31.md)。

| ID | 优先级 | 复现与影响 |
|---|---|---|
| R1 | P1 | 未知对象额外字段在 decode 时无提示丢失；encode 后重开 HASH_MISMATCH；未来 schema 被 encode 降级 |
| R2 | P1 | 迁移输入输出同目录时先覆盖源文件，后报错；需写前检查路径与冲突 |
| R3 | P2 | 认证与当前 rules 都缺版本/指纹时，publish 校验错误地通过 |
| R4 | P1 | 80 个未知格只保留 64 个；旧未知对象额外字段和路径引用被删除 |
| R5 | P2 | encode 可成功导出超过自身导入上限的文件，随后无法重新打开 |

## T01-R 修复结果（已复验）

- **R1**：`decode`/`encode`/`hash` 统一走 `LevelData.project()`；未知顶层/对象/路径/子字段保留并进入 hash；`encode` 与 `decode` 都拒绝非 2 的 schema；`encode` 写后回读自检。复现脚本：`decodedBehavior` 保留、`reopenOk=true`、v3 导出被拒。
- **R2**：迁移改为“先规划后写入”，写入前检查同目录、大小写/别名、输出 id 碰撞、报告/源文件冲突；已有输出内容不同默认报冲突，`--force` 才覆盖；失败不写任何文件。复现脚本：`sourceChanged=false`、退出码 `1`。
- **R3**：认证与当前 rules 的版本/指纹先分别验证非空字符串再比较；`completedAt` 校验 ISO8601 带时区。复现脚本：`errorCount` 从 0 变 3。
- **R4**：未知格/旧实体不再截断（超容量明确 `LIMIT_EXCEEDED`）；旧对象额外字段、`pathId`/`legacyPathId`、`legacyType`、`legacyId`、旧注释与未识别顶层字段均保留；迁移后草稿必须可保存。
- **R5**：`encode` 按 UTF-8 实际字节数检查总上限，超限 `LIMIT_EXCEEDED`，不再导出打不开的文件。
- 附带修正：`decode` 的同一条警告不再重复出现（有断言）。

非阻塞 N01：自定义报告父目录不存在时，规划通过但写报告 ENOENT，可能已有新输出；源文件保持不变。暂先创建报告目录；不能把工具描述成任意 I/O 失败都零写入。独立维护项为报告路径预检/准备及准确失败清单，不阻塞 T02A 调用共用数据模块。

新增回归：`tools/test_t01r.mjs`（98 项，R2 路径冲突全部使用系统临时目录）。`tools/test_leveldata.mjs` 的“断路径”断言按新契约拆分（草稿可存、试玩拒绝），旧断言不是被跳过而是被替换并说明原因。

具体改动：`js/level-data.js`、`js/legacy-import.js`、`tools/migrate_levels.mjs`、`tools/test_leveldata.mjs`、`tools/test_all.mjs`，以及重生成的 [迁移报告](docs/checks/T01-legacy-migration.md)。

原编辑器“保存即改旧池”链路已经由 T02A 移除。其他原型限制仍在：游戏旧池未验证可抽选、旧种子受池排序/内容影响、主游戏与旧试玩分叉、浮石立即消失。这些分别由后续卡处理，不混入当前修复。

## 下一步

1. 复验 T02A-R：按 [交付记录](docs/checks/T02A-R-2026-11-01.md) 检查 A1～A3 与完整 JSON 往返，可重跑 `node tools/test_editor.mjs`、`node tools/test_all.mjs`、`node tools/browser_t02a_r.mjs`。
2. 复验通过后再做 T02B（IndexedDB 草稿、revision 冲突、保存状态 UI），注意保存期间继续编辑不能误清 dirty；发布与正式试玩仍留 T03/T04/T06。
3. 之后按 T03/T04 进入共用会话与连续世界；保持 PC 短塔 → 安卓 → 完整内容的顺序。

尚未确认的接缝规格、光环半径、无敌时间、Boss 节奏等提案继续见设计决定，不因本次代码修复自动转成用户要求。

美术可先独立整理和替换已映射地块，具体路径、角色注册与生成器/测试限制见 [美术接入说明](docs/art/asset-integration.md)。不把素材系统与 T02A-R 合并实施。
