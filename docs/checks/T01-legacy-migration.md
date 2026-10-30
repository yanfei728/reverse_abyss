# T01 旧图迁移记录（自动生成）

生成时间：2026-10-30 17:32。生成命令：`node tools/migrate_levels.mjs`。

本文件由工具覆盖生成，不是手写文档。规则见 [js/legacy-import.js](../../js/legacy-import.js) 与
[数据接口第 7 节](../design/data-and-interfaces.md)。

## 结论

- 输入：`levels` 里 12 张旧图（下划线开头不迁移：_template.json）。
- 输出：`levels/v2/<id>.json`，12 / 12 张迁移成功。
- 原文件逐个做了 sha256 前后比对：全部一致，未被修改、删除或改名。
- 每张输出都重新 `decode`（校验自报 contentHash）并按 `purpose=draft` 校验，0 个结构性 error。
- `ports` 一律为 `null`：旧图没有按 vertical-v1（4 格开口 + 上下各 3 格安全带）绘制接口，
  迁移**不自动裁剪或缩放**，所以它们现在只是待修复草稿，不能试玩/发布。旧出口 G 的位置记在
  `extensions.legacy.exit`，旧出生点 P 记在 `extensions.legacy.entry`，供 T04 的端口工具使用。
- 旧 `verified` 只写进 `extensions.legacy.verified`，`certification` 全部 `null`：
  T01 不承认任何历史认证，重新标准试玩之前不能入池。

## 逐图结果

| 文件 | 尺寸 | 难度 | 背景 | 对象 | 路径 | contentHash（前 16 位） | 警告 | 结果 |
|---|---:|---:|---|---:|---:|---|---:|---|
| `floor01.json` | 22×32 | 1 | 自动 | 0 | 0 | `a6065f1adccdbc9a` | 2 | ✅ 迁移成功 |
| `floor02.json` | 15×30 | 1 | 自动 | 0 | 0 | `e50b1f3208a44824` | 2 | ✅ 迁移成功 |
| `floor03.json` | 15×30 | 1 | 自动 | 1 | 0 | `a5f1f28fec7f0c10` | 2 | ✅ 迁移成功 |
| `floor04.json` | 15×32 | 1 | 自动 | 0 | 0 | `79453decb11b4750` | 2 | ✅ 迁移成功 |
| `floor05.json` | 15×32 | 1 | 自动 | 1 | 0 | `33c9d8ad7beb072b` | 2 | ✅ 迁移成功 |
| `floor06.json` | 30×24 | 1 | 自动 | 1 | 0 | `1e792c957768ca3e` | 2 | ✅ 迁移成功 |
| `floor07.json` | 15×34 | 1 | 自动 | 0 | 0 | `430e473a8586fbc5` | 2 | ✅ 迁移成功 |
| `floor08.json` | 43×24 | 1 | 自动 | 0 | 0 | `4320d9bbb51a4e83` | 2 | ✅ 迁移成功 |
| `floor09.json` | 17×25 | 1 | 自动 | 0 | 0 | `9e9a274e7be60dfa` | 2 | ✅ 迁移成功 |
| `floor10.json` | 15×23 | 1 | 自动 | 0 | 0 | `791ce5095de68c49` | 2 | ✅ 迁移成功 |
| `floor11.json` | 23×16 | 1 | 自动 | 16 | 0 | `26ebc121cdbd5d7a` | 2 | ✅ 迁移成功 |
| `floor12.json` | 15×23 | 1 | 自动 | 0 | 0 | `92519b6824712927` | 2 | ✅ 迁移成功 |

## 逐图警告

### `floor01.json` → `levels/v2/floor01.json`
- 旧出口 G 在 (18,0);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor02.json` → `levels/v2/floor02.json`
- 旧出口 G 在 (8,3);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor03.json` → `levels/v2/floor03.json`
- 旧出口 G 在 (9,3);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor04.json` → `levels/v2/floor04.json`
- 旧出口 G 在 (11,2);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor05.json` → `levels/v2/floor05.json`
- 旧出口 G 在 (9,1);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor06.json` → `levels/v2/floor06.json`
- 旧出口 G 在 (27,4);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor07.json` → `levels/v2/floor07.json`
- 旧出口 G 在 (9,3);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor08.json` → `levels/v2/floor08.json`
- 旧出口 G 在 (41,3);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor09.json` → `levels/v2/floor09.json`
- 旧出口 G 在 (14,23);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor10.json` → `levels/v2/floor10.json`
- 旧出口 G 在 (12,0);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor11.json` → `levels/v2/floor11.json`
- 旧出口 G 在 (22,0);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

### `floor12.json` → `levels/v2/floor12.json`
- 旧出口 G 在 (0,7);新格式的出口是顶边接口,ports 留空需要作者修复
- 旧 verified=true 不继承为认证;需要重新标准试玩后才谈发布

## 复现与回退

```powershell
node tools/migrate_levels.mjs   # 重新生成 levels/v2/ 与本报告（覆盖输出，不动旧图）
git checkout -- levels/v2      # 只撤销迁移输出，旧图不受影响
```
