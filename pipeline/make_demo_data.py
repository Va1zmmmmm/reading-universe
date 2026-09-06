# -*- coding: utf-8 -*-
"""生成 reading-universe 的合成示例数据（GitHub demo 用，零真实阅读数据）。

产出三种输入文件（与真实管线同构）：
- data/books.json        书元数据（虚构阅读时长/笔记/评分，无任何真实读书记录）
- data/theme_tags.json   书 → 主题标签（3-5 个）
- data/themes/*.md       主题专题卡（书目 + 主题轨迹 + 交界，全部虚构或公共常识，无真实划线金句）

书目用公共领域经典（无版权）+ 少量当代通识书作占位；标签从 39 个公开主题词里取；
时长/评分随机生成，仅作布局演示。

用法：python pipeline/make_demo_data.py
输出到仓库 data/ 目录，可直接跑 build_graph.py / build_universe.py。
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
THEMES = DATA / "themes"

# 主题词（通用阅读主题标签：存在主义/亲密关系/科幻…），用户可按自己的书单体系替换
THEME_POOL = [
    "存在主义", "孤独", "死亡", "亲密关系", "原生家庭", "自我认同", "自由",
    "荒诞", "西方哲学", "文学批评", "写作技法", "历史与记忆", "社会观察",
    "女性与性别", "贫困与阶层", "教育与成长", "工作与职场", "科幻与幻想",
    "推理悬疑", "心理治疗", "情绪与内耗", "村上春树", "三岛由纪夫", "日本文学",
    "华语文学", "欧美文学", "韩国文学", "消费主义", "媒介与社会", "生活随笔",
    "传记与回忆录", "轻小说与漫画", "佛学与禅", "法治与正义", "精神疾病",
    "流亡", "科学", "宗教信仰", "中国古典思想",
]

# 公共领域经典 + 通用占位书（书名公开，无版权引用）
BOOKS = [
    # (title, author, category-ish)
    ("局外人", "阿尔贝·加缪"), ("西西弗神话", "阿尔贝·加缪"),
    ("存在与虚无", "让-保罗·萨特"), ("恶心", "让-保罗·萨特"),
    ("地下室手记", "陀思妥耶夫斯基"), ("卡拉马佐夫兄弟", "陀思妥耶夫斯基"),
    ("罪与罚", "陀思妥耶夫斯基"), ("安娜·卡列尼娜", "列夫·托尔斯泰"),
    ("战争与和平", "列夫·托尔斯泰"), ("审判", "卡夫卡"),
    ("城堡", "卡夫卡"), ("变形记", "卡夫卡"),
    ("追忆似水年华", "马塞尔·普鲁斯特"), ("尤利西斯", "詹姆斯·乔伊斯"),
    ("百年孤独", "加西亚·马尔克斯"), ("霍乱时期的爱情", "加西亚·马尔克斯"),
    ("1984", "乔治·奥威尔"), ("动物农场", "乔治·奥威尔"),
    ("美丽新世界", "赫胥黎"), ("瓦尔登湖", "梭罗"),
    ("查拉图斯特拉如是说", "尼采"), ("悲剧的诞生", "尼采"),
    ("梦的解析", "弗洛伊德"), ("规训与惩罚", "福柯"),
    ("第二性", "西蒙娜·德·波伏娃"), ("存在主义是一种人道主义", "萨特"),
    ("地下室手记·白夜", "陀思妥耶夫斯基"), ("红楼梦", "曹雪芹"),
    ("西游记", "吴承恩"), ("呐喊", "鲁迅"),
    ("彷徨", "鲁迅"), ("朝花夕拾", "鲁迅"),
    ("围城", "钱锺书"), ("边城", "沈从文"),
    ("平凡的世界", "路遥"), ("活着", "余华"),
    ("许三观卖血记", "余华"), ("苏东坡传", "林语堂"),
    ("乡土中国", "费孝通"), ("美的历程", "李泽厚"),
    ("射雕英雄传", "金庸"), ("天龙八部", "金庸"),
    ("三体", "刘慈欣"), ("球状闪电", "刘慈欣"),
    ("北京折叠", "郝景芳"), ("长安的荔枝", "马伯庸"),
    ("显微镜下的大明", "马伯庸"), ("文化苦旅", "余秋雨"),
    ("人间词话", "王国维"), ("谈美", "朱光潜"),
    ("哲学家们都干了些什么", "林欣浩"), ("被讨厌的勇气", "岸见一郎/古贺史健"),
    ("非暴力沟通", "马歇尔·卢森堡"), ("思考，快与慢", "丹尼尔·卡尼曼"),
]

# 主题 → 该主题下书的模糊度（仅演示聚类）
AFF_LEVELS = ["一般", "不错", "喜爱", "极爱"]
AFF_SCORE = {"一般": 2.0, "不错": 5.5, "喜爱": 9.0, "极爱": 13.0}


def pick_tags(title: str, author: str) -> list:
    """按书/作者给主题标签（规则简单，仅供演示布局）。"""
    zh = title in {"红楼梦", "西游记", "呐喊", "彷徨", "朝花夕拾", "围城", "边城",
                   "平凡的世界", "活着", "许三观卖血记", "乡土中国", "美的历程",
                   "苏东坡传", "射雕英雄传", "天龙八部", "三体", "球状闪电", "北京折叠",
                   "长安的荔枝", "显微镜下的大明", "文化苦旅", "人间词话", "谈美"}
    euro = author in {"阿尔贝·加缪", "让-保罗·萨特", "陀思妥耶夫斯基", "列夫·托尔斯泰",
                      "卡夫卡", "马塞尔·普鲁斯特", "詹姆斯·乔伊斯", "加西亚·马尔克斯",
                      "乔治·奥威尔", "赫胥黎", "梭罗", "尼采", "弗洛伊德", "福柯",
                      "西蒙娜·德·波伏娃", "丹尼尔·卡尼曼", "马歇尔·卢森堡",
                      "岸见一郎/古贺史健"}
    tags = []
    if author == "让-保罗·萨特":
        tags += ["存在主义", "西方哲学"]
    if author == "阿尔贝·加缪":
        tags += ["存在主义", "荒诞", "死亡"]
    if author == "陀思妥耶夫斯基":
        tags += ["心理治疗", "存在主义", "自我认同"]
    if author == "卡夫卡":
        tags += ["荒诞", "存在主义", "社会观察"]
    if author in {"乔治·奥威尔", "赫胥黎"}:
        tags += ["媒介与社会", "社会观察", "科幻与幻想"]
    if author == "尼采":
        tags += ["西方哲学", "存在主义"]
    if title == "第二性":
        tags += ["女性与性别", "亲密关系", "自我认同"]
    if zh:
        tags += ["华语文学", "中国古典思想"]
    if author in {"余华", "马伯庸"}:
        tags += ["华语文学", "历史与记忆"]
    if title in {"三体", "球状闪电", "北京折叠"}:
        tags += ["科幻与幻想"]
    if author == "金庸":
        tags += ["华语文学", "轻小说与漫画"]
    if not tags:
        tags += [random.choice(["孤独", "自我认同", "自由", "生活随笔", "文学批评"])]
    return sorted(set(tags))[:5]


def main():
    random.seed(42)
    DATA.mkdir(parents=True, exist_ok=True)
    THEMES.mkdir(parents=True, exist_ok=True)

    # 1. books.json
    books = []
    now = 1700000000
    for i, (title, author) in enumerate(BOOKS):
        reading_sec = random.randint(3, 40) * 3600
        aff = random.choice(AFF_LEVELS)
        books.append({
            "bookId": str(7000000 + i),
            "title": title,
            "author": author,
            "category": "",
            "progress": 100,
            "readingTime": reading_sec,
            "finishTime": now + random.randint(-3600 * 24 * 400, 0),
            "updateTime": now,
            "notes": {"total": random.randint(5, 80), "reviewCount": random.randint(0, 1),
                      "noteCount": random.randint(5, 70), "bookmarkCount": random.randint(0, 5)},
            "myReview": "",
            "affectionScore": AFF_SCORE[aff] + random.uniform(-1.2, 1.2),
            "affectionLevel": aff,
        })
    (DATA / "books.json").write_text(
        json.dumps({"syncedAt": "2026-01-01", "totalBooks": len(books),
                    "ratingFormula": "demo", "ratedAt": "2026-01-01", "books": books},
                   ensure_ascii=False, indent=1), encoding="utf-8")

    # 2. theme_tags.json
    tags = {}
    for i, (title, author) in enumerate(BOOKS):
        tags[str(7000000 + i)] = {"title": title, "tags": pick_tags(title, author)}
    (DATA / "theme_tags.json").write_text(
        json.dumps(tags, ensure_ascii=False, indent=1), encoding="utf-8")

    # 3. themes/*.md —— 每主题一张骨架卡（书目为虚构排布，无真实金句）
    used = {}  # theme -> [title]
    for bid, info in tags.items():
        for t in info["tags"]:
            used.setdefault(t, []).append(info["title"])
    for theme, titles in used.items():
        title_list = "\n".join(f"  - 《{t}》" for t in titles)
        card = f"""# 主题卡：{theme}

- 书目：{len(titles)} 本
{title_list}

- 主题轨迹：这张合成主题卡仅用于演示数据管线。把你自己读过的书按主题打标后，此处会生成你的主题轨迹——哪些书最先提出这个母题、哪些书在推进中翻转了它、最终落在哪几本上。

- 交界：
  - 与相邻主题的关系会在你的真实数据里显现：共现最多的主题往往共享同一批书。此为占位说明。
"""
        (THEMES / f"{theme}.md").write_text(card, encoding="utf-8")

    print(f"demo 数据生成完成：{len(books)} 本书 / {len(used)} 个主题")
    print(f"→ {DATA}/books.json, {DATA}/theme_tags.json, {DATA}/themes/*.md")


if __name__ == "__main__":
    main()
