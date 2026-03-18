# 设计方案：标的管理 + 新闻分类重构 + 复盘三段式价格分析

> 作者：Claude Opus 4.6
> 日期：2026-03-17
> 状态：设计评审中

---

## 一、核心设计理念

这三个需求本质上是 **同一件事的三个切面**：

1. 标的管理 → 建立「大盘 / 板块 / 个股」三层分类的 **唯一数据源**
2. 新闻分类 → 让新闻类型与标的层级 **自动对齐**，而不是靠独立的硬编码判断
3. 复盘价格 → 让复盘页按标的层级 **自动分组和折叠**

**设计原则：标的表是唯一权威源，新闻分类和复盘分组都从它派生，消除一切硬编码标的列表。**

当前项目中，标的信息散落在 **5 个地方**：
- `config.py` → `STOCK_SYMBOLS` + `INDEX_SYMBOLS`
- `collect_news_v3.py` → `TRACKED_SYMBOLS` + `EQUITY_TRACKED_SYMBOLS` + `MARKET_REFERENCE_SYMBOLS`
- `cloudflare/worker/src/index.js` → `TRACKED_SYMBOLS` 数组
- `cloudflare/web/app.js` → `SYMBOL_DISPLAY_LABELS`
- LLM prompt 里硬编码 → "跟踪标的包括 MU/LITE/MSFT/GOOGL/VIX/HSI/GSPC/DXY/黄金"

改造后，这 5 处全部从 `tracked_symbols` 表读取。

---

## 二、需求 1：标的管理系统

### 2.1 数据模型

```sql
CREATE TABLE IF NOT EXISTS tracked_symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,           -- 系统内唯一标识，也是 stock_raw.symbol 的关联键
    yahoo_symbol TEXT,                     -- Yahoo Finance 实际代码（为空时 = symbol）
    display_name TEXT NOT NULL,            -- 中文显示名
    display_code TEXT,                     -- 用户自定义简码（可选，如 "恐慌指数"）
    symbol_type TEXT NOT NULL              -- 'index' / 'sector' / 'stock'
        CHECK(symbol_type IN ('index', 'sector', 'stock')),
    aliases TEXT DEFAULT '[]',             -- JSON 数组，新闻匹配用的别名
    is_active INTEGER DEFAULT 1,           -- 是否启用
    sort_order INTEGER DEFAULT 0,          -- 同类型内排序
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracked_symbols_type ON tracked_symbols(symbol_type);
CREATE INDEX IF NOT EXISTS idx_tracked_symbols_active ON tracked_symbols(is_active);
```

### 2.2 symbol vs yahoo_symbol：解决代码映射问题

**核心问题**：用户输入的代码和 Yahoo Finance 的代码可能不一样。

| 用户理解 | 系统 symbol | yahoo_symbol | 说明 |
|---------|------------|-------------|------|
| 美光 | MU | MU | 一致，yahoo_symbol 可空 |
| 恐慌指数 | VIX | ^VIX | Yahoo 需要 ^ 前缀 |
| 上证指数 | SSE | 000001.SS | Yahoo 用特殊编码 |
| 美元指数 | DXY | DX-Y.NYB | Yahoo 用不同编码 |
| 黄金 | GOLD | GC=F | Yahoo 是期货合约 |
| 纳斯达克100 | NDX | ^NDX | 用户新增板块类标的 |
| 半导体ETF | SOXX | SOXX | 一致 |

**规则**：
- `symbol` 是系统内唯一标识，人类友好，用于新闻匹配和页面展示
- `yahoo_symbol` 仅在价格采集时使用，若为空则 fallback 到 `symbol`
- `stock_raw.symbol` 存的是 `tracked_symbols.symbol`（不是 yahoo_symbol），保证查询一致性
- 价格采集时：`yahoo_symbol || symbol` → 调用 yfinance → 返回数据写入 `stock_raw.symbol = symbol`

### 2.3 初始数据（Migration seed）

```sql
-- 大盘 (index)
INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, sort_order) VALUES
('GSPC', '^GSPC', '标普500', 'index', '["S&P 500","SP500","标普500","标普"]', 1),
('NDX', '^NDX', '纳斯达克100', 'index', '["Nasdaq","纳指","纳斯达克"]', 2),
('DJI', '^DJI', '道琼斯', 'index', '["Dow Jones","道指","道琼斯"]', 3),
('VIX', '^VIX', '恐慌指数', 'index', '["VIX","Volatility Index","恐慌指数"]', 4),
('HSI', '^HSI', '恒生指数', 'index', '["HSI","Hang Seng","恒指","恒生指数"]', 5),
('SSE', '000001.SS', '上证指数', 'index', '["SSE Composite","上证指数","沪指"]', 6),
('DXY', 'DX-Y.NYB', '美元指数', 'index', '["Dollar Index","DXY","美元指数"]', 7),
('GOLD', 'GC=F', '黄金', 'index', '["Gold","黄金","金价","COMEX黄金"]', 8),
('CL', 'CL=F', '原油', 'index', '["Crude Oil","原油","WTI","油价"]', 9);

-- 板块 (sector)
INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, sort_order) VALUES
('XLK', 'XLK', '科技板块', 'sector', '["Technology","科技","XLK"]', 1),
('SOXX', 'SOXX', '半导体板块', 'sector', '["Semiconductor","半导体","芯片","SOXX"]', 2),
('XLE', 'XLE', '能源板块', 'sector', '["Energy","能源","XLE"]', 3),
('XLF', 'XLF', '金融板块', 'sector', '["Financial","金融","XLF"]', 4),
('XLY', 'XLY', '可选消费', 'sector', '["Consumer Discretionary","可选消费","XLY"]', 5);

-- 个股 (stock)
INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, sort_order) VALUES
('MU', 'MU', '美光科技', 'stock', '["MU","Micron","Micron Technology","美光"]', 1),
('LITE', 'LITE', 'Lumentum', 'stock', '["LITE","Lumentum","Lumentum Holdings"]', 2),
('MSFT', 'MSFT', '微软', 'stock', '["MSFT","Microsoft","微软"]', 3),
('GOOGL', 'GOOGL', '谷歌', 'stock', '["GOOGL","Google","Alphabet","谷歌"]', 4);
```

