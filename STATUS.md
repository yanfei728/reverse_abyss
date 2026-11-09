# 当前状态

2026-11-09：**31号卡已实施，工程检查通过，待作者最短人工确认**。修复编辑器流星锤重复坐标偏移/离屏漏画、删除对象后的最后引用路径清理，并在设置加入精确 id/hash「移出浏览器发布池」。定向34/0、隔离Chrome37/0；编辑器266/0、手势13/0、30号卡95/0、完整塔98/0。b4-10/schema2/DBv3不变，R7–R14未提交修改保留；只PC，无新APK。见[31交付](docs/checks/B4R15-2026-11-09-editor-unpublish.md)。

## 2026-11-09 B4-R15 / 31号卡实施结果

- 编辑器：流星锤局部像素只转换一次到屏幕，按锚点/链/锤头包络裁剪；原三个探针位置误差均0，离屏锚点仍绘制可见链/头。运行轨道/伤害未改。
- 路径：集中删除实际对象后只清其最后引用路径；ID、同格、区域、替换、尺寸分支共用。未知对象的共享引用、旧孤立路径及扩展字段保留。已有整图撤销一次还原对象和路径；空擦除保留dirty/hash/undo/redo。
- 下架：Repository.listPublishedVersions / unpublish 与 Memory、IndexedDB 接通；只删指定published键，IDB oncomplete才成功，abort返回失败；不写metadata、不再次触发清池。列表仍列出不合格发布记录，设置展示完整身份和内置同版本说明，取消/失败保留记录，等待禁重复并捕获点击身份。
- 实际检查：test_31_editor_unpublish 34/0；browser_31_editor_unpublish 36/0（隔离Chrome156，真实鼠标/键盘/确认框/IDB，包含delete请求成功后abort、新候选读取、内置重复、原manifest重试、草稿/历史/存储保真）；test_editor266/0、gestures13/0、test30 95/0、full4098/0。原探针写新文件31-editor-model-draw.json。详见[交付报告](docs/checks/B4R15-2026-11-09-editor-unpublish.md)。
- 已检查截图；这是脚本化真实浏览器证据，不是作者人工通过。fixture认证仅存在隔离临时profile/内存；作者normal、catalog、原图、浏览器库及旧证据未改。www仅同步三份受影响运行文件，无APK，无提交推送。
- 未测：作者真实库下架、真人最短操作、磁盘源删除后sync（未改作者目录）、多标签并发、系统容量/断电故障、全量test_all及真人41层；不为本卡要求重走41层。

## 2026-11-09 B4-R14 / 30号卡原实施记录（主体工程已验，编辑器由31收尾）

- **金币**：`coin` 是 collectible、`params={}`/`pathId=null`、无实体阻挡；只有玩家身体接触拾取一次即消失，光环不代捡、不算击杀；同一实例只捡一次，同模板不同槽各自一次。
- **弓箭手**：`archer` 是 hostile、静止、无实体阻挡、可被光环一击消灭；只在 active 层入层满2秒射第一箭、之后每2秒，朝发射瞬间玩家位置直线170px/s(不追踪)；穿所有地形/机关、按所属层域(本层finish顶面/start云板底面∩地图)先裁后判、不跨层；本体接触与箭各20并沿用无敌时间；箭命中即消费(无敌也消费)，本体死后旧箭继续；暂停冻结、preview不射不计时、离层(含F)/死亡/胜利/重试清箭、snapshot不留箭。
- **计分**：只有 `mode:'full40-formal'` 创建分数(试玩/调试短塔为 null)。初始0；首次进入1…40各+20(含10/30休息、20/40 Boss、0→1与20→21 F；0层不加；共800)；敌对单位真的被击败+5(静止/移动火球、灵魂、弓箭手、Boss最终一次，阶段不加)；金币+10。按本局槽号/`instanceId|objectId` 去重；在成功状态变化处记账，HUD只读 `snapshot.score`。死亡/胜利冻结，重试同manifest但新局0。
- **最高分**：`js/high-score-store.js` 独立 key `ra_high_score_v1` 只存 `{version:1,bestScore}`；低分不覆盖、破纪录才写、写失败/损坏如实提示且不清其它存储；设置只读显示，刷新保持。核心 Session 不碰 localStorage。
- **编辑器**：调色板新增「金币」「弓箭手」两个直接放置工具(点击/拖动、同格同type幂等、一次拖动一步撤销)，不擦真实地形/机关/异类，无坐标/参数/路径表单；JSON/草稿/裁剪/试玩/发布/四档同步沿用。
- **实测**：`test_30` **95/0**、`test_all` **1829/4**(历史floor09/floor11)、`test_leveldata` 141/0、`test_editor` 266/0、`test_29` 34/0、`test_full40` 98/0、`test_28` 45/0、`test_27` 53/0、`test_26` 39/0、`test_b2` 96/0；`browser_30` **33/0**(真实Chrome：编辑器放币/弓→试玩拾取/被射/K杀本体且无分→返回原稿→正式HUD 20/30/35、结果本次得分、最高分刷新保持、重试同塔0后再进层20)、`browser_29` 22/0、`browser_28` 20/0、`browser_trial23` 40/0。`browser_editor24` 42/2、`browser_full40` 36/2 的4条是25/29号卡已换掉的旧页面文案断言(过期，不是回归)。`www` 已重建(38脚本、含high-score-store)。
- **未测**：作者显式发布→正式塔从发布池读取含金币/弓箭手新图未执行(正式截图是页面内存fixture)；真人手感/数值平衡未评价；大量箭/金币性能、多标签并发写最高分、真实存储写失败未测；未建APK。
- **恢复说明**：本轮一次 PowerShell 5.1 默认编码操作写坏 `js/editor.js`/`editor.html`/`trial.html`，已重建并通过全部接线回归；未 reset/clean、未丢作者数据；页面中文文案可能与29交付略异，详见交付记录第6节。

## 2026-11-09 29已验收、30待实施时的历史记录

- 用户明确交付人工验收没有问题，29关闭。独立test_29_menu_levels 34/0、test_full40 98/0、test_28_soul_sewage 45/0均退出0；静态37依赖齐全、53份SHA不变、www依赖相同，HTML仅预期构建转换。未复跑浏览器/test_all，不把原交付22/0、1733/4当本轮结果。
- 旧main/game/tower等仍存作历史测试，生产执行链已退役；记录非阻塞清理，不为30重开旧菜单/镜像。未逐项人工验证的导入文件选择器/真实关闭/持久失败/并发限制保留。
- [30号卡](docs/tasks/30-coins-archer-and-score.md) / [设计](docs/design/coins-archer-and-score.md)：新增直接放置金币与弓箭手，正式塔右上计分与设置最高分；**尚未编码**。层号1…40首次进入各20（共800），敌对单位击败5，金币10；Boss只最终击败一次。弓静止/入层后2秒一箭/170px/s/本体和箭20/箭穿墙不跨层，光环只消灭本体。**独立试玩不加入分数系统**，保留同金币拾取和弓箭战斗规则。只存一个历史最高值，无逐局记录。
- 设计默认本体接触20、第一箭等入层2秒、halo一击杀本体、已发箭不随本体死清；金币每实例一次，箭离层清理。每个Boss最终击败一次5分。只PC，无APK，不改用户地图或通过记录。
- 本轮规划方只改验收证据和需求/任务/接口文档，未实现30、未提交推送。

## 2026-11-09 B4-R13 / 29号卡实施结果

- **主界面/种子**：index英文首页只有开始/退出与右下设置；41槽固定；`SeedText`完整解析 1..0xFFFFFFFF，0/非法拒绝；只保存 `ra_seed_texts_v1` 文本列表，不存塔快照；同种子同候选稳定，池变可不同；暂停/结果“返回主界面”，重试本局原manifest；退出停止循环/输入并尝试关闭，失败显示手动提示。
- **旧链退役**：short/legacy/standard/devplay/tests/browser 单向跳 index；index/www 不加载 main/game/tower/levelpack/smoke/dev-b2-b4/reach/ui；旧图标/旧关卡列表/镜像/塔高/旧池合流入口从产品页移除；旧源文件仅作历史测试、不执行。
- **levels迁移**：53份JSON盘点，`full40`→fixed/fallback，`authored/b2/b4/v2/dev/demo/_template`→archive，原`开发示例关卡/`不动；完整 [old/new/SHA映射](docs/checks/29-migration-map.json) 41移动/12原位、53/53 SHA不变、无覆盖。
- **同步/合并**：`sync_levels`只扫四档normal，LevelData readable + `ContentRepository.certState`；无通过跳过；坏JSON/坏hash/档位错失败不覆盖旧产物；生成`RA.NORMAL_LEVELS`；与published按id/hash去重、builtin优先；四档9槽/test3补位保持；archive/fixed/fallback不进入普通候选。
- **www/测试**：from index 37 scripts，只带实际脚本+levels.js+assets，旧页面/子库不打包。`test_29`34/0、`test_all`1733/4（历史floor09/11）、`browser_29`22/0、`browser_28`20/0、`test_28`45/0、`test_27`53/0、`test_26`39/0、`test_full40`98/0、`test_b3`61/0；`29-audit` N04/N05 false/0、www一致。作者可见文件选择器导入/真实关闭/并发/持久失败未测；空池用test3补位；无APK。详见交付记录。

## 2026-11-09 B4-R12验收与29需求（历史）

## 2026-11-09 B4-R12本轮验收与29

- 用户描述已在编辑器画数图、试玩并导出；记录该使用范围，未补造作者显式发布/新塔读取、失败/并发逐项人工结果。
- 独立`test_28_soul_sewage`45/0退出0；return探针新输出topReturnBugReproduced=false、同draftId/revision/hash且cert=null，原R1工程关闭。未重跑本轮浏览器/全量地图自检，交付20/0浏览器等保留为交付证据。
- 新entry-sources隔离复现：活动catalog0、正式内存published0，向旧customLevels写旧图后legacy pool仍出现floor01；legacy确实仍加载main.js创建旧Game。不是新正式池重置失败，不清作者库。levels只读盘点53份JSON/8个顶层目录，原件未移动。
- 29待实施：index唯一英文菜单/正式壳，legacy/short兼容单向跳转；旧菜单/镜像/可调塔高/旧池合流实际移除，保留共享物理。种子只存文本、当前池重构；normal四档/fixed/fallback/archive整理与哈希映射，schema2通过图显式同步后内置＋浏览器正式池去重。只PC不做APK/新怪物。

## 2026-11-09 B4-R12 / 28号卡原交付记录

