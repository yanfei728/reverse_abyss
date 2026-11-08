# 数据结构与模块接口 v1

这是目标技术契约，不是所有 API 均已实现；当前状态见 [STATUS](../../STATUS.md)。设计提案依据见 [decisions.md](decisions.md)。新代码仍使用原生 JS 与 `RA`；下列类型写法仅用于说明，不要求迁移 TypeScript。

**当前21号卡补充（2026-11-08，已获用户确认，待实施）**：20号卡试玩未通过；原生成三层支撑/石管方案撤回。新契约见 [独立单关试玩](independent-level-trials.md)：一个试玩验证入口，TrialSession独立于塔World/GameSession，仅复用基础模块；本图start中心顶面出生，完整向上跨本图finish顶面即通过/冻结。handoff建议V3且无floors/next；schema2不变，现有Certification保留hash/rules/revision/profile保护，实施时升级规则指纹；通过后显式发布、草稿保存/JSON备份不限。下文旧“共用Session/入口支撑/楼层结束”由本补充覆盖。标记自动云板/消费按压已入实现，齿轮人工正常，不重做。

**19号卡已交付规则**：18号卡R2已验收，19号编辑器齿轮人工正常。见 [鼠标工作流](editor-mouse-workflow.md)：schema2/pathId/mode/整数points继续；一点静止，往返/闭合仅水平垂直与90°转角，旧斜线/未知信息保真草稿。端点只读显示模型坐标、鼠标标记；裁剪含包络与工作区保护。旧手填端点/至少两点约束已替代，固定场景/已修世界碰撞不重做。

2026-11-07 B4已交付PC、验收暂不通过。接口为 [cloud-pipe-v2](cloud-pipe-interfaces.md)，ports以col+row标记start/finish；schemaVersion仍2，旧vertical-v1只保真存草稿、新play/publish拒绝。当前修复契约以 [固定场景与碰撞](short-tower-fixed-scenes-and-collision.md) 为准：lobby无端口、程序维护extensions.fixedScene.playerSpawn与F交互；终局boss仅start、finish=null，固定Boss中心入hash；normal/rest仍双端点。跨层碰撞由世界适配统一查询。上述修复待17号卡实现；Android仍0.3.2、不构建APK。

同日本轮增加 [普通编辑器配套方案](editor-workbench-v2.md)／[16号卡](../tasks/16-editor-workbench.md)：15→16连续实施。Boss/大厅固定场景不开放自由编辑，旧P/G工具移除但旧数据保真。地图size是导出唯一尺寸真值，视口/主题不进LevelData；裁剪先在完整候选副本校验并同步所有活动坐标，确认后原子提交、可撤销、旧认证失效。EditorPreferences独立存储 `{schemaVersion:1,theme:'light'|'dark',autoGrow:boolean}`，不影响hash/dirty；设置失败不能报已保存。不得在导出分支悄悄裁文件或只按非零地形丢对象/路径/端点。

## 1. 数据所有权

| 数据 | 所有者 | 可变性 / 生命周期 |
|---|---|---|
| LevelData | 编辑器草稿；发布后由 ContentRepository 持有 | 草稿可编辑；发布版本不可变 |
| Certification | 认证服务 | 绑定一个内容 hash 和玩法规则，不随复制编辑自动有效 |
| TowerManifest | TowerPlanner / Repository | 一局开始后不可变，引用准确内容版本 |
| RunState | GameSession | 一局内可变，死亡重置；不能写回模板 |
| FloorInstance | World | 预热→当前→旧层快照→释放 |
| EntityInstance | 所属 FloorInstance，未来可移交追捕列表 | 有实例 ID，不复用模板对象作为运行对象 |

禁止把关卡模板中的 `objects` 直接当成可变敌人数组。深复制/冻结边界由模块负责，调用方不能共享隐式可变引用。

## 2. LevelData（schemaVersion=2）

旧文件没有 schemaVersion，新版使用 2 区分。结构如下，`?` 仅为说明可选字段：

```text
LevelData {
  schemaVersion: 2,
  id: string,
  title: string,
  kind: 'normal' | 'lobby' | 'rest' | 'boss',
  difficulty: 1 | 2 | 3 | 4 | null,
  size: { cols: integer, rows: integer },
  terrain: { tiles: integer[][] },
  ports: { profile: 'vertical-v1', entry: { col: integer }, exit: { col: integer } } | null,
  spawn: { col: integer, row: integer } | null,
  objects: ObjectData[],
  paths: PathData[],
  visuals: { backgroundId: string | null, decorations: DecorationData[] },
  extensions: JSON object,
  contentHash: string | null,
  certification: Certification | null
}
```

