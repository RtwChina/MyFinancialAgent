## Why

当前系统中，以下两张表承载的是“当前态”数据：

- `daily_review_archive`
- `daily_news_ai_analysis`

它们都以日期为唯一键，后续更新会直接覆盖旧内容。一旦出现 bug、误操作或错误写入，历史复盘正文与 AI 总结可能被清空或被错误内容覆盖，恢复成本高。

现有 `daily_review_archive_news` 已经保存了新闻快照，但**复盘正文**与**AI 日总结**本身没有版本历史，仍然缺少“可回滚”的安全层。

## What Changes

- 新增两张手动版本快照表：
  - `daily_review_snapshots`
  - `daily_news_ai_analysis_snapshots`

- 快照采用“手动归档”模式，而不是自动每次变更都保存：
  - 只有用户明确执行“归档当前版本”时，才会把当前态复制进快照表
  - 相同日期可存在多个版本

- 版本号使用整数 `version_no`：
  - 第一次归档为 `1`
  - 第二次归档为 `2`
  - 以此类推

## Capabilities

### New Capabilities

- `review-snapshots`
  - 支持将 `daily_review_archive` 当前记录手动保存为历史快照
  - 支持将 `daily_news_ai_analysis` 当前记录手动保存为历史快照
  - 支持同一复盘日保存多个版本号

### Modified Capabilities

- 无现有能力修改；本次为新增安全快照能力

## Impact

- `cloudflare/migrations/`
  - 新增两张快照表及索引

- `cloudflare/worker/src/index.js`
  - 新增手动归档快照相关 API（或等价入口）

- `src/cloudflare_ingest.py`
  - 如需要，增加对应 API 调用封装

- 文档
  - README / 运维说明增加“如何手动归档当前版本”和“如何恢复”的说明
