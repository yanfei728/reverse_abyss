# 29 — 新正式主界面、退役旧原型、四档文件关卡池（PC）

2026-11-09，**B4-R13已实施并验收通过**。用户反馈人工无问题；独立定向34/0、98/0、45/0，详见[29验收](../checks/review-B4R13-2026-11-09.md)。下一步[30](30-coins-archer-and-score.md)，本卡保留历史实施要求。旧执行链已从生产退役，部分旧源仍供历史测试，未物理全删，记非阻塞清理。HEAD d41e07d上R7–R13未提交全部保留。原交付见[B4-R13](../checks/B4R13-2026-11-09-main-menu-level-library.md)。

## 用户确认

- 首页上部英文reverse abyss字标，只有“开始游戏”“退出游戏”，设置在右下角。
- 开始正式塔，0–40固定41槽，不可改高度，无镜像。
- 设置支持重构塔、保存种子、打开编辑器、导入关卡；**仅保存种子文本**，重建使用当前池，不保存塔快照。
- 删除旧主界面和相关旧逻辑；legacy/short可留单向跳index的极小兼容壳，不能再运行旧游戏。
- 普通图按难度文件夹管理；**已通过JSON放对应目录，显式运行同步命令后打包进内置正式池**。

## A. 先盘点与整理目录/同步

1. 运行/核对entry-sources盘点（保护原输出，用新路径保存），记录当前引用与每文件oldPath/newPath/SHA-256。现levels含53份JSON、8个顶层目录；旧原型还能从另一套localStorage读图，不是正式池清空失败。不能为隐藏旧图清库。
2. 按设计建`levels/normal/difficulty-1..4`、`fixed`、`fallback`、`archive`和README；固定运行副本迁fixed，规范test3迁fallback，历史authored/b2/b4/v2/dev/demo/_template等只读归档，现有archive不递归套自己。原`开发示例关卡/`不动。移动前后字节一致，不覆同名，不凭kind=normal把固定源件当普通图；未发现/无法确认作者新导出图则报告，不能伪造已迁移。
3. 安全路径校验后在仓库内迁移，更新活动引用/生成器/夹具/构建/当前文档，交付迁移映射；旧报告保留事实。空难度目录合法，用README/占位文件纳入版本控制。
4. 重写`tools/sync_levels.mjs`只读四档normal、用共享schema2/readable/内容绑定通过判定替代旧asc/verified检查。档位不符/坏hash/未知内容失败不写半产物；无有效通过草稿明确跳过不入池，不自动passed。文件名不必=id，按JSON id/hash稳定识别。产物仍统一levels.js；file/HTTP都从生成catalog读取，改JSON后同步再刷新。
5. 普通候选聚合内置合格图＋浏览器published，精确id/hash去重稳定排序，同版本builtin优先标来源，不自动删其它版本。每档最多9/无放回/缺档test3、固定场景和当局不可变保持。不得扫描archive种回旧图，不再次清poolEpoch。

## B. 新菜单与种子文本

1. index承载唯一正式壳，可保留/最小改造现正式short控制器，不复用旧RA.Game。英文logo可HTML/CSS/SVG，无新图像生成依赖；首页严格两主按钮+右下设置，原debug/导入/导出/旧原型按钮撤出首页。
2. 设置内重构/随机重构、当前/输入种子、保存纯文本及本地选择列表、导入、开editor、只读池数量与固定高度。规范沿RA-36进制标签（范围/0处理见设计），完整解析不能部分成功/静默截断。保存不含manifest/模板，失败不报成功。开始按选定种子＋当前池开0层，不能又Date.now乱抽；同种子跨池可不同，页面说明。
3. 导入用现PlatformFiles/ContentRepository，普通已通过图仍需明确加入池；无通过只存草稿/去editor试玩，取消/错误不改池。保持旧人工通过解释、不恢复几何门槛。
4. 编辑器同标签打开/回index，试玩回editor保留28draftRef；暂停/结果“返回主界面”与游戏0层大厅区分。重试当前塔仍原清单，回首页再开始为新局。触控布局保留但不与新主设置混用；不新增摇杆方案/APK。
5. 退出停止模拟/输入/循环并尝试平台/当前页退出，关闭失败显示手动关闭提示，可回主页；不能假退出或杀浏览器/其它标签。重入不重复监听/rAF。

## C. 实际删除旧执行链