- `id` 为稳定逻辑身份；建议 UUID 或受校验的字母数字/下划线/短横线，禁止路径分隔符。`title` 是显示名，可重名，不以标题去重或决定覆盖。
- 普通层 difficulty 必须为 1～4，固定场景为 null。普通发布 UI 不允许作者把固定场景混入普通池；内置固定场景也要通过工程验收。
- 瓦片格均为整数 ID，矩阵行列必须与 size 精确一致。初始字典：0 空、1 草、2 土、3 砖、4 石、5 单向梯板。禁止另一份可编辑 asc 真值。
- 门、浮石、弹簧、地刺等动态/参数化对象放 objects；起点放 spawn；出口由 ports 表示，不再以 P/G 字符定义正式逻辑。
- `ports=null`、`spawn=null` 可用于未完成/旧图迁移草稿，阻止试玩和发布；保存草稿不要求可通。
- 旧spawn格表示脚底所在格底边：x=(col+0.5)*TS−player.w/2，feet=(row+1)*TS，仅作旧迁移/兼容。B4普通模板试玩只认ports.start，x=(start.col+1)*TS−player.w/2、feet=start.row*TS，不生成入口支撑。大厅出生由固定场景指定。
- 认证普通模板必须有底入口与顶出口；大厅/最终 Boss 的实际进出许可由场景控制器处理，不把已关闭出口改成实心模板真值。
- 资源使用稳定资源 ID，首版仅接内置资源，不直接执行 JSON 中的脚本或请求任意资源地址。未知 visuals 资源可显示占位，但发布要报告缺失。
- extensions 只保存 JSON 数据，不执行；用于保留额外元信息，不能偷渡未注册玩法逻辑。首版不提供任意插件系统。
- 尺寸、对象数量、路径点、字符串长度及导入字节数需要校验上限；值由 T01 给出可调保守上限，T10 用真机验证调整。可变尺寸不代表无限分配内存。

### 参数对象与路径

```text
ObjectData {
  id: string,                       // 模板内唯一
  type: string,                     // 稳定注册名
  col: integer, row: integer,       // 所在格，运动锚点是格中心
  params: JSON object,
  pathId: string | null
}

PathData {
  id: string,                       // 模板内唯一
  mode: 'loop' | 'pingpong',
  points: { col: integer, row: integer }[]
}

DecorationData {
  id: string, assetId: string,
  col: integer, row: integer,
  layer: 'back' | 'front'
}
```

路径点在格中心；对象的初始格须等于路径首点。直线连接相邻路径点，速度单位格/秒；loop 最后一点连接第一点，pingpong 到端点折返；初始提案不设停留。至少两个不同点，禁止相邻重复、零长度段、出界或穿越接口保护区。齿轮可穿内部地形（不阻挡的伤害物）；将来武者是否受地形阻挡须另定，不能从齿轮行为推断。

对象引用路径使用 pathId；多个对象可引用同一路径，移动进度各自独立。删除被引用路径要提示并显式处理引用，不能偷偷清空。复制对象生成新 id，复制全图为新关卡生成新 level id 并清认证。

### 首版对象定义

| type | 参数（初始默认来自 config） | 交互 |
|---|---|---|
| spring | 空或显式注册的弹力覆盖 | 保留弹簧行为 |
| crumble_door | fadeSeconds | 接触消失，本局不恢复 |
| blink_platform | warningSeconds, goneSeconds | 踩踏预警后失去碰撞，安全恢复 |
| fireball_static | radiusTiles, damage | 不阻挡；接触伤害；可一击消灭 |
| spike | warningSeconds, activeSeconds, cooldownSeconds, damage | 本格底座实心；刺无阻挡体积；不能击败 |
| gear | speedTilesPerSecond, radiusTiles, damage，pathId 必填 | 路径移动、不阻挡、不能击败 |

参数有类型、范围、单位、默认值和中文显示名。编辑器只暴露注册过的参数；不把复杂内部状态列为可编辑参数。已知类型的未知参数需保留并报不兼容，不能默认忽略后认证。

## 3. 内容 hash 与认证

`contentHash` 格式 `sha256:<64位小写十六进制>`。对去掉顶层 contentHash 和 certification 后的完整 LevelData 做规范化 JSON：对象键递归按字典序排列，数组保持顺序，UTF-8 编码；禁止 undefined、NaN、Infinity、函数。首版名称/视觉/元信息变化也算变更，不做复杂“是否影响玩法”的猜测。

序列化时重新计算 hash；加载外部文件时验证提供的 hash 是否匹配，不能信任自报值。缺 hash 的草稿可补算；认证不因补算而自动生成。实现需有跨 Node/浏览器一致的规范化固定样例。

```text
Certification {
  contentHash: string,
  rulesVersion: string,
  rulesFingerprint: string,
  profileId: 'standard-v1',
  status: 'passed',
  completedAt: ISO8601 string,
  source: 'local-playtest' | 'imported-declaration'
}
```

rulesVersion 是显式规则版本；rulesFingerprint 是实际玩法常量、接口规格、对象定义及标准试玩配置的稳定指纹。仅变更代码行为而未变参数时也必须更新 rulesVersion。素材显示缓存不混入运行状态指纹。

本地通过后才生成 Certification。发布时同时检查当前内容 hash、当前规则版本/指纹、标准 profile 与结果。认证通过不会自动发布，用户点击发布后才进入普通池。

运行回执与存盘认证分开：

```text
PlaytestResult {
  sessionId: string, draftId: string, revision: integer,
  contentHash: string, rulesVersion: string, rulesFingerprint: string,
  profileId: string, mode: 'playtest'|'debug',
  outcome: 'passed'|'dead'|'aborted', completedAt: ISO8601 string
}
Receipt = 校验过的 PlaytestResult，且 mode='playtest'、outcome='passed'、profileId='standard-v1'
```

Bridge 只接受本页面启动并登记的 sessionId 与快照；跨窗口消息校验来源窗口/同源消息通道和 sessionId，不能信任任意页面发送的 passed。时间戳仅用于记录，玩法仍使用模拟时间。Repository 在发布事务中再次校验 revision/hash/规则，不能只依赖 UI 按钮的 enabled 状态。

