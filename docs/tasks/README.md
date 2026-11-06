# 开发任务索引

更新：2026-11-06。**B1/B1-R1、B2-R1 工程验收通过；B3 安卓平台壳已交付，debug APK 已构建，真机/系统文件/人工认证待验。** 见 [B3 记录](../checks/B3-2026-11-06.md)、[B3 工具链](../checks/B3-toolchain.md)。PC 标准认证/发布/正式实抽人工尚未测。

| 当前批次 | 交付结果 | 对应旧任务 |
|---|---|---|
| B1：工程验收通过 | 连续两层、草稿恢复、开发试玩；异步数据问题关闭 | A3-C + T02B + T03/T04；收尾 09 |
| B2：工程与短塔游玩通过 | R1～R3 关闭；标准认证发布人工待补 | T05～T08；总卡 10，收尾 11 已验收 |
| **B3：平台壳已交付，待真机** | 触控/布局/生命周期/JSON/离线包/APK；真机与人工认证待验 | T09/T10；12 号卡 |

B1/B2 不重做。用户允许美术、音效、地图质量与 Boss 打磨后置，见 [待办](../design/followups.md)。优先 B3 安卓；独立平台/触控适配期间补 PC 标准通关、发布、正式实抽的人工记录，正式内容/认证文件往返验收前须有真实样本，不能脚本代打。不先扩展 40 层。

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
| [12-b3-android-short-tower.md](12-b3-android-short-tower.md) | **下一批执行：安卓短塔、触控、生命周期与文件往返** |

一次交付一批，内部保留可回退提交。对主链路故障自行修复后交付；低影响问题集中记录，不逐个升格为停工门槛。报告实际命令与结果、浏览器验证或环境限制、启动方法和简短已知问题；未执行的检查不声称完成。

可直接交接：

> 阅读 AGENTS.md、STATUS.md 和 docs/tasks/12-b3-android-short-tower.md，一次完成 B3 安卓短塔：复用当前核心，接多指输入/按键设置、暂停/返回与生命周期、离线打包、JSON 往返和真机交付。先核实官方工具链兼容并锁版本，不重做 B1/B2，不改旧图/清存储，不做 40 层或美术/Boss 重设。真实认证样本、APK、人工和真机记录必须如实；环境缺失时继续独立可做部分，不伪造通过。
