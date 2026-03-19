# 数据库初始化与 Migration 规范

## 生产环境（Cloudflare D1）

| 项目 | 值 |
|------|-----|
| 平台 | Cloudflare D1 |
| 数据库名 | `my-financial-agent` |
| Database ID | `b9a4be38-668d-4143-8355-6146c2610f82` |
| Migration 目录 | `cloudflare/migrations/` |
| 配置文件 | `wrangler.toml` |

### 执行 Migration

```bash
# 查看待执行的 migration
npx wrangler d1 migrations list my-financial-agent

# 应用所有待执行的 migration（生产）
npx wrangler d1 migrations apply my-financial-agent

# 应用到本地开发环境
npx wrangler d1 migrations apply my-financial-agent --local
```

### Migration 文件说明

| 文件 | 内容 |
|------|------|
| `001_init.sql` | 建表：news_raw_data、daily_review_archive 等核心表 |
| `002_news_enrichment_and_status.sql` | 新闻增强字段、状态机字段 |
| `003_rename_news_analysis_fields.sql` | 字段重命名 |
| `004_drop_news_rule_score.sql` | 删除废弃字段 |
| `005_review_archive_snapshot_and_ai_sources.sql` | 复盘快照与 AI 来源字段 |
| `006_drop_selected_news_ids.sql` | 删除废弃字段 |
| `007_tracked_symbols.sql` | **建表 + 初始化标的数据**（index / sector / stock） |
| `008_stock_raw_symbol_remap.sql` | stock_raw 表 symbol 字段规范化 |

## 初始化标的数据

**唯一入口：`cloudflare/migrations/007_tracked_symbols.sql`**

这是生产环境 `tracked_symbols` 表的权威数据来源。新增/修改标的时：

1. 在 `007_tracked_symbols.sql` 的对应分类（index / sector / stock）追加 `INSERT OR IGNORE` 行
2. 若需在已有环境中更新已存在标的，改用手工 SQL 或新增 migration 文件（`009_*.sql`）
3. `sort_order` 按类别内部排序，同类新增标的接续最大值

### 标的字段说明

```sql
INSERT OR IGNORE INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, sort_order) VALUES
('SYMBOL', 'YAHOO_SYMBOL', '中文名', 'stock|sector|index', '["alias1","alias2"]', 顺序号);
```

| 字段 | 说明 |
|------|------|
| `symbol` | 系统主键，A股格式如 `300476.SZ`、`601899.SS`、`9988.HK` |
| `yahoo_symbol` | Yahoo Finance 行情代码，上海 `.SS`（非 `.SH`），如 `562500.SS` |
| `display_name` | 前端显示名 |
| `symbol_type` | `index`=大盘/商品/汇率，`sector`=板块ETF，`stock`=个股 |
| `aliases` | JSON 数组，用于新闻关键词匹配，尽量覆盖常见别名 |

> **注意**：上海交易所股票在 Yahoo Finance 后缀为 `.SS`，不是 `.SH`。
> 若原始代码为 `.SH`，`symbol` 字段保留原始值，`yahoo_symbol` 改为 `.SS`。

## 从零初始化生产环境

```bash
# 一次性执行所有 migration（001~最新），建表 + 初始化数据全部搞定
npx wrangler d1 migrations apply my-financial-agent
```

> `schema.sql` 已删除。表结构以 `cloudflare/migrations/` 为唯一权威来源。

## 参考数据（测试环境）

`tests/testdata/TRACKED_SYMBOLS_SEED_DRAFT_20260318.sql`

使用 `ON CONFLICT DO UPDATE` 语法，可重复执行，用于测试环境补数据或核对数据。
**不是生产入口，生产以 migration 为准。**