单机不做服务端签名或防作弊。跨设备导入的有效认证只能算作者声明，显示来源；格式/内容/规则匹配且对象支持时可作为导入发布版本，无匹配认证则只进草稿。不能因“导入”默认 verified=true，也不能要求手机用户使用 PC 编辑器才能导入已认证文件。

## 4. 塔清单与本局

```text
TowerManifest {
  schemaVersion: 1,
  id: string,
  profileId: 'short-v1' | 'full-v1',
  generatorVersion: string,
  rulesVersion: string,
  rulesFingerprint: string,
  seed: string,
  assist: { disableTimeout: boolean, disableAdvancedEnemies: boolean,
            reducedBossStages: boolean },
  floors: { instanceId: string, floorIndex: integer,
            kind: 'lobby'|'normal'|'rest'|'boss',
            levelId: string, contentHash: string }[]
}

RunState {
  runId: string, manifestId: string,
  status: 'playing'|'paused'|'dead'|'won',
  currentFloorIndex: integer,
  characterId: string,
  hp: number, maxHp: number, invulnerableRemaining: number,
  skill: { cooldownRemaining: number, activeRemaining: number,
           castId: string|null },
  elapsed: number,
  visitedFloorIds: Set<string>, claimedRestIds: Set<string>
}
```

RunState 中的 Set 是内存类型；若未来续局持久化，显式转换数组并引入存档版本。玩家位置/速度由会话内唯一 Player 持有；冷却、生命不再另在 Player 存一份独立真值，可通过只读代理访问 RunState。

FloorInstance：`instanceId, levelRef, originPx, phase, ambientTime, activeTime, entities, mutableTerrainState`。phase 为 preview/active/retired；retired 只保留 TerrainSnapshot，不继续持有活敌人数组。相同模板重复抽到两层有不同实例 ID，状态互不影响。

首版创建内存中的不可变清单，按 levelId+contentHash 取模板；抽选候选按稳定 ID/hash 排序再使用种子随机，不依浏览器遍历顺序。不选择未发布/不兼容模板。候选不足可以重复；为空时用已认证兜底并记录提示，不静默抽未经认证的旧图。

历史重温实现时持久保存清单及被引用内容版本，短种子码只是索引/随机输入，不是完整关卡数据库。缺失旧内容要报缺失，不能换最新版本却宣称原样重温。v0.1 不承诺历史 UI；手机导入/导出首先针对关卡 JSON。

## 5. 模块接口

所有接口是拟定签名，路径为建议。Result 统一为 `{ok:true,value}` 或 `{ok:false,error:{code,message,issues?}}`；校验问题包含 `code,path,message`，UI 能定位字段/格子。异步写入失败用 Result，不一部分 throw、一部分静默回退。程序错误可抛异常供诊断。

| 模块 | 建议位置 | 契约与职责 |
|---|---|---|
| LevelCodec | js/level-data.js（RA.LevelData / RA.LevelCodec） | `decode(input,{allowDraft}) -> Result<LevelData>`；`validate(data,{purpose,rules,registry}) -> Issue[]`；`hash(data) -> Promise<string>`；`encode(data) -> Result<string>` |
| LegacyImporter | tools/migrate_levels.mjs + 共享迁移函数 | `migrateLegacy(input) -> Result<{draft,warnings}>`；不覆盖旧文件，不继承 verified |
| ContentRepository | js/content-repository.js | `saveDraft({draftId,data,expectedRevision})`；`loadDraft(draftId)`；`publish({draftId,expectedRevision,receipt})`；`getPublished(levelId,hash)`；`listEligible({difficulty,rules})`；`importLevel(json)`，均返回 Promise<Result> |
| EntityRegistry | js/entities/base.js 或独立 registry | `get(type)` 返回参数描述、场景权限、create；`create(record,{world,floor,config})` 创建实例；不含编辑器 DOM |
| TowerPlanner | js/tower.js 逐步替换 | `build({profile,seed,candidates,fixedLevels,fallback,rules}) -> Result<TowerManifest>`；纯函数，不自行读取浏览器存储 |
| World | js/world.js | `assemble(manifest,templates)`；`toWorld(floorId,localPx)`；`toLocal(...)`；`queryCollision(aabb,previousAabb)`；`commitCrossing(player) -> FloorEntered|null`；`stepAmbient(dt)`；`dispose()` |
| GameSession | js/session.js | `create({manifest,templates,rules,mode,profile,assets})`；`step(fixedDt,actions)`；`pause(reason)`；`resume()`；`snapshot()`；`drainEvents()`；`dispose()` |
| PlaytestBridge | js/playtest.js 逐步替换 | `start({draftId,revision,contentHash,data,profileId}) -> sessionId`；`acceptResult(result,currentDraft) -> Result<Receipt>` |
| PlatformAdapter | js/platform/（安卓卡再建） | 导入文件、导出文件、生命周期转为平台无关消息；不实现战斗 |

`purpose` 为 draft/play/publish：draft 只要求可解析、数据类型安全、容量合理，不要求关卡完整；play 要完整接口、资源/对象可运行；publish 再要求普通池/认证约束。decode 对未来 schemaVersion 返回 UNSUPPORTED_SCHEMA，并保留用户原文件，不能降级删除字段再保存。

2026-10-31 接口澄清：encode 无 I/O，采纳同步 Result 签名；Repository 仍为异步事务。encode 与 decode 都拒绝不支持的 schema，最终导出必须在自身导入容量内；未知 JSON 内容不得因字段投影而无提示丢失。认证与当前 rules 的版本/指纹先分别验证为非空合法字符串，再比较，不能让两个缺失字段被视为匹配。这些边界已由 T01-R 修复并通过独立复验。

