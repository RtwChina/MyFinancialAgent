# 代码迭代日志

## 迭代目标
优化股票数据采集系统，解决 LLM 超时问题，添加数据库写入逻辑。

---

## 迭代 1: 需求分析与规划

### 优化点
- 分析了现有代码结构
- 识别出以下问题：
  1. `schema.sql` 缺少唯一约束（去重）
  2. `collect_news_v2.py` LLM 超时处理不足、无数据库写入
  3. `collect_prices.py` 无数据库写入、无去重逻辑
  4. `main.py` 引用了不存在的模块

### 缺点
- 尚未开始实际编码

---

## 迭代 2: 代码修改

### 优化点
1. **schema.sql**
   - 添加 `UNIQUE(k_date, symbol)` 约束实现价格去重
   - 添加 `news_hash` 字段和 `UNIQUE(news_hash)` 约束实现新闻去重
   - 添加 `title` 和 `url` 字段到新闻表

2. **db_utils.py** (新文件)
   - 封装数据库操作
   - 支持本地 SQLite 和 Cloudflare D1
   - 提供 `insert_price_data`, `insert_news_data` 等方法
   - 自动生成 `news_hash` 用于去重

3. **collect_prices.py**
   - 添加数据库写入功能
   - 调用 `batch_insert_prices` 实现自动去重

4. **collect_news_v3.py** (新文件，替代 v2)
   - **LLM 超时优化**:
     - `LLM_TIMEOUT` 可配置（默认 120 秒）
     - `LLM_MAX_RETRIES` 重试机制（默认 2 次）
     - `SKIP_LLM` 开关跳过 LLM 分析
     - 降低并发数 `LLM_MAX_WORKERS=2`
   - **降级策略**: LLM 失败时使用规则生成摘要
   - 添加数据库写入功能
   - 减少 `max_tokens` 从 2000 到 1500

5. **main.py**
   - 修复引用错误：`collect_news` → `collect_news_v3`
   - 修复返回值解包错误

### 缺点
- 尚未运行验证

---

## 迭代 3: 夏令时问题修复

### 问题
运行价格采集时遇到夏令时错误：
```
2026-03-08 02:16:06 is a nonexistent time due to daylight savings time
```

### 优化点
- 将 `ticker.history(start=start_date, end=end_date)` 改为 `ticker.history(period='1wk')`
- 避免 datetime 时区转换问题

### 验证结果
- ✅ 价格采集成功，10 个标的全部获取
- ✅ 数据库写入成功，去重正常

---

## 迭代 4: 新闻采集验证

### 优化点
- 清理未使用的导入
- 删除旧文件 `collect_news_v2.py`, `crawl_jin10.py`, `crawl_multi_source.py`

### 验证结果
- ✅ 新闻采集成功（Yahoo 财经 14 条）
- ✅ LLM 分析成功（耗时 49 秒，在 120 秒超时内）
- ✅ 数据库去重正常
- ✅ main.py 整体流程成功

---

## 最终文件结构

```
MyFinancialAgent/
├── .env                    # 环境变量
├── .env.example            # 环境变量示例
├── .gitignore
├── config.py               # 配置文件
├── db_utils.py             # 数据库工具（新增）
├── logger_utils.py         # 日志工具
├── main.py                 # 主入口（已修复）
├── collect_prices.py       # 价格采集（已优化）
├── collect_news_v3.py      # 新闻采集 v3（新增）
├── schema.sql              # 数据库结构（已优化）
├── requirements.txt
├── output/                 # 输出目录
│   ├── financial_data.db   # SQLite 数据库
│   └── *.xlsx              # Excel 文件
└── logs/                   # 日志目录
```

---

## 环境变量配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LLM_TIMEOUT` | 120 | LLM API 超时时间(秒) |
| `LLM_MAX_RETRIES` | 2 | 最大重试次数 |
| `LLM_MAX_WORKERS` | 2 | 并发数 |
| `SKIP_LLM` | false | 跳过 LLM 分析 |

---

## 待优化项

1. ~~中国新闻源（新浪、财联社、金十）时间范围内返回 0 条，可能是时间范围计算问题~~ **已修复**
2. 可考虑添加更多新闻源
3. GitHub Actions 工作流文件尚未创建

---

## 迭代 5: 修复新闻采集逻辑

### 问题
用户指出：新闻采集不应该有时间范围筛选，数据持续积累，只有在复盘时才根据时间范围查询。

### 优化点
1. 移除 `get_last_2_trading_days()` 函数调用
2. 修改所有数据源函数，不再接收时间范围参数
3. 所有新闻直接采集，不做时间筛选
4. 复盘时通过 `get_news_by_date_range()` 查询

### 验证结果
- ✅ 新浪财经: 50 条
- ✅ 金十数据: 29 条
- ✅ 财联社: 20 条
- ✅ Yahoo财经: 14 条
- ✅ 合计: 113 条（之前只有 14 条）

### 新闻时间分布
```
2026-03-15 | jin10      | 29 条
2026-03-15 | cls_cn     | 10 条
2026-03-15 | sina       | 3 条
2026-03-14 | sina       | 47 条
2026-03-14 | cls_cn     | 10 条
2026-03-14 | yahoo      | 9 条
2026-03-13 | yahoo      | 1 条
```

---

## 迭代 6: 修复 VIX 涨跌幅和优化 LLM 分析

### 问题
1. VIX 涨跌幅计算错误：使用的是当日 (Close - Open) / Open，应该用相比前一日收盘价的变化
2. LLM 分析没有筛选出重要新闻，只是做总结

### 优化点
1. **涨跌幅修正**：
   - 之前：(Close - Open) / Open * 100
   - 现在：(今日Close - 昨日Close) / 昨日Close * 100
   - VIX 涨跌幅从 -2.37% 修正为 -0.37%

2. **LLM 分析优化**：
   - 增加任务：筛选全球重大新闻
   - 增加任务：筛选股票市场重大新闻
   - 输出格式更清晰

### 验证结果
- ✅ VIX 涨跌幅修正：-0.37%（与 Yahoo API 一致）
- ✅ LLM 筛选出全球重大新闻（战争、地缘政治）
- ✅ LLM 筛选出股票市场重大新闻（美股走势、财报）
- ✅ LLM 分析耗时 50 秒（在 120s 超时内）