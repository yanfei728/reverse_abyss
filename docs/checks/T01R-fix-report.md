# T01-R 修复报告（R1～R5）

修复日期：2026-10-31。依据 [T01-R 任务卡](../tasks/05-review-followup.md) 与 [验收报告](review-2026-10-31.md)。
本轮只修 R1～R5 及同类边界，**没有**做 T02、没有改编辑器/玩法/关卡内容、没有再次初始化 Git。

- 修复前 HEAD：`570c122`（T01 实现 `6a7e712`，T00 基线 `f56cdce`）；修复提交：**`c7c5490`**。
- 工作区保留了验收 agent 的未提交文档与复现脚本；本轮只在其上追加实现与文档（这些材料随修复一起提交，见 `c7c5490`）。
- 原图 12 张、模板、`levels/levels.js`、`assets/`、旧编辑器/游戏/试玩代码都没有改动（见第 6 节命令）。

## 1. 结论

R1～R5 全部修复并补了针对性回归测试；`node tools/test_t01r.mjs` 为 **98 PASS / 0 FAIL**，完整自检为
**1188 PASS / 4 FAIL（退出码 1）**，4 条失败仍是原有 `floor09`/`floor11` 自动可达性，未改、未跳过。
12 张旧图在隔离目录重迁后与原交付输出**逐字节一致**，源文件 SHA-256 与 T00 基线一致。

本轮状态是“已修复，待复验”，不是验收通过；T01 完成仍需规划/验收 agent 复验后确认。

## 2. 实际命令与退出码

| 命令 | 结果 |
|---|---|
| `node tools/test_leveldata.mjs` | **139 PASS / 0 FAIL**，退出码 `0`（修复前 138/0；拆分 1 条断言并加严重度检查） |
| `node tools/test_t01r.mjs` | **98 PASS / 0 FAIL**，退出码 `0`（新增 R1～R5 回归） |
| `node tools/test_all.mjs` | **1188 PASS / 4 FAIL**，退出码 `1`；引擎 587/4、编辑器 238/0、贴图 126/0、数据 139/0、修复自检 98/0 |
| `node tools/migrate_levels.mjs` | 12/12 幂等跳过（`unchanged`），退出码 `0`；`levels/v2/` 无改动 |
| 隔离重迁（`--in levels --out <tmp> --report <tmp>`） | 12/12 新写入，退出码 `0`；12 个输出与 `levels/v2/` 逐字节相同 |
| `node docs/checks/review-2026-10-31-probes.mjs` | 退出码 `0`；修复后结果见 [T01R-postfix-probes.json](T01R-postfix-probes.json) |

原始输出：[完整自检](T01R-test_all.txt)、[隔离迁移](T01R-migration-isolated.txt)、[默认迁移](T01R-migrate-default.txt)。

## 3. 逐项修复

### R1 · 读写不对称、未知内容丢失、未来 schema 被降级

**原因**：`decode` 的 normalize 只挑固定字段重建对象（`{id,type,col,row,params,pathId}`），
`contentOf` 也只投影固定字段；`encode` 却把入参里的额外字段原样写进文件。于是“读进来就少字段、
写出去又多字段”，同一份内容得到两个 hash，重开必然 `HASH_MISMATCH`。`encode` 还把
`schemaVersion=3` 强制写成 2。

**修复**（[js/level-data.js](../../js/level-data.js)）：

- 新增 `project(data)` 作为**唯一内容投影**：契约字段按固定顺序、缺省补默认值；`size`/`terrain`/
  `visuals` 的未知子字段、对象/路径/路径点的未知字段、顶层未知字段全部保留并进入内容 hash。
  `hashSync`、`encode`、`normalize` 都走它，不再各自投影。
- `normalize` 从整份输入复制后覆盖已知字段；未知顶层字段保留并给出一次说明性 warning。
- `encode` 与 `decode` 一样要求 `schemaVersion === 2`，其他值返回 `UNSUPPORTED_SCHEMA`；
  不再有隐式升级/降级。
- `encode` 增加**回读自检**：用 `decode(text,{verifyHash:true})` 验证自己写出的文本，
  失败就拒绝写出（不产生半成品）。
- 顺手修掉 decode 警告重复拼接（同一条警告出现两次），并加断言。

**回归证据**（`test_t01r.mjs` R1 段）：
未知顶层 `authorNote`、对象 `behavior`/`priority`、路径 `label`、`visuals.tint`、装饰 `opacity`、
`size.unit`、`terrain.legend` 在 decode → encode → decode 后全部保留，内容 hash 一致；
修改未知字段会改变 hash；`schemaVersion=3` 在 encode/decode 两端都被拒绝且不改输入。
验收复现脚本对同一场景：`decodedBehavior` 从 `null` 变为 `{"keep":"author-data"}`，`reopenOk` 从
`false(HASH_MISMATCH)` 变为 `true`。

