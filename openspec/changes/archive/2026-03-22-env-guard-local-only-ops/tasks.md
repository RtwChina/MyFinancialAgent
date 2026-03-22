## 1. runtime/context.py：新增 is_local_env helper

- [x] 1.1 在 `ExecutionContext` dataclass 定义之后新增 `is_local_env` property（`app_env in ("local", "test")`）

## 2. collect_news_v3.py：修正本地专属操作守卫

- [x] 2.1 `is_local_env` 为 property，直接用 `context.is_local_env`，无需额外 import
- [x] 2.2 rejected_news 写本地条件改为 `context.is_local_env`
- [x] 2.3 `else` 分支写本地 SQLite（screened/processed）改为 `elif context.is_local_env`，加 else warning
- [x] 2.4 `save_daily_news_ai_analysis` / `get_daily_news_ai_analysis_by_date` 的 `else` 分支改为 `elif context.is_local_env`，加 else warning
- [x] 2.5 `initialize_archive_record` 的 `else` 分支改为 `elif context.is_local_env`，加 else warning

## 3. main.py：价格写本地 SQLite 守卫

- [x] 3.1 `run_price_collector` 中 `else` 分支改为 `elif context.is_local_env`

## 4. collect_prices.py：价格写本地 SQLite 守卫

- [x] 4.1 `else` 分支改为 `elif context.is_local_env`

## 5. 验证

- [x] 5.1 `APP_ENV=local`: `is_local_env=True` ✓
- [x] 5.2 `APP_ENV=test`: `is_local_env=True` ✓
- [x] 5.3 `APP_ENV=prod`: `is_local_env=False`，不触碰本地 SQLite ✓
