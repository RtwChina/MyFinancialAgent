## Why

上一轮日志规范化后发现三个遗留问题：
1. LLM 每次调用只打了"开始"日志，没有"完成"日志（耗时、response 大小不可见）
2. 日总结阶段日志太粗，看不到时间窗口范围、过滤条件、加载数量、AI 入参出参
3. `collect_prices.yml` 的 env 配置没跟 `collect_news.yml` 对齐（模型名仍用 secret 被遮蔽）
4. 批次分析阶段英文新闻返回英文摘要，prompt 缺少"中文输出"约束

## What Changes

- `src/llm_client.py` — 每次 LLM 调用完成后打印完成日志（model、耗时、prompt/response 字符数、成功/失败）
- `src/collect_news_v3.py` — `load_news_for_summary` 增加窗口范围、加载数量、过滤条件的详细日志
- `src/collect_news_v3.py` — `build_daily_summary_record` 打印 AI 入参摘要和出参摘要
- `src/collect_news_v3.py` — 批次分析 prompt 加"所有输出必须为中文"约束
- `.github/workflows/collect_prices.yml` — 模型名从 secret 改明文，与 collect_news.yml 对齐

## Capabilities

### New Capabilities

### Modified Capabilities
- `logging-standard`: 补充 LLM 调用完成日志、日总结详细日志

## Impact

- `src/llm_client.py` — `_record_stats` 增加完成日志
- `src/collect_news_v3.py` — `load_news_for_summary`、`build_daily_summary_record`、`_call_batch_llm` prompt
- `.github/workflows/collect_prices.yml` — env 配置
- 不涉及 API 接口或数据库变更
