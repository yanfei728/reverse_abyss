/* -*- coding: utf-8 -*-
 * capacitor-bridge-src.js —— 只由 esbuild 打进 www 的 Capacitor 适配
 * ================================================================
 * 不参与 PC 页面。构建: npm run build:bridge
 * 输出全局 RA_CAP_BRIDGE;平台模块只通过这个对象访问原生插件。
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

globalThis.RA_CAP_BRIDGE = {
  Capacitor: Capacitor,
  App: App,
  Filesystem: Filesystem,
  Directory: Directory,
  Encoding: Encoding,
  Share: Share
};
