# MyFinancialAgent 冒烟测试规范

最后更新：2026-05-09（link-action-plans-to-tracked-symbols 新增 SMK-012/013）

## 1. 定位

- 冒烟测试用于快速确认当前代码、当前 schema、本地 Worker 和本地 UI 仍可运行。
- 冒烟测试强调稳定和快速，不默认依赖真实第三方接口。
- 当前冒烟测试以“本地 D1 + 当前 schema 兼容 seed + 本地 Worker + Playwright UI”作为基线。

## 2. 当前主链路范围

- CLI 入口：`full` / `hourly-news` / `close-summary`
- 时间抽象：`runtime/clock.py`
- 数据源抽象：
  - `data_sources/news_router.py`
  - `data_sources/price_router.py`
- 当前核心数据结构：
  - `stock_raw`
  - `news_raw_data`
  - `daily_news_ai_analysis`
  - `daily_review_archive`
  - `daily_review_archive_news`
  - `tracked_symbols`
- 当前关键前端模块：
  - 新闻检索页
  - 复盘列表
  - 当日复盘抽屉
  - 标的管理页

## 3. 当前测试数据基线

- 历史源 seed：`/Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/test_week_seed_20260315.sql`
- 当前 schema 兼容 seed：`/Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/_generated_history_seed.sql`
- replay fixture：`/Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/replay/`
- 详细说明：`/Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/TEST_DATA_SPEC.md`

当前约束：

- 本地冒烟前必须重新生成 `_generated_history_seed.sql`
- 本地 D1 必须先执行 migration，再清空业务表并导入 seed
- `tracked_symbols` 由 migration 初始化，不通过 seed 重建

## 4. 推荐执行顺序

1. 生成当前 schema 兼容 seed
2. 本地 D1 migration
3. 清空并导入本地 D1 测试数据
4. `SMK-001` CLI 帮助
5. `SMK-002` replay 价格采集
6. `SMK-003` replay 新闻采集
7. `SMK-004` schema 与核心表校验
8. `SMK-005` 本地 Worker 健康检查
9. `SMK-006` 新闻页与复盘入口 UI 冒烟
10. `SMK-007` 复盘抽屉分析区与价格区 UI 冒烟
11. `SMK-008` 标的管理 UI 冒烟
12. `SMK-009` 已复盘重新编辑并保存 UI 冒烟
13. `SMK-010` 复盘候选日来自 ^GSPC（不受跨市场日期影响）
14. `SMK-011` 跨市场日期混合时美股个股价格仍展示
15. `SMK-012` 操作计划标的来自标的管理
16. `SMK-013` 操作计划弹窗展示价格指标

## 5. 准备命令

### 5.1 生成当前 schema 兼容 seed

```bash
.venv/bin/python tests/cases/fixtures/prepare_history_seed.py \
  tests/cases/fixtures/test_week_seed_20260315.sql \
  tests/cases/fixtures/_generated_history_seed.sql
```

### 5.2 生成 replay fixture

```bash
.venv/bin/python tests/cases/fixtures/build_replay_fixtures.py \
  --source tests/cases/fixtures/test_week_seed_20260315.sql \
  --output tests/cases/fixtures/replay
```

### 5.3 本地 D1 migration

```bash
npx wrangler d1 migrations apply my-financial-agent-test \
  --local \
  --config tests/cases/config/wrangler.test.toml
```

### 5.4 清空并导入本地 D1 数据

```bash
npx wrangler d1 execute my-financial-agent-test \
  --local \
  --config tests/cases/config/wrangler.test.toml \
  --command "DELETE FROM stock_raw; DELETE FROM news_raw_data; DELETE FROM daily_news_ai_analysis; DELETE FROM daily_review_archive; DELETE FROM daily_review_archive_news;"

npx wrangler d1 execute my-financial-agent-test \
  --local \
  --config tests/cases/config/wrangler.test.toml \
  --file tests/cases/fixtures/_generated_history_seed.sql
```

### 5.5 本地 Worker

```bash
npx wrangler dev --config tests/cases/config/wrangler.test.toml --port 8787
```

## 6. 用例清单

### `SMK-001` CLI 入口正常

- 执行命令：`.venv/bin/python main.py --help`
- 预期结果：
  - 输出 `full / hourly-news / close-summary`
  - 无导入异常
- 阻断级别：阻断

### `SMK-002` replay 价格采集可运行

- 执行命令：

