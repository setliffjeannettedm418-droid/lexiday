# 项目结构

- `src/Lexiday.tsx`：应用入口、导航、主题、串行保存队列、会话恢复。
- `src/screens/`：首页、词库详情、导入、测试、统计、设置。使用 screens 避免被托管框架误判为 Pages Router。
- `src/components/ui.tsx`：可复用选项、掌握状态、词汇列表项、统计与进度组件。
- `components/ui/`：随环境提供的 shadcn/Radix 无障碍组件。
- `src/features/quiz/engine.ts`：七种题型、随机干扰项、题目降级。
- `src/features/review/scheduler.ts`：ReviewScheduler 接口与轻量调度策略，不依赖 UI。
- `src/features/import/parser.ts`：文件解析、中文/英文表头映射、批量合并。
- `src/db/index.ts`：Dexie 数据库存储、初始化、日期工具、JSON 导出。
- `src/db/seed.json`：用户两批 Word 词表合并后的 153 个词；无虚构学习记录。
- `src/types/index.ts`：Word、StudyRecord、DailyWordList、Attempt、Session、Settings。
- `src/utils/id.ts`：兼容 HTTPS 与普通开发环境的随机 UUID。
- `src/main.tsx`、`index.html`、`vite.local.config.ts`：不依赖服务器业务的标准 Vite SPA 运行入口。
- `app/`、`vite.config.ts`、`worker/`、`build/`：Work 托管适配入口，不存储任何用户学习数据。
- `public/`：PWA 图标、manifest、格式示例。
- `scripts/generate-sw.mjs`：构建后生成带资源哈希版本的离线缓存清单。
- `tests/learning.test.ts`：调度、导入、出题、数据库与 1 万词测试。

词库与测试日志通过 State 聚合事务写入 IndexedDB。未来可拆分为按词/按日志存储的 Dexie 表以支持更大历史。UI 仅渲染 30 条词汇或 20 条导入预览，避免 1 万 DOM 节点。

## Android 封装

- `capacitor.config.ts`：独立本地资源入口，无远程 server URL。
- `android/`：Android 原生工程，包名 `com.lexiday.app`。
- `MainActivity.java`：注册文件保存插件、处理系统返回键。
- `NativeBackupPlugin.java`：通过系统文档选择器保存 JSON 备份和 CSV 示例。
- `src/db/index.ts`：浏览器下载与 Android 保存之间的平台适配。
- `src/Lexiday.tsx` / `app/globals.css`：原生状态栏主题、安全区域适配；原生环境不启用 Service Worker。

Android 发音：`src/features/audio/speech.ts` 统一网页/原生发音接口；`src/components/PronunciationButtons.tsx` 两种口音按钮；`android/app/src/main/java/com/lexiday/app/NativeSpeechPlugin.java` 离线模型、播放和缓存；`scripts/prepare-android-speech.py` 固定哈希资源准备。