### R2 · 迁移工具在报错前覆盖输入

**原因**：旧工具先 `writeFileSync(outPath, text)`，之后才比对源文件 hash；`--in`/`--out` 指向同一目录时
输出文件名与输入相同，源文件在“发现被改”之前就被替换了。

**修复**（[tools/migrate_levels.mjs](../../tools/migrate_levels.mjs)）：

- 拆成 `planMigration()`（只读规划）与 `commitPlan()`（执行写入）；所有路径在**写入前**算好并检查。
- 检查项：输入/输出同一目录（含 Windows 大小写、符号链接/别名，用 `realpath` + 小写键比较）、
  输出位置不是目录/不是普通文件、两个源 id 归一化后写到同一输出（`DUPLICATE_OUTPUT`）、
  输出落在源文件上（`SOURCE_OVERWRITE`）、报告落到源文件或输出上（`REPORT_CONFLICT`）、
  报告放进输入目录（会被下次当成源文件）、输入目录不存在、输入为空。
- 已有输出：内容相同 → 幂等 `unchanged`（不重写）；内容不同 → 默认 `OUTPUT_CONFLICT` 不覆盖，
  必须显式 `--force`。失败时**一个文件都不写**，也不生成报告。
- 写后仍复验源文件 sha256 作为兜底；CLI 退出码：成功/幂等 `0`，任何规划失败 `1`。

**回归证据**：`test_t01r.mjs` R2 段共 30 项（含测试结束核对正式 `levels/` 与 `levels/v2/` 未被改动），
全部使用系统临时目录；覆盖同目录、大小写别名、
报告覆盖源文件、报告在输入目录内、输出 id 碰撞、人工改过的输出、`--force`、幂等、缺失输入、
输出是文件、CLI 退出码。测试结束核对正式 `levels/` 与 `levels/v2/` 的每个文件 sha256 未变。
验收复现脚本对同一场景：`sourceChanged` 从 `true` 变为 `false`，`sourceNowSchema` 保持 `null`
（源文件仍是旧格式），`detectedAfterWrite` 变为 `false`（根本不再先写后查）。

### R3 · 空规则对象绕过发布绑定

**原因**：`cert.rulesVersion !== rules.rulesVersion` 在两边都是 `undefined` 时为假，`rules={}` 与
缺少规则字段的认证被误判为匹配。

**修复**（[js/level-data.js](../../js/level-data.js)）：

- 认证里的 `rulesVersion` / `rulesFingerprint` 先独立校验为**非空字符串**且不超长，再参与比较。
- 发布校验要求当前 `rules` 是对象且两个字段都是非空字符串；缺失/空串/类型错误都返回
  `RULES_MISMATCH`。
- `completedAt` 必须是带时区的 ISO8601（`Z` 或 `±hh:mm`，允许 1～3 位小数秒）且 `Date.parse` 有效；
  非法时间在发布时 `INVALID_FIELD`，在草稿里只是 warning（不阻止打开/保存）。

**回归证据**：R3 段 15 项，覆盖认证/当前规则缺失、空串、空白、数字、合法匹配、
三种非法时间与两种合法时间、草稿坏时间只警告。验收复现脚本：`errorCount` 从 `0` 变为 `3`
（两条认证字段 + 一条当前规则缺失）。

### R4 · 旧数据迁移没有完整保留待处理信息

**原因**：`unknownChars`/`legacyEntities` 用 `.slice(0, 64)` 截断；旧对象只重建已知 5 个字段，
`pathId` 被移除；旧图未识别的顶层键与注释行没有保存。

**修复**（[js/legacy-import.js](../../js/legacy-import.js)）：

- 未知字符、旧实体的位置列表**不再截断**；超出 `extensions` 容量时由早先加上的
  `validate(draft)` 闸门返回 `LIMIT_EXCEEDED`，迁移明确失败、不写任何输出，不再“截 64 个仍报成功”。
- 旧对象整条复制：`behavior` 等额外字段保留；`pathId` 保留为“待修复引用”（草稿 warning、
  试玩/发布 error）；映射过的类型保留原类型名 `legacyType`；被规范化的 id 保留 `legacyId`；
  空/非字符串 pathId 也不会让整张图失败（分别置 null / 存 `legacyPathId`）。
- 旧图未识别的顶层字段存进 `extensions.legacy.meta`，`// key: value` 注释存进
  `extensions.legacy.comments`；被截断的显示名保留 `originalTitle`，被规范化的 id 保留 `originalId`。
- 迁移结束前用 `validate(draft)` 复核：只要草稿不能按同一契约保存，就返回失败而不是半成品。

