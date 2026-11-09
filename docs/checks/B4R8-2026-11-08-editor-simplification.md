# B4-R8 交付记录：24号卡编辑器精简、主题与制作流程衔接（PC）

2026-11-08，实施 [24号卡](../tasks/24-editor-simplification-and-theme.md)。基线 HEAD `d41e07d`，实际改在尚未提交的 B4-R7 工作区之上；23号卡已被用户人工确认关闭，本次**没有**重做试玩主体、没有改物理/关卡数据/地图/素材/`levels/*.json`、没有构建 APK、未提交推送。Android 仍是 0.3.2（不含本轮）。

## 1. 移除旧「对象 / 参数 / 路径」表单

- `editor.html` 删除整块旧面板：`obj-list`/`obj-type`/`obj-col`/`obj-row`/`obj-params`/`obj-path`、`btn-obj-apply`/`btn-obj-del`、`path-list`/`path-mode`/`path-points`、`btn-path-new`/`btn-path-apply`/`btn-path-del`、`edit-status`。
- `js/editor.js` 删除只服务这些控件的接线与读表单方法：`selectedObject`、`fillObjectParams`、`fillObjectForm`、`applyObjectForm`、`deleteObjectUI`、`parsePathPoints`、`newPathUI`、`applyPathForm`、`fillPathForm`、`deletePathUI`；`refreshEditorPanels` 只保留端点只读显示与提示（不再依赖已删 DOM），`syncUI` 的可禁用 id 列表同步清理。
- **数据能力没有删**：`EditorModel` 的 `placeObject/updateObject/removeObject/addPath/updatePath/removePath/pathId`、撤销重做、导入导出、裁剪/平移、运行时对象/路径几何都保留；已有 JSON 的对象、路径、自定义参数、未知 extensions 原样保留（检查见下）。
- 用 `tests` 静态检查 + 真实浏览器断言"旧控件不存在、模型对象/路径仍在"。

## 2. 齿轮专属画布工具

- `gear-mode`（往返 pingpong / 闭合 loop）从旧面板迁到左栏工具区，只在调色板选中「路径齿轮」时显示（`gear-mode-row` + 一行提示），默认仍是 `pingpong`，闭合仍可选；`beginGearGesture` 读同一控件（`gearRouteMode()`），未暗中全部改成往返。
- 画布流程保持：选中齿轮 → 左键放下 → 连续左键按直角加节点 → 右键完成；单点静止、90° 折线、loop/pingpong 由 `RA.PathGeometry` 原样实现，运动/碰撞未改。
- **取消事务修正**：`beginGearGesture` 现在在 `placeObject`/建 path **之前**保存快照 JSON、`dirty`、整个 undo/redo 栈与字节计数；`cancelGearGesture` 只回滚本次事务（模型、dirty、undo/redo），并按 Esc 后吃掉这次按压（`consumeUntilRelease`），不会同一次按下又放一个齿轮，也不会弹掉用户之前的撤销。右键完成仍只留一条撤销，`consumeUntilRelease` 防止完成同一下顺势平移/涂画。

## 3. 主题双绑定修复

- `editor.html` 的 `btn-theme` 去掉内联 `onclick`，只保留 `Editor.wire` 的一次 click 接线；鼠标点击与键盘激活都只切一次。
- `toggleTheme` 改走合并保存的 `savePrefs()`：保留 `autoGrow` 与其他已有偏好字段，只覆盖 `theme/autoGrow`；启动时也从偏好读回 `autoGrow`（原来只读主题）。保存失败仍临时切换并明确提示"偏好保存失败"，不谎报已保存。
- 主题只写 `ra_editor_preferences_v1`：不改 LevelData、`contentHash`、`dirty`、通过记录；暗/浅两套 CSS 变量与画布绘制沿用原实现。

## 4. 本地与 JSON 导入的通过判定统一

- `certState`（导入）与 `publishImported`（加入正式池）不再要求"声明里的 rulesVersion/rulesFingerprint === 当前版本"；与本地 `publish`/`listEligible` 同一解释：**内容可读、普通图、passed、profile 受支持、声明 hash = 当前内容**。技术版本/指纹只作记录。
- 来源仍分开：外部声明一律保留 `imported-declaration`，不变成本机 `local-playtest`；导入只存草稿，必须用户明确加池；无声明/改图 hash 不同不能生成通过。
- 发布记录保留**声明当时的** rules 字段（不再改写成本版本冒充重新测试）；同内容重复导入保持原声明、不覆盖、不递增 revision。
- 旧 `standard-v1` 仍可被接受（历史记录兼容），不恢复旧 CD20 玩法。

## 5. 从试玩返回原草稿

- `trial.js`：结果页「返回编辑器」链接改为 `editor.html?from=trial&draft=<draftId>`；保存状态分 `保存中 / 已保存 / 未保存(原因)` 显示在结果面板与底部状态，失败时出现「重试保存记录」按钮（复用同一回执）；保存中点返回会等保存完成再跳转，不误报已保存。
- `editor.js` 新增 `openTrialReturn()`：**只有**查询串带 `from=trial&draft=` 时才自动打开该草稿的最新已保存 revision（含试玩写回的通过记录），复用 `openDraftById` 的 B1 工作区令牌 / 读取序号 / 内容变化保护；普通直接打开 `editor.html` 不读历史 handoff、保持原新建行为；打开成功清掉查询串，失败明确提示并保留当前工作，不新建同名草稿。
- 返回后可直接点「发布」，发布不自动触发。

## 6. 旧试玩入口停用

