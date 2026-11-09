# 30号卡交付记录:金币、弓箭手与正式塔计分(B4-R14)

2026-11-09,**已实施,等作者人工验收**。HEAD 仍是 `d41e07d`;本轮只实施 [30号卡](../tasks/30-coins-archer-and-score.md),未重做 25–29,未提交/推送、未 `cap sync`、未构建 APK。

## 1. 实际修改

| 文件 | 内容 |
|---|---|
| `js/config.js` | 新增 `OBJECT_PARAMS.coin` / `archer`(空参数);集中 `COLLECT`(金币半径 0.25 格)、`ARCHER`(2 秒/170px/s/本体与箭 20/箭长与命中半宽)、`SCORE`(入层 20/击败 5/金币 10、正式身份 `full40-formal`) |
| `js/rules.js` | 规则 `b4-9` → `b4-10`;指纹加入金币/弓箭手/计分条件;schema2 与 DBv3 不变 |
| `js/entity-registry.js` | 注册 `coin`(category `collectible`)与 `archer`(category `hostile`);类别只作最小分流,不增加通用怪物/经济框架 |
| `js/monsters.js` | `haloDestroyable` 加入 `archer`;新增 `isHostile` / `isCollectible`(金币不是敌对单位) |
| `js/level-data.js` | `coin`/`archer` 的 `pathId` 必须为 null(与灵魂/污水同一读取规则) |
| `js/world.js` | `FloorInstance.arrows/arrowSeq/arrowDomain`;金币身体拾取(每实例一次)、弓箭手每 2 秒朝发射瞬间玩家位置射箭、170px/s 直线、先裁到所属层域再判连续命中、命中即消费;箭绘制 `RA.drawFloorArrows`;离层(物理/F)/`clearArrows` 清理;金币/弓箭手绘制;都不提供实体碰撞、不参与灵魂轮廓 |
| `js/session.js` | 正式 `GameSession` 独占 `score`(初始 0,非正式为 null)与三组去重集合;`_onFloorEntered` 入 1..40 +20、光环成功击杀 +5、`onCoinCollected` +10、Boss 最终击败 +5(先入账再 win);`scoreChanged` 事件;`snapshot().score`;死亡/胜利/释放清箭 |
| `js/trial-session.js` | 复用同一套金币/弓箭手/箭实现,不创建分数、不发计分事件;通过/失败/释放清箭 |
| `js/high-score-store.js`(新增) | 独立 key `ra_high_score_v1` 只存 `{version:1,bestScore}`;读/写返回明确成功/失败,取 max、低分不覆盖、损坏/写失败不假成功、不动其它键 |
| `js/short.js` | 右上 `得分 N`(只读 snapshot.score)、死亡/胜利结果 `本次得分 N`、设置只读历史最高分;破纪录才写一次、失败如实提示并可重试;新局/重试 0 分;旧会话 dispose |
| `index.html` | 右上得分元素、结果页分数行、设置历史最高分;CSS 不与左侧血条/技能/Boss 条、右下按钮重叠 |
| `js/editor.js` | 金币/弓箭手两个直接放置工具(调色板点击、无坐标/参数/路径表单)、同格同 type 幂等、一次拖动一步撤销、不擦真实地形/机关/异类、调色板与画布图标 |
| `js/trial.js` | 试玩页同样绘制箭(`RA.drawFloorArrows`),没有分数 HUD/结果分数 |
| `editor.html` / `trial.html` | 加入 `js/high-score-store.js`;见第 6 节重建说明 |
| `tools/loader.mjs` | `ENGINE` 加入 `js/high-score-store.js`(顺序与 index/editor 一致) |
| `tools/test_leveldata.mjs` | 注册表类型数 10 → 12,补 coin/archer 类别断言(原断言已过期) |
| `tools/test_all.mjs` | 接入 `test_30_coins_archer_score` |
| `tools/test_30_coins_archer_score.mjs`(新增) | 定向自检(95 项) |
| `tools/browser_30_coins_archer.mjs`(新增) | 真实 Chrome 可见检查(33 项) |
| `www/` | 由 `node tools/build_android_www.mjs` 从 index 重建(38 脚本,含 high-score-store) |

`levels/`、作者原图/草稿、发布池、通过记录、种子偏好、assets 均未改;`android/`、APK、schema/DB 未动。

## 2. 行为要点(与设计一致)