1. 先给删除/保留依赖清单，再移除旧main/Game/Tower/menu/settings及镜像/可调塔高/旧池列表合流/旧短塔产品入口。不是仅隐藏按钮。必要纯数据适配可保留或抽离，不能让正式/editor/试玩后台创建旧Game或读旧custom/overrides。
2. 移除关卡flipX/行反转/plan.flip及镜像默认/热键；**保留角色朝向精灵翻转**、未知历史字段保真。固定的是关数，不锁地图宽高。旧浏览器键只不再消费，不清用户数据。
3. legacy.html/short.html仅重定向index，不与index形成循环。所有产品链接和tests/browser更新；loader与必要HTML不再加载废弃旧菜单逻辑。旧玩法专用测试退休/更新，不恢复镜像或假PASS；真正共享物理/格式/数据安全测试保留。
4. www构建源改新index，依赖按实际HTML解析，移除旧页面/脚本残留，包含新catalog与固定/补位数据；只重建必要www，不做cap sync/APK。规则仍b4-9/schema2；若确实改玩法须说明，不能把菜单改造写成新玩法发布。

## 最小验收

- 可见index/legacy/short都进同一英文首页，只有开始/退出/右下设置；设置无镜像、无可改塔高/旧池列表，M/N旧菜单键无作用。开始真实正式0/F→1，暂停/返回主界面/同塔重试、退出结果正确。
- 同seed同候选同清单；池更新后按同seed可变；保存只文本、刷新可选择、存储失败如实提示；本局死亡重试不变。不能用manifest快照实现与用户选择相反的“保存种子”。
- 四档隔离文件样例同步后真实被正式Planner读取；JSON难度错/坏hash/无通过不误入；文件与浏览器同版本只取一次；archive/fixed/fallback不混普通候选，空池仍可玩。
- 新设置导入已通过/未通过/取消/错误、explicit入池与editor回游戏；**28未通关点顶部回原稿同ID/hash**仍通过。作者实际发布未做就留待，不自动认证或复写作者图。
- 迁移文件计数/old-new哈希、活动引用/删除依赖、生成物/PC www一致，保留25–28必要定向回归。无全量地图合规/寻路、不为旧floor09/11修图、不要求作者重复41层。

## 作者最短步骤

打开原legacy快捷方式，应看到新首页→设置看固定40层/无镜像→重构、保存并重开选择seed→导入你已通过的JSON并明确加入池（或把文件按difficulty放normal下，运行`node tools/sync_levels.mjs`后刷新）→开始0层F进1→暂停回主界面/重试同塔→设置开editor，试玩不通关返回原稿→退出检查实际结果。seed使用当前池，池变化后同seed不保证原图序列。

## 可复制提示词

```text
在 C:\Users\beilu\Documents\blwork\reverse_abyss 只实施 docs/tasks/29-formal-main-menu-and-level-library.md，先读根四文档、docs/design/formal-main-menu-and-level-library.md、docs/checks/review-B4R12-2026-11-09.md。保留全部未提交R7–R12、原图/用户库/认证/证据，不重做25–28玩法。
index做唯一正式首页/游戏壳：上部英文REVERSE ABYSS，首页只有开始/退出与右下设置。开始正式0–40共41槽；设置可重构/保存seed文本/开editor/导入JSON，塔高固定无镜像。seed仅保存规范文本，重建用当前池，不保存塔快照；不能点击开始又随机新seed。本局重试仍原manifest。退出真实停止并尝试关当前页，失败给手动关闭提示，不杀浏览器。
legacy/short变单向跳index兼容壳，实际删除旧main/Game/Tower/menu及镜像/可调塔高/旧池合流/旧快捷键/调试产品入口，不能仅隐藏。保留共享物理/纯格式工具、角色朝向图像翻转/历史字段，不清旧localStorage或IndexedDB。editor/试玩回游戏到index，28回原草稿修复不退化。
整理levels为normal/difficulty-1..4、fixed、fallback、archive；原始开发示例关卡不动，历史只读归档，移动前后按SHA校验和路径映射不覆同名。只扫描四档normal重写sync_levels，用schema2与共用人工通过判定打包catalog，档位/坏hash失败不写半产物，无通过草稿跳过不入池。内置合格普通图＋浏览器published按id/hash去重，四档/9槽/test3不变，归档永不重种，不能再清池。
新设置导入只存草稿，有有效通过再明确加入池，未通过去editor；不伪造passed/恢复几何可达门槛。同步所有HTML/loader/夹具/当前测试和生成器，www改从新index构建，无新APK。旧玩法断言退休，不为绿灯恢复旧行为。
交付可见主界面/设置/开始退出/seed/导入/打开editor/未通关回原稿证据，文件迁移与删除依赖清单、同步目录真实进正式池证据；隔离fixture不写作者passed，未测照实说。给作者最短操作步骤，不要求每轮41层。
```
