# 31 — 流星锤显示、路径删除与单关下架（PC小修）

2026-11-09，**已实施，工程检查通过，待作者最短人工确认**。本轮结果见[31交付](../checks/B4R15-2026-11-09-editor-unpublish.md)：定向34/0、隔离Chrome37/0、编辑器266/0、手势13/0、30号卡95/0、完整塔98/0；均退出0，三处流星锤探针偏差0。没有作者真人验收或新APK。先读根README/PROJECT/STATUS/AGENTS、[31设计](../design/editor-visual-path-and-unpublish.md)、[30验收](../checks/review-B4R14-2026-11-09.md)。HEAD d41e07d以上R7–R14未提交全部保留；基于当前工作区，不从HEAD重建editor/HTML、不清作者库、不提交推送。

## 本次只做三项

1. **编辑器流星锤绘制**：RA.flailHead返回本图局部绝对像素，drawBoard重复叠加端点格偏移；修成一次局部→屏幕转换。链长固定4格、初始正下方，与悬停一致。非零坐标、缩放/平移、锚点离屏但头/链仍可见正常。保留素材/数据/正式与试玩的轨道、速度和伤害，不以改地图坐标或运行半径抵消。
2. **gear与fireball_moving删除后路线残留**：删除模型当前只改objects。按设计集中处理本次删掉对象的pathId，最后引用消失才删该path；共享路径保留，其它路线/未知信息不动。橡皮/区域/ID删除、真正替换删除及必要尺寸分支一致，一次撤销恢复对象＋路径；no-op不改hash/dirty。旧导入无主路线保真、不全局GC；可不画未引用旧路线，但不能只藏图不删新残留数据。
3. **设置最小单版本下架**：用户已答复加入。列表选择当前浏览器published的精确id/hash，按钮明确“移出浏览器发布池”；保留草稿/通过历史/磁盘JSON/seed/最高分。取消无变化，失败不报成功；IndexedDB等事务完成才成功。相同id不同hash只删指定一个，重复删除幂等；builtin同版本仍存在则明确告知需删源JSON并sync，不能假报全部下架。不给磁盘图加黑名单、不删文件、不新增整库清空。

## 必要接口与边界

- 建议ContentRepository.listPublishedVersions()和unpublish({levelId,contentHash})，Memory/IndexedDB同语义；返回Result及removed布尔，不直接用deleteDraft。新服务只操作published精确键，不再次清poolEpoch，不更新认证。见设计的事务完成/来源识别约定。
- index设置现有导入/池区内加入选择＋按钮＋结果说明；无首页新主按钮。读取/删除异步绑定点击时身份，等待禁重复，成功刷新池数量/列表；失败不清选择、别切内存库假成功。
- UI区分磁盘内置与浏览器版本。磁盘普通图删/移出normal/difficulty-N后运行node tools/sync_levels.mjs，成功后刷新、新开塔；同图browser版本需另下架。下载/备份不等于活动源。fixed/fallback/archive不动，已经开始/重试原manifest不变，不换seed。
- 30金币/弓箭手/正式计分保留：层20/敌5/币10/层总800，只有正式full40-formal计分，试玩没有分数；箭穿墙不跨层/halo仅杀本体。25–29连续世界/碰撞/预热快照/同Player/HP技能14–20/四档/test3/seed文本/返回原稿不重做。
- 当前b4-10/schema2/DBv3保持；只PC无APK/其它怪物/Boss/音效美术/通用参数表/管理后台。源码是无BOM UTF-8，用安全UTF-8工具读写；上轮编码事故已重建的文件不能再次从HEAD覆盖。

## 最小验收

- [现有探针](../checks/review-B4R14-2026-11-09-editor.mjs)用**新输出路径**复验，勿覆confirmed证据；Node画布命令不等于可见屏幕。真实画布放锤→缩放/平移/边缘查看；齿轮及移动火球完成折线/环→橡皮删除→路线消失→撤销同还→重做同删→保存再开。
- 定向模型测共享path最后引用、单点/往返/闭合、区域删除/同格异类、导出无新孤立path，已有未知/孤立数据保真，不写只验函数存在的测试。
- 下架至少：两个hash只删一个，取消，重复删，事务失败不假成功/不动其它记录；真实新候选/Planner排除browser版本，builtin重复仍在且提示正确，既有manifest重试不改。真实IDB/可见选择用隔离profile，不碰作者真实库；临时磁盘测试在副本中做，不能改作者normal/catalog再假恢复。
- 按需跑test_30_coins_archer_score（基线95/0）、test_editor_gestures（13/0）、test_full40（98/0）；不要跑自动关卡可达门槛或为过期btn-dev文案恢复旧入口。不要求作者重复41层。
- 交付实际修改/命令/可见证据/未测，更新根四文档与设计/任务状态、关卡移除说明，必要www同步；不伪造passed/发布记录、不构建APK。

## 作者最短人工步骤

编辑器在远离左上角处放流星锤，缩放/平移看链长与锤头；画齿轮/移动火球路径，擦除本体看路线消失，撤销/重做并保存重开。index设置选一张不想要的浏览器版本，点移出后看列表/池数量；草稿还能打开。若还有内置来源，按提示移出对应normal JSON并sync、刷新再开始新局。只重试旧塔仍保留原图是正确行为。

## 可复制提示词

```text
在 C:\Users\beilu\Documents\blwork\reverse_abyss 只实施docs/tasks/31-editor-visual-path-and-unpublish.md，先读根四文档/AGENTS、docs/design/editor-visual-path-and-unpublish.md与docs/checks/review-B4R14-2026-11-09.md。30主体工程通过，用户报告两处编辑器bug，并明确确认加最小下架入口。保留HEAD d41e07d上全部R7–R14未提交、作者源图/库/认证/证据；UTF-8安全读写，不从HEAD重建文件、不清库/提交推送。
1修编辑器流星锤：flailHead已含地图坐标，drawBoard不能再加端点格偏移；一次转换到屏幕，4格链/头与悬停一致，非零位置/缩放平移/端点离屏而锤头可见均正常。不改正式物理/轨道/素材。
2修齿轮与移动火球删除残路：删除对象同时清本次关联且已无其它对象引用的path，所有实际删除入口一致，一次撤销/重做对象与路线；共享path/异类/未知或历史孤立数据保真，不能全局GC或只藏路径。
3在index设置加入真实浏览器发布版本选择及“移出浏览器发布池”。新增Repository/两Adapter最小精确id+hash下架Result接口，等事务完成再成功；取消/失败无假成功、重复删幂等、异步身份不串。保留草稿/通过历史/磁盘JSON/seed/最高分/当前manifest。builtin同版本还在时说明需删normal源JSON+sync才能完全退出未来候选，不能加黑名单或假报全删；不再次清poolEpoch。
保留25–30已验玩法/四档/test3/seed文本/返回原稿及正式20-5-10/试玩无分。b4-10/schema2/DBv3不变，只PC无APK/其它系统。用隔离fixture和必要可见操作验证，不写作者passed或改作者普通池；复验探针写新文件，不覆旧证据。
最短人工：放锤缩放平移→画齿轮/火球路径后擦/撤销/重做/保存重开→设置移出选定发布版本→确认草稿还在；有内置源则移出JSON并sync刷新后新开塔，旧塔重试不变。交付文件清单、实际结果/限制，更新根文档和关卡删除说明及必要www，不要求重走41层。
```
