# CleanStreak 打包指南(iOS / Android)

> 适用目录:`frontend_reactnative`(Expo SDK 57 / RN 0.86)
> 配套 `app.json` / `eas.json` / `package.json` 均已就绪;实现方式与 DevVault 保持一致(EAS 本地构建)

---

## 1. 关键信息速览

| 项 | 值 | 说明 |
|---|---|---|
| **包名** | `jacob.cleanstreak.app` | iOS Bundle ID 与 Android applicationId 统一;**上架后永久不可改** |
| App 显示名 | CleanStreak | 桌面图标下的名称 |
| 版本号 | `1.0.0` | `app.json → expo.version` |
| Android versionCode | `1` | 每次发版必须 +1(production 档案已开启 autoIncrement) |
| iOS buildNumber | 由 autoIncrement 自动递增 | |
| 后端依赖 | **无** | 纯本地应用(数据存 SQLite),构建不注入任何环境变量 |

⚠️ 包名规则:小写字母、数字、`.`、`_`、`-`;换包名 = 全新应用(商店/推送/签名体系全部重来)。

---

## 2. 打包命令(常用)

```bash
npm run build:android    # Android 直装 APK → dist/CleanStreak.apk
npm run build:ios        # iOS 真机 ipa(Ad Hoc/internal)→ dist/CleanStreak.ipa
```

- 产物在项目根 `dist/` 目录,直接发到手机安装:
  ```bash
  adb install -r dist/CleanStreak.apk     # Android
  ```
- iOS ipa 可装到 Apple Developer 后台/EAS profile 内已注册的设备;新设备先 `eas device:create` 登记 UDID。
- 模拟器专用包(无需开发者账号):
  ```bash
  eas build -p ios --profile simulator
  ```
- 上架用 production 档案(Android 出 AAB、iOS 出 App Store 包):
  ```bash
  eas build -p android --profile production
  eas build -p ios --profile production
  eas submit -p ios --latest        # 提交 TestFlight
  ```

### iOS 签名对照(哪些是正式签名)

| Profile | distribution | 签名类型 | 用途 |
|---|---|---|---|
| `development` | internal | Development 证书 | 开发调试 |
| `simulator` | internal + `simulator: true` | 模拟器包(无需签名/开发者账号) | iOS 模拟器 |
| `preview` | internal | Ad Hoc 证书 | 已注册 UDID 的真机直接安装(`build:ios` 用的就是它) |
| `production` | (默认 store) | **Distribution 证书 = 正式签名** | App Store / TestFlight 提交 |

- `eas build -p ios --profile production` 打出来的就是**正式签名**:production 档案未覆盖任何签名配置,取默认值 `distribution: "store"`,使用 Apple Distribution 证书 + 分发描述文件,可直接提交 App Store / TestFlight。
- **store 正式签名的 ipa 不能直接装到手机测试**(只能通过 TestFlight / App Store 安装);想直装真机用 `npm run build:ios`(preview / Ad Hoc),新设备先 `eas device:create` 登记 UDID。
- production 档案 `autoIncrement: true`(配合 `eas.json` 里 `appVersionSource: "local"`):每次构建 `buildNumber` 自动 +1 并**写回 `app.json`**,构建后记得把该改动提交到 git。

### Android 正式包(AAB / APK)

- production 档案未设 `android.buildType`,默认出 **AAB**(app-bundle),而 Google Play 对新应用强制要求 AAB,APK 提交不上去:
  ```bash
  eas build -p android --profile production --local --output ./dist/CleanStreak.aab
  eas submit -p android --latest    # 提交 Google Play
  ```
- **EAS 对同一应用的所有 profile 共用同一个 Android keystore**(不像 iOS 分 development / Ad Hoc / Distribution 三套证书),所以 `npm run build:android`(preview / APK)已经是正式 keystore 签名,真机直装测试可直接用它。
- 确实需要 production 档案直接出 APK 时,可给该档案加 `"android": { "buildType": "apk" }`;但上架 Play 前得改回来,不建议 —— 真要加建议单独新建 `production-apk` 档案,别动 production。
- keystore 由 EAS 在首次构建时自动生成并托管在 expo.dev,`eas credentials` 可查看;若 APK 也用于 Play 之外的正式分发,记得备份这套凭据。提交 Play 后会启用 Play App Signing,EAS keystore 变为 upload key,商店里的包由 Google 重签(正常流程)。

---

## 3. 前置条件

- **eas-cli 已登录**(`eas whoami` 检查;当前账号 `jacobabdjacob`)
- **git 仓库**:EAS 打包硬性要求,项目必须 `git init` 且有提交(本仓库已初始化)。`.gitignore` 会排除 `node_modules`/`dist` 等目录
- **Android**:JDK 17 + Android SDK(Android Studio 自带即可);`build:android` 脚本自动回退 `~/Library/Android/sdk`(已设 `ANDROID_HOME` 时以现值为准)
- **iOS**:Xcode + CocoaPods;真机 ipa 需要 Apple Developer Program($99/年)
- 首次构建较慢:Android 首次 Gradle 需下载依赖;iOS 首次会引导 Apple 登录并自动注册 `jacob.cleanstreak.app` 的证书/描述文件(**建议首次在终端手动执行,过程有交互**),之后即可复用

---

## 4. 图标

- 源文件:`assets/logo.png`(完整圆角图标,用于 App 图标 / favicon)与 `assets/logo-icon.png`(无底透明图形,用于 App 内品牌位,如登录页)
- 生成全套派生图标(icon.png、favicon、Android 自适应三件套)并输出圆形蒙版预览:
  ```bash
  swift scripts/generate_icons.swift assets
  ```
- 图标或 `app.json` 有变更后,同步到原生工程:
  ```bash
  npx expo prebuild --clean     # 重新生成 ios/ 与 android/(会重跑 pod install)
  ```
- 注意:iOS 图标禁止透明通道,脚本会自动把 logo.png 平铺到奶油色底上

---

## 5. 发版 checklist

1. 改代码 → `npx tsc --noEmit` 全绿
2. 升版本:`app.json` 的 `version`;Android 关注 `versionCode`(production 档案 autoIncrement 自动 +1)
3. `npm run build:android` / `npm run build:ios`
4. 真机安装回归:打卡/撤销、提醒、Face ID 解锁、数据在重装后(清数据后)正常
5. 分发/提审

---

## 6. 常见报错速查

| 现象 | 原因/解决 |
|---|---|
| EAS 报 `requires you to use a git repository` | 项目没 `git init` 或没有提交;`git add -A && git commit` 后重试 |
| 更新了原生插件/图标不生效 | `npx expo prebuild -c` 重新生成原生工程 |
| Android 报 `SDK location not found ... ANDROID_HOME` | 确认 `~/Library/Android/sdk` 存在(脚本已自动注入);SDK 在别处则先 `export ANDROID_HOME=<路径>` |
| iOS 本地构建报 `Invalid trust settings` | 分发证书被设过「始终信任」:恢复系统默认信任设置,复查 `security find-identity -v -p codesigning` 应为 valid |
| iOS 报 `Provisioning profile ... doesn't include signing certificate` | 登录钥匙串残留同名旧分发证书;从登录钥匙串删除旧证书(保留私钥),EAS 绑定证书由临时钥匙串自动提供 |
| EAS 排队/超时 | 本地构建不排队;若用云构建加 `--no-wait` 提交后去 expo.dev 网页看进度 |
| 装不上 iOS ipa | 设备 UDID 未注册:先 `eas device:create` 再重新构建 |
