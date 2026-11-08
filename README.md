# reverse_abyss

一个以自定义关卡编辑器、向上跑酷和技能清场为核心的单机 2D 游戏，使用 HTML、CSS、原生 JavaScript 与 Canvas。

**2026-11-08复验：21号卡单图试玩流程获用户反馈正常，控制/基础交互未通过。** 当前trial.html已从本图start出生、完整上穿finish结束，但行走/二段跳随帧率改变，部分机关/伤害/技能漏接。下一步只做 [22号卡](docs/tasks/22-trial-gameplay-parity.md)修复一致性，尚未实施，不重做地图或调角色参数。见 [复验](docs/checks/review-B4R5-2026-11-08.md)。当前b4-5，仅PC、无APK，Android仍0.3.2。仓库：[GitHub](https://github.com/yanfei728/reverse_abyss)。

## 获取与安装

PC 端没有安装包，也没有 npm 运行依赖；取得整个项目文件夹，保留 `index.html`、`js/`、`css/`、`levels/`、`assets/` 的相对位置即可。安卓有可构建的 Capacitor 工程与 debug APK（非商店发布），构建依赖 Node/npm 与 Android SDK，见下文。

- 游玩：使用桌面浏览器，目前按键操作为主。
- 命令行检查：需要 Node.js；本次使用 Node.js `v24.21.0`。
- Android：Capacitor 7 工程与 debug APK `docs/checks/B3-reverse-abyss-0.3.2-debug.apk`（0.3.0/0.3.1 保留）；用户确认 0.3.2 安卓人工验收无问题。**B4 只在 PC，未打进 0.3.2**；本轮不构建新 APK。无正式签名/商店发布。

## 启动

### 最快启动

**双击根目录index.html：进入当前PC短塔**，也可直接打开short.html。editor.html为编辑器，目前两个按钮仍叫“开发试玩”“标准试玩”，但都已进入trial.html独立单图试玩；按钮文字尚未收尾。应从编辑器保存后发起，直开缺交接数据会报错。devplay.html/standard.html保留旧实现，不作当前试玩入口；legacy.html是旧原型。

`file://`模式下当前短塔优先读取`js/b4-samples.js`的内嵌六图；源运行文件在`levels/authored/fixed/`与`levels/authored/short/`，由`node tools/sync_b4_levels.mjs`生成，勿手改产物。其他入口仍有旧内嵌数据。编辑器JSON导入导出走文件选择/下载；**导出只发起下载，不会写进levels/**。草稿/发布池保存在当前浏览器，编辑器问题仍后置。

### 本地 HTTP 启动（开发推荐）

在项目根目录启动一个静态文件服务器。例如，**安装并配置 Python 后**可在 PowerShell 执行：

```powershell
Set-Location 'C:\Users\beilu\Documents\blwork\reverse_abyss'
python -m http.server 8000 --bind 127.0.0.1
```

然后打开：

- PC 短塔（默认入口）：<http://127.0.0.1:8000/index.html>
- PC 短塔（直接入口）：<http://127.0.0.1:8000/short.html>
- 编辑器：<http://127.0.0.1:8000/editor.html>
- 独立试玩页（从编辑器发起，当前控制待修）：<http://127.0.0.1:8000/trial.html>
- 浏览器检查：<http://127.0.0.1:8000/tests/browser.html>
- 旧原型（历史，保留旧规则）：<http://127.0.0.1:8000/legacy.html>

在服务器终端按 `Ctrl+C` 停止。若端口被占用，换端口并同步修改网址。也可使用已有的静态服务器，无需同时安装多个工具。本次环境中 `python` 命令不可用，上述是可选启动说明，不是本次实测成功记录。

历史关卡入口会尝试读取清单对应的`levels/<id>.json`。下述同步命令属于旧内置关卡；当前短塔六图请使用上文的`sync_b4_levels.mjs`：

```powershell
node tools/sync_levels.mjs
```

这会生成 `levels/levels.js`，不是只读检查。不要手工编辑生成文件。HTTP 模式也不是自动枚举目录，新增文件仍需同步清单。

## 当前操作

| 操作 | 按键或入口 |
|---|---|
| 进入 PC 短塔 | 打开 `index.html`（也可直接 `short.html`），选「开发短塔」或「正式短塔」 |
| 短塔移动 / 跳跃 | `A`/`D` 或左右方向键；`Space`/`W`/上方向键(可二段跳) |
| 光环技能 | `K`；持续 14 秒,从施放起冷却 20 秒,开局可用 |
| 大厅进入第1层 | 出生处提示“按 F 开始挑战”；按`F`一次进入test1，后续正常走跳穿管 |
| 暂停 / 恢复 | `P` 或 `Esc`；暂停冻结模拟 |
| 死亡 / 重试 | 回大厅/重试同一座塔;不会重新抽选 |
| 编辑器工具 | `B` 画笔、`E` 橡皮、`R` 矩形、`F` 填充、`K` 吸管 |
| 编辑器撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z`（整份 LevelData,对象/路线/元信息一起） |
| 编辑器导出 JSON | `Ctrl+S` 或「导出 JSON」；只发起浏览器下载 |
| 编辑器打开 / 导入 | 「打开 JSON…」读 v2；「导入旧图…」把 TXT/旧 JSON 迁移成草稿 |
| 编辑器草稿 | 「保存草稿」写 IndexedDB；下拉选择后「打开草稿」；刷新后可找回 |
| 编辑器试玩（控制待修） | 两个旧名称按钮现均保存草稿后进入trial.html；独立一图/start出生/finish上穿结束已实现，帧率和基础交互问题由22号卡修 |
| 编辑器 B2 工具 | 接口 col、对象类型/参数、路径点/loop/pingpong、删除引用保护 |
| 试玩认证 / 发布 | trial.html使用standard-v1，初始CD20秒后可K；通过后写认证、显式发布才入池；当前基础规则有差异，认证发布整体未验收 |
| 旧原型游戏 | 只从 `legacy.html` 进入；标题界面 `Space`/`Enter`、设置中 `E` 等旧操作仍属旧原型 |

短塔六图/F/休整/Boss、碰撞和齿轮已有人工正常反馈；标记自动云板/按压消费保留。本轮用户确认单图试玩逻辑正常，但角色控制不同；独立对照还复现机关/技能漏接，不能把空图专项5/0当完整认证链路通过。trial.html的P/Esc可切暂停状态，其余暂停/继续/重开按钮与R未接完整；键盘别名和失焦也待修。草稿保存/JSON备份随时可用，下载不会自动入池或写进levels/。

试玩当前没有正常游戏的图形血条，只有生命/冷却文字；K入口与计数器已写，但可见光环与实际清火球效果未接，不能算技能可用。22号卡会补齐生命条、技能提示/范围及实际效果，尚未修复。

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

当前 Android 包：`docs/checks/B3-reverse-abyss-0.3.2-debug.apk`（versionCode 5，debug，非正式发布）；`0.3.0`/`0.3.1` 保留。B4 不在此包，PC 入口为 `short.html`/`editor.html`，离线 PC 包为 `www/`。校验值/版本/工具链见 [B3 工具链记录](docs/checks/B3-toolchain.md) 与 [B3-R2 记录](docs/checks/B3-R2-2026-11-06.md)。OPD2101 / Android 11 的本轮人工反馈通过；未单独记录的系统文件/锁屏等专项继续待补。

0.3.2 包含 B3-R2 的视口/基础 CSS/短屏修复，安卓人工验收通过；B4 未同步到 APK。0.3.0/0.3.1 原样保留。`assembleDebug` 的原始输出在 `android/app/build/outputs/apk/debug/app-debug.apk`，历史交付包不会被自动覆盖。覆盖安装时保留应用数据；基本操作仍为左右按钮、跳跃、K 技能与布局设置。PC 标准认证发布与真实文件往返仍待作者补实测记录。

## 检查方法

在项目根目录执行：

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

`node tools/test_all.mjs --fast` 可用于快速反馈，但跳过了逐跳模拟，不代替完整检查。`check_levels.mjs` 的寻路结果是辅助诊断，不是人工通关认证。`test_b4.mjs` 验证云板端点/石管几何/作者三图/编辑器模型；`browser_b4.mjs` 走六层短塔、编辑器屏幕拖选/对象/裁剪/只读/双主题与标准夹具。`test_world_session.mjs` 用四层夹具验证 n−1/n/n+1 生命周期、跨层与暂停；`test_b1r.mjs` 用可控 Promise 验证异步保存/读取/试玩不丢工作；`test_b2.mjs` 验证生命/光环/六类对象/休整/Boss/抽选/发布/编辑工具；`browser_b2.mjs` 走短塔与编辑器工具的真实页面。`browser_t02a*.mjs`/`browser_b1.mjs` 需要本机 Chrome/Edge（默认先找 `C:\Program Files\Google\Chrome\Application\chrome.exe`），用 headless + DevTools 做真实鼠标/键盘/下载；B1 脚本验证编辑保存→刷新恢复→试玩跨层→暂停恢复。

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

2026-11-08 B4-R3：`test_editor_gestures` **10/0**；`test_b4r2` 21/0、`browser_b4r1` 13/0、`test_b4r1` 12/0、`test_b4` 14/0、B3 回归 47/0、35/0、60/0；完整 **1483 PASS / 4 FAIL**。只交 PC，不构建新 APK；编辑器鼠标画面待人工复测。2026-11-06 B3-R2：交付方 `browser_b3r2` **47/0**、R1 浏览器回归 **35/0**；本轮独立完整自检 **1415 PASS / 4 FAIL，退出码 1**（B3 60/0，4 条旧 floor09/floor11）。独立 DevTools 未启动，未冒充重现浏览器结果；0.3.2 APK 独立验签/包内对照通过，用户本轮安卓人工验收没有问题，R4 关闭。见 [最新复验](docs/checks/review-B3R2-2026-11-06.md)。系统文件与 PC 制作发布专项仍待补。

2026-11-06 B2 独立复跑原完整自检为 **1334/4**；非零原点探针发现上层机关触发/伤害/安全恢复失效和标准技能永久禁用，故 B2 暂不通过。B2-R1 修复后：`test_b2` **96/0**、完整 **1355/4**（引擎 606/4，其余全绿）、真实 Chrome **25/0**；修复后 reviewer 探针的新运行时门/浮石/火球/恢复和 CD 后施法均符合预期。原 23/0 与 1334/4 保留为 B2 历史证据。详见 [B2-R1 记录](docs/checks/B2-R1-2026-11-06.md)。

迁移工具 `tools/migrate_levels.mjs` 现在是“先规划后写入”：`--in` 与 `--out` 相同（含大小写/别名）、输出 id 碰撞、报告落到源文件上都会在写入前失败；内容不同的既有输出默认不覆盖，需显式 `--force`。报告必须放在输入目录之外，例如默认的 `docs/checks/`。本次没有重写已交付的 `levels/v2/`（12 张全部幂等跳过）。

已知工具限制 N01：自定义报告目录需预先创建；不存在时可能生成输出后写报告失败。源文件受保护，但工具不是多文件事务。该限制不影响下一步编辑器直接使用共享编解码模块。

人工检查 B2-R1 的方法：

1. 双击 `index.html`，应自动进入短塔；点「开发短塔(未认证模板)」。用 `A/D` + `Space` 爬大厅/普通层，按 `K` 看 14/20 秒光环，暂停/恢复，死亡后「重试同一座塔」。`legacy.html` 只作历史对照。
2. 爬到普通层后检查门、浮石、伤害、弹簧；上层应和原点层一样按同一坐标工作。门触碰后消失；浮石约 0.5s 预警、1.6s 消失、恢复不夹人；样例位置见 [B2-R1 记录](docs/checks/B2-R1-2026-11-06.md)。
3. 编辑器「打开 JSON…」载入 [普通层模板](levels/b2/normal-1.json)，改接口/对象/路径，保存草稿；刷新找回。
4. 当前两个试玩按钮均进入trial.html，start出生/finish完整上穿结束已获用户反馈正常；22号卡修复后需对照短塔检查走跳/六对象/光环，确认通过后保存认证、返回原草稿显式发布，并核对正式候选。作者实际操作与认证发布仍需记录，自动化不代打用户地图。试玩控制待修时不要把它的通关记录视为新版规则已验收。
5. 打开浏览器开发者工具，记录异常、复现步骤和所在关卡。

B2-R1 交付方 Chrome headless 25/0，独立浏览器未启动；用户人工短塔游玩基本正常。用户明确只测了短塔，标准通关/认证发布/正式实抽仍待补；系统文件对话框、真实双窗口并发、安卓与性能未验证。

## 开发样例、短塔与编辑器现状

- [levels/dev/floor-a.json](levels/dev/floor-a.json)：B1历史开发样例，14×8、出口col=5，保留供旧回归；当前devplay不再直开此样例。
- [levels/dev/floor-b.json](levels/dev/floor-b.json)：B1历史开发样例，10×5、入口col=2/出口col=4，当前不作试玩缺数据回退。
- [levels/demo/t02a-demo.json](levels/demo/t02a-demo.json)：未认证 T02A 演示草稿，含未知对象/路线/extensions，`ports=null`，只能编辑，不能试玩/发布。
- `levels/b2/lobby.json`、`normal-1/2/3.json`、`rest.json`、`boss.json`：B2 开发短塔的 6 层固定/普通模板，全部**未认证**；`js/b2-samples.js` 由 `node tools/sync_b2_levels.mjs` 生成。
- `js/dev-samples.js` 由 `node tools/sync_dev_levels.mjs` 从 `levels/dev/*.json` 生成；测试会检查同步。开发样例不进 `levels/levels.js`、不进正式池。

编辑器使用完整LevelData为唯一真值；支持地块/现有对象、整份撤销重做（100步/32MiB）、结构错误导入零替换、IndexedDB草稿/revision保护、缩图预检与退休端口保真。鼠标标记两格云板，齿轮单点/直角往返/闭合路线获人工正常反馈；固定场景不开放自由编辑。当前两个试玩按钮均进入独立TrialSession，已不接塔World/管道，但时间步进和基础交互待22号卡修复。

B2新运行时及后续B4：`short.html`使用短塔流程；100生命、接触伤害20、1秒无敌；K光环14秒/CD20秒、跨层保留、暂停冻结、命中Boss消耗光环；六类对象实际运行；预热不攻击、地形保留；休整回复40封顶100；Boss两阶段、暴露停攻清场；死亡重试同塔。B4为作者六图/F及石管，已经历侧碰撞修复；不与编辑器试玩的结束条件混用。

## 当前重要限制

- **B3-R2 已验收**：0.3.2 的定位/视口/短屏修复通过工程与本轮用户人工验收，R4 关闭；实际 WebView 版本仍未知。隐藏摇杆 Q05 后续再改，当前操作未替换。
- **B2-R1 已验收**：默认入口、上层对象坐标与标准 CD 后施法通过独立工程复验；用户短塔游玩基本正常。标准认证/发布/正式实抽人工待测，不能写成已完成；可先推进独立安卓适配，正式内容与认证文件往返验收前补齐真实样本。
- 美术粗糙、缺音效、AI 地图质量与 Boss 技能打磨，用户明确允许后置，见 [改进待办](docs/design/followups.md)，不阻塞本轮工程验收。
- B1-R1 已修：保存/读取/试玩回包会核对工作区令牌与内容 hash；保存/读取期间编辑或切图不会丢新工作、不会错误绑定草稿，试玩不会带未保存内容离开。真实双窗口并发仍未浏览器自动化验证。暂停菜单重开已清遮罩（N02）。
- B2 已实现生命/光环/六类对象/休整/两阶段 Boss/标准试玩/本地发布抽选；B3 已接安卓触控/布局/生命周期/JSON/离线包，0.3.2 本轮人工验收通过；无正式签名或 40 层扩展。
- **标准试玩实际通关与人工认证尚未由作者/用户完成**。干净环境的正式池为空；自动化不代打、不伪造 passed。开发短塔使用未认证模板。B3 导入的认证只标 imported-declaration，不生成 local-playtest。
- **本轮安卓人工验收通过，专项记录仍需按实际补齐**：系统文件选择/分享、PC↔手机往返、完整通关与锁屏等未逐项记录；性能没有测量，不声明帧率或所有设备兼容。
- 固定大厅/休整/Boss 场景与三个普通模板是首版开发数据，未经过真人完整通关调参；Boss/伤害/接口数值是提案初值，可能需按实测调整。
- 正式池与认证只存在当前浏览器 IndexedDB;换浏览器/清站点数据会丢，发布不是服务器/商店发布。
- 草稿/发布冲突只做了 Node 双实例与隔离浏览器;真实双窗口并发、系统文件选择对话框未自动验证。
- 草稿冲突有 Node 双实例回归；真实浏览器只验证了保存→刷新恢复，没有自动双窗口冲突复现。
- 刷新不会恢复**未保存**改动（保存草稿后才恢复）；导出只发起下载，没有“已写入磁盘”的确认。
- 编辑器已有对象参数/云板标记，齿轮可连续左键布置直角路径、右键结束，支持单点/往返/闭合；未添加其它怪物。未知/不支持的旧内容保真存草稿，阻止试玩/发布并说明原因。
- 旧原型主菜单的 `verified`/旧池逻辑保留在 `legacy.html`，不是 B2 正式池；默认 `index.html`/B2 正式池只认本地已认证发布。
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
| [B3-R1 独立复验](docs/checks/review-B3R1-2026-11-06.md) / [B3-R2 修复卡](docs/tasks/14-b3-android-viewport-fix.md) | 当前安卓启动故障、真机截图、一次修复与新包要求 |
| `js/` | 引擎、旧游戏、编辑器、草稿仓库、World/GameSession、开发试玩代码 |
| `index.html` | 默认入口，自动进入 short.html |
| `legacy.html` | 明确标注的旧原型历史入口 |
| `short.html` | PC/安卓短塔入口(开发/正式) |
| `www/` | 安卓离线最小 Web 包 |
| `android/` | Capacitor 7 Android 工程 |
| `trial.html` | 当前编辑器独立单图试玩，两按钮均进入此处，控制/基础交互待修 |
| `standard.html` / `devplay.html` | 旧标准/三层试玩实现保留，当前编辑器已不导航此处，旧入口尚待收尾 |
| `levels/` | 当前 12 张内置 JSON、模板和生成副本 |
| `levels/dev/` | 两张开发样例（A/B，未认证，不进正式池） |
| `levels/b2/` | B2 开发短塔 6 层模板（未认证） |
| `levels/demo/t02a-demo.json` | T02A 未认证演示草稿（完整 LevelData，含未知对象） |
| `levels/v2/` | 12 张旧图的未认证迁移草稿（ports=null） |
| `assets/` | 当前贴图 |
| `tools/`、`tests/` | 数据工具、命令行、浏览器检查与真实 Chrome 验收脚本 |

最初设想来自此前讨论的 `reveres_abyss介绍.txt`；该原始文件当前不在 Git 基线或工作目录中，现行目标已整理到 PROJECT 和设计文档。旧 README 已完整保存到 [历史归档](docs/archive/README-legacy-2026-10-30.md)，仅用于理解旧实现，不作为新开发要求。
