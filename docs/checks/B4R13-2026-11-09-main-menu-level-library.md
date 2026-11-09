# B4-R13 / 29号卡交付记录：正式主界面、种子文本、四档关卡库

2026-11-09。工作区在 HEAD `d41e07d` 之上，保留 B4-R7–R12 全部未提交源码/证据/地图/用户库；本轮只实施 [29号卡](../tasks/29-formal-main-menu-and-level-library.md)，不重做25–28玩法，不清 localStorage/IndexedDB，不做 APK。

## A. index 唯一正式主界面

- `index.html` 现在是实际菜单/游戏壳：上部英文 **REVERSE ABYSS**，首页只有“开始游戏”“退出游戏”，右下角“⚙ 设置”。不再自动跳 `short.html`。
- 首页不显示旧调试入口、旧关卡列表、导入/导出、镜像、可调塔高。
- `short.html`、`legacy.html`、`standard.html`、`devplay.html`、`tests/browser.html` 都改成单向跳 `index.html` 的极小兼容壳，不加载旧 `main/game/tower/standard/devplay` 控制器。
- 开始按钮走 `RA.short.startFormal(seed)` → 正式 `TowerPlanner.buildFull40`，固定 0–40 共41槽；0层出生，F→1，20后F→21，40胜利；使用当前候选，不保存塔快照。
- 暂停/结果“返回主界面”结束本局回菜单；“重试本塔”仍复用 `state.floors`/原 manifest，不重抽。
- 设置含：种子输入/当前文本、按种子重构、随机重构、保存种子文本、已保存选择、四档池只读数量、导入 JSON、打开编辑器、关闭设置；塔高只读固定。
- 退出停止 session/输入/循环并尝试 `window.close()`；关闭失败显示“请手动关闭标签页/窗口”，可回主界面。不会杀其它标签或假报已关闭。
- 输入框聚焦时游戏快捷键不触发；Esc 关闭设置（设置层）；无 M/N 镜像/塔高快捷键。

## B. 种子只保存文本

- 新 `js/seed-text.js`：`RA-` + 1–7 位 36 进制，有效数值 1..0xFFFFFFFF；0/空/非法/超范围明确拒绝，不做 `parseInt` 部分成功或 `Number(seed)||1`。
- `js/short.js` 新状态 `seedText/seedValue`，开始前读取输入/已选文本并完整解析；同 seed + 同候选稳定，池更新后允许变化；开始后 `manifest.seed` 就是所选值，不再 `Date.now()`。
- 本地专用 key `ra_seed_texts_v1` 只保存 `{version,activeSeed,savedSeeds}`，不保存 floors/模板/认证/塔快照。保存失败显示“未保存”，不把临时选择说成持久化成功。
- 重构按钮只生成/更新待开局计划状态，不创建玩家/认证；开始仍按当时池生成。

## C. levels 目录整理与同步

迁移前 [inventory](29-before-inventory.json) 53 份 JSON、8 个顶层子目录；完整 [oldPath/newPath/SHA 映射](29-migration-map.json)：**41 份移动、12 份原位不变、53/53 字节 SHA 不变、0 覆盖同名**。

```text
levels/
  normal/difficulty-1..4/   # 只放作者已通过普通图
  fixed/lobby|rest|boss.json
  fallback/test3.json
  archive/                  # 历史/测试/作者旧备份, 永不扫描
  levels.js                 # 仅 normal 四档生成
```

- `full40` 三个固定运行副本 → `fixed`；`fallback_test3` → `fallback/test3`；`authored/b2/b4/v2/dev/demo/_template` → `archive/*`；原 `archive/legacy-pool-2026-11-09` 保留；`开发示例关卡/` 原位未动。
- 更新 `sync_full40_levels`、`sync_b2/b4/dev`、测试夹具/文档引用；`build_android_www` 从 `index.html` 构建，只复制实际脚本 + `levels/levels.js` + `assets`，不再复制旧页面/旧 levels 子库。
- `tools/sync_levels.mjs` 重写：只扫 `normal/difficulty-1..4`，用共享 `LevelData` 读取检查和 `ContentRepository.certState` 人工通过判定；目录难度必须等于 JSON difficulty；无通过明确跳过；坏 JSON/坏 hash/档位错误退出1且不覆盖上一份 `levels.js`。按 JSON id/hash 识别，不要求文件名=id；同 id/hash 去重。
- `levels/levels.js` 生成 `RA.NORMAL_LEVELS`（含 `levelId/contentHash/source/path/data`）；`short.js` 将它与浏览器 published 按 `id+hash` 合并，builtin 优先、稳定排序；archive/fixed/fallback 不进入普通候选；四档每档最多9、test3补位、空池可玩的原有规则保留。
- 不再次清 poolEpoch，不自动扫描 archive/磁盘，不伪造作者 passed。

