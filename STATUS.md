# 当前状态

更新：2026-11-08（独立验收后）。**六图短塔主体按用户人工反馈通过，R1石块管壁关闭；R2上穿云板时侧移穿墙仍未通过，下一步仅实施18号卡。** 独立16组输入全部复现穿入上层实心，8组可整身进入；完整自检1446/4、退出1，四条仍为旧诊断。仅PC、不构建APK；Android仍0.3.2，编辑器R3/R4与认证发布继续后置。见 [复验报告](docs/checks/review-B4R1-2026-11-08.md)、[18号卡](docs/tasks/18-cloud-side-collision.md)。

## 2026-11-08 本轮验收

验收HEAD `9219fc3` / 实现`7fff152`。用户报告短塔逻辑正常，不扩写成逐项录屏或认证；主体流程不重做。R2根因之一是FloorView仍只查询当前层，漏掉尚未正式入层的上层start侧支撑；另有origin.y=-2000/TS45与round转换不一致。证据与修复接口见 [设计](docs/design/cloud-side-collision.md)。独立浏览器DevTools未启动、退出1；交付方12/0保留，不冒充动态画面重现。本轮未改运行代码/地图/www/APK，仅证据、设计、18号卡及文档，未提交推送。

## 版本与回退基线

### 2026-11-07 B4首轮独立验收（历史）

验收HEAD `4b997df` / B4实现`dfbe10d`。独立完整自检1434/4、退出1；四条仍是旧floor09/floor11。新增探针复现R1～R4；独立浏览器DevTools未启动、退出1，交付方24/0证据原样保留，不冒充复现。用户已实际报告穿墙和管道问题，故B4暂不通过。详见 [报告](docs/checks/review-B4-2026-11-07.md)。本轮只新增证据、固定地图原字节副本、设计和17号卡及文档；游戏代码/运行地图/www/APK未改，未提交推送。

用户新地图来自“开发示例关卡”；level0有两个裸x使JSON不合法，定位(9,19)/(10,19)；boss底部start=(1,20)、无顶部出口。源件已原样保留，运行转换待实现。明确链路及字段见 [新设计](docs/design/short-tower-fixed-scenes-and-collision.md)。这属于新增确认需求，不追溯指责原交付未实现大厅F。

随后用户新增rest_level.json并明确先短塔/编辑器后置；原字节副本已保留在同一source-fixed目录。19×24，候选start=(13,18)、finish=(1,8)的内存几何检查无错误，自报hash匹配；见 [审计](docs/checks/rest-map-2026-11-07.json)。仅备份/方案调整，未接运行、未人工实走；原1434/4仍是最近一次完整自检，本次纯文档/原件备份未重跑游戏测试。

- T00 原型基线：`f56cdce`；T01 实现：`6a7e712`；T01-R 修复：`c7c5490`；T02A 交付：`f2a0e07`；T02A-R 修复：`6f88127`；B1/A3-C：`cc3df4a`；B1 主体：`fffaee0`；B1 文档/证据：`205d63c`；B1-R1 修复：`9f2a4e3`；B2 交付：`9a17f99`；B2-R1：`71e3219`；B3：`43fd30b`；B3-R1：`5dc5fb2`；B3-R2：`61a0b2d`；**B4：`dfbe10d`、B4-R1：`7fff152`、B4-R2：`eba80a6`**。
- B2 开始前 HEAD `cdd7b54`；本轮新增短塔/规则/对象/Boss/编辑发布与模板，原图、素材、`levels/v2`、`levels/levels.js`、旧 game/playtest 未改。
- 本轮未推送远程；开始时无关 ZIP 保留。
- 已有本地 Git，origin 为 `git@github.com:yanfei728/reverse_abyss.git`；不要重复初始化，不丢弃他人未提交内容。
- 原图、`levels/v2`、`levels/levels.js`、assets、旧 game/playtest 对照 B1 起点 `ebd5b80` 无差异；开发样例只新增在 `levels/dev/`。
- 开始时未跟踪的无关 ZIP 原样保留，没有恢复或处理；没有再次初始化 Git。

## 任务状态

