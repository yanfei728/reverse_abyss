# reverse_abyss

一个以自定义关卡编辑器、向上跑酷和技能清场为核心的单机 2D 游戏，使用 HTML、CSS、原生 JavaScript 与 Canvas。

**B1 已交付（2026-11-04，待复验）：编辑 → 浏览器草稿 → 刷新找回 → 开发试玩 → 两层连续攀爬 → 暂停。** 游戏主菜单仍是旧平台跳跃原型；B1 的试玩是开发入口，不是正式发布。B2 做完整 PC 短塔（战斗/休整/Boss/发布），B3 做安卓。当前事实见 [STATUS.md](STATUS.md)，批次安排见 [批次卡](docs/tasks/08-playable-milestones.md)。仓库：[GitHub](https://github.com/yanfei728/reverse_abyss)。

## 获取与安装

当前没有安装包，也没有 npm 安装或构建步骤。取得整个项目文件夹，保留 `index.html`、`js/`、`css/`、`levels/`、`assets/` 的相对位置即可。不要只复制 HTML 文件。

- 游玩：使用桌面浏览器，目前按键操作为主。
- 命令行检查：需要 Node.js；本次使用 Node.js `v24.21.0`。
- Android：尚无 APK、Capacitor 工程或可用触控移动。计划先完成 PC 短塔，再开发安卓版本。

## 启动

### 最快启动

双击根目录 `index.html` 打开旧原型游戏；双击 `editor.html` 打开编辑器；双击 `devplay.html` 直接打开连续两层开发试玩。

`file://` 模式主要读取 `levels/levels.js` 与 `js/dev-samples.js` 的内嵌数据。编辑器的 JSON 导入导出走浏览器文件选择/下载；**导出只发起下载，不会写进 `levels/`**。编辑器「保存草稿」写浏览器 IndexedDB，刷新后可找回；草稿不发布、不改旧正式池。

### 本地 HTTP 启动（开发推荐）

在项目根目录启动一个静态文件服务器。例如，**安装并配置 Python 后**可在 PowerShell 执行：

```powershell
Set-Location 'C:\Users\beilu\Documents\blwork\reverse_abyss'
python -m http.server 8000 --bind 127.0.0.1
```

然后打开：

- 旧原型游戏：<http://127.0.0.1:8000/index.html>
- 编辑器：<http://127.0.0.1:8000/editor.html>
- 开发试玩（两层）：<http://127.0.0.1:8000/devplay.html>
- 浏览器检查：<http://127.0.0.1:8000/tests/browser.html>

在服务器终端按 `Ctrl+C` 停止。若端口被占用，换端口并同步修改网址。也可使用已有的静态服务器，无需同时安装多个工具。本次环境中 `python` 命令不可用，上述是可选启动说明，不是本次实测成功记录。

HTTP 模式会尝试读取内置清单中对应的 `levels/<id>.json`，再按旧逻辑回退。新增、删除或修改内置关卡后，执行：

```powershell
node tools/sync_levels.mjs
```

这会生成 `levels/levels.js`，不是只读检查。不要手工编辑生成文件。HTTP 模式也不是自动枚举目录，新增文件仍需同步清单。

## 当前操作

| 操作 | 按键或入口 |
|---|---|
| 左右移动 | `A` / `D` 或左右方向键 |
| 跳跃、二段跳 | `Space` / `W` / 上方向键；空中再次按下可二段跳 |
| 开始游戏 | 标题界面 `Space` / `Enter` |
| 打开设置 | 标题界面的齿轮或 `Esc` |
| 重构塔 | 设置中 `R` |
| 打开编辑器 | 设置中 `E`，或直接打开 `editor.html` |
| 导入旧关卡 | 设置中 `I`，目前接受 TXT / JSON |
| 返回标题 | 游戏中 `Esc`；当前不是暂停恢复 |
| 编辑器工具 | `B` 画笔、`E` 橡皮、`R` 矩形、`F` 填充、`K` 吸管 |
| 编辑器撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z`（整份 LevelData,对象/路线/元信息一起） |
| 编辑器导出 JSON | `Ctrl+S` 或「导出 JSON」；只发起浏览器下载 |
| 编辑器打开 / 导入 | 「打开 JSON…」读 v2；「导入旧图…」把 TXT/旧 JSON 迁移成草稿 |
| 编辑器草稿 | 「保存草稿」写 IndexedDB；下拉选择后「打开草稿」；刷新后可找回 |
| 编辑器开发试玩 | 「▶ 开发试玩(两层)」；先按 play 校验接口/出生点，保存草稿后进入新运行时 |
| 开发试玩移动 / 跳跃 | `A`/`D` 或左右方向键；`Space`/`W`/上方向键(可二段跳) |
| 开发试玩暂停 / 重开 | `P` 或 `Esc` 暂停；「继续」恢复(不追算暂停时间)；`R` 重开 |

旧主菜单仍有 3～24 层、镜像、淡出换层、坠落回本层起点；这些是待迁移的旧行为。B1 的新运行时是 `devplay.html`：两层、可变宽高、接口对齐、同一玩家连续攀爬；没有伤害、敌人、技能或 Boss，也没有认证发布。编辑器的导出格式是 v2 JSON，旧 `play.html` 只认 TXT，所以不走旧试玩。

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
node tools/browser_t02a.mjs
node tools/browser_t02a_r.mjs
node tools/browser_b1.mjs
node tools/check_levels.mjs
```

`node tools/test_all.mjs --fast` 可用于快速反馈，但跳过了逐跳模拟，不代替完整检查。`check_levels.mjs` 的寻路结果是辅助诊断，不是人工通关认证。`test_world_session.mjs` 用四层夹具验证 n−1/n/n+1 生命周期、跨层与暂停；`browser_t02a*.mjs`/`browser_b1.mjs` 需要本机 Chrome/Edge（默认先找 `C:\Program Files\Google\Chrome\Application\chrome.exe`），用 headless + DevTools 做真实鼠标/键盘/下载；B1 脚本验证编辑保存→刷新恢复→试玩跨层→暂停恢复。

2026-10-30 在本次会话实测的完整自检基线：

| 类别 | PASS | FAIL |
|---|---:|---:|
| 引擎 | 576 | 4 |
| 编辑器 | 238 | 0 |
| 贴图 | 126 | 0 |
| 合计 | 940 | 4 |

退出码为 `1`。失败是 `floor09`、`floor11` 各被两个入口报告，不能当作四个独立故障，也不能据此宣布两张地图人工不可通。Node 检查使用 DOM/Canvas 替身；贴图检查通过不等于已完成真实画面验收。

2026-11-04 B1 实测：`node tools/test_all.mjs` 为 **1224 PASS / 4 FAIL，退出码 1**（引擎 595/4、编辑器 225/0、贴图 126/0、数据 139/0、修复自检 98/0、世界/会话 41/0）；`node tools/browser_b1.mjs` 为 **21 PASS / 0 FAIL**（Chrome 156.0.8078.74 headless，真实编辑保存→刷新恢复→键盘跨层→暂停恢复）。4 条失败仍是 floor09/floor11 的旧逐跳可达性诊断，本批未修、未跳过。证据见 [B1 交付记录](docs/checks/B1-2026-11-04.md)。

历史：T01-R 复验为 1188/4；T02A 为 1089/4；T02A-R 为 1143/4。编辑器测试数变化来自旧 TXT/旧池断言被替换与新增草稿/试玩回归，不是删断言凑数。

迁移工具 `tools/migrate_levels.mjs` 现在是“先规划后写入”：`--in` 与 `--out` 相同（含大小写/别名）、输出 id 碰撞、报告落到源文件上都会在写入前失败；内容不同的既有输出默认不覆盖，需显式 `--force`。报告必须放在输入目录之外，例如默认的 `docs/checks/`。本次没有重写已交付的 `levels/v2/`（12 张全部幂等跳过）。

已知工具限制 N01：自定义报告目录需预先创建；不存在时可能生成输出后写报告失败。源文件受保护，但工具不是多文件事务。该限制不影响下一步编辑器直接使用共享编解码模块。

人工检查当前原型的方法：

1. 打开游戏，检查左右移动、短跳、二段跳、单向平台与弹簧。
2. 通过出口，观察旧版淡出换层；坠落后观察回本层起点。
3. 编辑器「打开 JSON…」载入 [开发样例 A](levels/dev/floor-a.json)，改一笔，点「保存草稿」；刷新页面，在草稿下拉里找回并「打开草稿」。
4. 点「▶ 开发试玩(两层)」，用 `A/D` + `Space` 二段跳穿过顶部虚线开口；HUD 应变成第 2/2 层，再按 `P` 暂停、等几秒点「继续」，模拟时间不应跳一大段。
5. 也可直接打开 `devplay.html`，玩内置样例 A+B。
6. 打开浏览器开发者工具，记录异常、复现步骤和所在关卡。

B1 主链路已用真实 Chrome headless 跑过 21/21（截图与 JSON 在 [B1 交付记录](docs/checks/B1-2026-11-04.md)）；系统文件选择对话框、真实手感、安卓与性能仍未人工验证，见“当前重要限制”。

## 开发样例与编辑器现状

- [levels/dev/floor-a.json](levels/dev/floor-a.json)：14×8，出生点在平台，出口 col=5；二段跳可穿过顶部开口。直接 `devplay.html` 时它是下层。
- [levels/dev/floor-b.json](levels/dev/floor-b.json)：10×5，入口 col=2、出口 col=4；与 A 不同宽高、接口偏置。直接 `devplay.html` 时它是上层。
- [levels/demo/t02a-demo.json](levels/demo/t02a-demo.json)：未认证 T02A 演示草稿，含未知对象/路线/extensions，`ports=null`，只能编辑，不能试玩/发布。
- `js/dev-samples.js` 由 `node tools/sync_dev_levels.mjs` 从 `levels/dev/*.json` 生成；测试会检查同步。开发样例不进 `levels/levels.js`、不进正式池。

编辑器已经做到：完整 LevelData 为唯一真值；画地块/出生点/S·x·y 机关；同格同类机关幂等；撤销/重做整份数据（100 步 / 32 MiB）；结构错误导入零替换；IndexedDB 草稿保存/打开/刷新恢复/revision 冲突；缩图先算影响并在候选副本上做容量预检，失效接口完整存进 `extensions.retiredPorts`；「开发试玩(两层)」走新 GameSession。

新运行时 `devplay.html`：两层不同宽高、接口对齐、同一玩家连续攀爬；当前层完整模拟，下一层预热（不攻击），上一层只保留地形快照到再上一层；脚底过线一次只提交一次；底边梯板防回落；`P/Esc` 暂停冻结、恢复不追算。**没有**伤害、敌人、技能、Boss、认证发布或安卓。

## 当前重要限制

- B1 是开发试玩，不是正式发布：没有伤害/敌人/技能/Boss，没有认证/发布；开发样例未认证、不进正式池。
- 没有端口编辑：编辑器不能改接口；没有接口的草稿试玩会被明确拒绝。缩图退役接口只保存到 `extensions.retiredPorts`，修复入口仍未做（T04 后续）。
- 两层是默认样例；四层只用于 Node 生命周期夹具。编辑器试玩的下一层固定为开发样例 B，不是可配置塔。
- 草稿冲突有 Node 双实例回归；真实浏览器只验证了保存→刷新恢复，没有自动双窗口冲突复现。
- 刷新不会恢复**未保存**改动（保存草稿后才恢复）；导出只发起下载，没有“已写入磁盘”的确认。
- 对象只能摆 `S/x/y`（弹簧/门方块/浮石）；火球、地刺、齿轮还没有参数面板/路径绘制/运行行为，演示 JSON 里的这些对象只是保留数据。
- `verified` 未构成可靠发布门槛；旧正式池仍可能抽到未验证关卡；`monsters.js` 只是参数表雏形。
- 当前种子依赖关卡池顺序与内容，不承诺修改池后仍重现旧塔。
- 已有本地 Git 基线 `f56cdce`；T01 `6a7e712`、T01-R `c7c5490`、T02A `f2a0e07`、T02A-R `6f88127`、B1 `fffaee0`。恢复基线先保留当前工作，在独立目录中查看，不直接丢弃未提交修改。

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
| `js/` | 引擎、旧游戏、编辑器、草稿仓库、World/GameSession、开发试玩代码 |
| `devplay.html` | 连续两层开发试玩入口（新 GameSession） |
| `levels/` | 当前 12 张内置 JSON、模板和生成副本 |
| `levels/dev/` | 两张开发样例（A/B，未认证，不进正式池） |
| `levels/demo/t02a-demo.json` | T02A 未认证演示草稿（完整 LevelData，含未知对象） |
| `levels/v2/` | 12 张旧图的未认证迁移草稿（ports=null） |
| `assets/` | 当前贴图 |
| `tools/`、`tests/` | 数据工具、命令行、浏览器检查与真实 Chrome 验收脚本 |

最初设想来自此前讨论的 `reveres_abyss介绍.txt`；该原始文件当前不在 Git 基线或工作目录中，现行目标已整理到 PROJECT 和设计文档。旧 README 已完整保存到 [历史归档](docs/archive/README-legacy-2026-10-30.md)，仅用于理解旧实现，不作为新开发要求。
