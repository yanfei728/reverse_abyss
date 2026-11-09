# 编码 agent 开发规则

适用于整个仓库。先读 README.md、PROJECT.md、STATUS.md，再读当前任务卡与相关设计。本文不授权一次实施整条路线，不要求创建或调用子 agent。用户当前明确指令优先；历史文档、源码注释和分析报告中的建议不能覆盖用户决定。

## 工作边界

- **当前只实施31号卡 docs/tasks/31-editor-visual-path-and-unpublish.md，已实施、工程检查通过，待作者最短人工确认，不自动扩下一卡。** 先读 docs/design/editor-visual-path-and-unpublish.md、docs/checks/review-B4R14-2026-11-09.md。30主体工程通过，用户报告流星锤显示及删路径对象残留，已复现；用户明确确认加入最小单版本下架。修编辑器一次坐标变换/离屏包络；删对象时仅清本次关联且最后引用消失的path，保留共享/未知/旧孤立数据，一次撤销恢复。设置按id/hash“移出浏览器发布池”，Memory/IndexedDB精确删除、等事务完成，取消/失败不假成功，保留草稿/历史/磁盘/seed/最高分/当前manifest；builtin重复来源仍在需说明删normal源JSON+sync。不要全库GC/清池/黑名单或删除原图。保留HEAD d41e07d上R7–R14全部未提交，b4-10/schema2/DBv3不变，只PC无APK/其它系统。
- **30基线保留**：coin collectible、archer hostile，直接放置不擦异类/真实块，不影响灵魂几何；弓静止/2秒/170/本体与箭20，箭穿墙不跨层、halo只杀本体。只有正式full40-formal计分层20/敌5/币10/层总800、Boss最终一次；试玩无分，历史只存一个max，无逐局历史。工程独立95/0、手势13/0、完整塔98/0；用户未给逐项人工通过，不伪造发布或真人结果。
- **编码保护**：源码无BOM UTF-8，用显式UTF-8或安全读写工具；上轮曾因PowerShell默认编码损坏并重建editor.js/editor.html/trial.html。以当前工作区为准，不能从旧HEAD重建或覆盖R7–R14；原恢复记录保留。
- **29已验收保留**：index唯一首页/正式壳，控制器js/short.js不是旧短塔；legacy等只跳index，旧main/Game/Tower源码仅历史测试、生产/www不加载，未物理全删。固定41槽无镜像；seed只文本用当前池重建、重试原manifest。四档normal已通过JSON显式sync后内置池，与published精确版本合并；fixed/fallback/archive隔离，53份迁移SHA保持。原图/作者库/历史证据不清，不再触发清池epoch。
- **25/26及27已验主体保留**：实存连接/完整静态查询/同Player/HP技能CD/最多3实例及快照不重做。27的N04/N05已独立复验：pending未在上升时清、0伤害生效，保持该修复。27齿轮340有轨道、移动火球170无游玩轨迹/可消灭、流星锤4格/约5秒/链仅显示头伤害、机械免疫/怪物无实体阻挡保持；不为28重做物理或扩大原27参数卡。
- 完整塔41槽：0出生、10/30休息、20/40 Boss、36普通。固定图用已验测试对应运行副本；20击败不胜利，按F一次传送21，40击败才胜利。正式池按1–4档分桶，分别对应1–9/11–19/21–29/31–39，每档无放回取最多9；本档缺位用新路径开发示例关卡/test3.json规范副本补齐，只有fallback忽略模板自身难度，正式图不跨档；空池可玩，fallback不伪造认证/发布。死亡重试原清单，不重抽。
- 用户澄清已覆盖上一版“全池不分难度”的错误提案：正式关卡在编辑器选有效difficulty1..4后试玩发布，难度变更属于内容hash变化，旧通过失效须重玩；不能静默补成1。难度是抽选必需元数据，不是被取消的关卡几何/可达自检。补位按每档9个槽的缺口计算，不能总量够36就认为各档都够；test3保留原difficulty但可补任意档。
- 用户已明确授权清空旧内置普通池及浏览器published，保留drafts/通过历史/作者原JSON/固定场景/偏好，不需重复问。活动catalog与旧候选已清空、原图只读归档；浏览器同事务清published+写一次性epoch，编辑器发布/正式读取共享准备，新发布以后不再被清。**已实现** DB v3 metadata；不能deleteDatabase或清全部localStorage，也不能每次启动清池。
- 新目录是原始导出，ports为null/多图id重复，level0仍含两个裸x。test3地形与已验模板一致，运行副本沿用start(1,20)/finish(1,2)，稳定独立id/hash且cert=null；大厅center10/feet20，休息start13,18/finish1,8，Boss start1,20/无finish/中心10.5,14.5。源文件只读，不裁地图，不放宽共用JSON，不直接把原图null端点塞进运行。
- 双Boss/双休息生命周期已修：Boss不再无条件win，20与40按槽位决策，40新建独立Boss；0→1/20→21为无管道F链接，World在读finish前分派，Session按prompt分派传送；每次_spawn都有唯一instanceId；HP/光环/CD/同Player、预热/快照释放/云板邻接碰撞保留。正式入口/HUD使用真实层号。`browser_b4.mjs` 的旧过时断言不要当作25回归门槛。
- 编辑器旧“对象 / 参数 / 路径”表单与专属接线已删除；**不要再加回手填坐标/参数/路径文本表单**，也不要因此删 objects/paths/参数数据或共享模型。导入导出/撤销/画布齿轮保持；齿轮往返/闭合是齿轮专属画布控件（选「路径齿轮」时显示），未来参数元素采用同类元素专属画布流程，本轮不加怪物或通用参数系统。
- 已修：主题按钮只留一处接线（HTML 不再 onclick）、一次点击只切一次，偏好合并保存并在启动读回，主题不改 hash/dirty/通过记录；齿轮创建=一个事务（放置前保存数据/dirty/undo/redo，Esc 取消只回滚本次并吃掉按压）；本地通过记录与 JSON 声明统一判定（可读 + normal + passed/profile 支持 + 声明 hash = 当前内容，规则版本只记录）；试玩返回带草稿身份，只有明确返回才载入原草稿最新 revision；旧 standard/devplay 页只剩说明+回编辑器，不再执行旧控制器。
- 30明确试玩无计分，金币与弓箭手等基础行为仍与正式相同。试玩=普通游玩当前一张图：profile `run-v1`（满血、K 开局可用、14/20 秒），只有当前图、start 出生、完整上穿 finish 一次结束、失败重试本图；共用基础移动/碰撞/实体/伤害/技能/HUD/输入。无支撑/管道/F/Boss/换层；正常短塔保持。不要再引入"初始 CD20"或 standard-v1 固定要求。
- 用户取消代码关卡合规/可达自检门槛，人工实际试玩通过为准。共享校验 `purpose:'load'`（`RA.LevelData.readableIssues`：结构/网格/起终点数值/对象参数与路径引用）用于试玩/发布/正式候选（`listEligible`）/正式加载（`GameSession.create`）；不要换名“安全预检”恢复几何/净空/可达门槛，也不要只放开前端而让仓库继续阻断。规则/指纹只记录条件，不批量作废作者人工通过；无声明/改图不能假通过。
- 保留血条+HP、K就绪/活动/冷却与可见光环/真正清火球，RA.drawFloorObject保持共用。标记/画布齿轮/裁剪/碰撞不重做。25完整塔已通过，25–28已验主体保留，当前31仅流星锤显示/路径删除/单版本下架，无新APK/美术音效，不扩写用户未提供的真人全塔/性能或发布专项，不用计数代替人工。
- 每次给用户交付任务卡，回复必须附可直接复制给编码agent的提示词，包含任务路径、目标、必要约束和最短人工操作；不只丢文件链接。
- B1/B2/B3-R2 已通过，Android 仍 0.3.2；B4早期dfbe10d故障为历史，当前23/24编辑器试玩和25/26完整塔本轮已通过；28返回已工程复验修复，制作发布专项按29新入口核对。原三图及固定场景只读源件在 levels/archive/authored/source-2026-11-07 和 source-fixed-2026-11-07，新增 rest_level.json 已保真备份。level0 裸 x 只做精确一次性转换，不放宽共用 JSON；固定运行身份独立，地形/尺寸/空白不裁，保留所有现有修改、浏览器存储和认证历史，不自动 passed。固定 Boss/大厅/休整不开放自由编辑，已有编辑器安全约定留待后续批次，不据此扩本卡范围。

