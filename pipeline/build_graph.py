# -*- coding: utf-8 -*-
"""生成完整版图谱 graph_data.js（图谱模式，含书间关联层）。

输入（全在仓库内 data/，脱敏数据）：
- books.json        书元数据（title/author/readingTime/notes/finished）
- theme_tags.json   书 → 主题标签
- themes/*.md       主题专题卡（可选，点枢纽弹卡）
- links.json        书间关联（export_links.py 从蒸馏卡 links 清洗导出）

生成图：
- book 节点 = 每本在库书
- theme 节点 = 39 主题（主题边连接书）
- ext_book / concept 节点 = 从 links.json 里被引用的库外书 / 概念词
- 书间关联边 = 一本书的 links 指向另一本在库书 → internal 边

用法：python pipeline/build_graph.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BOOKS_JSON = DATA / "books.json"
TAGS_JSON = DATA / "theme_tags.json"
LINKS_JSON = DATA / "links.json"
THEME_CARDS = DATA / "themes"
OUT = ROOT / "web" / "graph_data.js"

SEP = re.compile(r"[：:]|——|—")


def norm_title(t: str) -> str:
    return re.sub(r"\s+", "", t.strip())


def base_title(t: str) -> str:
    """书名主干：去括号注释、去冒号后副标题，用于别名对齐。"""
    t = re.sub(r"[（(].*?[)）]", "", t)
    t = re.split(r"[：:]", t)[0]
    return norm_title(t)


def main():
    meta = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
    books_meta = meta.get("books", [])
    tags_by_id = json.loads(TAGS_JSON.read_text(encoding="utf-8")) if TAGS_JSON.exists() else {}
    links = json.loads(LINKS_JSON.read_text(encoding="utf-8")) if LINKS_JSON.exists() else []

    # 在库书名表（别名解析用）
    in_lib = {}
    for b in books_meta:
        in_lib.setdefault(norm_title(b["title"]), b)
    base_index = {}
    for name in in_lib:
        base_index.setdefault(base_title(name), name)

    def resolve(dst: str) -> str | None:
        """把关联目标解析到库内书名；解析不到返回 None（就是库外）。"""
        n = norm_title(dst)
        if n in in_lib:
            return n
        cands = [k for k, v in base_index.items() if v == n]  # noqa
        # base 名唯一命中 → 库内
        hits = [name for bname, name in base_index.items() if norm_title(bname) == base_title(dst)]
        if len(hits) == 1:
            return hits[0]
        return None

    nodes, node_ids = {}, {}
    edges = []

    def nid(name):
        if name not in node_ids:
            node_ids[name] = f"n{len(node_ids)}"
        return node_ids[name]

    # 1. 在库书节点
    for b in books_meta:
        title = b.get("title", "")
        nodes[nid(title)] = {
            "id": nid(title), "label": title, "group": "book",
            "author": b.get("author", ""), "mentions": 0,
        }

    # 2. 主题节点 + 主题边
    theme_nodes = {}
    tag_count = {}
    for bid, info in tags_by_id.items():
        for t in info.get("tags", []):
            tag_count[t] = tag_count.get(t, 0) + 1
    for bid, info in tags_by_id.items():
        title = info.get("title", "")
        if norm_title(title) not in in_lib:
            continue
        for t in info.get("tags", []):
            tid = nid(f"theme::{t}")
            theme_nodes.setdefault(t, tid)
            edges.append({"from": nid(title), "to": tid, "title": f"主题：{t}",
                          "internal": False, "theme": True})

    # 3. 关联层：从 links.json 解析书间关联 / 外部书 / 概念
    link_edges = {}  # (src, dst) -> {kind, descs}
    for item in links:
        src = item.get("source", "")
        sn = norm_title(src)
        if sn not in in_lib:
            continue  # 源书不在库内（无卡），跳过
        for l in item.get("links", []):
            target = l.get("target", "")
            kind = l.get("type", "concept")
            desc = l.get("desc", "")
            dst_in = resolve(target) if kind != "concept" else None
            if dst_in:
                kind = "book"
                dst = dst_in
            else:
                dst = target.strip(" -—:：《》")
                if not dst:
                    continue
                # 行内若含《》但解析不到库内 → 当库外书；否则是概念
                if "《" in target or kind == "ext_book":
                    kind = "ext_book"
                else:
                    kind = "concept"
            if dst == src:
                continue
            key = (src, dst)
            if key not in link_edges:
                link_edges[key] = {"kind": kind, "descs": []}
            if desc:
                link_edges[key]["descs"].append(desc)

    # 概念节点只保留被 ≥2 本连到的（去噪音，与原版一致）
    concept_deg = {}
    for (s, d), e in link_edges.items():
        if e["kind"] == "concept" and norm_title(d) not in in_lib:
            concept_deg[d] = concept_deg.get(d, 0) + 1
    link_edges = {k: e for k, e in link_edges.items()
                  if not (e["kind"] == "concept" and norm_title(k[1]) not in in_lib
                          and concept_deg[k[1]] < 2)}

    ext_count = {}
    for (s, d), e in link_edges.items():
        ext_count[s] = ext_count.get(s, 0) + 1
        ext_count[d] = ext_count.get(d, 0) + 1

    # 建关联节点 + 边
    for (s, d), e in link_edges.items():
        # 源节点确保在库
        if norm_title(s) not in in_lib:
            continue
        dn = norm_title(d)
        if dn in in_lib:
            nd = nid(d)  # 已在库书节点
        else:
            nd = nid(d)
            if nd not in {x["id"] for x in nodes.values()}:
                nodes[nd] = {"id": nd, "label": d, "group": e["kind"], "mentions": ext_count[d]}
        # 加 mentions
        edges.append({"from": nid(s), "to": nd,
                      "title": "\n".join(f"· {x}" for x in e["descs"]) or "（无描述）",
                      "internal": dn in in_lib})

    # 主题节点本体
    for tag, tid in theme_nodes.items():
        n = sum(1 for e in edges if e.get("theme") and e["to"] == tid)
        node = {"id": tid, "label": tag, "group": "theme", "mentions": n}
        card_file = THEME_CARDS / f"{tag}.md"
        if card_file.exists():
            node["card"] = card_file.read_text(encoding="utf-8")
        if tid in nodes:
            nodes[tid].update(node)
        else:
            nodes[tid] = node

    # 补 mentions（book 节点：被关联次数）
    for b in books_meta:
        title = b["title"]
        if title in node_ids:
            nodes[node_ids[title]]["mentions"] = ext_count.get(title, 0)

    graph = {
        "nodes": list(nodes.values()),
        "edges": edges,
        "stats": {
            "books": sum(1 for n in nodes.values() if n["group"] == "book"),
            "read": 0,
            "external": sum(1 for n in nodes.values() if n["group"] in ("ext_book", "concept")),
            "themes": len(theme_nodes),
            "edges": len(edges),
        },
    }
    OUT.write_text("window.GRAPH = " + json.dumps(graph, ensure_ascii=False, indent=1) + ";\n",
                   encoding="utf-8")
    print("图谱 stats:", graph["stats"])
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
