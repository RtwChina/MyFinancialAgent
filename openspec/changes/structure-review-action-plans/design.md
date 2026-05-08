## Context

当前复盘主表 `daily_review_archive` 以 `archive_date` 为主键，一天一条复盘记录，人工填写字段包括 `reviewer_news_notes`、`market_sentiment`、`sector_rotation`、`asset_plan`、`trading_summary`。其中 `asset_plan` 是自由文本，前端在复盘抽屉的“操作计划”步骤中以 textarea 编辑，Worker 保存时直接写入 `daily_review_archive.asset_plan`。

用户已经确认操作计划应改为结构化数据：每个复盘日下，每个标的一行完整计划。前端样式探索已沉淀在 `docs/arch/STRUCTURED_ACTION_PLAN_FRONTEND_STYLE.md`，测试页为 `tests/structured_action_plan_style.html`，最终选择版本 A：表格主视图 + 下方行内编辑区。

约束：

- 旧 `asset_plan` 不能删除，仍需作为兼容摘要字段。
- 历史日期通过 `archive_date` 保留，不为操作计划新增快照表。
- 历史文本转换只做临时脚本，不做长期 API 或正式前端功能。
- 测试环境与生产环境通过既有 APP_ENV / Worker/D1 配置隔离，迁移脚本必须显式指定目标数据库或运行环境。

## Goals / Non-Goals

**Goals:**

- 新增结构化操作计划子表 `daily_review_action_plans`。
- 前端在真实每日复盘抽屉中使用版本 A 替换 `assetPlan` textarea。
- Worker bootstrap 返回结构化 `actionPlans`，保存复盘时同步保存结构化计划。
- 保存结构化计划时同步生成 `asset_plan` Markdown 摘要，保持列表、旧导出、旧代码路径兼容。
- 提供 `scripts/temporary/convert_asset_plan_to_action_plans.py` 用于一次性历史文本转换。

**Non-Goals:**

- 不做操作计划快照表。
- 不做支撑压力位价格带明细表。
- 不做旧文本自动静默迁移。
- 不做长期“解析旧操作计划”API。
- 不改变其他复盘步骤和日级 AI summary 链路。

## Decisions

### 决策 1：使用主子表，而不是 JSON 字段

结构化计划是“一天复盘下面的多条标的计划”，属于 `daily_review_archive` 的子记录。

表结构建议：

```sql
CREATE TABLE IF NOT EXISTS daily_review_action_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    action_type TEXT,
    entry_plan TEXT,
    take_profit_plan TEXT,
    stop_loss_plan TEXT,
    key_levels TEXT,
    current_position TEXT,
    thinking TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(archive_date, symbol)
);
```

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_date
    ON daily_review_action_plans(archive_date, sort_order);

CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_symbol_date
    ON daily_review_action_plans(symbol, archive_date DESC);
```

选择主子表的原因：

- 支持按标的回看历史计划。
- 支持表格排序、删除、过滤和后续统计。
- 避免把结构化数组塞回 `asset_plan` 后继续难以查询。

### 决策 2：`UNIQUE(archive_date, symbol)`

第一版采用“一天一个标的一行完整计划”：

```text
2026-05-07 + MU
2026-05-07 + MSFT
2026-05-08 + MU
```

这不会丢历史，因为历史维度是 `archive_date`。同一天同一标的重复提交时使用 upsert 更新该日该标的的当前计划。

### 决策 3：字段枚举收敛

`action_type` 固定为：

```text
准备开仓
持仓观察
已清仓复盘
```

`current_position` 固定为：

```text
0-10%
10%-20%
20%-30%
>30%
```

前端应使用选择控件，后端保存时应接受这些枚举值并对未知值做保守清洗或拒绝。

### 决策 4：支撑压力位保持多行文本

`key_levels` 使用多行文本，而不是拆为价格带明细表。

原因：

- 用户的写法包含区间、强弱、备注和临盘判断。
- 过度结构化会降低填写速度。
- 第一版主要目标是让计划按标的结构化，不是做技术位统计。

推荐文本格式：

```text
支撑位 (Support):
335-348（中）
298-310（小）
272-284（中）

压力位:
335-348（中）
```

### 决策 5：前端采用版本 A

前端版本 A：

```text
表格主视图
  标的 / 动作 / 当前仓位 / 开仓计划 / 止盈计划 / 止损计划 / 支撑压力位 / 思考

下方行内编辑区
  当前选中标的的完整字段
```

原因：

- 与现有复盘步骤改造成本最低。
- 表格便于快速扫全局。
- 下方编辑区能承载支撑压力位和思考等长文本。

### 决策 6：保存时同步兼容摘要

保存结构化 `actionPlans` 时，后端应生成 Markdown 摘要写回 `daily_review_archive.asset_plan`。

建议格式：

```text
### MU
- 动作：持仓观察
- 当前仓位：0-10%
- 开仓计划：...
- 止盈计划：...
- 止损计划：...
- 支撑压力位：
  支撑位 (Support):
  ...
- 思考：...
```

这样旧复盘列表和任何仍读取 `asset_plan` 的代码不会立刻失效。

### 决策 7：历史文本转换使用临时脚本

新增：

```text
scripts/temporary/convert_asset_plan_to_action_plans.py
```

脚本模式：

- `dry-run`：读取 `daily_review_archive.asset_plan`，只生成预览 JSON/Markdown，不写库。
- `apply`：读取确认后的预览结果，写入 `daily_review_action_plans`。

默认行为：

- 只处理 `asset_plan` 非空且 `daily_review_action_plans` 为空的日期。
- 不删除或覆盖旧 `asset_plan`。
- 不覆盖已有结构化计划，除非显式传入 override 参数。
- 每条转换结果保留原文片段或 `migration_note`，便于人工核对。

转换方式可以先使用规则和人工整理，必要时由脚本调用 LLM 生成草稿；但 LLM 结果必须先进入 preview，不得直接静默写库。

## Risks / Trade-offs

- [旧文本解析不准] → 使用 dry-run 预览，人工确认后再 apply；无法判断的内容放入 `thinking` 或 `migration_note`。
- [保存时误删历史] → 删除缺失子记录时必须限定 `archive_date = 当前复盘日`，不得按 symbol 全局删除。
- [旧代码仍读 asset_plan] → 保存结构化计划时同步生成 Markdown 摘要。
- [前端表格横向过宽] → 第一版使用横向滚动 + 下方编辑区；移动端可降级为表格滚动，不强行卡片化。
- [枚举未来不够用] → 第一版先按用户确认的三态/四档落地；后续如需扩展再做单独变更。

## Migration Plan

1. 添加数据库迁移和测试 schema。
2. 实现 Worker 读写 `daily_review_action_plans`。
3. 实现结构化计划到 `asset_plan` Markdown 摘要的生成函数。
4. 实现前端版本 A，并在无结构化数据但有旧 `asset_plan` 时展示旧文本参考。
5. 添加临时转换脚本，先 dry-run 生成预览。
6. 人工确认预览后执行 apply。

回滚策略：

- 不删除旧 `asset_plan`，因此即使结构化计划功能回滚，旧文本仍可展示。
- 新表为附加表，回滚前端/Worker 后不影响主复盘表。
