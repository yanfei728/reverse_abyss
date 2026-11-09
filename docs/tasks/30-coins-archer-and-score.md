# 30 — 金币、弓箭手与正式塔计分（PC）

2026-11-09，**已实施，主体工程验收通过；编辑器问题转31**。独立95/0、手势13/0、完整塔98/0，用户未提供30逐项人工结果；流星锤显示/路径残留由[31](31-editor-visual-path-and-unpublish.md)修复并加确认的下架。见[验收](../checks/review-B4R14-2026-11-09.md)与[原交付](../checks/B4R14-2026-11-09-coins-archer-score.md)。以下是30历史实施范围，不授权重做。

## 交接基线

- 仓库 `C:\Users\beilu\Documents\blwork\reverse_abyss`，HEAD `d41e07d`，R7–R13仍为未提交修改/新增文件。先看Git状态，保留所有交付、原图、草稿、发布/通过历史、偏好和证据；不reset/clean/重建基线/清库，不擅自提交或推送。
- index唯一正式菜单/游戏壳，控制器仍叫`js/short.js`但启动正式0–40塔；legacy/short等兼容页只跳index。旧main/Game/Tower源文件历史测试用，不加载进产品。GameSession/World正式、TrialSession单图，基础移动/碰撞/实体共享，不能把试玩重新塞回塔。
- 0出生F→1，10/30休息，20/40独立Boss，20击败F→21，40胜利；同Player连续换层、预热/旧地形快照/最多3实例、已修云板侧墙保持。四档normal各9槽、缺档test3补位；seed只存文本、按当前池重建，死亡重试原清单。
- `levels/normal/difficulty-1..4`已通过JSON显式`node tools/sync_levels.mjs`入内置池；fixed/fallback/archive隔离，不扫归档、不再触发一次性清池。开发示例原JSON只读，不改图/裁空白以做演示。
- 当前b4-9/schema2/DBv3；本卡目标b4-10/schema2不变，只PC、无APK/cap sync，安卓仍0.3.2。

## A. 两种直接放置元素

1. 新type `coin`与`archer`，均`params:{}, pathId:null`，col/row为格坐标。编辑器各一个直接放置工具，无手填坐标/参数/路径面板。保留terrain/机关/异类，同type同格幂等；支持撤销重做/裁剪/保存/JSON往返、试玩与正式导入/发布/四档同步。没有认证不得假passed。
2. 金币是独立拾取物，无实体阻挡、HP/伤害，玩家身体接触一次后消失，不由光环拾取。所有怪物、箭、金币互不阻挡，也不参与灵魂外轮廓。试玩可捡，但不计分。
3. 弓箭手不移动、无实体阻挡，可被光环一击击败；本体接触20和箭命中20，沿用现有受伤无敌时间。入层满2秒射第一箭，之后每2秒；朝发射瞬间玩家位置直线射出，不追踪；固定V/2=170px/s。光环不能清箭；本体死后已发箭继续到命中/出界/离层。
4. 箭穿所有真实地形/机关，不跨层。ownerInstanceId隔离、仅active运行；按设计的本图/接口边界裁剪后判命中，离层/F传送清旧箭、snapshot无箭，preview不计射击时间/不射击/不伤害。暂停冻结；死亡/胜利/重试/菜单退出清理。箭命中消费，无敌时不扣血也消费；朝向/命中图形清楚，不接入地形碰撞或灵魂几何。

## B. 只给正式塔加分

1. 正式Session本局score初始0：首次进入1…40各+20（休息/Boss/F都含，0出生不加，40胜利不重复），层数总分800；敌对单位真正击败+5；金币拾取+10。
2. 敌对单位为静止/移动火球、灵魂、弓箭手及Boss。Boss整只最终击败一次5分，阶段切换不加；机械/池/箭/门/金币不加击杀。击败/拾取按floor instance＋object id去重，层号按本局槽号去重；同模板重复槽独立，重复事件/持续光环不重复。
3. 在成功状态变化处加分，HUD只读snapshot；不要在World、Player或drainEvents/render里重复加分。当前正式身份为`mode:'full40-formal'`，不能误写成`formal`导致不生效。Boss最后5分先入账再胜利；Boss临时弹幕等伤害物消失不算击杀。暂停/跨层保留，死亡/胜利冻结；重试同manifest或新开始均新局0。
4. 正式HUD右上角显示得分，死亡/胜利界面显示本次得分。设置只显示本地历史最高分，独立key只存`{version:1,bestScore}`一个最大值，无逐局记录/最近分/种子排行/快照。每次破纪录时更新max，不每帧写；写失败如实显示未保存，保留本局分和原合法最高分，不动其它存储。
5. **用户明确：试玩不加入分数系统**。Trial不创建/累计/显示分数，结果无分数，也不读写最高分；仅复用同金币/弓箭手/箭的行为与伤害。不能因为试玩也用run-v1就把它当正式计分模式。