### 2.4 LLM 智能识别：用户只需输入关键词

**核心体验**：用户不需要知道 Yahoo Finance 代码是什么，只需输入自然语言，LLM 自动补全所有字段。

#### 交互流程

```
用户输入 "美光"
       │
       ▼
┌─ LLM 智能解析 ──────────────────────────────────────┐
│  输入: "美光"                                        │
│  输出: {                                             │
│    "symbol": "MU",                                   │
│    "yahoo_symbol": "MU",                             │
│    "display_name": "美光科技",                         │
│    "symbol_type": "stock",                           │
│    "aliases": ["MU","Micron","Micron Technology","美光"],│
│    "confidence": "high",                             │
│    "reason": "美光科技 (Micron Technology)，纳斯达克上市个股" │
│  }                                                   │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌─ Yahoo 自动验价 ────────────────────────┐
│  GET yahoo_symbol="MU" 最新价格          │
│  → ✅ 最新收盘价 $95.20 (+1.3%)        │
└─────────────────────────────────────────┘
       │
       ▼
┌─ 预填表单（用户确认）─────────────────────┐
│                                          │
│  标的代码    [ MU          ]  ← LLM 填   │
│  Yahoo代码   [ MU          ]  ← LLM 填   │
│  显示名称    [ 美光科技     ]  ← LLM 填   │
│  标的类型    [ 个股 ▾      ]  ← LLM 填   │
│  别名        [ MU,Micron,美光 ] ← LLM填  │
│                                          │
│  ✅ Yahoo 验证通过：$95.20 (+1.3%)       │
│                                          │
│          [ 取消 ]    [ 确认添加 ]          │
└──────────────────────────────────────────┘
```

**更多输入示例**：

| 用户输入 | LLM 识别结果 | 说明 |
|---------|-------------|------|
| `美光` | symbol=MU, type=stock, yahoo=MU | 中文公司名 → 个股 |
| `SOXX` | symbol=SOXX, type=sector, yahoo=SOXX | ETF 代码 → 板块 |
| `半导体ETF` | symbol=SOXX, type=sector, yahoo=SOXX | 自然语言描述 → 板块 |
| `恐慌指数` | symbol=VIX, type=index, yahoo=^VIX | 中文名 → 大盘，自动加 ^ |
| `纳斯达克` | symbol=NDX, type=index, yahoo=^NDX | 模糊输入 → 大盘指数 |
| `黄金` | symbol=GOLD, type=index, yahoo=GC=F | 商品名 → 大盘，映射期货代码 |
| `科技板块` | symbol=XLK, type=sector, yahoo=XLK | 行业描述 → 板块 ETF |
| `TSLA` | symbol=TSLA, type=stock, yahoo=TSLA | ticker 代码 → 个股 |

#### LLM Prompt 设计

```python
def resolve_symbol_via_llm(user_input: str, existing_symbols: list[str]) -> dict:
    """调用 LLM 将用户自然语言输入解析为结构化标的信息"""
    messages = [
        {
            "role": "system",
            "content": (
                "你是一个金融标的识别助手。"
                "用户会输入一个股票代码、公司名、指数名、ETF 名或自然语言描述，"
                "你需要识别出对应的 Yahoo Finance 代码和其他信息。"
                "只输出 JSON，不要输出任何解释。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"请识别以下输入对应的金融标的：\"{user_input}\"\n\n"
                "返回一个 JSON 对象，字段如下：\n"
                "{\n"
                '  "symbol": "系统内唯一标识，简短，人类友好。个股用 ticker（如 MU），'
                '指数去掉 ^ 前缀（如 GSPC），ETF 用代码（如 XLK）",\n'
                '  "yahoo_symbol": "Yahoo Finance 精确代码。注意：'
                '美股指数需要 ^ 前缀（如 ^GSPC），'
                '上证用 000001.SS，美元指数用 DX-Y.NYB，'
                '黄金用 GC=F，原油用 CL=F",\n'
                '  "display_name": "中文显示名称",\n'
                '  "symbol_type": "index（大盘指数/大宗商品/汇率）/ sector（板块ETF/行业指数）/ stock（个股）",\n'
                '  "aliases": ["中英文别名数组，用于新闻匹配，至少包含 symbol、公司名、中文名"],\n'
                '  "confidence": "high / medium / low",\n'
                '  "reason": "一句话说明识别依据"\n'
                "}\n\n"
                "判断 symbol_type 的规则：\n"
                "- index：大盘指数（标普、纳指、道指、恒指、上证等）、大宗商品（黄金、原油）、汇率（美元指数）、波动率（VIX）\n"
                "- sector：行业/板块 ETF（XLK、SOXX、XLE、XLF 等）、行业指数\n"
                "- stock：具体公司个股（MU、AAPL、TSLA 等）\n\n"
                f"已有标的（避免重复）：{json.dumps(existing_symbols)}\n"
                "如果输入模糊或有多种可能，选择最常见的美股标的。只返回 JSON。"
            ),
        },
    ]

    result = llm_client.call_chat(
        messages,
        log_label=f"标的识别: {user_input}",
        model=LLM_MODEL_ID,
        max_tokens=400,
        temperature=0.1,
    )
    # ... 解析 JSON，校验字段，返回结构化结果
```

