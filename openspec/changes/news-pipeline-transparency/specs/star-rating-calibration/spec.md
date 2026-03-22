## ADDED Requirements

### Requirement: chain-of-thought-reasoning
LLM 打星 prompt SHALL 要求 LLM 对每条新闻先列出"重要理由"和"不重要理由"，再给出评分。推理过程记入 `llm_cot_reasoning` 字段。

第三方接口分类：LLM API（B 类，不可控）。测试时使用固定 mock 响应验证 prompt 构造正确性。

#### Scenario: CoT 推理过程记录
- **GIVEN** 一条关于"美联储意外降息 50bp"的新闻
- **WHEN** LLM 返回结果
- **THEN** `llm_cot_reasoning` 包含"重要理由：直接影响利率预期..."和"不重要理由：..."两部分

### Requirement: anchor-examples-in-prompt
LLM 打星 prompt SHALL 包含 5 条锚定示例（每个星级 1 条），明确各星级的边界标准。示例使用与跟踪标的相关的真实场景。

#### Scenario: prompt 包含锚定示例
- **GIVEN** LLM 深度分析调用
- **WHEN** 构造 system prompt
- **THEN** prompt 中包含 5 星、4 星、3 星、2 星、1 星各一条具体示例

### Requirement: distribution-constraint
LLM 打星 prompt SHALL 包含分布约束指令：5 星不超过 20%，4-5 星合计不超过 40%。

#### Scenario: prompt 包含分布约束
- **GIVEN** 一批 10 条新闻发送给 LLM
- **WHEN** 构造 user prompt
- **THEN** prompt 文本中包含明确的分布约束说明

### Requirement: rule-based-fallback
当一批 LLM 返回结果中 ≥ 80% 的新闻为 5 星时，系统 SHALL 触发规则兜底：使用 `_score_to_stars()` 重新分配星级，保留 LLM 的其他字段不变。

#### Scenario: 全部 5 星触发兜底
- **GIVEN** LLM 返回 10 条新闻，其中 9 条为 5 星
- **WHEN** 兜底规则检查
- **THEN** 9 条 5 星新闻的 `importance_stars` 被替换为规则评分值，`llm_summary` 和 `market_impact` 保持不变

#### Scenario: 正常分布不触发兜底
- **GIVEN** LLM 返回 10 条新闻，分布为 2×5星、3×4星、3×3星、2×2星
- **WHEN** 兜底规则检查
- **THEN** 所有星级保持 LLM 原始返回值

#### Scenario: 兜底结果记录
- **GIVEN** 兜底规则被触发
- **WHEN** filter_log 写入
- **THEN** `llm_raw_response` 保留 LLM 原始星级，`llm_stars` 为兜底后的星级，pipeline_trace 记录 `star_fallback_triggered=1`

冒烟用例触发条件：当打星 prompt 或兜底逻辑有变更时，需验证：(1) prompt 包含 CoT 指令、锚定示例和分布约束 (2) 兜底规则在极端情况下正确触发。
