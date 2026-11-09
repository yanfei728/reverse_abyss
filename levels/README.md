# levels 目录

本目录现在按角色管理，不再把历史/测试图混在根目录。正式普通图只从 `normal/difficulty-1..4` 读取。

```text
levels/
  normal/
    difficulty-1/   # JSON 的 difficulty 必须为 1，候选 1–9 层
    difficulty-2/   # difficulty=2，候选 11–19 层
    difficulty-3/   # difficulty=3，候选 21–29 层
    difficulty-4/   # difficulty=4，候选 31–39 层
  fixed/            # 大厅/休整/Boss 运行副本（只读）
  fallback/
    test3.json      # 本档不足时的开发示例规范副本；不是作者认证
  archive/          # 历史/测试/迁移/作者旧备份，永不进入普通候选
  levels.js         # tools/sync_levels.mjs 生成；不要手改
```

## 放入一张已通过的普通图

1. 在编辑器完成普通图、选择有效难度 1–4，并实际试玩通过后导出 JSON；JSON 带有与当前内容 hash 匹配的通过声明。
2. 按 `difficulty` 放入 `levels/normal/difficulty-N/`；文件名可以任意，身份按 JSON 内 `id` 与内容 hash 识别。
3. 运行：

```bash
node tools/sync_levels.mjs
```

4. 刷新页面。内置候选与浏览器 published 会按 `id + contentHash` 去重；同版本内置优先，不同版本保留。每档最多 9 张、无放回；不足的槽由 `fallback/test3` 补位。

无有效通过声明、读取失败、JSON 难度与目录不一致的文件不会进入池；同步工具会明确列出问题并保持上一份 `levels.js` 不变。

## 移除不再想使用的普通关卡

内置文件：找到 `normal/difficulty-N/` 对应JSON（以文件内id/hash识别，不只看标题），删除或移到该normal目录之外，再在仓库根目录运行 `node tools/sync_levels.mjs`。确认同步成功后刷新游戏，重新开始/重构；不手改生成的levels.js。只删Downloads/原始备份不改变正式池。

浏览器发布：编辑器发布、或设置导入后明确加入池的版本，保存在浏览器IndexedDB，删磁盘JSON不会移除它；删草稿也不会下架。打开 index 设置，在「浏览器发布版本」选择标题/难度/id/hash 后点「移出浏览器发布池」，确认框会显示完整身份。只删选中的id/hash，保留草稿、通过历史和磁盘文件；取消不变、事务提交才成功，失败保留列表可重试。列表为空表示当前浏览器没有发布版本，内置图不列为浏览器项。

同版本既有内置又有浏览器来源时需两边分别处理；同id不同hash是多个版本。已开始及死亡重试的塔仍按原manifest，移除影响的是以后读取当前池的新局。fixed/fallback/archive不属于本操作，池外test3仍用于缺档补位。详见[31设计](../docs/design/editor-visual-path-and-unpublish.md)。

## 不要做

- 不要手工改 `levels.js`。
- 不要把 `fixed/`、`fallback/`、`archive/` 中任何图当成普通候选。
- 不要为了让池非空把旧归档图重新复制进 `normal/`；空普通池合法，会用 test3 补位。
- 不要改 `开发示例关卡/` 下的原始导出。
