# 复盘日期与当日价格错位 Bug 修复方案

## 1. 背景

当前系统已经同时覆盖：

- 美股大盘与个股
- 亚洲指数
- 汇率与大宗商品

这意味着 `stock_raw.k_date` 不再天然等于“同一个市场的同一个交易日”。

用户的真实使用场景是：

- **北京时间 2026-03-18 上午开始复盘**
- 此时要复盘的是：
  - **北京时间 2026-03-18 04:00 收盘**
  - 对应 **美东 2026-03-17 的 NYSE 交易日**

也就是说，复盘页里的 `archive_date` / `review_date`，在业务语义上应该代表：

> **正在复盘的“美股交易日”日期**

而不是：

> 北京时间自然日  
> 或所有资产里最新的 `k_date`

---

## 2. 正确业务语义

### 2.1 复盘日期定义

`archive_date` 应定义为：

- **NYSE 交易日日期**
- 例如北京时间 `2026-03-18` 上午复盘时，`archive_date` 应为 `2026-03-17`

### 2.2 价格展示定义

复盘页“当日价格”展示的不是：

- `k_date = archive_date` 的严格等值数据

而应该是：

- 对每个标的，取 **`k_date <= archive_date` 的最近一条价格**

原因：

- 美股个股 / 美股板块 ETF 在北京时间白天通常最新只会有 `2026-03-17`
- 亚洲指数 / 汇率 / 商品在北京时间白天可能已经有 `2026-03-18`
- 跨市场系统里，不能要求所有标的都共享同一个 `k_date`

---

## 3. 现象

用户在 GitHub Actions 跑完任务后，出现了一个 `2026-03-18` 的复盘。

但打开复盘后发现：

- 有大盘数据
- 个股和板块数据缺失

这是因为：

- 个股和多数美股板块 ETF 的价格已写入 `stock_raw`
- 但其 `k_date` 为 `2026-03-17`
- 复盘页按 `k_date = '2026-03-18'` 精确查询时，把它们漏掉了

---

## 4. 已确认的代码问题

### 4.1 问题 A：复盘候选日期使用了所有市场的最大价格日期

文件：

- `/Users/didi/Project/MyFinancialAgent/cloudflare/worker/src/index.js:1006`

当前代码：

```js
async function getLatestPriceDate(env) {
  const row = await env.DB.prepare(`SELECT MAX(k_date) AS latest FROM stock_raw`).first();
  return row?.latest || null;
}
```

问题：

- 这里直接取 `stock_raw` 的 `MAX(k_date)`
- 一旦亚洲指数、汇率、商品先进入 `2026-03-18`
- 即使美股个股和美股板块仍停留在 `2026-03-17`
- 系统也会错误地把“最新复盘候选日”推进到 `2026-03-18`

这会导致：

- 复盘列表里出现业务语义错误的复盘日期
- 用户在北京时间上午看到的复盘日偏新一天

### 4.2 问题 B：复盘页价格查询使用了 `k_date = archive_date`

文件：

- `/Users/didi/Project/MyFinancialAgent/cloudflare/worker/src/index.js:542`

当前代码：

```js
const currentPricesRaw = await env.DB.prepare(
  `SELECT symbol, stock_name, current_price, change_percent, volume
   FROM stock_raw
   WHERE k_date = ?
   ORDER BY symbol`,
)
  .bind(archiveDate)
  .all();
```

问题：

- 这是单市场假设
- 对跨市场资产集合不成立

结果：

- `archive_date = 2026-03-18` 时
- `MU / MSFT / GOOGL / LITE / XLK / SOXX / XLE / XLF / XLY ...`
- 因为它们的 `k_date = 2026-03-17`
- 全部被过滤掉

### 4.3 问题 C：新闻汇总用的复盘日也可能提前一天

文件：

- `/Users/didi/Project/MyFinancialAgent/src/collect_news_v3.py:1061`
- `/Users/didi/Project/MyFinancialAgent/src/collect_news_v3.py:1400`

当前逻辑：

- `run_news_pipeline()` 使用 `get_current_review_trading_day(context)`
- `get_current_review_trading_day()` 在“今天是 NYSE 交易日”时直接返回今天

问题：

- 如果当前是 **纽约当天盘前 / 盘中 / 收盘前**
- 这时“今天虽然是交易日”，但**今天并未收盘**
- 真正应该复盘的仍然是**最近一个已收盘交易日**

这会导致：

- `daily_news_ai_analysis.analysis_date`
- `daily_review_archive.archive_date`

可能被提前推进到尚未完成收盘的 NYSE 交易日

---

## 5. 我们已经验证到的事实

生产库中已存在以下价格数据：

- 个股：
  - `MU`
  - `LITE`
  - `MSFT`
  - `GOOGL`
- 板块：
  - `XLK`
  - `SOXX`
  - `XLE`
  - `XLF`
  - `XLY`
  - 以及其他 sector ETF

但它们的 `k_date` 为：

- `2026-03-17`

而部分亚洲指数、商品、汇率的 `k_date` 已是：

- `2026-03-18`

因此，当前问题不是：

- 没采到数据

而是：

- **复盘日期与价格查询逻辑错位**

---

## 6. 修复目标

### 目标 1

复盘页里出现的 `archive_date` 必须是：

- **最近一个已收盘的 NYSE 交易日**

