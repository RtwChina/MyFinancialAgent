## Context

当前日期级 summary 的实现位于 [collect_news_v3.py](/Users/didi/Project/MyFinancialAgent/src/collect_news_v3.py)：

- `load_news_for_summary()` 负责按复盘窗口加载候选新闻
- `build_daily_summary_record()` 负责：
  - 按 `importance_stars + pub_date` 全局排序
  - 直接截取前 `20` 条
  - 调用一次日期级 LLM 汇总
  - 将这 20 条的 id 写入 `source_news_ids`

在新闻类型标准化完成后，系统现在只保留三类标准类型：

- `index`
- `sector`
- `stock`

因此，summary 现在已经具备稳定分桶的基础。但如果继续采用“全局 top20”，宏观/大盘新闻仍会在高波动日占满名额，导致：

- 板块/个股新闻难以进入 `source_news_ids`
- 复盘页新闻分组结构失衡
- AI 日总结更像“宏观简报”，而不是完整的复盘输入

## Goals / Non-Goals

**Goals:**

- 将 summary 候选阈值提升到 `importance_stars >= 4`
- 按标准类型拆分为三桶：
  - `index`
  - `sector`
  - `stock`
- 用“保底 + 弹性”替代固定 top20：
  - 先保障每类都有最低存在感
  - 再让剩余名额按全局重要性竞争
- 将日期级 summary 生成改造成：
  - 三桶并行子总结
  - 程序拼装最终日总结
- `source_news_ids` 保存全部实际入参新闻，而不是单一全局排序截断结果
- 为日期级日总结单独配置模型与超时：
  - `LLM_DAILY_SUMMARY_MODEL_ID`
  - `LLM_DAILY_SUMMARY_TIMEOUT`
- 提供可诊断日志，解释三桶候选与最终入参的形成过程

**Non-Goals:**

- 本 change 不调整 Stage 1 / Stage 2 / Stage 3 的主漏斗筛选逻辑
- 不改变 `hourly-news` / `close-summary` / `full` 的 summary 触发边界
- 不改变“summary 已存在则跳过重算”的既有规则
- 不在本变更中引入新的数据库表结构

## Decisions

### 决策 1：日期级 summary 候选过滤提升为 `stars >= 4`

现状：

- summary 候选池使用 `importance_stars >= 3`

问题：

- `3 星` 新闻数量较多，候选池会被中等质量新闻撑大
- 当天宏观线很强时，个股和板块新闻更难在全局排序中冒头

方案选择：

- 方案 A：保留 `>= 3`
- 方案 B：提升为 `>= 4`

结论：选择 **方案 B**

原因：

- summary 是“日期级综合输入”，应比普通复盘候选更严格
- 后续还有“保底 + 弹性”兜住类型覆盖，不会完全只剩宏观

### 决策 2：采用“保底 + 弹性”而不是硬性固定配额

用户已经明确倾向：

- 不采用死板的 `20/10/10` 硬配额
- 采用“保底 + 弹性”

设计为两层：

```text
第一层：每桶先满足最低保底
第二层：剩余名额按全局重要性补齐
```

推荐默认参数：

- 大盘桶：保底 `8`
- 板块桶：保底 `5`
- 个股桶：保底 `5`
- 总上限：`40`

然后：

- 先从每桶中按 `importance_stars DESC, pub_date DESC` 取到保底数量
- 再将剩余候选合并，继续按同样排序补满到总上限

这样可以同时满足：

- 类型覆盖
- 重要性优先
- 某一类候选不足时不强行凑数

### 决策 3：三桶并行子总结 + 程序拼装最终结果

新的 summary 调用链：

```text
summary 候选池
  ├─ index 桶 -> 子总结 A
  ├─ sector 桶 -> 子总结 B
  └─ stock 桶 -> 子总结 C
       ↓
程序拼装
  └─ 最终 summary
```

这里总共是 3 次 summary LLM 调用：

- 3 次子总结

不再增加第 4 次“最终总汇总 AI 调用”，原因：

- 最终再做一次 AI 汇总会重新引入宏观偏置，可能再次压缩板块/个股表达
- 会额外增加一次成本、超时点和失败点
- 这次变更的核心目标是“保住三类输入的表达空间”，而不是再做一次统一文风润色

因此最终结果由程序拼装：

- `daily_major_events`
  - 以大盘桶子总结为主
  - 必要时补充板块/个股桶中的高优先级要点
- `sector_impact_map`
  - 按 `index -> sector -> stock` 顺序合并三桶输出
- `linkage_logic_chain`
  - 按 `index -> sector -> stock` 顺序合并三桶逻辑链

### 决策 4：三桶使用专用 prompt，而不是复用当前单次 summary prompt