- **返回原稿优先修复**：顶部 `btn-top-editor`、暂停 `btn-pause-editor`、结果 `btn-done-editor`、启动失败链接统一走 `draftBackHref()`；编辑器仅 `from=trial&draft=` 时打开仓库最新 revision，普通直开仍空白。保存中点击等待；保存失败停留显示真实原因，不自动返回/不写 passed。修复前后探针 `28-before-return.json` true、`28-after-return.json` false；可见浏览器顶部与暂停返回均同 ID/revision/hash。
- **灵魂**：`js/soul-motion.js` 的 `BlockGeometry` 真实方块 provider + `SoulMotion` 轮廓；terrain1–5、存在门/未gone浮石/弹簧/实存管壁参与，怪物/轨道/池/链不参与；170px/s；编辑器第一击锁格、合法箭头随鼠标、第二击提交、右键/Esc取消；无合法方向不提交；`initialDirection` 显式0–3、缺失/非法被读取检查拒绝；动态几何 revision 失效、失边按当时方向直飞再遇块回贴；preview/暂停/入层相位保持。
- **污水池**：单格 `sewage_pool`、固定20、无阻挡、不可消灭，持续接触按原无敌时间再扣；同格怪物共存、绘制在下方。
- **怪物独立性/放置**：`placeObject` 所有怪物不擦 terrain/机关/出生点，`brushObject` 不删异类、同类幂等；污水一笔连续铺。地形/机关工具仍可改图。
- **数据/回归**：注册表10类、规则b4-9、schema2；草稿/JSON/裁剪/试玩/发布/正式读取接入。`test_28_soul_sewage` 45/0、`test_all` 1778/4（仅历史floor09/floor11）、`test_26` 39/0、`test_27` 53/0、`test_full40` 96/0、`browser_28_return_soul` **20/0**、`test_b3` 61/0；`28-audit` N04 false/N05 0，www一致。作者真人试玩→发布→新塔读取/保存失败/并发未执行；正式截图是内存fixture。详见交付记录。

## 2026-11-09 B4-R11验收与28号卡（历史）

- **人工**：用户确认编辑器试玩怪物无问题；未通关返回编辑器后看见空稿。未提供实际发布/新塔抽选人工结果，不补造。
- **R1定位**：顶部editor.html无draftId，结果页才用draftBackHref；Editor普通启动newLevel，明确from=trial/draft时才恢复。隔离真实openPlaytest先保存revision1，顶部返回draftId空/新图，原稿hash/revision未变、cert=null；带ID地址恢复原稿。不能将用户实际数据库已删视为已证明。
- **独立执行**：test_27_monsters53/0、test_26_continuous39/0、单图12/0、试玩接线13/0均退出0；新return探针topReturnBugReproduced=true、原稿仍存。N04 clearedWhileAbove=false、N05 effectiveDamage=0，8份关键www一致。未重跑可见浏览器/全量地图自检；原图/游戏实现/存储未改，无作者passed。
- **下一卡**：28先修全状态返回最新原稿及并发/保存错误，再接灵魂和池。魂贴真实动态块外边，失边按当时方向直飞，遇块重新附着；其它怪物一律非几何，新增怪物放置不擦真实方块或删异类。污水单格/20/无敌时间/免疫。只PC、无参数卡/其它怪物/Boss/追捕/美术音效/APK。

## 2026-11-09 B4-R11 / 27号卡原实施记录（验收前）

- **速度**：gear 全部固定 `C.MAX_VX=340`；moving fireball `V/2=170`；flail 轨道 `4TS=180`、头速 `2V/3=226.666…`、`omega=34/27`、周期约4.9896s。旧 gear `speedTilesPerSecond` 原样保存但不参与运动；新齿轮兼容字段默认写340/45。单点路径静止。
- **类型/数据**：`fireball_moving` requiresPath；`flail` col/row 是端点、pathId=null；共注册8种对象。`params.radiusTiles` 只表示本体/锤头半径，4格是轨道。运行相位/头位置只在实例副本，不写模板。
- **无阻挡但有伤害**：`FloorInstance.solidAt` 移除 spike 底座；所有怪物不提供实体碰撞。spike 只在 active 阶段用实际伸出尖刺矩形重叠伤害，预警/回收不伤害。gear/静止与移动火球按实际位置伤害；flail 只有锤头伤害，端点/链无伤害无阻挡。真实地形/门/浮石/弹簧保持。
- **光环/生命周期**：`RA.MonsterRules.haloDestroyable` 由 Session/TrialSession 共用，静止/移动火球可消灭，齿轮/流星锤/地刺不可；preview 只运动不伤害、不被当前光环清；入层保留相位；暂停冻结；snapshot 不保留怪物轨道/链。
- **绘制**：`RA.drawObjectTrack` 只给 live gear 画轨道；moving 游玩不画路径；flail 画端点→当前锤头链和锤头，不画整圈；short/trial 共用 `drawFloorObject`，snapshot 只画地形。编辑器显示路径/悬停辅助圆/端点链，流星锤只单击一端点。
- **N04/N05**：pending 确认/清理方向改为向上/回落正方向，并加 `standingOnOwn` 资格；显式 `damage=0` 生效、仅缺省才取20。
- **实测**：`test_27_monsters` 53/0、`test_all` 1731/4（仅历史 floor09/floor11）、`test_26` 39/0、`test_full40` 96/0；`browser_27_monsters` 16/0（真实编辑器鼠标/Esc、试玩、正式内存fixture）、`browser_full40` 38/0、`browser_26_seams` 17/0、b2/b3r2/trial/editor 20/0、47/0、40/0、44/0；`test_b3` 61/0。`27-audit.json` 显示 N04 `clearedWhileAbove=false`、N05 `effectiveDamage=0`，www 关键文件一致。
- **未做/限制**：作者真人试玩与显式发布尚未执行；正式截图是内存 fixture，不是发布池内容；没有新 APK/真机验证；4条历史 floor09/floor11 仍失败。详见交付记录。

## 2026-11-09 首批怪物卡27确认记录（历史）

- 全部gear=V=340px/s（包括旧记录，旧speed字段保真但不覆盖），正式/试玩显示轨道。新moving fireball=V/2=170px/s，沿同90度折线路径，编辑显示路径/游玩隐藏，可被光环消灭。
- flail端点格中心为圆心、轨道4格/180px，头线速度2V/3=226.666…px/s，omega34/27rad/s、周期约4.9896秒；只点击端点，游玩画端点/链/头，不画辅助圆。仅头伤害，机械不可消灭。
- 用户明确所有怪物无实体阻挡但有伤害判定。spike旧实心底座需移除，伸出尖刺与角色重叠伤害、预警/回收不伤害；真实地形/门浮石弹簧保持。
- 新type为fireball_moving/flail，schema2、路径/端点真值各一份，运动相位不写模板。N04/N05必要小收尾、无旧参数卡/Boss/跨层/美术音效/APK。本轮仅编写任务/设计/文档，未改游戏实现。

## 2026-11-09 路线讨论（历史，首批已确认）

用户“先不急”，原27仅现有三类参数配置的草案暂缓。新普通怪物逐批接编辑器，作者持续制作/试玩/发布，补齐约定名单后Boss，再表现与贴图。龙/超时追捕单独一批，尚未定插入位置。建议固定本轮普通怪物名单、每类一次打通编辑器/试玩/正式/存储，保持旧地图和基础物理，先确认后写新任务卡，不一次实施整条路线。

## 2026-11-09 本轮验收通过及原27参数提案（历史，现待重排）

- **人工**：用户明确“人工走完41层没有问题”，按该范围关闭25/26，不补造逐项性能/真机/制作发布结论。
- **独立执行**：test_26_continuous 39/0、test_full40 96/0、test_b4r2 21/0、单图试玩12/0、试玩接线13/0，均退出0。原seams/missing-map探针新输出中bugReproduced/symptomsReproduced均false，current/view/preview及云板管壁一致。关键8份www文件一致；未重跑可见浏览器/全量地图自检，未改游戏/www/存储或写passed。
- **非阻塞**：N04实际输入第30帧生成pending，第31帧继续上升却清掉，方向错误；本例最终通过落脚补偿进2、没有再次断路。N05隔离火球damage0仍HP100→80，来自||20默认逻辑；当前默认20图不受影响。两项具体定位后并入27收尾。
- **用户已选**：27现有火球/地刺/齿轮的元素专属画布配置＋核对保存/试玩/显式发布/新塔分档读取；不恢复通用面板，不加新怪物/Boss编辑/路径重构/APK，尚未实施。

## 2026-11-09 B4-R10 / 26号卡实施结果（原交付记录）

- **上穿漏提交**：`afterPlayerStep` 的开口判断改用 `player.x + player.w - 1`（与 `Level._hitTiles` 相同的内缩边界），0.01 仅吸收浮点；新增 `pendingEntry`：上穿帧身体尚未整身进入但已越过顶层时记住，真正进入后 `commitNext` 一次；脚底落回/换层/传送/跳层清 pending。current/active/Player.view/preview/旧快照一次同步。
- **规划 vs 实存**：`World.liveStoneLinks()` 只返回两端实例都存在的石管；构造/commit/transfer/activate 后 `_refreshRuntimeLinks()` 重建 runtimeLinks 和下层 wallCells；`short.render` 从 `world.links` 改为 `liveStoneLinks()`，不再画未加载目标上方的管道。
- **完整静态碰撞**：`World.staticAtWorld` 合并所有已实存实例的 tile1–4(solid)、tile5(oneWay) 和已实存石管墙(solid)；`Level.solidTileAt/onewayTileAt` 经 `extraSolidAt/extraOnewayAt` 供 `_hitTiles`/`blockedAt`/`standingOn` 使用。oneWay 仍只在下落/站立分支，管壁四向实心；active/snapshot/preview 对同一 live 云板/管壁结果一致。
- **证据**：seams 修复前 `bugReproduced=true`（1/8/14 均未提交），修复后 false（current 2/9/15、preview 3/10/16 已建）；missing-map 修复前 current4/Player.view4/live3,4,5/6未加载/云板不接/墙不挡，修复后 current5/view5/live4,5,6/6已加载/云板grounded/墙vx=0。保存 `26-before/after-seams.json`、`26-before/after-missing-map.json`；Node 连续 1→6 `26-continuous-route.json`；可见 Chrome 真实键盘 `browser-26-seams-2026-11-09.json` 17/0（逐接缝 fixture，不是连续整图）。
- **检查**：`test_26_continuous` 39/0、`test_full40` 96/0、完整 `test_all` 1677/4（4 条历史 floor09/floor11）、`browser_b2` 20/0、`browser_b3r2` 47/0、`browser_trial23` 40/0、`browser_editor24` 44/0。未构建 APK；`www` 已重建。
- **未做**：可见浏览器自动连续整图攀爬未完成（逐接缝 fixture）；真人从 0 到 4+ 及 20/40 连续复测未执行；未重清池、未改地图/跳跃/草稿/认证。

## 2026-11-09 第4层截图后的二次检查（历史）

- 用户截图HUD第4/40层，出口上方只见管道、不见接上的地图；云板/管壁无碰撞来自用户实测。不能仅凭重复test3的外观推定这张图的实际slot。
- **新增定位**：short.render画地图读live instances，画管道却遍历全塔规划links，不检查端点实存。FloorView的move/standingOn仍读绑定Level，otherStaticAt只补邻层tile1–4，不补tile5单向云板/派生wallCells。漏提交后可以踩邻层普通地形，但云板/管壁穿透、再上一图未加载。
- **执行**：`node docs/checks/review-B4R9-2026-11-09-missing-map.mjs`退出0、symptomsReproduced=true。居中对照current/view5、6已加载；右移故障current/view4、live3/4/5、6不存在，5出口云板grounded=false、管壁不阻挡；同位置5号自身view碰撞正常。使用接缝/接触fixture，不是完整地图路线或用户这一局的运行快照。
- **26修订**：可靠一次提交＋按两端实存派生石管＋完整静态世界查询（solid/oneWay分型），绘制/碰撞共用实际几何；不能只改容差/隐藏管道/增加预加载。保留原证据、数据和玩法；本轮未改游戏实现/www/APK。

