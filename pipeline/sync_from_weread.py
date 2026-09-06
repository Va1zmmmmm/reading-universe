# -*- coding: utf-8 -*-
"""把 weread-skill 导出的数据 → 本项目 data/ 标准格式。

用法（别人复现时）：
    python pipeline/sync_from_weread.py <你的weread数据目录>
    # 例: python pipeline/sync_from_weread.py ~/weread-skill/data
    # 你的目录里需要: books.json（微信读书缓存格式，由 weread-skill sync.mjs 产出）

它把你 weread-skill 的 books.json 转成项目标准 data/books.json：
- 只保留 title/author/readingTime/notes 等聚合字段
- 自动剔除逐书读完日期、评分、书评、封面（隐私红线：只发布聚合可视化）

你也可以不用 weread-skill——只要你的数据符合下方「输入格式」，都能转。
输入 books.json 形如:
    { "books": [ { "bookId","title","author","readingTime","finishTime","notes":{...} }, ... ] }

输出: data/books.json（覆盖仓库自带的脱敏样例，跑你自己的数据）
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def convert(books_json_path: Path) -> dict:
    meta = json.loads(Path(books_json_path).read_text(encoding="utf-8-sig"))
    clean = []
    for b in meta.get("books", []):
        clean.append({
            "bookId": b.get("bookId"),
            "title": b.get("title", ""),
            "author": b.get("author", ""),
            "readingTime": b.get("readingTime", 0),
            "notes": (b.get("notes") or {}).get("total", 0)
                     if isinstance(b.get("notes"), dict) else (b.get("notes") or 0),
            "finished": bool(b.get("finishTime")),
        })
    return {"totalBooks": len(clean),
            "note": "由 sync_from_weread.py 生成：聚合字段，无逐书日期/评分/书评。",
            "books": clean}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("错误：请传入你的 weread-skill 数据目录（含 books.json）")
        sys.exit(1)
    src_dir = Path(sys.argv[1])
    src = src_dir / "books.json"
    if not src.exists():
        print(f"在 {src_dir} 下没找到 books.json")
        sys.exit(1)

    DATA.mkdir(parents=True, exist_ok=True)
    out = convert(src)
    (DATA / "books.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ 已转换 {out['totalBooks']} 本书 → {DATA / 'books.json'}")
    print("下一步: 给书打主题标签 python pipeline/tag_books.py（或放入自己的 theme_tags.json）")


if __name__ == "__main__":
    main()
