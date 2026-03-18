# 项目缓存

最后更新: 2026-03-18
工作区: `/Users/didi/Project/MyFinancialAgent`

## 项目一句话
这是一个“股票自动化复盘系统”，包含 Python 采集端、Cloudflare Worker API、Cloudflare Web 前端、测试环境与成体系的冒烟/集成测试资产。

## 当前目录结构

### 核心代码
- `main.py`: 主入口，执行 `full / hourly-news / close-summary`（保留根目录，添加了 src/ sys.path）。
- `src/collect_prices.py`: 价格采集与写入。
- `src/collect_news_v3.py`: 新闻采集、动态规则初筛、LLM 精筛、日总结生成。
- `src/symbol_registry.py`: 当前标的主数据与远端 `tracked_symbols` 读取。
- `src/db_utils.py`: SQLite 建表、批量写入、复盘归档等工具。
- `src/data_sources/`: 价格/新闻数据源路由与适配器。
- `src/runtime/`: 运行时上下文管理。
- `cloudflare/worker/src/index.js`: Worker API，含 ingest、reviews、symbols。
- `cloudflare/web/`: 前端页面与交互逻辑。

### 数据与配置
- `schema.sql`: SQLite / Cloudflare D1 兼容表结构，当前核心表包括：
  - `stock_raw`
  - `news_raw_data`
  - `daily_news_ai_analysis`
  - `daily_review_archive`
  - `daily_review_archive_news`
  - `tracked_symbols`
- `.env`: 本地运行环境变量。
- `.env.example`: 环境变量示例。
- `requirements.txt`: Python 依赖。

### 测试与辅助
- `tests/standards/TESTING_STANDARD.md`: 项目测试总规范。
- `tests/smoke/SMOKE_TEST_SPEC.md`: 当前冒烟规范。
- `tests/integration/INTEGRATION_TEST_SPEC.md`: 当前集成规范。
- `tests/testdata/TEST_DATA_SPEC.md`: 当前测试数据规范。
- `tests/testdata/test_week_seed_20260315.sql`: 历史源 seed。
- `tests/testdata/_generated_history_seed.sql`: 当前 schema 兼容 seed。
- `tests/integration/run_weekly_integration.py`: 当前测试环境集成测试主脚本。
- `tests/runs/`: 运行报告目录。
- `docs/arch/`: 架构设计文档。
- `docs/api/`: API 规格文档。
- `docs/rfcs/`: 需求与技术决策记录。

## 我当前对系统的理解

### 主流程
1. `main.py full`
   - 执行价格采集
   - 执行新闻采集
   - 生成 `daily_news_ai_analysis`
   - 初始化或更新 `daily_review_archive`
2. `main.py hourly-news`
   - 仅执行新闻采集与入库
3. `main.py close-summary`
   - 执行收盘口径价格/新闻总结更新

### 数据层设计
- 本地开发默认使用 `output/financial_data.db`
- `stock_raw` 用 `(k_date, symbol)` 做日级快照去重
- `news_raw_data` 用 `news_hash` 去重
- `daily_news_ai_analysis` 保存每日 AI 总结与 `source_news_ids`
- `daily_review_archive` 保存复盘草稿/已复盘内容
- `daily_review_archive_news` 保存完成复盘后的新闻归档快照
- `tracked_symbols` 保存大盘 / 板块 / 个股主数据

### 当前关注的业务对象
- 个股、板块、大盘三类标的都已纳入系统
- 当前前端与 API 已支持标的管理页和按类型分组展示

## 当前阶段
- 当前阶段：测试体系重整完成，已完成一轮“当前实现对齐”的冒烟 + 集成全量执行。
- 当前关键结果：
  - 冒烟 9/9 通过
  - 集成 `INT-001 ~ INT-009` 全部通过
  - 测试环境已完成清库、历史基线导入、symbol CRUD、复盘闭环、真实 `hourly-news / close-summary` 验证

## 当前测试结论
- 冒烟报告：`tests/runs/SMOKE_TEST_REPORT_20260318_095716.md`
- 集成报告：`tests/runs/INTEGRATION_TEST_REPORT_20260318_095024.md`
- 集成最终快照（上轮，seed 整改前）：
  - `stock_raw = 90`
  - `news_raw_data = 118`
  - `daily_news_ai_analysis = 5`
  - `daily_review_archive = 6`
  - `daily_review_archive_news = 15`

## 暂时记录的风险/备注
- 当前测试 token 仍依赖测试环境 secret / 既有约定，后续最好统一到项目级测试环境配置文档。
- `DX-Y.NYB` 这类第三方行情源稳定性仍值得持续观察，但本轮未阻断测试。

## 2026-03-18 测试环境 seed 整改（当前状态）

seed 整改完成，测试环境已清库重导入：

- `test_week_seed_20260315.sql` source 字段：`demo_slot_XX` → 规范值（`sina/cls_cn/jin10/yahoo_finance`）
- 历史 stock_raw 覆盖标的由 10 个扩展到 17 个（新增 NDX/DJI/XLK/SOXX/XLE/XLF/XLY）
- `prepare_history_seed.py` 新增 `compute_news_window` 并修复 fallback 逻辑（与 Worker 对齐）
- 每日 `daily_news_ai_analysis.source_news_ids` 现在用后置 UPDATE 填充真实 news ID
- `tracked_symbols.IYR`（美国REIT板块）is_active 已恢复为 1，sector = 15

测试环境历史基线快照（seed 导入后，不含当天真实任务）：
- `stock_raw = 85`（5日 × 17标的）
- `news_raw_data = 112`
- `daily_news_ai_analysis = 5`（source_news_ids 均已填充真实 ID）
- `daily_review_archive = 5`
- `daily_review_archive_news = 0`（由复盘完成时生成）
- `tracked_symbols` = index:21 + sector:15 + stock:4 = 40 active

## 2026-03-18 tracked_symbols 默认值刷新补充
- 已新增两份标的补充文档：
  - `docs/arch/TRACKED_SYMBOLS_CODE_VALIDATION_20260318.md`
  - `tests/testdata/TRACKED_SYMBOLS_SEED_DRAFT_20260318.sql`
- 已将新的默认 index / sector 标的同步到：
  - `cloudflare/migrations/007_tracked_symbols.sql`
  - `src/symbol_registry.py`
- 当前默认标的口径：
  - index：`21`
  - sector：`15`
  - stock：`4`
- 特殊 code 处理：
  - 黄金 -> `GC=F`
  - 白银 -> `SI=F`
  - 恒生科技 -> `3067.HK`（ETF 代理）
- 本地与测试环境都已完成：
  - `tracked_symbols` 刷新
  - 业务表清库
  - 重新导入 `_generated_history_seed.sql`
  - 重新生成 replay fixtures
- 新一轮验证结果：
  - 本地冒烟报告：`tests/runs/SMOKE_TEST_REPORT_20260318_tracked_symbols_refresh.md`
  - 测试环境集成报告：`tests/runs/INTEGRATION_TEST_REPORT_20260318_111429.md`
- 最新集成快照：
  - `stock_raw = 90`
  - `news_raw_data = 118`
  - `daily_news_ai_analysis = 5`
  - `daily_review_archive = 6`
  - `daily_review_archive_news = 15`
  - 各类重复组检查仍为 `0`