2026-10-31 T01-R 实施结果（已独立复验）：

- **未知内容保留**：顶层、objects、paths、路径点、size / terrain / visuals、装饰里的未知字段原样保留并参与 `contentHash`；规范化只补契约字段的默认值，不删除未知内容。hash、encode、decode 共用同一个内容投影，`encode` 还会把写出的文本回读一遍，保证“保存的草稿能按同一契约重开”。
- **schema 双端拒绝**：`encode` 与 `decode` 都只接受 `schemaVersion=2`，其他值返回 `UNSUPPORTED_SCHEMA`，不允许隐式降级或升级。
- **导出容量**：`encode` 按最终文本的真实 UTF-8 字节数检查 `DATA_LIMITS.MAX_IMPORT_BYTES`，超限返回 `LIMIT_EXCEEDED`，不产生“保存成功但打不开”的文件。
- **断路径引用**：`draft` 用途下是 warning（保留引用，标为待修复，允许保存备份）；`play` / `publish` 是 error。
- **认证门槛**：认证里的 `rulesVersion` / `rulesFingerprint` 与传入的当前规则分别验证为非空字符串后再比较；缺失、空串、类型不符都返回 `RULES_MISMATCH`。`completedAt` 必须是带时区的 ISO8601（允许 1～3 位小数秒）。
- **迁移路径安全**：`migrate_levels.mjs` 先规划后写入；写入前检查输入/输出/报告的真实路径（含 Windows 大小写与符号链接别名）、输出 id 归一化碰撞、输出落在源文件上、报告落在源/输出上；内容不同的既有输出默认报冲突，`--force` 才覆盖。规划失败不写文件；执行阶段 I/O 失败可能留下部分新输出，不是多文件原子事务。报告必须放在输入目录之外且父目录预先存在；父目录准备为非阻塞维护项 N01。

上述行为由 `tools/test_leveldata.mjs` 与 `tools/test_t01r.mjs` 覆盖；修复前的复现记录保留在 `docs/checks/review-2026-10-31-probes.json`，修复后的对照在 `docs/checks/T01R-fix-report.md`。

2026-10-31 T02A 编辑器接入：`EditorModel.data` 是完整 LevelData 的唯一真值（旧的字符 `cells` 已删除，字符只在画笔边界转换）；编辑器打开/导出分别调用 `LevelCodec.decode/encode`，旧 TXT/旧 JSON 只走 `LegacyImport`；编辑后立即清空 `contentHash` 与 `certification`。缩小时先用 `resizeImpact` 统计会丢失的地形/对象/路径/出生点/装饰，确认后才提交且可撤销；向左/上扩展把地形、对象、路径点、出生点、装饰与 `ports.entry/exit.col` 一起平移，**不改写 `extensions.legacy` 中记录的原文件坐标**。旧出口 G 只作为迁移信息显示，不能作为画笔生成新接口。编辑器不写 `levels/`、不改旧浏览器关卡池；导出只发起浏览器下载。`decode` 的 size/terrain 与传入对象不共享引用，调用方数据不会被模型编辑改坏。草稿仓库（IndexedDB）、正式试玩与发布仍留 T02B/T03/T06。

2026-11-01 T02A-R 补充：

- 普通机关画笔在同一格重复覆盖是幂等的：同类型保留原对象（id/参数/未知字段不变），换类型才明确覆盖并可撤销；矩形/油漆桶/多格笔刷同规则。显式 `placeObject` 仍表示“创建一条对象记录”，是否允许自动叠放留待对象工具决定。
- 结构错误（含缺 `ports.entry/exit`、非法 col、size 与地形不一致、非法地块等）的导入不产生可提交模型，界面保留原图、历史与 dirty；warning 级草稿（ports=null、未知对象、断引用）仍可打开。
- 缩图影响包含接口开口（`PORT.openingCols`）。确认有损缩图时，把原 `ports` 完整追加到 **`extensions.retiredPorts`**，再置 `ports=null`；不夹取 col、不覆盖已有记录。记录形状：`{source:'editor-resize', profile, ports:<原 ports>, before:{cols,rows}}`。该键属于 `extensions`（进入内容 hash、随文件往返），不是运行状态；修复入口留 T04。撤销会连同记录一起还原。

2026-11-04 B1 补充：