## 2026-11-09 B4-R9独立验收与26号修复

- **人工失败**：三次上方缺图无法继续，准确层号/seed未记录，不能声称三次根因全相同。
- **独立定位**：`Level._hitTiles`末端内缩1px与World整身开口0.01px容差不一致；双跳时14–29帧向右，第27帧右缘超出0.6388888889px，脚底已上穿但没有提交。1/8/14接缝均复现，逻辑层仍1/8/14、live为[0,1,2]/[7,8,9]/[13,14,15]，所需3/10/16未创建。角色随后能站到上层侧支撑，故可在错误层状态下继续爬到断路。
- **实际检查**：`node docs/checks/review-B4R9-2026-11-09-seams.mjs`退出0、`bugReproduced=true`（0仅代表诊断完成）；每接缝先设finish站位再真实物理输入，不是完整地图路线。居中19条连续提交对照正常，向左对照正常。`node tools/test_full40.mjs`仍96/0、退出0，未覆盖此故障。
- **范围**：本轮未改游戏实现/地图/www/APK或用户存储；仅验收、证据和26号方案。未重跑可见浏览器、全量关卡合规或寻路，未生成认证。原交付脚本通过数保留为历史，不作为真人全塔通过。
- **下一步**：按26统一碰撞与入层判定、补防漏/一次提交、实际相邻接缝证据；不改地图/跳跃/清池，不用全层常驻或调试跳层掩盖。

## 2026-11-09 B4-R9 / 25号卡原实施记录（验收前）

- **数据**：`开发示例关卡/`只读保留；新增 `levels/full40/{lobby,rest,boss,fallback_test3}.json`，固定场景沿用已验证 `b4_lobby/b4_rest/b4_boss` 身份与端点，test3 规范副本 id `full40_fallback_test3`、cert=null、start(1,20)/finish(1,2)；`tools/sync_full40_levels.mjs` 生成 `js/full40-samples.js` 并做地形/端口/认证保真检查。
- **清旧普通池**：`levels/floor01–12.json` 移到 `levels/archive/legacy-pool-2026-11-09/`（原字节保留），`levels/levels.js` 重生成为空 catalog；`tools/sync_levels.mjs` 允许空池；编辑器不再枚举旧图，历史引擎/数据检查显式读归档。
- **一次性重置发布池**：DB v2→v3 增 `meta` store；`ensurePoolEpoch(epoch)` 在同一 readwrite 事务里清 `published` + 写标记（已应用则不清，失败不报成功）；`publish`/`publishImported`/`listEligible` 都先准备；新记录带 `poolEpoch`，旧无 epoch 记录被候选隔离；drafts/通过历史/偏好保留。
- **规划**：`TowerPlanner.buildFull40` 生成 41 槽；普通槽按 difficulty 分桶，每档 9 个位置、无放回、只在本档内按 seed 打乱；缺口按每档 9 槽补齐 test3；只有 fallback 忽略模板自身难度；空池不再 `EMPTY_POOL`；manifestId 可复现、含每槽 source/exitAction。
- **World/GameSession**：Boss 无 finish 时 20→21 按传送链接处理，不再访问 `lower.finish`；传送不再按越线自动提交；`transferNext` 保留同一 Player/HP/光环/CD；所有 `_spawn` 赋唯一 `instanceId`，10/30、20/40 不再共享身份；休息按实例各回一次 +40 封顶；Boss 击败回报会话，20 停攻/F、40 才 win，进 40 新建 Boss；HUD 用真实 floorNumber（0/10/20/21/30/40）。
- **入口/难度**：index/short 默认「开始完整塔 (0–40)」，旧六图只作调试；菜单显示四档池状态与 test3 补位；编辑器保留 1–4 档并说明层段，试玩/发布要求有效难度，改难度使旧通过失效；`RA.short.debugJumpTo(n)` 仅供验收定位，HUD 标调试跳层、不产生认证。
- **测试**：`test_full40` 96/0、`browser_full40` 38/0（真实 Chrome + 真实键盘 + 8 图）、`browser_b2` 20/0、`browser_b3r2` 47/0、`browser_trial23` 40/0、`browser_editor24` 44/0；完整 `test_all` 1638/4（4 条历史 floor09/floor11）。`www` 已随 short.html 重建；未 `cap sync`、未构建 APK。
- **未做**：真人从 0 到 40 的物理通关；全 test3 普通层的长度/手感；真实双窗口并发清池/发布；新 APK/真机。`browser_b4.mjs` 历史过时断言未重写。

## 2026-11-09 24号卡人工关闭与25号设计（历史）

同日难度更正：只有默认test3补位忽略自身难度；正式图在编辑器选1–4档→试玩→发布，抽塔按四档分别对应1–9/11–19/21–29/31–39。本档不够用test3，不挪其他档正式图；改难度需重新试玩。上一版“全池混抽”是规划误解，已同步修正25号卡/设计/提示词，尚未改运行代码。

24主题单击、旧表单移除、齿轮取消数据/撤销恢复、历史声明导入、旧页无脚本等定向核对一致，用户人工编辑器通过，不再重做。源件已移到仓库开发示例关卡，六图地形与已验运行版一致；原导出ports均null/id有重复，level0两裸x。运行副本沿用已验端点/固定身份，不改作者原件。

25布局0出生、10/30休息、20/40 Boss、36普通（共41槽）。用户确认清空旧普通内置池与浏览器published，保留草稿/通过历史/原JSON/固定场景/偏好；必须一次性事务重置，不能以后每次启动删新发布。正式图在编辑器选1–4档后试玩发布，分别按1–9/11–19/21–29/31–39各9个位置分档无放回抽取；本档缺位用新目录test3规范副本，仅fallback忽略自身难度，不跨档挪正式图，空池也可开始，补位不伪造passed。20击败后按F传送21，40击败才胜利；死亡重试同一清单。

当前仍六图短塔：空池被拦、只取difficulty1、Boss任何击败直接win且只建一次；World不能直接对无finish的20Boss建后继。后生成实例没有instanceId，隔离探针两个rest的第二个HP40不回血。25须补这些完整塔生命周期及HUD/入口，不把它们倒算为24编辑器失败。

实际node docs/checks/review-B4R8-2026-11-09.mjs退出0，仅定向控制器/内存/源件事实与生命周期诊断，不是关卡自检或真实全塔通关。无新浏览器/真机/性能测量。本轮只验收/方案/文档，未清真实池、未删图、未改运行代码/www/APK/用户存储，未提交推送。完整塔与清池待25实现，不能报告已完成。

## B4-R8交付时记录（历史，人工待确认已由本轮验收更新）

更新：2026-11-08（B4-R8/24号卡实施）。**24号卡已实施并交付，等人工复测。** 当前交付仍是 HEAD `d41e07d` 之上的未提交工作区（B4-R7 + B4-R8），代码 b4-6。本轮：编辑器删除旧「对象 / 参数 / 路径」面板与专属接线（objects/paths/参数/导入导出/撤销/画布齿轮保留），齿轮往返/闭合迁到选齿轮时才出现的专属控件；修主题按钮一次切两次（去掉 HTML onclick，只留 Editor.wire；偏好合并保存并读回 autoGrow）、齿轮 Esc 取消留下对象并弹掉撤销（改为放置前快照整个事务，取消只回滚本次并按需吃掉按压）；导入声明与本地 `publish/listEligible` 统一为"同内容 hash + 完整声明"，技术版本只记录；试玩结果页「返回编辑器」带草稿身份，编辑器只在明确返回时打开原草稿最新 revision；`standard.html`/`devplay.html` 改为无脚本静态说明，旧三层/CD20 控制器停用。见 [交付记录](docs/checks/B4R8-2026-11-08-editor-simplification.md)、[设计](docs/design/editor-simplification-and-theme.md)。实测：`test_editor` 266/0、`test_editor_gestures` 13/0、`test_b3` 61/0、`browser_editor24` 44/0（真实 Chrome 鼠标/键盘 + 8 截图）、`browser_trial23` 40/0 回归、`browser_b2` 20/0 回归、完整 `test_all` **1551 PASS / 4 FAIL**（4 条历史 floor09/floor11）。**本轮没有真人鼠标/键盘验收记录**，人工复测仍需作者执行；只PC，无新APK，Android0.3.2。

## 2026-11-08 B4-R8 / 24号卡实施结果

- 旧面板与会只服务它的接线/读表单方法已删除；`refreshEditorPanels` 只保留端点只读显示，`syncUI` 的可禁用 id 列表同步清理。地图对象/路径/自定义参数/未知扩展、导入导出、撤销重做、裁剪/平移与运行几何均未改。
- 齿轮：`gear-mode` 迁到左栏工具区，仅在选中「路径齿轮」时显示；默认仍 pingpong、闭合仍可选；`beginGearGesture` 在任何写入前保存 `{json, dirty, undoStack, redoStack, bytes}`，`cancelGearGesture` 只回滚本次事务并 `consumeUntilRelease`，不再出现"取消仍留 gear+path、还弹掉旧撤销"；右键完成仍一条撤销。
- 主题：`btn-theme` 去掉内联 onclick，只留一处 click；`loadPrefs/savePrefs` 启动读回并合并保存（保留其他偏好字段），一次点击只切一次；保存失败仍临时切换并明确提示；主题不改 `hash/dirty/通过记录`。
- 通过判定：`ContentRepository.certState`/`publishImported` 不再要求"声明 rules === 当前 rules"，与本地 publish/listEligible 一致；来源仍 `imported-declaration`、只存草稿、须用户显式入池；无声明/改图不假通过；发布记录保留声明当时的 rules；同内容重导入不覆盖原声明。
- 试玩返回：`trial.js` 结果页「返回编辑器」改为 `editor.html?from=trial&draft=<id>`，保存状态分保存中/已保存/未保存（失败可重试）；`editor.js::openTrialReturn()` 只在明确返回时打开该草稿最新 revision（含通过记录），普通直开不读旧 handoff；成功后清查询串。
- 旧入口：`standard.html`/`devplay.html` 已是纯静态说明 + 回编辑器链接，不加载 `standard.js`/`devplay.js`，不消费旧 V1/V2、不写认证；编辑器里无消费者的 `openStandardPlaytest` 删除。
- `www/js/content-repository.js` 同步了本轮改动（离线短塔用同一发布库判定）；没有 `cap sync`、没有新 APK。
- 未做：真人鼠标/键盘验收（主题可读性、齿轮手感、Esc/右键节奏、JSON 往返、返回发布都没人工操作）；`browser_b4.mjs` 的 4 条早于本卡的过时断言未重写。

## B4-R7验收记录（历史，用户已人工确认试玩正常、23号卡关闭）

更新：2026-11-08（23号卡实施/B4-R7）。**23号卡已按用户决定实施并交付，用户已人工确认试玩无问题，23号卡关闭。** 基线 HEAD `d41e07d`。修好了三处已复现错误：trial.html 在 trial.js 前加载 `js/platform/action-input.js`；跳跃改读 `held.jumpHeld`；pause 边沿移出 running 分支。试玩改为普通游玩初态（profile `run-v1`：满血、技能开局可用、14/20 秒），取消试玩/发布/正式候选/正式加载的几何/净空/可达性自动门槛。规则版本 `b4-6`。证据：[交付记录](docs/checks/B4R7-2026-11-08.md)。

