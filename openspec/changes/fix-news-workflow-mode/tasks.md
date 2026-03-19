## 1. 修复

- [x] 1.1 将 `.github/workflows/collect_news.yml` 中 `python main.py` 改为 `python main.py hourly-news`

## 2. 验证

- [ ] 2.1 手动触发 `collect_news.yml`（workflow_dispatch），确认日志中只有新闻采集，无价格采集步骤
