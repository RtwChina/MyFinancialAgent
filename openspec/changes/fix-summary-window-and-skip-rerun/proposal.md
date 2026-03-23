## Why

日期级新闻 summary 当前存在两个问题：

1. **远端候选加载时间窗失真**
   `load_news_for_summary()` 在远端模式下将精确时间窗口 `YYYY-MM-DD HH:MM:SS` 截断为日期 `YYYY-MM-DD` 调用 `/api/news`，再叠加 `limit=200` 和 `ORDER BY pub_date DESC`，会导致真正属于复盘窗口的较早新闻被截断掉，日志出现“候选 0 条”，但 D1 实际上存在大量符合条件的数据。

2. **同一复盘日 summary 被重复重算**
   `close-summary` / `full` 每次运行都会尝试重新加载候选并生成 summary。对于已经存在 `daily_news_ai_analysis` 的 `analysis_date`，重复 LLM 重算没有明显收益，还会放大候选加载 bug 的影响。

## What Changes

- **新增 summary 已存在即跳过重算的规则**
  - 当 `persist_summary=True` 且目标 `analysis_date` 在 `daily_news_ai_analysis` 中已存在记录时，直接跳过日期级 summary 候选加载、LLM 汇总和 summary 写入。
  - 保留后续复盘初始化逻辑，避免影响 review/archive 流程。

- **修复远端 summary 候选加载的时间窗精度**
  - 远端 summary 加载必须基于完整的 `start_time` / `end_time` 精确时间窗口，而不是只按日期截断查询。
  - 防止 `limit=200` + 倒序返回时把真正属于复盘窗口的数据截掉。

- **增强 summary 过滤日志**
  - 当候选为空时，日志应能区分是“时间窗外”“状态不符”“星级不足”还是“远端返回被截断”，避免误判为 D1 无数据。

## Capabilities

### New Capabilities

- `news-summary-generation`
  - 支持“已存在 summary 则跳过重算”的幂等行为
  - 支持按精确时间窗口加载远端 summary 候选新闻

### Modified Capabilities

- `news-summary-generation`
  - 日期级 summary 候选加载从“日期粒度近似”改为“精确时间窗”

## Impact

- `src/collect_news_v3.py`
  - 在 summary 阶段增加“是否已存在 summary”检查
  - 调整远端 summary 候选加载逻辑
  - 增强候选为空时的诊断日志

- `src/cloudflare_ingest.py`
  - 视实现方案而定，新增精确时间窗查询参数支持

- `cloudflare/worker/src/index.js`
  - 视实现方案而定，增强 `/api/news` 查询能力或新增 summary 专用读取接口