## 2026-11-08 B4-R7 / 23号卡实施结果

- 修复：`trial.html` 脚本清单缺输入模块（原来 `new RA.ActionInput()` 抛错、RAF=0、停启动提示）；`js/trial.js` 把 `held.jumpHeld` 误读成 `held.jump`（Space 不跳）；pause 只在 `running` 分支消费（第二次 P 永远拿不到）。现在每帧 `consume()`、键盘/按钮共用 `togglePause()`、恢复重置帧时间与累计器。
- 启动错误可见：`trial-info` 变"启动失败"，`dev-error` 显示具体错误（缺脚本/无数据/`TRIAL_*`/`UNKNOWN_ENTITY`…）+ "← 返回编辑器(草稿不受影响)"；首帧异常同样处理。
- 试玩统一普通游玩：`run-v1` 初态（满血、K 开局就绪、施放后 14/20 秒），删除试玩特有 CD20；通过记录 `profileId='run-v1'`、绑定当前内容 hash。只有当前一张图：start 出生、完整上穿 finish 一次结束，失败只重试本图。
- 对象/伤害/血条/技能/暂停仍共用基础实现；对象绘制抽到 `RA.drawFloorObject`，短塔与试玩同一份，被光环清掉的火球不再画成活物。
- 取消自动门槛：编辑器试玩、`TrialSession.build`、`ContentRepository.publish/publishImported`、`GameSession.create`（正式加载）、`listEligible`（正式候选）都不再用几何/净空/可达性/规则指纹相等作否决条件；只保留结构读取、运行必需的 start/finish 数值、对象参数/路径引用、内容 hash 与草稿 revision 绑定。导入的旧规则声明仍不可入池（与本机人工通过区分）。
- 顺带修复真实阻断：`IndexedDbAdapter.listPublished/getPublished` 之前用草稿 store 读发布池，真实浏览器里发布后正式池读回 null/草稿记录；已改为读 `published` store。浏览器检查中"发布 → 正式池 → short.html 正式短塔加载"已走通。
- 入口收尾：编辑器只留一个「▶ 试玩」；发布按钮提示与左栏/接口/「怎么用」文字同步；`standard.html`/`devplay.html` 保留为历史页面且原本就带返回编辑器链接。
- 实测：`test_trial_page` 13/0（按 trial.html 真实脚本顺序重放）、`test_single_level_trial` 12/0、`test_editor` 228/0、`browser_trial23` 40/0、完整 `test_all` **1512 PASS / 4 FAIL**（4 条仍是历史 floor09/floor11）。未做真人手感/相机/性能确认。

## 2026-11-08 B4-R6 本轮验收（历史）

按trial.html实际script顺序重现TypeError: RA.ActionInput is not a constructor，RAF=0/RA.trial不存在，加载文案未结束。仅在审计进程补js/platform/action-input.js后，Space按住6帧仍jumpHeld=false/jumpsUsed0/脚底在start；ActionInput输出held.jumpHeld但页面读held.jump。P首次暂停，第二次仍paused，原因是消费输入放在running分支里。见独立JSON与源码；不是新的关卡自检，也未改运行HTML/脚本。

以下四段是 22号卡/B4-R6 当时的情况，已被上面的 B4-R7 实施取代；保留原文作历史。

22交付已有固定步/对象共享方法/血条光环改动，但页面无法启动，不宣称其实际手感已通过。用户要求人工胜过关卡自检，不再运行全量关卡/可达诊断，不使用交付1491/4作验收。之后每张任务卡均附可复制给实现agent的提示词。

23号卡保留一图start出生/finish上穿完成，修启动/跳跃/暂停，统一普通游玩初态/基础行为，去掉试玩与发布/正式加载的自动关卡合规门槛。只保留必需读取报错、草稿安全与人工通过绑定实际内容；不清存储、不自动认证/发布，不借技术版本批量推翻作者通过。最短人工流程为编辑器发起→看到地图/角色/血条/K就绪→走跳/扣血/施法/暂停继续→终点→保存记录后显式发布。（以上规则已在本轮实施。）

当时只有诊断证据/方案任务与文档，未改游戏源码/地图/www/APK或用户存储，未提交推送；当时没有可见屏幕/作者通过记录。

## 2026-11-08 B4-R5验收（历史，由22/23接续）

单图/start出生/本图finish上穿结束保留，不再重建流程。相同合成图/standard-v1/按右一秒：60Hz两边323.5px，120Hz试玩663.5px、正常323.5px；update(0)试玩也移动，二段跳高度随分帧不同。原因是TrialSession.update只有一次Player.update(STEP)，没有累计实际dt，而CD/对象用实际dt。不能调整跳跃常量掩盖。

60Hz隔离对象进一步复现：门不消失、浮石不预警/消失、弹簧不弹、齿轮不扣血、地刺周期不动、光环不清火球；独立流程未共用完整基础行为，可能错误认证。另有别名键错误释放/blur粘键、控制按钮/R未接；编辑器仍两按钮文字但均进入trial.html，旧页未清。22号卡只修时钟/输入/基础交互及必要入口收尾，保留地图/Player参数/独立结束条件。实施时升级规则指纹（建议b4-5），旧认证保留而不重签；当前尚未修复。

用户续补试玩连血条也没有、没有技能。源码确认当前HUD只有文字，无正常hpbar；K只有入口/计数器，光环显示与实际火球效果缺失，不能算技能可用。22号卡补生命条/HP同步、K/开局CD20提示、就绪/持续三态与可见范围及实际效果；基础反馈纳入本卡，不扩美术打磨。

实际全量1490/4、试玩5/0、独立审计exit0仅表示故障复现。用户未反馈认证发布链路，本轮未做新真实屏幕/真人认证/安卓或性能测量。本轮只审计/方案文档，未改游戏/地图/www/APK/用户存储，未提交推送。

## 2026-11-08 B4-R4验收（历史，由21/22接续）

用户人工反馈试玩仍失败/管道异常；独立真实页面逻辑+键盘/RAF步进探针复现：trial_entry→author_test_1→trial_exit，共2段管，越过旧完成线仍无完成。再推进60帧，时间0.9167→1.9，trialCompleted=null。GameSession只有保存计划与初始化完成字段，无消费者；标准页未迁移到共享计划。Node全量1483/4（四条floor09/floor11旧诊断），手势12/0；探针退出0只表示故障复现。没有新的真实屏幕试玩/真人认证或发布。

先前三层试玩是规划方案本身的选择，不能把管道归为agent擅加；新用户决策明确替代19/20号卡几何。21号卡实现单关TrialSession，不调用塔World/GameSession，复用基础移动/碰撞/实体；完成后冻结、核对快照保存认证、显式发布，JSON草稿备份不限。实施时升级规则指纹（建议b4-4，当前仍b4-3），旧内容/认证保留而不重签。短塔六图与侧碰撞/齿轮保留，仅做必要回归。本轮只改审计与方案文档，未改游戏/地图/www/APK或用户存储，未提交推送。

## 2026-11-08 B4-R3验收（历史，由20/21接续）

HEAD `d614fe0` / 实现`e764910`。用户仅反馈齿轮正常，不扩写全编辑器/认证通过。完整1490/4、19手势10/0；独立实际页面逻辑探针：openPlaytest的next是author_test_2，越线后1秒仍running；标记确认后同一次按压下一帧云板[5,5]变[3,5]。标准源码有单独生成支撑、结束和hash/revision认证保护，本轮未模拟标准成功或写认证。

20号卡修上述两个主链路，契约见 [单关试玩](docs/design/single-level-trials.md)。自动切云板是本轮新增规则；消费按压是修已有标记破坏地形缺口。开发/标准共用单关计划与真实完成事件，但开发不认证、标准standard-v1保护保留，短塔/旧原型各自独立。新修复尚未实现；本轮只有证据/文档，未改源码/运行图/www/APK或存储，未提交推送。

## 2026-11-08 B4-R2验收与编辑器下一步

HEAD `ba80e23`，实现`eba80a6`及追加回归`ba80e23`。完整1467/4、B4-R2 21/0；原16种同输入重跑0复现，落脚坐标一致。用户反馈bug已修复，18号卡关闭。独立浏览器DevTools未启动，交付方13/0与原图/历史JSON保留，不冒充重现；未补造认证/真机/性能。

编辑器裁剪审计：test1裁后模型finish=(15,0)正确，但旧selection=(15,7)未清、标记优先用它，复现了失败；当前单点gear路径仍被play拒绝。19号卡按最新用户澄清只做直角折线/闭合路线，无平滑/正圆；采用鼠标候选与自动坐标、统一路径几何并修R3旧夹具/R4裁剪。证据见 [审计](docs/checks/editor-gesture-scope-2026-11-08.json)，契约见 [设计](docs/design/editor-mouse-workflow.md)。本轮规划未改运行代码/地图/www/APK或存储，未提交推送。

## 2026-11-08 B4-R1验收（历史，R2后已修复）

验收HEAD `9219fc3` / 实现`7fff152`。用户报告短塔逻辑正常，不扩写成逐项录屏或认证；主体流程不重做。R2根因之一是FloorView仍只查询当前层，漏掉尚未正式入层的上层start侧支撑；另有origin.y=-2000/TS45与round转换不一致。证据与修复接口见 [设计](docs/design/cloud-side-collision.md)。独立浏览器DevTools未启动、退出1；交付方12/0保留，不冒充动态画面重现。本轮未改运行代码/地图/www/APK，仅证据、设计、18号卡及文档，未提交推送。

## 版本与回退基线

### 2026-11-07 B4首轮独立验收（历史）

验收HEAD `4b997df` / B4实现`dfbe10d`。独立完整自检1434/4、退出1；四条仍是旧floor09/floor11。新增探针复现R1～R4；独立浏览器DevTools未启动、退出1，交付方24/0证据原样保留，不冒充复现。用户已实际报告穿墙和管道问题，故B4暂不通过。详见 [报告](docs/checks/review-B4-2026-11-07.md)。本轮只新增证据、固定地图原字节副本、设计和17号卡及文档；游戏代码/运行地图/www/APK未改，未提交推送。

用户新地图来自“开发示例关卡”；level0有两个裸x使JSON不合法，定位(9,19)/(10,19)；boss底部start=(1,20)、无顶部出口。源件已原样保留，运行转换待实现。明确链路及字段见 [新设计](docs/design/short-tower-fixed-scenes-and-collision.md)。这属于新增确认需求，不追溯指责原交付未实现大厅F。

随后用户新增rest_level.json并明确先短塔/编辑器后置；原字节副本已保留在同一source-fixed目录。19×24，候选start=(13,18)、finish=(1,8)的内存几何检查无错误，自报hash匹配；见 [审计](docs/checks/rest-map-2026-11-07.json)。仅备份/方案调整，未接运行、未人工实走；原1434/4仍是最近一次完整自检，本次纯文档/原件备份未重跑游戏测试。