- 用户指定一张卡时，只完成该卡及必要依赖。未指定时，从 STATUS 的下一步开始，不自行实现全部未来系统。
- 开始前核对当前文件与 Git 状态，保留用户及其他 agent 的修改。已有 T00 基线 `f56cdce`，不要再次初始化或重建基线；当前验收结论与下一步以 STATUS 为准，不直接丢弃未提交内容。
- 不覆盖原始地图以完成迁移；写规范副本、确认保真后切入口。25用户授权的一次性旧published/普通catalog重置是明确例外，其余浏览器草稿/记录/偏好不得清空。
- 不引入框架、ECS、服务端、联网认证、付费服务或重新实现物理，除非任务明确要求或先说明必要性。
- 可在明确提案范围内调整实现细节并更新设计；改变已确认玩法、扩大范围或降低验收要求，需向用户说明具体取舍。

## 必须保留的目标规则

- 历史顺序是短塔后安卓；本轮用户明确下一步PC完整40层，优先按25推进，不为旧顺序阻塞或擅自制作新APK。
- 地图宽高可变，仅统一接口。接口梯板防回落；不能重建玩家假装连续换层。
- B4普通接口用start/finish的col+row标记两格云板。17号卡明确大厅无物理端口、F一次传送到第1层；终局Boss只有底部入场start、无finish。其余连接内径2×3，World派生管壁逐格复用现有tileId=4石块，不写回模板。共享世界碰撞查询真实地形/连接/上层起点，不用原数组边界作隐形墙。旧vertical-v1保真存草稿，新play/publish明确拒绝，混合规则返回错误、不抛异常。作者空白不裁，几何合规不等于人工通关。
- 下一层提前加载并运行非攻击行为，正式入层后启用攻击与超时；上一层只保留地形快照，直到再上一层才释放，不能按是否出镜立即释放。
- 光环持续 14 秒，施放起冷却 20 秒，开局可用，跨层保留，暂停冻结；命中 Boss 消失且不重置冷却。
- 试玩按普通游玩初态，开局技能可用（用户最新决定覆盖旧CD20特例），施放后14/20秒。门接触消失、本局不恢复；浮石按参数预警后消失、恢复不夹人；对象与玩家比较前统一坐标。血条和技能范围与真实状态一致。
- Boss 能量耗尽后停止攻击并清除其伤害物，可受伤保持至命中；一次施法不能连续消耗两个生命阶段。
- 完整塔20/40共用Boss模板但独立实例，两阶段沿用；20后F进入21，40后胜利，不新增finish云板或重做Boss图。
- 草稿不自动发布；人工通关记录绑定实际内容，改图后重新试玩。技术规则版本记录条件，不作关卡合规裁决或自动批量推翻作者通过；不自动寻路代替真人，不伪造passed。
- 取消镜像、采用 JSON、死亡回大厅；不可为保留旧测试而恢复已废弃规则。
- 2026-11-06 用户确认：异常越界判死亡并回大厅、重新挑战同一塔。B2 替换本层无伤 respawn，不能因此重抽塔或生成胜利/认证。

