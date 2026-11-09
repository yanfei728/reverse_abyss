# B4-R11 / 27号卡交付记录：移动火球、流星锤、齿轮轨道与怪物无阻挡

2026-11-09。工作区在 HEAD `d41e07d` 之上，保留 B4-R7–R11 全部未提交成果；本轮只实施 [27号卡](../tasks/27-moving-fireball-and-flail.md)，没有实施旧27参数卡。没有重清发布池、改原图/四档/test3/Player、重做25/26完整塔，也没有做 APK。

## 实现结果

**固定运动**
- 齿轮：所有已存在/新对象运行速度固定 `C.MAX_VX = 340px/s`；旧 `params.speedTilesPerSecond` 原样保存、编辑可读，但 `moveObjects` 不再用它覆盖。新齿轮兼容字段默认写 `340/45`。
- 移动火球：`fireball_moving`，复用齿轮路径/90度/往返闭合/单点采样，固定 `V/2 = 170px/s`；单点静止。
- 流星锤：`flail`，编辑器只点一个端点，`pathId=null`；端点为圆心、轨道半径 `4*TS=180px`；锤头线速度 `2V/3=226.666…`，`omega=34/27rad/s`，周期 `27π/17≈4.9896s`；初始正下方、顺时针；`params.radiusTiles` 只是锤头半径（默认0.5格），不是轨道半径。
- 运行头位置/角度、路径相位只在 `FloorInstance` 运行副本，不写模板。

**绘制与碰撞**
- `RA.drawObjectTrack` 只给 live 齿轮画实际路径轨道；移动火球正式/试玩不画路径；流星锤画端点→当前锤头锁链和锤头，不画整圈辅助线。short 与 trial 共用；snapshot 只画地形，不保留活动轨道/链条。
- `FloorInstance.solidAt` 已移除地刺底座实心；所有怪物均无实体阻挡。地刺只在 `active` 阶段用角色身体与实际伸出尖刺矩形判定伤害，预警/回收不伤害，不再依赖底座上的 `feetOnTop`。
- 齿轮/静止火球/移动火球/流星锤只按实际物体位置伤害；流星锤只有锤头伤害，端点/链条无伤害无阻挡。真实地形、门、浮石、弹簧规则保持。

**光环/生命周期**
- `RA.MonsterRules.haloDestroyable(type)` 正式 Session 与独立 TrialSession 共用：静止/移动火球可消灭；齿轮/流星锤/地刺不可消灭。
- preview 只运动、不伤害、不被当前光环清除；入层保留相位；暂停冻结；旧层 snapshot 不画怪物。测试覆盖暂停、preview、入层相位。

**编辑器/数据**
- 齿轮手势泛化为 `pathToolType`：移动火球复用左键首点、连续节点、右键完成、Esc 整个事务回滚；流星锤单击提交一个端点，一次撤销；路径编辑、悬停4格辅助圆、端点/链条预览、裁剪坐标平移、JSON/草稿/发布读取共用原链路。
- 裁剪包络为流星锤计入4格圆周扫掠，但只按原地图边界计算，不擅自扩图；移动火球使用原路径与 sweptBounds。
- `contentHash`/unknown 字段保真；测试池发布读取走同一 `purpose:'load'` 检查。规则 `b4-8`，schema 仍2，不批量废旧人工通过。

**N04/N05**
- N04：`afterPlayerStep` 的 pending 确认方向改为 `feet <= commitY + 0.01`（上方），清理改为 `feet > commitY + 0.5`（回落到接口下方）；另加“站到上层自身”的 `standingOnOwn` 确认，避免任意站位激活。`test_27` 覆盖临界帧 pending→进入提交→回落取消。
- N05：`objectDamage` 仅缺省取注册默认20；显式 `damage:0` 有效且不产生受伤事件。不再使用 `|| 20`。

## 实际执行

