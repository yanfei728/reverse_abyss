#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/*
 * build_android_www.mjs —— 生成最小离线 Web 包(www)
 * =================================================
 * 只复制 short 页面实际引用到的运行脚本、B2 模板和 assets;
 * 不复制 editor/tests/docs/Git/报告。产物由 Capacitor webDir 使用。
 *
 *   node tools/build_android_www.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT } from './loader.mjs';

const WWW = join(ROOT, 'www');
const SHORT = join(ROOT, 'short.html');

function copyIf(src, dest) {
  if (!existsSync(src)) throw new Error('缺少运行文件: ' + src);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function main() {
  const html = readFileSync(SHORT, 'utf8');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"\s*>/g)].map((m) => m[1]);
  if (!scripts.length) throw new Error('short.html 没有脚本');
  rmSync(WWW, { recursive: true, force: true });
  mkdirSync(WWW, { recursive: true });

  let page = html
    .replace(/<title>[^<]*<\/title>/, '<title>reverse_abyss · 安卓短塔</title>')
    .replace(/<a href="editor\.html">编辑器<\/a>\s*/g, '')
    .replace(/<a href="legacy\.html"[^>]*>旧原型<\/a>\s*/g, '')
    .replace('<script src="js/platform/action-input.js"></script>',
      '<script src="js/vendor/capacitor-plugins.js"></script>\n<script src="js/platform/action-input.js"></script>');
  writeFileSync(join(WWW, 'index.html'), page, 'utf8');

  scripts.forEach((rel) => {
    copyIf(join(ROOT, rel), join(WWW, rel));
  });
  // 运行所需的生成数据与贴图
  copyIf(join(ROOT, 'levels/levels.js'), join(WWW, 'levels/levels.js'));
  copyIf(join(ROOT, 'levels/b2'), join(WWW, 'levels/b2'));
  copyIf(join(ROOT, 'levels/authored/short'), join(WWW, 'levels/authored/short'));
  copyIf(join(ROOT, 'levels/authored/fixed'), join(WWW, 'levels/authored/fixed'));
  copyIf(join(ROOT, 'levels/b4/fixed'), join(WWW, 'levels/b4/fixed'));
  copyIf(join(ROOT, 'assets'), join(WWW, 'assets'));
  // 不被页面引用、但 assets 初始化可能探测的 CSS 不需要;不打包 editor/tests/docs
  const meta = {
    generatedAt: new Date().toISOString(),
    source: 'short.html',
    scripts,
    excludes: ['editor.html', 'tests/', 'tools/', 'docs/', '.git/', 'node_modules/'],
    capacitor: {
      core: '7.6.10', android: '7.6.10', app: '7.1.2',
      filesystem: '7.1.9', share: '7.0.4', cli: '7.6.10'
    }
  };
  writeFileSync(join(WWW, 'build-meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  console.log('已生成 www: ' + scripts.length + ' 个脚本 + levels/levels.js + levels/b2 + authored + b4 + assets');
}

main();
