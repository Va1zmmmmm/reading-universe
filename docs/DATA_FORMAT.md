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

## 探索内容与旧包往返

私人包可带 name、exploration:{version:1,themes:[]} 和 journey。书目保留 included/cover/tags，材料稳定ID最多250字符，不因保存重编号；sourceLocator 可带 ordinal/bookmarkId。已保存包按完整材料恢复，单书2000条/总100000条/单材料100000字，超限明确拒绝；原始图谱资料的100条采样策略不影响完整包恢复。

exploration 每主题有 id/name/title/opening/entry/start/endTitle/endBody/nodes，可选 basis=ai-draft/curated；节点有 id/title/subtitle/context/quote/observation/choices，quote 用 bookId/evidenceId/excerpt 回查逐字原文；choices 具备 target/label/hint/bridge。排除项、伪引文、断路、不可达和无效保存状态拒绝整份导入。journey 各主题恢复首次来路、当前位置、线索袋和笔记，不保存模型/key。

正式 core.mjs 接受旧 reading-atlas-workspace v1。探索契约统一在 atlas-project.mjs；旧探索包的 universe 扩展保留 analysis/links/linkCache/cards/edits/settings 和原书目bookTags，字段由 universe-fields.mjs 重建。正式探索页保存 reading-universe-private v1，两页可以往返已定义的数据。未知字段不保留；旧包过去未保存的数据无法补回。

## 公开网站包

不直接导出私人项目。根据所选书目重建 graph_data.js/universe_data.js 与专题卡；只包含书名、作者、主题、可选指标和在库书的关联拓扑。原文、日期、评分和自由文字不输出。
包内 index.html、viewer-data.js、universe.js、lib/vis-network.min.js 及数据脚本可直接离线打开。

显式启用探索时另含 reading-atlas-public v1：books 只含 id/title/author；themes 有重新编号的 id、basis、name/title/opening/entry/start/endTitle/endBody/nodes。节点有重新编号的 id、title/subtitle/context/observation、bookId/materialKind、choices；quote 可省略，存在时只含经源材料逐字核验、单独确认公开的 excerpt。去路仅保留选中目标；缺开场、不可达、未确认解读或文字引用隐藏书目拒绝导出。未选择引文的节点仍有完整解读，读者看到原文未公开提示。

公开探索不含 evidenceId/source/sourceLocator、journey/个人笔记/收藏、完整材料、模型与 key。index.html/public-reader.js/public-reader.css/public-data.js 组成无依赖离线探索入口，原图谱在 graph.html（?universe 查看星空）。工具 tools/build_public_reader.mjs 将公开契约与渲染器打包；不引入任何私人项目模块。访客历史只保留首次发现的已公开节点（最多200处/主题），放在当页内存/路由中，回看不增加重复条目；不同主题各自独立，不使用浏览器持久存储。

## 兼容快照

node tools/cli.mjs --workspace <目录> --compat <输出数据目录> 可导出 theme_tags.json（bookId → title/tags）与 themes/*.md，供年度报告/音乐项目使用。不要把兼容快照设为第二个编辑源。
reading-map 原有 build_graph.py/build_universe.py 作为适配入口调用同一核心，读取上游与现有标签，不改写上游资料或现有标签/专题卡。
