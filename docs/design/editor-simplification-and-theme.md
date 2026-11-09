# 编辑器精简、主题与制作流程衔接

2026-11-09验收补充：用户人工测试编辑器无问题，24号通过关闭，本文已实现主体保留。下一步只做 [25号完整塔](../tasks/25-full-tower-formal-game.md)，不重做本文界面/齿轮/主题。以下“待人工/待实施”若仍存在，是24号原设计时状态，以STATUS最新结论为准。

2026-11-08，用户确认试玩齐全无问题，试玩主体验收关闭。当前只做 [24号卡](../tasks/24-editor-simplification-and-theme.md)，**已实施（B4-R8，工作区未提交）**。依据：[B4-R7审计](../checks/review-B4R7-2026-11-08.md)，交付与实测见 [B4-R8 记录](../checks/B4R8-2026-11-08-editor-simplification.md)。普通单图试玩/人工通过优先契约不变，不重新改游戏玩法或增加自动关卡合规检查。

## 1. 移除旧“对象 / 参数 / 路径”表单

移除editor.html旧通用面板及只服务于它的监听、表单刷新/填充、读表单提交方法和说明：obj-list/type/col/row/params/path、添加更新/删除对象，path-list/mode/points、新建/应用/删除路径。不只是display:none，也不保留无效按钮/手填坐标入口。具体删除范围须以引用搜索为准。

**删除的是旧操作界面，不是关卡数据能力。** EditorModel的对象/路径增删、导入导出、撤销重做、裁剪平移/包络，以及运行时对象/路径几何仍保留；有画布或数据消费者的共享方法不能因为名字含object/path就整批删除。已有JSON、自定义参数、路径、未知扩展、历史通过记录均保真，不做自动清空/归一化/孤立路径清扫。

原refreshEditorPanels混合端点坐标与旧表单，清理后保留必要的端点只读标签/工具状态刷新，不再依赖已删除DOM。编辑器新建/打开/保存/主题切换/撤销/画齿轮后均不能因缺DOM崩溃。

齿轮继续调色板选中→画布左键放下→连续左键节点→右键完成，单点静止、90度折线、往返或闭合。将当前面板里的gear-mode迁到画布或素材工具附近，可只在选齿轮时显示精简“往返/闭合”选项；默认/运行参数不变，闭合仍可选择，不暗中全部改成往返。删除已有元素继续用橡皮/撤销，不恢复旧坐标表单。

用户确定未来各种有参数的怪物采用与齿轮类似的元素专属画布交互：选元素→按该元素步骤设置→完成或取消。本轮只写下方向，不新增怪物、不建立抽象框架、不添加新的速度/半径等泛用表单。

## 2. 主题切换

btn-theme只保留一处点击接线（建议移除HTML onclick，使用Editor.wire），原生键盘激活同样一次切换。light/dark状态、body.dataset.theme、按钮说明、CSS变量和画布颜色一致。

主题是编辑器偏好，不改变LevelData/hash/dirty/认证/撤销。合并保存ra_editor_preferences_v1时保留已有autoGrow及其他已知偏好字段，不用切主题重置工作区；保存失败仍可临时切换并明确提示，不报“已保存”。刷新恢复已选主题，无有效偏好时沿用现有系统/浅色回退。字体/输入框/调色板/工具/端点提示两种模式可读，不重做整体风格。

## 3. 齿轮创建事务取消

beginGearGesture必须在任何placeObject/新path写入之前保存完整before快照、原dirty及本次撤销上下文；开始后再记录预览/编辑状态。Esc取消恢复开始前数据和dirty，移除的只能是本次事务的撤销项，不弹掉先前用户操作。已有objects/paths/参数不能受影响。

成功右键结束仍一组撤销/重做；取消零残留、hash恢复、认证与先前数据一致。取消/完成消耗相应按压，防同次操作顺带涂画/平移。不能用“取消其实算完成”掩盖。仅修事务边界，不改路径几何/齿轮运动。

## 4. 导入声明与本地通过的解释一致

本地publish/listEligible与importLevel/certState/publishImported对内容相同、人工通过声明完整的记录采用同一资格判断：内容可读取、普通图、passed/profile受支持、声明hash=当前内容。技术规则版本/指纹记录当次条件，不与当前版本强制相等而否决同一图的历史通过。

仍保留来源差别：外部声明是imported-declaration，不变成本机local-playtest；没有声明或hash变更不能生成通过；导入只存草稿，必须用户明确加入正式池。保存失败/冲突不改池，不清旧认证或篡改原版本字段让其“看似匹配当前”。旧profile可读沿用现有兼容，不恢复旧试玩初始CD20。

