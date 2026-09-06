# -*- coding: utf-8 -*-
"""自动给书打主题标签 → theme_tags.json（复现链路第 3 步）。

别人的书没有现成 theme_tags.json 时，用本脚本生成：
- 输入：data/books.json（必有）+ data/highlights/（可选，有划线原文打标更准）
- 方法：逐书把书名/作者/（划线摘要）发给 LLM，按 data/theme_wordlist.md 的 39 词表挑 1-5 个标签
- 输出：data/theme_tags.json  {bookId: {title, tags: [...]}}

两种模式：
1. LLM 自动（默认）：需环境变量 LLM_API_KEY（DeepSeek 或 OpenAI 兼容），走 OpenAI 兼容 chat API
2. 手动：--manual 时只输出「书名 → 候选词表」清单到 data/_tagging_sheet.md，你自己填标签后我合并

用法：
    python pipeline/tag_books.py                 # LLM 自动打标（需 LLM_API_KEY）
    python pipeline/tag_books.py --manual        # 手动模式：生成待填表
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BOOKS = DATA / "books.json"
OUT = DATA / "theme_tags.json"
WORDLIST = DATA / "theme_wordlist.md"

BATCH = 20          # 每批多少本书
MAX_TAGS = 5        # 单本最多几个标签


def load_wordlist() -> str:
    if WORDLIST.exists():
        return WORDLIST.read_text(encoding="utf-8")[:3000]
    return "主题词表：存在主义/孤独/死亡/亲密关系/原生家庭/自我认同/自由/荒诞/文学/历史与记忆/社会观察/女性与性别/教育与成长/科幻/推理/心理/情绪/生活/传记/轻小说/哲学/宗教/科学/消费/媒介/写作/华语/欧美/日本/韩国/中国古典"


def llm_tag(title: str, author: str, highlights: str, wordlist: str, api_key: str, endpoint: str, model: str) -> list:
    """调 OpenAI 兼容 chat API 让 LLM 按词表打标。"""
    sys_prompt = (
        "你是阅读主题打标器。给一本书选 1~5 个主题标签，只能从给定词表里选，"
        "输出 JSON 数组如 [\"存在主义\",\"孤独\"]。选标签要有依据，宁可少打不要硬凑。"
        "\n词表:\n" + wordlist
    )
    user = f"书名：《{title}》 作者：{author}"
    if highlights:
        user += f"\n划线摘录（据此判断主题，最多给前600字）:\n{highlights[:600]}"
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": 200,
    }).encode()
    req = urllib.request.Request(endpoint, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + api_key,
    })
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
        content = resp["choices"][0]["message"]["content"]
        # 提取 JSON 数组
        import re
        m = re.search(r"\[.*?\]", content, re.S)
        if not m:
            return []
        arr = json.loads(m.group(0))
        return [str(t).strip() for t in arr if isinstance(t, str)][:MAX_TAGS]
    except Exception as e:
        print(f"  ⚠ {title}: LLM 失败 {e}")
        return []


def main():
    if not BOOKS.exists():
        print("没找到 data/books.json —— 先跑 python pipeline/sync_from_weread.py")
        sys.exit(1)
    meta = json.loads(BOOKS.read_text(encoding="utf-8"))
    books = meta["books"]
    wordlist = load_wordlist()

    manual = "--manual" in sys.argv
    highlights_dir = DATA / "highlights"

    def get_highlights(bid):
        f = highlights_dir / f"{bid}.json"
        if f.exists():
            try:
                items = json.loads(f.read_text(encoding="utf-8"))
                return " ".join((it.get("markText") or "") for it in items)[:800]
            except Exception:
                return ""
        return ""

    if manual:
        # 手动模式：输出待填表
        sheet = ["# 打标待填表（手动模式）\n",
                 "每行一本：书名｜建议标签(从词表选,逗号分隔)。词表见 theme_wordlist.md\n"]
        for b in books:
            sheet.append(f"{b['title']}｜{b.get('author','')}｜")
        (DATA / "_tagging_sheet.md").write_text("\n".join(sheet), encoding="utf-8")
        print(f"手动模式：已生成 {DATA / '_tagging_sheet.md'}，填好后告诉我合并")
        return

    # LLM 模式
    api_key = os.environ.get("LLM_API_KEY")
    endpoint = os.environ.get("LLM_ENDPOINT", "https://api.deepseek.com/chat/completions")
    model = os.environ.get("LLM_MODEL", "deepseek-chat")
    if not api_key:
        print("需要环境变量 LLM_API_KEY（DeepSeek/OpenAI 兼容 key）。或用 --manual 手动打标。")
        sys.exit(1)

    tags = {}
    # 已有标签保留（增量续打）
    if OUT.exists():
        tags = json.loads(OUT.read_text(encoding="utf-8"))

    todo = [b for b in books if b.get("bookId") not in tags or not tags[b["bookId"]].get("tags")]
    print(f"待打标 {len(todo)} 本 / 共 {len(books)} 本（分批 {BATCH}）")
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        for b in batch:
            bid = b.get("bookId")
            hl = get_highlights(bid)
            t = llm_tag(b.get("title", ""), b.get("author", ""), hl, wordlist,
                        api_key, endpoint, model)
            tags[bid] = {"title": b.get("title", ""), "tags": t}
            print(f"  [{i + batch.index(b) + 1}/{len(todo)}] 《{b.get('title')}》 → {t}")
        # 每批落一次盘，防中断丢进度
        (DATA / "theme_tags.json").write_text(
            json.dumps(tags, ensure_ascii=False, indent=1), encoding="utf-8")
    n_tagged = sum(1 for v in tags.values() if v.get("tags"))
    print(f"✅ 打标完成 → {OUT}（{n_tagged} 本有标）")
    print("下一步: python pipeline/build_universe.py")


if __name__ == "__main__":
    main()