- T00 原型基线：`f56cdce`；T01 实现：`6a7e712`；T01-R 修复：`c7c5490`；T02A 交付：`f2a0e07`；T02A-R 修复：`6f88127`；B1/A3-C：`cc3df4a`；B1 主体：`fffaee0`；B1 文档/证据：`205d63c`；B1-R1 修复：`9f2a4e3`；B2 交付：`9a17f99`；B2-R1：`71e3219`；B3：`43fd30b`；B3-R1：`5dc5fb2`；B3-R2：`61a0b2d`；**B4：`dfbe10d`、B4-R1：`7fff152`、B4-R2：`eba80a6`、B4-R3：`e764910`**；B4-R4/R5/R6 为验收工作区，未单独提交。
- **B4-R7（23号卡）至 B4-R14（30号卡）的改动都在当前工作区、尚未提交**（trial 接线、load 只读校验、仓库 listPublished/epoch、编辑器精简/主题/齿轮/返回/旧页、完整塔/清池/分档/Boss 生命周期、连续入层/实存几何/邻层碰撞、移动火球/流星锤/齿轮轨道/怪物无阻挡/N04/N05、返回原稿/灵魂/污水、新主界面/种子/四档目录/旧入口退役、金币/弓箭手/正式计分/唯一最高分、测试与文档）；回退仍以 `d41e07d` 为基线。规则 b4-10，schema2/DBv3。未推送远程，未 `cap sync`、未构建 APK；`levels/floor01–12` 已按用户授权移到只读归档、当前 `levels/levels.js` 为空普通 catalog；`www` 已从 index 重建（38脚本、levels.js、assets），`browser_b3r2` 47/0、`browser_b2` 20/0 为29前历史回归。`android/` 未改。
- B2 开始前 HEAD `cdd7b54`；本轮新增短塔/规则/对象/Boss/编辑发布与模板，原图、素材、`levels/v2`、`levels/levels.js`、旧 game/playtest 未改。
- 本轮未推送远程；开始时无关 ZIP 保留。
- 已有本地 Git，origin 为 `git@github.com:yanfei728/reverse_abyss.git`；不要重复初始化，不丢弃他人未提交内容。
- 原图、`levels/v2`、`levels/levels.js`、assets、旧 game/playtest 对照 B1 起点 `ebd5b80` 无差异；开发样例只新增在 `levels/dev/`。
- 开始时未跟踪的无关 ZIP 原样保留，没有恢复或处理；没有再次初始化 Git。

## 任务状态

| 任务 | 状态 | 说明 |
|---|---|---|
| 需求、设计与任务卡 | 已完成当前轮整理 | 规则可在后续讨论中更新 |
| B4-R1短塔主体 | 用户人工反馈通过 | 六图/F/休整/Boss和R1保留，不重做17号卡 |
| B4-R2碰撞 / 18号卡 | **工程与用户人工验收通过，关闭** | 原16种0复现、专项21/0；不再作为下一步任务 |
| 编辑器19号卡 | 已交付、部分通过 | 齿轮人工正常；开发终止/标记持按未通过，不重做其他主体 |
| 20号卡 | 已交付、试玩未通过 | 三层方案已由21替代，标记自动云板/按压消费保留 |
| 21号卡 | 已交付、部分通过 | 用户反馈单图/起终点流程正常；控制与基础行为未通过，认证发布未补造通过 |
| 22号卡 | 已交付、启动不通过 | 缺输入脚本/跳跃字段错接/键盘无法恢复，23接续；已有固定步/对象/HUD改动保留 |
| 23号卡 | **用户人工确认试玩通过，关闭** | 主体功能齐全正常；不扩写为JSON往返/发布/性能专项全验，相关审计缺口由24处理 |
| 24号卡 | **用户人工确认编辑器正常，通过关闭** | 已验编辑器主体保留，不重做；见2026-11-09验收 |
| **25号卡** | **本轮验收通过关闭** | 用户人工走完41层；完整塔布局/缺图修复由26完成 |
| **26号卡** | **本轮验收通过关闭** | 三环节修复及独立复测；N04小收尾并入27，[验收](docs/checks/review-B4R10-2026-11-09.md) |
| **27号卡** | **怪物主体通过；返回R1工程修复关闭** | 28修复并复验；未提供人工发布专项不补造 |
| **28号卡** | **工程通过，作者编辑/试玩/导出反馈通过** | 原稿返回/魂池已实现，发布等未测保留，[验收](docs/checks/review-B4R12-2026-11-09.md) |
| **29号卡** | **已实施，待作者人工全流程** | 新菜单/种子/四档目录/旧链退役，[B4-R13](docs/checks/B4R13-2026-11-09-main-menu-level-library.md) |
| **30号卡** | **已实施，等作者人工验收** | 金币/弓箭手直接放置、正式计分20/5/10、唯一最高分、试玩无分；`test_30` 95/0、`browser_30` 33/0，[B4-R14](docs/checks/B4R14-2026-11-09-coins-archer-score.md) |
| 人工试玩通过 → 显式发布 | 待作者实际操作 | 通过记录绑定当前内容 hash（profile run-v1）；不伪造 passed，不自动发布；技术版本只作记录 |
| B1 | 工程验收通过 | [独立复验](docs/checks/review-B1R1-2026-11-06.md)；B1-R1 与 N02 已关闭 |
| **B2 / B2-R1** | **工程与短塔游玩通过；发布人工待补** | [独立复验](docs/checks/review-B2R1-2026-11-06.md)；R1～R3 关闭，不重做；不伪造制作发布通过 |
| **B3 / B3-R2** | **工程与本轮安卓人工验收通过；专项记录待补** | [最新复验](docs/checks/review-B3R2-2026-11-06.md)；0.3.2 / R4 关闭；文件与 PC 人工发布待补 |
| T00 | 已验收 | 可回退基线和检查记录存在；浏览器人工检查未测 |
| T01 | 数据层验收通过 | 编解码、参数描述、12 图迁移、测试接入；不代表编辑器与运行时接入完成 |
| T01-R | **R1～R5 复验通过** | [独立复验报告](docs/checks/review-T01R-2026-10-31.md)；N01 为非阻塞工具限制 |
| T02A | 已交付 | 数据模型与 JSON 往返；A1～A3 已修，见 [T02A-R 交付记录](docs/checks/T02A-R-2026-11-01.md) |
| T02A-R | A1/A2/A3-C 已通过 | 11-06 独立重跑容量探针通过；[探针](docs/checks/B1-A3C-probe.json) |
| T02B | **已并入 B1 交付** | IndexedDB 草稿 save/load/list、revision 冲突、保存状态 |
| T03/T04（B1 子集） | **已并入 B1 交付** | 共用 GameSession、可变宽高连续两层、开发试玩；完整端口工具/战斗仍留后续 |
| T05～T08 | **已并入 B2 交付** | 生命/光环/六类对象/休整/Boss/编辑发布 |
| T09～T10 | **已并入 B3** | 触控/布局/生命周期/JSON/离线包；本轮人工通过，文件等专项待补 |

## 当前实现事实

- 已有：原型移动/碰撞/机关/画图交互；LevelData/LevelCodec、EntityRegistry、LegacyImport、迁移工具；编辑器完整 LevelData（T02A）。
- B1 新增：IndexedDB 草稿（保存/列表/打开/revision 冲突/失败；刷新可找回）、共用 GameSession（固定步/暂停/动作）、World（可变宽高/偏置接口/active-preview-snapshot）、编辑层 + 样例 B 的两层开发试玩。
- B1-R1 新增：工作区令牌 + 保存上下文核对（旧回包不绑定新图）、草稿读取请求序号 + 起始 hash（旧读取不覆盖新工作）、试玩保存后令牌/dirty/hash 一致性检查与规范 handoff；N02 重开清遮罩/输入/帧时间并重载角色图。
- B1 的连续规则：同一玩家跨层不重建；脚底过线一次只提交一次；底边梯板防回落；下一层预热 `activeTime=0`；上一层地形保留到再上一层才释放。
- 原始 12 张图仍在 levels/，未修改；levels/v2/ 仍是未认证迁移草稿（ports=null）；levels/dev/ 是新的未认证开发样例，不进正式池。
- 默认 `index.html` 已接 B2 短塔；旧镜像/淡出换层原型明确保存在 `legacy.html`（历史入口）。B1 入口仍是 devplay.html。
- B2 新增：短塔入口 `short.html`、生命/无敌/光环/RunState、六类对象运行时、休整、两阶段 Boss、接口/对象/路径编辑、standard-v1 标准试玩、本地发布库/TowerPlanner/正式抽选；B2-R1 修默认入口、上层对象坐标与标准技能。
- 正式池只存在当前浏览器；当前干净环境没有已认证发布内容,开发短塔使用 `levels/b2/` 未认证模板。规则升 `b2-2` 后旧 `b2-1` 认证失效,需重新实际标准试玩;不冒充 passed。
- B3 新增：`js/platform/*`（ActionInput/ControlLayout/PlatformFiles/PlatformLifecycle）、`short.html` 触控/布局/导入导出、`www/` 离线包、Capacitor 7 Android 工程、debug APK；不复制 Core/物理。
- OPD2101 / Android 11 的 0.3.1 启动裁切已由 0.3.2 修复；用户确认本轮人工验收没有问题。系统文件/PC 往返及未逐项记录的通关、锁屏/性能等专项继续待补。正式签名/商店发布未做。
- 未实现：40 层扩展、遗物/NPC/联网、完整美术；旧 floor09/floor11 诊断仍在。
- B2-R1 交付方 Chrome headless 25/0；本轮独立 DevTools 未启动。PC 短塔与本轮安卓人工反馈通过；标准发布链路与性能测量仍未完成。

## B4-R2 云板侧边穿墙修复（当前交付）

2026-11-08交付并复验通过，详见 [最新复验](docs/checks/review-B4R2-2026-11-08.md)。修复后B4-R2 **21/0**、原16种0复现；交付方browser13/0保留，独立浏览器未启动；完整 **1467 PASS / 4 FAIL**，仍floor09/floor11。用户人工确认bug修复。

- `FloorInstance.otherStaticAt` 以世界像素查询当前/preview/前一层静态地形；上层 start 侧支撑进入整个玩家碰撞盒。
- 大厅→第1层布局原点改为 `-2025 = -45×TS`，消除 -2000/45 的 round 邻行误差；move/blockedAt/standingOn 使用同一适配。
- 云板仍单向；石墙四向；未改地图/物理/玩家尺寸；正常穿管不传送/不重建 Player。
- 六图/F/休整一次回血/Boss 中心10.5/14.5 无finish/死亡重试保持；R1 石块外观保留。
- 规则 `b4-3`/`collision=world-v3`；旧认证不伪造新 passed。
- **无新 APK**；Android 0.3.2 不含 B4；R3/R4/认证发布后置。
- **人工反馈更新**：用户确认bug修复；不扩写未提供的逐项操作、相机/性能或认证记录，Node结果与人工反馈分别记载。

## B3-R2 独立验收（已通过）

验收 HEAD `19a26dd`、实现 `61a0b2d`。独立完整自检 **1415 PASS / 4 FAIL，退出码 1**（B3 60/0），4 条仍为 floor09/floor11 旧诊断。0.3.2 APK 4,553,627 bytes，SHA-256 与交付一致，抽查 4 项包内文件匹配源码/www，独立验签退出 0。本轮浏览器 DevTools 未启动，交付方 47/0 与 R1 回归 35/0 保留，不冒充独立重现。