| 任务 | 状态 | 说明 |
|---|---|---|
| 需求、设计与任务卡 | 已完成当前轮整理 | 规则可在后续讨论中更新 |
| **B4-R1短塔主体** | **用户人工反馈流程通过；R2未关闭** | 六图/F/休整/Boss流程和R1石块保留；不重做17号卡 |
| **B4-R2碰撞（当前）** | **PC 已修复，待人工复测** | `test_b4r2` 21/0、`browser_b4r1` 13/0；六图/F/休整/Boss 保留；仅PC、无APK |
| B4编辑器后续 | 用户明确后置 | R3开发试玩、R4安全裁剪及标准认证发布待补；不阻塞本轮固定短塔验收 |
| B1 | 工程验收通过 | [独立复验](docs/checks/review-B1R1-2026-11-06.md)；B1-R1 与 N02 已关闭 |
| **B2 / B2-R1** | **工程与短塔游玩通过；发布人工待补** | [独立复验](docs/checks/review-B2R1-2026-11-06.md)；R1～R3 关闭，不重做；不伪造制作发布通过 |
| **B3 / B3-R2** | **工程与本轮安卓人工验收通过；专项记录待补** | [最新复验](docs/checks/review-B3R2-2026-11-06.md)；0.3.2 / R4 关闭；文件与 PC 人工发布待补 |
| T00 | 已验收 | 可回退基线和检查记录存在；浏览器人工检查未测 |
| T01 | 数据层验收通过 | 编解码、参数描述、12 图迁移、测试接入；不代表编辑器与运行时接入完成 |
| T01-R | **R1～R5 复验通过** | [独立复验报告](docs/checks/review-T01R-2026-10-31.md)；N01 为非阻塞工具限制 |
| T02A | 已交付 | 数据模型与 JSON 往返；A1～A3 已修，见 [T02A-R 交付记录](docs/checks/T02A-R-2026-11-01.md) |
| T02A-R | A1/A2/A3-C 已通过 | 11-06 独立重跑容量探针通过；[探针](docs/checks/B1-A3C-probe.json) |
| T02B | **已并入 B1 交付** | IndexedDB 草稿 save/load/list、revision 冲突、保存状态 |
| T03/T04（B1 子集） | **已并入 B1 交付** | 共用 GameSession、可变宽高连续两层、开发试玩；完整端口工具/战斗仍留后续 |
| T05～T08 | **已并入 B2 交付** | 生命/光环/六类对象/休整/Boss/编辑发布 |
| T09～T10 | **已并入 B3** | 触控/布局/生命周期/JSON/离线包；本轮人工通过，文件等专项待补 |

## 当前实现事实

- 已有：原型移动/碰撞/机关/画图交互；LevelData/LevelCodec、EntityRegistry、LegacyImport、迁移工具；编辑器完整 LevelData（T02A）。
- B1 新增：IndexedDB 草稿（保存/列表/打开/revision 冲突/失败；刷新可找回）、共用 GameSession（固定步/暂停/动作）、World（可变宽高/偏置接口/active-preview-snapshot）、编辑层 + 样例 B 的两层开发试玩。
- B1-R1 新增：工作区令牌 + 保存上下文核对（旧回包不绑定新图）、草稿读取请求序号 + 起始 hash（旧读取不覆盖新工作）、试玩保存后令牌/dirty/hash 一致性检查与规范 handoff；N02 重开清遮罩/输入/帧时间并重载角色图。
- B1 的连续规则：同一玩家跨层不重建；脚底过线一次只提交一次；底边梯板防回落；下一层预热 `activeTime=0`；上一层地形保留到再上一层才释放。
- 原始 12 张图仍在 levels/，未修改；levels/v2/ 仍是未认证迁移草稿（ports=null）；levels/dev/ 是新的未认证开发样例，不进正式池。
- 默认 `index.html` 已接 B2 短塔；旧镜像/淡出换层原型明确保存在 `legacy.html`（历史入口）。B1 入口仍是 devplay.html。
- B2 新增：短塔入口 `short.html`、生命/无敌/光环/RunState、六类对象运行时、休整、两阶段 Boss、接口/对象/路径编辑、standard-v1 标准试玩、本地发布库/TowerPlanner/正式抽选；B2-R1 修默认入口、上层对象坐标与标准技能。
- 正式池只存在当前浏览器；当前干净环境没有已认证发布内容,开发短塔使用 `levels/b2/` 未认证模板。规则升 `b2-2` 后旧 `b2-1` 认证失效,需重新实际标准试玩;不冒充 passed。
- B3 新增：`js/platform/*`（ActionInput/ControlLayout/PlatformFiles/PlatformLifecycle）、`short.html` 触控/布局/导入导出、`www/` 离线包、Capacitor 7 Android 工程、debug APK；不复制 Core/物理。
- OPD2101 / Android 11 的 0.3.1 启动裁切已由 0.3.2 修复；用户确认本轮人工验收没有问题。系统文件/PC 往返及未逐项记录的通关、锁屏/性能等专项继续待补。正式签名/商店发布未做。
- 未实现：40 层扩展、遗物/NPC/联网、完整美术；旧 floor09/floor11 诊断仍在。
- B2-R1 交付方 Chrome headless 25/0；本轮独立 DevTools 未启动。PC 短塔与本轮安卓人工反馈通过；标准发布链路与性能测量仍未完成。