```bash
APP_ENV=test TEST_MODE=integration_weekly DATA_MODE=replay \
FAKE_NOW=2026-03-13T21:30:00-04:00 \
REPLAY_ROOT=tests/cases/fixtures/replay \
.venv/bin/python -c "from collect_prices import collect_all_prices; from runtime.context import build_execution_context; ctx=build_execution_context(); df=collect_all_prices(ctx); print(df[['symbol','current_price']].head().to_string(index=False)); print('rows=', len(df))"
```

- 预期结果：
  - 返回 DataFrame
  - 至少包含 `symbol`、`current_price`
  - symbol 为当前 system symbol（如 `GSPC`、`VIX`、`DXY`）
- 阻断级别：阻断

### `SMK-003` replay 新闻采集可运行

- 执行命令：

```bash
APP_ENV=test TEST_MODE=integration_weekly DATA_MODE=replay \
FAKE_NOW=2026-03-13T15:00:00-04:00 \
REPLAY_ROOT=tests/cases/fixtures/replay SKIP_LLM=true \
.venv/bin/python -c "from collect_news_v3 import run_news_pipeline; from runtime.context import build_execution_context; ctx=build_execution_context(); result=run_news_pipeline(collect_fresh_news=True, persist_summary=False, context=ctx); print(result)"
```

- 预期结果：
  - 返回结果包含 `news_count`、`inserted_count` 等关键字段
  - replay 新闻包含 `index / sector / stock` 与噪音样本，不依赖真实 HTTP 也能完成
- 阻断级别：阻断

### `SMK-004` 当前 schema 与代码一致

- 执行命令：

```bash
.venv/bin/python -c "from db_utils import rebuild_database, get_db_connection; rebuild_database(); conn=get_db_connection(); cur=conn.cursor();
for table in ('daily_review_archive','daily_news_ai_analysis','daily_review_archive_news','tracked_symbols'):
    cur.execute(f'PRAGMA table_info({table})'); print(table, [r[1] for r in cur.fetchall()]);
conn.close()"
```

- 预期结果：
  - `daily_review_archive` 包含 `reviewer_news_notes`
  - `daily_news_ai_analysis` 包含 `source_news_ids`
  - `daily_review_archive_news` 存在
  - `tracked_symbols` 存在
- 阻断级别：阻断

### `SMK-005` 本地 Worker 健康检查

- 验证命令：`curl -sS http://127.0.0.1:8787/api/health`
- 预期结果：
  - 返回 `ok=true`
  - 返回 `env=test`
- 阻断级别：阻断

### `SMK-006` 新闻页与复盘入口 UI 可用

- 执行命令：

```bash
npx playwright test tests/cases/smoke/news_and_deleted_ui.spec.js --reporter=line
```

- 当前校验点：
  - 新闻页默认 `type=""`
  - 新闻页默认 `starsMin=3`
  - 新闻列表首行可打开详情弹窗
  - 复盘列表可进入某个 `initialized` 日期的抽屉
  - 抽屉中 `reviewerNewsNotes` 可编辑
- 阻断级别：阻断

### `SMK-007` 复盘抽屉分析区与价格区可用

- 执行命令：

```bash
npx playwright test tests/cases/smoke/review_ui_check.spec.js --reporter=line
```

- 当前校验点：
  - 复盘抽屉可打开
  - “当日价格”区存在分组折叠
  - AI 分析区包含：
    - `每日新闻总结`
    - `市场影响`
    - `逻辑链`
  - 新闻区 `查看新闻` 会复用新闻详情弹窗
- 阻断级别：阻断

### `SMK-008` 标的管理页可完成临时增改隐藏

- 执行命令：

```bash
npx playwright test tests/cases/smoke/symbol_manager_ui.spec.js --reporter=line
```

- 当前校验点：
  - 可切换到 `标的管理`
  - 可看到 `大盘 / 指数`、`板块 / ETF`、`个股` 三段
  - 手动添加临时标的成功
  - 隐藏临时标的成功
- 阻断级别：阻断

### `SMK-009` 已复盘可重新编辑并保存

- 执行命令：

```bash
npx playwright test tests/cases/smoke/review_edit_cycle.spec.js --reporter=line
```

- 当前校验点：
  - 可完成一轮本地复盘
  - 已复盘记录可重新打开
  - 点击 `编辑` 后进入可编辑状态
  - 点击 `保存` 后会更新当前数据并回到只读查看态
- 阻断级别：阻断

### `SMK-010` 复盘候选日来自 GSPC（不受跨市场日期影响）

- 前提：本地 D1 已导入 seed，本地 Worker 已启动
- 验证命令：

