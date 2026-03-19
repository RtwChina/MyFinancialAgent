## Tasks

### 1. LLM 调用完成日志
- [x] `src/llm_client.py` — `_record_stats` 中增加完成日志：成功时 INFO (model/耗时/prompt字数/response字数)，失败时 ERROR (model/耗时/error)

### 2. 日总结详细日志
- [x] `src/collect_news_v3.py` — `load_news_for_summary` 开头打印窗口范围、数据源类型
- [x] `src/collect_news_v3.py` — `load_news_for_summary` 打印加载数量（数据库+回退）、去重后数量
- [x] `src/collect_news_v3.py` — `load_news_for_summary` 打印过滤条件和过滤后候选数量
- [x] `src/collect_news_v3.py` — `build_daily_summary_record` LLM 调用前打印 AI 入参（候选数量+标题列表）
- [x] `src/collect_news_v3.py` — `build_daily_summary_record` LLM 调用后打印 AI 出参（前 300 字）

### 3. 批次分析中文约束
- [x] `src/collect_news_v3.py` — `_call_batch_llm` 的 system prompt 加 "所有 ai_summary 和 market_impact 必须使用中文"

### 4. collect_prices.yml 配置对齐
- [x] `.github/workflows/collect_prices.yml` — `LLM_MODEL_ID` 从 secret 改为明文 `"qwen3.5-plus"`
- [x] `.github/workflows/collect_prices.yml` — 补充 `LLM_BATCH_MODEL_ID` 和 `LLM_SUMMARY_MODEL_ID`

### 5. 验证
- [x] 语法检查所有修改文件
- [x] 确认 LLM 完成日志格式正确