## B4-R2 云板侧边穿墙修复（当前交付）

2026-11-08 交付，详见 [记录](docs/checks/B4R2-2026-11-08.md)。原16种接缝输入全部复现上层侧实心相交；修复后 `test_b4r2` **20/0**、`browser_b4r1` **13/0**、`test_b4r1` 12/0、`test_b4` 14/0；完整 **1467 PASS / 4 FAIL**（仍 floor09/floor11）。

- `FloorInstance.otherStaticAt` 以世界像素查询当前/preview/前一层静态地形；上层 start 侧支撑进入整个玩家碰撞盒。
- 大厅→第1层布局原点改为 `-2025 = -45×TS`，消除 -2000/45 的 round 邻行误差；move/blockedAt/standingOn 使用同一适配。
- 云板仍单向；石墙四向；未改地图/物理/玩家尺寸；正常穿管不传送/不重建 Player。
- 六图/F/休整一次回血/Boss 中心10.5/14.5 无finish/死亡重试保持；R1 石块外观保留。
- 规则 `b4-3`/`collision=world-v3`；旧认证不伪造新 passed。
- **无新 APK**；Android 0.3.2 不含 B4；R3/R4/认证发布后置。
- **未验**：用户左右/半身穿板再横移/松跳/回落的手感与画面、相机/接缝/性能；不把 Node 探针当人工通过。

## B3-R2 独立验收（已通过）

验收 HEAD `19a26dd`、实现 `61a0b2d`。独立完整自检 **1415 PASS / 4 FAIL，退出码 1**（B3 60/0），4 条仍为 floor09/floor11 旧诊断。0.3.2 APK 4,553,627 bytes，SHA-256 与交付一致，抽查 4 项包内文件匹配源码/www，独立验签退出 0。本轮浏览器 DevTools 未启动，交付方 47/0 与 R1 回归 35/0 保留，不冒充独立重现。

用户确认本轮人工验收没有问题，**14 号卡与 R4 关闭，安卓 0.3.2 本轮验收通过**。反馈沿用 OPD2101 / Android 11 上下文，没有补造未提供的逐项操作、WebView 版本、完整通关或系统文件记录。用户建议隐藏摇杆，让手指不离屏即可改变平移方向，明确“等之后改”；已记录 Q05，未实施、未排为新门槛。

见 [报告](docs/checks/review-B3R2-2026-11-06.md)、[后续待办](docs/design/followups.md)。当时仅增加独立证据与同步文档，未改游戏/地图/素材/www/APK、未构建或提交推送；当时没有新实现卡。2026-11-07 用户新增 B4 接口与三图任务，当前以本文开头及 15 号卡为准。

## B3-R2 修复交付记录（历史，用户现已验收通过）

2026-11-06 B3-R2 交付，详见 [记录](docs/checks/B3-R2-2026-11-06.md)。实测：`test_b3` **60/0**；完整 **1415/4**（引擎 606/4，其余全绿）；`browser_b3r2` **47/0**（960×540/800×360/960×600、DPR1/2/3、屏幕坐标点击、短屏面板、基础回退、离线 www）；`browser_b3` 35/0（R1 回归）。4 条仍是 floor09/floor11 旧诊断。

