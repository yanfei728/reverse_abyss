# 连续接口的碰撞与入层提交

2026-11-09，**26/B4-R10本轮验收通过关闭**，用户人工走完41层无问题，见 [独立验收](../checks/review-B4R10-2026-11-09.md)。实存连接/完整静态查询/有效边界主修复保留；N04实际pending高度判断与下文目标契约方向相反，作为非阻塞小收尾进入 [27号](../tasks/27-element-configuration-and-publishing.md)，不能把“已实现方式”的描述当作此分支已正确的证据。

## 目标与边界

角色合法上穿上层start、脚底越过其顶面后，应可靠地进入上层一次；其空间位置、逻辑current、Player楼层视图、攻击/超时时钟、下一个preview必须同步。普通层之间保持连续世界，同一Player，不传送、不重建、不改变跳跃数值/尺寸/地图。

保持0→F→1、10/30各自回血、20击败→F→21、40击败胜利。传送链接不进入普通石管提交分支。正式图仍按四档抽选，仅test3补位忽略自身难度；不重新执行发布池清空，不改schema/模板/hash/认证。编辑器/独立单图试玩仍只有原图，不生成石管或上下层。

## 判定契约

0. **规划、实存和几何查询分开。** `manifest/world.links`是全塔规划，不能因有link定义就视为加载。保留现有最多3个live实例；仅当石管两端实例均已实存时才派生该连接的运行几何。地图从实存实例绘制；石管绘制与碰撞从同一份已实存连接几何取得。未实存目标不显示悬空管道假装已加载，不能通过只隐藏空管宣称修好缺图。
1. **移动和提交采用一致的身体边界。** 共用世界坐标与同一种有效碰撞体/精度约定，不允许移动放行0.x像素、提交却按另一种边界拒绝。应先查清现有Level末端内缩1像素及云板落地探针的配合，再做最小必要适配；不能直接放大入口宽度、忽略横向条件、恢复侧穿石块。数值容差只处理浮点误差。
2. **可靠识别一次合法上穿。** 依据真实解析后的运动、相邻实例和石管关系确认目标。脚底尚在start顶面之下（即使头已在上面）不能提前入层。不能只依赖一个严格比较同时成立的单帧机会；若临界帧需要延后确认，应保留合法上穿的依据并在满足完整进入条件时提交，不让角色长期处于preview地图而current仍在下层。误入其他横向区域/从高处任意设置坐标/跌回管道不应随意增加层号。
3. **提交一次且完整。** 复用`commitNext`的唯一状态转换入口，成功后设置current/active/entered/Player.view，启用新层攻击/计时一次，创建其下一个preview。每次上穿只增一层；在start附近反复跳动不能重复事件、重复回血或重置计时。若使用pending状态，绑定本局和相邻slot/instance，提交、取消、重试、传送时正确消费/清理。
4. **预加载与快照规则不变。** n层时保留n−1地形、n活动、n+1预热；进入n+1后先保证n+2存在，再按现有规则释放n−1。不得因未出镜释放当前/即将进入的图；不得用全41层常驻隐藏漏提交。预热只运行已有非攻击行为，正式进入才启用攻击/超时。
5. **失败可诊断。** 交付证据至少包含清单ID/seed、逻辑层、实际玩家世界坐标、last floorEntered、live实例身份/状态和期望preview。可以提供只读调试快照，不强制新增面向玩家的面板；不得把错误捕获后静默继续当作修复。
6. **静态碰撞查询完整且保留类型。** FloorView的move/standingOn/blockedAt对同一世界位置，应读到同一live静态几何：自身和邻层的实心地形、tile5单向云板、已实存石管逐格tile4墙。不能继续只在`otherStaticAt`补查邻层tile1–4，也不能把云板塞进布尔solidAt当成四向实心。snapshot保留地形，preview地形可接触，但preview攻击/伤害/超时仍不能提前启用；机关对象保留已有生命周期，不在本卡扩大范围。

推荐的内部契约（命名可调整，不改持久化schema）：

```text
World.liveStoneLinks() -> 两端实例均实存的连接列表
World.queryStaticContacts(worldRect) -> Contact[]
Contact = {rect, kind:'solid'|'oneWay', source:'terrain'|'pipe',
           slot, instanceId, tileId}
```

这是18号已有真实世界查询契约的补齐，可作为现有Level碰撞解析的几何输入适配；不另写角色积分/跳跃或一套新物理。Level自行按上穿/下落处理oneWay；管壁和地图不从互不相干的集合各自决定是否存在。任一FloorView对同一live云板/管壁的接触结果应一致，不依赖Player当前恰好绑定哪张模板。