## 数据与模块

- 31下架已实现Repository.listPublishedVersions()/unpublish({levelId,contentHash})，adapter精确published key，Result含removed，事务oncomplete才成功。只删指定browser版本不删草稿/通过/其它hash，不改本局manifest；builtin同版本仍候选须如实说明，文件源移出normal后sync刷新新局。无新epoch/reset/黑名单/DB版本。path清理只针对本次删除对象的引用且无剩余引用；编辑器像素→屏幕转换一次，不改运行轨道/物理。详见31设计。

- 30新增coin/archer均params={}、pathId=null，coin独立collectible，archer hostile；射击计时/箭/拾取状态只在FloorInstance，模板不回写。正式GameSession独占RunScore，入层槽号去重、单位/金币按instanceId+id；Boss最终击败先加5再win，阶段不加。Trial复用对象但不创建/显示/持久分数。HighScoreStore独立key只保留max整数，核心不依赖DOM/storage，失败不能假保存/降旧高分/清库。箭owner绑定/接口与地图裁剪/只active/离层清、preview不攻/暂停冻结；不能以改World碰撞解决箭边界。详见30设计。

- 29目录目标normal/difficulty-1..4、fixed、fallback、archive；活动源件按角色迁移/字节SHA不变，原始开发示例关卡只读原位。新sync_levels只扫四档normal、共享schema2/load/人工通过判定，无cert明确跳过不入池，坏hash/档位错失败不写半产物；生成catalog统一file/HTTP读取。合格内置＋浏览器published按id/hash去重/稳定排序，四档9槽/test3保持，不重跑poolEpoch清空。
- 种子只保存规范字符串（本地专用key/列表），不得实现SavedTower快照；开始用所选seed和当前候选，死亡重试仍原manifest。旧mirror/高度/旧池逻辑从生产删除，但历史字段保真、源数据不清，角色朝向翻图/地图可变尺寸不受影响。index实际壳，legacy/short单向跳转，www构建改index。当前b4-9/schema2无需因菜单升级玩法版本。