| 命令 | 结果 |
|---|---|
| `node tools/test_27_monsters.mjs` | **53 PASS / 0 FAIL** |
| `node tools/test_all.mjs` | **1731 PASS / 4 FAIL**（4 条仍是历史 floor09/floor11） |
| `node tools/test_26_continuous.mjs` | 39 / 0 |
| `node tools/test_full40.mjs` | 96 / 0 |
| `node tools/browser_27_monsters.mjs` | **16 PASS / 0 FAIL**，3 张截图 |
| `node tools/browser_full40.mjs` | 38 / 0 |
| `node tools/browser_26_seams.mjs` | 17 / 0 |
| `node tools/browser_b2.mjs` / `browser_b3r2.mjs` / `browser_trial23.mjs` / `browser_editor24.mjs` | 20/0、47/0、40/0、44/0 |
| `node tools/test_b3.mjs` | 61 / 0 |

`test_27` 是真实运动/伤害检查，不是只比对配置常量：1秒齿轮位移340、移动火球170、单点0；流星锤创建首帧距端点180、1秒1.25926rad、周期4.9896s、非零原点；旧 gear speed=2 仍走340；所有怪物 `solidAt=false`；地刺底座不挡、只有伸出尖刺区域伤害、0伤害不扣血；端点/链不伤害；光环类型；preview/暂停/相位；N04/N05；编辑器编码/读回/裁剪；测试池发布后 `GameSession` 正式读取新类型。

`browser_27`：真实鼠标在编辑器画出移动火球折线、单击流星锤端点、Esc取消；自定义图进入独立试玩，读到齿轮轨道/移动火球无路径/流星锤链；正式塔用内存 fixture 给 test3 补位加新怪物，截图第1层。**正式部分不是显式发布后的池内容**，只是同一正式渲染/合同的内存夹具；作者尚未人工试玩通过或发布。

## 可见证据

- `27-editor-moving-path-flail.png`：编辑器里移动火球折线路径、流星锤端点/4格辅助圆/初始链条。
- `27-trial-gear-track-moving-no-path-flail-chain.png`：试玩中齿轮有金色轨道、移动火球无路径、流星锤有端点→锤头链和锤头、地刺显示。
- `27-formal-monsters-floor1.png`：正式塔第1层同一渲染，HUD 1/40；来源为内存 fixture。
- `browser-27-monsters-2026-11-09.json`：逐项16/0。
- `27-audit.json`：N04 `clearedWhileAbove=false`、N05 `effectiveDamage=0`，并核对 www 关键文件一致。

## 未测/仍需作者

1. **作者真人按最短步骤试玩尚未执行**：画两类路径/单点放锤→试玩核对轨道/链/速度→穿过怪物仍受伤、K与暂停→实际通过→显式发布→新开完整塔核对同 id/hash/参数。没有伪造作者 passed。
2. 正式截图使用内存 fixture，**没有**在全新浏览器池里真实发布一张含新怪物的图并重启读取；Node 测试池已覆盖保存/发布/正式读取数据路径，但这不等于作者人工发布。
3. 没有新 APK/真机验证；`android/` 未改。没有重跑全量地图合规/寻路；4 条历史 floor09/floor11 仍失败。
4. 可见截图只证明渲染层，不证明真人手感、帧率或所有地图可通。

## 作者最短人工步骤

1. `editor.html` 新建普通图：在调色板选「移动火球」画一条折线（左键连续加节点、右键完成）；再选「流星锤」单击一个端点；可试 Esc 取消另一次路径。
2. 保存/导出 JSON 再导入，确认类型/路径/端点/未知字段还在；选难度1，点试玩。
3. 试玩中确认：齿轮有轨道且速度约为移动火球2倍；移动火球只有本体、没有路径；流星锤约5秒一圈、有端点/链条/锤头；角色可穿过怪物但接触仍扣血；链和端点不扣血；K清火球不清齿轮/锤；暂停后都不动。
4. 实际走通这张小图→返回编辑器显式发布→回 index 新建完整塔，确认正式读取同版本；缺任何一项就记录层号/对象/操作，不重清池。
