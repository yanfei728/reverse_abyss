# 开发任务索引

更新：2026-11-01。T00/T01/T01-R 已验收；T02A 主体交付但独立验收发现 A1～A3，见 [报告](../checks/review-T02A-2026-11-01.md)。**下一步只执行 [T02A-R](07-t02a-review-fixes.md)**，复验后再 T02B。一次给实现 agent 一张卡，不实施整条路线。

| 卡 | 交付 | 前置 | 所在文件 |
|---|---|---|---|
| T00 | 可回退代码基线、环境与失败记录 | 无 | [01-foundation.md](01-foundation.md) |
| T01 | 新 LevelData、校验、旧图迁移 | T00 | [01-foundation.md](01-foundation.md) |
| T01-R | 修复验收发现的 R1～R5（已复验） | 已完成 | [05-review-followup.md](05-review-followup.md) |
| T02 | 编辑器 JSON 无损保存与草稿仓库 | T01 | [01-foundation.md](01-foundation.md) |
| T02A | 模型与 JSON 文件往返（已交付，待修） | 需 T02A-R 复验 | [06-t02a-editor-model.md](06-t02a-editor-model.md) |
| T02A-R | 修复画笔幂等/失败导入/缩图接口（当前优先） | T02A 已交付、待修 | [07-t02a-review-fixes.md](07-t02a-review-fixes.md) |
| T02B | 草稿仓库与保存 UI | T02A | [05-review-followup.md](05-review-followup.md) |
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

> 阅读 AGENTS.md、STATUS.md、docs/checks/review-T02A-2026-11-01.md 和 docs/tasks/07-t02a-review-fixes.md。只修 T02A-R 的 A1～A3：机关画笔同格幂等、结构错误导入零替换、缩图接口影响确认及保真备份。补模型/UI/真实浏览器回归，报告实际结果，保留原图、证据与无关文件，不提前做 T02B 或美术接入。

后续换为对应卡号和文件。若前置未完成，先报告具体缺口，不靠绕过契约或静默缩小范围完成当前卡。

每张卡的交付统一包括：改动文件和行为、自动检查命令/退出码/差异、实际人工步骤、未完成项、文档更新、可回退方式。截图、录像或 APK 只有实际生成并验证后才能写“已提供”。状态表更新在根目录 STATUS，任务卡的验收条件不随意删改。