现有日期级 summary prompt 是为“混合前 20 条候选新闻的一次总分析”设计的。
改成三桶后，如果继续复用当前 prompt，会出现：

- 个股桶也去写宏观主线
- 板块桶重复宏观叙事
- 子总结之间内容重叠严重

因此需要三种专用 prompt：

- 大盘桶 prompt
  - 聚焦风险偏好、利率、流动性、指数、商品、汇率
- 板块桶 prompt
  - 聚焦行业、主题、ETF、板块轮动
- 个股桶 prompt
  - 聚焦公司、财报、订单、监管、产品、资本开支

### 决策 5：日期级日总结模型单独配置

当前代码复用：

- `LLM_SUMMARY_MODEL_ID`
- `LLM_SUMMARY_TIMEOUT`

这两个名字语义过泛，容易和其它 summary 类调用混淆。

本变更建议新增并优先使用：

- `LLM_DAILY_SUMMARY_MODEL_ID`
- `LLM_DAILY_SUMMARY_TIMEOUT`

默认建议：

- `LLM_DAILY_SUMMARY_MODEL_ID = qwen-plus`

兼容策略：

- 新变量优先
- 若未配置，则回退到旧的 `LLM_SUMMARY_MODEL_ID / LLM_SUMMARY_TIMEOUT`

### 决策 6：`source_news_ids` 保存全部实际 summary 入参

旧逻辑：

- `source_news_ids = 全局 top20 的 id`

新逻辑：

- `source_news_ids = 三桶最终入参新闻的合并 id`

意义：

- 复盘页与已归档复盘新闻会更完整
- 避免“数据库有个股新闻，但复盘页没有个股新闻”

### 决策 7：日志必须能解释配额形成过程

除了现有 summary 候选日志外，新增以下信息：

- `stars>=4` 后的候选总量
- 三桶各自候选量
- 三桶各自“符合要求”的新闻数量与新闻 ID
- 保底阶段各桶选入量
- 弹性补位后各桶最终入参量
- 三桶最终进入 LLM 的数量与新闻 ID
- 最终 `source_news_ids` 总数

建议日志形态：

```text
[日总结] 三桶候选：大盘 28，板块 12，个股 9
[日总结] 大盘桶符合要求：8条 ids=[101,102,...]
[日总结] 板块桶符合要求：5条 ids=[201,202,...]
[日总结] 个股桶符合要求：5条 ids=[301,302,...]
[日总结] 保底选入：大盘 8，板块 5，个股 5
[日总结] 弹性补位后：大盘 18，板块 10，个股 7，合计 35
[日总结] 大盘桶进入LLM：18条 ids=[...]
[日总结] 板块桶进入LLM：10条 ids=[...]
[日总结] 个股桶进入LLM：7条 ids=[...]
[日总结] source_news_ids: 35 条
```

## Risks / Trade-offs

- **[成本增加]** → summary LLM 调用从 1 次增加到 3 次  
  **Mitigation**：三桶并行执行，尽量把总墙钟时间控制在接近当前单次 summary 的量级

- **[某桶候选不足]** → 个股或板块在某些交易日可能不足保底数  
  **Mitigation**：保底是“最多取到保底”，不足时按实际数量，不做硬补齐

- **[输出风格不完全一致]** → 三个子总结来自独立调用，表达风格可能存在差异  
  **Mitigation**：通过专用 prompt 约束输出格式，并由程序按固定顺序拼装

- **[source_news_ids 增长]** → 从 20 条扩展到最多 40 条，会影响复盘页候选规模  
  **Mitigation**：通过 stars>=4 和总上限约束，避免无边界膨胀

## Migration Plan

1. 在 `load_news_for_summary()` 中将 summary 候选阈值提升为 `importance_stars >= 4`
2. 在 `build_daily_summary_record()` 前增加三桶选入器
3. 实现三桶专用 prompt 与并行 summary 子任务
4. 增加 `LLM_DAILY_SUMMARY_MODEL_ID / LLM_DAILY_SUMMARY_TIMEOUT`
5. 实现程序拼装最终 summary
6. 将 `source_news_ids` 改为三桶实际入参并集
7. 增强日志并本地验证
8. 在线上 `close-summary` 日志中验证三桶选入与最终复盘页展示

回滚策略：

- 若上线后发现 summary 质量下降，可退回单次 summary 路径
- `source_news_ids` 仍可继续沿用旧 top20 逻辑作为短期 fallback

## Open Questions

- 保底参数是否固定为 `8/5/5`，还是做成环境变量可调？
- 总上限是否固定为 `40`，还是与复盘页展示容量绑定？
- 程序拼装 `daily_major_events` 时，是否只取大盘桶要点，还是允许补入板块/个股高优先级事件？
