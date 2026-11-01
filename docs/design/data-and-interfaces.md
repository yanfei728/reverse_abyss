# 数据结构与模块接口 v1

这是待实现的技术契约，不是现有 API。设计提案依据见 [decisions.md](decisions.md)。新代码仍使用原生 JS 与 `RA`；下列类型写法仅用于说明，不要求迁移 TypeScript。

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
- spawn 的格子表示玩家脚底所在格底边：x=(col+0.5)*TS−player.w/2，feet=(row+1)*TS。标准认证生成在入口安全区，不能由作者选在出口附近跳过整关。大厅起点由固定场景指定。
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

Entity 的行为接口：`stepAmbient(dt,context)` 处理非攻击运动；`stepActive(dt,context)` 处理当前层攻击；`draw(...)` 不修改玩法状态；`dispose()` 清除自身计时/资源引用。preview 不调用 active；retired 不调用二者。接触伤害也必须经过 active 权限，而非直接在 draw/player 碰撞中扣血。

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
