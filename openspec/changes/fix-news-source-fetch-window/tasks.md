## 1. 数据源抓取窗口收窄

- [x] 1.1 `src/data_sources/news_live.py` 将 `fetch_finnhub_company` 中 `timedelta(days=3)` 改为 `timedelta(days=1)`（查询 today + yesterday，即 2 天窗口）

## 2. 采集后时间截断

- [x] 2.1 `src/collect_news_v3.py` 在 `fetch_source_news` 之后、`merge_and_deduplicate` 之前，新增 `_truncate_stale_news(all_news, cutoff_hours=24)` 函数：过滤 `pub_date < now - 24h` 的条目（pub_date 为空时保留）
- [x] 2.2 在 `collect_all_news()` 中调用该函数，日志记录：`[截断] 丢弃超龄 N 条（pub_date < {cutoff}），剩余 M 条`

## 3. Hash 预过滤窗口对齐

- [x] 3.1 `src/collect_news_v3.py` 将 hash 预过滤窗口从 `timedelta(days=4)` 改为 `timedelta(hours=24)`（与截断阈值对齐）

## 4. 冒烟测试

- [x] 4.1 `tests/standards/smoke-test.md` 追加 SM-016：运行一次采集，日志中 `[截断]` 丢弃数 ≥ 0（不报错），第二次运行 `[预过滤]` 跳过数 > 0
- [ ] 4.2 本地运行两次 `python main.py hourly-news`，确认第二次 `[预过滤]` 跳过数明显 > 0，Stage 3 批次数减少

## 5. 发布检查

- [x] 5.1 确认无 migration 变更（本次无 DB 改动）
- [ ] 5.2 push 到 `main`，确认 GitHub Actions 日志中 `[截断]` 和 `[预过滤]` 均正常输出