用户确认本轮人工验收没有问题，**14 号卡与 R4 关闭，安卓 0.3.2 本轮验收通过**。反馈沿用 OPD2101 / Android 11 上下文，没有补造未提供的逐项操作、WebView 版本、完整通关或系统文件记录。用户建议隐藏摇杆，让手指不离屏即可改变平移方向，明确“等之后改”；已记录 Q05，未实施、未排为新门槛。

见 [报告](docs/checks/review-B3R2-2026-11-06.md)、[后续待办](docs/design/followups.md)。当时仅增加独立证据与同步文档，未改游戏/地图/素材/www/APK、未构建或提交推送；当时没有新实现卡。2026-11-07 用户新增 B4 接口与三图任务，当前以本文开头及 15 号卡为准。

## B3-R2 修复交付记录（历史，用户现已验收通过）

2026-11-06 B3-R2 交付，详见 [记录](docs/checks/B3-R2-2026-11-06.md)。实测：`test_b3` **60/0**；完整 **1415/4**（引擎 606/4，其余全绿）；`browser_b3r2` **47/0**（960×540/800×360/960×600、DPR1/2/3、屏幕坐标点击、短屏面板、基础回退、离线 www）；`browser_b3` 35/0（R1 回归）。4 条仍是 floor09/floor11 旧诊断。

- **原因**：旧 overlay 只用 `inset:0`、wrap 只靠 `aspect-ratio/min()`，无基础回退；不支持 inset 的 WebView 会把菜单/设置放到底部。实际 WebView 版本未知，不把假设写成已确证根因。
- **修复**：显式 top/right/bottom/left + overflow/max-height；JS 用 innerWidth/innerHeight 算 16:9 的 px wrap；canvas backing store 独立 DPR；短屏压缩/滚动；安全区 @supports 增强；fatal overlay + `RA.short.diagnostics()`。
- APK：0.3.2/versionCode 5，4,553,627 bytes，SHA-256 `6DFDAE1D8081A8AF95D4E572E81294D54F96461860673ADCD3CC170E802A502E`；debug 验签 0，包内 HTML/JS 与 www 一致；0.3.0/0.3.1 保留。
- **未复测**：本机无设备/模拟器；OPD2101/Android 11 未装 0.3.2。真机冷启动/短屏/布局/系统文件/完整短塔/性能待验。
- 建议用户覆盖安装 0.3.2（同 applicationId/debug 签名；不卸载以保数据），按 [14 号卡](docs/tasks/14-b3-android-viewport-fix.md) 最短顺序复测。

## B3-R1 独立复验与真机启动失败（历史，R4 已由 B3-R2 关闭）

验收 HEAD `c7553c7`、实现 `5dc5fb2`。独立完整自检 **1415 PASS / 4 FAIL，退出码 1**（B3 60/0）；4 条仍为 floor09/floor11 旧诊断。原探针退出 **0**，R1 多触点全抬不粘键、R2 当前认证持久化后可入池、R3 未知草稿保真均关闭。APK 4,552,177 bytes，SHA-256 与交付一致，8 项包内文件对照相符，独立验签退出 0。本轮浏览器 DevTools 未启动，交付方 35/0 保留，未冒充独立重现。

用户随后实际安装 **B3 0.3.1**，设备 **OPD2101 / Android 11 / 高通骁龙 870 八核**：未打开布局时大厅标题只在屏幕底部露出；打开布局后触控按钮出现，设置面板仍被底部裁切，看不到角色/地图，无法正常游玩。记录为 **R4 / P1**，不是美术质量问题。实际 WebView 版本未知；无回退的 inset/aspect-ratio、容器尺寸与短屏溢出是优先排查方向，尚未确证根因。

详见 [报告与截图](docs/checks/review-B3R1-2026-11-06.md)、[B3-R2 卡](docs/tasks/14-b3-android-viewport-fix.md)。本轮仅做复验、需求/方案/任务卡与文档，未改游戏/APK、未构建或提交推送。下一步集中修入口与画面、补真实屏幕坐标启动/可见性检查并交付新 APK，再由用户同设备复测；完整短塔/系统文件与 PC 人工认证仍待补。

## B3 首轮独立验收（历史，R1～R3 已由 B3-R1 关闭）

验收 HEAD `9f4b097`、实现 `43fd30b`。独立完整自检 **1400 PASS / 4 FAIL，退出码 1**（B3 45/0），4 条仍为 floor09/floor11 旧诊断。补充探针退出 1，复现：

- **R1 / P1**：同一个左按钮 down(11)/down(12)/up(11)/up(12) 后 sources=1、left=true，全部松手仍移动；按钮只记录最后一个 source。
- **R2 / P1**：同 hash 的旧规则 passed 声明被保留；重导入当前声明返回 eligible=true，但库内仍旧规则，明确加入池失败 CERT_REQUIRED。
- **R3 / P2**：未知对象草稿 draft 校验无错误，却被 importLevel 的 play 校验拒绝，未保存。需保真草稿、单独阻止运行/发布。

APK 独立验签退出 0，4,581,590 bytes、SHA-256 与交付一致，包内抽查 8 项与当前对应代码一致；包本身也含待修逻辑。本轮独立 DevTools 未启动，交付方 Chrome 25/0 原证据保留，不冒充重现。用户明确尚未安装真机，PC 认证发布与手机文件真实往返未验。

详见 [报告](docs/checks/review-B3-2026-11-06.md)、[探针](docs/checks/review-B3-2026-11-06-probes.json)、[APK 对照](docs/checks/review-B3-2026-11-06-apk.json)。本轮仅新增证据、收尾卡与文档，未改游戏/地图/素材/APK，未安装或构建，未提交推送。下一步一次完成 13 号卡并重新打包，再集中复验与真机测试。

## B2-R1 独立复验（已通过，历史环境描述）

验收 HEAD `df008b4`、修复 `71e3219`。完整自检独立 **1355 PASS / 4 FAIL，退出码 1**；B2 96/0，4 条仍为旧 floor09/floor11。独立探针退出 0：原点/上层门、浮石预警/消失/占位恢复、火球伤害一致，标准 CD 归零后可施法。**R1～R3 关闭，工程验收通过**。见 [复验报告](docs/checks/review-B2R1-2026-11-06.md)。

用户本轮人工测试短塔“基本正常”，明确允许美术粗糙、缺音效、AI 地图质量和 Boss 技能后续打磨；已入 [非阻塞待办](docs/design/followups.md)。没有把这些项升级为新修复门槛，也未声称所有关卡/边界或完整通关记录已齐全。

用户明确未做标准通关→认证写回→发布→正式实抽，保留人工待验，不生成 passed。B3 的独立平台/触控适配可先推进；正式内容与认证文件往返验收前补齐真实认证样本。当前无 APK；PATH 有 Node/npm/Java、JAVA_HOME 路径存在，adb 不在 PATH、SDK 变量未设，尚不能断言 SDK 未安装或构建可用。

本轮仅写独立证据、文档、B3 任务方案，未改游戏代码/地图/素材，未安装工具链，未提交推送。原图/v2/素材/旧 game/playtest 保留。

## B2-R1 修复交付记录（历史）

B2-R1 已交付，待集中复验；原 B2 主体保留。修复后实测：完整 **1355 PASS / 4 FAIL，退出码 1**（引擎 606/4,其余全绿）,4 条仍是 floor09/floor11 旧诊断；`test_b2` **96/0**；真实 Chrome headless **25/0**；reviewer 修复后探针新运行时门/浮石/火球/恢复在原点与上层一致，标准 CD 后 `castAfterCooldown=true`。详见 [B2-R1 记录](docs/checks/B2-R1-2026-11-06.md)。

- **R1 / P1**：`index.html` 默认自动进 `short.html`，旧原型完整移到 `legacy.html` 并在入口明确标注历史；编辑器/devplay 的返回路径落到当前短塔。
- **R2 / P1**：`updateActiveObjects/playerOverlap` 统一把 Player 世界坐标转为实例局部再比较；门/浮石/弹簧/火球/地刺/齿轮在非零原点上层正常。浮石 0.5s 预警/1.6s 消失/占位延后恢复、暂停冻结；normal-1/2/3 去掉遮挡并重生成。
- **R3 / P2**：`standard-v1` 改为初始无活动光环、剩余 CD 20 秒、之后可施法;页面 K 接同一 Session,HUD/光环可见;规则升 `b2-2`,旧认证失效需重新通关。
- 新增正常固定步跨层后的上层对象回归;不是只改 floorIndex/只调对象更新。原 B2 的 78/0、1334/4、23/0 证据保留为历史,不覆盖。
- **待人工**：作者/用户实际标准通关→写回→发布→正式抽选、完整短塔/Boss 真人通关;自动化不代打、不生成 passed。

## 检查与证据

原始 T00 基线：940 PASS / 4 FAIL。修复前复验 `node tools/test_all.mjs`：**1089 PASS / 4 FAIL**（引擎 587/4、编辑器 238/0、贴图 126/0、数据 138/0）。

T01-R 修复后（2026-10-31，当前工作区）：

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_all.mjs` | **1188 PASS / 4 FAIL**（引擎 587/4、编辑器 238/0、贴图 126/0、数据 139/0、修复自检 98/0） | `1` |
| `node tools/test_leveldata.mjs` | 139 PASS / 0 FAIL | `0` |
| `node tools/test_t01r.mjs` | 98 PASS / 0 FAIL | `0` |
| `node tools/migrate_levels.mjs` | 12/12 幂等跳过（`unchanged`），`levels/v2/` 未重写 | `0` |
| 隔离重迁（临时目录） | 12/12 成功，输出与 `levels/v2/` 逐字节相同 | `0` |

4 条失败仍为 floor09/floor11 的逐跳可达性各被重复报告一次，不能据此作人工通关结论；本卡未修、未跳过。

[验收报告](docs/checks/review-2026-10-31.md)、[修复报告](docs/checks/T01R-fix-report.md)、[原始自检输出](docs/checks/review-2026-10-31-test_all.txt)、[复现脚本](docs/checks/review-2026-10-31-probes.mjs)、[复现结果（修复前）](docs/checks/review-2026-10-31-probes.json)、[复现结果（修复后）](docs/checks/T01R-postfix-probes.json)、[修复后完整自检](docs/checks/T01R-test_all.txt)、[隔离迁移记录](docs/checks/T01R-migration-isolated.txt)。

已用 Git 对照确认原始图、模板、levels.js、assets 与旧编辑器/游戏/试玩代码均未偏离基线。危险路径测试仅使用系统临时目录，且测试结束复核正式 `levels/` 与 `levels/v2/` 文件 sha256 未变。未执行真实浏览器画面/手感、安卓或性能测量；当前 Python 静态服务器环境仍未验证。

本次独立复验再次运行完整自检，仍为 1188/4、退出码 1；重跑上轮 7 个场景，行为均已修正；在新临时目录重迁 12 张图，输出与 levels/v2/ 逐字节相同、源文件未变。证据：[复验报告](docs/checks/review-T01R-2026-10-31.md)、[完整输出](docs/checks/review-T01R-2026-10-31-test_all.txt)、[场景输出](docs/checks/review-T01R-2026-10-31-probes.json)、[隔离迁移](docs/checks/review-T01R-2026-10-31-isolation.json)。本轮未修改实现代码。

## T02A 交付与独立验收

编辑器模型与 JSON 文件往返已完成，详见 [T02A 交付记录](docs/checks/T02A-2026-10-31.md)。

上句及下表记录交付方已实现的主体与测试结果，不代表验收通过。2026-11-01 独立复跑完整自检同为 1089/4、退出码 1；新增边界检查复现 A1～A3。Chrome 复跑因 DevTools 端口未启动而未完成，原有 18/0 与截图仍作为交付方证据保留，本轮不冒充已重现全部浏览器操作。

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_editor.mjs` | **139 PASS / 0 FAIL**（旧 TXT/改池/试玩测试替换为 T02A 契约测试） | `0` |
| `node tools/test_all.mjs` | **1089 PASS / 4 FAIL**（引擎 587/4、编辑器 139/0、贴图 126/0、数据 139/0、修复自检 98/0） | `1` |
| `node tools/browser_t02a.mjs` | **18 PASS / 0 FAIL**（本机 Chrome 156，headless + DevTools 协议，真实鼠标/滚轮/下载） | `0` |
| `node tools/migrate_levels.mjs` | 12/12 幂等跳过；原图与 levels/v2/ 未改 | `0` |

