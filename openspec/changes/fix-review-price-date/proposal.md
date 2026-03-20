## Why

复盘页"当日价格"区域的副标题写死为"最近一个美股收盘日的核心标的与指数"，与实际逻辑不符。后端 SQL 已正确按 `k_date <= archiveDate` 取每个 symbol 最近一条（见 `cross-market-price-query` spec），但前端：
1. 标题暗示展示"最近"而非"复盘日"的价格，造成用户困惑（如查看 3-19 复盘时以为看到的是最新价格而非 3-19 价格）
2. 价格卡片不显示 `k_date`，用户无法判断每个标的的价格来自哪一天

## What Changes

- 将副标题从"最近一个美股收盘日的核心标的与指数"改为动态显示复盘日期，如"2026-03-19 核心标的与指数"
- 价格卡片新增 `k_date` 展示，当 `k_date` 与复盘日不一致时以视觉标记提醒用户（跨市场时差导致的正常差异）

## Capabilities

### New Capabilities

- `review-price-date-display`: 复盘页价格区域日期标注与 k_date 可视化

### Modified Capabilities

（无 spec 级行为变更，SQL 查询逻辑不变）

## Impact

- **前端**: `cloudflare/web/index.html`（副标题区域）、`cloudflare/web/app.js`（`renderPrices` / `buildPriceCard` / `openReviewDrawer`）
- **后端**: 无变更，`getReviewBootstrap` 已在 `pricesByType` 中包含 `k_date` 字段
- **风险**: 低，纯前端展示层改动，不涉及数据查询或存储逻辑
