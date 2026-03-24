## 1. 候选与配额规则

- [x] 1.1 将 `load_news_for_summary()` 的日期级 summary 候选阈值调整为 `importance_stars >= 4`
- [x] 1.2 按标准类型 `index / sector / stock` 对 summary 候选进行分桶
- [x] 1.3 实现“保底 + 弹性”选入器，支持每桶先保底、剩余名额按全局重要性补位
- [x] 1.4 将最终 summary 入参数量限制在约定总上限内，并允许桶内候选不足时按实际数量选入

## 2. 三桶并行 summary 生成

- [x] 2.1 为大盘/板块/个股三桶分别设计专用 prompt，不再复用当前单次 summary prompt
- [x] 2.2 让三桶子任务并行执行，并允许空桶跳过不阻塞整体流程
- [x] 2.3 增加 `LLM_DAILY_SUMMARY_MODEL_ID / LLM_DAILY_SUMMARY_TIMEOUT`，并让日期级日总结优先使用千问 plus
- [x] 2.4 基于三桶子总结用程序拼装 `daily_major_events / sector_impact_map / linkage_logic_chain`
- [x] 2.5 将 `source_news_ids` 改为记录全部实际 summary 入参新闻的 id

## 3. 日志与可观测性

- [x] 3.1 增加 stars>=4 过滤后的 summary 候选日志
- [x] 3.2 增加三桶“符合要求”的新闻数量与新闻 ID 日志
- [x] 3.3 增加三桶候选量、保底选入量、弹性补位后选入量日志
- [x] 3.4 增加三桶最终进入 LLM 的新闻数量与新闻 ID 日志
- [x] 3.5 增加最终 `source_news_ids` 数量日志
- [ ] 3.6 确认现有复盘页在新 `source_news_ids` 语义下能稳定展示三类新闻

## 4. 测试与文档

- [ ] 4.1 根据 `tests/standards/` 规范补充本变更的冒烟用例与集成测试说明
- [ ] 4.2 将本变更需要的测试数据、样例或脚本放入 `.tests/` 目录
- [x] 4.3 本地验证：summary 候选按三桶选入，且 `source_news_ids` 覆盖多类型新闻
- [x] 4.4 本地或测试环境验证：三桶并行子总结与程序拼装后的最终输出结构正确
- [ ] 4.5 线上日志验证：高宏观波动日不再出现 summary 前 20 条被单一类型占满的问题

## 5. 发布

- [ ] 5.1 发布前检查：确认 `APP_ENV`、Worker/D1 绑定、summary 已存在跳过重算逻辑未被破坏
- [ ] 5.2 部署后验证复盘页的“大盘新闻 / 板块新闻 / 个股新闻”分组与 summary 入参一致
