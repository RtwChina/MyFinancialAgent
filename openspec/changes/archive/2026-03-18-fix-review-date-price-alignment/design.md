## Context

系统当前覆盖美股个股、美股板块 ETF、美国大盘指数、亚洲指数、汇率、大宗商品。这些资产分属不同市场，收盘时间不同，因此同一个自然日里 `stock_raw.k_date` 可能同时存在多个值。

当前实现的两个假设已不成立：
1. `MAX(stock_raw.k_date)` 等于"最近已收盘 NYSE 交易日"
2. 所有标的在同一个 `k_date` 上都有数据

Python 侧已有 `get_latest_closed_trading_day()` 函数（L1044，基于 `pandas_market_calendars`），但落库路径（L1343、L1400）仍调用 `get_current_review_trading_day()`，后者在盘前/盘中即返回当天，导致复盘被提前建档。

Worker 侧无 NYSE 日历能力，只能从 DB 推断，当前策略不可靠。

环境标识：Worker 已有 `APP_ENV`（`test` / `prod`），Python 通过 `ExecutionContext` 管理时钟。

## Goals / Non-Goals

**Goals:**
- Worker：引入 `getLatestClosedNyseTradingDay(env)` 替代 `getLatestPriceDate()`，以可靠的 DB 代理方式推断 NYSE 收盘日
- Worker：修复复盘页价格查询为"per-symbol 最近记录"语义（`k_date <= archiveDate`）
- Python：`close-summary` / `full` 落库时统一使用 `get_latest_closed_trading_day()`

**Non-Goals:**
- 不引入外部 NYSE 节假日 API 或硬编码节假日表
- 不修改历史已归档复盘数据
- `hourly-news` 的原始新闻采集时间窗口逻辑不变
- 不修改前端 UI 结构，只修复数据来源

## Decisions

### 决策 1：Worker 用 `^GSPC`（S&P 500）作为 NYSE 收盘日代理

**问题**：Worker（Cloudflare Workers JS 运行时）没有 `pandas_market_calendars`，无法直接计算 NYSE 日历。

**方案对比**：
| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 硬编码 NYSE 节假日表 | 无 DB 依赖 | 每年需维护，容易遗漏 |
| B. 按 symbol_type 过滤（stock/sector） | 语义清晰 | symbol_type 范围可能变动 |
| C. 用 `^GSPC` 的最新 `k_date` | 简单可靠，S&P 500 有数据即代表美股收盘 | 依赖 `^GSPC` 数据采集不中断 |

**选择 C**：`^GSPC` 是标的表中必选的美股大盘指标，若它有价格记录，说明 NYSE 当天已收盘。函数名改为 `getLatestClosedNyseTradingDay(env)`，明确语义。

```js
// 伪代码
async function getLatestClosedNyseTradingDay(env) {
  const row = await env.DB.prepare(
    `SELECT MAX(k_date) AS latest FROM stock_raw WHERE symbol = '^GSPC'`
  ).first();
  return row?.latest || null;
}
```

### 决策 2：价格查询使用 per-symbol 子查询 JOIN

将 `WHERE k_date = ?` 改为：

```sql
SELECT p.symbol, p.stock_name, p.current_price, p.change_percent, p.volume, p.k_date
FROM stock_raw p
JOIN (
  SELECT symbol, MAX(k_date) AS latest_k_date
  FROM stock_raw
  WHERE k_date <= ?
  GROUP BY symbol
) latest ON latest.symbol = p.symbol AND latest.latest_k_date = p.k_date
ORDER BY p.symbol
```

此查询在 Cloudflare D1（SQLite 兼容）上可使用，并且存在 `(k_date, symbol)` 唯一索引，性能可接受。

### 决策 3：Python 侧只改调用点，不改函数本身

`get_latest_closed_trading_day()` 已经正确实现。只需将 L1343 和 L1400 的调用从 `get_current_review_trading_day(context)` 改为 `get_latest_closed_trading_day(context)`。

`get_current_review_trading_day()` 保留不删，`hourly-news` 等场景仍可用于原始新闻日期归属（这部分行为不变）。

## Risks / Trade-offs

- **`^GSPC` 采集中断风险** → `^GSPC` 是系统核心标的，采集失败会有其他告警；`getLatestClosedNyseTradingDay` 返回 `null` 时，`getPendingReviews` 已有兜底（返回空列表），不会崩溃
- **夏令时边界** → Python 侧 `get_latest_closed_trading_day()` 已用 `America/New_York` 时区处理，Worker 侧使用 DB 日期字符串无时区计算，不引入新风险
- **`getNewsWindowForDate` 的 `stock_raw` 查询** → 该函数已用 `k_date <= ?` 过滤，语义正确，本次不修改；但其 DISTINCT 日期查询也混用了跨市场数据，后续可单独优化（不在本次范围内）
- **测试环境隔离** → Python 通过 `ExecutionContext.clock` mock 时钟，测试覆盖不受影响；Worker 测试通过传入 fake env.DB，`^GSPC` 日期可 mock

## Migration Plan

1. 修改 `cloudflare/worker/src/index.js`（两处：新增函数 + 修改 SQL）
2. 修改 `src/collect_news_v3.py`（两处调用点）
3. 更新/新增集成测试场景（`tests/integration/`）
4. 更新冒烟文档 `docs/testing/smoke-test.md`
5. 本地验证后直接部署，无需数据 migration（历史数据不回填）

**回滚**：Worker 通过 `wrangler rollback` 回滚上一版本；Python 改动为单文件，git revert 即可。
