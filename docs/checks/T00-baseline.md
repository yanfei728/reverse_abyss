# T00 — 可回退基线记录

记录日期：2026-10-30 17:22（本机时间）。
本文件对应任务卡 [T00](../tasks/01-foundation.md#t00--建立可回退基线)，只记录基线、环境和未测项；不修改游戏、关卡或贴图。

## 1. 环境

| 项 | 实际值 |
|---|---|
| 操作系统 | Microsoft Windows 11 家庭中文版，版本 `10.0.26200` |
| Node.js | `v24.21.0`（`node --version` 实测） |
| Git | `2.53.0.windows.2`（本次新建仓库前系统已装 Git，仓库此前不存在） |
| 浏览器 | 本次会话**没有**可操作的图形浏览器，未做浏览器人工检查（见第 5 节） |
| 静态服务器 | 未启动；README 里的 `python -m http.server` 在本机不可用，`file://` 与 `http://` 两种打开方式都未实测 |
| 工作目录 | `C:\Users\beilu\Documents\blwork\reverse_abyss`（本次开始前不是 Git 仓库） |

## 2. 原型入口

| 入口 | 文件 | 当前作用 |
|---|---|---|
| 游戏 | `index.html` + `js/main.js` | 标题 → 爬塔 → 旧版淡出换层；`levels/levels.js` 是内嵌关卡数据 |
| 编辑器 | `editor.html` + `js/editor.js` | 画图、撤销重做、缩放平移、试玩、下载 TXT、写 `levels/` 文件夹 |
| 试玩页 | `play.html` + `js/playtest.js` | 编辑器开出的单层试玩 |
| 浏览器自检 | `tests/browser.html` | 与 `tools/test_engine.mjs` 同一份检查在浏览器里跑 |
| 命令行自检 | `tools/test_all.mjs` | 依次跑 `test_engine.mjs`、`test_editor.mjs`、`test_assets.mjs` |

## 3. 基线自检（原始退出码）

命令（项目根目录，2026-10-30）：

```powershell
node tools/test_all.mjs
```

| 类别 | PASS | FAIL |
|---|---:|---:|
| 引擎 | 576 | 4 |
| 编辑器 | 238 | 0 |
| 贴图 | 126 | 0 |
| **合计** | **940** | **4** |

退出码：`1`。完整原始输出保存在 [T00-test_all-baseline.txt](T00-test_all-baseline.txt)（1067 行，未删改）。

失败项（2 个真实问题，各被两个检查入口重复报告，共 4 条 FAIL）：

- `floor09 从起点爬得到出口(逐跳物理模拟)`：最高只到第 4 行。
- `floor11 从起点爬得到出口(逐跳物理模拟)`：最高只到第 2 行。

这两条是**旧编辑器的自动可达性诊断**，不是人工通关结论；`floor11` 还涉及浮石动态平台，静态搜索不能代替人工判定。本次未修改这两张地图，也不把“基线全绿”当作目标。

## 4. 文件清单与来源指纹

本次基线共 84 个文件（不含 `.git/`）：25 个 `.js`、17 个 `.png`、13 个 `.json`、13 个 `.md`、8 个 `.mjs`、4 个 `.html`、2 个 `.css`、2 个 `.txt`。

12 张内置关卡 + 模板的 SHA-256 前 16 位（用于确认 T01 迁移**没有改动原文件**）：

| 文件 | SHA-256 前 16 位 |
|---|---|
| `levels/floor01.json` | `2a7aea26b70438a4` |
| `levels/floor02.json` | `aac7c7ede732a40b` |
| `levels/floor03.json` | `0059bd18a9e5338e` |
| `levels/floor04.json` | `c7ae562dc83657f3` |
| `levels/floor05.json` | `435fd7285338fee0` |
| `levels/floor06.json` | `996cd9cf7cfb3937` |
| `levels/floor07.json` | `b7a68021d0a51fdd` |
| `levels/floor08.json` | `66991eca5da4587b` |
| `levels/floor09.json` | `734214a0d959013d` |
| `levels/floor10.json` | `5f332b141d46fa5a` |
| `levels/floor11.json` | `dade2cdf424800ac` |
| `levels/floor12.json` | `de48315c776627e9` |
| `levels/_template.json` | `b1a033ab4f2f4450` |

完整文件清单由 Git 跟踪：`git ls-files`（同时留了一份快照 [T00-file-manifest.txt](T00-file-manifest.txt)）。

## 5. 回退方式

基线已经提交为 Git 仓库（本地，无远程、无上传）：**基线提交 `f56cdce`**（87 个文件）。

```powershell
Set-Location 'C:\Users\beilu\Documents\blwork\reverse_abyss'
git log --oneline            # f56cdce 就是 T00 基线提交
git status                   # 应显示工作树干净
git checkout -- .            # 丢弃全部未提交改动，回到基线
git checkout <基线提交号> -- .   # 只把文件恢复到基线内容（不动当前 HEAD）
```

仓库只包含本目录下的项目文件；`.gitignore` 只排除 `Thumbs.db`、`desktop.ini`、`*.tmp`、`*.crdownload`，本地 `log.txt`、`levels/`、`assets/`、编辑器数据都照常入库。不要用 `git clean -xfd` 清理用户自制内容。

## 6. 未执行项（不能当作已完成）

- 浏览器人工检查：左右移动、短跳、二段跳、单向平台、弹簧、出口换层、编辑器画图与试玩。本次没有可操作浏览器，**全部保留未测**。
- 编辑器写 `levels/` 文件夹、下载 TXT、`sessionStorage` 传试玩：未在真实浏览器里跑。
- 安卓真机、帧率、触控：本阶段不涉及。
- 自检使用 DOM/Canvas 替身，只能证明相应逻辑断言通过，不证明画面与手感。

## 7. 基线后的下一步

按 [STATUS](../../STATUS.md) 与 [任务卡](../tasks/README.md)：T01（新 LevelData 契约、无损迁移）→ T02（编辑器 JSON 往返与草稿仓库）。本次只做 T00+T01，不提前改运行时与玩法。
