# 阅读宇宙 · Reading Universe

用自己的书目、划线与笔记生成可探索的思想图谱和阅读星空。在线版免注册，原始文件在浏览器读取；AI 分析仅临时发送必要片段，用户自带 API key，网站不保存 key。

作者真实公开案例由用户显式选择；新用户工作区默认为空。私人项目包与公开网站包分别保存，人工修改不会被重新生成覆盖。

## 普通用户

在网站选择文件 → 检查材料 → 可选 AI 分析 → 浏览/修订 → 保存私人项目或导出公开版本。

详见 [使用说明](docs/USER_GUIDE.md)。仅书单可生成基础视图，有笔记/划线时才分析有依据的具体联系。

## 本地运行与自部署

Python 3.10+ 即可运行网站与任务服务，无第三方运行依赖：

```bash
python server.py --port 8766
```

打开 http://127.0.0.1:8766/。模型调用使用你在页面填写的服务商和 key；不会读取作者 cc_config 或个人工作库配置。

生产环境须独立托管后端、配置 HTTPS 与 READING_ORIGINS。详见 [部署](docs/DEPLOY.md)、[架构与边界](docs/ONLINE_ARCHITECTURE.md)。GitHub Pages 只能提供静态内容，不能单独完成在线 AI 分析。

## 开发者离线生成

Node.js 18+；必须显式指定私人工作区，不默认使用作者样例：

```bash
node tools/cli.mjs --workspace /private/my-reading --import /path/to/weread-data
node tools/cli.mjs --workspace /private/my-reading --public --exclude PRIVATE_BOOK_ID --out /path/to/public-site
```

CLI 使用与网页相同的 core.mjs。输入、项目包及兼容字段见 [数据格式](docs/DATA_FORMAT.md)。旧 pipeline 脚本保留供历史记录参考，不再作为新用户复现入口。

## 验证

```bash
node --test tests/core.test.mjs
python -m unittest discover -s tests -p test_server.py -v
python tests/browser_test.py
```

浏览器测试需要已安装 Playwright 和浏览器，使用模拟 AI 调用；不替代真实模型及线上验收。

MIT。私人原始资料与 API key 不应提交仓库。data/ 为历史公开样例；在线样例位于 web/examples/author-public.json。