## C. 建议落点与接口

- config/rules/EntityRegistry：固定数值/类型描述，目标b4-10，不批量作废旧人工通过。
- editor：两工具及绘制，最小扩展保真放置集合，coin类别不得当hostile。LevelData/readable/hash及Repository/sync共用能力检查，不恢复几何/可达门槛。
- world/FloorInstance或一个小共享helper：coin收集/archer计时/箭列表、运动/命中/绘制；运行状态不回模板。TrialSession调用同实现，但不接计分回调。
- session：正式run积分真值、去重、实际击杀/拾取/入层钩子。现`fireballDestroyed`已用于灵魂，不按旧名字猜计分，必要时增加带type/instanceId的通知，保留旧消费者兼容。
- short/index及小HighScoreStore适配：右上HUD、结果、设置最大值和真实保存结果；核心不依赖DOM/localStorage。所有新增脚本同步index/editor/trial/loader与www生成链，保持依赖顺序，不手改生成catalog。

详细结构、接口、箭边界及默认见设计；可以最小调整文件划分，不改变行为或建立通用怪物/经济/排行榜框架。

## 必要检查与交付

- 定向覆盖：两type编辑保存/JSON保真、未通关返回原稿不退化；金币只能捡一次/两个同模板实例各一次，怪物无实体阻挡/灵魂不认金币与弓箭手。
- 弓：preview等多久也不射，入层2秒/后续2秒，170px/s、直线非追踪；本体和箭20、halo只杀本体；隔墙可命中、不跨上下接口，暂停冻结，物理/F离层清箭和重试清理。以非零origin测试，避免局部/世界混淆。
- 分：正式入1+20、捡币+10、杀敌+5；同敌持续重叠/重复floor事件不重加；Boss阶段0/最终5；全部1…40层一次=800；无敌/已死对象不假击杀；重试0且原manifest。试玩同物件正常但无score/最高分写入。
- 最高分：低分不覆盖，刷新读回，破纪录写入，故障/损坏/取消不假成功/清库；仅存最大值，无逐局记录。必要手段用隔离存储，不碰作者浏览器库。
- 按影响运行小范围引擎/会话和可见页面诊断；现有`test_29_menu_levels`、`test_full40`、`test_28_soul_sewage`等按需回归。无需全量地图合规/寻路或作者再走41层，不用计数替代真实结果；旧floor09/11及退役btn-dev测试不为绿灯恢复。
- 更新根四文档、设计/任务状态、实际交付记录，说明命令/结果、可见验证、未测项和www构建对齐；不写未经测量性能/兼容性，不伪造通关或发布。无需APK。

## 作者最短人工操作

编辑器开一个自己的普通草稿→分别放金币/弓箭手并保存→试玩：捡币消失、弓每2秒直射/可穿墙，本体接触和箭都扣血，K只杀弓不清箭，全程无分数→未通关返回确认原稿还在→通过后按原流程发布/导出并明确入池（文件则放对应difficulty目录运行sync）→index开始正式塔，0层0分/F进1为20，捡一币+10/杀一敌+5→看右上角/死亡结果同分、设置最高分与刷新保持→重试同塔0分。必要换层边界由隔离fixture配合检查，不要求你重复全塔。

## 可直接复制给新对话的提示词