- 金币:无实体阻挡、无 HP/伤害;**只有玩家身体接触**拾取一次后消失;光环不代捡;不被算作击杀。
- 弓箭手:静止、无实体阻挡、可被光环一击消灭;**首次射击在 active 满 2 秒**,之后每 2 秒;方向取发射瞬间玩家位置,170px/s 直线不追踪;箭穿所有地形/机关、不跨层(以本层 finish 顶面为上界、start 云板底面为下界,再与实际地图取交集);箭命中即消失(玩家无敌时也消费);本体死后已发箭继续;暂停冻结;离层/传送/死亡/胜利/重试清箭;snapshot 不含箭;preview 不累计射击、不射、不伤害。
- 计分:仅 `mode:'full40-formal'`。初始 0;首次进入 1…40 各 +20(含 10/30 休整、20/40 Boss、0→1 与 20→21 F,0 层不加,共 800);敌对单位真正被击败 +5(静止/移动火球、灵魂、弓箭手、Boss 最终一次;阶段切换不加);金币 +10。按本局槽号/`instanceId＋objectId` 去重,同模板重复槽独立,持续光环/重复事件不重复加。死亡/胜利冻结,重试同 manifest 但新局 0。
- 试玩:同样的捡币/射击/受伤/K 只杀本体,**没有分数状态、HUD、结果分数和最高分写入**。
- 最高分:只存一个历史最大值;无逐局记录/日期/种子排行;损坏或写失败如实提示"未保存"、保留原合法最高分与本局分。

## 3. 实际命令与结果

| 命令 | 结果 |
|---|---|
| `node tools/test_30_coins_archer_score.mjs` | **95 PASS / 0 FAIL**,退出 0 |
| `node tools/test_all.mjs` | **1829 PASS / 4 FAIL**,退出 1;4 条仍是历史 `floor09`/`floor11` 逐跳可达诊断(不是本卡引入) |
| `node tools/test_leveldata.mjs` | 141 PASS / 0 FAIL(注册表类型数更新为 12) |
| `node tools/test_editor.mjs` | 266 PASS / 0 FAIL |
| `node tools/test_editor_gestures.mjs` | 13 PASS / 0 FAIL |
| `node tools/test_29_menu_levels.mjs` | 34 PASS / 0 FAIL |
| `node tools/test_full40.mjs` | 98 PASS / 0 FAIL |
| `node tools/test_28_soul_sewage.mjs` | 45 PASS / 0 FAIL |
| `node tools/test_27_monsters.mjs` | 53 PASS / 0 FAIL |
| `node tools/test_26_continuous.mjs` | 39 PASS / 0 FAIL |
| `node tools/test_b2.mjs` | 96 PASS / 0 FAIL |
| `node tools/browser_30_coins_archer.mjs` | **33 PASS / 0 FAIL**(真实 Chrome 156 headless) |
| `node tools/browser_29_menu.mjs` | 22 PASS / 0 FAIL |
| `node tools/browser_28_return_soul.mjs` | 20 PASS / 0 FAIL |
| `node tools/browser_trial23.mjs` | 40 PASS / 0 FAIL |
| `node tools/browser_editor24.mjs` | 42 PASS / 2 FAIL:两条断言是 24 号卡时"standard/devplay 静态说明页"的旧文案;29 号卡已把这两页改成单向跳 index,属**过期断言**,不是本轮回归 |
| `node tools/browser_full40.mjs` | 36 PASS / 2 FAIL:两条断言期待 25 号卡时代的标题/按钮文案与"归档"池文案;29 号卡的新首页文案已不同,属**过期断言** |
| `node tools/build_android_www.mjs` | 生成 www:38 个脚本 + levels.js + assets;与 index 脚本清单一致、共享脚本逐字节一致;未构建 APK |

`test_30` 覆盖:两 type 注册/类别、编辑器放置保真/幂等/JSON/裁剪/撤销、金币只捡一次与同模板不同实例、金币/弓箭手无阻挡且不参与灵魂轮廓、弓箭手 119 步不射/120–122 步首箭/每 2 秒、170px/s 直线不追踪、隔墙命中、按层域裁剪不伤域外、本体 20 与无敌时间、光环只杀本体不清箭、暂停冻结、F/死亡清箭、非零 origin 下的拾取与命中共 95 项、正式 20/10/5 与去重、Boss 阶段不加/最终 +5、41 槽 800、重试 0、非正式与试玩无分、最高分只存 max/低分不覆盖/损坏与写失败不假成功、页面静态契约。

## 4. 可见浏览器证据(真实 Chrome + 真实鼠标/键盘)

`node tools/browser_30_coins_archer.mjs`(临时 user-data-dir,不写作者存储/池):

