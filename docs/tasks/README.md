# 开发任务索引

更新：2026-10-31。T00 已验收；T01 主体交付但复验未通过，先执行 [T01-R](05-review-followup.md)。T02～T10 待开始，T02 拆为 T02A/T02B。一次给实现 agent 一张卡；完成后根据实际结果调整后续卡。

| 卡 | 交付 | 前置 | 所在文件 |
|---|---|---|---|
| T00 | 可回退代码基线、环境与失败记录 | 无 | [01-foundation.md](01-foundation.md) |
| T01 | 新 LevelData、校验、旧图迁移 | T00 | [01-foundation.md](01-foundation.md) |
| T01-R | 修复验收发现的 R1～R5，阻止数据丢失与错误认证 | 现有 T01；当前优先 | [05-review-followup.md](05-review-followup.md) |
| T02 | 编辑器 JSON 无损保存与草稿仓库 | T01 | [01-foundation.md](01-foundation.md) |
| T02A / T02B | 分别完成模型与文件往返、仓库与保存 UI | T01-R 复验后依次执行 | [05-review-followup.md](05-review-followup.md) |
| T03 | 共用会话、统一时间和输入 | T01 | [02-runtime-world.md](02-runtime-world.md) |
| T04 | 可变尺寸的两层连续世界与生命周期 | T03 | [02-runtime-world.md](02-runtime-world.md) |
| T05 | 生命、14/20 秒光环与代表对象运行 | T04 | [03-playable-slice.md](03-playable-slice.md) |
| T06 | 参数/路径编辑、人工认证与发布 | T02、T05 | [03-playable-slice.md](03-playable-slice.md) |
| T07 | 休整、Boss、短塔闭环 | T06 | [03-playable-slice.md](03-playable-slice.md) |
| T08 | PC 短塔集成验收与交付 | T07 | [03-playable-slice.md](03-playable-slice.md) |
| T09 | Android 工程、触控与生命周期 | T08 | [04-android.md](04-android.md) |
| T10 | Android 文件往返、设置与真机交付 | T09 | [04-android.md](04-android.md) |

T01～T04 重点验证结构；T05～T08 才验收完整玩法。T04 的可玩两层不能写成“短塔完成”。T01 生成的新格式也不能直接替换尚未适配的旧运行入口。

推荐发送给实现 agent 的任务文本：

> 阅读根目录 AGENTS.md、PROJECT.md、STATUS.md、docs/checks/review-2026-10-31.md，以及 docs/tasks/05-review-followup.md 中的 T01-R。只修复 R1～R5，使用隔离夹具验证覆盖风险，保留原图和交付证据；补回归并交付复验，不提前做 T02，不重新初始化 Git。

后续换为对应卡号和文件。若前置未完成，先报告具体缺口，不靠绕过契约或静默缩小范围完成当前卡。

每张卡的交付统一包括：改动文件和行为、自动检查命令/退出码/差异、实际人工步骤、未完成项、文档更新、可回退方式。截图、录像或 APK 只有实际生成并验证后才能写“已提供”。状态表更新在根目录 STATUS，任务卡的验收条件不随意删改。
