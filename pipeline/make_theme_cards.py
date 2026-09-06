# -*- coding: utf-8 -*-
"""生成主题专题卡 data/themes/*.md（复现链路第 4 步）。

主题卡 = 每个主题一张 .md，点星系时弹卡展示「这个主题你读过哪些书 + 主题怎么演变」。
从 books.json + theme_tags.json 自动生成骨架（书目清单），主题轨迹需你自己补一两句
（或用 LLM 模式让 AI 按你的阅读数据写轨迹）。

两种模式：
1. 骨架模式（默认）：只生成书目清单，轨迹留空待补
2. LLM 模式（--llm）：让 AI 根据书目生成「主题轨迹」（哪本提出/推进/翻转），需 LLM_API_KEY

用法：
    python pipeline/make_theme_cards.py           # 骨架
    python pipeline/make_theme_cards.py --llm     # AI 写轨迹（需 LLM_API_KEY）
"""
import json
import os
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BOOKS = DATA / "books.json"
TAGS = DATA / "theme_tags.json"
OUT_DIR = DATA / "themes"


def load():
    meta = json.loads(BOOKS.read_text(encoding="utf-8"))
    by_id = {b["bookId"]: b for b in meta["books"]}
    tags_by_id = json.loads(TAGS.read_text(encoding="utf-8"))
    return by_id, tags_by_id


def build_skeleton():
    by_id, tags_by_id = load()
    # theme -> [(title, finished)]
    theme_books = defaultdict(list)
    for bid, info in tags_by_id.items():
        b = by_id.get(bid, {})
        title = info.get("title") or b.get("title", "")
        for t in info.get("tags", []):
            theme_books[t].append(title)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for theme, titles in theme_books.items():
        out_file = OUT_DIR / f"{theme}.md"
        if out_file.exists():
            # 已存在（可能是作者的真实润色卡）——不覆盖
            continue
        lines = [f"# 主题卡：{theme}", "", f"- 书目：{len(titles)} 本"]
        for t in titles:
            lines.append(f"  - 《{t}》")
        lines += ["", "- 主题轨迹：（补一两句——这个主题在你的阅读里怎么演变的）", "",
                  "- 交界：（可选——最常和它共现的主题是哪些？）", ""]
        out_file.write_text("\n".join(lines), encoding="utf-8")
    return dict(theme_books)


def llm_trajectory(theme, titles, api_key, endpoint, model):
    sys_p = ("你是阅读轨迹写手。根据一个主题下的书目清单，写一小段『主题轨迹』："
             "这些书里谁最先提出这个母题、哪些书推进或翻转了它、最后落定在哪。"
             "不要编造书里没有的内容，只从书名/作者做合理推断，克制、平实，60-120字。")
    user = f"主题：{theme}\n相关书目：{'、'.join(titles[:30])}"
    body = json.dumps({"model": model,
                       "messages": [{"role": "system", "content": sys_p},
                                    {"role": "user", "content": user}],
                       "temperature": 0.4, "max_tokens": 300}).encode()
    req = urllib.request.Request(endpoint, data=body, headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + api_key})
    resp = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    return resp["choices"][0]["message"]["content"].strip()


def main():
    use_llm = "--llm" in sys.argv
    theme_books = build_skeleton()
    print(f"骨架完成：{len(theme_books)} 个主题 → {OUT_DIR}")

    if use_llm:
        api_key = os.environ.get("LLM_API_KEY")
        endpoint = os.environ.get("LLM_ENDPOINT", "https://api.deepseek.com/chat/completions")
        model = os.environ.get("LLM_MODEL", "deepseek-chat")
        if not api_key:
            print("LLM 模式需要环境变量 LLM_API_KEY"); return
        for theme, titles in theme_books.items():
            try:
                traj = llm_trajectory(theme, titles, api_key, endpoint, model)
                f = OUT_DIR / f"{theme}.md"
                txt = f.read_text(encoding="utf-8").replace(
                    "- 主题轨迹：（补一两句——这个主题在你的阅读里怎么演变的）",
                    "- 主题轨迹：" + traj)
                f.write_text(txt, encoding="utf-8")
                print(f"  ✎ {theme}: {traj[:40]}...")
            except Exception as e:
                print(f"  ⚠ {theme} 失败: {e}")
        print("LLM 轨迹补全完成。之后：python pipeline/build_universe.py")


if __name__ == "__main__":
    main()
