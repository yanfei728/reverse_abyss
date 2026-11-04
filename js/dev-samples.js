/* -*- coding: utf-8 -*- */
/*
 * dev-samples.js —— 连续试玩用的开发样例(自动生成,不要手改)
 * 来源:levels/dev/*.json;重新生成:node tools/sync_dev_levels.mjs
 * 开发模式样例,未认证;不进入正式随机池。
 */
(function (RA) {
  'use strict';
  RA.DEV_SAMPLES = {
  "floorA": {
    "schemaVersion": 2,
    "id": "dev_floor_a",
    "title": "开发样例 A(下层)",
    "kind": "normal",
    "difficulty": 1,
    "size": {
      "cols": 14,
      "rows": 8
    },
    "terrain": {
      "tiles": [
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1
        ]
      ]
    },
    "ports": {
      "profile": "vertical-v1",
      "entry": {
        "col": 2
      },
      "exit": {
        "col": 5
      }
    },
    "spawn": {
      "col": 5,
      "row": 3
    },
    "objects": [],
    "paths": [],
    "visuals": {
      "backgroundId": "sky3",
      "decorations": []
    },
    "extensions": {
      "dev": true,
      "note": "B1 开发试玩样例:站在平台上二段跳穿过顶部开口"
    },
    "portsNote": null,
    "contentHash": "sha256:bda40b1c00276bccfb1aa7b208bb0e8d1a1375cb4a13d7f894ada727d3fae4d0",
    "certification": null
  },
  "floorB": {
    "schemaVersion": 2,
    "id": "dev_floor_b",
    "title": "开发样例 B(上层)",
    "kind": "normal",
    "difficulty": 1,
    "size": {
      "cols": 10,
      "rows": 5
    },
    "terrain": {
      "tiles": [
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        [
          1,
          1,
          0,
          0,
          0,
          0,
          1,
          1,
          1,
          1
        ]
      ]
    },
    "ports": {
      "profile": "vertical-v1",
      "entry": {
        "col": 2
      },
      "exit": {
        "col": 4
      }
    },
    "spawn": {
      "col": 6,
      "row": 3
    },
    "objects": [],
    "paths": [],
    "visuals": {
      "backgroundId": "sky3",
      "decorations": []
    },
    "extensions": {
      "dev": true,
      "note": "B1 开发试玩样例:从入口梯板向上,穿过顶部开口"
    },
    "portsNote": null,
    "contentHash": "sha256:8e26b74aa01e088b8778f9f7c90c16f72a54875869fed7f96a7610199d01a1fc",
    "certification": null
  }
};
})(globalThis.RA = globalThis.RA || {});
