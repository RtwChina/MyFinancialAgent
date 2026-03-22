## 1. Workers API 新增 hash 查询接口

- [x] 1.1 `cloudflare/worker/src/index.js` 新增路由 `GET /api/news/hashes`，调用 `getNewsHashes(env, url)`
- [x] 1.2 实现 `getNewsHashes(env, url)`：查询 `SELECT news_hash FROM news_raw_data WHERE pub_date >= ? AND pub_date < ?`，返回 `{hashes, count}`
- [ ] 1.3 本地测试接口：`curl "http://localhost:8787/api/news/hashes?dateFrom=2026-03-19+04:00:00&dateTo=2026-03-20+04:00:00"`，确认返回 hash 列表

## 2. Python 端预过滤实现

- [x] 2.1 `src/cloudflare_ingest.py` 新增 `fetch_existing_hashes(date_from: str, date_to: str) -> set[str]`，调用 `/api/news/hashes?dateFrom=&dateTo=`，失败返回空集合并记录 WARNING
- [x] 2.2 `src/db_utils.py` 新增 `get_existing_hashes(date_from: str, date_to: str) -> set[str]`，查询本地 SQLite `WHERE pub_date >= ? AND pub_date < ?`
- [x] 2.3 `src/collect_news_v3.py` 在 `collect_all_news()` 的 `merge_and_deduplicate` 之后、Stage 1 之前，调用预过滤逻辑（时间范围：`now - 24h` 到 `now`，北京时间）：
  - `is_local_env` → 调用 `get_existing_hashes`；否则调用 `fetch_existing_hashes`
  - 过滤掉 hash 已存在的新闻
  - 日志：`[预过滤] 跳过已存在 N 条，剩余 M 条进入 Stage 1`

## 3. pipeline_trace 新增字段

- [x] 3.1 `collect_all_news()` 中 trace 字典新增 `prefilter_skipped` 字段，值 = 去重后总数 - 预过滤后剩余数
- [x] 3.2 检查 `pipeline_trace` 表结构，确认 `prefilter_skipped` 字段是否需要新 migration（若表已有该字段则跳过）

## 4. 冒烟测试

- [x] 4.1 `tests/standards/smoke-test.md` 追加 SM-015：运行两次采集，第二次日志含 `[预过滤] 跳过已存在` 且跳过数 > 0
- [ ] 4.2 本地连续运行两次 `python main.py hourly-news`，确认第二次 Stage 3 批次数明显减少

## 5. 发布检查

- [ ] 5.1 部署 Workers（`wrangler deploy`）确认新路由上线
- [ ] 5.2 push 到 `main`，确认 GitHub Actions Stage 3 批次数相比之前减少
