## Context

当前日期级 summary 的运行链路如下：

```text
run_news_pipeline(persist_summary=True)
    ├─ load_news_for_summary(analysis_date, use_remote, fallback_news)
    ├─ build_daily_summary_record(window_news, analysis_date)
    ├─ send/save daily_news_ai_analysis
    └─ initialize review/archive
```

在远端模式下，`load_news_for_summary()` 会：

1. 计算精确窗口：`start_time ~ end_time`
2. 但仅传 `start_time[:10]` / `end_time[:10]` 到远端 `/api/news`
3. 远端按 `pub_date DESC LIMIT 200` 返回
4. 本地再按精确窗口二次过滤

这会造成如下偏差：

```text
真实窗口:
[2026-03-20 04:00:00 ---------------- 2026-03-21 04:00:00]

远端返回前 200 条:
[2026-03-21 04:10:57 ---------------- 2026-03-21 23:21:50]

本地精确过滤:
=> 0 条
```

与此同时，系统已经以 `analysis_date` 为主键存储 `daily_news_ai_analysis`。对已存在 summary 的复盘日继续重算，收益有限，还会放大上述加载问题。

## Goals / Non-Goals

**Goals**

- 对同一 `analysis_date` 实现 summary 幂等：已存在则跳过重算
- 修复远端 summary 候选加载的精确时间窗问题
- 保持 `hourly-news` / `close-summary` / `full` 的职责边界清晰
- 提供足够清楚的日志，能解释“为何 0 条”

**Non-Goals**

- 不改变 `hourly-news` 不写 summary 的既有规则
- 不引入“summary 部分更新 / 增量重算”逻辑
- 不改变新闻三级漏斗筛选标准本身

## Decisions

### 决策 1：`daily_news_ai_analysis` 已存在时直接跳过重算

规则：

- 当 `persist_summary=True`
- 且 `analysis_date` 在 `daily_news_ai_analysis` 已有记录
- 则跳过：
  - `load_news_for_summary()`
  - `build_daily_summary_record()`
  - `send/save_daily_news_ai_analysis()`

但仍保留：

- review/archive 初始化
- 最终返回结构中的 `summary` 回填（可直接取已存在记录）

原因：

- 用户明确要求“summary 已存在 -> 跳过重算”
- 该规则最简单、最稳定、成本最低
- 可避免后续运行因为候选加载异常把已存在复盘日误算为空

### 决策 2：远端 summary 候选加载必须使用精确时间窗

可选方案：

#### 方案 A：扩展 `/api/news` 支持 `dateTimeFrom` / `dateTimeTo`

优点：

- 语义正确
- 查询结果最小化
- 不依赖客户端分页拉全
- 与现有 `/api/news` 复用同一入口

缺点：

- 需要调整 Worker 查询逻辑

#### 方案 B：客户端分页拉全日期范围后本地精确过滤

优点：

- Worker 改动较少

缺点：

- 传输量大
- 逻辑绕
- 仍依赖分页/上限处理正确
- 容易继续踩排序和截断问题

**结论：选方案 A。**

### 决策 3：候选为空日志需要按排除原因分桶

当前日志只输出：

```text
候选 0 条，排除 250 条
```

对排查帮助有限。应增加分桶统计：

- 时间窗外
- `importance_stars < 3`
- `rule_passed != 1`
- `processing_status` 不在 `llm_processed/reviewed`

这样未来一眼就能判断是“确实没数据”，还是“数据存在但加载/过滤错了”。

## Mode Behavior

```text
hourly-news
    └─ 不生成 summary

close-summary / full
    ├─ 检查 analysis_date 是否已有 daily_news_ai_analysis
    ├─ 若存在：跳过 summary 重算
    └─ 若不存在：按精确时间窗加载候选并生成 summary
```

## Risks / Trade-offs

- **首次 summary 质量前置**
  由于采用“已存在即跳过”，首次生成的 summary 将成为该复盘日的唯一自动结果。若首次生成时新闻不完整，后续也不会自动修正。

- **需要明确人工修正路径**
  如果未来需要“强制重算”，不在常规任务中引入额外开关；采用显式运维动作即可：
  - 手动删除 `daily_news_ai_analysis` 中该 `analysis_date` 的记录
  - 然后重新运行 `close-summary` 或 `full`

  例如：

  ```sql
  DELETE FROM daily_news_ai_analysis
  WHERE analysis_date = '2026-03-20';
  ```

  删除后，系统会把该复盘日视为“尚未生成 summary”，从而重新走 summary 生成流程。

- **接口兼容性**
  `/api/news` 增加精确时间参数时，需要保持原有 `dateFrom/dateTo` 行为不受影响，避免影响前端新闻检索页。