- 28新增soul（pathId=null，params.initialDirection为显式0上1右2下3左整数，无静默默认；轨迹不写paths）和sewage_pool（单格/固定20、params={}、pathId=null）。轮廓来源为真实terrain/门浮石弹簧/实存管壁，所有怪物和轨道/链/池排除；按方块几何revision更新，Editor/正式/Trial共享算法。放怪物保留真实块和异类，同类笔刷幂等；只做怪物范围最小分流。运行hand/边/模式/rxry不回写模板。规则已升b4-9，schema2不变。

- 27新增fireball_moving(pathId必需)与flail(col/row=端点、pathId=null)，schema2不变；圆周4格由固定规则派生，params.radiusTiles是本体/锤头尺寸，不是轨道半径。旧gear.speedTilesPerSecond可读保真但运行不覆盖V，新默认说明需与实际一致。运动/伤害/绘制和光环可消灭类型判断正式与独立试玩共用；状态只进实例不回写模板。规则已升b4-8，不批量废旧人工通过。

- 原27参数UI提案后置，不是本卡实施要求；若以后启用只改所选对象params：先候选验证再原子提交，不清terrain/改id位置pathId或丢未知字段。卡片暂存/预览不写模板，应用一次撤销、取消无残留、no-op不改hash/dirty。旧updateObject有清地形与先改后验副作用，不能直接用于安全参数事务；范围单位默认来自共享注册表。真正改内容需重玩，历史认证保留，不自动passed。

- 以 docs/design/data-and-interfaces.md 为接口契约；文档描述的是目标，新文件名不代表现有实现。
- 模板、塔清单、本局状态、楼层实例分离；运行状态不写回模板。
- 地形只保留一份可编辑真值；asc 仅为旧格式迁移/内部适配，不能与新网格双写。
- 编辑器、游戏、导入、检查调用同一编解码与校验模块；试玩使用独立TrialSession、塔使用GameSession，复用基础移动/碰撞/实体规则，不复用塔装配/换层生命周期，不复制物理。
- 未知对象、参数或版本不静默丢弃。保留草稿原始信息并报告问题；不支持的内容不得进入正式运行/发布。
- 数值集中到 config.js/现有rules；参数描述共享给编辑器与运行时。塔世界坐标由World管理；单图试玩坐标由本图适配器管理，不用World派生管道或魔法偏移。
- 存储使用显式成功/失败结果；失败、取消、容量不足不能报成功、清 dirty 或修改发布池。下载发起与确认写入磁盘不能混称。
- 新脚本同步到需要它的 HTML、浏览器自检与 tools/loader.mjs；保持依赖顺序。由工具生成的 levels/levels.js 不手改。
- 核心模块不依赖编辑器 DOM、浏览器选文件 API 或 Capacitor；通过适配器接入平台能力。

