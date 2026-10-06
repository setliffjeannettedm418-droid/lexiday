# 从 ChatGPT Work 迁移到 Codex

这是词序 Lexiday **v1.8 暖杏版**的源码接手包，Android versionCode 为 **9**。
源码来自已保存提交 `32aa57355528ed537045939ef51a8b9b20858e0a`。

## 电脑本地开发（最直接）

1. 解压整个 ZIP。
2. 在电脑端选择 Codex，打开解压后的 `Lexiday-v1.8` 文件夹。选中的目录应直接包含 `package.json`、`src`、`android`。
3. 用文本编辑器打开 `CODEX_PROMPT.txt`，把全部内容发给 Codex。
4. Codex 会读取接手说明、检查环境、安装依赖并运行测试与预览；之后直接提出你的开发需求。

当前 OpenAI 官方桌面端文档说明：从 ChatGPT 下拉菜单选择 Codex，用于带项目代码上下文的开发。不同客户端的入口名称可能略有区别，关键是打开整个项目文件夹。

## Codex Cloud / 跨账号开发

1. 用目标账号可访问的 GitHub 账号创建一个**私有仓库**。
2. 使用 GitHub Desktop 或 Git，把解压后的项目文件提交到仓库根目录。仓库根目录应有 `package.json`，不要只上传 ZIP。
3. 在 Codex 的云端入口创建环境，连接 GitHub 并选择这个仓库。
4. 让 Codex 准备依赖和测试环境；检查结果后发布环境，再新建任务，把 `CODEX_PROMPT.txt` 的内容发给它。

本包不需要原 Work 账号的私有仓库凭据。若换账号，通过本地文件夹或目标账号有权限的 GitHub 仓库接手。

## 包内有什么

- React / TypeScript 完整项目与 Android 原生工程、Gradle Wrapper。
- 暖杏样式、完整中文字体及字体许可、离线词典、153 个初始学习词。
- 锁定依赖文件、测试、Android 构建及资源校验脚本。
- `AGENTS.md`：Codex 开发约束；`HANDOFF.md`：当前状态与构建说明。
- `CODEX_PROMPT.txt`：第一条接手指令；`SOURCE_MANIFEST.json`：文件校验清单。

依赖目录、构建缓存和体积较大的原生语音资源未放进源码 ZIP。`npm ci` 安装依赖，语音准备脚本从固定来源下载并核对哈希后打入 APK，详见 `HANDOFF.md`。

## 另外保存这两项

- **原 Android 签名备份**：单独保管，后续覆盖升级旧 App 需要同一签名，不要上传到 GitHub。
- **手机学习记录**：在 App 设置中导出全部数据 JSON。源码不包含手机上的个人词表、学习进度、已生成文章和 API 密钥。

完整聊天记录不包含在源码包中；本项目的功能约束、设计选择、已知限制与测试记录已整理进接手文件。

官方操作参考（2026-10-06 核对）：
- https://learn.chatgpt.com/docs/quickstart
- https://learn.chatgpt.com/docs/cloud
