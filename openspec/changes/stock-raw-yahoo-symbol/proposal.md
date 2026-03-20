## Why

当前 `stock_raw` 表中 `stock_code` 与 `symbol` 字段存的是相同内容（系统标识），语义冗余且不清晰。同时缺少 Yahoo 代码的存储，导致无法追溯数据来源。

## What Changes

- **字段重命名**：`stock_raw.stock_code` → `yahoo_symbol`
- **语义明确化**：
  - `symbol` 存 `tracked_symbols.symbol`（系统标识，作为关联键）
  - `yahoo_symbol` 存 `tracked_symbols.yahoo_symbol`（数据来源代码）
- **写入逻辑修改**：价格采集时从 `tracked_symbols` 查询 `yahoo_symbol` 填入
- **修复查询 Bug**：Worker 中 `WHERE symbol = '^GSPC'` 改为 `WHERE symbol = 'GSPC'`

## Capabilities

### New Capabilities

无新增能力。

### Modified Capabilities

无。此次为内部实现调整，不影响外部接口行为。

## Impact

### 数据库层

| 文件/数据 | 改动 |
|---------|------|
| `cloudflare/migrations/001_init.sql` | 表结构：`stock_code` → `yahoo_symbol` |
| 生产环境 `stock_raw` | 迁移历史数据：用 `tracked_symbols` 反查填充 |

### 写入端

| 文件 | 改动 |
|-----|------|
| `src/data_sources/price_live.py` | 构造数据时填充 `yahoo_symbol` |
| `cloudflare/worker/src/index.js` | `ingestPrices()` 处理 `yahoo_symbol` |
| `src/db_utils.py` | INSERT 语句字段名 |

### 读取端

| 文件 | 改动 |
|-----|------|
| `cloudflare/worker/src/index.js` | 修复 `getLatestClosedNyseTradingDay()` 查询 |

### 测试数据

| 文件 | 改动 |
|-----|------|
| `tests/testdata/replay/prices/*.json` | 10 个 fixture 文件，`stock_code` → `yahoo_symbol` 并填充正确值 |
| `tests/testdata/prepare_history_seed.py` | 字段名 + 填充逻辑 |
| `tests/testdata/build_replay_fixtures.py` | 字段名 + 填充逻辑 |
| `tests/integration/run_weekly_integration.py` | INSERT 语句字段名 |
| `tests/smoke/SMOKE_TEST_SPEC.md` | SQL 语句字段名 |
| `tests/demo_data.py` | 字段名 |
| `tests/simulate_test_week.py` | 字段名 |

### 文档

| 文件 | 改动 |
|-----|------|
| `docs/rfcs/项目需求文档.md` | 字段说明 |
| `docs/arch/TIME_AND_SOURCE_ABSTRACTION_TECHNICAL_DESIGN.md` | 字段说明 |

### 线上验证方案

1. 删除今早凌晨采集的数据（`k_date = '2026-03-19'`）
2. 手动触发定时任务重新采集
3. 验证 `yahoo_symbol` 字段正确填充