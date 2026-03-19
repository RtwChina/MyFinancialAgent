## Tasks

### 1. main.py — 启动日志合并
- [x] 移除重复分隔线，合并为一段启动日志
- [x] 移除 print 输出（如 `[Hourly] 正在执行...`），改用 logger

### 2. collect_news_v3.py — 启动日志
- [x] 移除重复的 `v4.0 启动` + `v5.0` 双版本日志，统一为一段
- [x] 合并配置行和阶段超时行为一行
- [x] 移除多余的分隔线（保留一对即可）

### 3. collect_news_v3.py — 阶段耗时
- [x] 新闻采集阶段：记录开始时间，完成时输出 `[采集] 完成: N条, 耗时 X.Xs`
- [x] 规则初筛阶段：输出 `[初筛] 完成: 保留 M/N条, 耗时 X.Xs`
- [x] 批次分析阶段：输出 `[批次分析] 完成: 保留 N条, 耗时 X.Xs`
- [x] D1 写入阶段：输出 `[写入D1] 完成: 新增 N, 更新 M, 耗时 X.Xs`
- [x] 日总结阶段：输出 `[日总结] 完成/跳过, 耗时 X.Xs`

### 4. collect_news_v3.py — 移除 print
- [x] 移除所有 print 调用，改用 logger.info

### 5. collect_news_v3.py — f-string → %s
- [x] 将所有 `logger.xxx(f"...")` 改为 `logger.xxx("... %s", var)` 风格

### 6. collect_news_v3.py — 错误日志格式
- [x] 统一错误日志为 `[阶段] 错误类型: 详情` 格式

### 7. main.py — f-string → %s
- [x] 将 main.py 中的 f-string 日志改为 %s 风格

### 8. 其他模块统一
- [x] `src/cloudflare_ingest.py` — f-string → %s，异常统一 ERROR 格式
- [x] `src/collect_prices.py` — f-string → %s，移除 print，异常统一 ERROR 格式
- [x] `src/data_sources/news_live.py` — f-string → %s，异常统一 ERROR 格式
- [x] `src/data_sources/price_live.py` — f-string → %s，异常统一 ERROR 格式
- [x] `src/llm_client.py` — 错误日志加阶段标签

### 9. collect_news_v3.py — 外部调用异常统一 ERROR
- [x] 数据源采集函数（fetch_sina_finance, fetch_cls_cn, fetch_jin10, fetch_yahoo_finance_news）的 except 块统一为 `[采集] 数据源名 请求失败: 详情` 格式
- [x] `send_news` / `send_daily_news_ai_analysis` 调用处异常统一为 `[写入D1] 错误类型: 详情` 格式

### 10. LLM 调用汇总
- [x] `src/llm_client.py` — `LLMClient` 增加实例级计数器：按 model 累计 call_count、total_prompt_chars、total_response_chars、total_elapsed
- [x] `src/llm_client.py` — 在 `call_chat` 每次调用完成后更新计数器
- [x] `src/llm_client.py` — 新增 `log_summary()` 方法，按模型分组输出 `[LLM汇总] 模型名: 调用 N次, prompt Xk字, response Xk字, 耗时 X.Xs`
- [x] `src/collect_news_v3.py` — 在 `run_news_pipeline` 末尾调用 `llm_client.log_summary()`

### 11. 中间态数据日志
- [x] `collect_news_v3.py` — 动态初筛规则生成后，INFO 记录完整关键词列表和 score_threshold
- [x] `collect_news_v3.py` — `_call_batch_llm` 中 INFO 记录 LLM 原始返回文本前 200 字符
- [x] `collect_news_v3.py` — `build_daily_summary_record` 中 INFO 记录候选新闻 news_hash 列表
- [x] `collect_news_v3.py` — `apply_rule_filter` 中 DEBUG 记录每条新闻的命中关键词和得分（逐条量大）

### 12. 验证
- [x] 本地运行 `python src/collect_news_v3.py`，确认日志格式符合规范
- [x] 确认无 print 输出
- [x] 确认每个阶段有耗时统计
- [x] 确认 LLM 汇总日志输出正确
- [x] 确认中间态数据（初筛关键词、LLM 返回片段）在 INFO 级别可见