## D. 旧执行链删除/保留清单

**产品路径已移除**
- `index.html` 不再加载 `js/main.js`、`js/game.js`、`js/tower.js`、`js/levelpack.js`、`js/smoke.js`、`js/dev-samples.js`、`js/b2-samples.js`、`js/b4-samples.js`、`js/reach.js`、`js/ui.js`；`short/legacy/standard/devplay/tests/browser` 不再加载旧控制器。
- 首页不创建 `RA.Game`/`RA.Tower`，不读 `customLevels/overrides`，不提供旧关卡列表/镜像/塔高/旧池合流入口；旧设置 HTML 与按钮从产品页移除。
- `www` 构建源改为 `index.html`；不再打包旧页面/旧 levels 子目录/旧菜单。

**保留**
- 共享物理/Player/Level/实体/绘制/World/Session/TrialSession/ContentRepository/LevelData/TowerPlanner/编辑器。
- `js/main.js`、`game.js`、`tower.js`、`levelpack.js`、`smoke.js` 等旧源文件仍留在仓库，只作为历史测试/存档引用，**不被产品页或 www 加载**；依赖它们的旧浏览器脚本（browser_b2/b3/b3r2/b4/b4r1 的 `btn-dev` 路径）属于退役玩法断言，不再是29门槛，也不为绿灯恢复按钮。
- 角色朝向精灵翻转保留；关卡 `flipX` 不再有产品入口；未知历史字段保真，不清旧 localStorage/IndexedDB。

## 实际执行

| 命令 | 结果 |
|---|---|
| `node tools/test_29_menu_levels.mjs` | **34 PASS / 0 FAIL** |
| `node tools/test_all.mjs` | **1733 PASS / 4 FAIL**（仅历史 floor09/floor11） |
| `node tools/browser_29_menu.mjs` | **22 PASS / 0 FAIL** |
| `node tools/browser_28_return_soul.mjs` | **20 PASS / 0 FAIL**（28回原稿保持） |
| `node tools/test_28_soul_sewage.mjs` | 45 / 0 |
| `node tools/test_27_monsters.mjs` | 53 / 0 |
| `node tools/test_26_continuous.mjs` | 39 / 0 |
| `node tools/test_full40.mjs` | 98 / 0 |
| `node tools/test_b3.mjs` | 61 / 0 |

`test_29` 覆盖：SeedText 最大/0/非法/随机；53份迁移 SHA；固定/补位/四档存在且旧目录移除；同步有效通过 fixture 后 catalog 含 builtin/hash 且真实被 Planner 选中；档位错误同步失败且旧产物不变；清理后空池；index/legacy/short 静态入口、无旧 main/game/tower、short 使用 SeedText/NORMAL_LEVELS。

`browser_29` 覆盖：真实 Chrome 英文首页仅开始/退出/右下设置；设置打开；种子最大解析/保存到专用 key/0拒绝；关闭设置；开始会话、manifest.seed=所选最大种子、F→1/40；暂停返回；退出拦截关闭后显示手动提示并回主界面；short/legacy 单向进 index；设置打开 editor 再回 index。

## 可见证据

- [29-index-menu.png](29-index-menu.png)
- [29-settings.png](29-settings.png)
- [29-formal-playing.png](29-formal-playing.png)
- [29-return-menu.png](29-return-menu.png)
- [29-exit-overlay.png](29-exit-overlay.png)
- [29-short-redirect.png](29-short-redirect.png)
- [29-editor-from-settings.png](29-editor-from-settings.png)
- [browser-29-menu-2026-11-09.json](browser-29-menu-2026-11-09.json)
- [29-audit.json](29-audit.json)：N04/N05保持 false/0；www 关键文件一致。
- [29-before-inventory.json](29-before-inventory.json) / [29-migration-map.json](29-migration-map.json)

## 未测/限制

1. 作者真人导入已通过 JSON→明确加入池的**可见文件选择器流程**未自动执行；现有 `ContentRepository` 导入/发布测试与设置按钮静态/绑定存在，实际文件对话框未点。
2. 真实浏览器持久库删除/并发双窗口、保存种子 localStorage 失败、窗口关闭成功（非拦截）未构造；代码显示真实失败，但未人工验证。
3. 浏览器29证据是隔离 profile；start 使用空普通池 + test3 补位，不是作者发布图；没有作者新导出图可迁移，未假装已迁。
4. 旧 browser_b2/b3/b3r2/b4/b4r1 的 `btn-dev` 退出路径未更新，已不是29验收门槛；未跑全量地图合规/寻路，也未要求作者重走41层。
5. 仍为 b4-9/schema2；无新 APK/cap sync；旧 floor09/floor11 4条历史失败保留。
