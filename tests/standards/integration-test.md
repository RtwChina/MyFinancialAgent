# 集成测试规范

## 触发时机
多个迭代完成后执行，不是每次提交都执行。

## 环境规则
- 开发环境 = 测试环境=开发环境：联调和集成测试，绑定所有非 master 分支
- 生产环境：绑定 master 分支

## 资源隔离要求
测试资源与生产资源必须隔离，至少包括：
- 2 个数据库
- 2 个 Workers（或服务实例）
- 2 个前端入口

## 部署边界
- 非 master 分支只允许部署到测试资源
- master 分支只允许部署到生产资源
- 测试数据、测试任务、测试调用绝不能污染生产资源

## 环境标识
- 运行时必须有统一环境标识：`APP_ENV=test` / `APP_ENV=prod`
- 代码优先通过运行时配置识别环境，不依赖数据库作为主判断来源
- 健康检查接口应返回当前环境标识

## 高风险逻辑处理
涉及以下场景时，必须通过环境标识区分逻辑：
- 批量写入 / 删除 / 清理
- 回填 / 初始化
- 调试入口 / 运维入口

## 已注册用例

### IT-NEWS-001：新闻数据源替换端到端集成

**场景**：AkShare + Finnhub 替换旧爬虫后的完整采集→筛选→入库→API→前端链路验证

**前置条件**：
- 本地 DB 已执行 migration 009（language、sub_source 字段存在）
- `FINNHUB_API_KEY` 已配置
- Python 依赖已安装（akshare>=1.18.0、finnhub-python>=2.4.0）

**步骤与预期**：

| # | 步骤 | 预期 |
|---|------|------|
| 1 | 运行 `fetch_all_news_live(ctx)` | 返回列表包含 source=akshare（4 个 sub_source）和 source=finnhub（general/company），language 字段 zh/en 正确 |
| 2 | 运行完整 pipeline（SKIP_LLM=true） | 采集→去重→规则初筛→写库全流程无异常，`news_raw_data` 有新增数据 |
| 3 | 检查 DB 字段 | `SELECT source, sub_source, language FROM news_raw_data WHERE source IN ('akshare','finnhub') LIMIT 10` 返回结果字段非空 |
| 4 | Finnhub 英文新闻初筛 | `SELECT COUNT(*) FROM news_raw_data WHERE source='finnhub' AND rule_passed=1` 结果 > 0 |
| 5 | 关键词双语命中验证 | `SELECT rule_reason FROM news_raw_data WHERE source='finnhub' AND rule_passed=1 LIMIT 3` 展示英文关键词命中（如 "war"、"earnings"、"semiconductor"）|
| 6 | API /api/news 返回 language/sub_source | GET `/api/news?source=finnhub` 响应 JSON 每条包含 language 和 sub_source 字段 |
| 7 | 前端来源筛选 | 新闻页面来源下拉框显示 AkShare 和 Finnhub 选项，按来源筛选结果正确 |

**通过标准**：步骤 1-5 本地可验证（无需部署），步骤 6-7 需本地 Worker 运行环境。

### IT-NEWS-002：三级漏斗 + pipeline_trace + filter_log 端到端集成

**场景**：三级漏斗（关键词→Embedding→LLM）完整执行后验证 pipeline_trace 和 filter_log 数据一致性

**前置条件**：
- DB 已执行 migration 010（pipeline_trace、news_filter_log 表存在）
- `LLM_API_KEY` 已配置（DashScope，同时用于 Embedding 和 LLM）
- `INGEST_API_BASE_URL` 和 `INGEST_API_TOKEN` 已配置（远程写入）

**步骤与预期**：

