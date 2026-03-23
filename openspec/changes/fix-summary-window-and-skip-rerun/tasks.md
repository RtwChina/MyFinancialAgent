## 1. Summary 幂等规则

- [x] 1.1 在 `src/collect_news_v3.py` 的 summary 阶段增加 `analysis_date` 已存在检查
- [x] 1.2 若 `daily_news_ai_analysis` 已存在该 `analysis_date`，跳过候选加载、LLM 汇总和 summary 写入
- [x] 1.3 跳过重算时仍保持 review/archive 初始化逻辑不变
- [x] 1.4 跳过重算时，返回结构中的 `summary` 应能回填已有 summary 内容

## 2. 远端精确时间窗加载

- [x] 2.1 设计并实现远端精确时间窗查询能力（优先扩展 `/api/news` 支持 `dateTimeFrom/dateTimeTo`）
- [x] 2.2 `src/cloudflare_ingest.py` 增加对应查询参数封装
- [x] 2.3 `src/collect_news_v3.py` 的 `load_news_for_summary()` 改为传完整 `start_time/end_time`，不再使用 `[:10]`
- [x] 2.4 验证 `analysis_date=2026-03-20` 场景能拉到窗口内候选，不再出现“D1 有数据但候选为 0”

## 3. 日志可诊断性

- [x] 3.1 为 summary 过滤增加按原因分桶的统计日志
- [x] 3.2 在“已存在 summary -> 跳过重算”时输出明确 INFO 日志
- [x] 3.3 在远端返回数据可能被截断时输出诊断提示（若实现中仍保留相关兜底）

## 4. 验证

- [x] 4.1 本地或测试环境验证：已有 `daily_news_ai_analysis` 时，`close-summary` 跳过重算
- [x] 4.2 本地或测试环境验证：不存在 `daily_news_ai_analysis` 时，`close-summary` 正常生成 summary
- [ ] 4.3 线上日志验证：不再出现“D1 实际有候选但 summary 0 条”的误导性场景
