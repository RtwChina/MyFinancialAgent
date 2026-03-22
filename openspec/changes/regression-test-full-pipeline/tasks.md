## 1. 环境准备

- [x] 1.1 创建 `tests/regression/` 目录结构，包含 `results/` 子目录
- [ ] 1.2 验证 `.env` 中 `FINNHUB_API_KEY` 已配置且可用（调用一次 Finnhub API 确认）

## 2. Pipeline Wrapper 脚本

- [x] 2.1 创建 `tests/regression/pipeline_wrapper.py`：import `collect_all_news()` 执行后将返回的 dict 序列化为 JSON 输出到 stdout，捕获异常输出错误 JSON

## 3. 回归测试执行脚本

- [x] 3.1 创建 `tests/regression/run_pipeline_regression.py`：定义 6 组参数矩阵（R1-R6），固定 LLM_BATCH_SIZE=8, LLM_MAX_WORKERS=3, LLM_BATCH_TIMEOUT=90, LLM_RULES_TIMEOUT=120
- [x] 3.2 实现子进程驱动逻辑：每组 Run 用 `subprocess.run()` 调用 wrapper，通过环境变量注入参数，Run 间 10s 间隔
- [x] 3.3 实现结果解析：从 stdout 解析 JSON，提取漏斗数据、打星分布、CoT 样本、英文新闻统计、空标题统计、动态规则状态
- [x] 3.4 实现 `--only=R1,R3` 选择性运行参数
- [x] 3.5 实现错误处理：子进程崩溃时记录错误到 `errors` 字段，不阻塞后续 Run
- [x] 3.6 实现结果 JSON 持久化：每组 Run 输出到 `tests/regression/results/R{n}_{strategy}_{threshold}_{timestamp}.json`

## 4. 结果分析脚本

- [x] 4.1 创建 `tests/regression/analyze_results.py`：扫描 `results/` 目录，按时间戳分组加载最近一批 JSON
- [x] 4.2 实现策略对比表输出（Markdown 格式）：Run ID、Strategy、Threshold、Dynamic Rules、Rule Output、Embedding Filtered%、LLM Input、Final Count、Duration
- [x] 4.3 实现打星分布分析：文本直方图 + 异常检测（5 星 > 40% 告警）
- [x] 4.4 实现英文新闻/空标题追踪分析：各阶段通过率，无英文新闻告警
- [x] 4.5 实现推荐配置输出：基于过滤率均衡性和 LLM 超时次数推荐最佳参数组合
- [x] 4.6 实现报告持久化：输出到 stdout 同时保存为 `results/analysis_{timestamp}.md`

## 5. 执行全量回归测试

- [x] 5.1 执行 `run_pipeline_regression.py` 完成 6 组 Run，确认全部正常完成
- [x] 5.2 执行 `analyze_results.py` 生成对比报告，确认数据完整性
- [x] 5.3 将分析报告保存到 `tests/testdata/pipeline_regression_report.md`
