# -*- coding: utf-8 -*-
"""生成 graph_data.js（图谱模式数据）。

图谱从「书 + 主题标签」直接生成：
- 每本书 = book 节点
- 每本书连到它的主题标签（theme 节点）
数据来自仓库内 data/（books.json + theme_tags.json），默认是作者的真实脱敏数据；
换成你自己的数据后重跑即可得到你的图谱。

用法：python pipeline/make_graph.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS_JSON = ROOT / "data" / "books.json"
THEME_TAGS = ROOT / "data" / "theme_tags.json"
OUT = ROOT / "web" / "graph_data.js"


def main():
    meta = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
    by_id = {b["bookId"]: b for b in meta["books"]}
    tags_by_id = json.loads(THEME_TAGS.read_text(encoding="utf-8"))

    nodes = []
    edges = []
    node_id = {}
    theme_ids = {}

    def nid(name):
        if name not in node_id:
            node_id[name] = f"n{len(node_id)}"
        return node_id[name]

    for bid, info in tags_by_id.items():
        b = by_id.get(bid, {})
        title = info.get("title") or b.get("title", "")
        n = {
            "id": nid(title), "label": title, "group": "book",
            "author": b.get("author", ""),
            "mentions": 0,
        }
        nodes.append(n)
        for tag in info.get("tags", []):
            tid = nid(f"theme::{tag}")
            theme_ids.setdefault(tag, tid)
            edges.append({"from": n["id"], "to": tid,
                          "title": f"主题：{tag}", "internal": False, "theme": True})

    for tag, tid in theme_ids.items():
        cnt = sum(1 for e in edges if e.get("theme") and e["to"] == tid)
        nodes.append({"id": tid, "label": tag, "group": "theme", "mentions": cnt})

    graph = {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "books": sum(1 for n in nodes if n["group"] == "book"),
            "read": 0,
            "external": 0,
            "themes": len(theme_ids),
            "edges": len(edges),
        },
    }
    OUT.write_text("window.GRAPH = " + json.dumps(graph, ensure_ascii=False, indent=1) + ";\n",
                   encoding="utf-8")
    print(f"demo graph: 书 {graph['stats']['books']} / 主题 {graph['stats']['themes']} / 边 {graph['stats']['edges']} → {OUT}")


if __name__ == "__main__":
    main()
