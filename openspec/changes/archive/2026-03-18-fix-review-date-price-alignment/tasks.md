## 1. Worker：修复复盘候选日来源

- [x] 1.1 在 `cloudflare/worker/src/index.js` 新增 `getLatestClosedNyseTradingDay(env)` 函数，查询 `stock_raw` 中 `symbol = '^GSPC'` 的 `MAX(k_date)`
- [x] 1.2 将 `getPendingReviews()` 中 `getLatestPriceDate(env)` 的调用替换为 `getLatestClosedNyseTradingDay(env)`
- [x] 1.3 删除或保留（注释说明）旧的 `getLatestPriceDate()` 函数，确认无其他调用点

## 2. Worker：修复复盘页价格查询

- [x] 2.1 将 `getReviewBootstrap()` 中的价格查询 SQL（约 L542）改为 per-symbol `k_date <= archiveDate` 的子查询 JOIN，字段保持原有 `symbol, stock_name, current_price, change_percent, volume`，新增 `k_date` 字段
- [x] 2.2 确认修改后的 SQL 在 Cloudflare D1 可正常执行（D1 为 SQLite 兼容，子查询 JOIN 支持）

## 3. Python：修复落库日期逻辑

- [x] 3.1 在 `src/collect_news_v3.py` L1343 将 `get_current_review_trading_day(context)` 改为 `get_latest_closed_trading_day(context)`
- [x] 3.2 在 `src/collect_news_v3.py` L1400 将 `get_current_review_trading_day(context)` 改为 `get_latest_closed_trading_day(context)`
- [x] 3.3 确认 `hourly-news` 路径不受影响（该路径未调用上述两处）

## 4. 测试

- [x] 4.1 在集成测试中新增场景：`stock_raw` 中 `^GSPC` `k_date=2026-03-17`，`^HSI` `k_date=2026-03-18`，验证 `getPendingReviews` 返回 `latestClosedDate='2026-03-17'`
- [x] 4.2 在集成测试中新增场景：`archive_date='2026-03-17'`，`stock_raw` 中美股个股 `k_date='2026-03-17'` 与亚洲指数 `k_date='2026-03-18'` 共存，验证 bootstrap 接口返回的价格列表包含美股个股
- [ ] 4.3 执行冒烟测试，确认现有 9 项全部通过（参考 `tests/smoke/SMOKE_TEST_SPEC.md`）
- [ ] 4.4 执行集成测试 `INT-001 ~ INT-009`，确认无回归（参考 `tests/integration/INTEGRATION_TEST_SPEC.md`）
- [x] 4.5 更新冒烟文档 `tests/smoke/SMOKE_TEST_SPEC.md`，补充"复盘日期来源"与"跨市场价格展示"相关冒烟用例（SMK-010/011）

## 5. 发布

- [ ] 5.1 发布前检查：确认 `wrangler.toml` / `wrangler.prod.toml` 中 DB binding 配置正确，APP_ENV 对应 prod
- [ ] 5.2 发布前检查：本地 `APP_ENV=test` 环境执行完整冒烟 + 集成测试通过
- [ ] 5.3 部署 Worker：`wrangler deploy`（prod 环境）
- [ ] 5.4 生产验证：打开复盘列表，确认 `latestClosedDate` 为最近 NYSE 收盘日；打开复盘详情，确认美股个股/板块价格正常展示
- [ ] 5.5 若发现问题：执行 `wrangler rollback` 回滚 Worker，Python 侧 git revert 提 hotfix
