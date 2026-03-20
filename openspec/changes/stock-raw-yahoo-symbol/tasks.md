## 1. 数据库迁移

- [x] 1.1 新增 migration 文件 `008_stock_raw_yahoo_symbol.sql`：新增 `yahoo_symbol` 字段
- [ ] 1.2 执行 migration：测试环境 + 生产环境

## 2. 写入端修改

- [x] 2.1 修改 `src/data_sources/price_live.py`：构造数据时填充 `yahoo_symbol`
- [x] 2.2 修改 `src/db_utils.py`：INSERT 语句添加 `yahoo_symbol` 字段
- [x] 2.3 修改 `cloudflare/worker/src/index.js` 的 `ingestPrices()`：处理 `yahoo_symbol`

## 3. 读取端修改

- [x] 3.1 修复 `cloudflare/worker/src/index.js` 的 `getLatestClosedNyseTradingDay()`：`symbol = '^GSPC'` → `symbol = 'GSPC'`

## 4. 测试数据迁移

- [x] 4.1 更新 `tests/testdata/replay/prices/*.json`（10 个文件）：`stock_code` → `yahoo_symbol`，填充正确值
- [x] 4.2 更新 `tests/testdata/prepare_history_seed.py`：字段名 + 填充逻辑
- [x] 4.3 更新 `tests/testdata/build_replay_fixtures.py`：字段名 + 填充逻辑
- [x] 4.4 更新 `tests/integration/run_weekly_integration.py`：INSERT 语句字段名
- [x] 4.5 更新 `tests/smoke/SMOKE_TEST_SPEC.md`：SQL 语句字段名
- [x] 4.6 更新 `tests/demo_data.py`：字段名
- [x] 4.7 更新 `tests/simulate_test_week.py`：字段名

## 5. 文档更新

- [x] 5.1 更新 `docs/rfcs/项目需求文档.md`：字段说明
- [x] 5.2 更新 `docs/arch/TIME_AND_SOURCE_ABSTRACTION_TECHNICAL_DESIGN.md`：字段说明

## 6. 本地测试

- [x] 6.1 本地跑集成测试验证测试数据改造正确
- [x] 6.2 本地测试价格采集流程，验证 `yahoo_symbol` 正确填充

## 7. 生产环境部署

- [ ] 7.1 提交代码到 test 分支，部署测试环境验证
- [ ] 7.2 合并到 main 分支，部署生产环境
- [ ] 7.3 执行生产数据迁移 SQL：
  ```sql
  UPDATE stock_raw SET yahoo_symbol = (
    SELECT yahoo_symbol FROM tracked_symbols
    WHERE tracked_symbols.symbol = stock_raw.symbol
  );
  ```
- [ ] 7.4 验证迁移结果：检查 `yahoo_symbol IS NULL` 的记录数

## 8. 生产环境验证

- [ ] 8.1 删除今早采集的数据：`DELETE FROM stock_raw WHERE k_date = '2026-03-19';`
- [ ] 8.2 **手动触发**定时任务重新采集：`python main.py collect-prices`（用户执行）
- [ ] 8.3 验证 `yahoo_symbol` 字段正确填充：
  ```sql
  SELECT symbol, yahoo_symbol FROM stock_raw WHERE k_date = '2026-03-19' LIMIT 10;
  ```

## 9. 清理（可选，后续迭代）

- [ ] 9.1 确认无问题后，删除 `stock_code` 字段
- [ ] 9.2 清理代码中对 `stock_code` 的引用