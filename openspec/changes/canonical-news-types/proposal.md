## Why

当前新闻 `type` 口径存在历史遗留混用问题：

- 标准值与旧值并存：`index / sector / stock / macro / market / symbol`
- 前后端兼容规则不一致
  - 用户已明确要求：`macro -> index`、`market -> index`、`symbol -> stock`
  - 但前端当前仍将 `market` 归到 `sector`
- 这会直接影响：
  - 复盘页新闻分组
  - 日总结候选分桶与后续配额策略
  - `source_news_ids` 对应新闻在前端的实际展示位置
  - 历史复盘归档新闻的类型一致性

在继续推进“`stars >= 4` + 大盘/板块/个股配额 + 三桶并行 summary”之前，必须先把新闻类型统一成稳定的三类标准口径。

## What Changes

- **标准新闻类型收敛为三种**
  - `index`：大盘
  - `sector`：板块
  - `stock`：个股

- **历史类型一次性归并**
  - `macro -> index`
  - `market -> index`
  - `symbol -> stock`

- **代码写路径只允许产出三种标准类型**
  - 新写入新闻、归档新闻、前端展示都不再依赖旧值

- **D1 历史数据一次性更新**
  - 对 `news_raw_data`
  - 对 `daily_review_archive_news`
  执行类型归并更新，避免新旧口径长期并存

- **删除旧类型兼容逻辑**
  - 前端不再把 `market` 当成 `sector`
  - 后端不再长期把 `macro / market / symbol` 作为新逻辑的一部分

## Capabilities

### New Capabilities

- `canonical-news-types`
  - 系统标准新闻类型仅保留 `index / sector / stock`

### Modified Capabilities

- `review-news-grouping`
  - 复盘页新闻分组仅基于三类标准类型

- `news-summary-generation`
  - 日期级 summary 与后续类型配额策略建立在统一三类标准类型之上

## Impact

- `src/collect_news_v3.py`
  - 统一新闻类型归一化与 summary 输入语义

- `cloudflare/worker/src/index.js`
  - 统一 review bootstrap、archived news、fallback analysis 读取口径

- `cloudflare/web/app.js`
  - 修正前端新闻分组、分析 fallback、类型标签映射

- D1 tables
  - `news_raw_data`
  - `daily_review_archive_news`

