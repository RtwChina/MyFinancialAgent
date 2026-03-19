## ADDED Requirements

### Requirement: 统一启动日志
启动时输出一段合并的配置信息，不重复打印分隔线和版本号。

#### Scenario: 新闻采集启动
- **WHEN** 新闻采集脚本启动
- **THEN** 输出一段启动日志，包含：分析日、LLM 模型名、各阶段超时、重试次数、并发数、批量大小

#### Scenario: 价格采集启动
- **WHEN** 价格采集脚本启动
- **THEN** 输出一行启动日志，包含：标的数量、数据源

### Requirement: 阶段耗时统计
每个关键阶段完成时输出耗时。

#### Scenario: 新闻采集各阶段
- **WHEN** 采集/初筛/批次分析/写入/日总结 任一阶段完成
- **THEN** 输出 `[阶段名] 完成: 关键结果, 耗时 X.Xs` 格式的 INFO 日志

### Requirement: 移除 print 输出
所有用户可见输出统一使用 logger，不使用 print。

#### Scenario: 控制台输出
- **WHEN** 脚本运行
- **THEN** 不出现任何 print 输出，全部通过 logger

### Requirement: 统一日志调用风格
使用 `%s` 占位符，不使用 f-string。

#### Scenario: logger 调用
- **WHEN** 任何 logger.info/error/debug 调用
- **THEN** 使用 `logger.info("msg %s", var)` 风格，不使用 `logger.info(f"msg {var}")`

### Requirement: 错误日志格式
错误日志包含阶段标签和错误类型。

#### Scenario: LLM 调用失败
- **WHEN** LLM 调用超时或报错
- **THEN** 输出 `[阶段] 错误类型: 详情` 格式的 ERROR 日志

#### Scenario: API 写入失败
- **WHEN** Cloudflare D1 写入失败
- **THEN** 输出 `[写入D1] 错误类型: 详情` 格式的 ERROR 日志

#### Scenario: 数据源 HTTP 请求失败
- **WHEN** 新闻/价格数据源 HTTP 请求抛出异常
- **THEN** 输出 `[采集] 数据源名 请求失败: 详情` 格式的 ERROR 日志

### Requirement: LLM 调用汇总
Pipeline 结束时按模型输出 LLM 调用统计。

#### Scenario: 新闻采集流程完成
- **WHEN** `run_news_pipeline` 执行完毕
- **THEN** 按模型分组输出 INFO 日志，包含：调用次数、prompt 字符数、response 字符数、总耗时
- **AND** 格式为 `[LLM汇总] 模型名: 调用 N次, prompt Xk字, response Xk字, 耗时 X.Xs`

### Requirement: 中间态数据日志
关键中间态数据用 INFO 级别记录，便于排查问题。

#### Scenario: 动态初筛规则生成
- **WHEN** 动态初筛规则生成完成
- **THEN** INFO 日志记录生成的关键词列表和 score_threshold

#### Scenario: LLM 批次返回
- **WHEN** 单批次 LLM 调用返回
- **THEN** INFO 日志记录原始返回文本前 200 字符

#### Scenario: 规则打分（逐条）
- **WHEN** 单条新闻经过规则打分
- **THEN** DEBUG 日志记录命中的关键词和最终得分（逐条量大，避免刷屏）
