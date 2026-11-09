# 完整40层塔、正式入口与普通池重置

2026-11-09，**25/26完整塔主流程本轮验收通过**，用户确认人工走完41层无问题。此前缺图/云板管壁故障由B4-R10修复，见 [验收](../checks/review-B4R10-2026-11-09.md)。本文件布局/四档/test3/一次性清池契约保持，不重清池。下一轮 [27号卡](../tasks/27-element-configuration-and-publishing.md) 只完善现有元素配置与发布核对，另收尾N04/N05。

## 1. 已确认布局与玩家流程

| 层号 | 内容 | 离开方式 |
|---|---|---|
| 0 | 已验测试出生场景level0 | 原出生点提示F，一次传送到1层 |
| 1–9、11–19、21–29、31–39 | 普通层，共36个 | 原两格云板/2×3净空石管，真实连续换层 |
| 10、30 | 已验rest_level，各独立实例 | 各进场一次回复40，封顶100，之后正常石管上行 |
| 20 | 已验Boss测试场景，现有两阶段技能 | 击败后不胜利，显示“按F进入21层”，按F一次传送21层start |
| 40 | 同一Boss测试场景的新实例 | 击败后完整塔胜利，无finish/下一层 |

0到40共41个槽位，不把大厅算成第1层；固定位置不被普通图/test3覆盖。没有19层后直接胜利，休息/Boss不自由编辑。本轮两个Boss都沿用已有两阶段技能和中心10.5/14.5，不新增技能/数值打磨。

普通游玩初态run-v1：100生命、技能开局可用、14秒活动/施放起CD20秒。普通跨层/F传送都保留同一Player、HP/CD/活动光环等本局状态；F仅重置必要空间速度/落地跳跃状态以安全放到start，不重建玩家或无故回血。暂停/失焦冻结；死亡返回0层/重试同一份不可变塔清单，不读取新池重抽。用户明确新开一塔才重新抽选。

## 2. 普通抽选与test3补位

正式池为作者在编辑器确定1–4档难度、实际试玩通过后明确发布的普通内容，按difficulty分桶抽取。不能全池混抽，也不能用别档正式图填本档缺口。

| 正式难度 | 对应普通楼层 | 本档容量 |
|---|---|---:|
| 1 | 1–9 | 9 |
| 2 | 11–19 | 9 |
| 3 | 21–29 | 9 |
| 4 | 31–39 | 9 |

每档按seed打乱候选，按`levelId+contentHash`无放回取最多9个；不足的本档位置全部补test3，并只在本档9个位置内按seed分布，不把36项跨档重洗。补位数量为`sum(max(0,9-N[d]))`，不能按总池数量计算。例如只有12个难度1正式图：选9个放1–9层，其他27个普通位置用test3；不会把剩余难度1图放到更高档。池空时36个普通位置全部test3，不能再报EMPTY_POOL。

“忽略难度”只适用于`source='fallback'`的test3：它能补任意档空位，无需改写模板自身difficulty，更不能因此取消正常关卡难度选择。普通已发布图必须有有效整数difficulty=1..4，缺失/非法时明确提示作者补选并重新试玩，不默认为1。难度属于现有内容hash，修改难度会使旧通过不再匹配；试玩/发布核对该元数据，不恢复任何几何/净空/可达性自检。

每份补位引用同一不可变模板版本，但运行对象/路径进度/门/浮石/计时必须各层独立。test3是用户授权的**内置补位例外**，来源fallback，不是人工通过/已发布声明；不写passed、不偷偷加入发布池，不为复用模板伪造认证。

输入源为`开发示例关卡/test3.json`（21×24，原SHA见审计），当前ports=null且原id与test1/2重复。生成独立可读运行副本，沿用已验start=(1,20)、finish=(1,2)，给稳定独立运行身份、重新计算hash，certification=null。保留原网格/尺寸/空白/参数/extensions；不能直接把null端点原件塞进GameSession，也不能重画/裁剪/扩大共用JSON语法。

大厅/休息/Boss优先复用已验`levels/authored/fixed/`运行副本，其地形已核对与迁移后源文件一致；来源登记更新到新目录。level0两裸x仍只作这张固定图的精确一次性转换，出生centerCol10/feetRow20；休息start13,18/finish1,8；Boss start1,20/finish=null。原始文件只读，不因重复使用改原id/kind/端点。打包脚本/内嵌数据支持file://，HTTP不枚举目录猜文件；新源路径和生成产物职责明确，产物不用手改。

## 3. 清空旧普通池：用户已明确授权

范围已确认：旧内置普通候选与浏览器published池全部清空；保留drafts及其中原始内容/通过历史、作者原JSON、固定场景、主题/触控偏好。不得deleteDatabase、localStorage.clear或递归删除levels/。无需再次询问清池权限。

