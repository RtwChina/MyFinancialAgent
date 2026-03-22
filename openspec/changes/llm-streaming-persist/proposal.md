## Why

Stage 3 LLM 批次并发执行时，成功的批次结果会立刻在内存中 merge，但整个 `enhance_news_with_llm` 函数要等到所有批次（含重试）全部完成才 return，`collect_all_news` 才开始写 DB。一个批次超时 120s + 重试再 120s，成功批次的结果被白白阻塞最多 240s。

## What Changes

- `enhance_news_with_llm` 接受一个可选的 **persist 回调**，每当一个批次（主批次或重试子批次）处理完成，立刻调用回调写 DB，不等其他批次
- `collect_all_news` 提供该回调，将批次结果即时写入本地 SQLite / 远端 D1
- 最终汇总阶段只做日期级 summary、filter_log、pipeline_trace 的写入（这些依赖全量结果，仍需等全部完成）

## Capabilities

### New Capabilities
- `llm-batch-streaming-persist`: LLM 批次完成后立即持久化，不阻塞等待超时批次的重试

### Modified Capabilities
（无 spec 级别的需求变更）

## Impact

- `src/collect_news_v3.py`：`enhance_news_with_llm` 新增 `on_batch_done` 回调参数；`collect_all_news` 提供回调实现
- 不改变三级漏斗逻辑、不改变 filter_log / pipeline_trace 写入时机
