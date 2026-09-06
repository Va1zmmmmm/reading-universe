# 阅读宇宙 · Reading Universe

把读过的书变成一片可以逛的星空。每颗星是一本书，星系是主题，点开一本书/一个星系能看到它在你阅读史里的位置与关联。

纯前端静态站，**零后端、零依赖**，`file://` 直接打开即可用，也适合任何静态托管。

![universe 预览](docs/screenshot-universe.png)

## 它长什么样

- **宇宙模式**（`?universe`）：恒星 = 书（越亮 = 笔记越多，越大 = 读得越久），星系 = 主题，彗星 = 主题离群的书。拖拽平移、滚轮缩放、搜索书名直达。
- **图谱模式**（默认 / `?poster`）：书 × 主题 × 关联的知识网络视图。

仓库自带一套 **54 本公共领域经典 + 19 个主题**的示例数据，克隆下来 `python pipeline/make_demo_data.py && python pipeline/build_universe.py` 就能看到完整效果。

## 用自己的书生成星图（30 分钟）

项目核心是"你自己的阅读数据 → 这张图"。只需准备三个数据文件，放在 `data/`：

| 文件 | 内容 | 格式 |
|---|---|---|
| `data/books.json` | 每本书的元数据 | `{books: [{bookId, title, author, readingTime, finishTime, notes, affectionScore, affectionLevel}]}` |
| `data/theme_tags.json` | 每本书打了哪些主题标签 | `{bookId: {title, tags: ["存在主义", "孤独"]}}` |
| `data/themes/*.md` | 每个主题的专题卡（可选，点星系弹卡用） | `# 主题卡：存在主义` + `- 书目：` + `- 主题轨迹：` |

然后：

```bash
python pipeline/build_universe.py   # 宇宙模式数据
python pipeline/make_demo_graph.py  # 图谱模式数据（从 books+tags 简化生成）
```

浏览器打开 `web/index.html?universe` 即是宇宙，`web/index.html` 是图谱。

> 如果你用读书 App / 笔记工具管理自己的阅读，可以先把书导出、标注成上面三种格式；`data/README.md` 有逐字段说明与示例。

## 主题标签从哪来

39 个主题标签是通用阅读主题词（存在主义、孤独、死亡、亲密关系、原生家庭、自我认同……），不是平台数据。给书打标签 = 你决定每本书在星图里的归属，打标粒度直接决定星系长什么样。

## 复现管线

```
读书/划线 → (可选) AI 蒸馏成主题标签 → data/theme_tags.json + data/books.json
          → build_universe.py → web/universe_data.js → 浏览器渲染宇宙
          → make_demo_graph.py → web/graph_data.js → 浏览器渲染图谱
```

每个环节都是可读的小脚本，`data/` 里的示例数据由 `make_demo_data.py` 生成，跑一遍即可完整复现仓库里的图。

## 部署

任意静态托管即可（GitHub Pages / Nginx / Vercel / 对象存储）。参考 `docs/DEPLOY.md`。整个目录无构建步骤——`web/` 就是可发布的静态站。

## 隐私说明

本项目只做**聚合可视化**：星图展示的是书名、主题分布与相对阅读时长，不含划线原文、书评内容等个人文本。数据文件放你的本地或私有仓库，公开部署前请自行确认不含不想公开的内容（示例数据是合成的，可放心公开）。

## License

MIT
