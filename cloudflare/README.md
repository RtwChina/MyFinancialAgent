# Cloudflare 目录说明

## 结构

- `worker/`: Cloudflare Workers API
- `web/`: Cloudflare 网页静态资源
- `migrations/`: D1 初始化 SQL

## 本地开发

1. 安装依赖：`npm install`
2. 登录 Cloudflare：`npx wrangler login`
3. 创建 D1 数据库并替换 `wrangler.toml` 中的 `database_id`
4. 本地启动：`npm run dev`

## 数据写入

Python 采集脚本需要配置：

- `ENABLE_REMOTE_WRITE=true`
- `INGEST_API_BASE_URL=<你的 worker 地址>`
- `INGEST_API_TOKEN=<你的 ingest token>`

Workers 侧需要配置环境变量：

- `INGEST_API_TOKEN`
