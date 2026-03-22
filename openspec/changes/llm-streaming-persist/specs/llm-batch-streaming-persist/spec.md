## ADDED Requirements

### Requirement: LLM 批次完成后立即持久化
系统 SHALL 在每个 LLM 批次（主批次或重试子批次）处理完成后立即调用 `on_batch_done` 回调持久化结果，不等待其余批次完成。

#### Scenario: 主批次正常完成
- **WHEN** 主批次 LLM 调用成功，`_merge_batch_result` 返回结果
- **THEN** 立即调用 `on_batch_done(processed_items, kept_items)`，结果写入 DB

#### Scenario: 重试子批次完成
- **WHEN** 重试子批次 LLM 调用成功或降级
- **THEN** 立即调用 `on_batch_done(processed_items, kept_items)`，结果写入 DB

#### Scenario: 回调为 None
- **WHEN** `on_batch_done=None`（默认值）
- **THEN** 行为与改前完全一致，函数 return 后由调用方统一处理

#### Scenario: 回调异常
- **WHEN** `on_batch_done` 内部抛出异常
- **THEN** 记录 WARNING 日志，主流程不中断，批次结果仍加入全量列表
