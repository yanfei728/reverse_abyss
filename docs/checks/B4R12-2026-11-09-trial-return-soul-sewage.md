# B4-R12 / 28号卡交付记录：未通关返回原稿、灵魂动态贴边、污水池

2026-11-09。工作区在 HEAD `d41e07d` 之上，保留 B4-R7–R12 全部未提交成果、地图、证据和浏览器库；本轮只实施 [28号卡](../tasks/28-trial-return-soul-and-sewage.md)，先修 R1 再加 soul/sewage。没有清池、改原图/四档/test3/Player、重做 25/26/27，也没有 APK。

## A. 未通关返回原稿（优先）

**原因与修复**
- `trial.html` 顶部“← 编辑器”原本是裸 `editor.html`；只有结果页 `btn-done-editor` 绑定了 `draftBackHref()`。
- 顶部链接加 `id="btn-top-editor"`；暂停浮层新增 `id="btn-pause-editor"`。`js/trial.js` 统一 `bindBackLink()` 给顶部/暂停/结果写同一个 `draftBackHref()`，运行/暂停/失败/结果都用本次 `draftRef`。
- 启动失败 `failStartup` 的返回链接也改用同一个 `draftBackHref()`；`lastDraftRef` 从 handoff/plan 取，不凭外部文字伪造身份。
- `setSavePhase` 只有 `saved` 才执行 pendingBack 自动返回；`failed` 清 pending 并停留在结果页显示真实原因，不再借自动返回掩盖失败。
- 编辑器 `openTrialReturn` 只在明确 `?from=trial&draft=` 时调用 `openDraftById` 读取仓库**最新 revision**；普通直接打开 editor 仍新建空白，不读历史 handoff、不覆盖新编辑、不清库。缺失/删除/读取失败给真实提示，不创建同名空稿冒充恢复。
- 原有 workspaceToken/openSeq 并发保护保留。

**证据**
- 修复前（原 B4-R11 验收 JSON 复制保存）：`docs/checks/28-before-return.json`，`topReturnBugReproduced=true`，裸 `editor.html`。
- 修复后：`node docs/checks/review-B4R11-2026-11-09-return.mjs docs/checks/28-after-return.json` 退出0，`topReturnBugReproduced=false`，顶部 href 为 `editor.html?from=trial&draft=review_return_27`，topReturn/boundReturn 都恢复原稿同 ID/hash，存储仍在、内容/revision 未变、certification=null。
- 可见 Chrome `browser_28_return_soul`：真实试玩未通关点顶部返回，草稿同 ID/revision/hash；点暂停再返回也同 ID/revision/hash；截图 `28-return-top-editor-restored.png`。工程库隔离，不写作者 passed。
- 通过记录保存中/失败：代码已按上述行为处理；**本次没有构造真实“通过→保存失败”场景**，列为未测。

## B. 灵魂 soul

- 新 `js/soul-motion.js`：`RA.BlockGeometry` 缓存真实方块图，`RA.SoulMotion` 提供方向、外露边轮廓、附着/直飞/回贴。
- 轮廓来源：本层 terrain1–4、tile5 云板整格、仍存在的门、未 gone 的浮石、弹簧、实存石管 `wallCells`。任何怪物/轨道/链/污水池/灵魂不参与；`isBlockForSoul` 不读 `Player.blockedAt` 或对象外形。
- 固定 `170px/s`（`MonsterRules.speedPx('soul') = V/2`）；初始方向显式 `initialDirection` 0上1右2下3左；运行 `_soul` 的 edge/相位/手性只在实例，不写模板。
- 编辑器：第一左键锁格并算合法方向，鼠标只从合法方向选最近箭头，第二左键提交一个对象/一个撤销；右键或 Esc 取消；无合法方向红提示且不 dirty/不提交；方向阶段保存/试玩/导出被阻止。
- 动态：门 broken / 浮石 gone 后不再计入，恢复再计入；几何 revision 变化时重建轮廓/回贴；失去连续边按当时方向直飞，遇下一块尝试切向回贴，不穿实心/不瞬移。`test_28` 验证单方块、L形凹角、直飞再贴边、移除后不贴附、preview/暂停/入层相位。
- 伤害/光环：灵魂按实际位置接触伤害20；`haloDestroyable(soul)=true`；正式/trial 共用。

## C. 污水池 sewage_pool 与怪物独立性

- 新类型单格、`params={}`、`pathId=null`；固定接触20（`C.MONSTER.sewageDamage`），无实体阻挡、不可击败；持续接触由既有 `session.damage` 的无敌时间控制，耗尽后再扣20；无液体/减速。
- 绘制：半透明绿色单格，先于同格其它怪物绘制，保留底层地形轮廓。
- 怪物放置最小保真：`placeObject` 对全部怪物类型不再擦 terrain/机关/出生点；`brushObject` 不删除同格异类，同类幂等。地形笔刷/明确擦整格仍是实际改图；旧机关工具保留原规则。污水池可连续铺、一笔撤销；同格可与灵魂/火球共存。
- 所有怪物不提供实体碰撞，也不改变灵魂轮廓。

