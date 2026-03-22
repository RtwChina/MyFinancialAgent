## ADDED Requirements

### Requirement: 多 Run 结果自动加载
分析脚本 SHALL 自动扫描 `tests/regression/results/` 目录下最近一批 JSON 文件进行对比分析。

#### Scenario: 加载最近一批结果
- **GIVEN** 目录下有多批次的 JSON 文件（不同时间戳）
- **WHEN** 执行 `analyze_results.py`（不带参数）
- **THEN** 自动加载最近一批（按时间戳分组）的所有 Run 结果

#### Scenario: 指定批次加载
- **GIVEN** 用户指定 `--batch=20260321_0901`
- **WHEN** 执行脚本
- **THEN** 仅加载该批次的 JSON 文件

### Requirement: 策略对比表输出
脚本 MUST 输出策略对比表，包含每组 Run 的关键指标横向对比。

#### Scenario: 完整对比表
- **GIVEN** 6 组 Run 结果已加载
- **WHEN** 分析完成
- **THEN** 输出 Markdown 表格，列包含：Run ID、Strategy、Embedding Threshold、Dynamic Rules Status、Rule Output、Embedding Filtered%、LLM Input、LLM Filtered%、Final Count、LLM Timeouts、Total Duration

#### Scenario: 部分 Run 缺失
- **GIVEN** 仅有 R1、R2、R4 的结果（R3 崩溃无输出）
- **WHEN** 分析运行
- **THEN** 对比表中 R3 行显示 "N/A"，不影响其余 Run 的分析

### Requirement: 打星分布分析
脚本 MUST 输出每组 Run 的打星分布，并标记异常分布。

#### Scenario: 正常分布展示
- **GIVEN** Run 的 star_distribution 为 `{"1":5,"2":12,"3":15,"4":10,"5":6}`
- **WHEN** 分析输出
- **THEN** 展示文本直方图和百分比，标记为"分布正常"

#### Scenario: 异常分布告警
- **GIVEN** Run 的 star_distribution 中 5 星占比 > 40%
- **WHEN** 分析输出
- **THEN** 标记该 Run 为 "⚠ 打星分布异常：5 星占比过高"

### Requirement: Embedding 过滤率对比
脚本 MUST 对比不同 Embedding 阈值下的过滤率，评估阈值有效性。

#### Scenario: 阈值对比
- **GIVEN** R1 (threshold=0.40, filtered=10%) 和 R4 (threshold=0.50, filtered=29%)
- **WHEN** 分析输出
- **THEN** 展示 "阈值 0.40→0.50：过滤率从 10% 提升至 29%"

### Requirement: 英文新闻与空标题追踪分析
脚本 MUST 分析英文新闻和空标题新闻在各阶段的通过情况。

#### Scenario: 英文新闻命中率
- **GIVEN** Run 中 english_news.total=30, llm_kept=5
- **WHEN** 分析输出
- **THEN** 展示 "英文新闻最终保留率: 5/30 = 17%"

#### Scenario: 无英文新闻告警
- **GIVEN** Run 中 english_news.total=0
- **WHEN** 分析输出
- **THEN** 标记 "⚠ 无英文新闻 — FINNHUB_API_KEY 可能未配置"

#### Scenario: 空标题新闻处理验证
- **GIVEN** Run 中 empty_title.total > 0
- **WHEN** 分析输出
- **THEN** 展示空标题在各阶段的通过情况，验证 Strategy C 是否正确退化为 B

### Requirement: 推荐配置输出
分析完成后 MUST 根据对比结果输出推荐默认配置。

#### Scenario: 自动推荐
- **GIVEN** 6 组 Run 全部完成
- **WHEN** 分析完成
- **THEN** 基于最终保留条数、过滤率均衡性、LLM 超时次数，推荐 Strategy + Embedding Threshold 组合

### Requirement: 报告持久化
分析报告 MUST 同时输出到 stdout 和保存为 Markdown 文件。

#### Scenario: 报告保存
- **GIVEN** 分析完成
- **WHEN** 查看结果目录
- **THEN** 存在 `tests/regression/results/analysis_{timestamp}.md` 报告文件