- 模型：`EditorModel.data` 是唯一真值，没有第二份 cells；对象/出生点/难度/背景/路径/装饰/extensions/未知字段都留在 LevelData 里；撤销/重做快照整份数据（100 步 / 32 MiB）。
- 导入导出：v2 JSON 走 LevelCodec（失败/未来 schema 不替换当前图）；旧 TXT/旧 JSON 只走 LegacyImport；导出只发起下载，不写 levels/、不清 dirty。
- UI：打开 JSON / 导入旧图 / 导出 JSON / 复制 / 查看 / 难度 / 背景；试玩禁用并解释；旧 TXT 导出、保存到游戏、文件夹授权、自动写入全部移除；G 不再是画笔，旧 G 只显示迁移位置。
- 浏览器证据：[截图](docs/checks/t02a-browser-import.png)（另有 draw / reopen 两张）、[浏览器下载的 JSON](docs/checks/t02a-browser-exported.json)、[逐项结果与版本](docs/checks/browser-t02a-2026-10-31.json)。
- 演示 JSON：[levels/demo/t02a-demo.json](levels/demo/t02a-demo.json)，未认证、`ports=null`，含难度 3、两个参数对象、一条 pingpong 路线、背景、装饰、extensions、未知对象与未知字段。
- 附带修复：`LevelData.decode` 的 size/terrain 不再与调用方共享引用（编辑模型不会改写传入数据；有回归断言）。
- 未做：T02B 草稿仓库（刷新不恢复）、正式试玩、发布认证、端口/参数/路径编辑；文件选择对话框无法在 headless 自动点击，改用同一处理函数并由用户可手动复验。
- 测试数量变化说明：编辑器测试 238 → 139 不是删断言，而是旧 TXT/旧池/旧试玩断言被目标契约替换；引擎、贴图、数据、修复自检数量未变。

### T02A-R 修复结果（待复验）

最新独立复验：完整自检仍为 **1143/4、退出码 1**，原场景已修，普通确认缩图可导出/重开。新增容量场景显示接口备份会超过扩展上限（A3-C）；Chrome/Edge 本轮未启动 DevTools，不宣称重现交付方 21/0。见 [本轮报告](docs/checks/review-T02AR-2026-11-01.md) 与 [容量复现](docs/checks/review-T02AR-2026-11-01-resize.json)。以下表格保留交付时记录。

2026-11-01 A1～A3 已修复，详见 [T02A-R 交付记录](docs/checks/T02A-R-2026-11-01.md)。修复后实测：

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_editor.mjs` | **196 PASS / 0 FAIL**（新增 A1/A2/A3 模型 + UI 回归） | `0` |
| `node tools/test_all.mjs` | **1143 PASS / 4 FAIL**（引擎 587/4、编辑器 196/0、贴图 126/0、数据 139/0、修复自检 98/0） | `1` |
| `node tools/browser_t02a_r.mjs` | **21 PASS / 0 FAIL**（Chrome 156 headless；机关长按 1.2 秒、坏接口导入、缩图取消/确认/撤销） | `0` |
| `node tools/migrate_levels.mjs` | 12/12 幂等跳过；原图与 levels/v2 未改 | `0` |

- **A1**：机关画笔同格同类幂等（保留原 id/参数/未知字段、不占配额）；换类型才覆盖；矩形/油漆桶/多格笔刷同规则；按住 1 秒仍只有 1 个对象、一笔撤销。复现脚本 60 → 1。
- **A2**：`fromData/fromJSON/fromLegacy` 统一过共享 draft 校验，结构 error 不返回可提交模型；`replaceModel` 失败完整回滚模型/历史/dirty/视角；检查面板不再读坏 `ports.entry/exit`。复现脚本：无异常、旧图保留、`oldWorkPreserved=true`。
- **A3**：`resizeImpact` 计入接口开口，未确认拒绝；确认后原 ports 完整追加到 `extensions.retiredPorts`（不覆盖旧记录）、`ports=null`；不夹取 col；撤销还原。复现脚本：`impact.ports` 0 → 2。
- 浏览器证据（新文件名，保留 T02A 旧证据）：[导入后](docs/checks/t02ar-browser-import.png)、[坏接口导入后](docs/checks/t02ar-browser-bad-import.png)、[缩图后](docs/checks/t02ar-browser-resize.png)、[逐项结果](docs/checks/browser-t02a-r-2026-11-01.json)。
- 本轮 Chrome 启动成功并跑完 21 项；验收方 2026-11-01 的启动失败记录与旧 18/0 证据都保留，不互相冒充。
- 原关卡、v2 输出、assets、旧 game/playtest 与上一版无差异；原有 4 条 floor09/floor11 失败未修、未跳过。

## B1 交付（待复验）

2026-11-04 B1 一次接通，详见 [B1 交付记录](docs/checks/B1-2026-11-04.md)。实际结果：

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_editor.mjs` | **225 PASS / 0 FAIL**（草稿保存/恢复/冲突/失败/保存期间编辑、A3-C、开发试玩交接） | `0` |
| `node tools/test_world_session.mjs` | **41 PASS / 0 FAIL**（四层生命周期、跨层、预热、暂停、样例同步） | `0` |
| `node tools/test_all.mjs` | **1224 PASS / 4 FAIL**（引擎 595/4、编辑器 225/0、贴图 126/0、数据 139/0、修复自检 98/0、世界/会话 41/0） | `1` |
| `node tools/browser_b1.mjs` | **21 PASS / 0 FAIL**（Chrome 156 headless；编辑保存→刷新恢复→键盘跨层→暂停恢复） | `0` |
| `node docs/checks/B1-A3C-probe.mjs` | A3-C 容量场景按预期失败、原图保留 | `0` |
| `node tools/sync_dev_levels.mjs --check` | 开发样例已同步 | `0` |

- **A3-C**：`resizeCandidate` 在完整副本上缩图/追加备份/共享 encode，容量不足返回 `LIMIT_EXCEEDED`，原模型/端口/extensions/历史/dirty/视角零变更；原文件仍可导出。
- **草稿**：IndexedDB `save/load/list`、revision 冲突、失败不覆盖；保存按发起快照，保存期间编辑不清新 dirty；浏览器刷新后找回。
- **运行时**：`GameSession` 固定 1/60 步、暂停冻结、恢复不追算；`World` 支持不同宽高/偏置接口、active/preview/snapshot、n−1 释放、底边梯板防回落、一次越线一事件。
- **开发试玩**：编辑器按钮先 play 校验、自动保存草稿、交接给 `devplay.html`；不合法接口明确拒绝；直接打开 devplay 用内置 A+B。
- **开发样例**：`levels/dev/floor-a.json` / `floor-b.json`，未认证、不进 `levels/levels.js` 或正式池。
- 浏览器证据：截图 [保存后](docs/checks/b1-browser-editor-saved.png)、[恢复后](docs/checks/b1-browser-editor-restored.png)、[试玩开始](docs/checks/b1-browser-devplay-start.png)、[跨层](docs/checks/b1-browser-devplay-floor2.png)、[暂停](docs/checks/b1-browser-devplay-paused.png)，逐项结果 [browser-b1-2026-11-04.json](docs/checks/browser-b1-2026-11-04.json)。
- 未做/未测：战斗/敌人/技能/Boss、发布认证、端口编辑、安卓/触屏、真实手感；草稿冲突只有 Node 双实例，文件选择对话框未自动点击；floor09/floor11 旧失败未修。

## B1-R1 修复（待复验）

2026-11-06 修复异步保存/读取/试玩上下文与 N02，详见 [B1-R1 交付记录](docs/checks/B1-R1-2026-11-06.md)。

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_b1r.mjs` | **24 PASS / 0 FAIL**（R1a/R1b/R1c/R1d、正常 handoff、N02） | `0` |
| `node tools/test_all.mjs` | **1248 PASS / 4 FAIL**（引擎 595/4、编辑器 225/0、贴图 126/0、数据 139/0、修复 98/0、世界/会话 41/0、B1-R1 24/0） | `1` |
| `node tools/browser_b1.mjs` | **25 PASS / 0 FAIL**（Chrome 156 headless；新增暂停菜单重开遮罩） | `0` |
| 修复后独立探针 | 三场景 + N02 全部符合预期，退出 0 | `0` |

- **R1a**：试玩自动保存期间编辑 → 不导航、dirty/新改动保留、不写 handoff；保存失败/切换图也不离开。
- **R1b**：保存 A 期间切到 B → 旧回包返回 false，不绑定 B；A 记录完整，B 保存后有独立草稿。
- **R1c/R1d**：读取期间编辑或切图 → 过期回包不替换；两个读取乱序时后选草稿生效。
- **一致性**：试玩 handoff 使用刚保存的规范快照并再跑 play 校验，内容与草稿一致。
- **N02**：暂停菜单重开隐藏遮罩、清输入/帧时间、新玩家仍加载角色图。
- 证据：[异步自检](docs/checks/B1R1-test_all.txt)、[浏览器日志](docs/checks/B1-browser.txt)、[修复后探针](docs/checks/B1R1-postfix-probes.json)、[原验收探针（保留）](docs/checks/review-B1-2026-11-06-probes.json)。
- 未测：真实双窗口并发、系统文件对话框、手感/安卓/性能；原 floor09/floor11 四条旧失败未修。

## B2 交付（历史，B2-R1 已取代）

2026-11-06 B2 批内连续完成，详见 [B2 交付记录](docs/checks/B2-2026-11-06.md)。以下 78/0、1334/4、23/0 是 R1 前证据，保留原文；当前数字见上方 B2-R1。

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/test_b2.mjs` | **78 PASS / 0 FAIL**（生命/光环/六类对象/休整/Boss/抽选/发布/编辑工具） | 0 |
| `node tools/test_editor.mjs` | **225 PASS / 0 FAIL** | 0 |
| `node tools/test_all.mjs` | **1334 PASS / 4 FAIL**（引擎 603/4、编辑器 225/0、贴图 126/0、数据 139/0、修复 98/0、世界/会话 41/0、B1-R1 24/0、B2 78/0） | 1 |
| `node tools/browser_b2.mjs` | **23 PASS / 0 FAIL**（Chrome headless；短塔/光环/暂停/跨层/死亡重试/编辑器工具/标准页） | 0 |
| `node tools/sync_b2_levels.mjs --check` | 6 层模板已同步 | 0 |

