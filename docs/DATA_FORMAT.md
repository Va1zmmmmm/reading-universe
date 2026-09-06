# 数据格式说明（DATA_FORMAT）

本仓库三份输入数据的字段级说明。想用自己的数据复现，把这三份对齐即可。

## data/books.json —— 书单元数据

```json
{
  "totalBooks": 336,
  "books": [
    {
      "bookId": "36212379",
      "title": "镜子之家（三岛由纪夫作品系列）",
      "author": "三岛由纪夫",
      "readingTime": 9353,
      "notes": 57,
      "finished": true
    }
  ]
}
```

| 字段 | 类型 | 用途 | 必填 |
|---|---|---|---|
| `bookId` | string | 唯一 ID（对接 theme_tags） | ✅ |
| `title` | string | 书名（恒星/节点显示） | ✅ |
| `author` | string | 作者 | ✅ |
| `readingTime` | number | 阅读秒数 → 恒星半径 / 节点大小 | ✅（无则 0） |
| `notes` | number | 笔记数 → 恒星亮度 | ✅（无则 0） |
| `finished` | bool | 是否读完（布局/星尘层） | 可选 |

> `readingTime` 和 `notes` 是唯一真正参与视觉映射的字段。脱敏版不含逐书读完日期/评分/书评/封面。

## data/theme_tags.json —— 书 → 主题标签

```json
{
  "36212379": { "title": "镜子之家（三岛由纪夫作品系列）", "tags": ["三岛由纪夫", "自我认同", "死亡"] }
}
```

每本书 1~5 个标签，标签词自由（不限于内置词表）。标签决定书属于哪些星系。
标签来自你的判断——它是这本书在你阅读里的"归属"。

## data/themes/*.md —— 主题专题卡（可选，但强烈建议）

文件名 = 主题名。点星系时弹卡展示。结构：

```markdown
# 主题卡：死亡

- 书目：70 本
  - 《失明症漫记（罗翔推荐）》
  - 《第七天》

- 主题轨迹：（可选，可 AI 生成）这个主题在你的阅读里怎么演变——哪本最先提出、哪些推进/翻转、最终落定。

- 交界：（可选）与它最常共现的主题。
```

## 从微信读书数据生成这三份

1. **books.json**：weread-skill `sync.mjs` 导出原始 books.json → `python pipeline/sync_from_weread.py <目录>` 转成上面的脱敏格式
2. **theme_tags.json**：`python pipeline/tag_books.py`（AI 按 39 词表打标，见 data/theme_wordlist.md）
3. **themes/*.md**：`python pipeline/make_theme_cards.py`（骨架）+ 人工/AI 补轨迹

任何能产出上面结构的工具都行，不限定 weread-skill。
