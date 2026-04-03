## 1. 修复任务入口

- [x] 1.1 新增独立的价格修复入口，与主 `collect-prices` 任务解耦
- [x] 1.2 定义最近 `3` 天坏记录筛选条件：`k_date IS NOT NULL`、`current_price IS NULL`
- [x] 1.3 为每条坏记录加载修复所需字段：`symbol`、`yahoo_symbol`、`k_date`

## 2. Yahoo 定向重试

- [x] 2.1 新增“按 `(symbol, yahoo_symbol, k_date)` 查询 Yahoo 指定日期价格”的修复逻辑
- [x] 2.2 仅当 Yahoo 返回同一 `k_date` 且 `current_price` 非空时，认定修复成功
- [x] 2.3 记录修复成功 / 跳过 / 失败日志，明确 symbol 与 k_date

## 3. 数据库更新

- [x] 3.1 新增按 `(symbol, k_date)` 更新已有 `stock_raw` 行的修复写入逻辑
- [x] 3.2 仅更新已有坏记录，不插入新行
- [x] 3.3 更新 `current_price`、`change_percent`、`volume`、`captured_at`

## 4. 调度与验证

- [x] 4.1 新增北京时间 `08:00` 的 GitHub Actions 修复调度
- [x] 4.2 手工验证：构造最近 3 天空价格记录，确认修复任务只重试这些记录
- [x] 4.3 手工验证：当 Yahoo 返回不同 `k_date` 或仍为空时，不更新原记录
- [x] 4.4 手工验证：当 Yahoo 返回目标 `k_date` 且价格非空时，正确更新原记录