- **缩图提交**：有损缩图先在完整候选副本上改尺寸/追加退役记录/清派生字段，再走共享 `encode`；候选不能序列化就整体失败（容量不足 `LIMIT_EXCEEDED`），原 LevelData、端口、extensions、历史、dirty、视角都不变。`changeSize` 先预演后 `pushUndo`。
- **草稿仓库**：`ContentRepository` 使用 IndexedDB（`ra_drafts`）为主，无 IndexedDB 时内存兜底并明确 `persistent=false`。`saveDraft(draftId,data,expectedRevision)` 先按 draft 用途校验、encode 成规范 JSON，保存**发起时快照**；`revision` 由适配器原子递增，`expectedRevision` 不匹配返回 `CONFLICT`，存储失败返回 `STORAGE_FAILED`，两者都不清 dirty、不覆盖旧记录。`listDrafts/loadDraft/deleteDraft` 同样返回显式 Result。浏览器刷新后可从列表恢复；草稿不写入 `levels/`。
- **GameSession/World（B1 子集）**：`GameSession.create({floors})` 对每层跑 `validate(play)`，拒绝结构错误；固定 `1/60` 步、最多 5 步/帧，暂停不推进、恢复不追算。`World` 按 `next.origin.x = cur.origin.x + (cur.exit.col - next.entry.col) * TS`、`next.origin.y = cur.origin.y - next.rows * TS` 对齐接口，并整体平移到 x≥0。同一 `Player` 跨层只切换 `FloorView`，不重建；脚底过线且身体完全在开口内才提交一次；底边是防回落的单向梯板；顶层无下一层时开口不放行。进入第 n+1 层时第 n 层变 snapshot、第 n+2 层变 preview，第 n−1 层释放；preview 只累计 `previewTime` 并跑非攻击环境运动，`activeTime` 保持 0。
- **开发样例**：`levels/dev/floor-a.json`、`floor-b.json` 是开发模式数据，未认证、不进 `levels/levels.js`/正式池；`js/dev-samples.js` 由 `tools/sync_dev_levels.mjs` 生成。编辑器「开发试玩」按 play 校验当前草稿、保存草稿后把"当前层 + 样例 B"交给 `devplay.html`；直接打开 devplay 用 A+B。
- 异步草稿操作（B1-R1）：编辑器以 `workspaceToken` 标识当前工作区（newLevel/replaceModel 递增），保存发起时捕获令牌、draftId、expectedRevision 与快照 hash；旧回包可完成旧草稿写入，但令牌不匹配时不更新当前图的 draftId/revision/dirty。试玩保存后若令牌/dirty/hash 变化则取消导航，handoff 使用刚保存的规范快照并再次 play 校验。打开草稿用请求序号 + 起始 hash + 令牌核对，过期回包不替换当前工作；两个读取乱序时只有最新请求生效。
- B2 已实现伤害/光环/六类对象/休整/两阶段 Boss/接口编辑/标准认证/本地发布与抽选；安卓、40 层、完整美术仍未实现。

2026-11-06 B2 实现补充：

- **规则**：交付代码 `RA.RULES.rulesVersion=b2-2`；改行为需升版本并更新 fingerprint。`run-v1` 开局技能可用；标准 `standard-v1` 初始无活动光环、初始冷却 20 秒、无休整，CD 后 `allowSkill:true` 可正常施放；页面 K 接同一 Session。旧 b2-1 认证因版本升级失效,需重新实际通关。
- **RunState**：会话唯一可变真值,含 hp/maxHp、invulnerableRemaining、haloActiveRemaining/haloCooldownRemaining/castId、visited/claimedRest、elapsed、status(running/dead/won);Player 不另存生命/冷却。事件带 runId + 单调 sequence。
- **伤害/死亡**：同一模拟步最多一次受伤;1 秒无敌;hp≤0 死亡;异常越界(掉出当前层/横向越界)判死亡并记录 `outOfBounds`;死亡/中断不再无伤 respawn,页面回大厅/重试同一 manifest。死亡优先于胜利。
- **光环**：K 施放,14 秒/从施放起 20 秒冷却;跨层保留、暂停冻结;命中 Boss 消耗本次光环但不重置冷却;一次 castId 最多打掉一个阶段;preview 不参与。
- **六类对象**：spring/crumble_door/blink_platform/fireball_static/spike/gear 由注册参数驱动实际行为;门/浮石/地刺底座进入动态碰撞,火球/齿轮/地刺伸出按活动层伤害权限;preview 只跑非攻击运动;模板只读、每实例独立。
- **Boss**：shielded(12/8s) → exposed(停攻、清伤害物、保持到命中) → resolving → 下一阶段/defeated;三种轮换攻击有预警;出口击败前关闭。
- **短塔**：`short-v1` 固定大厅/休整/Boss + 3 个已认证 normal;TowerPlanner 纯函数,按 levelId+contentHash 引用不可变内容,候选不足允许重复;开发短塔使用未认证模板。
- **发布**：ContentRepository `publish({draftId,expectedRevision,receipt})` 在同一流程重读草稿,校验 revision/contentHash/rules/回执与 publish 校验;写入不可变 published 记录,同 id+hash 幂等,同 id 新 hash 保留旧版本,失败旧池不变。`listEligible({difficulty,rules})` 只返回已发布且认证匹配的 normal;本地浏览器存储,不是服务器发布。
- **标准试玩**：standard-v1 handoff 绑定 draftId/revision/contentHash/rules;页面生成入口支撑 + 作者层 + 生成出口,真实过线后才把 certification(绑定 hash/rules/profile/revision/source=local-playtest)写回草稿;不自动发布;debug/开发短塔不生成认证。
- **编辑器工具**：接口 col、六类对象参数、路径点/loop/pingpong、引用保护;删除被引用路径被拒绝;所有编辑进入整份 LevelData 撤销;未知内容仍保真但阻止 play/publish。
- **页面**：short.html/standard.html 通过适配器提供键盘/画布/HUD;不单独结算伤害/Boss/胜利。
- **事件**：floorEntered、playerDamaged、skillCast、fireballDestroyed、bossEntered、bossPhaseChanged、haloHitBoss、restHealed、dead、won、outOfBounds 等;仍保留 paused/resumed。

2026-11-06 B2-R1 已实现契约（原独立验收发现，见 [B2-R1 记录](../checks/B2-R1-2026-11-06.md)）：