旧活动内置普通目录目前为levels/floor01..floor12及其levels.js/LEVEL_DATA/LEVEL_TEXT选择入口。将旧活动图归档后移出活动目录/清空活动catalog，生成或切换到空普通catalog，正式入口和编辑器普通池列表不得再枚举它们。原件可留只读归档供历史引用，不能继续作为当前候选/默认回退。更新旧同步工具，使空池是合法结果，不能重新生成旧图或偷偷seed测试图。测试/旧原型所需历史数据显式引用归档，不通过当前池重新激活。作者test1/2/3原件与固定场景保留；本轮完整塔仅test3作补位。

浏览器池按每个origin/数据库执行一次重置，之后新发布/导入并明确入池的关卡必须保留。建议epoch=`full40-pool-reset-2026-11-09`：

```text
Repository.ensurePoolEpoch(epoch) -> Result<{epoch, resetApplied}>
  IndexedDB同一readwrite事务：检查metadata标记；未应用时clear published + 写标记；提交后才成功。
  已应用则不清；事务失败不写“成功”，可重试。
```

当前ra_drafts为DB_VERSION=2、drafts/published两store；可升3新增metadata，升级只create缺失store，保留草稿。内存适配同语义。避免localStorage标记与DB清除分别成功、双标签并发重复清池。编辑器发布/导入入池、正式读池都先通过同一epoch准备，不能作者先发布新图、进入游戏时才被“首次重置”删掉。

给新发布记录记录当前poolEpoch（不进LevelData/hash），候选只取当前epoch，防旧页面写入无epoch记录混回池；旧无epoch记录不能自动冒充新发布。新程序下用户主动重新发布旧草稿可加入新池，必须是明确动作。数据库升级被旧页阻塞/写入失败给可见提示，不假报清空。不是每次开局/启动都清池，也不要求用户手动清站点数据。

## 4. Manifest与实例身份

扩展共用TowerPlanner按layout生成正式完整塔，不复制玩法循环。可保留短塔诊断布局，但正式入口默认full40-v1，不把调试短塔当主游戏。

```js
TowerPlanner.build({
  layout:'full40-v1', seed, candidates, poolEpoch,
  fixedLevels:{lobby,rest,boss}, fallback: /* 规范test3副本 */
}) -> Result<{
  manifestId, layout:'full40-v1', profile:'full40-v1',
  gameplayProfile:'run-v1', seed, poolEpoch,
  floors:[ // 0..40，每项都有真实data或可解析的精确引用，不能留undefined
    {floorNumber, kind, source:'fixed'|'published'|'fallback', requiredDifficulty, // 普通槽为1..4，固定槽可空
     levelId, contentHash, data, exitAction:'pipe'|'lobby-transfer'|'boss-transfer'|'victory'}
  ]
}>
```

layout/profile是塔布局身份，gameplayProfile是玩家初态，不把full40-v1当成特殊CD玩法。manifestId包含布局、seed和各槽精确内容/来源/动作，重试不按模板id重新解析最新内容。生成后冻结/深复制模板快照；发布池变动不影响已开始的塔。

普通槽的requiredDifficulty由层号确定；source=published时必须与模板difficulty一致，source=fallback时允许test3原难度与目标档不同。这个区别只放槽位元数据，不改模板/hash；固定出生/休息/Boss不参与普通难度分桶。

World每次_spawn都给实例设置局内稳定唯一instanceId（至少槽号+模板身份），包括后续preview层，不只给初始0/1赋值；不能仅用模板id/hash识别重复test3/rest/Boss。RunState的visited/claimedRest/defeatedBosses按实例或槽位区分。FloorInstance运行状态永不写回模板，实时只保留snapshot/active/preview，进入n+1后释放n−1，不能预建41份活跃敌人。

## 5. 两段F与双Boss生命周期

相邻40条链接里0→1是lobby-transfer，20→21是boss-transfer，其余38条按既有石管；两段传送无物理管道。World算origin/buildLink时必须先按槽位动作处理传送，再访问lower.finish。20Boss本来无finish，不能在构造完整World时空指针。传送后的21层原点按独立段放置，不让人跳过Boss直接走到21。

World.afterPlayerStep不提交transfer链接，不因高度/普通云板自动传送；GameSession.interactionPrompt在0沿用出生附近提示，在20仅当前Boss真正defeated时给F。F边沿一次激活21，同一Player放到21的start，重置必要运动状态；snapshot/preview/旧层释放与常规激活走一致逻辑。传送事件让相机立即对准目标，避免缓慢穿过两段地图间空白。

