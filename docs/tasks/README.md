# 开发任务索引

更新：2026-11-08。**19号卡部分通过，当前只实施 [20号卡](20-single-level-trial-completion.md)**。齿轮用户人工反馈正常；开发试玩仍接作者图无结束、标记持按会回旧画笔，需补单关完成和自动云板/按压隔离。标准与短塔分明；不重做齿轮/碰撞，不加怪物/APK。

| 当前批次 | 交付结果 | 对应旧任务 |
|---|---|---|
| B1：工程验收通过 | 连续两层、草稿恢复、开发试玩；异步数据问题关闭 | A3-C + T02B + T03/T04；收尾 09 |
| B2：工程与短塔游玩通过 | R1～R3 关闭；标准认证发布人工待补 | T05～T08；总卡 10，收尾 11 已验收 |
| **B3：工程与本轮安卓人工通过** | 0.3.2 / R4 关闭；真实文件与 PC 认证发布专项待补 | T09/T10；总卡 12，修复卡 13/14 已关闭 |
| B4-R1短塔主体 | 用户人工反馈通过、R1关闭 | 17号卡主体不重做 |
| B4-R2碰撞 | 工程与用户人工验收通过、R2关闭 | 18号卡不重做 |
| 编辑器19号卡 | 已交付部分通过；齿轮人工正常，试玩终止/标记输入未过 | 保留主体，不从头实施 |
| **试玩/标记：当前待实施** | 单关真实出口结束、开发/标准区分、自动云板与按压隔离 | [20号卡](20-single-level-trial-completion.md) |

B1/B2/B3及17/18号卡不重做。R3/R4本轮纳入19号卡，人工标准认证发布/文件往返仍按实际补验，不自动passed；新怪物、美术/音效/Boss技能/摇杆/40层和APK继续后置。

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
| [20-single-level-trial-completion.md](20-single-level-trial-completion.md) | **当前：单关开发/标准生命周期、标记自动云板，PC无APK** |

一次交付一批，内部保留可回退提交。对主链路故障自行修复后交付；低影响问题集中记录，不逐个升格为停工门槛。报告实际命令与结果、浏览器验证或环境限制、启动方法和简短已知问题；未执行的检查不声称完成。

当前交接边界：

> 只实施20号卡/single-level-trials：开发只试当前模板与生成支撑，真实出口完成立即结束，不接作者test2/3；标准共用计划/完成但保留standard-v1和认证保护，短塔到Boss才胜利。标记自动云板并消费按压至抬起，防旧画笔下一帧覆盖。保留用户已测正常的齿轮与短塔/碰撞，无新怪物/APK，真实行为验证后集中交付。
