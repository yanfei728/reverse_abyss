# reverse_abyss

一个以自定义关卡编辑器、向上跑酷和技能清场为核心的单机 2D 游戏，使用 HTML、CSS、原生 JavaScript 与 Canvas。

2026-11-09：**31号卡已实施，工程检查通过，待作者最短人工确认**。修复编辑器流星锤重复坐标偏移/离屏漏画、删除对象后的最后引用路径清理，并在设置加入精确 id/hash「移出浏览器发布池」。定向34/0、隔离Chrome37/0；编辑器266/0、手势13/0、30号卡95/0、完整塔98/0。b4-10/schema2/DBv3不变，R7–R14未提交修改保留；只PC，无新APK。见[31交付](docs/checks/B4R15-2026-11-09-editor-unpublish.md)。

[30号卡](docs/tasks/30-coins-archer-and-score.md)已实施：金币/弓箭手可画布直接放置，正式塔右上与胜负分数、设置唯一最高分。入1..40首次20（共800）/真击败5/金币10，Boss只最终一次；弓静止/2秒/170/本体和箭20/箭穿墙不跨层/光环只杀本体。试玩物件行为相同但完全无计分；只存一个最高值，无逐局历史。

[31号任务](docs/tasks/31-editor-visual-path-and-unpublish.md) / [设计](docs/design/editor-visual-path-and-unpublish.md)：只修编辑器流星锤一次坐标转换及可见包络、删对象时释放最后引用路线（共享/未知数据保真、一次撤销），并在设置加入按id/hash“移出浏览器发布池”。**已实现并通过隔离工程检查，待作者人工确认**；保留草稿/通过历史/磁盘JSON，builtin同版本需另移出normal源文件并sync，不改已开始清单。

移除普通关卡：磁盘内置JSON移出normal后运行`node tools/sync_levels.mjs`、刷新并新开；浏览器发布版本与文件独立，现在可在设置选择精确 id/hash 后点击「移出浏览器发布池」；取消不改池，失败保留选择，成功刷新列表和数量。删草稿或下载备份不影响published；旧塔重试仍原清单。详见[levels操作说明](levels/README.md)。

最短人工确认：放锤并缩放/平移 → 齿轮或移动火球画路线后擦除/撤销/重做/保存重开 → 设置移出指定发布版本并确认草稿仍在。内置同版本需另移出 normal 源 JSON 并同步；重试旧塔保留原清单。无需重走41层。

## 获取与安装

PC 端没有安装包，也没有 npm 运行依赖；取得整个项目文件夹，保留 `index.html`、`js/`、`css/`、`levels/`、`assets/` 的相对位置即可。安卓有可构建的 Capacitor 工程与 debug APK（非商店发布），构建依赖 Node/npm 与 Android SDK，见下文。

- 游玩：使用桌面浏览器，目前按键操作为主。
- 命令行检查：需要 Node.js；本次使用 Node.js `v24.21.0`。
- Android：Capacitor 7 工程与 debug APK `docs/checks/B3-reverse-abyss-0.3.2-debug.apk`（0.3.0/0.3.1 保留）；用户确认 0.3.2 安卓人工验收无问题。**B4 只在 PC，未打进 0.3.2**；本轮不构建新 APK。无正式签名/商店发布。

## 启动

### 最快启动

**双击根目录 index.html：进入唯一正式主界面 REVERSE ABYSS。** 首页只有「开始游戏」「退出游戏」，设置按钮在右下角；开始固定 0–40 共41槽。编辑器为 editor.html，试玩 trial.html；旧 legacy/short/standard/devplay 只单向跳 index，不再执行旧游戏。

编辑器现在的操作：旧「对象 / 参数 / 路径」表单已移除，对象/路线/自定义参数仍随 JSON 与草稿完整保存；齿轮用「路径齿轮」在画布上左键放点、连续左键加节点、右键完成，左栏工具区可选往返/闭合（只在选齿轮时出现），Esc 取消不留痕迹。主题按钮一次点击只切一次，刷新保留；主题只影响编辑器偏好，不改地图/hash/dirty/通过记录。试玩通过记录与导入声明采用同一内容绑定判定（技术版本只作记录）。**发布普通图前必须选 1–4 档难度**（1→1–9、2→11–19、3→21–29、4→31–39），改难度等于改内容，旧通过失效须重新试玩。

作者示例源件仍在只读 `开发示例关卡/`（原字节/裸 x 未改）。完整塔固定运行副本在 `levels/fixed/`（大厅 `b4_lobby`、休整 start(13,18)/finish(1,8)、Boss start(1,20)/无finish），补位在 `levels/fallback/test3.json`；`node tools/sync_full40_levels.mjs` 打包成 `js/full40-samples.js`，不要手改产物。

`file://` 与 HTTP 都读取生成的 `levels/levels.js`（只含四档 normal）+ `js/full40-samples.js`（固定/补位）。普通图放 `levels/normal/difficulty-1..4`，运行 `node tools/sync_levels.mjs`；编辑器导出只下载/写所选文件，不会自动落进仓库或发布。浏览器 published 与内置按 id/hash 合并；旧普通池与历史图在 `levels/archive/`，永不自动扫回。

### 本地 HTTP 启动（开发推荐）

在项目根目录启动一个静态文件服务器。例如，**安装并配置 Python 后**可在 PowerShell 执行：

```powershell
Set-Location 'C:\Users\beilu\Documents\blwork\reverse_abyss'
python -m http.server 8000 --bind 127.0.0.1
```

然后打开：

- 完整塔（默认入口）：<http://127.0.0.1:8000/index.html>
- 正式主界面（唯一入口）：<http://127.0.0.1:8000/index.html>
- 编辑器：<http://127.0.0.1:8000/editor.html>
- 独立试玩页（从编辑器发起；只有当前一张图，普通游玩初态）：<http://127.0.0.1:8000/trial.html>
- 浏览器检查页已退役，只跳 index；自动检查用 `tools/browser_29_menu.mjs` 等脚本
- 旧原型入口 legacy.html 只跳 index，不再运行旧菜单/旧游戏

在服务器终端按 `Ctrl+C` 停止。若端口被占用，换端口并同步修改网址。也可使用已有的静态服务器，无需同时安装多个工具。本次环境中 `python` 命令不可用，上述是可选启动说明，不是本次实测成功记录。

普通图同步命令只扫描四档 normal；无有效通过声明会跳过，档位/JSON/hash 错误会失败且不覆盖旧产物。空普通池合法，正式塔用 test3 补位。固定场景仍用 `sync_full40_levels.mjs`：

```powershell
node tools/sync_levels.mjs
```

