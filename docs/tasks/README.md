# 开发任务索引

更新：2026-11-09。30主体工程通过，编辑器两bug交[31](31-editor-visual-path-and-unpublish.md)收尾，并加入用户明确确认的最小单版本下架；31已实施，工程检查通过，待作者最短人工确认，详见[交付](../checks/B4R15-2026-11-09-editor-unpublish.md)。

| 当前批次 | 交付结果 | 对应旧任务 |
|---|---|---|
| B1：工程验收通过 | 连续两层、草稿恢复、开发试玩；异步数据问题关闭 | A3-C + T02B + T03/T04；收尾 09 |
| B2：工程与短塔游玩通过 | R1～R3 关闭；标准认证发布人工待补 | T05～T08；总卡 10，收尾 11 已验收 |
| **B3：工程与本轮安卓人工通过** | 0.3.2 / R4 关闭；真实文件与 PC 认证发布专项待补 | T09/T10；总卡 12，修复卡 13/14 已关闭 |
| B4-R1短塔主体 | 用户人工反馈通过、R1关闭 | 17号卡主体不重做 |
| B4-R2碰撞 | 工程与用户人工验收通过、R2关闭 | 18号卡不重做 |
| 编辑器19号卡 | 已交付部分通过；齿轮人工正常，试玩终止/标记输入由20接续 | 保留主体，不从头实施 |
| 20～22 单关试玩 | 单关生命周期/标记/启动修复；23接续 | [20](20-single-level-trial-completion.md)、[21](21-single-level-trial-lifecycle.md)、[22](22-trial-startup-and-lifecycle.md) |
| 23 试玩启动 | 用户人工确认试玩通过关闭；启动接线/普通初态 | [23](23-trial-startup-and-manual-acceptance.md) |
| 24 编辑器精简 | 用户人工确认编辑器通过关闭；旧面板/主题/齿轮/返回/旧页 | [24](24-editor-simplification-and-theme.md) |
| **25 完整塔** | 本轮通过关闭，用户人工走完41层，26完成缺图修复 | [25](25-full-tower-formal-game.md) |
| **26 连续入层** | 本轮通过关闭，独立复测与人工41层；N04并入27 | [26](26-continuous-floor-entry.md) |
| **27** | 怪物主体已验，返回R1已由28工程复验关闭；发布人工未全记 | [27](27-moving-fireball-and-flail.md) |
| **28** | 工程通过/作者编辑试玩导出可用，未测专项保留 | [28](28-trial-return-soul-and-sewage.md) |
| **29** | 验收通过：用户人工正常，独立34/0、98/0、45/0；[复验](../checks/review-B4R13-2026-11-09.md) | [29](29-formal-main-menu-and-level-library.md) |
| **30** | 主体工程通过：独立95/0、13/0、98/0，编辑器两bug转31；不补造逐项人工通过 | [30](30-coins-archer-and-score.md) |
| **31（当前）** | 已实施：定向34/0、隔离Chrome37/0；待作者最短人工确认 | [31](31-editor-visual-path-and-unpublish.md) |

B1/B2/B3及17/18/20～30已验主体保留。31只做编辑器两bug与单版本下架；普通怪物/Boss新机制/追捕/表现/摇杆/APK后置。

## 参考卡

| 文件 | 用途 |
|---|---|
| [01-foundation.md](01-foundation.md) | 数据与旧 T02 基础要求；T00 不重复执行 |
| [02-runtime-world.md](02-runtime-world.md) | 共用会话、连续世界细节，纳入 B1 |
| [03-playable-slice.md](03-playable-slice.md) | 战斗、编辑发布、Boss 与 PC 验收，纳入 B2 |
| [04-android.md](04-android.md) | 安卓范围，纳入 B3 |
| [05-review-followup.md](05-review-followup.md) | T01-R 与草稿仓库参考 |
| [06-t02a-editor-model.md](06-t02a-editor-model.md) | 已交付编辑模型的契约 |
| [07-t02a-review-fixes.md](07-t02a-review-fixes.md) | A3-C 精确复现与必要回归，纳入 B1 |
| [08-playable-milestones.md](08-playable-milestones.md) | 三批范围与主链路验收依据 |
| [09-b1-review-fixes.md](09-b1-review-fixes.md) | 已验收：B1-R1 异步数据安全收尾 |
| [10-b2-pc-short-tower.md](10-b2-pc-short-tower.md) | B2 总范围；主体已交付，收尾见 11 |
| [11-b2-review-fixes.md](11-b2-review-fixes.md) | 已通过：B2-R1 默认入口、上层机关、标准技能；人工发布链路待补 |
| [12-b3-android-short-tower.md](12-b3-android-short-tower.md) | B3 总范围；平台壳已交付，修复/真机待验 |
| [13-b3-review-fixes.md](13-b3-review-fixes.md) | 三项工程复验通过：触点释放、重认证、草稿保真；后续真机故障见 14 |
| [14-b3-android-viewport-fix.md](14-b3-android-viewport-fix.md) | **验收通过：启动裁切 R4 关闭，0.3.2 与用户人工反馈通过** |
| [15-cloud-pipe-authored-tower.md](15-cloud-pipe-authored-tower.md) | B4原卡：云板/石管/作者三图；PC已交付，问题由17修复 |
| [16-editor-workbench.md](16-editor-workbench.md) | **B4配套：普通图已有对象摆放、尺寸/裁空白、现代扁平卡片与深浅主题；Boss/大厅只读** |
| [17-b4-review-and-fixed-scenes.md](17-b4-review-and-fixed-scenes.md) | 主体流程人工反馈通过，R1关闭；R2由18号卡接续 |
| [18-cloud-side-collision.md](18-cloud-side-collision.md) | 已验收关闭：穿墙修复，作为回归保留 |
| [19-editor-markers-and-gear-paths.md](19-editor-markers-and-gear-paths.md) | 已交付部分通过，齿轮保留；R3完成语义与输入问题由20接续 |
| [20-single-level-trial-completion.md](20-single-level-trial-completion.md) | 单关开发/标准生命周期、标记自动云板（已被21/23/24/28/29继续） |

一次交付一批，内部保留可回退提交。对主链路故障自行修复后交付；低影响问题集中记录，不逐个升格为停工门槛。报告实际命令与结果、浏览器验证或环境限制、启动方法和简短已知问题；未执行的检查不声称完成。

当前交接边界：

> 当前只交31：流星锤显示、路径随对象删除、设置精确版本下架。30主体工程通过，两个编辑器问题由31收尾；保留25–30玩法与作者数据，只PC无APK。最短人工：放锤缩放平移→画路线后擦/撤销/重做/保存重开→设置下架选定版本，草稿仍在；有内置源则移出JSON并sync刷新新开，旧塔重试不变。
