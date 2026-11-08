# 独立单关试玩、认证与发布契约

2026-11-08，用户本轮三项答复已确认。供 [21号卡](../tasks/21-independent-level-trial.md) 实施，**B4-R5 PC 已实现，浏览器/人工待复测**。替代19/20号卡关于生成入口/出口支撑、试玩共用多层World/GameSession的方案；短塔装配规则保持。旧设计见 [历史方案](single-level-trials.md)，不得继续按旧几何补试玩。

## 1. 已确认的用户流程

```text
编辑一张普通关卡 → 保存草稿快照 → 试玩验证
  在本图 start 云板中心出生 → 完整上穿本图 finish 云板 → 通过并冻结
  → 核对内容/规则/草稿版本，保存认证 → 返回编辑器
  → 用户点击发布 → 进入当前浏览器的正式普通关卡池
```

- 编辑器只保留一个面向作者的“试玩验证”入口，合并原开发/标准试玩。沿用标准条件：100生命、无活动光环、初始剩余冷却20秒，之后可正常K，光环14秒/施放起CD20秒，暂停冻结。此配置是继续沿用已有认证条件。
- **只运行原图一张**：不生成入口/出口支撑、额外平台、石管、楼层、隐形顶板；不调用短塔/F/休整/Boss/换层流程。地图自己已有的石头和云板完整保留，不借“去管道”删作者地形。
- 独立TrialSession负责出生、模拟生命周期、失败、通过、结果。复用Player、基础碰撞、地形、注册对象/路径几何、伤害和技能等基础规则；不能复制一套物理或继承/包装GameSession冒充独立。
- 草稿保存、JSON备份随时允许。未通过时JSON是草稿，不因下载或结构合规自动入正式池。“导出到标准塔”在当前工程对应**发布到本地正式池**，不是把文件复制到levels/；不新增一套关卡格式或必需的“正式导出”按钮。
- 通过只保存认证，不自动发布。JSON可带有效认证备份；外部导入声明保持既有来源区分，不把导入、自动检查或下载变成人工本地通关。

## 2. 出生与通过几何

沿用schemaVersion=2、cloud-pipe-v2的start/finish两格云板标记，左格坐标从0计数；不改作者尺寸、不裁空白、不添加旧P/G出生终点。

单关原点固定(0,0)，TS使用共享配置。玩家宽w、高h来自现有Player，不写死另一尺寸：

```text
spawn.centerX = (start.col + 1) * TS
spawn.feet   = start.row * TS
player.x     = spawn.centerX - w/2
player.y     = spawn.feet - h

finish.left  = finish.col * TS
finish.right = (finish.col + 2) * TS
finish.top   = finish.row * TS
```

出生脚底在start顶面、水平居中，开始后可直接走跳。试玩的出生只认当前普通关卡start；不认旧spawn或固定场景扩展，不从下方夹具爬入。若安全净空/云板/对象包络不合规，启动前说明位置和原因，不悄悄移人或补平台。

每个固定模拟步保存前后位置。**仍存活、running且本步真实向上运动**时，脚底从`prevFeet >= finish.top`变为`nextFeet < finish.top`，且跨线处整个碰撞盒宽度位于两格开口内，即完成一次。只露头、身体未全过、碰侧边、在别处越过同一高度、下落站上云板、暂停/重开/初始位置均不触发。用户已确认不要求落地站稳。

数值边界容差使用共享碰撞容差；不可扩大开口来掩盖碰撞。跨线有水平运动时按前后位置求脚底跨线时刻的x，检查当时完整宽度，不能只检查头部或中心点。测试必须使用真实Player.update与步进；定位夹具/单测几何不能代替从start开始的完整路线验证。

`finish.row=0`时允许角色在开口上穿至地图上方，不受旧Level顶边封墙/地图数组边界阻挡。通过判定不能被“上出地图”先杀死；左右和下方异常越界沿用现有死亡门槛，不额外造可站隐形墙。相机留出云板上方和结果显示空间。

伤害/死亡与通过同一步发生时，先完成本步必要碰撞与伤害结算，确认存活后才发通过；死人不能认证。通过后立刻锁模拟与输入，时间/齿轮/攻击/冷却不再推进，即使单次update有多个子步也只发一份结果。死亡显示“试玩失败”，可重试同一快照/返回编辑器，不跳回短塔大厅。

## 3. 模块与接口

名称可调整，职责与禁止依赖不变。最小必要提取基础逻辑，不借本卡重写塔世界。

| 模块 | 负责 | 不得依赖 |
|---|---|---|
| TrialPlan（可改造已有文件） | 校验handoff和普通模板，给出一图、起终点、规则身份 | 生成支撑、TowerPlanner、World、DOM、存储 |
| TrialSession | 一图固定步进/暂停/失败/通过/快照；拥有独立本局 | GameSession、World、Boss、F、发布/文件API |
| 单关适配器/共享LevelRuntime | 单图地形、动态实体、Player需要的碰撞查询 | 多层装配、楼层索引胜利条件、编辑器DOM |
| TrialController（页面外层） | 输入/相机/结果UI，调用仓库保存认证，返回原草稿 | 自己写另一套物理/终点判定 |
| ContentRepository/共享校验 | 草稿版本、认证、显式发布和正式候选筛选 | 伪造本局通过或替用户操作 |

