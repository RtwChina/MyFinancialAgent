## Context

当前 `enhance_news_with_llm` 内部用 `as_completed` 收集结果，成功批次立刻 merge 到内存列表，但函数直到全部批次（含重试）完成才 return。`collect_all_news` 在函数 return 后才统一写 DB。

超时路径耗时：主批次超时 120s → 重试子批次超时 120s = 最长 240s 阻塞成功批次入库。

## Goals / Non-Goals

**Goals:**
- 每个批次完成后立即调用 `on_batch_done(processed_items, kept_items)` 写 DB
- 写 DB 与后续批次的 LLM 调用并行进行
- 超时重试路径不变，降级结果同样即时写入

**Non-Goals:**
- 不改变 filter_log / pipeline_trace 写入时机（依赖全量结果，仍在最后写）
- 不改变日期级 summary 生成逻辑
- 不引入消息队列或额外进程

## Decisions

**决策 1：回调函数 `on_batch_done(processed_items, kept_items)`**

最小侵入方式。`enhance_news_with_llm` 对写 DB 无感知，调用方自行决定回调实现。本地环境回调写 SQLite，远端回调调用 Workers API。回调为 `None` 时行为与现在完全一致（向后兼容）。

**决策 2：回调在 `as_completed` 循环内同步调用**

不额外开线程。DB 写入本身很快（一批 6 条），同步调用不会阻塞 LLM 线程池（LLM 线程池已跑在独立 executor 里）。

**决策 3：全量结果列表仍然维护**

`processed_news` / `enhanced` 照常积累，函数返回值不变。这样 filter_log、pipeline_trace、日期级 summary 等依赖全量结果的逻辑零改动。

**流程对比：**

```
改前：
  batch-1 成功 → 进内存 → 等 batch-24 超时(120s) → 等重试(120s) → return → 写 DB

改后：
  batch-1 成功 → on_batch_done → 写 DB  ← 立即
  batch-24 超时 → 重试 → on_batch_done → 写 DB
  函数 return（全量列表用于 summary/trace）
```

## Risks / Trade-offs

- **重复写入风险**：`ingestNews` 用 `ON CONFLICT(news_hash) DO UPDATE`，本地 SQLite 也是 upsert，重复调用安全
- **回调异常**：回调内部捕获异常并记录 WARNING，不中断主流程
- **并发写 SQLite**：回调在主线程串行调用（`as_completed` 单线程消费），无并发写冲突
