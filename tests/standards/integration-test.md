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

### IT-LIVEPLANS-001：账户活态操作计划 CRUD + 双向同步端到端集成

**场景**：账户活态计划全链路验证 —— CRUD、init 复制幂等、最新日双向同步、历史日不同步。

**对应文件**：`tests/integration/account_live_action_plans_e2e.py`、`openspec/changes/account-managed-live-action-plans/specs/account-live-action-plans/spec.md`

**前置条件**：
- migration 023 已 apply
- 至少 2 个 enabled 账户、tracked_symbols 含 `MU` 与一个 A 股 symbol（如 `600519`）
- 存在已初始化的当天 archive_date `D`，且 `D = MAX(archive_date)`

**步骤与预期**：

| # | 步骤 | 预期 |
|---|------|------|
| 1 | `POST /api/account-live-action-plans` 创建 `(老虎-美股, MU)` + `(东方财富-国内, 600519)` | 各返回 2xx 含 id；`daily_review_action_plans(D)` 同步出现这两行 |
| 2 | 重复 POST 第 1 步任意一条 | 返回 HTTP 409，库中无重复行 |
| 3 | `PUT /api/account-live-action-plans/<id>` 修改 take_profit_plan | live 与 `daily(D)` 都更新；`updated_at` 推进 |
| 4 | `DELETE /api/account-live-action-plans/<id>` 删除其中一条 | live 该行消失；`daily(D)` 对应行同步删除 |
| 5 | 清空 `daily(D')` 后调用 `POST /api/reviews/D'/initialize`（`D' = D + 1` 新日） | `daily(D') = live` 行对行；再次调用不重复、不覆盖 |
| 6 | 让某 live plan 的 symbol 在 `tracked_symbols.is_active = 0`，再清空 `daily(D'')` 后调用 init | 该行被跳过，其余 plan 仍复制；日志/返回含 warning |
| 7 | 取一个 reviewed 历史日 `H` (`H < D`)，`POST /api/reviews/H` 修改 plan | `daily(H)` 改变；`account_live_action_plans` 不变 |
| 8 | 重新 `POST /api/reviews/D` 用空 plan 集合保存 | live 集合清空；`daily(D)` 清空；`daily(H)` 不动 |

**通过标准**：步骤 1–8 全部预期成立即视为通过；任意一步失败需作为归因记录。

### IT-LIVEPLANS-002：Backlog 多未复盘日隔离

**场景**：构造 4 个连续 archive_date 全部 `review_status != 'reviewed'`，仅最新日同步 live，其他日编辑不动 live。

**对应文件**：`tests/integration/backlog_isolation.py`

**前置条件**：
- migration 023 已 apply
- `daily_review_archive` 内存在 `D-3, D-2, D-1, D` 四行，全部 unreviewed
- live 已有至少 2 条 plan

**步骤与预期**：

| # | 步骤 | 预期 |
|---|------|------|
| 1 | 在 `D-2` 抽屉里改动 plan 并保存 | `daily(D-2)` 改变；`account_live_action_plans` 不变；前端列表行显示「历史草稿」徽标 |
| 2 | 在 `D-1` 抽屉里改动 plan 并保存 | `daily(D-1)` 改变；live 仍不变 |
| 3 | 在 `D`（最新）抽屉里改动 plan 并保存 | `daily(D)` 改变；live 同集合替换；其他日 daily 行不被触碰 |
| 4 | `GET /api/reviews/D-2/bootstrap` 与 `GET /api/reviews/D/bootstrap` | 两者 `actionPlans` 各自反映本日数据；响应均含 `latestArchiveDate = D`，且无 `carryForward` 字段 |

**通过标准**：步骤 1–4 预期全部成立；任意一步 live 被非最新日改动 → 视为失败。

### IT-LIVEPLANS-003：Migration 023 种子在两种基线下的行为

**场景**：验证 migration 023 在「存在 reviewed 日」与「不存在 reviewed 日」两种基线下种子结果正确，且重复执行幂等。

**对应文件**：`tests/integration/migration_023_seed.py`

**前置条件**：
- 测试环境 D1 可执行 migration
- 用例 A 基线：`daily_review_archive` 含至少一条 `review_status = 'reviewed'` 的日 `R`，且 `daily_review_action_plans(R)` 含若干行
- 用例 B 基线：`daily_review_archive` 无任何 `review_status = 'reviewed'` 行

**步骤与预期**：

| # | 步骤 | 预期 |
|---|------|------|
| A1 | 在用例 A 基线下执行 migration 023 | `account_live_action_plans` 行数 = `daily_review_action_plans` 中 `archive_date = R` 的行数，字段一一对应（不含 archive_date）|
| A2 | 再跑一次 migration 023 | 无新增行、无字段被覆盖（INSERT OR IGNORE 幂等）|
| A3 | 检查老 archive 日 `daily_review_action_plans` 行 | 与 migration 前完全一致，未被触碰 |
| B1 | 在用例 B 基线下执行 migration 023 | `account_live_action_plans` 为空；不报错 |
| B2 | 在 B 基线下追加 reviewed 行后再次执行 migration | 因 IGNORE 语义，旧行不补种子（业务上用户应通过账户管理手动建立活态计划）|

**通过标准**：A1–A3 与 B1–B2 全部预期成立。
