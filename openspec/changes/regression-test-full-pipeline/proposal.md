## Why

前 4 次回归测试存在严重盲区：未配置 FINNHUB_API_KEY（缺少英文新闻源）、无空标题新闻覆盖、部分 Run 因动态规则超时降级静态词表导致 A/B/C 策略对比不公平、未验证 LLM 打星分布和 CoT 质量、未验证 daily summary 生成、未验证远程写入（pipeline_trace + filter_log）。需要设计一套完整的、可复现的全量回归测试方案，覆盖所有真实场景。

## What Changes

- 建立标准化回归测试执行规范：明确环境前置条件、参数矩阵、数据采集点、结果记录格式
- 设计 6 组参数组合的全量 Run 矩阵（3 策略 × 2 Embedding 阈值），每组记录完整漏斗、打星分布、CoT 质量、耗时
- 新增回归测试 Python 脚本自动化执行多组 Run，避免人工遗漏
- 新增结果对比分析脚本，输出策略对比表、打星分布直方图（文本）、Embedding 过滤率曲线
- 修复前置条件：确保 FINNHUB_API_KEY 可用、LLM_RULES_TIMEOUT 足够长避免动态规则降级

## Capabilities

### New Capabilities
- `regression-test-runner`: 自动化执行多组参数组合的 pipeline 回归测试，采集完整漏斗数据、打星分布、CoT 样本、filter_log 统计
- `regression-result-analyzer`: 对比分析多次 Run 的结果，输出策略对比表、异常检测（空标题处理、英文新闻命中率、打星分布偏移）

### Modified Capabilities
（无修改现有能力的需求）

## Impact

- **新增文件**: `tests/regression/run_pipeline_regression.py`、`tests/regression/analyze_results.py`
- **修改文件**: 无生产代码修改（纯测试工具）
- **环境依赖**: 需要 `FINNHUB_API_KEY`、`LLM_API_KEY` 配置在 `.env` 中
- **耗时预估**: 6 组 Run，每组 ~5-6 分钟，总计 ~35 分钟
- **风险**: LLM API 超时可能导致部分 Run 数据不完整，脚本需记录降级情况