- **坐标输入/输出**：模板 row/col/path.points 是局部格；实例 rx/ry 是局部像素；Player x/y/feet 是世界像素。World/FloorInstance 在统一边界转换，碰撞/接触/伤害/恢复占位/渲染不得直接比较两种坐标，也不得把 origin 累加写回局部数据。`objectBox` 类 helper 的名称或注释应声明返回坐标，调整时同步所有调用方。
- **接触结果**：门在物理解碰撞后仍能识别四方向接触，本局 broken 后显示与实心一起移除；浮石 warning 期间承重、计时不因持续站立重置，gone 期间可穿过；占位时延后恢复。默认预警/消失 0.5/1.6 秒来自共享注册参数。相同规则应在原点与非零原点上层成立。
- **标准配置**：standard-v1 初始 activeRemaining=0、cooldownRemaining=20，正常技能权限保留；页面只转交动作与渲染，同一 GameSession 结算。修复后规则版本/指纹变化使旧认证不再适用于当前发布/抽选，保留旧草稿与内容，不自动重认证。
- **默认入口**：`index.html` 只做同目录自动进入 `short.html` 的入口；旧原型完整保存在 `legacy.html`，明确标注历史。编辑器/devplay 返回路径落到当前短塔。
- **未实现**：安卓、40 层、遗物/NPC/联网、完整美术;旧 floor09/floor11 诊断仍在。

2026-11-06 B3 平台边界：

- **ActionInput**：`setHeld(sourceId,action,down)`、`press(action)`、`releaseSource(sourceId)`、`clearAll()`、`consume()`。held 返回 `{left,right,jumpHeld}`，左右同时按住抵消；pressed 只含 skill/interact/pause，一次 consume 清空。sourceId 区分键盘键与 pointerId，不因一个来源释放误放其他来源。
- **Session 连接**：页面每步把 held 交 `session.setActions`，pressed.skill 交 `pressSkill`；交互仅预留入口。暂停由页面/生命周期适配。一次 touch 的 skill 只产生一个 press 边沿。
- **ControlLayout**：`{schemaVersion:1,buttons:{left|right|jump|skill:{x,y,size}}}`，x/y 为安全区域内归一化中心，size 为短边比例；`resolve` 夹回可见范围。存储失败返回 `LAYOUT_SAVE_FAILED`，页面保留旧值，不冒充保存。
- **PlatformLifecycle**：平台事件转 background/foreground/back，订阅可 dispose；后台先 clearAll 再暂停；前台仍暂停；back 由页面按面板→暂停→退出处理，不重建 Session、不补现实时间。
- **PlatformFiles**：`pickJSON()` 返回 name/text 或 CANCELLED；`exportJSON` 返回 download-started / written / share-opened。Web 下载不声称写入磁盘；Android 写入 Documents 才报 written，Share 打开只附 shareOpened。
- **导入边界**：`ContentRepository.importLevel(text,{rules})` 先 decode + draft 校验/编码/hash，保存不可自动发布的保真草稿；play/publish 校验单独决定 `runnable`/`eligible`，未知对象/参数/断引用/ports=null 原样保留但返回明确 issues，不能运行/入池；坏 JSON/结构错误/容量/schema 拒绝。认证需 profile/hash/rules/发布校验完整匹配；同 hash 当前有效声明可原子更新旧/坏声明，旧/无效声明不能覆盖有效认证，返回实际 revision/eligible。`publishImported` 需用户明确操作，记录 source=imported-declaration，不生成 local-playtest 回执。取消/失败不改池。
- **离线包**：`tools/build_android_www.mjs` 仅复制 short 页面脚本、levels.js、levels/b2、assets；不包含 editor/tests/docs/legacy。Capacitor webDir=www，本地资源，不依赖远端 URL。
- **平台壳**：Capacitor 7.6.10、App/Filesystem/Share 锁版本；核心模块不 import Capacitor/DOM 文件选择；平台 bridge 是单独 esbuild bundle。
- **未完成**：真机安装/文件选择/分享/性能、正式签名；PC 标准人工认证/发布/正式抽选。安卓交付是 debug 包，不是商店发布。

2026-11-06 B3-R2 页面视口约定：

- **布局不依赖单一现代 CSS**：app/wrap/菜单/暂停/结果/设置/旋转提示都先写显式 top/right/bottom/left 与宽高，再增强安全区；不得只依赖 `inset`、`aspect-ratio`、`min()`。
- **确定展示区域**：平台层从 `innerWidth/innerHeight` 计算 16:9 的 px wrap 并居中；canvas CSS 保持 100%，backing store 由 wrap CSS 尺寸 × DPR 单独设置，写入画布像素不反向撑大容器。
- **短屏/滚动**：菜单/暂停/结果/设置 box 有 max-height/overflow，关键主操作（开始、关闭、保存、继续）可达；极短屏可压缩字号/间距，不允许 overflow:hidden 永久裁掉按钮。
- **状态一致**：菜单、设置、暂停、结果由同一可见状态规则控制；打开布局暂停但关闭后回到暂停/菜单，清输入、不自动恢复。
- **错误可见**：初始化异常显示 fatal overlay 与文本；`RA.short.diagnostics()` 暴露视口、wrap/canvas/menu/settings rect、DPR、session 状态，不把 DOM/UA 加进 GameSession。
- **真机差异**：浏览器视口/DPR 模拟与故障注入不等于 OPD2101/Android 11 WebView 结果；缺真机记录必须写待验。
- **APK**：离线 www 同步后再构建；新版本递增并保留旧包/哈希。修复不改变玩法规则或认证。