- `standard.html`、`devplay.html` 改成纯静态历史说明页：不再加载 `js/standard.js` / `js/devplay.js`（页面里没有脚本），不消费 `RA_STANDARD_V1`/V2，不启动三层/CD20 控制器、不写认证；每页都有「← 回编辑器(用「▶ 试玩」)」。
- 旧 JS 文件、TrialPlan、开发样例、旧草稿与历史证据都保留；编辑器里原来无消费者的 `openStandardPlaytest` 方法已删除。
- 产品入口只剩 `trial.html`。

## 实际运行结果

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_editor.mjs` | **266 PASS / 0 FAIL**（新增主题单接线/偏好合并/旧面板移除/齿轮工具/试玩返回 38 项） | 0 |
| `node tools/test_editor_gestures.mjs` | **13 PASS / 0 FAIL**（新增齿轮取消零残留/撤销保留） | 0 |
| `node tools/test_b3.mjs` | **61 PASS / 0 FAIL**（导入声明与本地同解释的新断言） | 0 |
| `node tools/browser_editor24.mjs`（真实 Chrome 156 headless + 真实鼠标/键盘） | **44 PASS / 0 FAIL** | 0 |
| `node tools/browser_trial23.mjs`（23号卡回归） | **40 PASS / 0 FAIL** | 0 |
| `node tools/browser_b2.mjs`（改后回归） | **20 PASS / 0 FAIL** | 0 |
| `node tools/test_all.mjs` | **1551 PASS / 4 FAIL** | 1 |

4 条失败仍是历史 `floor09`/`floor11` 逐跳可达诊断（各重复一次），本卡未修、未跳过。`browser_b4.mjs` 仍为历史脚本，本轮只把旧标准页断言改成"已停用"并给画布点击加了一帧按住；它还有 4 条**早于本卡的过时断言**（`lobby-direct` 期望 vs 现实现 `lobby-transfer`、`btn-start-apply/btn-finish-apply` 这两个已不存在的 id、以及依赖它们的逐层步进），不是 24 号卡引入，也不在 test_all 门槛内。为验证改过的旧脚本，本轮重跑过 `browser_b2`/`browser_b4`；它们写出的历史证据文件（`b2r1-browser-*.png`、`b4-*.png`、`browser-b2r1/b4-*.json`）已用 git 恢复为原字节，只保留本轮新增的 `b2r1-browser-editor-after-24.png`、`b2r1-browser-standard-disabled.png`、`b4-old-standard-disabled.png`。

## 真实页面屏幕检查（脚本化，不是人工验收）

`tools/browser_editor24.mjs` 用真实 Chrome 打开真实 `editor.html`，用 DevTools 协议发真实鼠标/键盘事件：

1. 旧 `obj-*`/`path-*` 控件不存在；齿轮控件默认隐藏，选「路径齿轮」后出现。
2. 主题：设为深色后刷新仍深色；点一次按钮 **dark→light 只变一次**，`hash/dirty` 不变，偏好 JSON 保留 `autoGrow:true` 与自定义字段；刷新仍是新主题；再点一次恢复。
3. 齿轮：选闭合 → 画布左键放下、连续左键加点 → 右键完成得到 4 角 loop，只留一条撤销；Ctrl+Z 撤整组、Ctrl+Shift+Z 重做；橡皮能删；再放齿轮按 Esc → 齿轮/路径零残留、hash/dirty/undo/redo 恢复，随后 Ctrl+Z 能撤销取消前的那一步。
4. JSON：导出 → 共用解码读回，内容（对象/路径/extensions）与 hash 一致；用导出的文本重开仍保真。
5. 试玩返回：真实按键上穿 finish → 记录保存成功 → 返回链接带 `from=trial&draft=…` → 点链接回到编辑器并自动打开原草稿最新 revision 2、看得到 `run-v1` 通过记录 → 点「发布」后正式池出现该图。
6. 旧 `standard.html`/`devplay.html`：无 `RA.standard`/`RA.devplay`，只有"已停用"说明和回编辑器链接。

截图（`docs/checks/`）：[浅色](editor24-theme-light.png)、[深色](editor24-theme-dark.png)、[齿轮完成](editor24-gear-finished.png)、[齿轮取消](editor24-gear-cancel.png)、[试玩通过](editor24-trial-pass.png)、[返回原草稿](editor24-trial-return.png)、[旧标准页停用](editor24-old-standard.png)、[旧开发页停用](editor24-old-devplay.png)。逐项 JSON：[browser-editor24-2026-11-08.json](browser-editor24-2026-11-08.json)。

注意：这是**脚本化真实浏览器检查**，不是作者/用户的人工验收；测试图只写进本次临时浏览器的 IndexedDB（`--user-data-dir` 是临时目录），没有写 `levels/`、没有给用户地图伪造通过记录。

## 仍未完成 / 需要人工确认

- 作者本人用鼠标在真实窗口里：切主题/刷新、画齿轮往返与闭合、Esc 取消后撤销、JSON 导出再打开、试玩返回原图发布——**本轮没有人工操作**，不能记作人工验收。
- 主题在两种模式下控件/文字/画布的可读性、齿轮画线手感、Esc/右键的节奏需真人判断。
- `browser_b4.mjs` 的 4 条过时断言（见上）仍是历史脚本问题，未在 24 号卡范围重写；正式短塔/跨层主链路以 test_all 与既有 23 号卡检查为准。
- 首次/重复导入"通过声明"的判定改为与本地一致后，旧的"旧规则声明不可入池"断言已按新契约替换；把旧声明当成本机重新测试仍不允许。
