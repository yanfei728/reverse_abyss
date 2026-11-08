# 开发任务索引

更新：2026-11-08。**18号卡通过工程/用户人工验收，当前只实施 [19号编辑器卡](19-editor-markers-and-gear-paths.md)**：鼠标标记2×1端点/自动坐标、裁剪/R4、单点静止与直角往返/闭合齿轮、R3新夹具试玩。不做平滑曲线/正圆或新怪物；仅PC、无APK，短塔/碰撞保留回归。

| 当前批次 | 交付结果 | 对应旧任务 |
|---|---|---|
| B1：工程验收通过 | 连续两层、草稿恢复、开发试玩；异步数据问题关闭 | A3-C + T02B + T03/T04；收尾 09 |
| B2：工程与短塔游玩通过 | R1～R3 关闭；标准认证发布人工待补 | T05～T08；总卡 10，收尾 11 已验收 |
| **B3：工程与本轮安卓人工通过** | 0.3.2 / R4 关闭；真实文件与 PC 认证发布专项待补 | T09/T10；总卡 12，修复卡 13/14 已关闭 |
| B4-R1短塔主体 | 用户人工反馈通过、R1关闭 | 17号卡主体不重做 |
| B4-R2碰撞 | 工程与用户人工验收通过、R2关闭 | 18号卡不重做 |
| **编辑器：当前待实施** | 鼠标端点/坐标裁剪、直角齿轮及R3/R4 | [19号卡](19-editor-markers-and-gear-paths.md) |

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
| [19-editor-markers-and-gear-paths.md](19-editor-markers-and-gear-paths.md) | **当前：鼠标端点、裁剪坐标/安全与直角齿轮、R3试玩；无新怪物/APK** |

一次交付一批，内部保留可回退提交。对主链路故障自行修复后交付；低影响问题集中记录，不逐个升格为停工门槛。报告实际命令与结果、浏览器验证或环境限制、启动方法和简短已知问题；未执行的检查不声称完成。

当前交接边界：

> 只实施19号卡/editor-mouse-workflow：修裁后旧selection覆盖坐标与安全裁剪，以鼠标2×1标记端点、自动坐标替代手填/拖框；齿轮左键放置/续点、右键结束，一点静止，90°水平垂直往返或闭合，不做平滑/正圆。共享路径几何接校验/裁剪/运行，修R3旧夹具试玩；保留B1安全、短塔/碰撞和主题，无新怪物/APK，不自动认证，集中交付。
