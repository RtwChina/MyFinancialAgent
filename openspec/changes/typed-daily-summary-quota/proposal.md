## Why

当前日期级 summary 仍然采用“按重要性和时间全局排序后直接取前 20 条”的策略。当天宏观/大盘主线很强时，这 20 条会被同类新闻占满，导致数据库里明明存在高质量板块或个股新闻，但最终 `source_news_ids` 和复盘页里看不到对应类别。

在完成新闻类型标准化之后，需要立即把日总结输入策略升级为“按类型保底 + 弹性扩容”，并把 summary 生成改造成三桶并行分析后由程序拼装最终结果，避免大盘新闻挤压板块与个股视角。

## What Changes

- 将日期级 summary 候选过滤阈值从 `importance_stars >= 3` 提升为 `importance_stars >= 4`
- 按标准新闻类型分三桶选取 summary 输入：
  - 大盘桶：`index`
  - 板块桶：`sector`
  - 个股桶：`stock`
- 引入“保底 + 弹性”选入策略：
  - 每个桶先满足最低保底名额
  - 剩余名额再按全局重要性补齐
- 将日期级 summary 从“1 次总总结”改为：
  - 大盘桶 AI 分析
  - 板块桶 AI 分析
  - 个股桶 AI 分析
  - 程序拼装最终日总结
- `source_news_ids` 改为记录三桶合并后的全部实际 AI 入参新闻，而不是单一全局前 20 条
- 日期级日总结模型改为单独配置：
  - `LLM_DAILY_SUMMARY_MODEL_ID`
  - `LLM_DAILY_SUMMARY_TIMEOUT`
- 增强 summary 日志，明确输出：
  - stars>=4 过滤后总量
  - 三桶候选量
  - 保底/弹性选入结果
  - 三桶分别“符合要求”的新闻数量与新闻 ID
  - 每桶实际 AI 入参数量
  - 每桶最终进入 LLM 的新闻数量与新闻 ID

## Capabilities

### New Capabilities
- `typed-daily-summary-selection`: 定义日期级 summary 的 stars>=4 过滤、三桶选入、保底+弹性配额，以及合并后的 `source_news_ids` 行为
- `parallel-daily-summary-generation`: 定义三桶并行 AI 子总结与程序拼装最终日总结的生成行为

### Modified Capabilities

## Impact

- `src/collect_news_v3.py`
  - 调整 `load_news_for_summary()` 过滤阈值
  - 重构 `build_daily_summary_record()` 的选入与生成流程
  - 增加三桶配额、专用 prompt、并行子总结和程序拼装逻辑
  - 增强 summary 日志
  - 增加日期级日总结专用模型配置

- `cloudflare/worker/src/index.js`
  - 复盘页读取的 `source_news_ids` 结果将受新选入策略影响

- 前端复盘页
  - 由于 `source_news_ids` 覆盖更完整，`大盘新闻 / 板块新闻 / 个股新闻` 的展示结构将更稳定

- LLM 调用成本
  - 日期级 summary 从 1 次调用增加为 3 次调用（3 个子总结）
