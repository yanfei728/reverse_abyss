# 作者固定场景原字节副本（只读）

来源：`C:/Users/beilu/Documents/blcreate/开发示例关卡`，2026-11-07复验时读取。这里只保留原件，不加入运行、发布、迁移自动枚举或普通关卡池。

| 文件 | 字节数 | 文件 SHA-256 |
|---|---:|---|
| level0.json | 2182 | fcaf59ad30d603042dd4770a62baa303c1cb2841311aac480b2bbeda5d337953 |
| rest_level.json | 2038 | 3e35e2570379bb0fae2895b02bde39f6490c39caa45ad90ef9d704316bbbf136 |
| boss.json | 2182 | f3b0e3fb0c0e43ac51ecbd4d168de38ffe3898ea0c342c4424757dd2225acaea |

level0.json含两个裸x，故**不是合法JSON**；这是作者手工出生标记，原样保留。(9,19)/(10,19)，从0计数；运行转换只将这两格变空气，出生中心10格、脚底20格。不要用eval或放宽通用JSON解析器。

boss.json合法，21×24，底部(1,20)/(2,20)是进入房间的start云板；没有finish。两个源文件id相同且都声明normal，运行副本应赋正确kind与独立id并重算hash，不直接加载源件。

Boss固定中心(10.5,14.5)已由用户确认；保留休整。完整处理约定见 [设计](../../../docs/design/short-tower-fixed-scenes-and-collision.md) 与 [17号卡](../../../docs/tasks/17-b4-review-and-fixed-scenes.md)。本轮规划没有生成或切换运行副本。

本轮新增rest_level.json为合法JSON、自报hash匹配，原kind=normal。运行副本改rest，start=(13,18)、finish=(1,8)；中间3对云板只是平台，不生成多余接口。地图19×24、开放空气与地形全部保留。一次性回血沿用已有40/封顶100，不新增互动。端点几何审计见 [结果](../../../docs/checks/rest-map-2026-11-07.json)。当前只备份和规划，未实际通关。

用户最新决定：17号卡先完成六图短塔，编辑器试玩/裁剪/认证发布后置，不构建APK。