- **原因**：旧 overlay 只用 `inset:0`、wrap 只靠 `aspect-ratio/min()`，无基础回退；不支持 inset 的 WebView 会把菜单/设置放到底部。实际 WebView 版本未知，不把假设写成已确证根因。
- **修复**：显式 top/right/bottom/left + overflow/max-height；JS 用 innerWidth/innerHeight 算 16:9 的 px wrap；canvas backing store 独立 DPR；短屏压缩/滚动；安全区 @supports 增强；fatal overlay + `RA.short.diagnostics()`。
- APK：0.3.2/versionCode 5，4,553,627 bytes，SHA-256 `6DFDAE1D8081A8AF95D4E572E81294D54F96461860673ADCD3CC170E802A502E`；debug 验签 0，包内 HTML/JS 与 www 一致；0.3.0/0.3.1 保留。
- **未复测**：本机无设备/模拟器；OPD2101/Android 11 未装 0.3.2。真机冷启动/短屏/布局/系统文件/完整短塔/性能待验。
- 建议用户覆盖安装 0.3.2（同 applicationId/debug 签名；不卸载以保数据），按 [14 号卡](docs/tasks/14-b3-android-viewport-fix.md) 最短顺序复测。

## B3-R1 独立复验与真机启动失败（历史，R4 已由 B3-R2 关闭）

验收 HEAD `c7553c7`、实现 `5dc5fb2`。独立完整自检 **1415 PASS / 4 FAIL，退出码 1**（B3 60/0）；4 条仍为 floor09/floor11 旧诊断。原探针退出 **0**，R1 多触点全抬不粘键、R2 当前认证持久化后可入池、R3 未知草稿保真均关闭。APK 4,552,177 bytes，SHA-256 与交付一致，8 项包内文件对照相符，独立验签退出 0。本轮浏览器 DevTools 未启动，交付方 35/0 保留，未冒充独立重现。

用户随后实际安装 **B3 0.3.1**，设备 **OPD2101 / Android 11 / 高通骁龙 870 八核**：未打开布局时大厅标题只在屏幕底部露出；打开布局后触控按钮出现，设置面板仍被底部裁切，看不到角色/地图，无法正常游玩。记录为 **R4 / P1**，不是美术质量问题。实际 WebView 版本未知；无回退的 inset/aspect-ratio、容器尺寸与短屏溢出是优先排查方向，尚未确证根因。

详见 [报告与截图](docs/checks/review-B3R1-2026-11-06.md)、[B3-R2 卡](docs/tasks/14-b3-android-viewport-fix.md)。本轮仅做复验、需求/方案/任务卡与文档，未改游戏/APK、未构建或提交推送。下一步集中修入口与画面、补真实屏幕坐标启动/可见性检查并交付新 APK，再由用户同设备复测；完整短塔/系统文件与 PC 人工认证仍待补。

## B3 首轮独立验收（历史，R1～R3 已由 B3-R1 关闭）

验收 HEAD `9f4b097`、实现 `43fd30b`。独立完整自检 **1400 PASS / 4 FAIL，退出码 1**（B3 45/0），4 条仍为 floor09/floor11 旧诊断。补充探针退出 1，复现：

- **R1 / P1**：同一个左按钮 down(11)/down(12)/up(11)/up(12) 后 sources=1、left=true，全部松手仍移动；按钮只记录最后一个 source。
- **R2 / P1**：同 hash 的旧规则 passed 声明被保留；重导入当前声明返回 eligible=true，但库内仍旧规则，明确加入池失败 CERT_REQUIRED。
- **R3 / P2**：未知对象草稿 draft 校验无错误，却被 importLevel 的 play 校验拒绝，未保存。需保真草稿、单独阻止运行/发布。

APK 独立验签退出 0，4,581,590 bytes、SHA-256 与交付一致，包内抽查 8 项与当前对应代码一致；包本身也含待修逻辑。本轮独立 DevTools 未启动，交付方 Chrome 25/0 原证据保留，不冒充重现。用户明确尚未安装真机，PC 认证发布与手机文件真实往返未验。

详见 [报告](docs/checks/review-B3-2026-11-06.md)、[探针](docs/checks/review-B3-2026-11-06-probes.json)、[APK 对照](docs/checks/review-B3-2026-11-06-apk.json)。本轮仅新增证据、收尾卡与文档，未改游戏/地图/素材/APK，未安装或构建，未提交推送。下一步一次完成 13 号卡并重新打包，再集中复验与真机测试。

## B2-R1 独立复验（已通过，历史环境描述）

