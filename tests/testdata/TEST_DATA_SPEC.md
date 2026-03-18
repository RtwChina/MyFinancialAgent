# MyFinancialAgent 测试数据规范

最后更新：2026-03-18

## 1. 目标

当前测试数据要同时支撑两类场景：

- 本地冒烟：快速、稳定地验证当前 schema、本地 Worker、本地 UI
- 测试环境集成：在清空业务数据后，重建可验证的历史基线，再补当天真实链路

因此当前项目保留三层测试数据：

1. 历史源 seed（原始历史样本来源）
2. 当前 schema 兼容 seed（可直接导入 D1/SQLite）
3. replay fixture（用于任务入口历史回放）

## 2. 文件分层

### 2.1 历史源 seed

- 主文件：`/Users/didi/Project/MyFinancialAgent/tests/testdata/test_week_seed_20260315.sql`
- 作用：保存一周级历史价格、新闻、AI 总结、复盘草稿来源
- 特点：允许保留旧字段和旧 code，不直接导入当前 schema

### 2.2 当前 schema 兼容 seed

- 生成脚本：`/Users/didi/Project/MyFinancialAgent/tests/testdata/prepare_history_seed.py`
- 默认输出：`/Users/didi/Project/MyFinancialAgent/tests/testdata/_generated_history_seed.sql`
- 作用：
  - 本地冒烟前导入本地 D1
  - 测试环境集成时导入远端测试 D1 历史基线
- 当前导入范围：
  - `stock_raw`
  - `news_raw_data`
  - `daily_news_ai_analysis`
  - `daily_review_archive`
- 不包含：
  - `tracked_symbols`（由 migration 007 初始化）
  - `daily_review_archive_news`（由完成复盘时实时归档生成）

### 2.3 replay fixture

- 生成脚本：`/Users/didi/Project/MyFinancialAgent/tests/testdata/build_replay_fixtures.py`
- 输出目录：`/Users/didi/Project/MyFinancialAgent/tests/testdata/replay/`
- 作用：
  - 本地冒烟验证 `DATA_MODE=replay`
  - 历史任务入口回放验证
- 当前约束：
  - 价格 fixture 必须使用当前 system symbol
  - 新闻 fixture 必须覆盖 `index / sector / stock`
  - 新闻 fixture 不只保留高价值新闻，也要保留噪音与边缘样本，便于验证初筛逻辑

## 3. 当前覆盖要求

### 3.1 价格层

测试数据必须覆盖（当前历史 seed 实际覆盖 17 个标的）：

- 大盘 / 指数：`GSPC`、`NDX`、`DJI`、`VIX`、`HSI`、`SSE`、`DXY`、`GOLD`
- 板块 / ETF：`XLK`、`SOXX`、`XLE`、`XLF`、`XLY`
- 个股：`MU`、`LITE`、`MSFT`、`GOOGL`

每类至少 1 个标的有连续多日价格记录（5 个交易日），保证复盘页价格三分组可测。

### 3.2 新闻层

测试数据必须覆盖：

- 大盘新闻（index）
- 板块新闻（sector）
- 个股新闻（stock）
- 高价值新闻（`importance_stars >= 3`）
- 低价值或噪音新闻（`importance_stars < 3`）
- 能触发 `daily_news_ai_analysis` 的窗口内样本

`source` 字段约束：

- 必须为合法值：`sina` / `cls_cn` / `jin10` / `yahoo_finance`
- 不允许使用 `demo_slot_XX` 或其他非规范占位符
- 合法值要有一定分布，避免全部来自同一来源（影响来源筛选功能覆盖）

### 3.3 复盘层

测试数据必须覆盖：

- `initialized` 历史日期，便于验证开始复盘
- 至少一个可被完成复盘并写出 `daily_review_archive_news` 的日期
- AI 日总结三段字段：
  - `daily_major_events`
  - `sector_impact_map`
  - `linkage_logic_chain`
- `daily_news_ai_analysis.source_news_ids` 必须有真实 news ID（非空数组 `[]`），确保 bootstrap 第一路径（精确加载）可被测试覆盖

## 4. 当前生成与导入流程

### 4.1 本地冒烟数据

1. 用 `prepare_history_seed.py` 生成 `_generated_history_seed.sql`
2. 本地 D1 执行 migration
3. 清空业务表
4. 导入 `_generated_history_seed.sql`

### 4.2 测试环境集成数据

1. 测试环境清空业务表（保留 `tracked_symbols`）
2. 用 `prepare_history_seed.py` 生成 `_generated_history_seed.sql`
3. 将 `_generated_history_seed.sql` 导入测试环境 D1，恢复历史基线
4. 再执行当天真实 `hourly-news / close-summary`
5. 再验证复盘保存、完成、已复盘编辑保存、归档快照

## 5. 当前清库范围

默认清空以下业务表：

- `stock_raw`
- `news_raw_data`
- `daily_news_ai_analysis`
- `daily_review_archive`
- `daily_review_archive_news`

默认不清空：

- `tracked_symbols`

原因：

- `tracked_symbols` 是当前系统权威标的配置
- 由 migration 和标的管理页共同维护，不属于每轮测试的临时业务数据

## 6. 调整原则

后续如果 PRD、分类规则或复盘结构再变，测试数据调整优先级如下：

1. 先更新 `tracked_symbols` 基线和 symbol 映射
2. 再更新历史源 seed 的新闻类型与 symbol
3. 再重新生成当前 schema seed
4. 最后重新生成 replay fixture

不要直接手改 `_generated_history_seed.sql` 或 replay 输出结果，应优先改：

- 历史源 seed
- `prepare_history_seed.py`
- `build_replay_fixtures.py`