Entity 的行为接口：`stepAmbient(dt,context)` 处理非攻击运动；`stepActive(dt,context)` 处理当前层攻击；`draw(...)` 不修改玩法状态；`dispose()` 清除自身计时/资源引用。preview 不调用 active；retired 不调用二者。接触伤害也必须经过 active 权限，而非直接在 draw/player 碰撞中扣血。

2026-11-06 B1 验收补充（B1-R1 待修要求，并非已实现）：编辑器异步操作需绑定发起时工作区与内容快照。保存晚回包只能更新原工作区的 draftId/revision，不能把新建/导入/打开的另一张图绑定回旧草稿；读取晚回包不能覆盖请求之后的新工作或更新的打开选择。开发试玩校验、持久保存与 handoff 必须针对同一份内容；自动保存期间变更则留在编辑器保留工作并提示重试，或在交接期间完整阻止冲突输入。Repository 的快照/revision/Result 契约不变，由编辑器负责工作区回包一致性；不引入第二份可编辑真值。

Actions：`leftHeld,rightHeld,jumpHeld,jumpPressed,skillPressed,interactPressed,pausePressed`。键盘与触控共用；外壳每个模拟步仅消费一次 pressed。旧 Player 通过适配读取 held，不改变其跳跃缓冲语义。

事件至少包括 `floorEntered, playerDamaged, playerDied, skillCast, bossExposed, bossPhaseEnded, sessionWon, playtestPassed`；事件有 runId 和递增 sequence。同一事件不得因 UI 重绘再次结算。模式为 run/playtest/debug；debug 不能出认证回执。

普通敌人的死亡、Boss 伤害体清理等通过实例 ID/castId/ownerId 管理，不依赖当前画面上是否能看到对象。

## 6. 存储、保存与错误

Repository 提案使用 IndexedDB 存草稿与发布版本，内置内容只读。存储不可用时可以继续内存编辑与导出，但必须显示“未持久保存”，不能用 false 返回值伪装成功。不得在保存过程中悄悄改写磁盘 levels/。

- draftId 是本地草稿身份，revision 单调递增。saveDraft 成功后 UI 才更新“草稿已保存”；expectedRevision 冲突返回 CONFLICT，避免多窗口覆盖。
- publish 重新读取指定 revision，检查 hash 和回执一致，在一个事务中写不可变发布版本与池索引。任何一步失败不改变旧池。相同 id+hash 幂等；同 id 新 hash 保留旧版本，当前默认版只在成功发布后更新。
- 草稿另存文件和发布分开。文件选择取消返回 CANCELLED，不改变 dirty/发布状态；浏览器下载只能报告“已发起导出”，不能声称用户已把文件放进 levels/。
- 外部已认证 JSON 在完整检查后以 imported-declaration 发布；未认证内容仅导入草稿。相同 id 不同内容导入为并存版本，是否设为默认要有明确操作，不静默替换旧塔引用。
- 本局开局取不可变模板快照，随后编辑器发布不影响正在玩的塔。

推荐错误码：INVALID_JSON、UNSUPPORTED_SCHEMA、INVALID_FIELD、LIMIT_EXCEEDED、UNKNOWN_ENTITY、UNKNOWN_PARAM、BROKEN_REFERENCE、INVALID_PORT、MISSING_ASSET、HASH_MISMATCH、CERT_REQUIRED、RULES_MISMATCH、STALE_PLAYTEST、CONFLICT、STORAGE_UNAVAILABLE、STORAGE_WRITE_FAILED、CANCELLED、MISSING_CONTENT_VERSION。

## 7. 旧数据迁移与兼容边界

1. 旧 JSON/TXT 只读导入，保留完整原件与警告。地形字符转为整数网格，S/x/y 转对象，P 记录旧出生点，G 记录旧出口位置到 extensions.legacy。
2. 保存 difficulty 与 sky 等已有信息；缺失参数按注册默认补全并记录迁移说明。未知对象完整保留，禁止试玩/发布直到支持或作者显式删除。
3. 所有旧 verified 标记清除，certification=null。旧地图入口/出口不符合规范时 ports=null，进入待修复草稿；不能自动贴个合格标签。
4. 旧数据浏览器键只读取迁移，不清空旧键；新增仓库使用独立版本化命名。失败可退回旧程序。
5. 新运行路径与编辑器统一后停止写旧 TXT；旧读取适配只留在迁移边界。levels/levels.js 的生成工具和所有加载入口一起更新，避免网页读新格式、工具读旧格式。

## 8. 最低契约测试

- 含两对象、一条路线、难度 3、视觉信息和 extensions 的草稿，编辑地形后保存重开，各字段完整保留。
- 未知类型可保留草稿，但 play/publish 失败；引用不存在的 pathId 有明确路径错误。
- 不同键顺序的同一 JSON 得到相同 hash；改一格、一个参数、规则版本都使旧认证失效。
- 测试开始后改图、两个窗口保存冲突、旧试玩晚回传均不能发布错误版本。
- 保存失败/取消/存储不足不改旧发布池；相同 id 不同 hash 不破坏旧清单。
- 相同模板两次实例化，门、移动进度和领取记录互不影响。
- 正式/试玩使用相同输入与初始状态时，模拟得到相同位置、伤害和冷却结果。

## 9. B2 实施边界（工程已交付，人工发布待验）