#### Worker 端 Resolve API

```javascript
// POST /api/symbols/resolve
// Body: { "input": "美光" }
// 由 Worker 调用 LLM API 做解析

async function resolveSymbol(env, body) {
  const userInput = (body.input || '').trim();
  if (!userInput) throw Object.assign(new Error('input is required'), { statusCode: 400 });

  // 1. 获取现有标的列表（避免 LLM 推荐重复的）
  const existing = await env.DB.prepare(
    'SELECT symbol FROM tracked_symbols WHERE is_active = 1'
  ).all();
  const existingSymbols = (existing.results || []).map(r => r.symbol);

  // 2. 调用 LLM 解析
  const llmResult = await callLLM(env, userInput, existingSymbols);

  // 3. 自动验证 Yahoo 代码（用 Yahoo Finance API）
  let validation = null;
  if (llmResult.yahoo_symbol) {
    validation = await validateYahooSymbol(llmResult.yahoo_symbol);
  }

  return {
    resolved: llmResult,
    validation,  // { valid: true, latestPrice: 95.20, change: "+1.3%" } 或 null
    isDuplicate: existingSymbols.includes(llmResult.symbol),
  };
}
```

#### 前端交互：智能输入框

```
┌─────────────────────────────────────────────────────────────────┐
│  三个分组卡片（可折叠）：大盘 / 板块 / 个股                         │
│                                                                 │
│  ┌───────────────────────────────────────────────── 智能添加 ──┐ │
│  │  输入标的名称或代码    [ 美光            ] [智能识别]         │ │
│  │                                                             │ │
│  │  → 识别中...  ████████░░ LLM 解析 + Yahoo 验价              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  识别结果 ──────────────────────────────────────────────────      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  ✅ 识别成功 (confidence: high)                              │ │
│  │  "美光科技 (Micron Technology)，纳斯达克上市个股"              │ │
│  │                                                             │ │
│  │  标的代码    [ MU          ]  ← 可微调                       │ │
│  │  Yahoo代码   [ MU          ]  ← 可微调                       │ │
│  │  显示名称    [ 美光科技     ]  ← 可微调                       │ │
│  │  标的类型    [ 个股 ▾      ]  ← 可微调                       │ │
│  │  别名        [ MU, Micron, Micron Technology, 美光 ]         │ │
│  │                                                             │ │
│  │  📊 Yahoo 验证：✅ 最新收盘 $95.20 (+1.3%) 2026-03-14       │ │
│  │                                                             │ │
│  │              [ 取消 ]    [ 确认添加 ]                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 大盘指数 (Index)                                             │ │
│ │ ┌──────┬─────────┬──────────┬───────────┬────────┬──────┐  │ │
│ │ │ 代码  │ Yahoo码  │  显示名   │   别名     │ 排序  │ 操作  │  │ │
│ │ ├──────┼─────────┼──────────┼───────────┼────────┼──────┤  │ │
│ │ │ GSPC │ ^GSPC   │ 标普500  │ S&P,标普  │  1    │ ✏️ 🗑 │  │ │
│ │ │ VIX  │ ^VIX    │ 恐慌指数  │ VIX,恐慌  │  4    │ ✏️ 🗑 │  │ │
│ │ └──────┴─────────┴──────────┴───────────┴────────┴──────┘  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 板块 (Sector)                                               │ │
│ │  ... 同结构 ...                                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 个股 (Stock)                                                │ │
│ │  ... 同结构 ...                                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**交互细节**：
- 输入框支持回车或点击 [智能识别] 触发
- LLM 解析 + Yahoo 验价并行执行，通常 2-3 秒内完成
- 识别结果预填到表单，所有字段可微调（LLM 不是 100% 准确，用户有最终决定权）
- confidence=low 时显示黄色警告："识别置信度较低，请确认以下信息"
- Yahoo 验证失败时显示红色提示："Yahoo 代码无效，请手动修正 Yahoo 代码"
- 如果 LLM 返回的 symbol 已存在，提示 "该标的已存在" 并高亮已有记录

#### Yahoo 验价实现（Worker 端）

Worker 环境不能用 yfinance（Python），但可以直接 fetch Yahoo Finance 的公开 API：

```javascript
async function validateYahooSymbol(yahooSymbol) {
  try {
    // Yahoo Finance v8 公开 API（不需要 API key）
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { valid: false, error: `HTTP ${resp.status}` };

    const data = await resp.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return { valid: false, error: 'No data returned' };

    return {
      valid: true,
      latestPrice: meta.regularMarketPrice,
      previousClose: meta.previousClose,
      change: meta.regularMarketPrice && meta.previousClose
        ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2) + '%'
        : null,
      currency: meta.currency,
      exchangeName: meta.exchangeName,
      instrumentType: meta.instrumentType, // EQUITY / ETF / INDEX / FUTURE 等
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
```

**额外好处**：Yahoo API 返回的 `instrumentType` 可以作为 LLM 分类的二次校验：
- `EQUITY` → 应为 `stock`
- `ETF` → 应为 `sector`
- `INDEX` → 应为 `index`
- `FUTURE` → 应为 `index`（大宗商品）

如果 LLM 和 Yahoo 的判断冲突，前端提示用户确认。

#### 降级策略

| 场景 | 处理 |
|------|------|
| LLM 调用失败 | 回退到纯手动模式，表单空白，用户自行填写 |
| LLM 返回 confidence=low | 表单预填但黄色警告，提示用户检查 |
| Yahoo 验价失败 | 表单仍可提交，但标红 Yahoo 代码字段，提示可能不准 |
| 网络异常 | 整体回退到手动模式，显示 "智能识别暂不可用" |

### 2.5 API 设计

| 接口 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| `GET /api/symbols` | GET | 获取所有标的（支持 ?type=index&active=1 筛选） | 无 |
| `GET /api/symbols/:id` | GET | 获取单个标的详情 | 无 |
| `POST /api/symbols` | POST | 创建标的 | 需要鉴权 |
| `PUT /api/symbols/:id` | PUT | 更新标的 | 需要鉴权 |
| `DELETE /api/symbols/:id` | DELETE | 删除标的（软删除：is_active=0） | 需要鉴权 |
| `POST /api/symbols/resolve` | POST | **LLM 智能识别** + Yahoo 验价 | 需要鉴权 |
| `POST /api/symbols/validate` | POST | 仅 Yahoo 验价（手动微调后重新验证用） | 需要鉴权 |

**注意**：标的管理页面需要鉴权。考虑到当前系统已有 `INGEST_API_TOKEN`，管理页面可复用同一 Token。页面第一次访问时弹出 Token 输入框，输入后存 localStorage。

#### LLM 调用方式选择

Worker 端调用 LLM 有两种方式：

| 方式 | 优点 | 缺点 |
|------|------|------|
| Worker 直接调用 DashScope API | 链路短，不依赖 Python | 需在 Worker 中配置 LLM_API_KEY |
| Worker 转发给 Python 端处理 | 复用已有 llm_client.py | 需要 Python 端额外暴露接口 |

**推荐 Worker 直接调用**。原因：
1. resolve 是低频操作（用户手动添加标的时才触发），不需要 Python 端复杂的重试/降级机制
2. Worker 的 `fetch` 天然支持调用外部 API
3. 只需在 wrangler.toml 中加一个 `LLM_API_KEY` 的 secret binding

### 2.6 Python 采集改造

**消除硬编码**：`config.py` 中的 `STOCK_SYMBOLS` / `INDEX_SYMBOLS` / `ALL_SYMBOLS` 不再作为唯一数据源。

**新增函数** `get_tracked_symbols()`：

```python
# config.py 或新文件 symbol_registry.py
def get_tracked_symbols() -> list[dict]:
    """从 D1 或本地缓存获取活跃标的列表"""
    if ENABLE_REMOTE_WRITE and is_remote_write_configured():
        # 从 Worker API 获取
        return fetch_remote_symbols()
    else:
        # 从本地 SQLite 获取
        return get_local_tracked_symbols()

def get_symbols_by_type(symbol_type: str) -> list[dict]:
    return [s for s in get_tracked_symbols() if s['symbol_type'] == symbol_type]

def get_yahoo_symbol(symbol_record: dict) -> str:
    return symbol_record.get('yahoo_symbol') or symbol_record['symbol']

def build_aliases_lookup() -> dict[str, list[dict]]:
    """构建别名 → 标的记录的反向索引，供新闻匹配使用"""
    lookup = {}
    for record in get_tracked_symbols():
        aliases = json.loads(record.get('aliases', '[]'))
        for alias in aliases:
            lookup.setdefault(alias.lower(), []).append(record)
    return lookup
```

**价格采集改造**（`collect_prices.py`）：

```python
# 改前
from config import ALL_SYMBOLS
# 改后
symbols = get_tracked_symbols()
for sym in symbols:
    yahoo_code = get_yahoo_symbol(sym)
    price_data = yf.Ticker(yahoo_code).history(...)
    # 写入时用 sym['symbol'] 而不是 yahoo_code
    record['symbol'] = sym['symbol']
```

---

## 三、需求 2：新闻分类重构

### 3.1 类型体系设计

**现状**：`macro` / `market` / `symbol` 三类，但 `macro` 和 `market` 在 UI 上都显示为"宏观"，区分度不够。

**新体系**：

| 内部类型 | 含义 | UI 显示 | 对应标的层级 |
|---------|------|--------|------------|
| `index` | 大盘/宏观级新闻 | 宏观 | index 类标的 |
| `sector` | 板块/行业级新闻 | 板块 | sector 类标的 |
| `stock` | 个股级新闻 | 个股 | stock 类标的 |

**为什么不合并为 2 类？** 用户说"宏观(大盘+板块)和个股"，但内部 3 类数据颗粒度更好。UI 层可以灵活组合：
- 新闻列表筛选：提供 3 个 checkbox（大盘 / 板块 / 个股），或提供 2 个分组（宏观=大盘+板块 / 个股）
- 复盘页：3 个折叠区块各自加载对应类型新闻
- 日后如果需要拆分板块和大盘的分析视角，无需改数据模型

**迁移映射**：
- 旧 `macro` → 新 `index`
- 旧 `market` → 新 `sector`（原来的 market 实际上是"市场结构性事件"，更接近板块层面）
- 旧 `symbol` → 新 `stock`

### 3.2 分类判定逻辑重构

**当前问题**：`apply_rule_filter()` 中的分类逻辑过于粗糙：

```python
# 现在的逻辑（collect_news_v3.py:579-613）
rule_type = "market"  # 默认
if equity_symbols:
    rule_type = "symbol"
elif ...:
    rule_type = "macro" if len(macro_hits) >= len(market_hits) else "market"
```

**新逻辑**：分类应该基于标的表层级自动判定。

```python
def classify_news_type(related_symbols: list[str], macro_hits: list, sector_hits: list) -> str:
    """根据匹配到的标的类型判定新闻类型"""
    # 从标的表读取类型映射
    symbol_types = {sym['symbol']: sym['symbol_type'] for sym in get_tracked_symbols()}

    matched_types = set()
    for sym in related_symbols:
        if sym in symbol_types:
            matched_types.add(symbol_types[sym])

    # 优先级：stock > sector > index
    # 如果新闻直接提到个股，分类为 stock
    if 'stock' in matched_types:
        return 'stock'
    # 如果提到板块标的，或命中板块关键词，分类为 sector
    if 'sector' in matched_types or sector_hits:
        return 'sector'
    # 其余为 index（宏观/大盘）
    return 'index'
```

**关键词体系重构**：

```python
# 现在的 BASE_MACRO_KEYWORDS / BASE_MARKET_KEYWORDS 合并并重新划分

INDEX_KEYWORDS = [
    # 宏观经济 & 央行政策
    "美联储", "fed", "利率", "降息", "加息", "通胀", "cpi", "ppi", "非农", "就业",
    "关税", "制裁", "贸易", "财政刺激", "流动性", "衰退", "债务上限",
    # 地缘政治
    "战争", "冲突", "霍尔木兹", "中东", "俄乌", "伊朗", "以色列",
    # 大盘指数
    "标普", "纳指", "道指", "s&p", "nasdaq", "dow", "恒指", "上证",
    # 大宗商品
    "原油", "油价", "黄金", "金价", "美元指数",
]

SECTOR_KEYWORDS = [
    # 科技板块
    "芯片", "半导体", "ai", "人工智能", "云计算", "数据中心",
    # 能源板块
    "新能源", "光伏", "锂电", "石油", "天然气",
    # 金融板块
    "银行", "保险", "券商",
    # 消费板块
    "消费", "零售", "电商",
    # 通用板块信号
    "板块", "行业", "产业链", "景气度", "产能",
    # 财报与市场结构（影响整个板块时）
    "财报", "盈利", "业绩", "回购", "分红", "ipo", "并购", "收购", "监管",
]

# STOCK 不需要关键词列表 —— 通过标的表的 aliases 直接匹配
```

### 3.3 LLM Prompt 重构

**批量分析 prompt**（`_call_batch_llm`）的 type 字段说明改为：

```
"type": "index|sector|stock"
  - index: 影响大盘指数、宏观经济、央行政策、地缘政治、大宗商品的新闻
  - sector: 影响特定板块或行业的新闻（如半导体行业、AI板块、能源板块）
  - stock: 直接影响具体个股的新闻（如财报、指引、诉讼、产品发布）
```

**日期级综合分析 prompt**（`build_daily_summary_record`）需要结构化调整：

当前 `sector_impact_map` 字段混合了大盘和板块，改为结构更清晰的输出：

```json
{
  "daily_major_events": ["..."],
  "index_impact": ["美股大盘：偏空。原因是...", "港股大盘：中性。原因是..."],
  "sector_impact": ["半导体：偏多。原因是...", "能源：偏空。原因是..."],
  "stock_highlights": ["MU：偏多。美光发布...", "MSFT：中性。..."],
  "linkage_logic_chain": ["..."]
}
```

**但考虑到向后兼容**，不建议改字段名。而是在 `sector_impact_map` 内部用结构化格式区分：

```
sector_impact_map 新输出要求：
先写大盘整体影响，再写板块影响，用明确标记区分：
[大盘] 美股大盘：偏空。原因是...
[大盘] 港股/A股：中性。原因是...
[板块] 半导体：偏多。原因是...
[板块] 能源：偏空。原因是...
[个股] MU：偏多。美光发布...
```

### 3.4 数据迁移

```sql
-- Migration 007: 新闻类型重命名
UPDATE news_raw_data SET type = 'index' WHERE type = 'macro';
UPDATE news_raw_data SET type = 'sector' WHERE type = 'market';
UPDATE news_raw_data SET type = 'stock' WHERE type = 'symbol';

-- 同步更新归档快照表
UPDATE daily_review_archive_news SET type = 'index' WHERE type = 'macro';
UPDATE daily_review_archive_news SET type = 'sector' WHERE type = 'market';
UPDATE daily_review_archive_news SET type = 'stock' WHERE type = 'symbol';
```

### 3.5 前端新闻筛选 UI 更新

```javascript
// 现在
const NEWS_TYPE_LABELS = { macro: "宏观", market: "宏观", symbol: "标的" };

// 改后
const NEWS_TYPE_LABELS = { index: "大盘", sector: "板块", stock: "个股" };

// 筛选 UI 提供 3 个 checkbox + 1 个快捷分组按钮
// [宏观 (全选大盘+板块)] [大盘] [板块] [个股]
```

---

## 四、需求 3：复盘三段式价格分析

### 4.1 Bootstrap API 返回结构变更

**当前** `getReviewBootstrap` 返回：

```json
{
  "prices": [/* 扁平数组 */],
  "news": [...],
  "analysis": {...}
}
```

**改后**：

```json
{
  "prices": {
    "index": [
      { "symbol": "GSPC", "displayName": "标普500", "currentPrice": 5200.5, "changePercent": -0.8, "volume": 3200000000 },
      { "symbol": "VIX", "displayName": "恐慌指数", "currentPrice": 22.3, "changePercent": 5.2, "volume": null },
      { "symbol": "DXY", "displayName": "美元指数", "currentPrice": 103.5, "changePercent": 0.3, "volume": null },
      { "symbol": "GOLD", "displayName": "黄金", "currentPrice": 2985.0, "changePercent": 1.2, "volume": null }
    ],
    "sector": [
      { "symbol": "XLK", "displayName": "科技板块", "currentPrice": 220.5, "changePercent": -1.2, "volume": 12000000 },
      { "symbol": "SOXX", "displayName": "半导体板块", "currentPrice": 195.3, "changePercent": -2.1, "volume": 8000000 }
    ],
    "stock": [
      { "symbol": "MU", "displayName": "美光科技", "currentPrice": 95.2, "changePercent": -3.5, "volume": 28000000 },
      { "symbol": "LITE", "displayName": "Lumentum", "currentPrice": 52.1, "changePercent": 1.8, "volume": 1200000 }
    ]
  },
  "news": {
    "index": [...],
    "sector": [...],
    "stock": [...]
  },
  "analysis": {...}
}
```

### 4.2 Worker 端实现

```javascript
async function getReviewBootstrap(env, archiveDate) {
  // ... 现有逻辑 ...

  // 获取标的分组
  const symbols = await env.DB.prepare(
    `SELECT symbol, yahoo_symbol, display_name, symbol_type, sort_order
     FROM tracked_symbols WHERE is_active = 1 ORDER BY symbol_type, sort_order`
  ).all();

  const symbolMap = {};
  const symbolTypeMap = {};
  for (const sym of (symbols.results || [])) {
    symbolMap[sym.symbol] = sym;
    symbolTypeMap[sym.symbol] = sym.symbol_type;
  }

  // 价格按类型分组
  const pricesByType = { index: [], sector: [], stock: [] };
  for (const price of currentPrices.results || []) {
    const symInfo = symbolMap[price.symbol];
    const type = symInfo?.symbol_type || 'stock';
    pricesByType[type].push({
      ...price,
      displayName: symInfo?.display_name || price.stock_name || price.symbol,
      sortOrder: symInfo?.sort_order || 999
    });
  }
  // 排序
  for (const type of Object.keys(pricesByType)) {
    pricesByType[type].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // 新闻按类型分组
  const newsByType = { index: [], sector: [], stock: [] };
  for (const news of newsItems) {
    const type = news.type || 'index';
    const bucket = newsByType[type] || newsByType.index;
    bucket.push(news);
  }

  return {
    archiveDate,
    newsWindow,
    symbols: symbols.results || [],
    prices: pricesByType,
    news: newsByType,
    analysis: normalizeReviewAnalysis(analysis, newsItems),
    carryForward: previousCompletedReview,
    draft: existingDraft ? { ... } : null,
  };
}
```

### 4.3 前端三段式 UI

复盘编辑区的「源数据回填区」改为三个可折叠的分析区块：

```
┌─────────────────────────────────────────────────────────────┐
│  📊 复盘日期: 2026-03-14                      [保存草稿]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ▼ 大盘分析（欧美指数 · 亚洲指数 · 大宗商品）                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ┌─────────┬────────┬─────────┬──────────┐              ││
│  │ │ 标普500  │ 5200.5 │ -0.80%  │ 32亿     │              ││
│  │ │ 恐慌指数 │ 22.3   │ +5.20%  │  —       │              ││
│  │ │ 美元指数 │ 103.5  │ +0.30%  │  —       │              ││
│  │ │ 黄金     │ 2985.0 │ +1.20%  │  —       │              ││
│  │ │ 原油     │ 68.2   │ -2.10%  │  —       │              ││
│  │ └─────────┴────────┴─────────┴──────────┘              ││
│  │                                                         ││
│  │ AI 大盘解读：                                            ││
│  │ [大盘] 美股大盘：偏空。联储鹰派讲话 + VIX飙升...            ││
│  │ [大盘] 港股/A股：中性。内需政策对冲外部压力...               ││
│  │                                                         ││
│  │ 相关新闻 (3)：                                           ││
│  │  ★★★★★ 美联储议息纪要释放鹰派信号                        ││
│  │  ★★★★  美国3月非农就业超预期                              ││
│  │  ★★★   黄金突破2980美元创历史新高                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ▼ 板块分析（科技与半导体 · 能源与金融）                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ┌──────────┬────────┬─────────┬──────────┐             ││
│  │ │ 科技板块  │ 220.5  │ -1.20%  │ 12M     │             ││
│  │ │ 半导体    │ 195.3  │ -2.10%  │ 8M      │             ││
│  │ │ 能源板块  │ 85.2   │ +0.50%  │ 5M      │             ││
│  │ └──────────┴────────┴─────────┴──────────┘             ││
│  │                                                         ││
│  │ AI 板块解读：                                            ││
│  │ [板块] 半导体：偏空。受制裁消息影响...                      ││
│  │ [板块] 能源：偏多。OPEC减产预期...                         ││
│  │                                                         ││
│  │ 相关新闻 (2)：                                           ││
│  │  ★★★★  美国拟对华半导体出口管制升级                       ││
│  │  ★★★   OPEC+考虑延长减产协议                              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ▼ 个股深度研究                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ┌──────────┬────────┬─────────┬──────────┐             ││
│  │ │ 美光 MU  │ 95.2   │ -3.50%  │ 28M     │             ││
│  │ │ LITE     │ 52.1   │ +1.80%  │ 1.2M    │             ││
│  │ │ 微软 MSFT│ 420.3  │ -0.60%  │ 18M     │             ││
│  │ │ 谷歌 GOOGL│385.1  │ -0.90%  │ 15M     │             ││
│  │ └──────────┴────────┴─────────┴──────────┘             ││
│  │                                                         ││
│  │ AI 个股解读：                                            ││
│  │ [个股] MU：偏空。受半导体出口管制连带影响...                 ││
│  │                                                         ││
│  │ 相关新闻 (1)：                                           ││
│  │  ★★★★  美光Q2指引低于预期                                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ─── 人工编辑区（5步流程不变）───                              │
│  [新闻总结] [大盘盘点] [板块轮动] [操作计划] [深度总结]         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 折叠行为

- 默认全部展开
- 折叠后只显示标题行 + 价格变动摘要条（如 "标普 -0.8% | VIX +5.2% | 黄金 +1.2%"）
- 点击展开后完整显示价格表 + AI 解读 + 相关新闻
- 折叠状态存 localStorage，下次打开复盘记住

### 4.5 AI 解读分段提取

当前 `sector_impact_map` 是一个混合文本。改造后在前端解析时按 `[大盘]` `[板块]` `[个股]` 标记拆分：

```javascript
function splitAnalysisByType(sectorImpactMap) {
  const lines = (sectorImpactMap || '').split('\n').filter(Boolean);
  const result = { index: [], sector: [], stock: [] };

  for (const line of lines) {
    if (line.startsWith('[大盘]') || line.startsWith('[index]')) {
      result.index.push(line.replace(/^\[大盘\]\s*/, '').replace(/^\[index\]\s*/, ''));
    } else if (line.startsWith('[板块]') || line.startsWith('[sector]')) {
      result.sector.push(line.replace(/^\[板块\]\s*/, '').replace(/^\[sector\]\s*/, ''));
    } else if (line.startsWith('[个股]') || line.startsWith('[stock]')) {
      result.stock.push(line.replace(/^\[个股\]\s*/, '').replace(/^\[stock\]\s*/, ''));
    } else {
      // 没有标记的行，尝试按内容推断
      result.index.push(line); // fallback 到大盘
    }
  }
  return result;
}
```

---

## 五、完整改动范围评估

### 5.1 新增文件

| 文件 | 说明 |
|------|------|
| `cloudflare/migrations/007_tracked_symbols.sql` | 新表 + seed 数据 + type 迁移 |
| `symbol_registry.py` | Python 端标的注册中心（替代 config.py 硬编码） |

### 5.2 需要修改的文件

| 文件 | 改动量 | 说明 |
|------|--------|------|
| `schema.sql` | 中 | 新增 tracked_symbols 表定义 |
| `config.py` | 小 | 删除 STOCK_SYMBOLS / INDEX_SYMBOLS，保留作为 fallback |
| `collect_prices.py` | 中 | 从标的表读取标的，使用 yahoo_symbol 采集 |
| `collect_news_v3.py` | 大 | 消除硬编码标的、重构 type 体系、改 LLM prompt |
| `cloudflare/worker/src/index.js` | 大 | 新增 symbols CRUD、改 bootstrap 返回结构 |
| `cloudflare/web/index.html` | 中 | 新增 Symbol Manager Tab + 页面结构 |
| `cloudflare/web/app.js` | 大 | 新增标的管理页面逻辑、改复盘价格渲染 |
| `cloudflare/web/styles.css` | 中 | 新增标的管理和折叠区块样式 |
| `db_utils.py` | 小 | 新增 tracked_symbols 本地 CRUD |
| `cloudflare_ingest.py` | 小 | 新增 fetch_symbols / validate_symbol |

### 5.3 不需要改的文件

- `main.py` — 入口逻辑不变
- `llm_client.py` — LLM 客户端不变
- `runtime/` — 执行上下文不变
- `data_sources/` — 数据源路由不变（但 price_live.py 的调用参数会从上层传入 yahoo_symbol）

---

## 六、实施顺序

```
Phase 1: 数据层（1个PR）
  ├─ 1.1 创建 tracked_symbols 表 + migration + seed
  ├─ 1.2 新闻类型迁移 macro→index, market→sector, symbol→stock
  └─ 1.3 schema.sql 同步更新

Phase 2: 后端 API（1个PR）
  ├─ 2.1 Worker: symbols CRUD 接口
  ├─ 2.2 Worker: bootstrap 返回结构按类型分组
  ├─ 2.3 Worker: 新闻查询支持新 type 值
  └─ 2.4 Worker: validate 接口（可选，延后）

Phase 3: Python 采集改造（1个PR）
  ├─ 3.1 symbol_registry.py 模块
  ├─ 3.2 collect_prices.py 从标的表读取
  ├─ 3.3 collect_news_v3.py 消除硬编码 + 新分类逻辑
  └─ 3.4 LLM prompt 重构

Phase 4: 前端（1个PR）
  ├─ 4.1 标的管理页面
  ├─ 4.2 新闻列表类型筛选 UI
  ├─ 4.3 复盘三段式折叠价格区
  └─ 4.4 AI 解读按类型分段展示
```

---

## 七、方案特色与设计决策总结

### 7.1 为什么 symbol 和 yahoo_symbol 要分开？

这是整个方案最关键的设计决策。如果只存 yahoo_symbol，会遇到：
- `^GSPC`、`000001.SS`、`DX-Y.NYB`、`GC=F` 这些代码对用户极不友好
- stock_raw 表里存 `^GSPC`，但新闻里匹配的是 "标普500"，关联链条断裂
- 用户想改用另一个数据源采集价格时（比如 Alpha Vantage），yahoo_symbol 就无意义了

分离之后：
- `symbol` = 系统统一语言（GSPC、VIX、MU），简洁，人和机器都好理解
- `yahoo_symbol` = 纯采集层映射，只在 yfinance 调用时使用
- `aliases` = 新闻匹配层，中英文别名全覆盖
- 三者各司其职，互不耦合

### 7.2 为什么新闻类型用 index/sector/stock 而不是保持 macro/market/symbol？

- 名称与标的类型 **一一对应**（index↔index, sector↔sector, stock↔stock）
- 分类判定可以直接从标的表 symbol_type 派生，消除独立的硬编码规则
- `macro` 和 `market` 的边界模糊（"财报季"是 macro 还是 market？），换成 `index` 和 `sector` 后语义更精确

### 7.3 为什么复盘价格按标的类型分组，而不是让用户自定义分组？

- 标的类型已经是用户在标的管理页维护的，天然就是分组依据
- 增加一套独立的"分组配置"是过度设计，增加维护成本
- 用户改标的类型 = 改分组归属，一处维护两处生效

### 7.4 向后兼容

- 旧的 `macro`/`market`/`symbol` 类型在 migration 中一次性迁移
- Worker API 的 `getNewsList` 在 type 筛选时做兼容：如果传入 `macro`，自动映射为 `index`
- Python 采集脚本在找不到标的表时 fallback 到 config.py 硬编码列表（开发调试用）
- bootstrap API 同时返回扁平和分组两种 prices 格式（过渡期），前端优先使用分组

---

## 八、风险与注意事项

1. **标的表为空时的降级**：初次部署前标的表可能未 seed，所有读取标的表的代码都需要 fallback
2. **Yahoo 验证功能的限制**：yfinance 在 Worker 环境无法运行，validate 接口需要：
   - 方案 A：调用 Yahoo Finance 公开 API（Worker 可 fetch）
   - 方案 B：让 Python 提供 validate 端点（更可靠，但需要额外部署）
   - **推荐方案 A**，因为只需验证代码是否存在，不需要 yfinance 的完整功能
3. **LLM prompt 变更后的质量验证**：type 字段改名后需要跑一轮新闻采集测试，确认 LLM 输出的 type 值正确
4. **前端标的管理的安全性**：Token 存 localStorage 有 XSS 风险，但考虑到这是私有部署、单用户场景，可接受
