/* -*- coding: utf-8 -*- */
/*
 * b2-samples.js —— B2 开发短塔模板(自动生成,不要手改)
 * 来源:levels/b2/*.json;重新生成:node tools/sync_b2_levels.mjs
 * 未认证的开发模板;不进入正式随机池。
 */
(function (RA) {
  'use strict';
  RA.B2_SAMPLES = {
  "boss": {
    "schemaVersion": 2,
    "id": "b2_boss",
    "title": "短塔 Boss",
    "kind": "boss",
    "difficulty": null,
    "size": {
      "cols": 16,
      "rows": 12
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
          0,
          0,
          0
        ],
        [
          0,
          0,
          1,
          1,
          1,
          1,
          0,
          0,
          0,
          0,
          1,
          1,
          1,
          1,
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
          0,
          0,
          0
        ],
        [
          0,
          0,
          1,
          1,
          1,
          1,
          0,
          0,
          0,
          0,
          1,
          1,
          1,
          1,
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
        "col": 6
      }
    },
    "spawn": {
      "col": 2,
      "row": 10
    },
    "objects": [],
    "paths": [],
    "visuals": {
      "backgroundId": "sky3",
      "decorations": []
    },
    "extensions": {
      "dev": true,
      "template": true
    },
    "portsNote": null,
    "contentHash": "sha256:c65d42ecc70a6f8faf43e64bcd68f565b580c0bdb610ab7baebfd6e0c0ee3e97",
    "certification": null
  },
  "lobby": {
    "schemaVersion": 2,
    "id": "b2_lobby",
    "title": "短塔大厅",
    "kind": "lobby",
    "difficulty": null,
    "size": {
      "cols": 12,
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
          0
        ],
        [
          0,
          0,
          0,
          0,
          1,
          1,
          1,
          1,
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
          0
        ],
        [
          0,
          0,
          0,
          0,
          1,
          1,
          1,
          1,
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
      "col": 2,
      "row": 6
    },
    "objects": [],
    "paths": [],
    "visuals": {
      "backgroundId": "sky3",
      "decorations": []
    },
    "extensions": {
      "dev": true,
      "template": true
    },
    "portsNote": null,
    "contentHash": "sha256:86037f42f9ff3f7a67b53796a8c4209c000e82214d851cbda274ca813979ea1c",
    "certification": null
  },
  "normal1": {
    "schemaVersion": 2,
    "id": "b2_normal_1",
    "title": "短塔普通层 1",
    "kind": "normal",
    "difficulty": 1,
    "size": {
      "cols": 14,
      "rows": 10
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
          1,
          1,
          1,
          1,
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
          1,
          1,
          1,
          1,
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
          1,
          1,
          1,
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
        "col": 4
      }
    },
    "spawn": {
      "col": 2,
      "row": 8
    },
    "objects": [
      {
        "id": "o_spring",
        "type": "spring",
        "col": 5,
        "row": 8,
        "params": {
          "bounceVel": -1180
        },
        "pathId": null
      },
      {
        "id": "o_spike",
        "type": "spike",
        "col": 10,
        "row": 8,
        "params": {
          "warningSeconds": 0.5,
          "activeSeconds": 0.8,
          "cooldownSeconds": 1,
          "damage": 20
        },
        "pathId": null
      },
      {
        "id": "o_fire",
        "type": "fireball_static",
        "col": 7,
        "row": 6,
        "params": {
          "radiusTiles": 0.5,
          "damage": 20
        },
        "pathId": null
      },
      {
        "id": "o_gear",
        "type": "gear",
        "col": 3,
        "row": 5,
        "params": {
          "speedTilesPerSecond": 2,
          "radiusTiles": 0.5,
          "damage": 20
        },
        "pathId": "p1"
      }
    ],
    "paths": [
      {
        "id": "p1",
        "mode": "loop",
        "points": [
          {
            "col": 3,
            "row": 5
          },
          {
            "col": 10,
            "row": 5
          },
          {
            "col": 10,
            "row": 6
          },
          {
            "col": 3,
            "row": 6
          }
        ]
      }
    ],
    "visuals": {
      "backgroundId": "sky3",
      "decorations": []
    },
    "extensions": {
      "dev": true,
      "template": true
    },
    "portsNote": null,
    "contentHash": "sha256:0ca2e0a46d920b6afa20b9589b63950d9187018f4d1601d23542e35a0a859b2e",
    "certification": null
  },
  "normal2": {
    "schemaVersion": 2,
    "id": "b2_normal_2",
    "title": "短塔普通层 2",
    "kind": "normal",
    "difficulty": 1,
    "size": {
      "cols": 12,
      "rows": 12
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
          0
        ],
        [
          0,
          0,
          0,
          1,
          0,
          1,
          1,
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
        "col": 3
      }
    },
    "spawn": {
      "col": 2,
      "row": 10
    },
    "objects": [
      {
        "id": "o_door",
        "type": "crumble_door",
        "col": 5,
        "row": 7,
        "params": {
          "fadeSeconds": 0.12
        },
        "pathId": null
      },
      {
        "id": "o_blink",
        "type": "blink_platform",
        "col": 4,
        "row": 6,
        "params": {
          "warningSeconds": 0.5,
          "goneSeconds": 1.6
        },
        "pathId": null
      },
      {
        "id": "o_gear2",
        "type": "gear",
        "col": 2,
        "row": 7,
        "params": {
          "speedTilesPerSecond": 3,
          "radiusTiles": 0.5,
          "damage": 20
        },
        "pathId": "p2"
      }
    ],
    "paths": [
      {
        "id": "p2",
        "mode": "pingpong",
        "points": [
          {
            "col": 2,
            "row": 7
          },
          {
            "col": 9,
            "row": 7
          }
        ]
      }
    ],
    "visuals": {
      "backgroundId": "sky3",
      "decorations": []
    },
    "extensions": {
      "dev": true,
      "template": true
    },
    "portsNote": null,
    "contentHash": "sha256:b12b51854bde88b444c09e582f4889101c9888bdabc1ff3795906ff190c4ecc4",
    "certification": null
  },
  "normal3": {
    "schemaVersion": 2,
    "id": "b2_normal_3",
    "title": "短塔普通层 3",
    "kind": "normal",
    "difficulty": 1,
    "size": {
      "cols": 16,
      "rows": 10
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
          1,
          1,
          1,
          1,
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
          1,
          1,
          1,
          1,
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
          1,
          1,
          1,
          1,
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
          1,
          1,
          1
        ]
      ]
    },
    "ports": {
      "profile": "vertical-v1",
      "entry": {
        "col": 3
      },
      "exit": {
        "col": 8
      }
    },
    "spawn": {
      "col": 2,
      "row": 8
    },
    "objects": [
      {
        "id": "o_fire3",
        "type": "fireball_static",
        "col": 8,
        "row": 7,
        "params": {
          "radiusTiles": 0.5,
          "damage": 20
        },
        "pathId": null
      },
      {
        "id": "o_spike3",
        "type": "spike",
        "col": 12,
        "row": 8,
        "params": {
          "warningSeconds": 0.5,
          "activeSeconds": 0.8,
          "cooldownSeconds": 1,
          "damage": 20
        },
        "pathId": null
      },
      {
        "id": "o_gear3",
        "type": "gear",
        "col": 2,
        "row": 5,
        "params": {
          "speedTilesPerSecond": 2.5,
          "radiusTiles": 0.5,
          "damage": 20
        },
        "pathId": "p3"
      }
    ],
    "paths": [
      {
        "id": "p3",
        "mode": "loop",
        "points": [
          {
            "col": 2,
            "row": 5
          },
          {
            "col": 13,
            "row": 5
          }
        ]
      }
    ],
    "visuals": {
      "backgroundId": "sky3",
      "decorations": []
    },
    "extensions": {
      "dev": true,
      "template": true
    },
    "portsNote": null,
    "contentHash": "sha256:d504a342a4e17125ba2d14d7b42335e32879d4d5648819746ab0f0d15157550d",
    "certification": null
  },
  "rest": {
    "schemaVersion": 2,
    "id": "b2_rest",
    "title": "短塔休整层",
    "kind": "rest",
    "difficulty": null,
    "size": {
      "cols": 10,
      "rows": 6
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
      "col": 2,
      "row": 4
    },
    "objects": [],
    "paths": [],
    "visuals": {
      "backgroundId": "sky3",
      "decorations": []
    },
    "extensions": {
      "dev": true,
      "template": true
    },
    "portsNote": null,
    "contentHash": "sha256:608a42df1368b85db6be6d5a4d5758e91c708d81be02584ac8870df6540e3c8e",
    "certification": null
  }
};
})(globalThis.RA = globalThis.RA || {});
