# 开源项目调研与产品决策

调研日期：2026-09-08。通过 GitHub 项目首页/README 了解结构与能力，只借鉴产品原则，未复制项目实现代码或具体视觉布局。下列“本项目采用”是设计判断，不代表源项目的原样实现。

| 项目 | 观察 | 本项目采用 |
|---|---|---|
| [Anki](https://github.com/ankitects/anki) | 以间隔复习为核心的卡片学习工具 | 将词条内容、学习记录、复习调度分开；长期积累而非一次性测验 |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | TypeScript 的 FSRS 实现，提供独立调度能力 | 预留 ReviewScheduler；本版用可解释轻量规则，未来替换调度器 |
| [QuizFlow](https://github.com/douxxtech/QuizFlow) | 以词表、交互卡片和多种学习模式组织学习 | 导入词表后按范围开始测试；单题界面保持简洁 |
| [Synapse](https://github.com/Emadab/Synapse) | 离线优先、键盘优先，UI 与学习核心分离，兼容 Anki 导入导出 | 增加 1–4、N/M/K、Enter、Space；单题结果不立即跳转 |
| [Decks](https://github.com/dscherdi/decks) | 从已有笔记形成学习卡片，支持选择、输入、填空及学习统计 | 保留原有 Word 学习成果，导入前预览；答题日志支撑趋势统计 |

## 设计取舍

- 首页是一块主学习面板加一块正确率摘要，英文单词作为详情与测试的视觉中心。
- 学习范围、题型、数量先选择，再进入没有普通导航的专注测试。
- 同时记录客观正误与主观掌握；答对但自评模糊仍安排巩固。
- 熟词僻义独立专项；智能混合中有 rareMeaning 时增加出现概率。
- 导入、测试和学习统计均在客户端运行。不上送学习数据。
- 采用蓝靛色主色、低对比底面和有限状态色；Material You 的层级与触控原则用于设计判断，没有照搬任何 UI。
- 配备纯 Vite 入口，个人电脑使用无需服务端数据库、账户或云资源。Work 托管入口仅用于便捷打开。
