## 1. 清理 draft 状态死代码

- [x] 1.1 `app.js` `initializeBtn` click handler：删除"重新初始化"分支（double-confirm + `/initialize` API 调用），只保留 `reviewed` 状态的编辑切换逻辑
- [x] 1.2 `app.js` `setReviewMode`：else 分支简化为始终显示"已初始化"并 disabled，删除 `draft` 判断
- [x] 1.3 Worker `saveReview`：删除 `draft` fallback，简化为 `body.reviewStatus || existing?.review_status || "initialized"`

## 2. Worker：initializeReview 增加 guard

- [x] 1.1 在 `initializeReview` 的 `existing` 判断中，若 `existing.review_status === 'reviewed'`，提前返回 `{ ok: true, skipped: true, reason: "already reviewed" }`，不执行任何写操作
- [x] 1.2 本地 `wrangler dev` 验证：对一条 `review_status='reviewed'` 的记录调用 `/api/reviews/<date>/initialize`，确认返回 `skipped: true` 且数据库记录未变更

## 2. Python：处理 skipped 响应

- [x] 2.1 `cloudflare_ingest.py` 的 `initialize_review` 函数：若响应包含 `skipped: true`，打印 warning log，正常返回，不抛出异常
- [x] 2.2 本地运行 `collect_news_v3.py`（dry-run 或测试环境），确认对已 reviewed 记录的跳过行为在日志中可见

## 3. 验证与发布

- [x] 3.1 检查 `tests/standards/smoke-test.md`，追加冒烟测试项：对 reviewed 记录调用 initialize，验证数据不变
- [ ] 3.2 确认生产数据库中存量 reviewed 记录无异常后，部署 Worker（`wrangler deploy`）
- [ ] 3.3 部署后，手动触发一次采集脚本，观察日志确认 guard 生效