## 检查与交付

- 31本轮实施：test31 34/0、隔离Chrome37/0（真实确认取消、IDB删除请求成功后abort、精确版本、新局/内置重复/原manifest重试），editor266/0、gestures13/0、test30 95/0、full4098/0。三处锤绘制误差0，路径探针无新孤立；见 docs/checks/B4R15-2026-11-09-editor-unpublish.md。非作者真人验收；未动作者库/源图/catalog，未跑全量test_all/磁盘删除sync，无APK。

- 最新30独立验收：test30 95/0、gestures13/0、full4098/0；新探针明确两bug与离屏漏画，见review-B4R14-2026-11-09.md。不是可见浏览器证据；原交付browser30 33/0、test_all1829/4未本轮复跑。31用隔离fixture/新证据路径，不覆旧报告或写作者passed/改作者normal池；下架实际取消/失败/新候选读取必测，未测如实记。

- 本次独立B4-R12复验：魂池45/0退出0，return探针同原稿ID/revision/hash、topReturnBugReproduced=false、cert=null；用户只明确编辑/试玩/导出。entry-sources隔离证明旧池能在正式0候选时显示floor01，目录53份JSON/8顶层目录只读盘点。29不可用清库隐藏旧菜单；需真实新入口/目录同步/导入证据，未测发布/失败/并发如实记。不重跑全量地图自检，旧界面镜像/塔高专用测试应退休，不为绿灯恢复废弃逻辑。

- 最新独立B4-R13验收：用户整体人工通过，test_29_menu_levels34/0、test_full40 98/0、test_28_soul_sewage45/0退出0；53份SHA、37依赖及www脚本一致（HTML预期构建转换）。本轮未复跑浏览器/test_all，原交付22/0、1733/4等仅交付证据；旧源未物理全删记录为非阻塞清理。未测专项不补造，详见review-B4R13-2026-11-09.md。

