# B3 安卓工具链与兼容性记录

日期：2026-11-06。目标：离线 Capacitor 短塔 + 可安装 debug APK。原则：先核实官方要求，再锁定版本；缺 Android Studio/真机时如实记录，不声称商店发布。

## 官方要求（Capacitor 7）

- [Capacitor 7 Environment Setup](https://capacitorjs.com/docs/v7/getting-started/environment-setup)：NodeJS 20+、Android Studio 2024.2.1+、Android SDK API 23+。
- [Updating to Capacitor 7](https://capacitorjs.com/docs/v7/updating/7-0)：JDK 21、compileSdk/targetSdk 35、AGP 8.7.2、Gradle wrapper 8.11.1。
- [Capacitor 8 Environment Setup](https://capacitorjs.com/docs/getting-started/environment-setup)：Node 22+、Android Studio 2025.2.1+、API 36；本机没有 Android Studio/API 36，因此不升级到 v8。

选择 **Capacitor 7.6.10**（官方 v7 文档仍可访问；v8 需要更新的 Android Studio/API）。锁定为精确版本：

| 包 | 版本 |
|---|---|
| @capacitor/core | 7.6.10 |
| @capacitor/android | 7.6.10 |
| @capacitor/cli | 7.6.10 |
| @capacitor/app | 7.1.2 |
| @capacitor/filesystem | 7.1.9 |
| @capacitor/share | 7.0.4 |
| esbuild（只构建本地 bridge） | 0.25.10 |

`package-lock.json` 已生成；不引入远端 CDN/联网认证。

## 本机实际环境

| 项 | 实际值 |
|---|---|
| Node / npm | v24.21.0 / 11.19.0 |
| JDK | 21.0.12.1（`JAVA_HOME=C:\Users\beilu\jdk21\jdk-21.0.12.1+1`） |
| Android SDK | 使用已有离线 SDK：`C:\Users\beilu\Documents\blworking\gi-tcg-tool\.tooling\android-sdk`；未改共享 SDK |
| SDK platform | android-35 |
| Build-Tools | 35.0.0（官方模板默认请求 34.0.0；本机没有 34，改为所有子项目 `buildToolsVersion 35.0.0`） |
| Gradle | wrapper 8.11.1（首次构建下载；缓存见 `~/.gradle`） |
| Android Studio | **未安装/未验证**；官方文档要求 2024.2.1+，本机用 CLI + JDK + SDK 构建 |
| adb 设备 | **无设备**（`adb devices` 为空） |
| APK 签名 | Android Debug 证书（自动 debug 签名；不是正式发布签名） |

## 实际构建命令

```powershell
npm install --no-audit --no-fund
npm run build:android
$env:ANDROID_HOME='<本机 SDK 路径>'
$env:JAVA_HOME='C:\Users\beilu\jdk21\jdk-21.0.12.1+1'
.\android\gradlew.bat -p android assembleDebug --console=plain --no-daemon "-Pandroid.builder.sdkDownload=false"
```

`build:android` = 生成最小 `www` → esbuild 打包 Capacitor bridge → `cap sync android`。Gradle 用已安装 Build-Tools 35；不安装/改写共享 SDK。

## 构建结果

- `docs/checks/B3-gradle-build.txt`：`BUILD SUCCESSFUL`，168 tasks。
- APK：`docs/checks/B3-reverse-abyss-0.3.0-debug.apk`
  - size: **4,581,590 bytes**
  - SHA-256: **76FE73C2A25F940F7C915FA97F602609FC55F7F1A6D5D098C4E294FB977AD663**
  - package `com.yanfei.reverseabyss`, versionCode 3, versionName 0.3.0, minSdk 23, target/compile 35
  - `apksigner verify` 返回 0（debug 证书；META-INF version 文件警告来自 APK 容器，不是签名失败）
- `aapt dump badging` 确认包名/版本/SDK；`sensorLandscape` 来自 manifest。

## 未完成/限制

- 没有 Android Studio、模拟器或真机；APK 能构建/验签，但**未安装、未冷启动、未测锁屏/后台/返回/触控**。
- 没有系统文件选择/分享真机记录；`<input type=file>`、Filesystem Documents + Share 的 Android 行为仍需真机确认。
- 没有正式签名/上传/商店发布；只提供 debug 测试包。
- 没有标准人工通关/认证 JSON；正式内容往返仍待作者提供真实样本。
