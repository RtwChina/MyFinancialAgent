# 冒烟测试报告

- 生成时间：2026-03-18 09:57:16
- 本地 Worker：`http://127.0.0.1:8787`
- 本地 D1：`my-financial-agent-test`（`--local`）
- 使用 seed：`/Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/_generated_history_seed.sql`
- 使用 replay fixture：`/Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/replay/`

## 执行结果

- `PASS` `SMK-001` CLI 帮助：`main.py --help` 正常输出 `full / hourly-news / close-summary`
- `PASS` `SMK-002` replay 价格采集：返回 10 条价格记录
- `PASS` `SMK-003` replay 新闻采集：20 条原始新闻 -> 规则初筛 6 条 -> LLM 精选 6 条
- `PASS` `SMK-004` schema 校验：`daily_review_archive` / `daily_news_ai_analysis` / `daily_review_archive_news` / `tracked_symbols` 结构符合当前代码
- `PASS` `SMK-005` 本地 Worker 健康检查：`ok=true, env=test`
- `PASS` `SMK-006` 新闻页与复盘入口 UI 冒烟
- `PASS` `SMK-007` 复盘抽屉分析区与价格区 UI 冒烟
- `PASS` `SMK-008` 标的管理 UI 冒烟
- `PASS` `SMK-009` 已复盘重新编辑并保存 UI 冒烟

## 本轮修正

- `review_edit_cycle.spec.js` 之前少点了一次 `下一步`，与当前五步复盘流程不一致；已补齐到“操作计划 -> 下一步 -> 深度总结 -> 完成复盘”。
- UI 冒烟并发执行时，多个用例共用 `2026-03-13` 和固定临时 symbol，容易互相影响；现已调整为：
  - `news_and_deleted_ui.spec.js` 使用 `2026-03-12`
  - `review_ui_check.spec.js` 使用 `2026-03-11`
  - `review_edit_cycle.spec.js` 继续使用 `2026-03-13`
  - `symbol_manager_ui.spec.js` 使用运行时唯一临时 symbol

## 结论

- 当前本地冒烟 9/9 通过
- 当前 schema、当前 replay 数据和当前 UI 主链路已对齐
