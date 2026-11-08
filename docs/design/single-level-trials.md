# 编辑器单关试玩：模式、结束边界与标记输入

日期：2026-11-08；状态：**历史方案，已被用户本轮确认及21号卡替代**。下文三层支撑/石管/共用塔Session方案由规划提出，现已撤回；不要继续实施。当前契约为 [独立单关试玩](independent-level-trials.md)，任务见 [21号卡](../tasks/21-independent-level-trial.md)，验收见 [B4-R4](../checks/review-B4R4-2026-11-08.md)。仅保留下文供解释20号卡交付来源；标记自动云板/消费输入规则仍保留。

## 1. 先把入口分清

| 入口 | 当前实现核对 | 本轮目标 |
|---|---|---|
| editor“开发试玩”→devplay.html | template后接B4_SAMPLES.normal2/normal3；页面只有连续换层，没有win/结果态 | 只试当前模板；通过其真实出口连接立即完成，禁止进入另一正常关卡；不写认证 |
| editor“标准试玩”→standard.html | 自生成entry→template→exit；已有进入index2后win及hash/revision认证写回保护 | 同一单关几何与完成事件，保留standard-v1及认证保护，不拿它替代开发试玩的验证 |
| short.html开发/正式短塔 | 六图清单，直到Boss击败胜利；正常跨层继续 | 保留，绝不能套用单关一过线就结束 |
| play.html/legacy.html/旧playtest.js | 历史原型/TXT入口 | 不作为当前编辑器试玩回退，不从它们恢复旧逻辑 |

已确认的用户问题来自可复现的开发试玩链：编辑器实际handoff的next.id=author_test_2，等于作者第二图；真实devplay动画在越线后仍status=running，一秒后继续计时。不是齿轮路径采样错误，也不是仅靠更新资源缓存就能修。

标准试玩源码确有结束/认证流程，本轮没有通过自动化伪造标准成功；不能因为开发入口坏了就移除标准认证，或把开发通过记成标准passed。

## 2. 单关几何与结束契约

两个编辑器试玩都只包含：**生成的安全入口支撑→当前模板→生成的最小出口支撑**。支撑只用于验证与真实塔相同的两格云板/2×3石管，不是可继续探索的下一关；不得取作者test1/2/3、休整或Boss充当支撑。HUD按“入口准备/当前关卡/完成”显示，不把出口支撑标成另一张可玩测试关。

沿用真实移动：从入口穿入当前模板，再从finish穿管，脚底从下向上跨过出口支撑start且身体完全在2格开口内，产生合法入层事件时完成。仅到finish附近、露头、横移擦边或回落不提前完成。该边界同时验证模板的入场与出场连接；无需再爬出口支撑的顶部，也没有下一普通层。

完成检测放在**共享试玩生命周期**，可由GameSession可选trialPlan或共用控制器消费真实floorEntered事件实现。不要两页各写不同常量，也不要给所有GameSession加“进入最后层就赢”的全局规则。必须以plan指定的subject→exit-support合法转换为条件；完成最多一次，立即停止模拟/攻击/计时、清按键来源并显示结果，不能过一帧又让玩家游玩支撑。

死亡是失败，不转换为完成；未达出口手动暂停/退出/重开都不算通过。重新试玩用同一模板快照/模式/规则创建新Run，所有完成锁和输入重置，不能顺手读最新编辑器内容或换一张样例。

开发结果：“本关试玩完成”，按钮为重新试玩/返回编辑器，不自动发布、认证、写passed。标准结果先冻结游戏，再按原hash/rules/revision验证写认证；保存中/失败要如实显示“标准试玩已通过，认证未保存”等，不能报已保存或修改发布池。返回编辑器不拿运行状态覆盖草稿。

## 3. 数据与模块接口

推荐handoff升级为version=2并显式标mode，仍使用原LevelData模板，不增加地图真值：

```js
{
  version: 2,
  kind: 'editor-single-level',
  mode: 'development',             // 或'standard'，页面需匹配
  template: /* 保存后的规范LevelData快照 */,
  subjectRef: {levelId, contentHash},
  draftRef: {draftId, revision},
  rules: {rulesVersion, rulesFingerprint},
  requestId: /* 本次发起标识 */
}
```

