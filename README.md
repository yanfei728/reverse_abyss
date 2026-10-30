# reverse_abyss

一个以自定义关卡编辑器、向上跑酷和技能清场为核心的单机 2D 游戏，使用 HTML、CSS、原生 JavaScript 与 Canvas。

**当前仓库是旧平台跳跃原型，不是已经完成的短塔版。** 2026-10-30 已完成目标与后续开发文档整理；本次未修改游戏代码。下文“运行与操作”描述当前实际程序，后续目标见 [PROJECT.md](PROJECT.md)，进度见 [STATUS.md](STATUS.md)。

## 获取与安装

当前没有安装包，也没有 npm 安装或构建步骤。取得整个项目文件夹，保留 `index.html`、`js/`、`css/`、`levels/`、`assets/` 的相对位置即可。不要只复制 HTML 文件。

- 游玩：使用桌面浏览器，目前按键操作为主。
- 命令行检查：需要 Node.js；本次使用 Node.js `v24.21.0`。
- Android：尚无 APK、Capacitor 工程或可用触控移动。计划先完成 PC 短塔，再开发安卓版本。

## 启动

### 最快启动

双击根目录 `index.html` 打开游戏；双击 `editor.html` 打开编辑器。

`file://` 模式主要读取 `levels/levels.js` 的内嵌关卡。浏览器本地存储与文件操作是否可用取决于环境；请把重要自制地图另存文件。

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
| 编辑器撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z` |
| 编辑器试玩 | `P`，打开 `play.html` |
| 编辑器文件下载 | `Ctrl+S`；目前仍然是旧 TXT 导出 |

旧程序仍有 3～24 层、镜像、淡出换层、坠落回本层起点。这些属于待迁移的旧行为，不是后续产品规范。当前没有生命、光环技能和 Boss，不能使用文档中的未来按键来验证尚未实现的功能。

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
node tools/check_levels.mjs
```

`node tools/test_all.mjs --fast` 可用于快速反馈，但跳过了逐跳模拟，不代替完整检查。`check_levels.mjs` 的寻路结果是辅助诊断，不是人工通关认证。

2026-10-30 在本次会话实测的完整自检基线：

| 类别 | PASS | FAIL |
|---|---:|---:|
| 引擎 | 576 | 4 |
| 编辑器 | 238 | 0 |
| 贴图 | 126 | 0 |
| 合计 | 940 | 4 |

退出码为 `1`。失败是 `floor09`、`floor11` 各被两个入口报告，不能当作四个独立故障，也不能据此宣布两张地图人工不可通。Node 检查使用 DOM/Canvas 替身；贴图检查通过不等于已完成真实画面验收。

人工检查当前原型的方法：

1. 打开游戏，检查左右移动、短跳、二段跳、单向平台与弹簧。
2. 通过出口，观察旧版淡出换层；坠落后观察回本层起点。
3. 编辑一张测试图，试玩并重新打开导出文件；重要原图先备份。
4. 打开浏览器开发者工具，记录异常、复现步骤和所在关卡。

本次未执行这些人工步骤、手机测试或帧率测量。新短塔的验收见 [任务卡](docs/tasks/README.md)，不可用旧行为验收新规则。

## 当前重要限制

- 编辑器的 TXT 链路不能保真保存 JSON 对象、路线、难度等完整信息。
- “保存到游戏”可能先改浏览器池，再尝试磁盘写入；取消选目录并不保证池未改变。
- `verified` 未构成可靠发布门槛；当前随机抽选不排除未验证关卡。
- `monsters.js` 只是参数表雏形，火球尚未成为实际可用的敌人。
- 当前种子依赖关卡池顺序与内容，不承诺修改池后仍重现旧塔。
- 当前目录没有 Git 仓库；后续代码改动前先建立可回退基线。

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
| `js/` | 当前引擎、游戏、编辑器、试玩代码 |
| `levels/` | 当前 12 张内置 JSON、模板和生成副本 |
| `assets/` | 当前贴图 |
| `tools/`、`tests/` | 数据工具、命令行与浏览器检查 |

最初设想保留在 [reveres_abyss介绍.txt](reveres_abyss介绍.txt)。旧 README 已完整保存到 [历史归档](docs/archive/README-legacy-2026-10-30.md)，仅用于理解旧实现，不作为新开发要求。