| # | 步骤 | 预期 |
|---|------|------|
| 1 | 运行完整 pipeline（collect_fresh_news=True） | 三级漏斗全流程无异常，日志输出各阶段漏斗数据 |
| 2 | 检查 pipeline_trace | `GET /api/pipeline-traces?date=<today>` 返回记录：status=completed，total_fetched > 0，rule_passed ≤ total_deduped，embedding_passed ≤ rule_passed，final_count ≤ llm_input |
| 3 | 验证漏斗数据一致性 | trace.rule_passed + trace.rule_filtered = trace.total_deduped；trace.embedding_passed + trace.embedding_filtered = trace.embedding_input |
| 4 | 检查 filter_log 总数 | `GET /api/filter-logs?run_id=<run_id>` 返回条数 = trace.total_deduped |
| 5 | 验证 filter_log 三策略分数 | 每条 filter_log 的 strategy_a/b/c_score 均非 null，active_strategy 与 config 一致 |
| 6 | 验证 filter_log embedding 字段 | rule_decision=pass 的记录中 embedding_decision 非 null（pass/filter/skipped） |
| 7 | 验证 filter_log LLM 字段 | embedding_decision=pass 的记录中 llm_stars 非 null，llm_cot_reasoning 非空 |
| 8 | 验证 final_decision 分布 | final_decision 包含 rule_filtered、embedding_filtered、llm_discarded、kept 四种，且 kept 数 = trace.final_count |

**通过标准**：步骤 1-5 为核心验证，步骤 6-8 为完整性验证。

### IT-KW-001：关键词管理 API CRUD 端到端集成

**场景**：screening_keywords 表 CRUD 接口完整验证，含鉴权、去重、is_active 开关

**前置条件**：
- DB 已执行 migration 011（screening_keywords 表 + 151 条 seed 数据存在）
- `INGEST_API_TOKEN` 已配置
- Workers 已部署

**步骤与预期**：

| # | 步骤 | 预期 |
|---|------|------|
| 1 | `GET /api/screening-keywords` | 返回 ≥ 151 条，含 is_active=1 和 is_active=0 的记录 |
| 2 | `GET /api/screening-keywords?type=macro` | 仅返回 keyword_type=macro 的记录 |
| 3 | `GET /api/screening-keywords?active=1` | 仅返回 is_active=1 的记录 |
| 4 | `POST /api/screening-keywords` 添加新词（需 Token） | 返回新创建记录，sort_order=100，is_active=1 |
| 5 | `POST /api/screening-keywords` 重复添加同一词 | 返回 HTTP 409，不重复写入 |
| 6 | `PUT /api/screening-keywords/:id` 修改 is_active=0（需 Token） | 返回更新后记录，is_active=0，updated_at 更新 |
| 7 | `GET /api/screening-keywords?active=1` 验证步骤 6 的词已排除 | 刚停用的词不出现在结果中 |
| 8 | `DELETE /api/screening-keywords/:id` 删除步骤 4 创建的词（需 Token） | 返回成功，再次 GET 该 id 404 或列表中不含该词 |
| 9 | 无 Token 调用 POST/PUT/DELETE | 返回 HTTP 401 |

**通过标准**：步骤 1-8 均通过，步骤 9 鉴权拒绝正确。

### IT-KW-002：Pipeline 关键词动态加载端到端集成

**场景**：验证 Pipeline 能从 API 动态加载关键词，并在 API 不可达时优雅降级

**前置条件**：
- migration 011 已 apply
- `INGEST_API_BASE_URL` 和 `INGEST_API_TOKEN` 已配置

**步骤与预期**：

| # | 步骤 | 预期 |
|---|------|------|
| 1 | API 可达：运行 `python main.py hourly-news`（ENABLE_REMOTE_WRITE=false） | 日志含 "关键词来源=API: 宏观=N词..."，Pipeline 正常完成 |
| 2 | 通过 PUT 停用一个 macro 词后重新运行 | 下次 Pipeline 日志中宏观词计数减少 1 |
| 3 | 添加新 market 词后重新运行 | 下次 Pipeline 日志中市场词计数增加 1 |
| 4 | 将 INGEST_API_BASE_URL 改为无效值，运行 Pipeline | 日志含 "关键词来源=FALLBACK"，Pipeline 正常完成，词表数量与 FALLBACK_KEYWORDS 一致 |
