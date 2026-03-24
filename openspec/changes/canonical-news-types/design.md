## Context

当前系统的新闻类型在代码、前端和历史数据中并不统一。

实际出现过的值包括：

- 标准值：`index`、`sector`、`stock`
- 历史值：`macro`、`market`、`symbol`

当前至少存在以下不一致：

```text
用户希望的新口径：
macro  -> index
market -> index
symbol -> stock

前端当前逻辑：
macro  -> index
market -> sector
symbol -> stock
```

这会导致：

1. 同一条历史新闻在前端可能被分到错误栏目
2. summary 未来做“大盘/板块/个股”分桶时，类型地基不稳定
3. 归档新闻与原始新闻的类型口径可能长期分裂

## Goals / Non-Goals

**Goals**

- 将系统标准新闻类型收敛为 `index / sector / stock`
- 一次性归并历史 D1 数据中的旧类型
- 让前端、后端、归档、复盘页对新闻类型的理解完全一致
- 为后续 summary 配额与并行总结提供稳定基础

**Non-Goals**

- 本 change 不调整 summary 星级阈值
- 本 change 不实现大盘/板块/个股配额策略
- 本 change 不实现三桶并行 summary
- 不删除原始新闻数据，只做类型字段更新

## Decisions

### 决策 1：系统标准新闻类型只保留三种

最终标准值：

- `index`
- `sector`
- `stock`

其中业务语义如下：

- `index`：大盘、宏观、利率、汇率、商品、指数、风险偏好主线
- `sector`：板块、行业、主题、ETF、产业方向
- `stock`：具体公司、个股、单一或少数跟踪标的事件

### 决策 2：历史类型只作为迁移映射，不再作为新逻辑的一部分

历史数据迁移规则：

- `macro -> index`
- `market -> index`
- `symbol -> stock`

迁移完成后：

- 新写路径不得继续产出 `macro / market / symbol`
- 前端与后端读取逻辑不再以这些值作为长期标准

### 决策 3：一次性更新 D1 历史数据，而不是长期兼容

需要更新的表：

- `news_raw_data`
- `daily_review_archive_news`

原因：

- `news_raw_data` 是后续 summary / 复盘读取的主来源
- `daily_review_archive_news` 是 `reviewed` 状态复盘页优先读取的快照来源

本次不要求更新以下表：

- `daily_news_ai_analysis`
- `daily_review_archive`
- snapshot 相关表

因为它们不作为这次类型分组的直接来源，或者不保存逐条新闻 `type` 明细。

### 决策 4：读路径与写路径同步收口

为了避免“历史数据改完，下一次又写回旧值”，本次变更必须同时覆盖：

1. 写路径
   - LLM 输出归一化
   - 新闻持久化
   - 归档新闻写入

2. 读路径
   - review bootstrap
   - 前端新闻分组
   - 前端 fallback analysis
   - 类型标签展示

## Data Migration

建议的 D1 迁移 SQL：

```sql
UPDATE news_raw_data
SET type = 'index'
WHERE type IN ('macro', 'market');

UPDATE news_raw_data
SET type = 'stock'
WHERE type = 'symbol';

UPDATE daily_review_archive_news
SET type = 'index'
WHERE type IN ('macro', 'market');

UPDATE daily_review_archive_news
SET type = 'stock'
WHERE type = 'symbol';
```

迁移前后都应执行统计核对：

```sql
SELECT type, COUNT(*) AS cnt
FROM news_raw_data
GROUP BY type
ORDER BY cnt DESC;

SELECT type, COUNT(*) AS cnt
FROM daily_review_archive_news
GROUP BY type
ORDER BY cnt DESC;
```

目标是迁移后仅剩：

- `index`
- `sector`
- `stock`

## Frontend Impact

前端主影响文件：

- `cloudflare/web/app.js`

至少会影响这些路径：

1. `normalizeNewsType()`
   - 需删除 `market -> sector` 旧映射

2. 复盘页新闻分组
   - `大盘新闻 / 板块新闻 / 个股新闻`

3. fallback analysis
   - 不再直接依赖 `symbol`

4. 类型标签文档
   - README / web README 中旧映射说明要同步更新

## Risks / Trade-offs

- **历史页面展示会立刻变化**
  例如旧的 `market` 新闻在迁移后会从“板块新闻”移动到“大盘新闻”。
  这是预期变化，但需要提前认定这是“修正口径”，不是回归。

- **必须一次性改完读写路径**
  如果只改数据库、不改写路径，下次任务运行仍可能重新写出旧值。

- **需要保留验证手段**
  在执行 D1 更新前后，应有可对照的 type 分布统计，避免误更新。

## Rollout

推荐顺序：

```text
1. 代码收口：写路径与读路径统一为 index / sector / stock
2. 部署代码
3. 执行 D1 update，将历史类型一次性归并
4. 验证前端复盘页、reviewed 归档页、新闻列表页
```

这样能确保数据库迁移完成后，不会再有新任务把旧类型重新写回。