验收 HEAD `df008b4`、修复 `71e3219`。完整自检独立 **1355 PASS / 4 FAIL，退出码 1**；B2 96/0，4 条仍为旧 floor09/floor11。独立探针退出 0：原点/上层门、浮石预警/消失/占位恢复、火球伤害一致，标准 CD 归零后可施法。**R1～R3 关闭，工程验收通过**。见 [复验报告](docs/checks/review-B2R1-2026-11-06.md)。

用户本轮人工测试短塔“基本正常”，明确允许美术粗糙、缺音效、AI 地图质量和 Boss 技能后续打磨；已入 [非阻塞待办](docs/design/followups.md)。没有把这些项升级为新修复门槛，也未声称所有关卡/边界或完整通关记录已齐全。

用户明确未做标准通关→认证写回→发布→正式实抽，保留人工待验，不生成 passed。B3 的独立平台/触控适配可先推进；正式内容与认证文件往返验收前补齐真实认证样本。当前无 APK；PATH 有 Node/npm/Java、JAVA_HOME 路径存在，adb 不在 PATH、SDK 变量未设，尚不能断言 SDK 未安装或构建可用。

本轮仅写独立证据、文档、B3 任务方案，未改游戏代码/地图/素材，未安装工具链，未提交推送。原图/v2/素材/旧 game/playtest 保留。

## B2-R1 修复交付记录（历史）

B2-R1 已交付，待集中复验；原 B2 主体保留。修复后实测：完整 **1355 PASS / 4 FAIL，退出码 1**（引擎 606/4,其余全绿）,4 条仍是 floor09/floor11 旧诊断；`test_b2` **96/0**；真实 Chrome headless **25/0**；reviewer 修复后探针新运行时门/浮石/火球/恢复在原点与上层一致，标准 CD 后 `castAfterCooldown=true`。详见 [B2-R1 记录](docs/checks/B2-R1-2026-11-06.md)。

- **R1 / P1**：`index.html` 默认自动进 `short.html`，旧原型完整移到 `legacy.html` 并在入口明确标注历史；编辑器/devplay 的返回路径落到当前短塔。
- **R2 / P1**：`updateActiveObjects/playerOverlap` 统一把 Player 世界坐标转为实例局部再比较；门/浮石/弹簧/火球/地刺/齿轮在非零原点上层正常。浮石 0.5s 预警/1.6s 消失/占位延后恢复、暂停冻结；normal-1/2/3 去掉遮挡并重生成。
- **R3 / P2**：`standard-v1` 改为初始无活动光环、剩余 CD 20 秒、之后可施法;页面 K 接同一 Session,HUD/光环可见;规则升 `b2-2`,旧认证失效需重新通关。
- 新增正常固定步跨层后的上层对象回归;不是只改 floorIndex/只调对象更新。原 B2 的 78/0、1334/4、23/0 证据保留为历史,不覆盖。
- **待人工**：作者/用户实际标准通关→写回→发布→正式抽选、完整短塔/Boss 真人通关;自动化不代打、不生成 passed。

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

最新独立复验：完整自检仍为 **1143/4、退出码 1**，原场景已修，普通确认缩图可导出/重开。新增容量场景显示接口备份会超过扩展上限（A3-C）；Chrome/Edge 本轮未启动 DevTools，不宣称重现交付方 21/0。见 [本轮报告](docs/checks/review-T02AR-2026-11-01.md) 与 [容量复现](docs/checks/review-T02AR-2026-11-01-resize.json)。以下表格保留交付时记录。

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

## B1 交付（待复验）

