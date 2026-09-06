# 部署说明

整个项目是**纯静态站**，无构建步骤。`web/` 目录就是可发布产物——`file://` 直接打开即可
（无跨域、无外部 CDN），任意静态托管可发。

## 前置：数据 + 构建（若不用仓库自带的构建产物）

```bash
# 换用你自己的数据后重建（仓库自带 data/ 已构建好 web/，跳过此步也能部署）
python pipeline/sync_from_weread.py <你的weread数据目录>   # 可选：换自己的书
python pipeline/tag_books.py                              # 可选：打标
python pipeline/build_universe.py   # → web/universe_data.js（星空）
python pipeline/make_graph.py       # → web/graph_data.js（图谱）
```

## 部署到 GitHub Pages（推荐，零成本）

本仓库已配 `.github/workflows/pages.yml`：push 到 main 即自动把 `web/` 部署到 Pages。

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**
2. 访问 `https://<user>.github.io/reading-universe/`（星空加 `?universe`）

## 部署到 Nginx

```bash
sudo cp -r web/ /var/www/reading-universe/
```

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/reading-universe;
    index index.html;
}
```

## 部署到任意静态托管

把 `web/` 目录拖上去即可（Vercel / Netlify / 对象存储）。

## 隐私检查（发布前必做）

- `web/universe_data.js` / `web/graph_data.js` 由 `data/` 生成。发布前检查 `data/`
  里没有划线原文、逐书读完日期、评分等个人层内容（仓库自带的脱敏版是干净的）。
- 用自己数据生成后，若包含不想公开的书，删掉对应条目再构建。
