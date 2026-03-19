## Context

`news_raw_data` 表有三个时间字段：`pub_date`（新闻发布时间）、`captured_at`（采集时间）、`created_at`（入库时间）。前两者由 Python 代码显式设置为北京时间（`now_cst()`），但 `created_at` 依赖 SQLite 的 `DEFAULT CURRENT_TIMESTAMP`，返回的是 UTC 时间，比北京时间少8小时。这导致同表内时区不一致。

同样的问题存在于 `stock_raw`（`created_at`）、`tracked_symbols`（`created_at`、`updated_at`）等表。

## Goals / Non-Goals

**Goals:**
- 所有表的 `created_at`/`updated_at` 统一为北京时间
- 修正 spec 中 Yahoo 时区要求，与代码实际行为一致
- 删除 `_format_for_review_window()` 废弃代码

**Non-Goals:**
- 不改动 `pub_date`、`captured_at` 的逻辑（已正确）
- 不改动采集链路或窗口计算逻辑
- 不修改 migration schema（`DEFAULT CURRENT_TIMESTAMP` 保留作为兜底，代码层覆盖即可）

## Decisions

### 1. 修复方式：代码显式赋值 vs 修改 Migration Schema

**选择：代码显式赋值 `now_cst()`**

理由：
- 最小改动：只需在 INSERT 语句中加入 `created_at` 字段赋值
- `now_cst()` 已存在且被 `captured_at` 使用，复用即可
- 不需要新 migration，避免 D1 schema 变更风险
- `DEFAULT CURRENT_TIMESTAMP` 保留作为兜底，不影响现有 schema

替代方案：新 migration 修改默认值表达式 — 排除，SQLite 不支持 `ALTER COLUMN DEFAULT`

### 2. 已有数据修复

**选择：一条 SQL UPDATE 修正**

- 当前仅12条数据，全部 `created_at` 偏差恒定8小时
- 直接 `UPDATE news_raw_data SET created_at = datetime(created_at, '+8 hours')` 即可
- 无需 Python 脚本处理夏令时（`created_at` 的偏差固定为 UTC vs CST = 8小时）

### 3. 废弃函数清理

**选择：直接删除 `_format_for_review_window()` 和 `REVIEW_TZ`**

- 经确认无调用方

## Risks / Trade-offs

- **[风险] 遗漏写入点** → 全局搜索 `INSERT INTO` 确认所有写入函数都显式设置 `created_at`
- **[风险] Worker 层写入** → 检查 `cloudflare/worker/src/index.js` 中是否有直接 INSERT，确保也使用北京时间
