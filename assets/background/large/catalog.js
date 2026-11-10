/* -*- coding: utf-8 -*- */
/* 由 tools/sync_large_backgrounds.mjs 生成;不要手改。
 * 39:分组/每图布局(cover/contain/锚点/横移幅度);组3/4空=渐变。 */
(function (RA) {
  'use strict';
  RA.LargeBackgroundCatalog = {
  "version": 2,
  "groups": [
    {
      "group": "difficulty-1",
      "layers": [
        {
          "id": "background-sunset",
          "layer": "back",
          "order": 0,
          "file": "assets/background/large/difficulty-1/background-sunset.png",
          "width": 2048,
          "height": 852,
          "layout": {
            "fit": "cover",
            "anchorX": 0.5,
            "anchorY": 0.5,
            "panPct": 0.02
          }
        },
        {
          "id": "midground-tower",
          "layer": "mid",
          "order": 1,
          "file": "assets/background/large/difficulty-1/midground-tower.png",
          "width": 384,
          "height": 832,
          "layout": {
            "fit": "contain",
            "anchorX": 0.22,
            "anchorY": 1,
            "panPct": 0.03,
            "maxWidthPct": 0.28,
            "maxHeightPct": 0.8
          }
        },
        {
          "id": "foreground-forest",
          "layer": "front",
          "order": 2,
          "file": "assets/background/large/difficulty-1/foreground-forest.png",
          "width": 2048,
          "height": 809,
          "layout": {
            "fit": "cover",
            "anchorX": 0.5,
            "anchorY": 1,
            "panPct": 0.04
          }
        }
      ]
    },
    {
      "group": "difficulty-2",
      "layers": [
        {
          "id": "background-sky",
          "layer": "back",
          "order": 0,
          "file": "assets/background/large/difficulty-2/background-sky.png",
          "width": 2848,
          "height": 1390,
          "layout": {
            "fit": "cover",
            "anchorX": 0.5,
            "anchorY": 0.5,
            "panPct": 0.02
          }
        },
        {
          "id": "midground-village",
          "layer": "mid",
          "order": 1,
          "file": "assets/background/large/difficulty-2/midground-village.png",
          "width": 1729,
          "height": 920,
          "layout": {
            "fit": "cover",
            "anchorX": 0.5,
            "anchorY": 1,
            "panPct": 0.03
          }
        },
        {
          "id": "foreground-valley",
          "layer": "front",
          "order": 2,
          "file": "assets/background/large/difficulty-2/foreground-valley.png",
          "width": 2784,
          "height": 1453,
          "layout": {
            "fit": "cover",
            "anchorX": 0.5,
            "anchorY": 1,
            "panPct": 0.04
          }
        }
      ]
    },
    {
      "group": "difficulty-3",
      "layers": []
    },
    {
      "group": "difficulty-4",
      "layers": []
    }
  ]
};
})(globalThis.RA = globalThis.RA || {});