同一已通过JSON在本地导出再导入另一浏览器，不应仅因开发版本更新丧失可选性。重复导入同hash时也应采用相同解释，避免首次/再次不同。记录发布时保留原通过条件，不声称已按当前版本重新人工测试。

## 5. 从试玩回到原草稿

trial返回链接/上下文携带原draftId和请求身份，编辑器只在明确从试玩返回时加载该草稿**最新保存版本**，拿到通过记录的新revision。普通直接打开editor仍保留原新建行为，不随便从历史handoff恢复另一图。

复用openDraftById及B1工作区令牌/请求序号/内容变化保护，加载期间用户开始新编辑/切图则不覆盖。身份缺失/草稿删除/读取失败明确提示并保留当前工作，不能另建同名草稿冒充原图。运行时玩家/敌人状态不写回模板。

通过记录异步写回时结果面板显示“保存中/已保存/未保存”，与返回动作协调；失败可重试同一回执、冲突不覆盖新草稿，不把未保存认证当已保存。返回后可直接对原图显式发布，发布不自动触发。

## 6. 旧试玩入口停用

standard.html/devplay.html只能显示历史入口说明与返回编辑器重新发起的链接，不再加载执行standard.js/devplay.js，不消费旧V1/V2会话或写认证。不要只加链接却仍启动三层/CD20游戏。

当前trial.html保留唯一新玩法。旧JS/TrialPlan等若仍被历史工具引用，可先留历史文件但从产品入口断开；只清理确认为无消费者的接线，不借此重写GameSession/World或删legacy.html旧原型。

## 7. 人工验收

一击主题改变→再击恢复→刷新保留，图/dirty不变；旧表单消失且齿轮可选往返/闭合、画线/取消/撤销/擦除/JSON往返正常；试玩完成返回原图、看到通过记录并可显式发布；带历史通过声明同JSON导入不因技术版本被拒，来源正确；旧页不再启动旧游戏。以这些实际操作为主，不运行全量关卡自检/自动寻路，不用计数覆盖人工结论。记录未测范围，不承诺无任何隐藏bug。

## 已实现方式（2026-11-08 B4-R8）

- **面板**：`editor.html` 删除 `obj-list/obj-type/obj-col/obj-row/obj-params/obj-path`、`btn-obj-apply/btn-obj-del`、`path-list/path-mode/path-points`、`btn-path-new/btn-path-apply/btn-path-del`、`edit-status`；`js/editor.js` 删除对应接线与 `fillObjectParams/fillObjectForm/applyObjectForm/deleteObjectUI/parsePathPoints/newPathUI/applyPathForm/fillPathForm/deletePathUI`，`refreshEditorPanels` 只留端点显示。`EditorModel` 的对象/路径/撤销/导入导出/裁剪与运行时几何未动。
- **齿轮**：`gear-mode` 迁到左栏工具区，只在 `ch === '~gear'` 时显示；`beginGearGesture` 在放置前保存 `{json, dirty, undoStack, redoStack, bytes}`，`cancelGearGesture` 只回滚本次事务并置 `consumeUntilRelease`；`finishGearGesture` 完成时同样吃掉这次按压，撤销仍只有一条。
- **主题**：`btn-theme` 只保留 `Editor.wire` 一处 click；`loadPrefs()` 启动读回 `theme/autoGrow`；`savePrefs()` 合并写回（保留其他字段），失败返回 false 并由 `toggleTheme` 明确提示，主题不碰 LevelData/hash/dirty。
- **通过判定**：`ContentRepository.certState`/`publishImported` 不再比较"声明 rules === 当前 rules"，与 `publish`/`listEligible` 统一为"可读 + normal + passed/profile 支持 + 声明 hash = 当前内容"；发布记录里保留声明当时的 rules；同内容重导入不覆盖原声明。
- **试玩返回**：`trial.js` 返回链接带 `editor.html?from=trial&draft=<id>`，结果面板分保存中/已保存/未保存（可重试），保存中点返回先等保存；`editor.js::openTrialReturn()` 只在明确返回时打开该草稿最新 revision，普通直开不读历史 handoff，成功后清查询串。
- **旧入口**：`standard.html`/`devplay.html` 改为无脚本静态说明 + 回编辑器链接，不再执行旧控制器；编辑器里无消费者的 `openStandardPlaytest` 删除。
- 测试：`test_editor` 266/0、`test_editor_gestures` 13/0、`test_b3` 61/0、`browser_editor24` 44/0（真实 Chrome 鼠标/键盘+截图）、`browser_trial23` 40/0 回归、完整 `test_all` 1551/4（4 条历史 floor09/floor11）。真人操作仍未记录。
