## 1. 环境准备

- [ ] 1.1 确认 wrangler dev 在运行（`curl http://localhost:8788/api/health` 返回 ok）
- [ ] 1.2 确认 `.env` 或环境变量中 API Key 已配置（FINNHUB_API_KEY、DASHSCOPE_API_KEY 等）
- [ ] 1.3 确认 `INGEST_API_BASE_URL=http://localhost:8788`，`ENABLE_REMOTE_WRITE=true`

## 2. 运行 hourly-news 采集任务

- [ ] 2.1 执行：`python main.py hourly-news`，等待完成
- [ ] 2.2 日志确认：无 CRITICAL/未预期异常，三级漏斗（Stage 1/2/3）均有输出
- [ ] 2.3 日志确认：关键词来源为 API（`关键词来源=API`）
- [ ] 2.4 若有已 reviewed 记录：日志含"跳过初始化复盘记录（已完成复盘）"warning

## 3. 验证数据写入

- [ ] 3.1 `GET /api/news?limit=10` 返回真实新闻条目（total > 0）
- [ ] 3.2 `GET /api/pipeline-traces` 有本次运行记录，三级漏斗数字完整
- [ ] 3.3 `GET /api/reviews?limit=5` 有 initialized 记录（复盘被初始化）

## 4. 前端验证（Playwright）

- [ ] 4.1 新闻检索台展示真实新闻，标签列有星级/类型/标的
- [ ] 4.2 打开复盘抽屉，新闻摘要区有内容
- [ ] 4.3 DevTools Console 无 JS 报错

## 5. 运行 close-summary 价格任务

- [ ] 5.1 执行：`python main.py close-summary`，等待完成
- [ ] 5.2 日志确认：无异常，价格数据写入成功

## 6. 上线

- [ ] 6.1 以上全部通过，执行 `wrangler deploy`
- [ ] 6.2 生产 `GET /api/health` 返回 `{ env: "prod" }`
- [ ] 6.3 生产对一条 reviewed 记录调用 initialize，确认返回 `skipped: true`
