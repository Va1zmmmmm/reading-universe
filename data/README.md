# data/ 说明

`data/` 是**输入目录**：放着构建星图所需的三种数据（books.json / theme_tags.json / themes/*.md）。
clone 后无需任何操作即可看效果——仓库自带**作者真实脱敏数据**已跑好构建（见 `web/`）。

## 本仓库自带的真实脱敏数据

| 文件 | 内容 | 规模 |
|---|---|---|
| `books.json` | 作者真实读过的书（脱敏） | 336 本 |
| `theme_tags.json` | 每本书的主题标签 | 333 本（268 本有标） |
| `themes/*.md` | 39 个主题专题卡（去金句/日期） | 39 张 |
| `theme_wordlist.md` | 39 词表（打标口径） | 39 标签 |

**脱敏说明**：这些是作者真实阅读数据，但只含聚合字段（书名/作者/主题标签/阅读时长/笔记数），
**不含**划线原文、逐书读完日期、评分、书评。想公开你的版本，也请保持这个边界。

## 换用自己的数据

1. `python pipeline/sync_from_weread.py <你的weread数据目录>` → 覆盖 `books.json`
2. `python pipeline/tag_books.py` → 生成你自己的 `theme_tags.json`（AI 打标需 `LLM_API_KEY`）
3. `python pipeline/make_theme_cards.py` → 生成主题卡
4. `python pipeline/build_universe.py && python pipeline/make_graph.py` → 重构建

详见根 `README.md` 和 `docs/DATA_FORMAT.md`。
