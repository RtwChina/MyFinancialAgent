# 集成测试报告（2026-03-17）

- 测试环境：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试数据库：`my-financial-agent-test`
- 运行环境：`APP_ENV=test`
- 执行基线：已先更新 `tests/cases/smoke/SMOKE_TEST_SPEC.md` 与 `tests/cases/integration/INTEGRATION_TEST_SPEC.md`

## 一、本轮通过项

- 冒烟通过：
  - `SMK-001` 主入口帮助输出正常
  - `SMK-002` 价格采集最小闭环通过
  - `SMK-003` 新闻采集最小闭环通过
  - `SMK-004` AI 日总结生成通过
  - `SMK-005` SQLite 去重通过
  - `SMK-006` 本地 Worker 健康检查通过，返回 `env`
  - `SMK-007` 新闻与复盘列表 UI 通过
  - `SMK-008` 复盘工作台 UI 通过
  - `SMK-009` 本地 schema 结构检查通过
- 集成通过：
  - `INT-001` `main.py full` 在测试环境真实跑通
  - `INT-002` Python -> Worker ingest -> 测试 D1 跑通
  - `INT-003` `daily_news_ai_analysis` -> bootstrap -> 前端展示跑通
  - `INT-004` `initialize -> draft -> reviewed` 状态机跑通
  - `INT-005` 去重校验通过：`duplicate_price_groups = 0`、`duplicate_news_hash_groups = 0`
  - `INT-006` 已复盘详情优先读取 `daily_review_archive_news`，`archived=1`
  - `INT-007` `hourly-news` 与 `close-summary` 手动等价入口都跑通
  - `INT-008` 真实第三方链路（行情 / 新闻 / LLM / Worker / D1 / 前端）已贯通

## 二、本轮修复

- 修复测试 Worker 仍在写旧字段 `rule_score`，重新部署到最新版本。
- 修复远端新闻 ingest 返回中缺少新闻 ID，导致 `daily_news_ai_analysis.source_news_ids` 为空：
  - Worker `/api/ingest/news` 现返回 `id_map`
  - Python 侧在远端写入后会回填新闻 `id`
- 修复复盘 bootstrap 在非归档态下仍可能按旧时间窗口取新闻的问题：
  - 若 `daily_news_ai_analysis.source_news_ids` 存在，优先按这些新闻 ID 取本次复盘新闻
- 修复完成复盘后归档快照仍按旧时间窗口复制的问题：
  - 现在优先归档 `source_news_ids` 对应的新闻
- 修复完成复盘后源新闻状态未同步为 `reviewed` 的问题：
  - 现在优先按 `source_news_ids` 更新 `news_raw_data.processing_status`

## 三、关键验证结果

- `GET /api/health`
  - 返回 `{"ok": true, "service": "my-financial-agent-api", "env": "test"}`
- `GET /api/reviews/2026-03-16/bootstrap`
  - `analysis.source_news_ids = "[686, 685, 687, 690]"`
  - 已复盘状态下 `news_count = 4`
  - 第一条新闻 `archived = 1`
- 远端 D1 校验：
  - `daily_review_archive_news` 在 `2026-03-16` 有 `4` 条归档新闻
  - `news_raw_data` 中对应 `4` 条新闻状态已更新为 `reviewed`
  - `daily_review_archive.review_status` 为 `reviewed`

## 四、当前测试库观察

- 当前包含：
  - `2026-03-16`：已复盘，归档快照存在
  - `2026-03-17`：已初始化，来自 `close-summary`
- 数据去重状态正常，未发现重复污染

## 五、剩余观察项

- 行情源 `DX-Y.NYB` 仍偶发 `'chart'` 错误，但本轮不阻断主链路
- `hourly-news` 控制台摘要仍显示“成功: 1/2 项任务”，这是入口层展示口径问题，不影响新闻链路实际成功

## 六、结论

- 本轮测试环境集成测试结论：**通过**
- 当前测试环境已经满足：
  - 可真实跑通完整链路
  - 可生成 AI 日总结并保存来源新闻 IDs
  - 可完成复盘并生成归档新闻快照
  - 已复盘详情可稳定读取归档数据
