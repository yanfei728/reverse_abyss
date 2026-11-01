# reverse_abyss

一个以自定义关卡编辑器、向上跑酷和技能清场为核心的单机 2D 游戏，使用 HTML、CSS、原生 JavaScript 与 Canvas。

**当前可玩内容仍是旧平台跳跃原型。** 2026-10-31 交付的 T02A 已将编辑器接到完整 LevelData，支持普通 JSON 打开/画图/撤销重做/导出重开；2026-11-01 独立验收发现 A1～A3，当前待修，尚未验收完成。草稿仓库（T02B）、正式试玩（T03/T04）与发布认证（T06）还没有实现。游戏本体仍读取旧 `levels/levels.js`；当前事实见 [STATUS.md](STATUS.md)。

## 获取与安装

当前没有安装包，也没有 npm 安装或构建步骤。取得整个项目文件夹，保留 `index.html`、`js/`、`css/`、`levels/`、`assets/` 的相对位置即可。不要只复制 HTML 文件。

- 游玩：使用桌面浏览器，目前按键操作为主。
- 命令行检查：需要 Node.js；本次使用 Node.js `v24.21.0`。
- Android：尚无 APK、Capacitor 工程或可用触控移动。计划先完成 PC 短塔，再开发安卓版本。

## 启动

### 最快启动

双击根目录 `index.html` 打开游戏；双击 `editor.html` 打开编辑器。

`file://` 模式主要读取 `levels/levels.js` 的内嵌关卡。编辑器的 JSON 导入导出走浏览器文件选择/下载，不依赖服务器；**导出只发起下载，不会写进 `levels/`**。刷新页面不会恢复草稿（T02B 才做草稿仓库），重要内容请自己保存 JSON 文件。

### 本地 HTTP 启动（开发推荐）

在项目根目录启动一个静态文件服务器。例如，**安装并配置 Python 后**可在 PowerShell 执行：

```powershell
Set-Location 'C:\Users\beilu\Documents\blwork\reverse_abyss'
python -m http.server 8000 --bind 127.0.0.1
```

然后打开：

- 游戏：<http://127.0.0.1:8000/index.html>
- 编辑器：<http://127.0.0.1:8000/editor.html>
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
| 编辑器试玩 | 暂不可用（T03/T04 接通前禁用,不会转成旧 TXT） |

