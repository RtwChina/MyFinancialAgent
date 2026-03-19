## ADDED Requirements

### Requirement: 静态词表与动态词表合并
系统 SHALL 将静态基础词表与 LLM 生成的动态词表合并，动态词作为增量补充而非替代。

#### Scenario: 正常合并静态词与动态词
- **WHEN** LLM 成功返回动态词表 `{macro_keywords: ["海峡"], market_keywords: ["AI监管"]}`
- **THEN** 系统合并后宏观词表包含静态词 + `"海峡"`，市场词表包含静态词 + `"AI监管"`

#### Scenario: 动态词去重
- **WHEN** LLM 返回的动态词与静态词重复
- **THEN** 系统去重后只保留一份

### Requirement: 日志区分词表来源
系统 SHALL 在日志中清晰区分静态词表与动态词表。

#### Scenario: 打印词表来源
- **WHEN** 初筛规则生成完成
- **THEN** 日志包含：
  - `[初筛] 静态词表: 宏观=N词, 市场=M词, 噪音=K词`
  - `[初筛] 动态词表: 新增宏观=X词[...], 新增市场=Y词[...], 动态主题=Z个`

### Requirement: 动态词生成失败时明确报错
系统 SHALL 在动态词生成失败时抛出异常而非静默降级。

#### Scenario: LLM 调用失败
- **WHEN** LLM 调用返回 `success=False`
- **THEN** 系统抛出 `RuntimeError` 并记录 `model`、`error` 信息

#### Scenario: JSON 解析失败
- **WHEN** LLM 返回的内容无法解析为有效 JSON
- **THEN** 系统抛出 `RuntimeError` 并记录原始响应前 500 字

### Requirement: collect_prices.yml 开启 LLM
`collect_prices.yml` 工作流 SHALL 设置 `SKIP_LLM: "false"` 以启用动态规则生成。

#### Scenario: 收盘后任务执行 LLM 分析
- **WHEN** `collect_prices.yml` 工作流运行
- **THEN** 系统执行动态初筛规则生成、批次分析、日期级汇总三个 LLM 调用