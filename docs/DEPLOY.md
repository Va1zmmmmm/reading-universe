# 在线版部署

在线版包含静态前端与临时分析服务。只上传 web/ 到 GitHub Pages 可浏览和导入资料，但不能完成 AI 分析。原站 Pages 工作流只手动触发，并固定 checkout 历史公开版本 4118c16914765539814f849f8aee988ad98ea3c7，避免今后手动发布把原站替换成缺后端的新工具。新工具独立部署。

## 独立托管

1. 使用独立主机或容器平台；不要把用户资料放入公开目录，也不要默认暴露作者原服务器。
2. 只部署 server.py、exploration.py 与 web/；用户 key 由页面临时提供，不设置作者密钥。无需 data/、邻接工作库或私有配置。探索入口为 `/atlas/index.html`；不要启用仅供本机私人对照的 `--explore-preview`。
3. 配置 READING_ORIGINS=https://实际域名。前端与 /api/ 保持同域；反向代理设置 Host、X-Forwarded-Proto，使用有效 TLS 证书。
4. Python 服务运行在普通账户；可参考 deploy/reading-universe.service 与 deploy/nginx.conf.example。Dockerfile 可用于独立容器平台；镜像构建及该生产配置本轮尚未实测。
5. 任务只在内存，15 分钟过期清理；每会话串行运行，全局 4 个分析线程。服务重启不会恢复任务或 key，用户已下载的项目包可恢复已完成内容。

若主机无法直接连接 OpenAI，可仅为此服务设置 `READING_OPENAI_PROXY=http://127.0.0.1:代理端口`；只影响 OpenAI 请求，只接受管理员配置的本机 HTTP 代理。DeepSeek 保留直接连接。不设置全机代理，不修改其他项目的出口规则。

部署前可运行 `node tools/build_public_reader.mjs`，再运行 `python tools/package_deploy.py --out /path/to/reading-tool-deploy.zip`。打包器按固定允许清单收集服务、前端、已公开案例与部署说明，附 SHA256 清单并回读 ZIP；不带私人工作区、作者探索原文、仓库历史、data/ 或旧 graph_data.js/universe_data.js 快照。公开案例使用历史私人格式包装以便导入，但不带原始材料或主人探索记录，加载仍须用户主动选择。部署包未包含环境凭据，域名与 READING_ORIGINS 需要按实际目标配置；打包成功不代表上线验收完成。

## 上线闸门

- 新浏览器会话用非作者数据完成导入、真实模型小样本生成、手改、保存恢复与公开导出。
- 两个会话互不能访问对方任务；反向代理与应用日志不保存 key 或请求体。
- 确认 TLS、Secure cookie、来源校验、输入大小、取消/过期清理与限额行为。
- 公开目录只含预期前端与已审阅作者案例；server.py、数据目录、仓库和私人包不可公开读取。
- 上线前保留旧静态产物与 DNS/路由恢复步骤。仅 HTTP 200 不代表全部验收完成。

本文是部署流程。实际目标、验证结果与限制应另留部署记录；不能把构建成功、模拟模型或单个 HTTP 200 当成上线证明。
