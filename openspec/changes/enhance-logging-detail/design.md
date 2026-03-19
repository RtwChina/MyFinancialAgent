## Context

上一轮 `standardize-logging` 已完成日志规范化基础：阶段耗时、f-string→%s、print→logger、错误格式、LLM 汇总。
但实际运行发现部分日志信息不够详细，需要补充。

## Goals / Non-Goals

**Goals:**
- LLM 每次调用完成后打印耗时和 response 大小
- 日总结阶段日志详细化：窗口、条件、数量、AI 入参出参
- collect_prices.yml 与 collect_news.yml 配置对齐
- 批次分析 prompt 要求中文输出

**Non-Goals:**
- 不改动日志格式模板（已在上一轮定义）
- 不改动 logger_utils.py

## Decisions

### 1. LLM 调用完成日志

在 `_record_stats` 中增加，每次调用完成后自动打印：

成功：
```
LLM 完成: model=qwen3.5-plus, 耗时 69.1s, prompt 2342字, response 1580字
```

失败：
```
LLM 失败: model=qwen3.5-plus, 耗时 300.0s, error=ReadTimeout
```

### 2. 日总结详细日志

`load_news_for_summary` 阶段输出：
```
[日总结] 加载候选: analysis_date=2026-03-18, 窗口=[2026-03-18 04:00:00 ~ 2026-03-19 04:00:00], 数据源=remote
[日总结] 加载完成: 数据库 45条 + 当批回退 10条 = 合计 55条
[日总结] 去重后: 42条
[日总结] 过滤条件: importance_stars>=3, rule_passed=True, status in {llm_processed,reviewed}
[日总结] 过滤后候选: 2条
```

`build_daily_summary_record` 阶段输出 AI 入参（新闻标题列表）和出参（摘要前 300 字）：
```
[日总结] AI入参: 2条候选, titles=['中东局势...', '亚洲甲醇...']
[日总结] AI出参(前300字): {"daily_major_events":["..."],...}
```

### 3. 批次分析 prompt 中文约束

在 batch LLM system prompt 末尾加一句："所有 ai_summary 和 market_impact 必须使用中文。"

### 4. collect_prices.yml 对齐

- `LLM_MODEL_ID` 从 `${{ secrets.LLM_MODEL_ID }}` 改为明文 `"qwen3.5-plus"`
- 补充 `LLM_BATCH_MODEL_ID` 和 `LLM_SUMMARY_MODEL_ID`
- 与 collect_news.yml 保持一致

## Risks / Trade-offs

- 日志量增加 → 都是 INFO 级别关键信息，排查问题时必需
