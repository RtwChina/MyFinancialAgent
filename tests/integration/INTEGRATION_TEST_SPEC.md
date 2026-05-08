# MyFinancialAgent 集成测试规范

最后更新：2026-03-18

## 1. 定位

- 集成测试验证“测试环境真实部署形态”下的完整业务协同。
- 当前项目集成测试默认在 Cloudflare 测试 Worker + 测试 D1 上执行。
- 当前集成测试的目标不是只验证当天真实任务，还要验证：
  - 历史基线导入后页面与 API 是否可用
  - 标的管理是否可维护
  - 复盘状态机与已复盘重新编辑是否成立

## 2. 当前测试环境定义

- 测试 Worker：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试 D1：`my-financial-agent-test`
- 测试配置：`/Users/didi/Project/MyFinancialAgent/tests/testdata/config/wrangler.test.toml`
- 环境标识：`APP_ENV=test`

当前固定约束：

- 测试环境与生产环境资源必须隔离
- 集成测试只能写入测试 Worker / 测试 D1
- 不允许任何测试数据或测试任务污染生产环境

## 3. 当前集成测试数据策略

当前集成测试采用“历史基线导入 + 当天真实链路”混合模式：

1. 先清空测试环境业务表
2. 再将当前 schema 兼容历史 seed 导入测试 D1
3. 用导入后的历史数据验证列表、抽屉、bootstrap、标的管理和状态机
4. 最后执行当天真实 `hourly-news / close-summary`

相关文件：

- 测试数据规范：`/Users/didi/Project/MyFinancialAgent/tests/testdata/TEST_DATA_SPEC.md`
- 历史源 seed：`/Users/didi/Project/MyFinancialAgent/tests/testdata/test_week_seed_20260315.sql`
- 当前 schema 兼容 seed：`/Users/didi/Project/MyFinancialAgent/tests/testdata/_generated_history_seed.sql`

## 4. 当前清库范围

集成测试执行前必须清空以下业务表：

- `stock_raw`
- `news_raw_data`
- `daily_news_ai_analysis`
- `daily_review_archive`
- `daily_review_archive_news`

默认不清空：

- `tracked_symbols`

原因：

- `tracked_symbols` 是系统权威标的配置，由 migration 和管理页维护

## 5. 当前集成测试目标

当前集成测试默认覆盖以下链路：

- 测试 Worker 健康检查
- 测试环境清库 + 历史基线导入
- 历史列表与历史 bootstrap 可用
- 标的管理 API 可完成临时增删改
- 复盘状态机：`initialized -> draft -> reviewed`
- 已复盘再次编辑并保存
- 归档快照：`daily_review_archive_news`
- 当天真实任务入口：`hourly-news` / `close-summary`
- 最终完整性与重复数据检查

## 6. 用例清单

### `INT-001` 测试环境健康与资源隔离

- 目标：确认测试 Worker 存活且环境标识正确
- 执行方式：`GET /api/health`
- 预期结果：
  - `ok=true`
  - `env=test`
- 阻断级别：阻断

### `INT-002` 清库成功

- 目标：确认本轮从干净业务数据开始
- 执行方式：调用测试主脚本中的 reset 步骤
- 预期结果：
  - `stock_raw`
  - `news_raw_data`
  - `daily_news_ai_analysis`
  - `daily_review_archive`
  - `daily_review_archive_news`
    均被清空
- 阻断级别：阻断

### `INT-003` 历史基线导入成功

- 目标：确认当前 schema 兼容 seed 可导入测试 D1
- 执行方式：
  - 生成 `_generated_history_seed.sql`
  - 通过 `wrangler d1 execute --remote --file ...` 导入测试 D1
- 预期结果：
  - 历史价格、新闻、AI 总结、复盘草稿均存在
  - `tracked_symbols` 保持不变
- 阻断级别：阻断

### `INT-004` 历史复盘列表与 bootstrap 可用

- 目标：确认导入的历史基线能支撑前端和 API
- 执行方式：
  - `GET /api/reviews`
  - `GET /api/reviews/{date}/bootstrap`
