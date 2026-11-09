# fixed / fallback

- `fixed/lobby.json`、`fixed/rest.json`、`fixed/boss.json`：完整塔 0 层大厅、10/30 层休整、20/40 层 Boss 的运行副本。内容身份仍由 `tools/sync_full40_levels.mjs` 生成到 `js/full40-samples.js`；不接受编辑器发布，不进普通池。
- `fallback/test3.json`：正常塔某档不足 9 张时的规范开发示例副本；不伪造作者认证，不改变目标难度，不进普通池。

修改这些文件后运行：

```bash
node tools/sync_full40_levels.mjs
```

固定场景不是普通关卡；普通图只放 `levels/normal/difficulty-1..4` 并运行 `node tools/sync_levels.mjs`。
