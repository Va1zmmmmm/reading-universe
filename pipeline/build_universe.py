# -*- coding: utf-8 -*-
"""阅读宇宙数据管线：theme_tags.json + books.json + themes/*.md → web/universe_data.js。

与 build_graph.py 完全独立（不动现有图谱构建）。按 bookId 直连：
- theme_tags.json 提供 333 本书的主题标签（39 个主题 = 星系）
- books.json 提供 readingTime（秒，恒星半径）与 notes.total（笔记密度，恒星亮度）
- themes/{主题}.md 嵌进星系节点，页面点星系弹主题卡（沿用 index.html 的 mdMini 渲染）

彗星（主题离群书）判定：标签两两共现余弦（pair_count / sqrt(tagA*tagB)）越低，
说明这本书的标签组合越偏离主流聚类。取均分最低的 20 本（≥2 标签的书里）。

用法：python build_universe.py
"""
import json
from collections import Counter
from datetime import datetime
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS_JSON = ROOT / "data" / "books.json"
THEME_TAGS = ROOT / "data" / "theme_tags.json"
THEME_CARDS = ROOT / "data" / "themes"
OUT = ROOT / "web" / "universe_data.js"

COMET_N = 3  # 彗星数量上限（克制：1-3 颗，细白渐隐尾巴）


def fmt_time(ts):
    if isinstance(ts, (int, float)) and ts:
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
    return str(ts) if ts else ""


def main():
    meta = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
    by_id = {b["bookId"]: b for b in meta.get("books", [])}
    tags_by_id = json.loads(THEME_TAGS.read_text(encoding="utf-8"))

    # 标签频率 + 标签对共现
    tag_count = Counter()
    pair_count = Counter()
    for bid, info in tags_by_id.items():
        tags = sorted(set(info.get("tags", [])))
        tag_count.update(tags)
        pair_count.update(combinations(tags, 2))

    def comet_score(tags):
        """标签组合与主流聚类的偏离度：共现余弦均值，越小越离群。"""
        pairs = list(combinations(sorted(set(tags)), 2))
        if not pairs:
            return 1.0  # 单标签无从谈偏离，给中性分
        return sum(pair_count.get(p, 0) / (tag_count[p[0]] * tag_count[p[1]]) ** 0.5
                   for p in pairs) / len(pairs)

    books = []
    for bid, info in tags_by_id.items():
        tags = sorted(set(info.get("tags", [])))
        if not tags:
            continue
        b = by_id.get(bid, {})
        # notes 兼容两种格式：int（脱敏版）或 {"total": n}（weread 原始）
        n_total = b.get("notes")
        if isinstance(n_total, dict):
            n_total = n_total.get("total", 0)
        books.append({
            "id": bid,
            "title": info.get("title") or b.get("title", ""),
            "author": b.get("author", ""),
            "rt": b.get("readingTime", 0),               # 阅读时长（秒）→ 恒星半径
            "notes": n_total or 0,                        # 笔记密度 → 恒星亮度
            "finished": bool(b.get("finished", b.get("finishTime"))),
            "tags": tags,
            # 主星系 = 该书最稀有的标签：把书挂进它最独特的星系，39 个星系分布更匀
            "theme": min(tags, key=lambda t: tag_count[t]),
            "_score": comet_score(tags),
        })

    # 彗星：偏离度最低的 N 本（并列取分数严格最低的）
    ranked = sorted((b for b in books if len(b["tags"]) >= 2), key=lambda b: b["_score"])
    comet_ids = {b["id"] for b in ranked[:COMET_N]}
    for b in books:
        b["comet"] = 1 if b["id"] in comet_ids else 0
        del b["_score"]

    themes = []
    for name, cnt in tag_count.most_common():
        t = {"name": name, "count": cnt}
        card_file = THEME_CARDS / f"{name}.md"
        if card_file.exists():
            t["card"] = card_file.read_text(encoding="utf-8")
        themes.append(t)

    data = {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "themes": themes,
        "books": books,
        "stats": {
            "books": len(books),
            "themes": len(themes),
            "comets": len(comet_ids),
            "totalHours": round(sum(b["rt"] for b in books) / 3600),
            "totalNotes": sum(b["notes"] for b in books),
        },
    }
    OUT.write_text("window.UNIVERSE = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n",
                   encoding="utf-8")
    print(f"书 {len(books)}，星系 {len(themes)}，彗星 {len(comet_ids)} → {OUT}")
    print("彗星样例：", [b["title"] for b in ranked[:5]])


if __name__ == "__main__":
    main()