- 预期结果：
  - 历史日期能出现在复盘列表
  - `bootstrap` 含 `prices` / `news` / `analysis`
  - `analysis` 三段字段至少有有效内容
  - `bootstrap.news` 非空（来自 source_news_ids 精确加载路径，不是时间窗口兜底路径）
  - `prices` 包含 index / sector / stock 三类分组
- 阻断级别：阻断

### `INT-005` 标的管理 API 可维护

- 目标：确认 `tracked_symbols` 可读、可新增、可编辑、可删除
- 执行方式：
  - `GET /api/symbols`
  - `POST /api/symbols`
  - `PUT /api/symbols/:id`
  - `DELETE /api/symbols/:id`
- 预期结果：
  - 默认列表含 `index / sector / stock`
  - 临时标的新增成功
  - 编辑字段可回查
  - 删除后列表不再返回该项
- 阻断级别：阻断

### `INT-006` 复盘状态机闭环

- 目标：确认 initialized -> draft -> reviewed 链路正常
- 执行方式：
  - `POST /api/reviews/{date}/initialize`
  - `POST /api/reviews/{date}`，请求体包含结构化 `actionPlans`
  - `POST /api/reviews/{date}/complete`
- 预期结果：
  - 状态正确流转
  - `reviewer_news_notes`、`market_sentiment`、`sector_rotation`、`asset_plan`、`trading_summary` 可回查
  - `GET /api/reviews/{date}/bootstrap` 返回 `actionPlans`
  - `daily_review_action_plans` 仅写入当前复盘日的子记录
  - `asset_plan` 保存为结构化计划生成的兼容 Markdown 摘要
  - `daily_review_archive_news` 产生归档快照
- 阻断级别：阻断

### `INT-007` 已复盘重新编辑并保存

- 目标：确认 reviewed 记录不是只读死态，而是可重新编辑后保存
- 执行方式：
  - 先完成一次复盘
  - 再次调用 `POST /api/reviews/{date}` 更新内容
  - 再回查 `GET /api/reviews/{date}/bootstrap`
- 预期结果：
  - `review_status` 仍为 `reviewed`
  - 新内容已落库
  - 不会重新初始化或丢失归档快照
- 阻断级别：阻断

### `INT-008` 当天真实任务入口可用

- 目标：确认当天链路继续使用真实外部依赖
- 执行方式：
  - 运行：
    - `main.py hourly-news`
    - `main.py close-summary`
- 预期结果：
  - 测试 Worker ingest 成功
  - 测试 D1 出现当天价格 / 新闻 / AI 总结
- 阻断级别：阻断

### `INT-009` 最终完整性与去重检查

- 目标：确认集成测试结束后没有明显脏数据
- 执行方式：
  - SQL 检查重复组
  - 检查归档快照是否存在
- 预期结果：
  - `stock_raw` 按 `(k_date, symbol)` 不重复
  - `news_raw_data` 按 `news_hash` 不重复
  - `daily_review_archive_news` 按 `(archive_date, news_hash)` 不重复
- 阻断级别：阻断

## 7. 推荐执行命令

```bash
.venv/bin/python tests/integration/run_weekly_integration.py \
  --worker-base https://my-financial-agent-test.rtw1994.workers.dev \
  --db-name my-financial-agent-test \
  --ingest-token "$INGEST_API_TOKEN"
```

## 8. 当前通过标准

本轮集成测试只有同时满足以下条件才算通过：

- 所有阻断步骤返回 `PASS`
- 历史基线导入成功
- 历史日期 bootstrap 有价格、新闻和 analysis
- 标的管理 API 增删改通过
- 至少一个复盘日成功完成并生成 `daily_review_archive_news`
- 已复盘再次保存后内容可回查
- 当天真实链路成功写入测试环境
- 无价格重复组
- 无新闻重复组

## 9. 结果汇报要求

- 执行环境
- 测试 Worker / 测试 D1 标识
- 使用的历史源 seed
- 使用的当前 schema 兼容 seed
- 通过项
- 失败项
- 是否属于：
  - 当前代码问题
  - 测试数据问题
  - 第三方接口问题
  - Cloudflare 测试环境问题
- 是否允许进入下一阶段
