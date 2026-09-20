# Data Model: 兼容既有复盘数据

无新增业务表、字段、索引或迁移；不改现有唯一约束。

| 实体/表 | 关键字段与关系 | 不变规则 |
|---|---|---|
| daily_review_archive | archive_date；review_status；reviewer_news_notes；market_sentiment_blocks_json；sector_rotation_blocks_json；trading_summary；reviewed_at/updated_at | NULL 与显式 [] 区分；正文保存优先级及状态解释不变 |
| daily_review_action_plans | archive_date/account_id/symbol；计划正文、仓位、金额、支撑压力、排序 | 按现有账户解析、去重、标的校验；upsert 顺序后再删除不在本次集合的记录 |
| account_live_action_plans | account_id/symbol；同类计划字段 | 只有原有最新复盘日期保存条件成立才同步 |
| news_raw_data | id/news_hash；时间、类型、星级、规则结果、分析内容及 processing_status | 来源 ID 优先，否则原窗口与筛选；标记 reviewed 的位置不变 |
| daily_review_archive_news | archive_date/original_news_id/news_hash；新闻归档字段及 archived_at | 按原排序逐条归档；相同日期与 hash 的覆盖规则以及 null hash 行为不变 |
| review_account_snapshots | archive_date；accounts_snapshot；snapshot_source；notes；created_at/updated_at | 手动/批量来源不变；更新不改 created_at；现有账户与影响标准化不变 |
| investment_accounts | id；账户属性、total_assets、available_cash、updated_at | 默认账户生成规则及 COALESCE 保留原资产/现金的规则不变 |

## State and failure boundaries

initialized/draft 的保存状态沿用请求及现有记录逻辑，不新增自动 draft 转换；所有必要归档、快照与账户同步成功后才更新 reviewed。已 reviewed 的手动重复完成沿用当前行为，批量 onlyIfPending 继续跳过。

保存阶段写入顺序、新闻状态更新、归档删除与逐条插入、快照、账户逐条同步、最终 reviewed 的提交边界原样保留。发生错误停止后续操作，保留已提交前缀；不得将整个过程描述为事务。

## Non-persistent measurement record

仅测试产物/诊断日志：runId、variant、fixture、sampleIndex、stage、durationMs、callCount、success、errorCategory。不记录新闻正文、账户金额和凭据。记录保存在被忽略的测试输出目录，不写入业务表。

## Equality rules

比较所有业务字段及记录数；账户/标的/日期/hash 对应关系必须一致。生成主键以对应关系归一化，时间验证格式、写入事件顺序与 created/updated 保留规则；不使用简单删除所有时间字段的方式隐藏回归。