## D. 数据/生命周期

- 注册表 10 类；schema 仍2；`soul.initialDirection` 无静默默认，读取检查拒绝缺失/非整数/越界；soul/sewage 误挂 path 被拒绝。
- 规则升 `b4-9`，不批量废旧认证。
- preview 灵魂先动不伤害、不被当前光环清；入层相位保留；暂停冻结；snapshot 不画/不更新怪物；死亡重试同清单新实例按作者初始方向重置。
- 草稿/JSON/裁剪平移/试玩/显式发布/正式读取走原链路；没有把运行轨迹写入 paths。

## 实际执行

| 命令 | 结果 |
|---|---|
| `node tools/test_28_soul_sewage.mjs` | **45 PASS / 0 FAIL** |
| `node tools/test_all.mjs` | **1778 PASS / 4 FAIL**（4条历史 floor09/floor11） |
| `node tools/test_27_monsters.mjs` | 53 / 0 |
| `node tools/test_26_continuous.mjs` | 39 / 0 |
| `node tools/test_full40.mjs` | 96 / 0 |
| `node tools/browser_28_return_soul.mjs` | **20 PASS / 0 FAIL**，5 张截图 |
| `node tools/browser_27_monsters.mjs` | 16 / 0（历史保留） |
| `node tools/browser_full40.mjs` | 38 / 0 |
| `node docs/checks/review-B4R11-2026-11-09-return.mjs ...` | 退出0，修复后 `topReturnBugReproduced=false` |
| `node tools/test_b3.mjs` | 61 / 0 |

`test_28` 覆盖：方向合法性/对角空格无方向；单矩形170弧长、L形凹角；直飞再贴边；移除方块不瞬移；门/浮石状态变化使几何版本失效；灵魂/池无实体阻挡；池20/无敌期内不重复/到期再扣；光环杀魂不杀池；preview/暂停/相位；编辑器不擦地形/异类共存/同类幂等/裁剪/JSON；测试池构建 TrialSession 共用运动。

`28-dynamic-soul.json`：附着→运动→移除方块后 `attached=false`；浮石 idle 计入、gone 不计入、`blockRevision` 1→2。

## 可见证据

- `28-return-top-editor-restored.png`：真实未通关顶部返回后打开原草稿 revision/hash。
- `28-editor-soul-direction-arrow.png`：第一击锁定、合法方向箭头（鼠标只选合法项）。
- `28-editor-soul-and-sewage.png`：已放灵魂与连续污水池，地形保留。
- `28-trial-soul-sewage.png`：独立试玩中灵魂本体/方向箭头、半透明污水池。
- `28-formal-soul-sewage-floor1.png`：正式塔第1层同样渲染（内存 fixture）。
- `browser-28-return-soul-2026-11-09.json` 逐项20/0。

## 未测/仍需作者

1. **作者真人完整流程尚未执行**：画图→未通关顶部返回→确认原稿；放魂双击/右键；铺池→保存/JSON→试玩→门/浮石变化→失边直飞→K杀魂不杀池→实际通关→显式发布→新塔读取。
2. 通过记录**保存失败**、并发双窗口、真实浏览器持久库删除/缺失引用没有构造真实场景；代码路径已统一，但不能写成人工通过。
3. 正式截图是内存 fixture，不是发布池；没有新 APK/真机；没有全量地图合规/寻路，4条历史 floor09/floor11仍失败。
4. 灵魂轮廓算法为有限本地几何实现，已验证单矩形/L/门/浮石状态/直飞；复杂多层连通/巨大凹腔未人工逐图验证。

## 作者最短人工步骤

1. 打开 `editor.html` 新建普通图，画一块地形；选「灵魂」，在方块相邻空格第一次左键→移动鼠标看合法箭头→第二次左键确认；另一次第一击后右键/Esc确认取消不留对象。
2. 选「污水池」按住在几格上连续铺；保存/导出 JSON 再导入，确认方向、池、地形/异类对象保真。
3. 点试玩，先不通关，点顶部「← 编辑器」，确认回到**原稿同 ID/内容**；再试暂停返回。
4. 进试玩看灵魂沿方块外轮廓运动，移走/恢复门或浮石观察改线；失去依附时应直飞，遇下一块再贴边；K清魂不清池，穿过怪物不掉血，接触池按无敌时间扣20。
5. 实际通关后再显式发布，回 `index.html` 新建完整塔核对读取；不重走41层，未测项照实记录。
