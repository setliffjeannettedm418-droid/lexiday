# 词表与备份格式

## DOCX
推荐 Word 表格，每张表第一行是表头，可含多张表。实际测试对象包括用户的第一批 72 条和第二批 83 条词表。

| 单词 / 短语 | 音标 | 常见意思 | 考研熟词僻义 / 语境义 | 常用搭配与用法 | 例句 |
|---|---|---|---|---|---|
| material | /məˈtɪəriəl/ | 材料；资料 | 重要的；实质性的 | material evidence 重要证据 | This is material evidence. |

可以识别“1. material”这类带编号单词。纯段落可使用 `单词：material`、`常见意思：材料` 等独立标签行。也支持双栏背诵卡片：左栏依次为编号单词、音标、词性，右栏使用“核心义”“考研点”“搭配”“例句”等标签。图片扫描件、复杂文本框、合并单元格中的不规则词表不保证识别；会显示无法识别，不猜造内容。不支持旧版 `.doc`。

## XLSX
首行使用同样表头，每词一行。自动读取所有工作表；空行跳过；必须包含单词和常见意思。建议不要使用合并单元格或依赖公式生成的词义。

## CSV
UTF-8 编码，同样使用表头。含逗号或换行的字段用双引号包围，字段内双引号写成两个双引号。可下载 `public/sample.csv`。旧 GBK 文件请另存为 UTF-8。

## JSON 词表
```json
[{"word":"material","phonetic":"/məˈtɪəriəl/","commonMeaning":"材料；资料","rareMeaning":"重要的；实质性的","usage":"material evidence 重要证据","example":"This is material evidence.","tags":["阅读"]}]
```
也支持 `{ "words": [...] }`；兼容 `common`、`common_meaning`、`rare`、`rare_meaning`。

## 自动识别映射

| 内部字段 | 支持表头举例 |
|---|---|
| word | 单词、单词 / 短语、词汇、英文、word |
| phonetic | 音标、phonetic |
| commonMeaning | 常见意思、常见义、中文、释义、common |
| rareMeaning | 熟词僻义、考研熟词僻义 / 语境义、语境义、rare_meaning |
| usage | 用法、常用搭配与用法、固定搭配、搭配与用法 |
| example | 例句、example |
| tags | 标签、tags |

必填：word、commonMeaning。其余可空。没有僻义或搭配的词不会生成相应专项题；干扰项不足四个时降级为拼写题。

## 导入与重复处理
最大 20 MB。浏览器本地解析，预览支持编辑六项内容、勾选、删除、选择归属日期。确认后才写入。

单词首尾空白与大小写标准化用于判重。默认合并不同内容并保留原学习记录；覆盖只替换词条内容；跳过已有词汇不会加入当天词表。当前文件内部同词也会合并。合并不进行语义改写，不去除原文中特定语境标记。

## 完整备份
设置页导出的格式为 `{ "version": 1, "exportedAt": "ISO时间", "data": { "words": [], "records": {}, "days": [], "attempts": [], "settings": {} } }`。从“导入备份”恢复，先校验并二次确认，替换全部数据；普通“导入词表”只导入词汇内容。
