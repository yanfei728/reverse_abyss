/* 在 Node 中加载关卡编解码和清单模块，供关卡导入/同步命令共用。 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODULES = [
  'js/config.js', 'js/util.js',
  'assets/background/catalog.js', 'assets/background/large/catalog.js',
  'js/level.js', 'js/entity-registry.js', 'js/level-data.js',
  'js/cloud-pipe.js', 'js/path-geometry.js', 'js/assets.js',
  'js/rules.js', 'js/content-repository.js',
  'js/normal-catalog.js', 'js/level-export.js'
];

export function loadEngine() {
  globalThis.RA = {};
  for (const file of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, file), 'utf8'), { filename: file });
  }
  return globalThis.RA;
}
