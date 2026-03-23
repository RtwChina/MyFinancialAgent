## Context

当前数据关系大致如下：

```text
daily_review_archive            当前复盘正文
daily_news_ai_analysis          当前 AI 日总结
daily_review_archive_news       已完成复盘时保存的新闻快照
```

问题在于：

- `daily_review_archive` 是“当前正文”，无历史版本
- `daily_news_ai_analysis` 是“当前 AI 总结”，无历史版本
- 即使 `daily_review_archive_news` 存在，也无法恢复被覆盖的正文或 AI 总结

所以需要的是“当前态的历史快照层”，而不是改变主表语义。

## Goals / Non-Goals

**Goals**

- 为复盘正文和 AI 总结提供手动版本快照
- 支持同一日期保存多个版本
- 不改变现有主表“当前态唯一记录”的读写方式
- 为未来恢复某个版本提供数据基础

**Non-Goals**

- 不把主表改成多版本表
- 不自动在每次更新时都生成快照
- 第一版不要求给 `daily_review_archive_news` 再做版本化
- 第一版不强制提供完整前端恢复 UI

## Table Naming

采用更贴近业务语义的“快照”命名，而不是继续沿用 archive/history/versions：

- `daily_review_snapshots`
- `daily_news_ai_analysis_snapshots`

这样语义最清晰：

- `daily_review_archive` = 当前复盘记录
- `daily_review_snapshots` = 历史版本快照

## Schema Direction

### 1. `daily_review_snapshots`

建议字段：

- `id`
- `archive_date`
- `version_no`
- `snapshot_reason`（可选）
- `review_status`
- `reviewer_news_notes`
- `market_sentiment`
- `sector_rotation`
- `asset_plan`
- `trading_summary`
- `reviewed_at`
- `snapshot_created_at`

约束：

- `UNIQUE(archive_date, version_no)`

### 2. `daily_news_ai_analysis_snapshots`

建议字段：

- `id`
- `analysis_date`
- `version_no`
- `snapshot_reason`（可选）
- `daily_major_events`
- `sector_impact_map`
- `linkage_logic_chain`
- `source_news_ids`
- `snapshot_created_at`

约束：

- `UNIQUE(analysis_date, version_no)`

## Version Strategy

版本号只保留一个字段：

- `version_no INTEGER`

值直接存：

- `1`
- `2`
- `3`

原因：

- 不冗余
- 排序与取最新版本简单
- 不会出现 `version_no=2` / `version_label=V3` 这类不一致
- 既然基本不展示，就没必要单独存 `V1/V2`

生成规则：

```text
SELECT MAX(version_no)
WHERE archive_date / analysis_date = 当前日期

next_version = max + 1
```

## Operation Model

这是一个**显式手动动作**：

```text
用户说“归档当前版本”
    ├─ 读取 daily_review_archive 当前记录
    ├─ 读取 daily_news_ai_analysis 当前记录
    ├─ 计算各自下一个 version_no
    └─ 插入到两张 snapshot 表
```

不是自动副作用：

- 不在每次保存 review draft 时自动快照
- 不在每次写 AI summary 时自动快照
- 不在 completeReview 时自动快照

原因：

- 自动快照会制造大量低价值版本
- bug 期间可能连续归档多份错误内容
- 手动归档更符合“里程碑保存”的使用意图

## Data Flow

```text
当前态主表
┌──────────────────────────────┐
│ daily_review_archive         │
│ daily_news_ai_analysis       │
└──────────────┬───────────────┘
               │
       手动执行“归档当前版本”
               │
               ▼
┌──────────────────────────────┐
│ daily_review_snapshots       │
│ daily_news_ai_analysis_      │
│ snapshots                    │
└──────────────────────────────┘
```

## Recovery Path

虽然第一版可以先只做“保存快照”，但 schema 设计应天然支持未来恢复：

```text
选择某个 archive_date / analysis_date 的 version_no
    -> 用该快照覆盖主表当前记录
```

因此快照表中的字段应保存足够完整的主表内容，避免未来恢复时信息不全。

## Risks / Trade-offs

- **手动归档依赖人为操作**
  如果用户忘记归档，仍然可能失去某次重要版本。这是手动模型的天然代价。

- **双表归档一致性**
  归档时需要考虑：
  - `daily_review_archive` 有记录但 `daily_news_ai_analysis` 没记录
  - 或反过来

  第一版应允许部分存在：
  - 哪张表有当前记录，就归档哪张
  - 不要求必须两张都存在

- **恢复动作需要更严格保护**
  保存快照的风险较低；恢复覆盖主表的风险更高。建议先做快照保存，恢复作为后续单独能力。
