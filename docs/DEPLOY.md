# 部署说明

整个项目是**纯静态站**，无构建步骤。`web/` 目录就是可发布产物，浏览器直接打开
`web/index.html` 即可运行（`file://` 协议也支持，因为无跨域请求、无外部 CDN）。

## 前置：生成数据

```bash
# 1. 生成示例数据（或放入你自己的 data/）
python pipeline/make_demo_data.py

# 2. 构建两个模式的数据
python pipeline/build_universe.py    # → web/universe_data.js（宇宙模式）
python pipeline/make_demo_graph.py   # → web/graph_data.js（图谱模式）
```

## 部署到 GitHub Pages（推荐，零成本）

1. 把 `web/` 的内容推到仓库的 `gh-pages` 分支，或：
   - 仓库 Settings → Pages → Source 选 `main` 分支 + 目录 `/web`
2. 访问 `https://<user>.github.io/reading-universe/`（宇宙模式加 `?universe`）

## 部署到 Nginx

```bash
sudo cp -r web/ /var/www/reading-universe/
```

nginx 站点配置：

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/reading-universe;
    index index.html;
}
```

## 部署到任意对象存储 / Vercel / Netlify

把 `web/` 目录拖上去即可（这些平台默认把目录当静态站服务）。

## 隐私检查（发布前必做）

- `web/universe_data.js` 和 `web/graph_data.js` 是从你的 `data/` 生成的——部署前确认里面
  没有不想公开的内容（书名、阅读时长、主题标签是否可接受）。
- 不想公开的部分可以改 `data/` 后重新构建；或直接部署仓库自带的 demo 数据（合成、安全）。