当前Session.stepOnce遇到interactionPrompt后固定调用enterFirstFloor，不能只给20层加一句提示而沿用这个写死调用；需按prompt.kind/exitAction分派大厅传送或Boss后传送，并统一处理真实入层事件一次。不要在页面另写玩家重建或直接改floorIndex。

Boss不再自行无条件session.win：完成两阶段后回报session.onBossDefeated(floorIdentity)。GameSession按当前槽决策：20记录击败、清伤害物/停攻、开放F，仍running；40才win。离开20后旧Boss不能继续update/被光环命中；进40创建全新phase1/shield/timers/hazards/lastHitCast，不能被`if(!this.boss)`挡住。保留现有暴露停攻、直到命中、一次施法最多一生命阶段的规则。

休息10/30分别一次+40/封顶100，不因同模板身份共享领取；F/暂停/靠近接口不重复回血。下一层非攻击预热、入层才攻击计时、旧层地形保留与已修云板邻接实心规则保持。不新增超时追捕等后置系统。

## 6. 正式游戏入口与验收

复用当前short.html/js/short.js的共用外壳或做薄入口适配，产品主入口为“开始完整塔”，index默认进入正式完整塔菜单。内部旧文件名可暂留，但标题/按钮/HUD/结果不能再写成六图短塔或标准试玩。原短塔仅作为明确调试入口，不能抢正式默认入口；不引入另一套Player/GameSession/物理。

HUD按manifest层号/kind显示0/40、10休息、20Boss、21普通、30休息、40Boss，不能`index>4就Boss`。0池仍可玩，清池状态/必要错误可见，不要求作者先凑满36图。补位来源可在开发诊断中显示，产品不展示epoch/数据库术语。

人工优先：空池正式启动→0层F→普通→10回复→20两阶段/不提前胜利→F21→30独立回复→40全新Boss→胜利；失败重试同塔。编辑器选难度→试玩→发布，刷新不再次删；难度2/3/4只分别进入11–19/21–29/31–39，缺档即test3，不跨档挪正式图；改难度后旧通过失效。必要时提供明确调试跳层用于定位生命周期，但调试跳层不冒充真人完整通关/认证。可做小范围分桶/身份/补位/一次性清池诊断，不跑全量关卡合规/可达性自检，不以计数替代人工。当前只PC，无新APK。

## 已实现方式（2026-11-09 B4-R9）

- **数据**：`levels/full40/` 四个运行副本（`b4_lobby`/`b4_rest`/`b4_boss`/`full40_fallback_test3`），由 `tools/sync_full40_levels.mjs` 与 `开发示例关卡/` 做地形/端口/认证保真核对后生成 `js/full40-samples.js`；源文件只读，`fallback` 独立 hash、cert=null。
- **清池**：旧 `floor01–12` 移到 `levels/archive/legacy-pool-2026-11-09/`，`levels/levels.js` 为空 catalog；DB v3 `meta.poolEpoch` 单事务清 published + 写标记，`publish`/`publishImported`/`listEligible` 都先 `ensurePoolEpoch`；新记录带 epoch，旧无 epoch 记录不混入。
- **规划**：`RA.TowerPlanner.buildFull40({seed,candidates,fixedLevels,fallback,poolEpoch})` 返回 41 槽；`DIFF_SLOTS` 固定四档位置；每档独立洗牌、最多 9、无放回；缺口按 `9-N[d]` 补 fallback；空池 ok；manifest 带每槽 `source/requiredDifficulty/exitAction`，同 seed 可复现。
- **World**：0→1 `lobby-transfer`、20→21 `boss-transfer`，在算原点/链接时先分派，不读 Boss 的 `finish`；21 层独立原点并留 4 格空白；`afterPlayerStep` 不提交传送链接；`transferNext` 保持同一 Player 并只重置运动状态；`_spawn` 给所有实例唯一 `instanceId`。
- **Session**：`interactionPrompt` 在 0 给开始、20 Boss 真正 defeated 后给“按 F 进入21层”；`stepOnce` 按 prompt 分派传送；`_onFloorEntered` 按 instanceId 回血/建 Boss；20 击败走 `onBossDefeated` 只停攻，40 才 `win`；离开 Boss 层清空旧 Boss，进 40 新建实例；死亡重试同一 floors/manifest。
- **入口/HUD**：`short.html` 默认「开始完整塔 (0–40)」，旧六图只作调试；HUD 用真实 floorNumber；`RA.short.debugJumpTo(n)` 仅供验收定位并标“调试跳层”。
- **编辑器**：保留 1–4 档，试玩/发布要求有效难度，提示对应层段；改难度进入 hash，旧通过失效。

证据见 [交付记录](../checks/B4R9-2026-11-09-full-tower.md)；真人从 0 走通 40 层仍未执行。