旧程序仍有 3～24 层、镜像、淡出换层、坠落回本层起点。这些属于待迁移的旧行为，不是后续产品规范。当前没有生命、光环技能和 Boss，不能使用文档中的未来按键来验证尚未实现的功能。编辑器现在的导出格式是 v2 JSON,旧 `play.html` 只认 TXT,所以编辑结果暂时不能直接进游戏试玩或发布。

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
node tools/browser_t02a.mjs
node tools/browser_t02a_r.mjs
node tools/check_levels.mjs
```

`node tools/test_all.mjs --fast` 可用于快速反馈，但跳过了逐跳模拟，不代替完整检查。`check_levels.mjs` 的寻路结果是辅助诊断，不是人工通关认证。两个 `browser_t02a*.mjs` 需要本机 Chrome/Edge（默认先找 `C:\Program Files\Google\Chrome\Application\chrome.exe`，失败再试 Edge），会用 headless 模式和 DevTools 协议做真实鼠标画图、撤销/重做、缩放平移、导出下载与重新打开，并保存截图；T02A-R 脚本另外验证机关长按、坏接口导入与缩图确认。

2026-10-30 在本次会话实测的完整自检基线：

| 类别 | PASS | FAIL |
|---|---:|---:|
| 引擎 | 576 | 4 |
| 编辑器 | 238 | 0 |
| 贴图 | 126 | 0 |
| 合计 | 940 | 4 |

退出码为 `1`。失败是 `floor09`、`floor11` 各被两个入口报告，不能当作四个独立故障，也不能据此宣布两张地图人工不可通。Node 检查使用 DOM/Canvas 替身；贴图检查通过不等于已完成真实画面验收。

2026-10-31 独立复验（T01-R 修复后）：1188 PASS / 4 FAIL（引擎 587/4、编辑器 238/0、贴图 126/0、数据 139/0、修复自检 98/0），见 [T01-R 复验报告](docs/checks/review-T01R-2026-10-31.md)。随后 T02A 把编辑器测试改成新契约测试：旧 TXT 导出/保存到游戏/改池相关断言按目标替换，画图、撤销、缩放等回归保留。

2026-10-31 T02A 完成后实测：`node tools/test_all.mjs` 为 1089 PASS / 4 FAIL；`node tools/browser_t02a.mjs` 为 18 PASS / 0 FAIL。编辑器 PASS 数从 238 降到 139 是测试范围变化，不是删断言凑数：旧 TXT/保存到游戏/旧池测试被替换成新契约测试，证据见 [T02A 交付记录](docs/checks/T02A-2026-10-31.md)。

2026-11-01 T02A-R 修复后实测：`node tools/test_all.mjs` 为 **1143 PASS / 4 FAIL，退出码 1**（引擎 587/4、编辑器 193/0、贴图 126/0、数据 139/0、修复自检 98/0）；`node tools/browser_t02a_r.mjs` 为 **21 PASS / 0 FAIL**（Chrome 156 headless；真实按住机关画笔、坏接口导入、缩图取消/确认/撤销）。4 条失败仍是 floor09/floor11，未修、未跳过。证据见 [T02A-R 交付记录](docs/checks/T02A-R-2026-11-01.md)；验收方 2026-11-01 的 Chrome 启动失败记录与旧 18/0 证据都保留，新证据不覆盖旧证据。

迁移工具 `tools/migrate_levels.mjs` 现在是“先规划后写入”：`--in` 与 `--out` 相同（含大小写/别名）、输出 id 碰撞、报告落到源文件上都会在写入前失败；内容不同的既有输出默认不覆盖，需显式 `--force`。报告必须放在输入目录之外，例如默认的 `docs/checks/`。本次没有重写已交付的 `levels/v2/`（12 张全部幂等跳过）。

已知工具限制 N01：自定义报告目录需预先创建；不存在时可能生成输出后写报告失败。源文件受保护，但工具不是多文件事务。该限制不影响下一步编辑器直接使用共享编解码模块。

人工检查当前原型的方法：

1. 打开游戏，检查左右移动、短跳、二段跳、单向平台与弹簧。
2. 通过出口，观察旧版淡出换层；坠落后观察回本层起点。
3. 打开编辑器，用「打开 JSON…」载入 [演示关卡](levels/demo/t02a-demo.json)，画几格、撤销/重做、滚轮缩放、右键平移，再「导出 JSON」并重新打开导出的文件；确认对象、路线、背景、extensions 与未知字段都还在。
4. 打开浏览器开发者工具，记录异常、复现步骤和所在关卡。

T02A 的浏览器交互已经用真实 Chrome headless 跑过（截图与 JSON 证据在 [T02A 交付记录](docs/checks/T02A-2026-10-31.md)）；文件选择对话框、真实手感与安卓仍未人工验证，见“当前重要限制”。

## 演示 JSON 与编辑器现状

[levels/demo/t02a-demo.json](levels/demo/t02a-demo.json) 是一份**未认证**的 T02A 演示草稿：难度 3、两个带参数对象（火球/齿轮）、一条 pingpong 路线、背景 `sky3`、装饰、extensions，以及一个未知对象（带额外 `behavior` 字段和待修复的 `pathId`）。它有意保持 `ports=null`，不能试玩/发布。用编辑器「打开 JSON…」即可载入、修改、导出。

编辑器已经做到：完整 LevelData 为唯一真值（没有第二份字符地图）；S/x/y 机关、出生点、地块可画；同一格重复画同类机关不会堆叠（保留原 id/参数/未知字段），换类型才覆盖；撤销/重做保存整份数据（100 步 / 32 MiB 预算）；导入导出走同一 LevelCodec，结构错误的导入不会被替换进来；未知对象和未知字段可见、可保留；缩小地图先列影响再确认，接口放不下时会把原 `ports` 完整存进 `extensions.retiredPorts` 再置空。还没做：IndexedDB 草稿（T02B）、正式试玩（T03/T04）、端口编辑与保护区可视化（T04）、发布认证（T06）。

## 当前重要限制

- T02A-R 已修复 A1～A3（画笔堆叠、坏导入替换、缩图接口），等待复验；证据见 [T02A-R 交付记录](docs/checks/T02A-R-2026-11-01.md)。
- 编辑器刷新页面不会恢复草稿；导出只发起浏览器下载，没有“已保存到磁盘”的确认（T02B 解决）。
- 新格式不能试玩/发布：`play.html` 只认旧 TXT，正式会话与端口工具在 T03/T04；编辑器不会偷偷转成旧 TXT。
- 编辑器的出口仍是 `ports=null`：旧 G 只作为迁移信息显示，不能画一个 G 伪造合格接口；完整接口编辑在 T04。
- 缩图导致接口失效时只把原 `ports` 完整保存到 `extensions.retiredPorts` 并置空，编辑器暂不提供修复入口（T04）；撤销可以还原。
- 对象只能摆 `S/x/y`（弹簧/门方块/浮石）；火球、地刺、齿轮还没有参数面板与路径绘制（T05/T06），演示 JSON 里的这些对象只作为数据保留并显示占位。
- `verified` 未构成可靠发布门槛；当前随机抽选不排除未验证关卡；`monsters.js` 只是参数表雏形。
- 当前种子依赖关卡池顺序与内容，不承诺修改池后仍重现旧塔。
- 已有本地 Git 基线 `f56cdce`；T01 实现 `6a7e712`、T01-R 修复 `c7c5490`、T02A 交付 `f2a0e07`。恢复基线先保留当前工作，在独立目录中查看，不直接丢弃未提交修改。

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
| `js/` | 当前引擎、游戏、编辑器、试玩代码 |
| `levels/` | 当前 12 张内置 JSON、模板和生成副本 |
| `levels/demo/t02a-demo.json` | T02A 未认证演示草稿（完整 LevelData，含未知对象） |
| `levels/v2/` | 12 张旧图的未认证迁移草稿（ports=null） |
| `assets/` | 当前贴图 |
| `tools/`、`tests/` | 数据工具、命令行、浏览器检查与真实 Chrome 验收脚本 |

最初设想来自此前讨论的 `reveres_abyss介绍.txt`；该原始文件当前不在 Git 基线或工作目录中，现行目标已整理到 PROJECT 和设计文档。旧 README 已完整保存到 [历史归档](docs/archive/README-legacy-2026-10-30.md)，仅用于理解旧实现，不作为新开发要求。