## 建议的最小实现方向

保留World负责坐标/已实存几何/换层、Level/FloorView负责移动解析、Session接收一次入层事件的边界。先补齐同一静态几何来源与已实存连接生命周期，再统一边缘选格/身体范围，让World基于真实前后位姿判断合法上穿（需要时携带prevX/prevFeet）。可用有资格约束的延后确认补临界帧；是否需要额外状态由最小修复决定，不要求搭新框架。

禁止无条件`feet < commitY`就激活、用宽松重叠替代整身通行、在任何高度自动跳层、强制吸附到管道中心、给玩家加速度/跳高、替换test3或改端点来避开复现。只预加载更多图也不够：攻击、计时、碰撞视图和快照仍会错层。

若修复触及共享碰撞范围，只针对同层云板邻石、上层start支撑、向上顶墙和向下站稳补最小回归；保留18号已验穿墙修复与试玩手感，不重写物理、不扩大编辑器范围。技术规则字段如需变更只记录条件，不能批量废掉作者既有人工通过。

## 验收证据

- 先运行现有seams探针保存修复前结果，再记录修复后同等输入：1/8/14处右移上穿成功进入2/9/15并存在3/10/16预热。探针fixture与真人路线必须区分。
- 新增missing-map探针对照HUD4：居中提交到4，再右移上穿4→5，修复后应current/view5、live4/5/6且6已加载。对同一live邻层出口云板做下落/上穿、对同一已实存石管做横移，任一相关view结果一致；无两端实存的规划链接不绘制/不产生独立幽灵碰撞。原脚本5→6在故障时是未实存连接：修复后若诊断直接采样该未实存连接，所有view都应一致无几何，而不是要求继续保留它。
- 居中/左移对照、完整身体未上穿、实心侧墙/头顶阻挡、一次上穿一次事件、下一层预热/入层激活和旧快照释放，做少量针对性引擎检查即可。不恢复几何/可达自动门槛，不做全量地图寻路。
- 可见浏览器从`index.html`确认正式模式，用真实键盘操作至少两个相邻普通接缝，含上穿时右移；记录HUD层号、角色可见、下一张图可见与实际继续上行。允许一次明确说明的fixture把角色准备到第一个接缝前，但不能用debugJumpTo/activateSlot替代接缝移动，更不能把这样的片段写成完整塔通关。
- 最终作者人工从0继续爬，关注前十层与10–20区间；确认20后F21、40终局等原流程。用户未完成的段落保留待验，不代打、不生成passed。

## 已实现方式（2026-11-09 B4-R10）

- **规划/实存**：`World.runtimeLinks` 只收两端实例都实存的石管；`liveStoneLinks()` 供绘制与碰撞。构造/`commitNext`/`transferNext`/`activateSlot` 后 `_refreshRuntimeLinks()` 重建 runtimeLinks 与下层 `wallCells`。`short.render` 不再遍历整塔规划 links。
- **同一静态几何**：`World.staticAtWorld(wx,wy,exclude)` 合并所有已实存实例的 tile1–4(solid)、tile5(oneWay)、已实存石管墙(solid)；`wallAtWorld` 只查 `runtimeLinks`。`Level.solidTileAt/onewayTileAt` + `extraSolidAt/extraOnewayAt` 让 `_hitTiles`/`blockedAt`/`standingOn` 从任一 FloorView 读到同一份几何；oneWay 保持单向，管壁保持四向实心。
- **提交**：`afterPlayerStep` 用与移动一致的 `x+w-1` 有效右缘判断开口；临界帧用 `pendingEntry` 延后确认，整身进入时走 `commitNext` 一次；脚底回落或换层/传送/跳层清 pending。`commitNext` 一次同步 current/active/Player.view/preview/旧快照。
- **证据**：seams 1/8/14 修复前 `bugReproduced=true`、修复后 false（保存 `26-before/after-seams.json`）；missing-map HUD4 修复前 current4/map6未加载/云板不接/墙不挡，修复后 current5/Player.view5/live4,5,6/6已加载（保存 `26-before/after-missing-map.json`）。Node 连续物理 1→6（`26-continuous-route.json`）；可见 Chrome 真实键盘按接缝 fixture 验证 1→2/2→3/3→4/4→5右移/5→6（`browser-26-seams-2026-11-09.json`）。**可见浏览器未自动完成整张地图连续攀爬，不能记作真人连续路线。**