```text
你是reverse_abyss编码agent，本轮只实施 C:\Users\beilu\Documents\blwork\reverse_abyss\docs\tasks\30-coins-archer-and-score.md。先读根README.md、PROJECT.md、STATUS.md、AGENTS.md，再读docs/design/coins-archer-and-score.md和docs/checks/review-B4R13-2026-11-09.md。29已由用户人工验收通过。HEAD d41e07d之上R7–R13未提交；保留所有已有改动、源地图/草稿/发布和认证历史、偏好/证据，不reset/clean/清库/提交推送。
index是正式首页/游戏壳，js/short.js只是历史文件名，正式用GameSession/World，试玩是独立TrialSession。新增coin和archer直接画布放置，params={}、pathId=null；保存/撤销/JSON/裁剪/试玩/发布/四档normal文件同步都支持。不加手填参数表；放置保留terrain/机关/异类。coin是拾取物，非敌对单位；所有新物体和怪物无实体阻挡，不影响灵魂轮廓。
弓箭手静止，一击光环消灭；本体接触20、箭20沿用无敌时间。只active入层后每2秒一箭，第一箭等完整2秒，箭固定170px/s、向发射瞬间玩家位置直线飞、不追踪/穿墙/不跨层。光环只能杀本体，不能清箭；本体死后已发箭照常。按设计约束所属层接口/地图边界并先裁后判命中，preview不射/不计攻击时间，暂停冻结，离层含F清箭，快照不留，重试/退出清理；非零origin坐标一致。
仅正式塔计分：初始0，首次进入1..40各20（含休息/Boss/F，0出生不加，层数共800）；击败一个敌对单位5（静止/移动火球、灵魂、弓箭手及Boss，Boss最终击败一次，阶段不加）；金币10。按楼层实例+对象ID去重，同模板各槽独立；在状态变化成功处记账，别在HUD/drainEvents重复记。右上HUD和死亡/胜利界面显示本次分；重试同manifest但新局0。
设置只看历史最高分；独立key只存一个bestScore，不存每次挑战分数/记录/日期/seed快照。破纪录max更新，失败显示未保存、不覆盖旧高分/清其它存储。核心Session不直接访问DOM/localStorage。用户最新明确试玩不加入分数：试玩同样捡金币/打弓箭手/被箭伤害，但没有计分状态、HUD、结果分数和最高分写入；不能用run-v1误判正式模式。
保留已验25–29、同Player/真实管道/云板碰撞/三实例/预热快照/HP光环14-20、0F1/20F21/40胜利、四档9槽/test3/seed文本规则。目标b4-10，schema2/DBv3不变，旧人工通过不批量作废，不恢复几何可达自检/不伪造passed。同步HTML/loader/生成器/必要www，只PC无APK，不做其它怪物/Boss机制/商店/排行榜/音效美术。
完成必要定向和可见诊断，报告实际结果/未测，不要求作者重走41层。最短人工：编辑器放币和弓→试玩拾取/射击受伤/K/无分→返回原稿→通过发布或导出后按难度sync→正式F进1得20、币10、击杀5→死亡/胜利结果及设置最高分刷新→同塔重试0。交付更新根四文档和任务设计，给文件清单、实际检查、剩余问题和人工步骤。
```

## 实施结果(2026-11-09)

- **已实施**:coin/archer 注册(collectible/hostile,params={},pathId=null)与两个直接放置工具;金币身体拾取一次+10、弓箭手 active 满 2 秒/每 2 秒/170px/s 直线箭/穿墙不跨层/本体与箭 20/光环只杀本体;正式 full40-formal 计分(1..40 各 20 共 800、击败 5、金币 10、Boss 最终一次、按实例去重),右上 HUD/死亡与胜利结果/设置只读历史最高分(独立 key 只存 max);试玩同行为但无分数/无最高分写入。规则 b4-10,schema2/DBv3 不变。
- **命令**:`node tools/test_30_coins_archer_score.mjs` **95/0**;`node tools/test_all.mjs` **1829/4**(4 条历史 floor09/floor11);`test_leveldata` 141/0、`test_editor` 266/0、`test_29` 34/0、`test_full40` 98/0、`test_28` 45/0、`test_27` 53/0、`test_26` 39/0、`test_b2` 96/0;可见 `node tools/browser_30_coins_archer.mjs` **33/0**(真实 Chrome),`browser_29` 22/0、`browser_28` 20/0、`browser_trial23` 40/0;`browser_editor24` 42/2、`browser_full40` 36/2 的 4 条均为 25/29 号卡已改变的旧页面文案断言(过期,不是本轮回归)。`www` 已重建(38 脚本,含 high-score-store),未构建 APK。
- **未测**:作者显式发布→正式塔从发布池读取(正式截图是页面内存 fixture);真人手感/平衡;并发/存储写失败专项。
- **恢复说明**:本轮一次 PowerShell 5.1 编码操作写坏 `js/editor.js`/`editor.html`/`trial.html`,已重建并通过全部接线回归;中文提示文案可能与上一轮略异,详见[交付记录](../checks/B4R14-2026-11-09-coins-archer-score.md)第 6 节。未 reset/clean、未丢作者数据、未提交推送。