```bash
# 注入未来日期行（HSI 2099-12-31），再查复盘列表
npx wrangler d1 execute my-financial-agent-test \
  --local --config tests/cases/config/wrangler.test.toml \
  --command "INSERT OR IGNORE INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at) VALUES ('2099-12-31', '恒生指数', 'HSI', '^HSI', 99999.0, 0.0, 0, datetime('now'));"

curl -sS http://127.0.0.1:8787/api/reviews | python3 -c "import sys,json; r=json.load(sys.stdin); d=r.get('latestClosedDate'); print('latestClosedDate:', d); assert d != '2099-12-31', 'BUG: latestClosedDate 受跨市场日期影响！'; print('PASS')"

# 清理注入行
npx wrangler d1 execute my-financial-agent-test \
  --local --config tests/cases/config/wrangler.test.toml \
  --command "DELETE FROM stock_raw WHERE k_date='2099-12-31' AND symbol='HSI';"
```

- 预期结果：
  - `latestClosedDate` 不等于 `2099-12-31`
  - 来自 `GSPC` 的最大 `k_date`（即 seed 中的最近日期）
- 阻断级别：阻断（主链路修复核心验证）

### `SMK-012` 操作计划标的来自标的管理

- 执行命令：

```bash
npx playwright test tests/smoke/review_edit_cycle.spec.js --grep "managed symbols" --reporter=line
```

- 当前校验点：
  - 操作计划新增时出现标的选择器，而不是自由文本输入
  - 选择器从启用的 `tracked_symbols` 加载显示名称和系统代码
  - 美股/大A 分组由点击的添加按钮或详情弹窗市场字段决定
  - 保存草稿后，`bootstrap.actionPlans[].symbol` 只包含系统代码
  - 非 `tracked_symbols.symbol` 的操作计划保存请求返回错误
- 阻断级别：阻断

### `SMK-013` 操作计划弹窗展示价格指标

- 执行命令：

```bash
npx playwright test tests/smoke/review_edit_cycle.spec.js --grep "price metrics" --reporter=line
```

- 当前校验点：
  - 弹窗顶部展示当前最近价格、复盘日涨幅、近一周涨幅、近一月涨幅
  - 当前最近价格取 `stock_raw.k_date <= archive_date` 的最近记录
  - 近一周/近一月使用目标日期之前的最近可用基准价计算
  - 缺少价格历史时指标显示 `暂无`
  - 指标缺失不阻塞非价格字段保存
- 阻断级别：阻断

### `SMK-011` 跨市场日期混合时美股个股价格仍展示

- 前提：本地 D1 已导入 seed，本地 Worker 已启动，seed 中最后一个日期为 `$LAST_SEED_DATE`（如 `2026-03-13`）
- 验证命令：

```bash
LAST_SEED_DATE=2026-03-13
NEXT_DAY=2026-03-14

# 注入 HSI 在 NEXT_DAY 的行
npx wrangler d1 execute my-financial-agent-test \
  --local --config tests/cases/config/wrangler.test.toml \
  --command "INSERT OR IGNORE INTO stock_raw (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at) VALUES ('$NEXT_DAY', '恒生指数', 'HSI', '^HSI', 20000.0, 0.5, 100000, datetime('now'));"

# 查询 archive_date=LAST_SEED_DATE 的 bootstrap，期望含美股个股
curl -sS "http://127.0.0.1:8787/api/reviews/$LAST_SEED_DATE/bootstrap" | python3 -c "
import sys, json
r = json.load(sys.stdin)
prices = r.get('prices') or {}
stocks = prices.get('stock') or []
print('stock price count:', len(stocks))
assert len(stocks) > 0, 'BUG: 跨市场日期混合时美股个股价格丢失！'
print('stock symbols:', [s['symbol'] for s in stocks])
print('PASS')
"

# 清理注入行
npx wrangler d1 execute my-financial-agent-test \
  --local --config tests/cases/config/wrangler.test.toml \
  --command "DELETE FROM stock_raw WHERE k_date='$NEXT_DAY' AND symbol='HSI';"
```

- 预期结果：
  - `prices.usStock` / `prices.cnStock` / `prices.sector` / `prices.index` 按市场与类型分组；兼容字段 `prices.stock` 包含全部个股。
- 阻断级别：阻断（主链路修复核心验证）

## 7. 冒烟结果汇报要求

- 执行环境
- 使用的 seed 与 replay fixture 来源
- 执行到的用例范围
- 通过 / 失败 / 未执行
- 阻断项
- 若失败，必须区分：
  - 当前代码问题
  - 本地测试数据问题
  - 本地 Worker / D1 配置问题