2026-11-04 B1 一次接通，详见 [B1 交付记录](docs/checks/B1-2026-11-04.md)。实际结果：

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_editor.mjs` | **225 PASS / 0 FAIL**（草稿保存/恢复/冲突/失败/保存期间编辑、A3-C、开发试玩交接） | `0` |
| `node tools/test_world_session.mjs` | **41 PASS / 0 FAIL**（四层生命周期、跨层、预热、暂停、样例同步） | `0` |
| `node tools/test_all.mjs` | **1224 PASS / 4 FAIL**（引擎 595/4、编辑器 225/0、贴图 126/0、数据 139/0、修复自检 98/0、世界/会话 41/0） | `1` |
| `node tools/browser_b1.mjs` | **21 PASS / 0 FAIL**（Chrome 156 headless；编辑保存→刷新恢复→键盘跨层→暂停恢复） | `0` |
| `node docs/checks/B1-A3C-probe.mjs` | A3-C 容量场景按预期失败、原图保留 | `0` |
| `node tools/sync_dev_levels.mjs --check` | 开发样例已同步 | `0` |

- **A3-C**：`resizeCandidate` 在完整副本上缩图/追加备份/共享 encode，容量不足返回 `LIMIT_EXCEEDED`，原模型/端口/extensions/历史/dirty/视角零变更；原文件仍可导出。
- **草稿**：IndexedDB `save/load/list`、revision 冲突、失败不覆盖；保存按发起快照，保存期间编辑不清新 dirty；浏览器刷新后找回。
- **运行时**：`GameSession` 固定 1/60 步、暂停冻结、恢复不追算；`World` 支持不同宽高/偏置接口、active/preview/snapshot、n−1 释放、底边梯板防回落、一次越线一事件。
- **开发试玩**：编辑器按钮先 play 校验、自动保存草稿、交接给 `devplay.html`；不合法接口明确拒绝；直接打开 devplay 用内置 A+B。
- **开发样例**：`levels/dev/floor-a.json` / `floor-b.json`，未认证、不进 `levels/levels.js` 或正式池。
- 浏览器证据：截图 [保存后](docs/checks/b1-browser-editor-saved.png)、[恢复后](docs/checks/b1-browser-editor-restored.png)、[试玩开始](docs/checks/b1-browser-devplay-start.png)、[跨层](docs/checks/b1-browser-devplay-floor2.png)、[暂停](docs/checks/b1-browser-devplay-paused.png)，逐项结果 [browser-b1-2026-11-04.json](docs/checks/browser-b1-2026-11-04.json)。
- 未做/未测：战斗/敌人/技能/Boss、发布认证、端口编辑、安卓/触屏、真实手感；草稿冲突只有 Node 双实例，文件选择对话框未自动点击；floor09/floor11 旧失败未修。

## B1-R1 修复（待复验）

2026-11-06 修复异步保存/读取/试玩上下文与 N02，详见 [B1-R1 交付记录](docs/checks/B1-R1-2026-11-06.md)。

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_b1r.mjs` | **24 PASS / 0 FAIL**（R1a/R1b/R1c/R1d、正常 handoff、N02） | `0` |
| `node tools/test_all.mjs` | **1248 PASS / 4 FAIL**（引擎 595/4、编辑器 225/0、贴图 126/0、数据 139/0、修复 98/0、世界/会话 41/0、B1-R1 24/0） | `1` |
| `node tools/browser_b1.mjs` | **25 PASS / 0 FAIL**（Chrome 156 headless；新增暂停菜单重开遮罩） | `0` |
| 修复后独立探针 | 三场景 + N02 全部符合预期，退出 0 | `0` |

- **R1a**：试玩自动保存期间编辑 → 不导航、dirty/新改动保留、不写 handoff；保存失败/切换图也不离开。
- **R1b**：保存 A 期间切到 B → 旧回包返回 false，不绑定 B；A 记录完整，B 保存后有独立草稿。
- **R1c/R1d**：读取期间编辑或切图 → 过期回包不替换；两个读取乱序时后选草稿生效。
- **一致性**：试玩 handoff 使用刚保存的规范快照并再跑 play 校验，内容与草稿一致。
- **N02**：暂停菜单重开隐藏遮罩、清输入/帧时间、新玩家仍加载角色图。
- 证据：[异步自检](docs/checks/B1R1-test_all.txt)、[浏览器日志](docs/checks/B1-browser.txt)、[修复后探针](docs/checks/B1R1-postfix-probes.json)、[原验收探针（保留）](docs/checks/review-B1-2026-11-06-probes.json)。
- 未测：真实双窗口并发、系统文件对话框、手感/安卓/性能；原 floor09/floor11 四条旧失败未修。

## B2 交付（历史，B2-R1 已取代）

