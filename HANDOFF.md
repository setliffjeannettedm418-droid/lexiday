# 词序 Lexiday v1.8 接手记录

整理日期：2026-10-06。先看 `START_HERE.md`；详细历史与验证记录见 `README.md`、`TESTING.md`。

## 1. 当前交付基线

| 项目 | 当前值 |
| --- | --- |
| 源码提交 | `32aa57355528ed537045939ef51a8b9b20858e0a` |
| npm 版本 | `1.8.0` |
| Android | versionName `1.8` / versionCode `9` |
| 包名 | `com.lexiday.app` |
| 已交付安装包 | `Lexiday-v1.8-Warm-Apricot.apk`，207,171,125 bytes |
| APK SHA-256 | `be590ba100359319ab17e783085d61e0cde948e172edd424c0fe4148c1efcc0e` |
| 签名证书 SHA-256 | `c99bf9e8bb0cbb68eb35d46f849d5abc178f5570e6e7d94207d723d0f7b07914` |

该 APK 和签名备份分别交付，未放进源码 ZIP。v1.8 基于 v1.7 更新，不能退回早期简化原型。

## 2. 用户确认的设计与功能

用户选择暖杏配色：暖白背景、杏棕主按钮、清晰无衬线中英文字体，带深色外观。中文为完整 Noto Sans SC，英文 Roboto；字体和许可随源码提供。

首页保留导入、按日期选词、今日词汇、到期复习、继续测试、阅读书架与统计入口。底部导航包含词库，设置在顶部。词数、进度和文章来自实际本地数据，不能填演示统计。

完整功能约束见 `AGENTS.md`。尤其不能在美化后丢失词表导入或把测试范围缩减为只有日期。

生产导入支持 DOCX / XLSX / CSV / JSON。早期 HTML 原型里的 TXT / 粘贴入口不代表生产功能已经实现。Word 解析有针对用户双栏背诵卡片的逻辑，不能用通用简单表格解析替换。

80 词统计按已提交测试的不同单词累计；每批分成 4 篇各 20 个目标词的短文。译文、语法和详解按需展开，非目标生词也可点查；常见义来自本人词库或随包离线词典，本句详解需手动请求 AI。

**当前实际 AI 服务仍是 DeepSeek**：`src/features/reading/service.ts` 与 `NativeReadingPlugin.java` 都使用它。用户此前询问能否直接用 GPT；GPT 接入尚未实现。本次迁移未更改服务商。应用基本学习不需要 API 密钥，生成新文章/新的语境解释需用户自己的配置。

## 3. 电脑开发

安装 Node.js **22.13 或更高**，在包含 `package.json` 的目录运行：

```sh
npm ci
npm test
npm run dev:local
```

打开终端显示的本机地址。独立生产构建与预览：

```sh
npm run build:local
npm run preview:local
```

这些命令使用 Vite SPA，共用完整学习逻辑，不需要原 Work 私有项目凭据。不要直接双击 HTML。`npm run dev`、`build`、`start` 是保留的托管入口，含环境适配和 Bash 命令，普通 Windows 开发优先用 `:local`。

初次安装 npm 包需要网络；有些 Codex 云环境需允许相应包管理器访问。此接手包未附 `node_modules` 和开发工具。

## 4. 完整 Android 构建

环境：Node.js 22.13+、Python **3.11+**、完整 **JDK 21**、Android SDK Platform **36**、Build Tools **36.0.0**。在 `android/local.properties` 中配置本机 `sdk.dir`，该本机路径不要提交。

先在项目根目录执行：

```sh
npm ci
python3 scripts/prepare-android-speech.py
npm run build:local
npx cap sync android
```

Windows 如没有 `python3` 命令，改用已安装的 `python` 或 `py -3`，并确保版本满足要求。

macOS / Linux：

```sh
cd android
chmod +x gradlew
./gradlew :app:assembleDebug
```

Windows PowerShell：

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`。首次 Gradle 构建还要下载依赖。

语音准备脚本会下载固定版本 sherpa-onnx 1.13.7 AAR 与 Kokoro 模型，核对内置 SHA-256 后将模型打入 APK。源码 ZIP 没有这些体积较大的资源；手机安装后的基本发音不需要再下载。不要跳过哈希校验。离线词典及字体已经包含在源码包中。

新电脑默认调试签名通常不同于旧 App，不能直接覆盖旧安装。后续升级应增加版本号，使用单独交付的 `Lexiday-Android-signing-backup.zip` 内原密钥。按备份 README 配置私有签名，或构建未签名 release 后用官方 zipalign / apksigner 签名并验证证书。不要覆盖其他项目共用的调试密钥，也不要把签名 ZIP/密钥提交 GitHub。

`scripts/package-web-update.py` 是历史纯网页资源更新路径，依赖 v1.7 源码提交 `7c163720f6fb9b5359a91ff93eea2f42e7a61f4f` 和对应 APK。**本包没有原 Git 历史或该 APK，不能直接运行这条路径**。默认使用上面的完整 Gradle 构建；不要删掉脚本的原生差异与哈希校验。

## 5. 代码入口

| 内容 | 位置 |
| --- | --- |
| 应用入口、导航、会话 | `src/Lexiday.tsx` |
| 页面 | `src/screens/` |
| 暖杏主题 | `app/apricot.css`、`app/globals.css` |
| 词表导入 | `src/features/import/parser.ts` |
| 测试与筛选 | `src/features/quiz/` |
| 阅读、查词和 AI | `src/features/reading/` |
| 本地数据与初始词 | `src/db/` |
| Android 插件 | `android/app/src/main/java/com/lexiday/app/` |
| 离线发音准备 | `scripts/prepare-android-speech.py` |
| APK 核对 | `scripts/verify-apk.py` |
| 自动化测试 | `tests/` |

更完整的结构见 `PROJECT_STRUCTURE.md`。原始学习词表来自用户的两份 Word；初始合并 153 词，无虚构学习记录。

## 6. 验证边界

v1.8 原交付记录：34/34 单元与 React/jsdom 交互测试、TypeScript、独立生产构建和 PWA 缓存校验通过。281 个页面资源与 APK 一致，词典/原生/语音资源核对通过，官方工具检查签名、CRC 和 16 KB 对齐通过。

v1.8 未完成真实浏览器截图检查、Android 真机覆盖安装或真实付费 AI 请求；也没有运行完整 Gradle 构建，原交付使用已校验原生基包的页面更新方式。上述历史检查不是本次迁移重新执行的结果。新开发环境需重新运行测试并按实际条件验证。

## 7. 学习数据与迁移范围

App 数据库为本机 IndexedDB `lexiday-v1`，未完成会话在 localStorage。源码不包含用户手机上的学习记录和已生成文章。需要迁移学习数据时，先在 App 设置中导出全部数据 JSON，再在新安装/设备里恢复。API 密钥不在学习备份中，应由用户重新配置。

本包复制原提交的 463 个受版本控制文件，另加接手文档和文件校验清单。仅移除旧托管配置的账号项目绑定。未包含 Git 历史、缓存、构建产物、签名密钥或个人 API 密钥。可在此基础上建立新的本地 Git 仓库，再推送到目标账号的私有 GitHub 仓库。
