# MyFinancialAgent 测试环境集成测试复跑报告

报告日期：2026-03-16

## 1. 本轮目标

本轮不是首次打通链路，而是验证测试环境是否已经具备：

- 可完整重置
- 可用真实链路重建基线
- 可按文档再次执行集成测试
- 可把问题区分为代码问题、环境问题、第三方问题或测试口径问题

## 2. 执行环境

- 测试 Worker：`my-financial-agent-test`
- 测试入口：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试 D1：`my-financial-agent-test`
- 运行时环境：`APP_ENV=test`
- 健康检查：`/api/health -> {"ok": true, "service": "my-financial-agent-api", "env": "test"}`

## 3. 重置与基线重建

### 3.1 完整重置

先对测试 D1 业务表做完整重置：

- `stock_raw`: 9 -> 0
- `news_raw_data`: 20 -> 0
- `daily_news_ai_analysis`: 1 -> 0
- `daily_review_archive`: 2 -> 0

说明：仅清空业务表，未清空 migration 表。

### 3.2 真实链路基线重建

随后执行：

- `ENABLE_REMOTE_WRITE=true ... .venv/bin/python main.py full`

重建后测试库状态：

- `stock_raw = 9`
- `news_raw_data = 6`
- `daily_news_ai_analysis = 1`
- `daily_review_archive = 1`

说明：本轮基线由真实价格源、真实新闻源和真实 LLM 共同生成。

## 4. 集成测试复跑结果

### 4.1 通过项

- `INT-001`：通过
  - 从空测试库出发，`main.py full` 成功生成价格、新闻、日级摘要并写入测试 D1。
- `INT-002`：通过
  - 直接执行价格采集 + `send_prices()`，远端返回：`inserted=0, updated=0, ignored=10`，说明 Python -> Worker ingest -> D1 闭环可重复执行。
- `INT-003`：通过
  - `/api/reviews/2026-03-13/bootstrap` 返回价格、新闻、`daily_major_events`、`sector_impact_map`、`linkage_logic_chain`。
- `INT-004`：通过
  - API 状态机验证成功：`initialize -> draft -> reviewed`。
  - 保存草稿后可回查字段：`reviewer_news_notes`、`market_sentiment`、`sector_rotation`、`asset_plan`、`trading_summary`。
- `INT-005`：通过（按本项目口径）
  - 价格链路：重复执行 `main.py full` 后未出现 `(k_date, symbol)` 重复组。
  - 新闻链路：`news_hash` 重复组数为 `0`，且第二轮执行出现真实增量新闻，表现为正常增量更新而非重复污染。
- `INT-006`：通过
  - 使用 Playwright 打开测试前端入口，主页可访问，切到 `Review Workspace` 后能看到 `2026-03-13`，且存在复盘入口。
- `INT-008`：通过
  - 本轮真实调用了行情源、新闻源、LLM、测试 Worker/API，端到端结果能落到测试前端与测试库。

### 4.2 部分通过项

- 本轮无部分通过项

## 5. 本轮确认的关键事实

- 测试环境已经具备完整重置能力。
- 测试环境可以从空状态重新建立真实链路基线。
- 测试环境可以重复执行集成测试主要用例。
- `APP_ENV=test` 可观测性已稳定。
- 价格链路严格幂等成立。
- 新闻链路应继续按“`news_hash` 去重 + 允许真实增量”解释。

## 6. 本轮发现并已修复的问题

### 6.1 `close-summary` / `analysis_date` / 新闻时间窗口不对齐

- 原始现象：`close-summary` 之前无法基于当日真实新闻重新生成 summary，日志持续显示 `日期级 summary 候选新闻: 0 条 (analysis_date=2026-03-13)`。
- 根因：新闻流程默认把 `analysis_date` 固定为“最近一个已收盘交易日”，导致在 `2026-03-16` 盘中执行时：
  - 新闻实际落在 `2026-03-16`
  - 但 summary 目标日仍是 `2026-03-13`
  - 时间窗口因此错位
- 修复方式：
  - 在 `collect_news_v3.py` 中新增 `get_current_review_trading_day()`
  - 规则改为：
    - 若当天是 NYSE 交易日，则新闻归属当天
    - 若当天不是交易日，则回退到最近一个已收盘交易日
- 修复后验证：
  - `main.py full` 日志已变为 `当前新闻分析目标日: 2026-03-16`
  - `main.py close-summary` 日志已变为 `日期级 summary 候选新闻: 2 条 (analysis_date=2026-03-16)`
  - `daily_news_ai_analysis` 已生成 `analysis_date = 2026-03-16`
  - `daily_review_archive` 已初始化 `archive_date = 2026-03-16`
- 当前状态：已修复

## 7. 当前测试库状态

完成修复验证后，测试 D1 关键表状态为：

- `stock_raw = 9`
- `news_raw_data = 10`
- `daily_news_ai_analysis = 2`
- `daily_review_archive = 2`

当前列表状态：

- `daily_review_archive.archive_date = 2026-03-16`
- 当前状态为 `initialized`

## 8. 阶段结论

本轮结论：**测试环境已完成“可重置 + 可重建基线 + 可复跑主要集成用例”验证，且 `close-summary` 时间窗口问题已修复。**

更具体地说：

- 已完成：
  - 测试环境重置
  - 真实链路基线重建
  - `INT-001` ~ `INT-008` 的复跑验证
  - `close-summary` / `analysis_date` / 新闻时间窗口对齐修复与复验

## 9. 建议下一步

建议下一步转向两件事：

- 继续观察真实 LLM 路径的超时 / 代理抖动
- 将这次修复后的口径同步进后续集成测试与发布评审流程
