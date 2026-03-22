## Why

本地专属操作（写本地 SQLite、初始化本地 DB）在判断是否执行时，混用了两套标准：`ENABLE_REMOTE_WRITE` env flag 和 `context.app_env`。导致：
1. `test` 环境未被识别为本地环境，被过滤新闻写本地 SQLite 不执行
2. 若线上环境误设 `ENABLE_REMOTE_WRITE=false`，会尝试写本地 SQLite 而报错
3. 逻辑混乱，`app_env` 和 `ENABLE_REMOTE_WRITE` 两条线并存，难以维护

## What Changes

- 在 `runtime/context.py` 新增 `is_local_env(context)` helper：`app_env in ("local", "test")`
- `collect_news_v3.py`：所有本地专属操作（rejected_news 写本地 SQLite、`save_daily_news_ai_analysis`、`initialize_archive_record`、`init_database` 回退路径）改用 `is_local_env(context)` 判断
- `main.py`：价格写本地 SQLite 改用 `context.app_env` 判断
- `collect_prices.py`：同上

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
（无 spec 层级变更，仅内部逻辑修正）

## Impact

- `src/runtime/context.py`：新增 `is_local_env()` helper
- `src/collect_news_v3.py`：替换本地操作的环境判断
- `main.py`：替换价格写入的环境判断
- `src/collect_prices.py`：替换价格写入的环境判断
- 不影响任何对外接口和数据库结构
