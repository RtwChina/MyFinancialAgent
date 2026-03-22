## 1. 数据库 Migration

- [x] 1.1 新建 `cloudflare/migrations/` 下的 migration 文件，创建 `pipeline_trace` 表（含三级漏斗字段、active_strategy、star_fallback_triggered）
- [x] 1.2 同一 migration 文件中创建 `news_filter_log` 表（含三策略评分字段、embedding 字段、llm_cot_reasoning 字段）
- [ ] 1.3 在测试环境执行 `wrangler d1 migrations apply`，验证表结构正确

## 2. 关键词评分 A/B/C 三策略（collect_news_v3.py）

- [x] 2.1 实现 `bm25_saturate(count, weight, k1=1.2)` 函数
- [x] 2.2 实现策略 B：在 `apply_rule_filter()` 中用 BM25 饱和替代线性计数
- [x] 2.3 实现策略 C：拆分 title/content 分别统计命中数，标题 ×2 + 正文，title 为空时退化为策略 B
- [x] 2.4 改造 `apply_rule_filter()` 返回值，同时返回三种策略的分数和命中详情
- [x] 2.5 新增 `RULE_ACTIVE_STRATEGY` 配置项（默认 `A`），实际过滤决策使用对应策略的分数

## 3. Embedding 语义过滤（新增 Stage 2）

- [x] 3.1 `requirements.txt` 新增 `dashscope` 依赖
- [x] 3.2 新增 `src/embedding_filter.py` 模块：封装 DashScope text-embedding-v3 API 调用（批量生成向量、余弦相似度计算）
- [x] 3.3 为每个 tracked_symbol 定义 profile 文本（中英文混合，包含公司名、代码、业务关键词）
- [x] 3.4 实现 Embedding 过滤主函数：批量向量化 → 余弦相似度 → 阈值过滤
- [x] 3.5 新增 `EMBEDDING_SIMILARITY_THRESHOLD` 配置项（默认 0.3）
- [x] 3.6 实现降级逻辑：API 超时时跳过 Embedding 阶段，所有新闻直接进入 Stage 3

## 4. 打星 Prompt 校准

- [x] 4.1 重写 LLM 深度分析的 system prompt：加入 CoT 指令（先列重要/不重要理由再打分）
- [x] 4.2 加入 5 条锚定示例（5/4/3/2/1 星各一条，使用跟踪标的相关的真实场景）
- [x] 4.3 在 user prompt 中加入分布约束指令（5 星 ≤ 20%，4-5 星 ≤ 40%）
- [x] 4.4 修改 LLM 返回解析，提取 `cot_reasoning` 字段
- [x] 4.5 实现规则兜底：检测 ≥ 80% 五星时，用 `_score_to_stars()` 替换星级，记录 `star_fallback_triggered`

## 5. Pipeline Trace 与 Filter Log 采集

- [x] 5.1 在 `run_news_pipeline()` 入口生成 `run_id`（UUID），记录 `started_at`，初始化 trace 字典
- [x] 5.2 在各阶段（fetch、rule、embedding、llm）前后记录耗时和漏斗数据
- [x] 5.3 在规则阶段为每条新闻构建 filter_log 记录（含三种策略分数）
- [x] 5.4 在 Embedding 阶段更新 filter_log（similarity、matched_symbol、decision）
- [x] 5.5 在 LLM 阶段更新 filter_log（llm_keep、llm_stars、llm_cot_reasoning、llm_raw_response）
- [x] 5.6 在 pipeline 结束时组装 `config_snapshot`、`dynamic_keywords`，写入 pipeline_trace
- [x] 5.7 批量写入 filter_log（每 20 条一批 POST），写入失败降级为日志

## 6. 三级漏斗串联

- [x] 6.1 重构 `run_news_pipeline()` 主流程：采集 → Stage 1 关键词规则 → Stage 2 Embedding → Stage 3 LLM
- [x] 6.2 移除 `LLM_CANDIDATE_LIMIT` 硬编码上限（由 Embedding 阶段自然控制候选量）
- [x] 6.3 调整 `LLM_BATCH_SIZE`（6→8）和 `LLM_MAX_WORKERS`（2→3）适配更大候选量

## 7. Workers API 端点

- [x] 7.1 新增 `POST /api/ingest/pipeline-trace` 端点
- [x] 7.2 新增 `POST /api/ingest/filter-logs` 端点（批量写入）
- [x] 7.3 新增 `GET /api/pipeline-traces?date=YYYY-MM-DD` 查询端点
- [x] 7.4 新增 `GET /api/filter-logs?run_id=xxx&decision=kept` 查询端点

## 8. 测试

- [x] 8.1 读取 `tests/standards/` 下的冒烟测试和集成测试规范，按规范格式追加本次变更的测试用例
- [x] 8.2 编写冒烟测试用例：三策略评分正确性、Embedding 过滤及降级、打星兜底触发、trace/filter_log 写入
- [x] 8.3 编写集成测试用例：完整三级漏斗执行后验证 trace + filter_log 数据一致性
- [x] 8.4 准备测试数据：固定新闻样本 + mock Embedding 向量 + mock LLM 响应，放到 `tests/testdata/`
- [x] 8.5 执行冒烟测试，记录结果

## 9. 发布

- [ ] 9.1 发布前检查清单：
  - 数据库 migration 已在测试环境验证通过
  - DashScope Embedding API Key 已配置到 GitHub Actions secrets（复用现有 `LLM_API_KEY`）
  - 三级漏斗端到端跑通，各阶段漏斗数据合理
  - 三种关键词策略分数均正确记录
  - 打星分布有区分度（非全 5 星）
  - pipeline_trace 和 filter_log 写入降级逻辑已验证
  - Workers API 新端点已在测试环境验证
  - 冒烟测试全部通过
- [ ] 9.2 合并到 main 分支，执行生产环境 migration
- [ ] 9.3 监控前 2 天的 pipeline_trace 数据，对比三种策略评分分布，确认 Embedding 过滤率和打星分布符合预期
