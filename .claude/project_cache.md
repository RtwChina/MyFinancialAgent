# 项目缓存

最后更新: 2026-03-15
工作区: `/Users/rtw/Project/PythonProject/MyFinancialAgent`

## 项目一句话
这是一个“股票数据自动化复盘系统”的数据采集端，负责抓取价格与新闻、写入 SQLite、本地导出 Excel，为后续复盘分析提供原始数据和新闻摘要。

## 当前目录结构

### 核心代码
- `main.py`: 主入口，顺序执行价格采集和新闻采集，并输出结果摘要。
- `collect_prices.py`: 通过 `yfinance` 拉取股票/指数/大宗商品最近交易日价格，计算涨跌幅，写库并导出 Excel。
- `collect_news_v3.py`: 抓取多源财经新闻，执行 LLM 摘要/筛选逻辑，写库并导出 Excel。
- `db_utils.py`: SQLite 连接、建表、批量写入、去重、查询、复盘归档等数据库工具。
- `config.py`: 环境变量加载、模型参数、API 参数、标的列表、日志和输出目录配置。
- `logger_utils.py`: 统一日志初始化，输出到 `logs/collector.log` 和控制台。

### 数据与配置
- `schema.sql`: SQLite / Cloudflare D1 兼容表结构，包含价格表、新闻表、复盘表、新闻分析表及索引。
- `.env`: 本地运行环境变量。
- `.env.example`: 环境变量示例。
- `requirements.txt`: Python 依赖。

### 输出与辅助
- `output/`: Excel 与本地数据库文件输出目录。
- `logs/`: 运行日志目录。
- `.claude/iteration_log.md`: 已有的项目迭代记录，描述此前修复和优化历程。
- `项目需求文档.md`: 项目需求说明。

## 我当前对系统的理解

### 主流程
1. 运行 `main.py`
2. 先执行价格采集:
   - 读取 `config.py` 中的 `ALL_SYMBOLS`
   - 对每个标的调用 `yfinance`
   - 生成价格 DataFrame
   - 初始化数据库
   - 写入 `stock_raw`
   - 导出 `output/stock_prices_YYYYMMDD.xlsx`
3. 再执行新闻采集:
   - 从新浪财经、财联社、金十、Yahoo Finance 抓新闻
   - 汇总后交给 LLM 做新闻筛选/摘要
   - 初始化数据库
   - 写入 `stock_news_raw`，并保存新闻分析结果
   - 导出新闻 Excel

### 数据层设计
- 本地开发默认使用 `output/financial_data.db`
- `stock_raw` 用 `UNIQUE(k_date, symbol)` 防止同一标的同一交易日重复写入
- `stock_news_raw` 用 `news_hash` 去重，新闻是持续积累的，不做删除
- `news_analysis` 保存每日 LLM 输出
- `stock_archive` 预留给后续复盘归档

### 当前关注的业务对象
- 个股: `MU`, `LITE`, `MSFT`, `GOOGL`
- 指数/大宗: `^VIX`, `^HSI`, `^GSPC`, `000001.SS`, `DX-Y.NYB`, `GC=F`

## 已观察到的实现特征
- 项目以脚本式结构为主，模块边界清晰，但还不是包化项目。
- 价格采集与新闻采集都已接入数据库写入逻辑。
- 日志、Excel 输出、本地 SQLite 都已经落地，适合先在本地验证。
- `.claude/iteration_log.md` 显示这个项目近期重点在:
  - 修复数据库去重
  - 修复 `main.py` 入口引用
  - 优化新闻抓取覆盖面
  - 优化 LLM 超时、重试、降级策略
  - 修正 VIX 涨跌幅计算

## 暂时记录的风险/备注
- `config.py` 里目前存在默认 API key / base URL / model 配置，后续更适合只从环境变量读取，避免敏感信息和默认值混在代码中。
- 目录里包含 `.venv/`，说明这个工作区已经有本地虚拟环境，可直接用于运行和排查。
- 这是当前的第一版项目缓存，后续如果我们改了架构、加了命令入口或新增模块，需要同步更新本文件。
