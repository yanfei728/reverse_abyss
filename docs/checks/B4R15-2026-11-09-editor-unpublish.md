# 31号卡实施记录：编辑器显示、路径删除与单版本下架

2026-11-09。只实施31号卡及必要接线，保留工作区R7–R14未提交内容，未提交/推送。b4-10 / schema2 / DBv3不变；只PC，没有新APK。

## 实际改动

- `js/editor.js`：`flailHead`返回的本图像素经`cellToScreen`转换一次，按锚点、链、头包络判断是否可见。正式/试玩轨道、速度、伤害、素材未改。
- 模型集中经`removeObjectsWhere`移除实际删除对象，只删除这些对象原先引用、且无任何剩余对象引用的路径。ID、同格、区域、替换/地形、出生点和尺寸分支复用；未知类型的引用、旧孤立路径及扩展字段保留。已有整图撤销一次恢复对象和路线；空擦除不改dirty/hash/撤销重做历史。
- `js/content-repository.js`：新增`listPublishedVersions()`与`unpublish({levelId,contentHash})`，Memory/IndexedDB返回一致Result及`removed`。列表包含当前epoch中不合格的发布记录；下架验证精确身份，只开published读写事务，读取存在性后精确delete，**oncomplete才成功**。abort、同步异常返回失败；重复删除返回removed=false。下架本身不准备/重置epoch，不写metadata。
- `index.html`、`js/short.js`：设置新增版本列表、完整身份/内置来源说明、移出按钮和刷新入口。真实确认框取消无变化；异步捕获点击身份、等待禁重复、不乐观删列表；失败保留选择。成功刷新列表和候选数量；设置重开也使用当前池数量，不被旧塔统计覆盖。内置重复来源仍在时明确提示移出normal源JSON并sync/刷新/新开。
- 增量同步`www/index.html`、`www/js/short.js`、`www/js/content-repository.js`，没有清理/重建整个www、没有Android构建。未新增脚本依赖。
- 更新README、PROJECT、STATUS、AGENTS、31任务/设计、任务索引、接口说明及levels移除操作说明。没有下一轮任务提示词或范围扩展。

## 本轮实际检查

| 命令 | 结果 |
|---|---|
| `node --check js/editor.js` / `js/content-repository.js` / `js/short.js` | 退出0 |
| `node docs/checks/review-B4R14-2026-11-09-editor.mjs docs/checks/31-editor-model-draw.json` | 退出0；3个锤场景偏差0，离屏头绘制；gear/moving各ID/橡皮删除均objects0、paths0 |
| `node tools/test_31_editor_unpublish.mjs` | 34 PASS / 0 FAIL，退出0 |
| `node tools/browser_31_editor_unpublish.mjs` | 37 PASS / 0 FAIL，退出0；Chrome156隔离profile |
| `node tools/test_editor.mjs` | 266 PASS / 0 FAIL，退出0 |
| `node tools/test_editor_gestures.mjs` | 13 PASS / 0 FAIL，退出0 |
| `node tools/test_30_coins_archer_score.mjs` | 95 PASS / 0 FAIL，退出0 |
| `node tools/test_full40.mjs` | 98 PASS / 0 FAIL，退出0 |

定向模型覆盖：单点/往返/闭合路径，最后引用、同格未知对象保留共享引用，旧孤立/未知路径字段，区域/替换/尺寸删除，撤销/重做/编码重开，无操作删除，Memory失败/异常/重复删除，同id两个hash隔离，新候选与旧manifest。

真实Chrome覆盖：鼠标放锤、滚轮/平移、路径画点/右键完成、橡皮/撤销/重做、保存重开、空擦除不改dirty/history；设置确认取消，真实IDB的delete请求成功后主动abort（目标仍在、无提前成功），等待时切选择仍删除捕获的原hash，重复下架，新连接读取持久结果，草稿/通过声明和其它localStorage不变，原塔重试保留删除前版本，新局排除纯browser版本，内置同id/hash副本仍在候选且说明准确。

浏览器首次在沙箱中未启动DevTools，随后使用获准的隔离Chrome进程完成检查。测试脚本初稿的短按未跨动画帧、暂停返回选择器及Planner来源字段断言已修正；未为测试恢复旧产品行为。最终结果见下列JSON。

## 证据和限制

- [最终编码/依赖审计](31-final-audit.json)：19份文件UTF-8无BOM/无替换字符、38脚本依赖齐全、www对应脚本字节一致；git diff --check退出0。
- [模型与绘制探针](31-editor-model-draw.json)、[定向结果](31-targeted.json)、[浏览器结果](browser-31-editor-unpublish.json)。旧R14报告/confirmed证据保留。
- 已目视检查[非零位置流星锤](31-editor-flail.png)、[离屏锚点](31-editor-flail-offscreen.png)、[内置重复版本移出提示](31-unpublish-builtin-remains.png)。另有[缩放/平移](31-editor-flail-zoom-pan.png)、[齿轮路线](31-editor-gear-path.png)、[火球路线](31-editor-fireball_moving-path.png)、[保存重开](31-editor-reopened.png)、[事务回滚失败提示](31-unpublish-aborted.png)。
- 这些是脚本化真实浏览器和渲染证据，不是作者真人验收。合成passed声明只在临时隔离profile和内存fixture；没有写作者库/认证/普通图/catalog，未删除作者磁盘JSON，没有改种子或最高分生产数据。
- 未测：作者真实库操作、真人最短步骤、磁盘源移出后sync（不触碰作者normal）、多标签竞争、真实容量不足/断电、完整test_all、真人41层、Android/性能。真实事务abort已测，不把它描述成覆盖所有设备存储故障。

作者只需按最短流程确认：非零位置放锤并缩放平移 → 齿轮/移动火球画路径后擦除、一次撤销/重做、保存重开 → 设置移出指定浏览器版本并确认草稿仍在。有内置同版本时按提示移出源JSON并同步，刷新后新开塔；重试原塔保留旧清单是正确行为。无需重走41层。