Player目前使用`tile/worldW/startX/startFeet/spawnCol/spawnRow`及`blockedAt/move/standingOn`等Level接口。适配器需逐项对齐实际源码，不能只实现能让Player构造的字段；尤其保留18号卡修好的单向云板邻接实心碰撞与一致落脚查询。塔的World继续管理世界坐标，试玩适配器只管理本图坐标，不通过World产生原点/管道。

齿轮路径、弹簧、门、浮石、火球、地刺、技能、伤害/无敌帧继续与正式游戏一致。必要时从现有World/FloorInstance/GameSession提取**基础行为**供两者调用；不复制后分别修，不把FloorInstance整套换层状态塞进TrialSession。试玩单图从相位0启动，不做下一层预热；认证只说明该起始条件下可通，不承诺所有塔预热相位。

建议接口：

```js
TrialPlan.build(handoff) -> Result<{
  template, subjectRef, draftRef, rules, requestId,
  profileId: 'standard-v1', spawn, finish
}> // 没有 floors/roles/fromIndex/toIndex/next

TrialSession.create(plan) -> Result<TrialSession>
session.setActions({left, right, jumpHeld, skillPressed})
session.update(dt) // 复用固定1/60秒步长与后台不补算约定
session.pause(); session.resume(); session.dispose()
session.snapshot(); session.drainEvents()
// 状态 running | paused | passed | failed | disposed
// 事件 trialPassed 一次，或 trialFailed；不借用 floorEntered/won(boss) 事件
```

重新试玩创建相同快照的新trialId，清输入/计时/本局变更/完成锁，渲染循环恢复；返回时释放监听与RAF，旧运行不能回传给新运行。核心只发结果，认证写入失败不改变已经通过的游戏结果。

## 4. 交接数据与页面

建议唯一`trial.html` + `js/trial.js`；两旧按钮/快捷键都收敛到“试玩验证”。原devplay/standard页面若保留，提示从编辑器重新发起或转唯一消费者，不继续执行旧三层代码，不静默读取旧V1/V2数据。旧数据保留但不能当新试玩请求。

```js
// 建议 sessionStorage key: RA_TRIAL_V3
{
  version: 3, kind: 'editor-validation',
  requestId, profileId: 'standard-v1',
  template: /* 保存成功的不可变规范LevelData快照 */,
  subjectRef: {levelId, contentHash},
  draftRef: {draftId, revision},
  rules: {rulesVersion, rulesFingerprint}
}
// 核心通过事件的上下文
{type:'trialPassed', trialId, requestId, subjectRef, draftRef, rules,
 profileId:'standard-v1', elapsed}
```

先校验play与publish的非认证约束、端口、安全出生；已有B1工作区令牌/hash/dirty/保存回包保护继续。保存或存handoff失败留在编辑器，不清工作、不离页。入口必须核对完整结构、模板hash与身份、当前规则、profile和普通场景；没有数据/旧版本/未知内容给可见错误，不回退任何样例/短塔。草稿未知字段依原规则保真。

## 5. 认证、发布与版本

继续现有Certification格式，不另造认证数据库。绑定内容hash（排除certification/contentHash）、规则版本/指纹、standard-v1、passed、完成时间、local-playtest来源；回执上下文另含trialId/requestId/draftId/revision。

1. 本局合法通过后先锁定结果，加载原draftId；核对保存时的expectedRevision、levelId、hash和当前规则。通过新接口显式成功/失败结果写认证，事务完成才报“认证已保存”。
2. 存储失败显示“试玩通过，认证未保存”，可在当前结果页重试保存同一回执；版本冲突保留草稿、不覆写新图、不自动把旧通过套给新revision，提示返回重新试玩。内存降级明确说明刷新会丢失。
3. 通过和认证写入均不改发布池。返回编辑器重新加载原草稿与新revision，保持异步工作区保护，显示“已验证，可发布”；仅用户点击发布才用同一共享校验入池。
4. 编辑任何内容使旧认证不再匹配，要求重新试玩。撤销/重做也按真实hash和规则判资格，不能只看一个布尔passed。发布和正式候选筛选都校验当前规则，不仅按钮置灰。
5. **本卡实施时升级玩法规则版本（建议b4-4）与指纹，加入`trial=single-map-v1/start/finish-feet-up`。** 这是结束几何与认证条件变更，旧三层认证保留可读但不能自动算新规则已验证；不批量重签passed或清历史。schemaVersion保持2、profileId继续standard-v1。当前代码仍b4-3，本文件不代表版本已发布。

地图结构/云板接口的可拼接性由共享静态校验检查；真实相邻图拼接在短塔回归中验证，不靠试玩生成管道来验证。通过仅证明本图可玩，不承诺任意相邻模板、所有相位/低血状态或40层完整可通。

## 6. 最小验收闭环

先用简单合法普通图从start通过真实按键走跳到finish，验证唯一地图、无World/管道、通过一次、后续60步冻结；另测finish在row0及非0、宽高变化/端点左右偏置、只露头/侧擦/下落/死亡同帧等负例。不能靠设置floorIndex/trialCompleted/直接win代替完成检测。

内存隔离仓库验证通过→认证保存→显式发布→正式候选；覆盖改图/规则旧/晚回执/保存失败/冲突。自动用具仅认证自己的合成测试图，不给用户地图造人工通关记录；作者实际屏幕试玩→返回→发布仍需独立记录。短塔六图、18号卡侧碰撞和齿轮路线专项保持，通过标准不得降低。
