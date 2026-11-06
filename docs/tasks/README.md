# 开发任务索引

更新：2026-11-06。**B1/B1-R1 通过；B2-R1 已交付 R1～R3，待集中复验 + 作者人工认证。** 见 [B2-R1 记录](../checks/B2-R1-2026-11-06.md)、[独立验收](../checks/review-B2-2026-11-06.md)。

| 当前批次 | 交付结果 | 对应旧任务 |
|---|---|---|
| B1：工程验收通过 | 连续两层、草稿恢复、开发试玩；异步数据问题关闭 | A3-C + T02B + T03/T04；收尾 09 |
| **B2：B2-R1 已交付，待复验** | 已修默认入口、上层机关坐标/接触、标准 CD 后技能；人工认证待作者 | T05～T08；总卡 10，收尾 11 |
| B3 | 安卓短塔，触控、生命周期与 JSON 文件往返 | T09/T10 |

B1 不重做。B2-R1 已完成默认入口/上层对象/标准技能收尾；仍由作者实际标准通关、发布、正式实抽与完整短塔验收，不能脚本代打。B2-R1 复验通过后优先 B3 安卓，不先扩展 40 层。

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
| [11-b2-review-fixes.md](11-b2-review-fixes.md) | **当前执行：B2-R1 默认入口、上层机关、标准技能** |

一次交付一批，内部保留可回退提交。对主链路故障自行修复后交付；低影响问题集中记录，不逐个升格为停工门槛。报告实际命令与结果、浏览器验证或环境限制、启动方法和简短已知问题；未执行的检查不声称完成。

可直接交接：

> 阅读 AGENTS.md、STATUS.md 和 docs/tasks/11-b2-review-fixes.md，一次完成 B2-R1：默认入口接新短塔、修复上层机关坐标与正常接触、标准试玩初始 CD 20 秒后可按 K 施法。保留 B1/B2 主体与原图/用户草稿，不重写物理，不清浏览器存储，不开始安卓或 40 层。补正常固定步跨层后的对象回归和可实测样例，交付真实检查；不得伪造人工通关认证。