### 目标 2

复盘页“当日价格”必须：

- 对每个标的取 `k_date <= archive_date` 的最近一条
- 而不是要求所有标的都满足 `k_date = archive_date`

### 目标 3

新闻汇总与复盘初始化也必须对齐同一个“最近已收盘 NYSE 交易日”

---

## 7. 修复方案

### 7.1 统一复盘日期口径

建议引入一个统一概念：

- `review_trading_day`

语义：

- **最近一个已收盘的 NYSE 交易日**

统一替代当前混用的：

- `MAX(stock_raw.k_date)`
- `get_current_review_trading_day()`

建议策略：

- 复盘列表、复盘初始化、新闻 summary、复盘 bootstrap
- 全部以 **最近已收盘 NYSE 交易日** 为准

### 7.2 修复复盘候选日期获取逻辑

当前：

- `getLatestPriceDate()` 直接读 `MAX(stock_raw.k_date)`

建议改为：

- 新增 `getLatestClosedNyseTradingDay(env)`
- 不再从 `stock_raw` 的全市场最大日期推断
- 直接按 NYSE 收盘逻辑计算

这样可以避免：

- 亚洲指数先进入下一自然日
- 把复盘日期错误推进到下一天

### 7.3 修复复盘价格查询逻辑

当前：

```sql
SELECT ...
FROM stock_raw
WHERE k_date = ?
```

建议改为“每个 symbol 取最近一条”：

```sql
SELECT p.symbol, p.stock_name, p.current_price, p.change_percent, p.volume, p.k_date
FROM stock_raw p
JOIN (
  SELECT symbol, MAX(k_date) AS latest_k_date
  FROM stock_raw
  WHERE k_date <= ?
  GROUP BY symbol
) latest
  ON latest.symbol = p.symbol
 AND latest.latest_k_date = p.k_date
ORDER BY p.symbol
```

这样：

- `archive_date = 2026-03-17` 时
  - 美股个股/板块取到 `2026-03-17`
  - 亚洲指数若最近也是 `2026-03-17`，取 `2026-03-17`
- `archive_date = 2026-03-18` 时
  - 如果业务上仍允许出现 `2026-03-18`
  - 也至少不会丢掉 `2026-03-17` 的美股个股/板块

但更推荐的还是：

- 先把 `archive_date` 修正成正确的 NYSE 收盘日

### 7.4 修复新闻 summary / 复盘初始化日期逻辑

当前：

- `run_news_pipeline()` 用 `get_current_review_trading_day()`

建议：

- 对 `persist_summary=True` 的场景
  - 改为使用 **最近已收盘 NYSE 交易日**
- 对小时新闻采集
  - 可以保留“当前活跃交易日”的概念用于原始新闻归档
  - 但 `daily_news_ai_analysis` 和 `daily_review_archive` 不应提前推进

也就是说：

- `hourly-news`：可以采当前新闻
- `close-summary` / `full`：应只落到最近一个**已收盘**复盘日

---

## 8. 推荐实现顺序

### 第一阶段：修正复盘页价格显示

优先改：

- `/Users/didi/Project/MyFinancialAgent/cloudflare/worker/src/index.js`

把：

- `WHERE k_date = archiveDate`

改成：

- 每个 symbol 取 `k_date <= archiveDate` 的最近记录

这样用户立刻能在复盘页看到个股和板块价格

### 第二阶段：修正复盘日期来源

改：

- `/Users/didi/Project/MyFinancialAgent/cloudflare/worker/src/index.js`
- `/Users/didi/Project/MyFinancialAgent/src/collect_news_v3.py`

统一为：

- 最近一个已收盘 NYSE 交易日

### 第三阶段：补测试

必须新增或更新的测试场景：

1. **北京时间上午复盘**
   - 应命中前一个 NYSE 收盘日

2. **跨市场价格混合**
   - `stock_raw` 中同时存在：
     - 美股个股 `k_date=2026-03-17`
     - 亚洲指数 `k_date=2026-03-18`
   - 复盘页仍应展示个股/板块

3. **复盘列表日期生成**
   - 不能仅由 `MAX(stock_raw.k_date)` 决定

4. **新闻 summary 与 archive 初始化**
   - 不得把未收盘 NYSE 当天提前生成复盘

---

## 9. 预期结果

修复后：

- 用户在 **北京时间 2026-03-18 上午**
- 看到的应是：
  - `2026-03-17 · 美股交易日`
- 打开复盘时：
  - 大盘有数据
  - 板块有数据
  - 个股有数据

而不是像当前这样：

- 复盘日期偏到 `2026-03-18`
- 只剩下一部分 `2026-03-18` 的大盘 / 商品 / 汇率
- 美股个股和美股板块全部消失

---

## 10. 最终结论

这是一个**跨市场日期语义设计 bug**，不是单点 SQL 查询 bug。

根因有三层：

1. 复盘日期被错误地用“全市场最大价格日期”近似
2. 价格查询错误地使用 `k_date = archive_date`
3. 新闻 summary / 复盘初始化在“未收盘 NYSE 当天”也可能提前建档

正确修法不是只补一个前端兜底，而是统一：

- **复盘日 = 最近已收盘 NYSE 交易日**
- **价格 = 每个标的在该复盘日前的最近一条**

这才符合你的真实复盘习惯和当前系统的跨市场资产结构。