- 按用户最新要求，本轮无需全量关卡自检/自动寻路/大矩阵测例；按需做语法/依赖/最小运行诊断定位代码bug，不能把它当关卡可玩性证明。人工失败即未通过，不能用PASS数量覆盖。
- 本次B4-R14（30号卡）实际执行：`test_30_coins_archer_score` **95/0**、`test_all` **1829 PASS / 4 FAIL**（历史floor09/floor11）、`test_leveldata` 141/0（注册表12类）、`test_editor` 266/0、`test_29` 34/0、`test_full40` 98/0、`test_28` 45/0、`test_27` 53/0、`test_26` 39/0、`test_b2` 96/0；`browser_30_coins_archer` **33/0**（真实Chrome：编辑器调色板放币/弓、试玩捡币/被箭扣血/K杀本体且无分、返回原稿、正式HUD 20/30/35、结果本次得分、最高分刷新保持、重试同塔0）、`browser_29_menu` 22/0、`browser_28_return_soul` 20/0、`browser_trial23` 40/0。`browser_editor24` 42/2、`browser_full40` 36/2 的4条为25/29号卡已换掉的旧页面文案断言（过期，不作门槛）。`www` 已重建（38脚本、含high-score-store）。作者显式发布→正式塔读取未执行（正式截图是页面内存fixture）；无APK。另：本轮一次 PowerShell 5.1 默认编码误写坏了 `js/editor.js`/`editor.html`/`trial.html`，按损坏字节反解 + HEAD + 已读原文重建，全部接线回归通过；页面中文文案可能与29略异，详见交付记录第6节。
- 本次B4-R13（29号卡）实际执行：`test_29_menu_levels` 34/0、`test_all` **1733 PASS / 4 FAIL**（历史floor09/floor11）、`browser_29_menu` 22/0（真实Chrome菜单/设置/种子/F→1/暂停/退出/legacy/short/editor返回）、`browser_28_return_soul` 20/0、`test_28`45/0、`test_27`53/0、`test_26`39/0、`test_full40`98/0、`test_b3`61/0。`29-audit` N04/N05 false/0、www一致。作者可见文件选择器导入/真实关闭/并发/持久失败未执行；空池用test3补位；无APK。
- B4-R11历史：`test_27_monsters` 53/0、`test_all` 1731/4、`test_26` 39/0、`test_full40` 96/0、`browser_27_monsters` 16/0、`browser_full40` 38/0、`browser_26_seams` 17/0、b2/b3r2/trial23/editor24 20/0、47/0、40/0、44/0、`test_b3` 61/0。用户仅确认怪物试玩，返回由28修复。
- B4-R10历史：接口39/0、完整塔96/0、侧墙21/0、单图12/0、试玩页13/0均退出0；seams/missing-map新证据false，www关键8份一致。用户确认人工走完41层，25/26关闭。原26交付另有browser17/0（逐接缝fixture）、完整1677/4（历史floor09/11）、Node连续1→6，保留为交付记录。
- 25号卡（B4-R9）实际执行：`test_full40` 96/0、`browser_full40` 38/0（真实 Chrome + 真实键盘 + 8 图，生命周期用 `RA.short.debugJumpTo`）、`browser_b2` 20/0、`browser_b3r2` 47/0、`browser_trial23` 40/0、`browser_editor24` 44/0、完整 `test_all` **1638 PASS / 4 FAIL**（4 条仍是历史 floor09/floor11）。这些是工程/脚本化屏幕证据，**不是真人从 0 走通 40 层**；`browser_b4.mjs` 的历史过时断言不在门槛内。
- 24号卡（B4-R8）历史：`test_editor` 266/0、`test_editor_gestures` 13/0、`test_b3` 61/0、`browser_editor24` 44/0、`browser_trial23` 40/0、`browser_b2` 20/0、完整 `test_all` 1551/4（4 条历史 floor09/floor11）。用户已人工确认编辑器通过，不重做。
- 23号卡（B4-R7）历史：`test_trial_page` 13/0、`test_single_level_trial` 12/0、`browser_trial23` 40/0、完整 `test_all` 1512/4；22号验收脚本 exit 0 只表示诊断完成，不表示试玩通过。用户已人工确认试玩正常，23 号卡关闭，不重做其主体。
- B2 验收聚焦完整短塔与制作发布主链路，同时保留 B1 数据安全/跨层/暂停回归。丢工作、常用路径崩溃、错误发布和核心规则错误必须修；低影响问题集中记录，不逐个升格为下一步门槛，不为测试数或历史行为延长重构。浏览器工具无法启动时给人工步骤并继续独立工作，不伪造通过或人工通关认证。
- 不写仅验证函数存在或重复实现的测试。优先验证保存失败不改池、跨层只触发一次、暂停不计时、Boss 单次命中、未知对象阻止发布等实际风险。
- 手感、画面、连续接缝与触控需要人工检查；替身测试不能证明真实画面或真机性能。没测就写没测，不能伪造通关认证。
- 完成后报告：实际修改、运行命令与结果、人工验证、仍有问题、下一步。同步 STATUS；改变已实现的启动/操作则更新 README；改变契约则更新设计和受影响卡。
- 不写未经测量的帧率、绝对兼容性或“所有关卡可通”。不要把计划版本写成已发布版本。

## 文档分工

README 写现在能运行的程序；PROJECT 写目标与约定；STATUS 写实际状态；设计文件写数据/行为契约；任务卡写本次实现与验收。docs/archive/ 与原分析报告只提供历史背景，不是继续扩展旧镜像、TXT 或换层方案的依据。
