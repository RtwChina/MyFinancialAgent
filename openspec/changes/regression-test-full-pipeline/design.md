## Context

前 4 次手动回归测试暴露了多个盲区：
- 未配置 FINNHUB_API_KEY → 无英文新闻（Finnhub general + company 两个子源），英文关键词命中、空标题处理均未验证
- 动态规则生成 3/4 次超时（qwen3.5-plus 60s timeout），降级静态词表 → 策略 A/B/C 在不同规则集下对比不公平
- 未观察打星分布（只知道 fallback 触发了 1 次，但正常情况下 1-5 星各多少不清楚）
- 未验证 daily summary 生成、pipeline_trace/filter_log 远程写入
- 无自动化 → 手动逐个跑、手动记录，容易遗漏

当前 pipeline 三级漏斗：采集(~110-200条) → Stage1 关键词规则 → Stage2 Embedding 语义过滤 → Stage3 LLM 深度分析。三种评分策略 A/B/C 并行计算分数，由 `RULE_ACTIVE_STRATEGY` 决定实际过滤使用哪个。

## Goals / Non-Goals

**Goals:**
- 全量真实运行：FINNHUB_API_KEY 配置、英文+中文新闻混合、空标题新闻自然覆盖
- 参数矩阵自动化：脚本驱动 3 策略 × 2 Embedding 阈值 = 6 组 Run，每组自动记录结果
- 完整数据采集：漏斗每层输入/输出/过滤率、打星分布（1-5 星各多少条）、CoT 质量样本、英文新闻命中率、空标题新闻处理情况
- 对比分析报告：自动输出策略对比表、异常标记

**Non-Goals:**
- 不修改生产代码（纯测试工具）
- 不部署到测试环境（本地运行）
- 不验证前端 UI
- 不做性能压测

## Decisions

### D1: 测试脚本架构 — 单脚本驱动 vs 多脚本拆分

**选择**: 两个脚本 — `run_pipeline_regression.py` 负责执行，`analyze_results.py` 负责分析。

**理由**: 执行和分析关注点不同。执行脚本需处理进程隔离（每组 Run 用独立子进程，避免模块级变量污染）；分析脚本纯读取 JSON 输出。拆开后可以反复分析不用重跑。

### D2: 进程隔离 — subprocess vs 函数调用

**选择**: 每组 Run 用 `subprocess.run()` 调用 `collect_news_v3.py` 的 `collect_all_news()`，通过环境变量注入参数。

**理由**: `collect_news_v3.py` 的配置参数（`LLM_BATCH_SIZE`、`RULE_ACTIVE_STRATEGY` 等）在模块加载时从 `os.getenv()` 读取，函数调用无法在同一进程内切换。子进程天然隔离。

### D3: 数据采集方式 — 拦截 collect_all_news 返回值

**选择**: 写一个轻量 wrapper 脚本，import `collect_all_news` 执行后将返回的 dict（含 pipeline_trace、filter_logs）序列化为 JSON 输出到 stdout。主脚本解析 stdout。

**理由**: `collect_all_news()` 已返回完整的 trace + filter_logs，无需额外 hook。通过 stdout JSON 传递数据最简洁。

### D4: LLM_RULES_TIMEOUT 保障

**选择**: 所有 Run 强制 `LLM_RULES_TIMEOUT=120`（比默认 60s 翻倍），确保动态规则不降级。

**理由**: 前 4 次 Run 中 3 次动态规则超时，导致策略对比在不同规则集下进行，失去可比性。120s 应能覆盖 qwen3.5-plus 的长尾响应时间。

### D5: 参数矩阵

| Run | Strategy | Embedding Threshold | 备注 |
|-----|----------|-------------------|------|
| R1 | A | 0.40 | Baseline |
| R2 | B | 0.40 | BM25 vs 线性 |
| R3 | C | 0.40 | 标题加权 vs 不加权 |
| R4 | A | 0.50 | 高 Embedding 阈值 |
| R5 | B | 0.50 | 高阈值 + BM25 |
| R6 | C | 0.50 | 高阈值 + 标题加权 |

固定参数：`LLM_BATCH_SIZE=8`, `LLM_MAX_WORKERS=3`, `LLM_BATCH_TIMEOUT=90`, `LLM_RULES_TIMEOUT=120`

### D6: 结果 JSON 结构

每组 Run 输出一个 JSON 文件到 `tests/regression/results/`：

```json
{
  "run_id": "xxx",
  "params": { "strategy": "A", "embedding_threshold": 0.40, ... },
  "funnel": { "fetched": 200, "deduped": 180, "rule_passed": 80, ... },
  "timing": { "fetch": 0.3, "rule": 58.0, "embedding": 9.8, "llm": 297.0 },
  "star_distribution": { "1": 5, "2": 12, "3": 15, "4": 10, "5": 6 },
  "star_fallback_triggered": false,
  "english_news": { "total": 30, "rule_passed": 12, "embedding_passed": 8, "llm_kept": 5 },
  "empty_title": { "total": 5, "rule_passed": 2, "final_kept": 1 },
  "dynamic_rules_status": "success|timeout_degraded",
  "cot_samples": [ ... top 3 samples ... ],
  "errors": []
}
```

## Risks / Trade-offs

- **[LLM API 不稳定]** → 120s timeout + 2 次重试 + 记录降级状态，不 block 后续 Run
- **[6 组 Run 耗时长 ~35 min]** → 脚本输出进度条，支持 `--only=R1,R3` 选择性运行
- **[Finnhub API rate limit]** → Finnhub 免费版 60 call/min，6 组 Run 每组 1 次调用不会超限；但如果短时间反复跑可能触发。脚本在 Run 之间加 10s 间隔
- **[新闻数据时效性]** → 不同时间运行采集到的新闻不同。每组 Run 记录采集时间和新闻 hash 列表，分析时考虑数据差异