- 编辑器:调色板选「金币」鼠标点两格、选「弓箭手」点一格,`params={}`、`pathId=null`,页面没有坐标/参数表单 → [30-editor-coins-archer.png](30-editor-coins-archer.png)
- 试玩:金币被身体接触消失;站在弓箭手旁约 2 秒被箭扣血(80/100);按 K 只消灭本体;页面上**没有任何得分/最高分元素** → [30-trial-coins-archer.png](30-trial-coins-archer.png)、[30-trial-archer-killed.png](30-trial-archer-killed.png)
- 未通关顶部返回:编辑器打开同一草稿的最新 revision 与同内容 hash,金币 2/弓箭手 1 都在且 `certification` 仍为空(没有假通过)
- 正式塔(页面内存 fixture 给 test3 补位):F 进 1 层右上「得分 20」→ 捡币 30 → K 击杀 35 → [30-formal-floor1-score20.png](30-formal-floor1-score20.png)、[30-formal-score35.png](30-formal-score35.png);死亡结果页「本次得分 35」→ [30-formal-result-score.png](30-formal-result-score.png);设置只读历史最高分 35 → [30-settings-high-score.png](30-settings-high-score.png);刷新后最高分仍为 35;重试同塔再进 1 层显示 20(新局从 0 开始,不继承上一局)
- 逐项结果 JSON:[browser-30-coins-archer-2026-11-09.json](browser-30-coins-archer-2026-11-09.json)

这些是脚本化真实浏览器证据,**不等于真人从 0 走完 40 层**,也不是作者的发布/通过记录。

## 5. 未测项 / 限制

- 作者真实流程(**显式发布 → 正式塔从发布池读取含金币/弓箭手的新图**)未由本轮执行;正式截图是页面内存 fixture(仅 test3 补位替换),不冒充发布池内容。
- 未做真人手感/平衡(箭速、2 秒间隔、金币价值)评价;数值是设计默认值,可按实测调整。
- 未测:同屏大量箭/大量金币的性能;多标签并发写最高分;真实浏览器存储写失败(只在 Node 隔离存储里构造);刷新期间未保存的编辑器改动(与既有草稿行为一致)。
- 最高分在 `file://` 与 HTTP 下都是本浏览器本机存储;换浏览器/清站点数据会丢;不是服务器排行。
- 旧 `floor09/floor11` 逐跳可达诊断仍失败(历史,与本卡无关);`browser_editor24`/`browser_full40` 各 2 条过期断言见第 3 节。

## 6. 恢复说明(必须记录)

实施过程中一次**编码操作失误**把 `js/editor.js`、`editor.html`、`trial.html` 写坏:用 Windows PowerShell 5.1 的 `Get-Content`/`Set-Content`(默认 ANSI + ASCII)读写无 BOM 的 UTF-8 文件,导致中文被替换成 `?`。随后按以下方式重建,并未 reset/clean 工作区、未丢作者数据:

- `js/editor.js`:对损坏字节做确定性反解(cp936 解码→再编码),得到"除 272 处双字节损失外完全相同"的字节流;再用 `git show HEAD:js/editor.js` 与 R7–R13 未提交改动的逐块对照,恢复全部未变化代码,并按本次会话中此前已读取到的原文逐行补齐 60 处受损行。校验方式:对重建文件施加同一损坏函数,输出与损坏文件**逐字节一致**;`node --check` 通过;`test_editor` 266/0、`test_editor_gestures` 13/0、`test_28` 45/0、`test_29` 34/0、`test_full40` 98/0、`test_27` 53/0、`test_26` 39/0、`test_all` 恢复为 1734/4(历史 4 条)后再继续本卡。
- `editor.html` / `trial.html`:ASCII 替换把非 ASCII 字符全部丢失,无法反解。按 `git show HEAD:` 版本 + 本轮会话已读取到的页面结构/ID + editor.js/trial.js 实际引用的全部 id 重建;所有被 `test_editor`(id 清单、脚本顺序、旧表单不得存在)、`test_trial_page`(真实脚本顺序重放)、`browser_editor24`、`browser_trial23`、`browser_28`、`browser_29`、`browser_30` 覆盖的接线均通过。**页面里的中文提示文案可能与 29 交付时的原措辞不完全相同**(功能/ID/脚本一致);如作者发现文案差异,以本记录为准。
- 之后所有中文文件改用带 UTF-8 读写的工具(`read`/`write`/`edit`),不再用 `Get-Content -Raw | Set-Content` 处理源码。

## 7. 作者最短人工流程

1. 编辑器打开自己的一个普通草稿,调色板选「金币」「弓箭手」在画布上各点几格,保存草稿。
2. 「▶ 试玩」:走过去捡币(消失)、靠近弓箭手被射/被撞扣血、按 K 只消灭弓箭手;全程没有分数。
3. 不通过也可以点顶部「← 编辑器」:确认打开的是原草稿(内容还在)。
4. 通关(上穿 finish)后回编辑器,在「难度」选 1–4 档,点「发布」入本地正式池。
5. index「开始游戏」按 F 进 1 层:右上应显示「得分 20」;捡一枚金币「得分 30」;用 K 击败一个敌对单位「得分 35」。
6. 主动死亡或用 40 层 Boss 胜利:结果页应显示「本次得分 N」;设置里「历史最高分」为当前最大值,刷新后保持。
7. 「重试本塔」或重新开始:得分从 0 开始;塔的清单不变(不重新抽选)。
