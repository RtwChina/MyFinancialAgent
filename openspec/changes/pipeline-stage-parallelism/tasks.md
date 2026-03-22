## Tasks

### 1. Stage 1 软加分改造

- [x] 1.1 将 `filter_news_by_rules()` 改为 `score_news_by_rules()`：不再返回 (passed, rejected)，改为返回全量新闻列表，每条附加 `_scoring.rule_score`
- [x] 1.2 去掉 `collect_all_news()` 中对 `generate_dynamic_screening_profile()` 的调用，Stage 1 仅使用静态词表 `_get_static_screening_base()`
- [x] 1.3 将历次动态规则高频词沉淀到静态词表（从回归测试结果中提取，如 "制裁"、"earnings"、"AI"、"geopolitical" 等）

### 2. Stage 2 综合评分

- [x] 2.1 修改 `filter_news_by_embedding()` 的过滤逻辑：综合分 = `similarity + rule_score * RULE_SCORE_WEIGHT`，与阈值比较
- [x] 2.2 新增环境变量 `RULE_SCORE_WEIGHT`（默认 0.02）
- [x] 2.3 在 `_embedding` 字段中记录 `rule_score_bonus` 和 `combined_score`，便于 filter_log 追踪

### 3. Finnhub 并发

- [x] 3.1 在 `news_live.py` 创建模块级 `requests.Session`（`HTTPAdapter(pool_maxsize=10)`）
- [x] 3.2 将 `fetch_finnhub_company()` 从串行 for + sleep(0.5) 改为 `ThreadPoolExecutor(max_workers=5)` 并发
- [x] 3.3 加入 429 检测，触发时 sleep 1s 后重试（最多 2 次）

### 4. 编排与 Trace 适配

- [x] 4.1 更新 `collect_all_news()` 的 trace 记录：`rule_passed` 改为全量（= deduped），`rule_filtered` 改为 0
- [x] 4.2 更新 filter_log 构建逻辑：`rule_decision` 全部为 "pass"，保留 scoring 详情

### 5. 验证

- [x] 5.1 本地运行 `python main.py hourly-news`（ENABLE_REMOTE_WRITE=false），确认总耗时 < 270s 且漏斗数据正常
- [x] 5.2 对比优化前后 Stage 2 的过滤结果：确认之前被 Stage 1 砍掉的新热点现在能通过 Stage 2
- [x] 5.3 更新 `.env` 和 `collect_news.yml` 中的参数说明