- 短塔 `short.html`：大厅→3 普通层→休整→两阶段 Boss；开发短塔用 `levels/b2` 未认证模板；正式短塔只从本地已认证发布池抽。
- 战斗：100 血、接触 20、1 秒无敌；光环 14/20 秒、跨层/暂停规则；六类对象实际运行；死亡/异常越界回大厅并重试同一塔。
- Boss：两阶段、三种预警攻击、exposed 停攻清场、单次 cast 只掉一阶段、命中消耗光环不重置冷却、出口关闭到击败。
- 编辑/发布：接口、对象参数、路径点/loop/pingpong；standard-v1 标准试玩从生成入口真实过关；认证写回草稿不自动发布；发布库校验回执/规则/revision；TowerPlanner 仅抽已认证普通层。
- **标准试玩人工通关和正式池实抽尚未完成**：当前干净环境正式池为空；自动化不代打、不生成 passed。开发模板/数值需人工调参。
- 浏览器证据：[日志](docs/checks/B2-browser.txt)、[逐项结果](docs/checks/browser-b2-2026-11-06.json)、五张截图（短塔开始/第2层/重试/编辑器工具/标准页）。
- 未测：完整真人短塔通关、人工认证、安卓/触控/性能、真实双窗口/文件对话框；旧 floor09/floor11 诊断仍在。

## 已关闭的验收问题

2026-10-31 T01-R：以下 5 项均已修复并通过独立复验，表内描述是修复前的问题；详见 [复验结论](docs/checks/review-T01R-2026-10-31.md)。

| ID | 优先级 | 复现与影响 |
|---|---|---|
| R1 | P1 | 未知对象额外字段在 decode 时无提示丢失；encode 后重开 HASH_MISMATCH；未来 schema 被 encode 降级 |
| R2 | P1 | 迁移输入输出同目录时先覆盖源文件，后报错；需写前检查路径与冲突 |
| R3 | P2 | 认证与当前 rules 都缺版本/指纹时，publish 校验错误地通过 |
| R4 | P1 | 80 个未知格只保留 64 个；旧未知对象额外字段和路径引用被删除 |
| R5 | P2 | encode 可成功导出超过自身导入上限的文件，随后无法重新打开 |

## T01-R 修复结果（已复验）

- **R1**：`decode`/`encode`/`hash` 统一走 `LevelData.project()`；未知顶层/对象/路径/子字段保留并进入 hash；`encode` 与 `decode` 都拒绝非 2 的 schema；`encode` 写后回读自检。复现脚本：`decodedBehavior` 保留、`reopenOk=true`、v3 导出被拒。
- **R2**：迁移改为“先规划后写入”，写入前检查同目录、大小写/别名、输出 id 碰撞、报告/源文件冲突；已有输出内容不同默认报冲突，`--force` 才覆盖；失败不写任何文件。复现脚本：`sourceChanged=false`、退出码 `1`。
- **R3**：认证与当前 rules 的版本/指纹先分别验证非空字符串再比较；`completedAt` 校验 ISO8601 带时区。复现脚本：`errorCount` 从 0 变 3。
- **R4**：未知格/旧实体不再截断（超容量明确 `LIMIT_EXCEEDED`）；旧对象额外字段、`pathId`/`legacyPathId`、`legacyType`、`legacyId`、旧注释与未识别顶层字段均保留；迁移后草稿必须可保存。
- **R5**：`encode` 按 UTF-8 实际字节数检查总上限，超限 `LIMIT_EXCEEDED`，不再导出打不开的文件。
- 附带修正：`decode` 的同一条警告不再重复出现（有断言）。

非阻塞 N01：自定义报告父目录不存在时，规划通过但写报告 ENOENT，可能已有新输出；源文件保持不变。暂先创建报告目录；不能把工具描述成任意 I/O 失败都零写入。独立维护项为报告路径预检/准备及准确失败清单，不阻塞 T02A 调用共用数据模块。

新增回归：`tools/test_t01r.mjs`（98 项，R2 路径冲突全部使用系统临时目录）。`tools/test_leveldata.mjs` 的“断路径”断言按新契约拆分（草稿可存、试玩拒绝），旧断言不是被跳过而是被替换并说明原因。

具体改动：`js/level-data.js`、`js/legacy-import.js`、`tools/migrate_levels.mjs`、`tools/test_leveldata.mjs`、`tools/test_all.mjs`，以及重生成的 [迁移报告](docs/checks/T01-legacy-migration.md)。

原编辑器“保存即改旧池”链路已经由 T02A 移除。其他原型限制仍在：游戏旧池未验证可抽选、旧种子受池排序/内容影响、主游戏与旧试玩分叉、浮石立即消失。这些分别由后续卡处理，不混入当前修复。

## B1 独立验收（2026-11-06）

完整自检独立复跑为 **1224 PASS / 4 FAIL，退出码 1**，仍为 floor09/floor11 旧诊断；A3-C 探针通过，原图/v2/素材/旧 game/playtest 对比 B1 起点无差异。普通草稿保存恢复、连续世界与暂停主体成立。

新增确定性异步探针复现 **B1-R1（P1）**：试玩自动保存期间编辑，仍带未保存新内容离开；保存 A 期间切换 B，旧回调将 B 绑定回 A，后续保存覆盖 A；读取草稿期间编辑，回包覆盖新工作并清 dirty。三个场景作为一组修复，一次交付。**N02 非阻塞**：暂停菜单重开后遮罩不消失，可顺手修。

本轮 Chrome/Edge 均未启动 DevTools，退出码 1；交付方的 21/0 与原截图保留，不算本轮重现。人工仅查看交付跨层截图，未测真实手感、安卓或性能。证据：[报告](docs/checks/review-B1-2026-11-06.md)、[完整输出](docs/checks/review-B1-2026-11-06-test_all.txt)、[异步复现](docs/checks/review-B1-2026-11-06-probes.json)、[浏览器日志](docs/checks/review-B1-2026-11-06-browser.txt)。

## B1-R1 独立复验（已通过）

验收 HEAD `cdd7b54`。完整自检独立复跑为 **1248 PASS / 4 FAIL，退出码 1**；4 条仍是旧 floor09/floor11 诊断。原三种异步场景独立复跑全部符合预期，N02 遮罩已隐藏；新增异步回归 24/0（含读取乱序与正常 handoff 一致性）。**B1-R1 / N02 关闭，B1 工程验收通过。**

本轮 Chrome/Edge 未启动 DevTools，不声称重现交付方 25/0；真实双窗口、文件对话框、手感/安卓/性能未测。原图/v2/素材/旧 game/playtest 对比 B1 起点无差异；原证据保留。见 [复验报告](docs/checks/review-B1R1-2026-11-06.md)、[自检](docs/checks/review-B1R1-2026-11-06-test_all.txt)、[场景](docs/checks/review-B1R1-2026-11-06-probes.json)。

异常越界判死亡、回大厅后重新挑战同一塔已实现；B1 的无伤本层 respawn 已被替换。

## B3-R1 修复交付记录（历史，独立结论见上）

2026-11-06 B3-R1 交付，详见 [记录](docs/checks/B3-R1-2026-11-06.md)。实测：`test_b3` **60/0**；完整 **1415/4**（引擎 606/4，其余全绿）；`browser_b3` **35/0**（实际 PointerEvent 同按钮多指/cancel/无关 id、IndexedDB 重认证读回、布局/离线 www）；修复后 reviewer 探针退出 0。4 条仍是 floor09/floor11 旧诊断。

- **R1**：每按钮 pointerId→source Map，up/cancel/lost/leave 只释放对应触点；后台/暂停/菜单清来源与视觉；布局拖动锁定 pointer。实际 DOM 两指两种顺序、全抬无粘键。
- **R2**：认证比较完整 profile/hash/rules/publish；同 hash 当前认证原子更新旧声明，返回实际 revision；读/写/冲突失败不改草稿；旧声明不覆盖当前有效认证；浏览器 IndexedDB 重启读回。
- **R3**：导入持久化改用 draft 门槛；未知对象/断引用/ports=null 原样保存为 `runnable:false` 草稿，play/publish issues 明确；坏 JSON/结构错误仍拒绝。
- APK：新版 `docs/checks/B3-reverse-abyss-0.3.1-debug.apk`，4,552,177 bytes，SHA-256 `23EDEC3DF31F357896B1D15D1999B0F3D10A35B03E587D05B78A7DBF294BCC1C`，versionCode 4/0.3.1，debug 验签 0；旧 0.3.0 保留。
- **未安装**：无 adb 设备/模拟器；真机未冷启动/多指/锁屏/返回/文件选择/分享/性能。正式签名/商店发布未做。

## B3 平台壳与 APK（原交付记录，已被 B3-R1 取代）

2026-11-06 B3 平台壳交付，详见 [B3 记录](docs/checks/B3-2026-11-06.md) 与 [工具链](docs/checks/B3-toolchain.md)。实测：`test_b3` **45/0**；完整 **1400/4**（引擎 606/4，其余全绿）；`browser_b3` **25/0**（移动视口/多来源触控/布局/暂停/返回/离线 www）。4 条仍是 floor09/floor11 旧诊断。

- 离线包：`www/` 只含短塔运行文件；Capacitor 7.6.10 锁定（core/android/cli）、App 7.1.2、Filesystem 7.1.9、Share 7.0.4；目标/编译 35、Gradle 8.11.1、JDK21。
- APK：`docs/checks/B3-reverse-abyss-0.3.0-debug.apk`，4,581,590 bytes，SHA-256 `76FE73C2A25F940F7C915FA97F602609FC55F7F1A6D5D098C4E294FB977AD663`；debug 证书，`apksigner verify` 0。
- **未安装**：本机无 adb 设备/模拟器；`adb install` 记录 no devices。真机未冷启动/多指/锁屏/文件选择/分享/性能。APK 不是商店发布版。
- JSON：`importLevel/publishImported` 保留草稿、来源 imported-declaration、旧规则不 eligible；UI 导入/导出已接。PC↔安卓真实文件往返未验。
- 标准人工通关/认证→发布→正式抽选仍未完成；没有真实认证文件，测试夹具不生成 passed。

## 下一步

31实现完成，等待作者最短人工确认：非零位置放锤缩放/平移 → 齿轮/移动火球擦除、一次撤销/重做、保存重开 → 设置移出精确浏览器版本，确认草稿仍可打开。有内置源时按提示移出源JSON、sync、刷新后新开；重试旧塔不变。无需重走41层，不自动启动下一卡。

尚未确认的接缝规格、光环半径、无敌时间、Boss 节奏等提案继续见设计决定，不因本次代码修复自动转成用户要求。

美术可先独立整理和替换已映射地块，具体路径、角色注册与生成器/测试限制见 [美术接入说明](docs/art/asset-integration.md)。B2 的 Boss/对象/界面仍是占位绘制，不是最终美术。