2026-11-06 B2 批内连续完成，详见 [B2 交付记录](docs/checks/B2-2026-11-06.md)。以下 78/0、1334/4、23/0 是 R1 前证据，保留原文；当前数字见上方 B2-R1。

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_b2.mjs` | **78 PASS / 0 FAIL**（生命/光环/六类对象/休整/Boss/抽选/发布/编辑工具） | 0 |
| `node tools/test_editor.mjs` | **225 PASS / 0 FAIL** | 0 |
| `node tools/test_all.mjs` | **1334 PASS / 4 FAIL**（引擎 603/4、编辑器 225/0、贴图 126/0、数据 139/0、修复 98/0、世界/会话 41/0、B1-R1 24/0、B2 78/0） | 1 |
| `node tools/browser_b2.mjs` | **23 PASS / 0 FAIL**（Chrome headless；短塔/光环/暂停/跨层/死亡重试/编辑器工具/标准页） | 0 |
| `node tools/sync_b2_levels.mjs --check` | 6 层模板已同步 | 0 |

- 短塔 `short.html`：大厅→3 普通层→休整→两阶段 Boss；开发短塔用 `levels/b2` 未认证模板；正式短塔只从本地已认证发布池抽。
- 战斗：100 血、接触 20、1 秒无敌；光环 14/20 秒、跨层/暂停规则；六类对象实际运行；死亡/异常越界回大厅并重试同一塔。
- Boss：两阶段、三种预警攻击、exposed 停攻清场、单次 cast 只掉一阶段、命中消耗光环不重置冷却、出口关闭到击败。
- 编辑/发布：接口、对象参数、路径点/loop/pingpong；standard-v1 标准试玩从生成入口真实过关；认证写回草稿不自动发布；发布库校验回执/规则/revision；TowerPlanner 仅抽已认证普通层。
- **标准试玩人工通关和正式池实抽尚未完成**：当前干净环境正式池为空；自动化不代打、不生成 passed。开发模板/数值需人工调参。
- 浏览器证据：[日志](docs/checks/B2-browser.txt)、[逐项结果](docs/checks/browser-b2-2026-11-06.json)、五张截图（短塔开始/第2层/重试/编辑器工具/标准页）。
- 未测：完整真人短塔通关、人工认证、安卓/触控/性能、真实双窗口/文件对话框；旧 floor09/floor11 诊断仍在。

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

## B1 独立验收（2026-11-06）

完整自检独立复跑为 **1224 PASS / 4 FAIL，退出码 1**，仍为 floor09/floor11 旧诊断；A3-C 探针通过，原图/v2/素材/旧 game/playtest 对比 B1 起点无差异。普通草稿保存恢复、连续世界与暂停主体成立。

新增确定性异步探针复现 **B1-R1（P1）**：试玩自动保存期间编辑，仍带未保存新内容离开；保存 A 期间切换 B，旧回调将 B 绑定回 A，后续保存覆盖 A；读取草稿期间编辑，回包覆盖新工作并清 dirty。三个场景作为一组修复，一次交付。**N02 非阻塞**：暂停菜单重开后遮罩不消失，可顺手修。

本轮 Chrome/Edge 均未启动 DevTools，退出码 1；交付方的 21/0 与原截图保留，不算本轮重现。人工仅查看交付跨层截图，未测真实手感、安卓或性能。证据：[报告](docs/checks/review-B1-2026-11-06.md)、[完整输出](docs/checks/review-B1-2026-11-06-test_all.txt)、[异步复现](docs/checks/review-B1-2026-11-06-probes.json)、[浏览器日志](docs/checks/review-B1-2026-11-06-browser.txt)。

## B1-R1 独立复验（已通过）

验收 HEAD `cdd7b54`。完整自检独立复跑为 **1248 PASS / 4 FAIL，退出码 1**；4 条仍是旧 floor09/floor11 诊断。原三种异步场景独立复跑全部符合预期，N02 遮罩已隐藏；新增异步回归 24/0（含读取乱序与正常 handoff 一致性）。**B1-R1 / N02 关闭，B1 工程验收通过。**

本轮 Chrome/Edge 未启动 DevTools，不声称重现交付方 25/0；真实双窗口、文件对话框、手感/安卓/性能未测。原图/v2/素材/旧 game/playtest 对比 B1 起点无差异；原证据保留。见 [复验报告](docs/checks/review-B1R1-2026-11-06.md)、[自检](docs/checks/review-B1R1-2026-11-06-test_all.txt)、[场景](docs/checks/review-B1R1-2026-11-06-probes.json)。

异常越界判死亡、回大厅后重新挑战同一塔已实现；B1 的无伤本层 respawn 已被替换。

## B3-R1 修复交付记录（历史，独立结论见上）

2026-11-06 B3-R1 交付，详见 [记录](docs/checks/B3-R1-2026-11-06.md)。实测：`test_b3` **60/0**；完整 **1415/4**（引擎 606/4，其余全绿）；`browser_b3` **35/0**（实际 PointerEvent 同按钮多指/cancel/无关 id、IndexedDB 重认证读回、布局/离线 www）；修复后 reviewer 探针退出 0。4 条仍是 floor09/floor11 旧诊断。

- **R1**：每按钮 pointerId→source Map，up/cancel/lost/leave 只释放对应触点；后台/暂停/菜单清来源与视觉；布局拖动锁定 pointer。实际 DOM 两指两种顺序、全抬无粘键。
- **R2**：认证比较完整 profile/hash/rules/publish；同 hash 当前认证原子更新旧声明，返回实际 revision；读/写/冲突失败不改草稿；旧声明不覆盖当前有效认证；浏览器 IndexedDB 重启读回。
- **R3**：导入持久化改用 draft 门槛；未知对象/断引用/ports=null 原样保存为 `runnable:false` 草稿，play/publish issues 明确；坏 JSON/结构错误仍拒绝。
- APK：新版 `docs/checks/B3-reverse-abyss-0.3.1-debug.apk`，4,552,177 bytes，SHA-256 `23EDEC3DF31F357896B1D15D1999B0F3D10A35B03E587D05B78A7DBF294BCC1C`，versionCode 4/0.3.1，debug 验签 0；旧 0.3.0 保留。
- **未安装**：无 adb 设备/模拟器；真机未冷启动/多指/锁屏/返回/文件选择/分享/性能。正式签名/商店发布未做。

## B3 平台壳与 APK（原交付记录，已被 B3-R1 取代）

2026-11-06 B3 平台壳交付，详见 [B3 记录](docs/checks/B3-2026-11-06.md) 与 [工具链](docs/checks/B3-toolchain.md)。实测：`test_b3` **45/0**；完整 **1400/4**（引擎 606/4，其余全绿）；`browser_b3` **25/0**（移动视口/多来源触控/布局/暂停/返回/离线 www）。4 条仍是 floor09/floor11 旧诊断。

- 离线包：`www/` 只含短塔运行文件；Capacitor 7.6.10 锁定（core/android/cli）、App 7.1.2、Filesystem 7.1.9、Share 7.0.4；目标/编译 35、Gradle 8.11.1、JDK21。
- APK：`docs/checks/B3-reverse-abyss-0.3.0-debug.apk`，4,581,590 bytes，SHA-256 `76FE73C2A25F940F7C915FA97F602609FC55F7F1A6D5D098C4E294FB977AD663`；debug 证书，`apksigner verify` 0。
- **未安装**：本机无 adb 设备/模拟器；`adb install` 记录 no devices。真机未冷启动/多指/锁屏/文件选择/分享/性能。APK 不是商店发布版。
- JSON：`importLevel/publishImported` 保留草稿、来源 imported-declaration、旧规则不 eligible；UI 导入/导出已接。PC↔安卓真实文件往返未验。
- 标准人工通关/认证→发布→正式抽选仍未完成；没有真实认证文件，测试夹具不生成 passed。

## 下一步

1. 只实施 [18号卡](docs/tasks/18-cloud-side-collision.md)：用原16种输入补失败回归，统一世界静态碰撞与落脚坐标，修上穿时侧移穿墙；17号卡主体不重做。
2. 修复后实测四条连接的左右斜跳/半身穿板再横移，以及正常居中二段跳、回落落脚和暂停恢复；短塔流程做冒烟回归，不借此新增功能。
3. R2修好后再讨论下一批；编辑器R3/R4、标准认证发布、安卓/Q01～Q05/40层继续后置，本轮不构建APK，不伪造认证或真机记录。

尚未确认的接缝规格、光环半径、无敌时间、Boss 节奏等提案继续见设计决定，不因本次代码修复自动转成用户要求。

美术可先独立整理和替换已映射地块，具体路径、角色注册与生成器/测试限制见 [美术接入说明](docs/art/asset-integration.md)。B2 的 Boss/对象/界面仍是占位绘制，不是最终美术。
