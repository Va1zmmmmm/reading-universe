# 数据格式

## 导入书目

```json
{"books":[{"bookId":"book-a","title":"书名","author":"作者","readingTime":3600,"notes":3,"highlights":[{"text":"自己的划线"}],"annotations":[{"text":"自己的笔记"}]}]}
```

ID 必填且唯一；可用 id 代替 bookId。书目字段支持 weread-skill 现有缓存格式：notes 为对象时取 total，finishTime/affectionScore/myReview 保留在私人项目。
合并别名字段 mergedInto 非空时跳过该条，原文件不改写。

资料目录可含 books.json、highlights/{id}.json（数组、markText/text/content）、notes/{id}.md、cards/{id}.md、cards/links/*.md、theme_tags.json、themes/*.md 和 links.json。ID 对接书目，标题只用于旧关联资料的辅助匹配。

## 私人项目

format=reading-universe-private，version=1。包含 books（标准化元数据和 evidence）、analysis（标签/摘要/证据ID/缓存指纹）、links、linkCache、cards、edits、settings。
evidence 含 id/text/kind/source/included；可逐条关闭用于 AI 分析。edits 独立保留主题、卡片、人工关联与移除配对；settings 有 wordlist 和 aliases。
导入时仅接收已定义字段，忽略 key、cookie、会话令牌等字段。

links 为 source/target/targetType/type/reason/evidenceIds/basis；targetType 为 book/concept/external，type 为 same_topic/complement/contrast/reference，basis 为 evidence/manual/imported。引用无法回溯到原书时标为 imported。

## 公开网站包

不直接导出私人项目。根据所选书目重建 graph_data.js/universe_data.js 与专题卡；只包含书名、作者、主题、可选指标和在库书的关联拓扑。原文、日期、评分和自由文字不输出。
包内 index.html、viewer-data.js、universe.js、lib/vis-network.min.js 及数据脚本可直接离线打开。

## 兼容快照

node tools/cli.mjs --workspace <目录> --compat <输出数据目录> 可导出 theme_tags.json（bookId → title/tags）与 themes/*.md，供年度报告/音乐项目使用。不要把兼容快照设为第二个编辑源。
reading-map 原有 build_graph.py/build_universe.py 作为适配入口调用同一核心，读取上游与现有标签，不改写上游资料或现有标签/专题卡。
