## Why

Stage 1 初筛关键词（macro / market / noise / symbol_context 四类共 84 个）当前硬编码在 `collect_news_v3.py` 里。新增或禁用关键词必须改代码、push、等 Actions 重跑。需要一个可视化管理入口，让关键词增删实时生效，不依赖代码部署。

## What Changes

- 新增 D1 表 `screening_keywords`，存储全量关键词（基础词通过 migration seed，后续用户通过前端增删）
- 新增 Workers API 端点 `GET/POST/PUT/DELETE /api/screening-keywords`，CRUD 管理关键词
- 新增前端关键词管理页面（Tab 分类 + 列表 + is_active 开关 + 新增/删除）
- Python pipeline 启动时通过 API 拉取 `is_active=1` 的关键词，替代硬编码 `BASE_*` 常量
- 移除 `collect_news_v3.py` 中的 `BASE_MACRO_KEYWORDS` / `BASE_MARKET_KEYWORDS` / `BASE_NOISE_KEYWORDS` / `BASE_SYMBOL_CONTEXT_KEYWORDS` 硬编码常量
- API 不可达时降级为本地静态兜底（从 seed SQL 中提取的快照）

## Capabilities

### New Capabilities
- `screening-keywords-crud`: D1 表 + Workers API + 前端 UI 的关键词全生命周期管理
- `screening-keywords-pipeline-integration`: Pipeline 从 API 拉取关键词替代硬编码，含降级兜底

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **D1 数据库**: 新增 `screening_keywords` 表（migration 011）
- **Workers API** (`cloudflare/worker/src/index.js`): 新增 CRUD 端点
- **前端** (`cloudflare/web/`): 新增关键词管理页面
- **Python pipeline** (`src/collect_news_v3.py`): `_get_static_screening_base()` 改为 API 拉取 + 兜底
- **GitHub Actions** (`collect_news.yml`): 无需改动（已有 `INGEST_API_BASE_URL`）
- **schema.sql**: 同步新增 `screening_keywords` 表定义
