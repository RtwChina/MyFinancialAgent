## Tasks

### 1. Finnhub 公司新闻并发查询

- [ ] 1.1 在 `news_live.py` 创建模块级 `requests.Session`（配置 `HTTPAdapter(pool_maxsize=10)`），用于 Finnhub 并发请求的连接复用
- [ ] 1.2 将 `fetch_finnhub_company()` 从串行 for 循环改为 `ThreadPoolExecutor(max_workers=5)` 并发，移除 `time.sleep(0.5)`
- [ ] 1.3 每个 worker 内加入 429 状态码检测，触发时 sleep 1s 后重试（最多 2 次）
- [ ] 1.4 本地运行 `python main.py hourly-news` 验证：Finnhub company 阶段耗时从 ~20s 降至 ~5s，无 429 错误