B1/B1-R1、B2-R1 已通过工程验收，用户短塔游玩基本正常；标准认证/发布/正式实抽人工未测，不能声称已通过。见 [本轮复验](../checks/review-B2R1-2026-11-06.md)、[PC 短塔批次卡](../tasks/10-b2-pc-short-tower.md)。沿用本文件的 LevelData/Certification/TowerManifest/RunState，不新增另一套格式。GameSession 的正式短塔、debug 与 standard 共用核心，保留 floors 开发适配，不复制模拟。

发布接口按本文件既有建议实施：`publish({draftId,expectedRevision,receipt})` 在事务中重新核对草稿与回执，再写不可变内容版本和池索引。未认证、debug、旧回执或未知内容不可入池；无候选时报明确空池，不以旧池/开发草稿兜底。RunState 的生命/冷却/技能只保留一份会话真值，实际对象行为必须与注册参数共用，旧层 snapshot 不再保留活实体。

异常越界判死亡回大厅、同塔重试已由 B2 实现：重试重置 runId 与可变本局状态、沿用精确内容版本的 manifest；只有显式重构才重新规划。

## 10. B3 平台边界（0.3.2 工程与本轮人工验收通过）

完整拟定签名、错误结果与检查见 [B3 卡](../tasks/12-b3-android-short-tower.md)。平台包装、DOM/原生文件与生命周期只放适配层，核心 GameSession/World/Codec/Repository 不依赖 Capacitor。模板、认证、本局与设置各自独立，沿用 Result，不自造手机版关卡格式。

2026-11-06：[B3-R1](../tasks/13-b3-review-fixes.md) 三项与 [B3-R2](../tasks/14-b3-android-viewport-fix.md) 启动修复已通过本轮工程/人工验收；真实认证文件往返与 PC 制作发布专项仍待补。以下仍是行为契约，不能把总体人工通过扩写为未执行的逐项结果。用户提出隐藏摇杆 Q05，明确之后再改；当前 ControlLayout schemaVersion 1、左右按钮和语义输入接口保持现有实现，后续输入方案另行细化。

- **ActionInput**：以键码/pointerId 标识每个来源；held 合并、pressed 一次消费，释放单来源不取消其他来源。连接现有 setActions/pressSkill/pressInteract；后台、取消、失焦 clearAll 后暂停，恢复等待用户继续，不重建会话、不追算。
- **PlatformFiles**：pickJSON 返回 `{name,text}`；取消返回 CANCELLED。exportJSON 返回 written 或 share-opened 等真实状态，只在已确认写入目的地时称已保存；分享面板打开不等于完成导出。
- **内容导入**：共享 decode/validate/hash 后保存；未知内容保真但不运行/发布；旧规则认证不入池。兼容已认证文件记录 imported-declaration，明确加入池后才可抽，不能伪造本地试玩回执。失败旧池不变，已开始 manifest 不变；同 id+hash 幂等、不同 hash 并存。
- **ControlLayout**：`{schemaVersion:1,buttons:{[action]:{x,y,size}}}`；中心坐标按安全区归一化、尺寸按参考短边比例，显示时约束在安全区；独立存储，失败不报保存成功、不改模板或 RunState。
- **证据**：PC 标准认证发布人工待补；安卓正式内容/认证文件往返验收前要有真实样本。桌面/Node 不能证明系统文件流程、真机触控或性能；没有 APK/设备结果时不写成安卓交付完成。

B3-R1 补充：按钮层同样按 pointerId 保存/释放来源，不能在 ActionInput 多来源正确时用一个按钮 source 变量丢失身份；导入对最终持久化记录核定 revision/eligible，旧认证更新需完整规则匹配与 revision 保护；草稿保存按 draft 门槛保真，play/publish 校验单独决定可选性。错误或冲突不能显示已保存有效认证，未知内容不能因不能运行而被拒绝保真留存。

### 10.1 B3-R2 页面视口约定（行为已落地，参考结构不改存档）

页面层测量可用视口并应用布局；可拆私有 `measureViewport()` / `applyViewport(metrics)`，名称可按现有结构调整，核心 GameSession 不接收 DOM/UA。建议临时结构如下，仅为显示度量，不序列化到关卡、本局或 ControlLayout：

```js
ViewportMetrics = {
  cssWidth, cssHeight, dpr,
  safeInsets: { top, right, bottom, left },
  playRect: { x, y, width, height },
  bufferWidth, bufferHeight
}
```

除 bufferWidth/bufferHeight 是整数设备像素，其余尺寸均为 CSS px。可用视口来源须一致，visualViewport 或安全区不可用时有明确回退；playRect 非零、位于扣除安全区域后的可用范围并保持 16:9（允许像素舍入）。canvas CSS 尺寸从 playRect 得到，缓冲大小为各边乘 DPR 后取整，禁止用缓冲大小反推/撑大容器。现有渲染的 CSS 像素坐标约定不因该修复改动，世界坐标仍只由 World 管理。

菜单/暂停/结果/布局覆盖层必须有确定定位区域，短屏内容可内部滚动，主操作能在可见区域实际点到；缺少 inset/aspect-ratio/min/env 支持仍有基础布局。触控 resolve 使用实际 host 的 CSS rect，指针与该 rect 同一坐标空间，只转换一次；旧 schemaVersion 1 布局继续加载并约束到当前区域。尺寸或前后台变化只重布局，不重建玩家/会话、不推进模拟计时、不改模板/认证。页面初始化错误可见并能取得诊断；功能不受支持与实际异常分开记录，不能黑屏后误报运行成功。
