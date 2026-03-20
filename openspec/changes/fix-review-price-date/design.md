## Context

复盘页 `getReviewBootstrap` 已正确按 `k_date <= archiveDate` per-symbol 取最近价格（见 `cross-market-price-query` spec）。但前端展示层存在两个问题：

1. `index.html:339` 副标题硬编码为"最近一个美股收盘日的核心标的与指数"，不反映当前查看的复盘日期
2. `buildPriceCard()` 不展示 `k_date`，用户无法判断价格数据的实际日期

后端已在 bootstrap 响应中包含每条价格的 `k_date` 字段，前端只需消费即可。

## Goals / Non-Goals

**Goals:**
- 副标题动态显示复盘日期（如 `2026-03-19 核心标的与指数`）
- 价格卡片展示 `k_date`，当与复盘日不一致时给出视觉提示

**Non-Goals:**
- 不修改后端 SQL 查询逻辑（已验证正确）
- 不改变价格数据存储方式
- 不引入新 API 字段

## Decisions

### 1. 副标题动态化

将 `index.html` 中的静态 `<small>` 改为带 `id` 的动态元素，在 `openReviewDrawer()` 中通过 `archiveDate` 设置文本内容。

**替代方案**: 在 `renderPrices()` 中设置 — 但 `renderPrices` 不感知 `archiveDate`，需要额外传参，增加复杂度。在 `openReviewDrawer` 中直接设置更简洁。

### 2. 价格卡片 k_date 展示策略

在 `buildPriceCard()` 中添加 `k_date` 标签。当 `k_date !== archiveDate` 时，用灰色小字和不同样式提示（如 `k_date: 2026-03-18`），帮助用户理解跨市场时差。

需要将 `archiveDate` 传递到 `buildPriceCard()`：通过 `state.activeDate`（已在 `openReviewDrawer` 中设置）读取即可，无需修改函数签名。

## Risks / Trade-offs

- **[低风险] 样式适配**: 新增 k_date 元素需要适配现有卡片布局 → 使用小字号、不增加卡片高度
- **[无风险] 兼容性**: 纯前端展示改动，不影响数据层和 API 契约
