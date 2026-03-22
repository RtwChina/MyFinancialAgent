## Tasks

### 1. D1 数据库

- [x] 1.1 创建 `cloudflare/migrations/011_screening_keywords.sql`：建表 + seed 全部 84 个基础词（从 `BASE_*` 常量提取，`sort_order = 0`）
- [x] 1.2 更新 `src/schema.sql`：同步新增 `screening_keywords` 表定义（不含 seed 数据）
- [x] 1.3 执行 `wrangler d1 migrations apply` 到测试环境验证

### 2. Workers API

- [x] 2.1 在 `cloudflare/worker/src/index.js` 新增 `GET /api/screening-keywords` 端点（支持 `?type=` 和 `?active=` 查询参数）
- [x] 2.2 新增 `POST /api/screening-keywords` 端点（需 Token 鉴权，`sort_order` 默认 100，重复返回 409）
- [x] 2.3 新增 `PUT /api/screening-keywords/:id` 端点（需 Token 鉴权，更新 `updated_at`）
- [x] 2.4 新增 `DELETE /api/screening-keywords/:id` 端点（需 Token 鉴权，物理删除）

### 3. 前端 — 关键词管理页面

- [x] 3.1 在导航栏新增"关键词管理"入口（`data-view="keywords"`），参照标的管理样式
- [x] 3.2 在 `index.html` 新增 `keywordsView` section，参照 `symbolsView` 结构：标题 + tip-panel 提示 + 添加栏 + 列表区
- [x] 3.3 tip-panel 内容：说明四种关键词类型（macro/market/noise/symbol_context）的作用和权重，以及与标的别名的区别
- [x] 3.4 在 `app.js` 新增关键词管理视图逻辑：四类型 Tab 切换 + 关键词列表 + is_active toggle（参照标的管理的显示/隐藏逻辑）
- [x] 3.5 新增关键词输入框（keyword + language 选择 + 添加按钮），参照标的管理的添加栏样式
- [x] 3.6 基础词（`sort_order = 0`）只显示 is_active 开关，用户词（`sort_order >= 100`）额外显示删除按钮（不需要编辑功能）

### 4. 前端 — 标的管理 tip-panel 更新

- [x] 4.1 更新 `index.html` 标的管理的 `tip-trigger tip-panel` 内容：修正"类型"说明（type 现在由 LLM 判断，不再由规则优先级链决定；标的类型仅影响前端分组展示）
- [x] 4.2 更新"新闻匹配别名"说明：强调别名的作用是标的识别 + rule_score 权重 3.5 加分，与初筛关键词的话题匹配是两套独立机制

### 5. 前端 — ReadMe 页面

- [x] 5.1 在导航栏新增"ReadMe"入口（`data-view="readme"`）
- [x] 5.2 在 `index.html` 新增 `readmeView` section，内含一个只读 Markdown 渲染区域
- [x] 5.3 ReadMe 内容第一块：新闻三级漏斗流程说明（Stage 1 关键词打分 → Stage 2 语义相似度+rule_score 综合过滤 → Stage 3 LLM 深度打星），使用之前讨论的示例和数据
- [x] 5.4 使用页面已有的 `snarkdown()` 函数渲染 Markdown 为 HTML

### 6. Pipeline 集成

- [x] 6.1 在 `src/collect_news_v3.py` 新增 `_fetch_keywords_from_api()` 函数：GET 请求拉取关键词，5s 超时，失败返回 None
- [x] 6.2 将 `BASE_*` 四个常量替换为 `FALLBACK_KEYWORDS` 单一 dict 常量（内容与 seed 一致）
- [x] 6.3 修改 `_get_static_screening_base()` 为 `_get_screening_profile()`：先尝试 API，失败降级为 `FALLBACK_KEYWORDS`
- [x] 6.4 更新 `collect_all_news()` 中调用 `_get_screening_profile()` 的方式，日志输出关键词来源和数量
- [x] 6.5 清理 `apply_rule_filter()` 中的 type 判断优先级链逻辑，type 字段统一设为空或 "index" 默认值，由 Stage 3 LLM 最终判断

### 7. 测试与验证

- [x] 7.1 读取 `tests/standards/smoke-test.md` 和 `tests/standards/integration-test.md`，追加关键词管理相关的冒烟测试和集成测试用例
- [x] 7.2 本地运行 `python main.py hourly-news`（`ENABLE_REMOTE_WRITE=false`），确认 Pipeline 能从 API 加载关键词并正常完成
- [x] 7.3 模拟 API 不可达场景（断网或改错 URL），确认降级到 `FALLBACK_KEYWORDS` 且 Pipeline 正常完成

### 8. 发布

- [ ] 8.1 发布前检查清单：migration 011 已 apply 到生产 D1、Workers 已部署、前端页面可访问、Pipeline 能从 API 拉取关键词
- [ ] 8.2 部署 Workers（`wrangler deploy`）并验证 `/api/screening-keywords` 返回 151 条基础词（宏观60、市场48、噪音23、标的上下文20）
