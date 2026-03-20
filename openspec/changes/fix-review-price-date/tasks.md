## 1. 前端开发 — 副标题动态化

- [x] 1.1 `index.html`: 将 `<small class="muted">最近一个美股收盘日的核心标的与指数</small>` 改为带 `id` 的动态元素（如 `id="priceSnapshotLabel"`），默认文本留空
- [x] 1.2 `app.js`: 在 `openReviewDrawer(archiveDate)` 中，设置 `priceSnapshotLabel.textContent = archiveDate + ' 核心标的与指数'`

## 2. 前端开发 — 价格卡片 k_date 展示

- [x] 2.1 `app.js`: 在 `buildPriceCard(item)` 中新增 `k_date` 展示元素，使用 `MM-DD` 短格式
- [x] 2.2 `app.js`: 当 `item.k_date !== state.activeDate` 时，为 k_date 元素添加差异样式类（如 `.price-date-mismatch`）
- [x] 2.3 `styles.css`: 添加 `.price-card-date` 基础样式（小字号、灰色）和 `.price-date-mismatch` 差异样式（琥珀色）

## 3. 测试

- [ ] 3.1 手工验证：打开不同日期的复盘，确认副标题显示对应日期
- [ ] 3.2 手工验证：确认价格卡片显示 k_date，跨市场标的日期差异有视觉提示
- [ ] 3.3 确认不影响价格折叠/展开功能

## 4. 发布

- [ ] 4.1 发布前检查清单：
  - 确认改动仅涉及 `cloudflare/web/` 下的前端文件
  - 确认无后端 SQL / API 变更
  - 确认 `cross-market-price-query` spec 行为未被修改
  - 在 test 分支验证通过后合入 main