这会生成 `levels/levels.js`，不是只读检查。不要手工编辑生成文件。HTTP 模式也不是自动枚举目录，新增文件仍需同步清单。

## 当前操作

| 操作 | 按键或入口 |
|---|---|
| 进入正式塔 | 打开 `index.html`，点「开始游戏」；设置右下角可种子重构/保存/导入/开编辑器 |
| 完整塔结构 | 0 大厅 → 1–9 普通 → 10 休整 → 11–19 普通 → 20 Boss → 21–29 普通 → 30 休整 → 31–39 普通 → 40 Boss |
| 移动 / 跳跃 | `A`/`D` 或左右方向键；`Space`/`W`/上方向键(可二段跳) |
| 光环技能 | `K`；持续 14 秒,从施放起冷却 20 秒,开局可用 |
| 大厅进入第1层 | 出生处提示“按 F 开始挑战”；按 `F` 一次传送到 1 层 start（同一玩家/HP/CD） |
| 20 Boss 后进入21 | 击败 20 层 Boss 后不胜利，提示“按 F 进入21层”；按 `F` 一次传送到 21 层 start |
| 40 Boss 胜利 | 击败 40 层全新 Boss 两阶段后完整塔通关；40 层没有下一层 |
| 暂停 / 恢复 | `P` 或 `Esc`；暂停冻结模拟 |
| 死亡 / 重试 | 回 0 层并重试同一份 41 槽清单;不会重新抽选、不读新池 |
| 编辑器工具 | `B` 画笔、`E` 橡皮、`R` 矩形、`F` 填充、`K` 吸管 |
| 编辑器齿轮 | 选「路径齿轮」→ 画布左键放下、连续左键按直角加节点、右键完成；左栏可选往返/闭合；`Esc` 取消 |
| 编辑器撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z`（整份 LevelData,对象/路线/元信息一起；齿轮一次事务只算一步） |
| 编辑器导出 JSON | `Ctrl+S` 或「导出 JSON」；只发起浏览器下载 |
| 编辑器打开 / 导入 | 「打开 JSON…」读 v2；「导入旧图…」把 TXT/旧 JSON 迁移成草稿 |
| 编辑器草稿 | 「保存草稿」写 IndexedDB；下拉选择后「打开草稿」；刷新后可找回 |
| 编辑器难度 | 发布普通图前选 1–4 档（1→1–9、2→11–19、3→21–29、4→31–39）；改难度会进入内容 hash，旧通过失效 |
| 编辑器主题 | 「◐ 深色/浅色」一次点击只切一次；刷新保留；不改地图/hash/dirty |
| 编辑器试玩 | 「▶ 试玩」保存草稿后进入 trial.html；只有当前一张图 start 出生、上穿 finish 结束；满血、技能开局可用 |
| 编辑器金币 / 弓箭手 | 调色板选「金币」「弓箭手」→ 画布左键直接放一个（可拖动连续放）；同格同类型幂等、不擦地形/机关/异类；无坐标/参数/路径表单 |
| 正式塔得分 | 右上角「得分」：首次进入1…40层各+20（共800）、真的击败敌对单位+5、拾取金币+10；死亡/胜利界面显示「本次得分」 |
| 历史最高分 | 首页右下「⚙ 设置」里只读显示，独立 key 只存一个最高值；破纪录才写，无逐局记录/日期/排行 |
| 试玩结果返回 | 结果页「返回编辑器(打开原草稿)」→ 自动打开该草稿最新 revision，可直接「发布」；保存中会等保存完成 |
| 试玩通过记录 / 发布 | 人工上穿 finish 后把通过记录写回草稿（绑定内容 hash、profile run-v1），再点「发布」才入本地正式池；几何/净空/可达性不再自动否决 |
| 正式池重置 | 本机该浏览器首次运行 25 号卡时一次性清空旧 published（同一 epoch 只清一次），保留草稿/通过历史/偏好；之后新发布保留 |
| 旧试玩页 | `standard.html`/`devplay.html` 只单向跳 `index.html`，不启动旧控制器 |
| 旧原型 | `legacy.html`/`short.html` 只跳 `index.html`；不再运行旧菜单/镜像/塔高 |

完整塔固定场景已有 Node 生命周期与交付方 Chrome 脚本证据，普通层连续路线本次人工失败，先修26号；六图短塔/F/休整/Boss、碰撞和齿轮仍保留作调试与历史回归。25号卡把正式入口改成 0–40：固定 10/30 休整、20/40 Boss 各自独立实例，20 击败后只停攻等 F、不提前胜利，40 才通关；普通层按四档分桶抽选，空池用 test3 补位。死亡回 0 层、重试同一份清单（不重抽）。草稿保存/JSON备份随时可用，下载不会自动入池或写进levels/。

25号原交付方用调试跳层检查固定场景，26号提供逐接缝浏览器fixture与Node连续1→6证据；这些脚本不等于真人全塔通关。**本次用户另行确认人工走完41层无问题**，25/26关闭。独立复测接口39/0、完整塔96/0、侧墙21/0、单图试玩12/0、试玩接线13/0；本次未重跑可见浏览器。详情见 [独立验收](docs/checks/review-B4R10-2026-11-09.md)。旧CD20/几何可达自动门槛仍取消，旧profile仅作历史记录。

## 安卓构建与安装

安卓工程只打包短塔运行文件，不打包编辑器/测试/文档。

```powershell
npm install --no-audit --no-fund
npm run build:android
# 本机已有 SDK 时:
$env:ANDROID_HOME='<Android SDK 路径>'
$env:JAVA_HOME='C:\Users\beilu\jdk21\jdk-21.0.12.1+1'
.\android\gradlew.bat -p android assembleDebug --console=plain --no-daemon "-Pandroid.builder.sdkDownload=false"
```

当前 Android 包：`docs/checks/B3-reverse-abyss-0.3.2-debug.apk`（versionCode 5，debug，非正式发布）；`0.3.0`/`0.3.1` 保留。**B4（含本轮23号卡修复）不在 0.3.2 包内**：本轮只把改动的 6 个运行脚本同步到 `www/js/` 以保证离线包还能跑，没有 `cap sync`、没有构建新 APK；`browser_b3r2` 回归 47/0（含离线 www）。PC 入口为 `short.html`/`editor.html`，离线 PC 包为 `www/`。校验值/版本/工具链见 [B3 工具链记录](docs/checks/B3-toolchain.md) 与 [B3-R2 记录](docs/checks/B3-R2-2026-11-06.md)。OPD2101 / Android 11 的本轮人工反馈通过；未单独记录的系统文件/锁屏等专项继续待补。

0.3.2 包含 B3-R2 的视口/基础 CSS/短屏修复，安卓人工验收通过；B4 未同步到 APK。0.3.0/0.3.1 原样保留。`assembleDebug` 的原始输出在 `android/app/build/outputs/apk/debug/app-debug.apk`，历史交付包不会被自动覆盖。覆盖安装时保留应用数据；基本操作仍为左右按钮、跳跃、K 技能与布局设置。PC 标准认证发布与真实文件往返仍待作者补实测记录。

## 检查方法

本轮以人工实际试玩为准，不要求全量关卡自检或可达性检测。下面保留已有工程诊断命令供按需定位代码错误，不是本轮验收门槛；23/24/25/26 号记录见 [B4-R7](docs/checks/B4R7-2026-11-08.md)、[B4-R8](docs/checks/B4R8-2026-11-08-editor-simplification.md)、[B4-R9](docs/checks/B4R9-2026-11-09-full-tower.md) 与 [B4-R10](docs/checks/B4R10-2026-11-09-continuous-entry.md)。在项目根目录可执行：

```powershell
node tools/test_all.mjs
```

分项检查：

```powershell
node tools/test_engine.mjs
node tools/test_editor.mjs
node tools/test_assets.mjs
node tools/test_leveldata.mjs
node tools/test_t01r.mjs
node tools/test_world_session.mjs
node tools/test_b1r.mjs
node tools/test_b2.mjs
node tools/test_b3.mjs
node tools/test_single_level_trial.mjs
node tools/test_trial_page.mjs
node tools/test_full40.mjs
node tools/test_26_continuous.mjs
node tools/test_27_monsters.mjs
node tools/test_28_soul_sewage.mjs
node tools/test_29_menu_levels.mjs
node tools/test_30_coins_archer_score.mjs
node tools/browser_26_seams.mjs
node tools/browser_27_monsters.mjs
node tools/browser_28_return_soul.mjs
node tools/browser_29_menu.mjs
node tools/browser_30_coins_archer.mjs
node tools/sync_full40_levels.mjs --check
node tools/browser_full40.mjs
node tools/browser_trial23.mjs
node tools/browser_editor24.mjs
node tools/browser_t02a.mjs
node tools/browser_t02a_r.mjs
node tools/browser_b1.mjs
node tools/browser_b2.mjs
node tools/browser_b3.mjs
node tools/browser_b3r2.mjs
node tools/test_b4.mjs
node tools/browser_b4.mjs
node tools/test_b4r1.mjs
node tools/browser_b4r1.mjs
node tools/test_b4r2.mjs
node tools/test_editor_gestures.mjs
node tools/check_levels.mjs
```

`node tools/test_all.mjs --fast` 可用于快速反馈，但跳过了逐跳模拟，不代替完整检查。`check_levels.mjs` 的寻路结果是辅助诊断，不是人工通关认证。`test_26_continuous.mjs` 用真实 Session 步进验证 1/8/14 右移上穿、pending 一次提交、规划/实存石管、邻层云板与管壁从 active/snapshot/preview 一致；`browser_26_seams.mjs` 用真实 Chrome + 真实键盘按接缝 finish fixture 验证 1→2、2→3、3→4、4→5右移、5→6（**不是连续整图路线**）；`test_27_monsters.mjs` 用真实 Session/TrialSession 验证 gear340/moving170/单点静止、流星锤180px/1.25926rad/4.9896s、所有怪物无阻挡但伤害、地刺仅尖刺区、显式damage0、光环类型、暂停/preview/相位、N04 pending方向、编辑数据/裁剪/测试池发布读取；`browser_27_monsters.mjs` 用真实 Chrome 鼠标在编辑器画移动火球路径/单点放锤/Esc，进试玩并核对轨道/链/速度，正式塔用内存 fixture 截图（不是发布池/真人）。`test_29_menu_levels.mjs` 验证 SeedText 完整解析/0拒绝、53份迁移SHA、四档同步有效通过fixture真实被Planner选中、档位错误不写半成品、index/legacy/short入口；`browser_29_menu.mjs` 用真实 Chrome 验证新菜单/设置/种子/开始/F→1/暂停/退出/short/legacy/editor返回。`test_30_coins_archer_score.mjs` 验证金币/弓箭手两 type 的注册与编辑器保真、金币只被身体拾取一次且按实例去重、弓箭手 2 秒/每 2 秒/170px/s 直线/穿墙/按所属层域裁剪不跨层/暂停冻结/离层清箭、正式计分 20/5/10 与 Boss 最终一次/41 槽 800/重试 0、试玩无分数、最高分只存 max 与损坏/写失败不假成功；`browser_30_coins_archer.mjs` 用真实 Chrome 鼠标/键盘走编辑器放币放弓 → 试玩拾取/被箭扣血/K 杀本体且无分 → 返回原稿 → 正式 HUD 20/30/35 与结果/最高分/重试 0。`test_28_soul_sewage.mjs` 验证灵魂方向/轮廓/直飞回贴/动态门浮石、污水20/无敌/光环、放置不擦地形/异类共存、preview/暂停/相位、编辑JSON/裁剪/测试池；`browser_28_return_soul.mjs` 用真实 Chrome 验证未通关顶部/暂停返回原稿、编辑器双击方向/右键取消/污水连续铺、试玩/正式内存fixture。`test_full40.mjs` 验证 41 槽/四档/补位/0→F→1/10、30 独立回血/20 不提前胜利 F→21/40 新 Boss/重试/清池保留。`browser_full40.mjs` 的生命周期仍靠 `RA.short.debugJumpTo`，不是真人通关；其中 2 条 25 号卡时代的标题/池文案断言在 29 号卡换新首页后已过期（36/2），不作门槛。`test_trial_page.mjs` 按 `trial.html` 的真实脚本顺序重放页面；`browser_trial23.mjs`/`browser_editor24.mjs` 是 23/24 号卡回归（`editor24` 里 2 条 standard/devplay 静态页断言在 29 号卡退役旧页后过期，42/2）。`test_engine.mjs` 的活动 catalog 检查允许空池（旧 12 张只在 `levels/archive/legacy-pool-2026-11-09` 做历史/归档检查）。`browser_b4.mjs` 是历史脚本（含过时断言，未整体重写）。`browser_*.mjs` 需要本机 Chrome/Edge，用 headless + DevTools 做真实鼠标/键盘/下载。

2026-10-30 在本次会话实测的完整自检基线：

| 类别 | PASS | FAIL |
|---|---:|---:|
| 引擎 | 576 | 4 |
| 编辑器 | 238 | 0 |
| 贴图 | 126 | 0 |
| 合计 | 940 | 4 |

退出码为 `1`。失败是 `floor09`、`floor11` 各被两个入口报告，不能当作四个独立故障，也不能据此宣布两张地图人工不可通。Node 检查使用 DOM/Canvas 替身；贴图检查通过不等于已完成真实画面验收。

2026-11-04 B1 主体实测：完整 1224/4（原有 floor09/floor11），浏览器 21/0。2026-11-06 B1-R1 修复后：`node tools/test_b1r.mjs` 为 **24 PASS / 0 FAIL**，完整 `node tools/test_all.mjs` 为 **1248 PASS / 4 FAIL，退出码 1**（引擎 595/4、编辑器 225/0、贴图 126/0、数据 139/0、修复自检 98/0、世界/会话 41/0、B1-R1 24/0）；`node tools/browser_b1.mjs` 为 **25 PASS / 0 FAIL**（Chrome 156 headless；新增暂停菜单重开遮罩检查）。4 条失败仍是 floor09/floor11 旧诊断，本批未修、未跳过。证据：[B1 交付记录](docs/checks/B1-2026-11-04.md)、[B1-R1 交付记录](docs/checks/B1-R1-2026-11-06.md)。

2026-11-06 独立复验完整自检仍为 **1248/4、退出码 1**，原三种异步场景与 N02 已关闭，B1 工程验收通过；浏览器 25/0 为交付方证据，Independent Chrome/Edge 未启动，详见 [独立报告](docs/checks/review-B1R1-2026-11-06.md)。

2026-11-06 B2 实测：`node tools/test_all.mjs` 为 **1334 PASS / 4 FAIL，退出码 1**（引擎 603/4、编辑器 225/0、贴图 126/0、数据 139/0、修复自检 98/0、世界/会话 41/0、B1-R1 24/0、B2 78/0）；`node tools/browser_b2.mjs` 为 **23 PASS / 0 FAIL**（Chrome headless：开发短塔、光环、暂停、跨层、死亡重试、编辑器接口/对象/路径、标准试玩页）。4 条失败仍是 floor09/floor11 旧诊断。证据见 [B2 交付记录](docs/checks/B2-2026-11-06.md)。

历史：T01-R 复验为 1188/4；T02A 为 1089/4；T02A-R 为 1143/4。编辑器测试数变化来自旧 TXT/旧池断言被替换与新增草稿/试玩回归，不是删断言凑数。

2026-11-06 B2-R1 独立复跑：完整 **1355 PASS / 4 FAIL，退出码 1**，4 条仍为旧 floor09/floor11；原点/上层对象与标准技能独立探针退出 0，R1～R3 关闭。独立 DevTools 未启动，Chrome 25/0 为交付方证据；用户另确认短塔人工游玩基本正常。详见 [独立复验](docs/checks/review-B2R1-2026-11-06.md)。

2026-11-09 B4-R14（30号卡）：`test_30_coins_archer_score` **95/0**、`test_all` **1829 PASS / 4 FAIL**（4条历史floor09/floor11）、`test_leveldata` 141/0（注册表 12 类）、`test_editor` 266/0、`test_29` 34/0、`test_full40` 98/0、`test_28` 45/0、`test_27` 53/0、`test_26` 39/0、`test_b2` 96/0；真实 Chrome `browser_30_coins_archer` **33/0**（编辑器调色板放币/弓、试玩拾取/被射/K杀本体且无分、返回原稿、正式HUD 20/30/35+结果+最高分刷新+重试0）、`browser_29` 22/0、`browser_28` 20/0、`browser_trial23` 40/0。`browser_editor24` 42/2、`browser_full40` 36/2 的 4 条都是 25/29 号卡已换掉的旧页面文案断言（过期，不是本轮回归）。`www` 已重建（38 脚本、含 high-score-store）。作者显式发布→正式塔读取未执行（正式截图是页面内存 fixture）；未构建 APK。见 [B4-R14 交付记录](docs/checks/B4R14-2026-11-09-coins-archer-score.md)。

2026-11-09 B4-R13（29号卡）：`test_29_menu_levels` **34/0**、`test_all` **1733 PASS / 4 FAIL**（4条历史floor09/floor11）、`browser_29_menu` **22/0**（真实Chrome新菜单/设置/种子/开始/F→1/暂停/退出/legacy/short/editor返回）、`browser_28_return_soul` **20/0**（28回原稿不退化）、`test_28` 45/0、`test_27` 53/0、`test_26` 39/0、`test_full40` 98/0、`test_b3` 61/0。`test_29` 证明53份迁移SHA、四档同步fixture真实被Planner选中、档位错误不写半成品；`29-audit` N04/N05保持false/0、www关键文件一致。作者可见文件选择器导入/真实关闭/并发/持久失败未测；正式塔空普通池用test3补位；旧btn-dev浏览器脚本退休，不作门槛。见 [B4-R13 交付记录](docs/checks/B4R13-2026-11-09-main-menu-level-library.md)。

2026-11-09 B4-R12（28号卡）：`test_28_soul_sewage` **45/0**、`test_all` **1778 PASS / 4 FAIL**（4条历史floor09/floor11）、`test_27` 53/0、`test_26` 39/0、`test_full40` 96/0、`browser_28_return_soul` **20/0**（未通关顶部/暂停返回原稿、真实编辑器双击方向/右键取消/污水连续铺、试玩/正式内存fixture）、`test_b3` 61/0。修复前后 return 探针 `topReturnBugReproduced` true→false；`28-audit` N04 false/N05 0、www一致。作者真人试玩/显式发布/新塔读取/保存失败/并发未执行；正式截图不是发布池。见 [B4-R12 交付记录](docs/checks/B4R12-2026-11-09-trial-return-soul-sewage.md)。

2026-11-09 B4-R11（27号卡）：`test_27_monsters` **53/0**、`test_all` **1731 PASS / 4 FAIL**（4条历史floor09/floor11）、`test_26` 39/0、`test_full40` 96/0、`browser_27_monsters` **16/0**（真实编辑器鼠标/Esc、试玩、正式内存fixture）、`browser_full40` 38/0、`browser_26_seams` 17/0、b2/b3r2/trial23/editor24 20/0、47/0、40/0、44/0、`test_b3` 61/0。作者真人试玩→显式发布→新塔读取未执行；正式截图是内存fixture，不是发布池。见 [B4-R11](docs/checks/B4R11-2026-11-09-moving-fireball-flail.md)。

2026-11-09 B4-R10（26号卡）：`test_26_continuous` **39/0**、`browser_26_seams`（真实 Chrome 156 headless + 真实键盘）**17/0**、`test_full40` 96/0、`browser_b2` 20/0、`browser_b3r2` 47/0、`browser_trial23` 40/0、`browser_editor24` 44/0；完整 **1677 PASS / 4 FAIL**，4 条仍是历史 floor09/floor11。seams 修复前 `bugReproduced=true`、修复后 false；missing-map 修复前 current4/map6未加载/云板不接/墙不挡、修复后 current5/view5/live4,5,6/6已加载。Node 连续 1→6 证据见 `26-continuous-route.json`；**可见浏览器未自动完成整图连续攀爬**，浏览器证据是逐接缝 fixture，不是真人全塔。见 [B4-R10 交付记录](docs/checks/B4R10-2026-11-09-continuous-entry.md)。

2026-11-09 B4-R9（25号卡）：`test_full40` **96/0**、`browser_full40`（真实 Chrome 156 headless + 真实键盘 + 8 张截图）**38/0**、`browser_b2` 回归 **20/0**、`browser_b3r2` 回归 **47/0**、`browser_trial23` 40/0、`browser_editor24` 44/0；完整 **1638 PASS / 4 FAIL**，4 条仍是历史 floor09/floor11 逐跳可达诊断。生命周期用 `RA.short.debugJumpTo` 显式定位 10/20/30/40，**不是真人从 0 走通 40 层**；截图与逐项 JSON 见 [B4-R9 交付记录](docs/checks/B4R9-2026-11-09-full-tower.md)。`browser_b4.mjs` 仍是历史脚本，含早于 24/25 号卡的过时断言。

2026-11-08 B4-R8（24号卡）：`test_editor` **266/0**、`test_editor_gestures` **13/0**、`test_b3` **61/0**、`browser_editor24`（真实 Chrome 156 headless + 真实鼠标/键盘）**44/0**、`browser_trial23` 回归 **40/0**、`browser_b2` 回归 **20/0**；完整 **1551 PASS / 4 FAIL**，4 条仍是历史 floor09/floor11 逐跳可达诊断。截图与逐项 JSON 见 [B4-R8 交付记录](docs/checks/B4R8-2026-11-08-editor-simplification.md)。**真人屏幕操作仍未执行**，不能记作人工验收；`browser_b4.mjs` 仍是历史脚本，含早于本卡的过时断言。

2026-11-08 B4-R7（23号卡）：`test_trial_page` **13/0**、`test_single_level_trial` **12/0**、`test_editor` **228/0**、`browser_trial23`（真实 Chrome 156 headless + 真实键盘）**40/0**；完整 **1512 PASS / 4 FAIL**，4 条仍是历史 floor09/floor11 逐跳可达诊断。屏幕检查截图与逐项 JSON 见 [交付记录](docs/checks/B4R7-2026-11-08.md)。**真人键盘试玩仍未执行**，不能记作人工通关。

2026-11-08 B4-R3：`test_editor_gestures` **10/0**；`test_b4r2` 21/0、`browser_b4r1` 13/0、`test_b4r1` 12/0、`test_b4` 14/0、B3 回归 47/0、35/0、60/0；完整 **1483 PASS / 4 FAIL**。只交 PC，不构建新 APK；编辑器鼠标画面待人工复测。2026-11-06 B3-R2：交付方 `browser_b3r2` **47/0**、R1 浏览器回归 **35/0**；本轮独立完整自检 **1415 PASS / 4 FAIL，退出码 1**（B3 60/0，4 条旧 floor09/floor11）。独立 DevTools 未启动，未冒充重现浏览器结果；0.3.2 APK 独立验签/包内对照通过，用户本轮安卓人工验收没有问题，R4 关闭。见 [最新复验](docs/checks/review-B3R2-2026-11-06.md)。系统文件与 PC 制作发布专项仍待补。

2026-11-06 B2 独立复跑原完整自检为 **1334/4**；非零原点探针发现上层机关触发/伤害/安全恢复失效和标准技能永久禁用，故 B2 暂不通过。B2-R1 修复后：`test_b2` **96/0**、完整 **1355/4**（引擎 606/4，其余全绿）、真实 Chrome **25/0**；修复后 reviewer 探针的新运行时门/浮石/火球/恢复和 CD 后施法均符合预期。原 23/0 与 1334/4 保留为 B2 历史证据。详见 [B2-R1 记录](docs/checks/B2-R1-2026-11-06.md)。

迁移工具 `tools/migrate_levels.mjs` 现在是“先规划后写入”：`--in` 与 `--out` 相同（含大小写/别名）、输出 id 碰撞、报告落到源文件上都会在写入前失败；内容不同的既有输出默认不覆盖，需显式 `--force`。报告必须放在输入目录之外，例如默认的 `docs/checks/`。29号卡后旧迁移输出在 `levels/archive/v2/`（12 张全部幂等跳过）。

已知工具限制 N01：自定义报告目录需预先创建；不存在时可能生成输出后写报告失败。源文件受保护，但工具不是多文件事务。该限制不影响下一步编辑器直接使用共享编解码模块。

人工检查 B2-R1 的方法：

1. 双击 `index.html` 进入 REVERSE ABYSS；点「开始游戏」，F 进1层，设置右下角可种子重构/保存/导入/开编辑器。`legacy.html`/`short.html` 只跳同一首页。
2. 爬到普通层后检查门、浮石、伤害、弹簧；上层应和原点层一样按同一坐标工作。门触碰后消失；浮石约 0.5s 预警、1.6s 消失、恢复不夹人；样例位置见 [B2-R1 记录](docs/checks/B2-R1-2026-11-06.md)。
3. 编辑器「打开 JSON…」载入 [普通层模板](levels/archive/b2/normal-1.json)，改接口/对象/路径，保存草稿；刷新找回。
4. 从编辑器点「▶ 试玩」进入本图，看到地图/角色/血条/K就绪；实际走跳、扣血/施法、暂停再继续，上穿finish完成；通过记录写回草稿后返回编辑器显式发布。该人工通过不再被旧关卡几何/可达自检否决，自动化不代打用户图（23号卡已具备，但真人操作尚未记录）。
5. 打开浏览器开发者工具，记录异常、复现步骤和所在关卡。

B2-R1 交付方 Chrome headless 25/0，独立浏览器未启动；用户人工短塔游玩基本正常。用户明确只测了短塔，标准通关/认证发布/正式实抽仍待补；系统文件对话框、真实双窗口并发、安卓与性能未验证。

## 开发样例、短塔与编辑器现状

- [levels/archive/dev/floor-a.json](levels/archive/dev/floor-a.json)：B1历史开发样例，14×8、出口col=5，保留供旧回归；当前devplay不再直开此样例。
- [levels/archive/dev/floor-b.json](levels/archive/dev/floor-b.json)：B1历史开发样例，10×5、入口col=2/出口col=4，当前不作试玩缺数据回退。
- [levels/archive/demo/t02a-demo.json](levels/archive/demo/t02a-demo.json)：未认证 T02A 演示草稿，含未知对象/路线/extensions，`ports=null`，只能编辑，不能试玩/发布。
- `levels/archive/b2/lobby.json`、`normal-1/2/3.json`、`rest.json`、`boss.json`：B2 历史开发短塔模板，全部**未认证**且归档；`js/b2-samples.js` 由旧同步工具生成，仅历史测试。
- `js/dev-samples.js` 由 `node tools/sync_dev_levels.mjs` 从 `levels/archive/dev/*.json` 生成；归档样例不进 `levels/levels.js`、不进正式池。

编辑器以LevelData为唯一真值，支持地块/现有对象、整份撤销重做、导入/IndexedDB草稿保护、鼠标云板标记/直角齿轮；固定场景不开放自由编辑。24号卡后旧「对象 / 参数 / 路径」表单已移除，对象/路线/自定义参数仍随 JSON 与草稿保存；齿轮往返/闭合是齿轮专属画布工具，取消只回滚本次事务。编辑器现在只有一个「▶ 试玩」入口进入单图 TrialSession（普通游玩初态、无上下关），试玩结果页可把原草稿最新 revision 带回编辑器；发布看本图通过记录与内容 hash，几何自动合规门槛已取消，必要读取错误与不丢草稿保护保留。旧 `standard.html`/`devplay.html` 只是历史说明页。

B2新运行时及后续B4：历史短塔控制器只保留测试/存档；当前正式入口为 `index.html`。100生命、接触伤害20、1秒无敌；K光环14秒/CD20秒、跨层保留、暂停冻结、命中Boss消耗光环；六类对象实际运行；预热不攻击、地形保留；休整回复40封顶100；Boss两阶段、暴露停攻清场；死亡重试同塔。B4为作者六图/F及石管，已经历侧碰撞修复；不与编辑器试玩的结束条件混用。

## 当前重要限制

- **B3-R2 已验收**：0.3.2 的定位/视口/短屏修复通过工程与本轮用户人工验收，R4 关闭；实际 WebView 版本仍未知。隐藏摇杆 Q05 后续再改，当前操作未替换。
- **B2-R1 已验收**：默认入口、上层对象坐标与标准 CD 后施法通过独立工程复验；用户短塔游玩基本正常。标准认证/发布/正式实抽人工待测，不能写成已完成；可先推进独立安卓适配，正式内容与认证文件往返验收前补齐真实样本。
- 美术粗糙、缺音效、AI 地图质量与 Boss 技能打磨，用户明确允许后置，见 [改进待办](docs/design/followups.md)，不阻塞本轮工程验收。
- B1-R1 已修：保存/读取/试玩回包会核对工作区令牌与内容 hash；保存/读取期间编辑或切图不会丢新工作、不会错误绑定草稿，试玩不会带未保存内容离开。真实双窗口并发仍未浏览器自动化验证。暂停菜单重开已清遮罩（N02）。
- B2 已实现生命/光环/多类对象/休整/两阶段 Boss/单图试玩/本地发布抽选；B3 已接安卓触控/布局/生命周期/JSON/离线包，0.3.2 人工验收通过；**PC 正式入口已扩到 0–40 完整塔（25号卡）**，27号卡又加入移动火球/流星锤；无正式签名、无新 APK。
- **作者本人的「试玩通过 → 显式发布」真人记录仍然没有**：本轮只有脚本化的真实浏览器检查（23号卡 40/0、24号卡 44/0、25号卡 38/0、26号卡逐接缝 17/0、27号卡 16/0，含截图），干净环境正式池为空、完整塔全部由 test3 补位；自动化不代打、不伪造 passed。开发短塔使用未认证模板。B3 导入的认证只标 imported-declaration，不生成 local-playtest。
- **试玩通过记录的身份是 run-v1**：技术规则版本变化只作记录，不批量作废已有作者通过；导入声明与本地通过已统一为"同内容 hash + 完整声明"即受支持，来源仍区分，仍须用户显式入池。
- **27号卡新怪物限制**：速度/轨道/显示/伤害由真实 Node 步进与可见浏览器验证；但作者真人小图试玩、显式发布、新完整塔读取仍未执行。正式截图使用内存 fixture 给 test3 补位，不是发布池内容；没有新 APK/真机。地刺只按伸出尖刺区域伤害；27的移动火球/流星锤保留。
- **28号卡返回/灵魂/污水限制**：顶部/暂停返回和方向/取消有可见浏览器证据，但通过保存失败、双窗口并发、真实删除/缺失草稿未构造；作者全流程（含显式发布/新塔读取）未执行。灵魂轮廓验证单矩形/L/门浮石状态/直飞回贴，复杂大凹腔未逐图人工验证；正式截图是内存 fixture，池/魂不加入发布池。
- **29号卡验收范围**：用户已整体人工通过，独立复验见上；旧game/tower/main源码仍供历史测试，产品页/www不加载，未物理全删。交付方的文件选择器/关闭成功/并发/持久失败未测项未逐项复测，不扩大人工声明。空普通池仍用test3补位。
- **30号卡边界(等人工验收)**：金币/弓箭手/正式计分已实施并接线到编辑器、试玩、正式塔、四档目录与 www；`test_30` 95/0、可见 `browser_30` 33/0。**作者真人流程(显式发布 → 从发布池读取含金币/弓箭手的新图)未执行**，正式截图是页面内存 fixture(仅 test3 补位替换)；未测大量箭/金币的性能、多标签并发写最高分、真实浏览器存储写失败。数值(2 秒/170px/s/20/10/5/20)是设计默认，可按人工手感调整。规则 b4-10，schema2/DBv3 不变，旧人工通过不批量作废。
- **本轮曾发生一次可记录事故**：PowerShell 5.1 默认编码把 `js/editor.js`、`editor.html`、`trial.html` 写坏；已按损坏字节反解 + `git show HEAD:` + 本轮已读原文重建，未 reset/clean、未丢作者数据，editor/28/29/full40 与页面接线回归全绿。**页面中文提示文案可能与 29 交付时略有差异**，功能/ID/脚本一致；详见 [B4-R14 交付记录](docs/checks/B4R14-2026-11-09-coins-archer-score.md) 第 6 节。
- **完整塔当前边界**：用户已人工走完41层，25/26结构与缺图/碰撞验收通过；不等于任意新发布图都可通或新怪物参数界面已实现。27/28新增移动火球/流星锤/灵魂/污水池并修复N04/N05，30新增金币/弓箭手与正式计分，规则b4-10；**作者真人试玩→显式发布→新塔读取尚未执行，正式截图是内存fixture**。Boss仍沿用原两阶段技能，美术/音效/长度节奏未打磨，新APK未做。编辑器参数卡和制作发布专项仍后置，不生成作者passed。旧普通图继续只读归档，不重新清池。
- **难度与分档**：正式图发布前必须选 1–4 档；每档最多 9 张、按 `levelId+contentHash` 无放回，本档不足才用 test3 补位，正式图不跨档。只有 test3 补位忽略自身难度。改难度属于内容变更，旧通过失效须重新试玩；本轮只校验这个抽选必需元数据，不恢复关卡几何/可达自检。
- **24号卡后的编辑器限制**：旧「对象/参数/路径」表单已删，修改对象参数/新建路线只能改 JSON 或用齿轮画布；主题/齿轮/返回原草稿/旧页停用仍是脚本化验证，真人鼠标手感/两主题可读性未记录；`browser_b4.mjs` 是历史脚本，含早于本卡的过时断言（`lobby-direct`、`btn-start-apply` 等），未整体重写，不在 test_all 门槛内。
- **本轮安卓人工验收通过，专项记录仍需按实际补齐**：系统文件选择/分享、PC↔手机往返、完整通关与锁屏等未逐项记录；性能没有测量，不声明帧率或所有设备兼容。`www` 已跟随 `index.html` 重建（不构建 APK）。
- 固定大厅/休整/Boss 场景与三个普通模板是首版开发数据，未经过真人完整通关调参；Boss/伤害/接口数值是提案初值，可能需按实测调整。
- 正式池与认证只存在当前浏览器 IndexedDB;换浏览器/清站点数据会丢，发布不是服务器/商店发布。
- 草稿/发布冲突只做了 Node 双实例与隔离浏览器;真实双窗口并发、系统文件选择对话框未自动验证。
- 草稿冲突有 Node 双实例回归；真实浏览器只验证了保存→刷新恢复，没有自动双窗口冲突复现。
- 刷新不会恢复**未保存**改动（保存草稿后才恢复）；导出只发起下载，没有“已写入磁盘”的确认。
- 编辑器已有对象参数/云板标记，齿轮可连续左键布置直角路径、右键结束，支持单点/往返/闭合（往返/闭合在左栏路径专属控件，选齿轮或移动火球时显示）；流星锤单击一个端点。其它普通怪物仍未添加。未知/不支持的旧内容保真存草稿，阻止试玩/发布并说明原因。旧对象/参数/路径表单已移除，数据仍随 JSON/草稿保存。
- 旧原型菜单/旧池逻辑已从产品入口移除；`legacy.html` 只跳 `index.html`，不读取 `customLevels/overrides`。正式池只认四档 normal + 浏览器 published。
- 旧 `floor09/floor11` 自动可达性诊断仍失败，未改旧图；这不代表 B2 短塔人工不可通。
- 已有本地 Git 基线 `f56cdce`；T01 `6a7e712`、T01-R `c7c5490`、T02A `f2a0e07`、T02A-R `6f88127`、B1 `fffaee0`（文档/证据 `205d63c`）、B1-R1 `9f2a4e3`、B2 `9a17f99`、B2-R1 `71e3219`、B3 `43fd30b`、B3-R1 `5dc5fb2`、B3-R2 `61a0b2d`、B4 `dfbe10d`、B4-R1 `7fff152`、B4-R2 `eba80a6`、B4-R3 `e764910`。恢复基线先保留当前工作，在独立目录中查看，不直接丢弃未提交修改。

## 文档与目录

| 文件 / 目录 | 用途 |
|---|---|
| [PROJECT.md](PROJECT.md) | 目标、第一版范围、路线与技术约定 |
| [STATUS.md](STATUS.md) | 当前事实、已知问题、下一张任务卡 |
| [AGENTS.md](AGENTS.md) | 编码 agent 必须阅读的开发规则 |
| [设计决定](docs/design/decisions.md) | 已确认、技术提案、待讨论事项 |
| [世界与玩法](docs/design/world-and-gameplay.md) | 接缝、楼层生命周期、技能、Boss |
| [数据与接口](docs/design/data-and-interfaces.md) | JSON、运行状态、模块契约 |
| [开发任务](docs/tasks/README.md) | 顺序、任务卡和验收方法 |
| [美术资产接入](docs/art/asset-integration.md) | 当前图片路径、替换规格、角色/图集接线、素材生成与测试注意项 |
| [B1 交付记录](docs/checks/B1-2026-11-04.md) | 草稿/会话/连续楼层/A3-C 的证据与未测项 |
| [B1-R1 交付记录](docs/checks/B1-R1-2026-11-06.md) | 异步保存/读取/试玩与 N02 的修复证据 |
| [B2 交付记录](docs/checks/B2-2026-11-06.md) | 短塔/战斗/Boss/发布/调参与未测项 |
| [B2 独立验收](docs/checks/review-B2-2026-11-06.md) / [B2-R1 卡](docs/tasks/11-b2-review-fixes.md) | 原问题、证据与收尾范围 |
| [B2-R1 交付记录](docs/checks/B2-R1-2026-11-06.md) | 默认入口/上层坐标/标准技能修复证据 |
| [B2-R1 独立复验](docs/checks/review-B2R1-2026-11-06.md) | R1～R3 关闭、用户人工反馈与仍未测的发布链路 |
| [B3 安卓卡](docs/tasks/12-b3-android-short-tower.md) / [改进待办](docs/design/followups.md) | 安卓范围与后置体验改进 |
| [B3 交付记录](docs/checks/B3-2026-11-06.md) / [工具链](docs/checks/B3-toolchain.md) | 平台壳/旧 APK 证据与待验项 |
| [B3-R1 记录](docs/checks/B3-R1-2026-11-06.md) | 触点释放/重认证/草稿保真与 0.3.1 APK |
| [B3-R2 记录](docs/checks/B3-R2-2026-11-06.md) | 安卓启动/视口裁切修复与 0.3.2 APK |
| [B4 记录](docs/checks/B4-2026-11-07.md) | 云板/石管、作者三图、编辑器与双主题（历史 PC） |
| [B4-R1 记录](docs/checks/B4R1-2026-11-07.md) | 作者 level0/rest/boss、F 短塔、石块墙（仅 PC） |
| [B4-R2 记录](docs/checks/B4R2-2026-11-08.md) | 上穿云板侧移穿墙、统一世界查询/坐标（仅 PC） |
| [B4-R3 记录](docs/checks/B4R3-2026-11-08.md) | 鼠标端点、裁剪/安全包络、直角齿轮路径（仅 PC） |
| [B4-R7 交付记录](docs/checks/B4R7-2026-11-08.md) | 23号卡：试玩启动/跳跃/暂停修复、普通初态、人工通过优先与真实 Chrome 屏幕检查 |
| [B4-R8 交付记录](docs/checks/B4R8-2026-11-08-editor-simplification.md) | 24号卡：旧面板移除、齿轮专属工具/取消事务、主题、通过判定统一、试玩返回原草稿、旧页停用 |
| [B4-R9 交付记录](docs/checks/B4R9-2026-11-09-full-tower.md) | 25号卡：0–40 正式入口、四档分桶/test3 补位、一次性清池、20→F→21、40 新 Boss 胜利、双休息身份 |
| [B4-R10 交付记录](docs/checks/B4R10-2026-11-09-continuous-entry.md) | 26号卡：上穿漏提交、实存石管绘制/碰撞、邻层云板/管壁；修复前后探针与浏览器/引擎限制 |
| [B4-R11 交付记录](docs/checks/B4R11-2026-11-09-moving-fireball-flail.md) | 27号卡：移动火球/流星锤、齿轮340轨道、怪物无阻挡伤害、N04/N05、可见编辑器/试玩证据 |
| [B4-R12 交付记录](docs/checks/B4R12-2026-11-09-trial-return-soul-sewage.md) | 28号卡：未通关返回原稿、灵魂动态轮廓/直飞回贴、污水池与怪物独立性 |
| [B4-R13 交付记录](docs/checks/B4R13-2026-11-09-main-menu-level-library.md) | 29号卡：正式主界面、种子文本、四档 levels/同步、旧入口退役 |
| [B4-R14 交付记录](docs/checks/B4R14-2026-11-09-coins-archer-score.md) | 30号卡：金币/弓箭手、正式计分、唯一最高分、可见证据与恢复说明 |
| [29号独立验收](docs/checks/review-B4R13-2026-11-09.md) | 29通过、独立定向结果与历史源码保留事实 |
| [31号任务](docs/tasks/31-editor-visual-path-and-unpublish.md) / [设计](docs/design/editor-visual-path-and-unpublish.md) | 待实施：流星锤显示、路径删除、单版本下架 |
| [30独立验收](docs/checks/review-B4R14-2026-11-09.md) | 95/0、13/0、98/0及编辑器故障定位 |
| [30号任务](docs/tasks/30-coins-archer-and-score.md) / [设计](docs/design/coins-archer-and-score.md) | 已实施、等人工验收:金币/弓箭手/正式分数,试玩无计分 |
| [29号设计](docs/design/formal-main-menu-and-level-library.md) | 新菜单/种子/目录/合并/旧链删除契约 |
| [灵魂/污水设计](docs/design/trial-return-soul-and-sewage.md) | 返回 draftRef、轮廓来源、动态门浮石、池伤害/放置保真 |
| [怪物设计](docs/design/moving-fireball-and-flail.md) | 27号卡速度/轨道/显示/碰撞/光环与数据契约 |
| [连续接口设计](docs/design/continuous-floor-entry.md) | 规划/实存、提交边界、完整静态查询与 oneWay 契约 |
| [完整塔设计](docs/design/full-tower-formal-game.md) | 41 槽布局、分档抽选、清池 epoch、F/Boss/休息生命周期 |
| [B4-R6 验收](docs/checks/review-B4R6-2026-11-08.md) | 22号启动失败的三处复现证据（历史） |
| [B4-R7 审计](docs/checks/review-B4R7-2026-11-08.md) | 24号卡前的编辑器/数据衔接审计（历史） |
| [B4-R8 审计](docs/checks/review-B4R8-2026-11-09.md) | 24号卡验收与完整塔接入审计（历史） |
| [B3-R1 独立复验](docs/checks/review-B3R1-2026-11-06.md) / [B3-R2 修复卡](docs/tasks/14-b3-android-viewport-fix.md) | 当前安卓启动故障、真机截图、一次修复与新包要求 |
| `js/` | 引擎、旧游戏、编辑器、草稿仓库、World/GameSession、完整塔规划、开发试玩代码 |
| `index.html` | 唯一正式主界面 REVERSE ABYSS（开始/退出/右下设置） |
| `legacy.html` | 单向跳 `index.html` 的兼容壳 |
| `short.html` | 单向跳 `index.html` 的兼容壳 |
| `www/` | 安卓离线最小 Web 包（已随 25 号卡重建；未构建新 APK） |
| `android/` | Capacitor 7 Android 工程 |
| `trial.html` | 当前编辑器单图试玩（只有当前一张图；普通游玩初态、开局技能可用；start 出生、上穿 finish 结束） |
| `standard.html` / `devplay.html` | 旧标准/三层试玩**已停用**：纯静态历史说明 + 回编辑器链接，不再加载旧控制器；当前唯一入口是 editor.html 的「▶ 试玩」 |
| `levels/fixed/` | 完整塔大厅/休整/Boss 运行副本；`levels/fallback/test3.json` 补位 |
| `levels/archive/legacy-pool-2026-11-09/` | 旧普通图 `floor01–12` 只读归档（不再进活动目录/正式池） |
| `levels/` | 活动普通 catalog 为空；另有 `dev/`、`b2/`、`v2/`、`demo/`、`authored/` 等模板/历史数据 |
| `levels/archive/dev/` | 历史开发样例（A/B，未认证，不进正式池） |
| `levels/archive/b2/` | B2 历史短塔 6 层模板（未认证） |
| `levels/archive/demo/t02a-demo.json` | T02A 未认证演示草稿（完整 LevelData，含未知对象） |
| `levels/archive/v2/` | 12 张旧图的未认证迁移草稿（ports=null） |
| `assets/` | 当前贴图 |
| `tools/`、`tests/` | 数据工具、命令行、浏览器检查与真实 Chrome 验收脚本 |

最初设想来自此前讨论的 `reveres_abyss介绍.txt`；该原始文件当前不在 Git 基线或工作目录中，现行目标已整理到 PROJECT 和设计文档。旧 README 已完整保存到 [历史归档](docs/archive/README-legacy-2026-10-30.md)，仅用于理解旧实现，不作为新开发要求。