**回归证据**：R4 段 21 项。80 个未知格全部保留（修复前 64）；4000 个未知格 → `LIMIT_EXCEEDED`
且不返回草稿；旧对象 `behavior`/`tags`/`pathId`/`legacyType`/`legacyId` 在 encode→decode 后仍在；
草稿下 `BROKEN_REFERENCE` 是 warning、试玩是 error；输入对象未被修改。
验收复现脚本：`retainedUnknownCount` 从 `64` 变为 `80`，`outputObject` 已包含
`behavior` 与 `pathId: "old_route"`。

说明：复现脚本里 `originalObjectInExtensions` 仍是 `false`。本轮采用的保留策略是
“未知字段留在对象本身”（可用、可再编辑、进入 hash），不再把整条原对象重复塞进 `extensions`；
作者数据没有丢失，证据见 `T01R-postfix-probes.json` 的 `outputObject`。

### R5 · 导出能产生自身无法导入的大文件

**原因**：`encode` 只对 `extensions` 做大小限制，没有检查最终文本的总字节数；格式化后的 JSON 会
比内容大，2,100,797 字节的文件超过了 2,097,152 的导入上限。

**修复**（[js/level-data.js](../../js/level-data.js)）：`pretty()` 之后用 `byteLength`（UTF-8）检查总字节数，
超过 `LIMITS.BYTES` 返回 `LIMIT_EXCEEDED`，不返回文本；错误信息带实际字节数与上限。
R1 的回读自检同时兜底“能写出但读不回”。

**回归证据**：R5 段 7 项：ASCII 超限、中文按 UTF-8 超限（字符数未超但字节超）、未超限的大文件可导出
且字节数 ≤ 上限、导出后可重新导入。验收复现脚本：`encodeOk` 从 `true(2,100,797 字节)` 变为 `false`。

## 4. 隔离迁移验收

命令（输出/报告都在系统临时目录，正式 `levels/` 不参与写入）：

```powershell
node tools/migrate_levels.mjs --in levels --out <tmp>\out --report <tmp>\rep\report.md
```

- 12/12 迁移成功，退出码 `0`；12 个输出与已交付的 `levels/v2/*.json` **逐字节相同**
  （floor01 3371 字节 … floor12 2220 字节，见 [T01R-migration-isolated.txt](T01R-migration-isolated.txt)）。
- 12 张原图 + `_template.json` 的 SHA-256 与 [T00 基线](T00-baseline.md) 记录完全一致。
- 默认命令重跑：12 张全部 `unchanged`，不重写 `levels/v2/`；只有工具自己生成的
  [迁移报告](T01-legacy-migration.md)与 JSON 记录按新格式（增加“状态”与路径安全说明）更新，
  这是本轮唯一有意的迁移文档差异，关卡输出没有变化。

## 5. 未做 / 边界

- 没有做 T02（编辑器模型、草稿仓库、保存 UI 都没有动）；旧编辑器仍是 TXT 模型。
- 没有浏览器人工打开、没有安卓/真机、没有帧率测量；T01 相关的人工“可读性/重开”仍归复验者。
- 原有 4 条 `floor09`/`floor11` 自动可达性失败未修（不属于 T01-R）。
- 接口几何、资源白名单、认证 UI、发布池仍未实现，与 T01 交付时一致。
- 新增规则：报告文件必须放在输入目录之外（避免下次被当成源文件）；`--force` 只覆盖输出，
  永远不允许覆盖源文件。

## 6. 改动文件

| 文件 | 改动 |
|---|---|
| `js/level-data.js` | R1 内容投影/未知字段保留/schema 双端拒绝/回读自检；R3 规则与 ISO 时间；R5 字节上限；decode 警告去重；`BROKEN_REFERENCE` 草稿降级为 warning |
| `js/legacy-import.js` | R4 保留未知格/额外字段/pathId/元信息，超容量明确失败，迁移后草稿闸门 |
| `tools/migrate_levels.mjs` | R2 规划/写入拆分、路径与冲突检查、幂等/`--force`、报告与 CLI |
| `tools/test_t01r.mjs` | 新增 R1～R5 回归（98 项） |
| `tools/test_leveldata.mjs` | 断路径断言按新契约拆分（草稿可存、试玩拒绝） |
| `tools/test_all.mjs` | 接入修复自检总账 |
| `docs/checks/T01-legacy-migration.md/json` | 由工具重新生成（状态列、路径安全说明） |
| `STATUS.md` / `PROJECT.md` / 设计接口 / 任务卡状态 | 同步修复结论与证据 |

复现全部检查：

```powershell
node tools/test_leveldata.mjs
node tools/test_t01r.mjs
node tools/test_all.mjs
node tools/migrate_levels.mjs --in levels --out $env:TEMP\ra-out --report $env:TEMP\ra-rep\report.md
```