开发/标准分用明确的存储键/消费者（例如RA_DEVPLAY_V2与RA_STANDARD_V2），不能读另一模式或旧next字段当补救。只从template及用途生成支撑；未知/过期/模式不符handoff显示“请从编辑器重新开始”，不悄悄载入旧连续两层演示。保留旧草稿/认证，不清浏览器存储。直接打开无handoff的devplay也明确报缺数据；旧演示若保留，必须另有显式调试入口，不作为默认/失败回退。

建议纯共享模块/结构，命名可按仓库调整：

```text
TrialPlan.build(handoff) -> Result<{
  mode, profileId, rules, subjectRef,
  floors,                         // 生成支撑/原模板/生成支撑
  roles,                          // entry-support | subject | exit-support
  completion:{fromIndex,toIndex}  // 来自roles，不是页面裸写2
}>
TrialLifecycle.afterStep(session,plan,events) -> null | ResultEvent
ResultEvent:{type:'trialCompleted',runId,mode,subjectRef,rules}
```

两页面共用build/结束判断以及World的坐标/云板/石管；可保留各自轻量DOM外壳。夹具无敌人/奖励/随机内容/认证，本局状态不写模板。支持不同宽高和端点偏置，支撑与floor0固定大厅/F逻辑区分。旧vertical-v1、混合或坏结构在启动前给Result错误，不导航后黑屏。

模式参数明确：development沿用run-v1，光环初始可用；standard沿用standard-v1，100生命、无活动光环、初始剩余CD20秒，之后允许K。键盘/暂停/后台接同一GameSession语义，不能把标准试玩做成永久禁技能，也不能因合并结束逻辑让开发入口写认证。

编辑器仍先保存快照并校验workspaceToken/hash/dirty/revision后离页；手势未结束先完成或取消，保存失败/切图/发生新改动不启动。整个handoff/计划而非仅模板要验证；终点绑定实际subjectRef，不能对别的草稿写认证。标准保留当前内容hash和expectedRevision保护；若标准的有效完成边界改变，更新规则指纹。仅开发结束UI/云板画笔切换不凭空使所有认证失效。

## 4. 标记工具自动云板与输入隔离

用户新增明确要求：开始标记start/finish时自动选择现有云板(tileId=5/字符'-')，普通笔刷置安全单格；标记预览仍独立宽2高1，不受旧砖块/齿轮/填充工具或旧刷子大小影响。成功或取消后保持云板选中，用户主动选择其他素材再切回，不自动恢复旧破坏性素材。

但这不等于“标记时自动画云板”：本次左键只给已有合法两格云板写端口，非云板不能一边覆盖地形一边假装标记通过。固定场景只读、端点坐标从模型显示不变。

已复现输入缺口：beginPortMark只setTool('brush')，没有改ch；第一次paintStep提交后portMark=null，同一次左键仍按着，下一帧paintStep会落回旧砖块，云板5变砖块3、端口立刻失效。

因此必须消费此次左键直到抬起：提交一次后，持续按住/拖动都不能变成普通刷地形、放第二只齿轮、填充或制造新undo。右键/Esc取消也不应连带开始平移/涂画；取消/失败不改地形/hash/dirty。活动手势互斥，已有齿轮路径先完成/取消，不在切标记时无提示丢掉路线。以上是编辑器暂态，不进LevelData。

## 5. 验证范围

开发和标准各自验证启动→目标→真实出口→终止/重开；检查开发完成后再推进多帧仍无模拟/下一关/认证。标准只在合法完成事件之后走回执保存，hash/revision/rules不符或保存失败不报成功。自动化只用隔离草稿/内存数据，不能生成用户地图passed。

标记用砖块/橡皮/齿轮/填充等旧状态，屏幕按下并保持多帧、拖动再松手，确认云板高亮、地形始终不变、只一条端点撤销；再测右键/Esc、固定场景和裁后坐标。短塔六图与Boss结束方式仅回归，不改为单关；齿轮/裁剪/碰撞不从头重做，无APK。
