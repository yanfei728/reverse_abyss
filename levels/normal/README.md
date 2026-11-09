# normal 普通关卡（四档）

只放**已实际试玩通过**、`kind=normal`、`difficulty=1..4` 且 `certification` 与当前内容 hash 匹配的 schema2 JSON。按难度放入对应子目录：

- `difficulty-1` → 1–9 层，最多 9 张
- `difficulty-2` → 11–19 层，最多 9 张
- `difficulty-3` → 21–29 层，最多 9 张
- `difficulty-4` → 31–39 层，最多 9 张

放好后运行 `node tools/sync_levels.mjs`。目录档位与 JSON 的 difficulty 不一致、坏 hash、未通过文件会被报告/跳过，不会写入正式池。详见上级 `levels/README.md`。
