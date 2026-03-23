# MyFinancialAgent — 股票自动化复盘系统

面向个人投资者的一体化股票自动化复盘系统。系统会自动采集跟踪标的的价格与财经新闻，通过多层过滤保留真正有价值的信息，并在网页端提供新闻检索、标的管理、关键词管理和复盘工作台。

技术栈：Python 3.12 + Cloudflare Workers (JS) + Cloudflare D1 + 原生 HTML/CSS/JS

## 目录

- [系统说明](#system-overview)
- [系统架构](#system-architecture)
- [数据存储](#data-storage)
- [目录结构](#project-structure)
- [快速启动](#quick-start)
- [定时任务](#scheduled-jobs)
- [环境](#environments)
- [新闻采集与过滤流程](#news-pipeline)
- [核心字段说明](#core-fields)
- [关键词与标的别名](#keywords-and-aliases)
- [复盘工作流](#review-workflow)
- [测试](#testing)
- [文档](#docs)

<a id="system-overview"></a>
## 系统说明

MyFinancialAgent 主要服务于单用户、私有化的日常复盘场景。它的目标不是做一个公开资讯平台，而是把你真正关心的价格、新闻、AI 分析和人工复盘内容放到同一条工作流里，减少噪音，提升复盘效率。

系统当前主要包含四类页面能力：

- 复盘工作台：查看待复盘日期、打开某天复盘、保存草稿、标记完成
- 新闻检索：按关键词、日期、来源、类型、标的筛选新闻
- 标的管理：维护跟踪标的、别名和显示信息
- 关键词管理：维护新闻筛选所需的关键词词表

用户的日常使用路径通常是：系统自动采集数据并生成日期级分析，用户进入复盘工作台查看当天价格与新闻回填，再补充自己的判断、计划和总结。

<a id="system-architecture"></a>
## 系统架构

系统整体链路如下：

```text
GitHub Actions
   ↓
Python 采集端
   ↓
Cloudflare Worker API
   ↓
Cloudflare D1
   ↑
Web 前端
```

具体来说：

- GitHub Actions 负责按计划触发任务
- Python 采集端负责价格采集、新闻抓取、过滤与 AI 分析
- Cloudflare Worker 提供写入接口和查询接口
- Cloudflare D1 作为主数据库保存生产数据
- Web 前端通过 Worker API 读取数据并展示

前端本身是静态页面，业务数据不直接连数据库，而是统一通过 Worker API 查询。

<a id="data-storage"></a>
## 数据存储

系统当前采用“云端主存储 + 本地回退”的结构。

- 生产数据存储在 Cloudflare D1 的 `my-financial-agent`
- 测试数据存储在 Cloudflare D1 的 `my-financial-agent-test`
- 本地开发或回退模式下使用 SQLite，默认路径为 `output/financial_data.db`
- ReadMe 页面内容来源于仓库根目录 `README.md`，后续接入页面时将同步到前端静态资源目录供页面渲染

核心业务表包括：

- `stock_raw`：价格数据
- `news_raw_data`：新闻数据
- `daily_review_archive`：复盘主表
- `daily_news_ai_analysis`：日期级 AI 新闻分析
- `daily_review_archive_news`：复盘新闻快照

<a id="project-structure"></a>
## 目录结构

仓库主要按“采集端、Worker、前端、文档、测试”分层组织：

```text
.
├── .github/workflows/     # GitHub Actions 定时采集
├── cloudflare/
│   ├── migrations/        # D1 数据库迁移
│   ├── web/               # 前端静态页面
│   └── worker/src/        # Cloudflare Worker API
├── docs/                  # 架构与需求文档
├── src/                   # Python 源代码
├── tests/                 # 集成测试、冒烟测试、测试数据
├── main.py                # CLI 入口
├── README.md              # 项目主文档，也是网页 ReadMe 的内容源
└── wrangler.toml          # Cloudflare 配置
```

其中：

- `src/collect_prices.py` 负责价格采集
- `src/collect_news_v3.py` 负责新闻采集、过滤与日期级分析
- `src/cloudflare_ingest.py` 负责与 Worker API 通信
- `cloudflare/worker/src/index.js` 负责 API 路由与数据读写
- `cloudflare/web/` 负责网页界面

<a id="quick-start"></a>
## 快速启动

### 1. 环境准备

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 配置

```bash
cp .env.example .env
```

然后编辑 `.env`，至少补齐这些配置：

- `LLM_API_KEY`
- `LLM_BASE_URL`
- `INGEST_API_BASE_URL`
- `INGEST_API_TOKEN`

### 3. 运行

```bash
python main.py
python main.py hourly-news
python main.py close-summary
```

说明：

- `python main.py`：全量流程，价格 + 新闻 + AI 总结
- `python main.py hourly-news`：仅执行新闻采集
- `python main.py close-summary`：执行收盘后新闻补采、价格写入和日期级汇总

<a id="scheduled-jobs"></a>
## 定时任务

系统当前有两类定时任务：

- `hourly-news`：每小时执行一次，只采集新闻
- `close-summary`：每天北京 05:00 执行一次，负责收盘后价格、新闻和日期级汇总

这两类任务由 GitHub Actions 触发，Python 采集端负责具体执行。

<a id="environments"></a>
## 环境

系统区分生产和测试两套环境：

- 生产环境
  - Worker：`my-financial-agent.rtw1994.workers.dev`
  - D1：`my-financial-agent`

- 测试环境
- Worker：`my-financial-agent-test.rtw1994.workers.dev`
- D1：`my-financial-agent-test`

测试环境用于集成验证，避免直接污染生产数据。

<a id="news-pipeline"></a>
## 新闻采集与过滤流程

新闻处理链路分为"入口过滤"和"三级漏斗"两个阶段。入口过滤先把明显无效的文章拦在 pipeline 之外，三级漏斗再对剩余文章做逐步精选。

### 入口过滤

在进入三级漏斗之前，系统会依次做两层过滤：

**[截断]：按时间丢弃超龄文章**

Finnhub `company_news` 接口的日期参数只支持天粒度（`YYYY-MM-DD`），无法精确到小时。因此 `date_from = today - 1天` 实际会拉回约 47 小时的文章。系统在 `merge_and_deduplicate` 之前统一丢弃 `pub_date < now - 24h` 的条目，将窗口精确收窄到 24h。这一步不需要查数据库，纯时间比较，成本极低。

**[预过滤]：按 hash 跳过已入库文章**

Pipeline 每 2 小时运行一次，同一篇新文章（`pub_date` 在 24h 内）会在多次运行中都被采集到。系统在 Stage 1 之前查询数据库，拉取过去 24h 内已存在的 `news_hash` 集合，把命中的文章直接跳过，只让真正新增的文章进入三级漏斗。

这两层的区别：**截断管"太老"，预过滤管"处理过了"**。

```text
采集原始新闻
  ↓ [截断] pub_date < now-24h → 丢弃
  ↓ merge_and_deduplicate
  ↓ [预过滤] hash 已在 DB → 跳过
  ↓ 进入三级漏斗（仅含真正新增文章）
```

### Stage 1：关键词打分

这一步扫描每条新闻的标题和正文，判断它命中了哪些关键词和标的别名。Stage 1 不做最终过滤，只给每条新闻算一个基础分数 `rule_score`。

它主要回答两个问题：

- 这条新闻属于什么话题
- 这条新闻有没有提到你正在跟踪的标的

输出结果是每条新闻带一个 `rule_score`，为后续流程提供便宜的第一层信号。

### Stage 2：Embedding 过滤

这一步会调用 Embedding 能力，计算新闻和跟踪标的描述之间的语义相似度。系统会把相似度和 `rule_score` 结合起来，得到综合分数，并据此过滤掉明显不相关的新闻。

这一步是真正开始“缩量”的地方。它的目标不是做最终结论，而是把大量无关新闻挡在 LLM 之前。

### Stage 3：LLM 深度分析

通过前两层过滤的新闻会被分批交给大模型进一步分析。LLM 会输出结构化结果，例如：

- 是否保留
- 新闻类型
- 重要星级
- AI 摘要
- 市场影响
- 归属标的

最终只有 `keep=true` 的新闻会作为高价值新闻进入后续展示与复盘链路。

### 落库时机与设计意图

Stage 3 的 LLM 结果（**包含保留和丢弃的全部文章**）在每个批次完成后立即写入 D1，而不是等三级漏斗全部跑完再写。这样设计有两个目的：

1. **流式写入**：某个批次 LLM 超时时，已完成批次的文章不需要等待，可以提前落库。
2. **预过滤加速**：下次 pipeline 运行时，这批文章（无论是被保留还是被 LLM 丢弃的）的 hash 已在 D1，预过滤直接跳过，不会重复进入 Stage 1/2/3，避免浪费 LLM 调用。

换句话说，**"LLM 丢弃的文章也写库"不是冗余，而是为了下次预过滤能跳过它们**。

### 三级漏斗总结

可以把整个流程理解为：

```text
原始新闻
  ↓ [截断] 超龄文章丢弃
  ↓ [预过滤] 已入库文章跳过（含上次被 LLM 丢弃的）
  ↓
Stage 1：关键词打分
  ↓
Stage 2：Embedding 过滤
  ↓
Stage 3：LLM 深度分析（每批次完成后立即写库）
  ↓
高价值新闻用于展示与复盘
```

入口过滤成本最低（无 API 调用），Stage 3 成本最高。各层的存在，就是为了把昂贵的 LLM 使用集中到真正值得分析的新增新闻上。

<a id="core-fields"></a>
## 核心字段说明

这一节说明系统中的关键新闻字段分别代表什么，以及它们在前端页面中的实际使用位置。重点不是字段字面含义，而是“这个字段最后影响了哪个页面、哪个区域、哪种交互”。

### `related_symbols`

`related_symbols` 表示这条新闻关联到的跟踪标的列表。它是一个数组，可能为空，也可能包含一个或多个标的。

它的主要作用不是做展示装饰，而是把新闻和具体标的建立关联关系。

前端使用位置：

- 新闻检索台：显示在新闻列表的“标签”列中，作为标的标签展示
- 新闻详情弹窗：显示在详情弹窗顶部标签区
- 复盘工作台：显示在每条新闻卡片的标签区
- 复盘工作台 / 个股新闻分组：个股新闻会根据它进行按标的分组

前端逻辑作用：

- 在复盘工作台中，个股新闻不是简单平铺展示，而是按标的归类
- 分组时前端优先使用 `primary_symbol`，如果没有，则回退到 `related_symbols[0]`
- 因此，`related_symbols` 不只是“显示成标签”，还直接决定了个股新闻最终会被归到哪个标的下面

举例：

- 一条只和美光相关的新闻，可能是 `["MU"]`
- 一条同时提到多只跟踪标的的新闻，可能是 `["MU", "SOXX"]`
- 如果没有明确标的关联，则可能为空数组

### `primary_symbol`

`primary_symbol` 表示前端在需要“单一主标的”时优先采用的那个标的。

它不是所有页面都单独显示的字段，但它在前端分组逻辑里非常重要。

前端使用位置：

- 复盘工作台 / 个股新闻分组：作为分组的第一优先键

前端逻辑作用：

- 个股新闻分组时，前端会先取 `primary_symbol`
- 如果 `primary_symbol` 不存在，才回退到 `related_symbols[0]`
- 如果两者都没有，才归到“其他标的”

也就是说，`primary_symbol` 决定了一条多标的新闻在前端更偏向被归到哪一个标的下面。

### `type`

`type` 表示新闻的最终归属类型。

当前系统主要使用三类值：

- `index`：大盘 / 宏观 / 利率 / 商品 / 指数层面
- `sector`：板块 / 行业 / 主题层面
- `stock`：具体公司 / 个股层面

前端使用位置：

- 新闻检索台：可作为筛选条件
- 新闻检索台：显示在“标签”列
- 新闻详情弹窗：显示在顶部标签区
- 复盘工作台：显示在每条新闻卡片标签区

前端逻辑作用：

- 复盘工作台会按 `type` 将新闻拆分成三组：
  - 大盘新闻
  - 板块新闻
  - 个股新闻
- 前端会兼容旧值：
  - `macro` 会被视作 `index`
  - `market` 会被视作 `sector`
  - `symbol` 会被视作 `stock`

所以，`type` 不只是给用户看的标签，它直接决定了这条新闻在复盘工作台出现在哪个大类里。

### `importance_stars`

`importance_stars` 表示 LLM 对新闻重要性的打星结果，通常范围为 1 到 5。

可按下面理解：

- `5` 星：足以改变当天市场主线
- `4` 星：对跟踪标的或市场方向有明确影响
- `3` 星：有信息增量，值得看
- `2` 星：背景补充
- `1` 星：弱相关

前端使用位置：

- 新闻检索台：显示在“标签”列
- 新闻详情弹窗：显示在顶部标签区
- 复盘工作台：显示在每条新闻卡片标签区

前端逻辑作用：

- 复盘工作台新闻列表会先按星级降序排序，再按发布时间排序
- 各新闻分组标题中会显示“最高几星”
- 因此，`importance_stars` 既影响展示样式，也影响前端默认排序结果

换句话说，星级越高，新闻在复盘页面中越靠前，也越容易先被看到。

### `ai_summary`

`ai_summary` 是系统为新闻生成的一句话摘要，用于快速传达新闻核心内容。

前端使用位置：

- 新闻检索台：优先作为新闻主标题显示
- 新闻详情弹窗：显示在“AI 摘要”区域
- 复盘工作台：优先作为每条新闻卡片标题显示

前端逻辑作用：

- 如果存在 `ai_summary`，前端优先展示它
- 如果没有，前端才回退到原始标题 `title`
- 因此它决定了用户在页面上第一眼看到的“新闻标题”是否更凝练、更适合复盘

### `market_impact`

`market_impact` 表示系统对“这条新闻可能如何影响市场”的解释。

前端使用位置：

- 新闻详情弹窗：显示在“市场影响”区域
- 复盘工作台：显示在每条新闻卡片的正文说明区域

前端逻辑作用：

- 如果 `market_impact` 存在，优先展示它
- 如果为空，前端会退回使用 `rule_reason`
- 所以它是前端“影响解释”区域的首选内容来源

### `title`

`title` 是新闻的原始标题。

前端使用位置：

- 新闻详情弹窗：作为“原始标题”显示
- 新闻检索台与复盘工作台：当 `ai_summary` 不存在时作为回退标题显示

前端逻辑作用：

- `title` 是前端很多位置的兜底文本
- 如果 AI 摘要不可用，用户最终看到的标题就是 `title`

### `content`

`content` 是新闻的原始正文内容或正文截断内容。

前端使用位置：

- 新闻详情弹窗：正文区域
- 新闻检索台：正文预览区会从它或相关字段中提取预览
- 复盘工作台：当 `ai_summary` 和 `title` 都不足时，可作为兜底显示内容

前端逻辑作用：

- 它主要承担详情查看和预览兜底功能
- 一般不是最先展示的字段，但它决定了详情弹窗里用户能看到什么原始信息

### `rule_score`

`rule_score` 是 Stage 1 关键词打分阶段得到的基础分数。

它反映的是：这条新闻从“关键词命中”和“标的别名命中”的角度看，和系统关注范围有多相关。

前端使用位置：

- 当前前端页面不直接展示

前端逻辑作用：

- 当前页面不会把它作为标签或列展示给用户
- 它主要用于后端 Stage 2 的综合过滤逻辑，与语义相似度一起决定新闻是否继续进入下一阶段

因此，`rule_score` 是系统内部筛选信号，不是当前 UI 的直接展示字段。

### `rule_passed`

`rule_passed` 表示新闻是否通过规则阶段筛选。

前端使用位置：

- 当前前端页面不把它单独显示成字段

前端逻辑作用：

- 新闻检索台默认加载的新闻集合，已经隐含受到它影响
- 也就是说，用户在新闻检索页看到的“默认列表”，本身已经是规则通过后的结果之一

所以它更像“决定哪些新闻会出现在列表里”，而不是“出现在列表里后怎么展示”。

### `processing_status`

`processing_status` 表示这条新闻当前处于哪一个处理阶段。

典型值包括：

- `rule_screened`
- `llm_processed`
- `llm_discarded`
- `reviewed`

前端使用位置：

- 当前前端页面不直接展示

前端逻辑作用：

- 它主要服务于后端处理链路和复盘归档状态管理
- 当前网页不会把这个字段直接展示给用户
- 但它会影响新闻在后续流程中是否被视为已处理、已归档或已进入复盘上下文

### `is_relevant_to_review`

`is_relevant_to_review` 表示系统是否认为这条新闻与复盘相关。

前端使用位置：

- 当前前端页面不直接展示

前端逻辑作用：

- 它主要用于后端筛选和复盘候选新闻范围控制
- 会影响哪些新闻进入复盘相关的数据集合
- 但当前前端不会把它单独展示出来

### `review_status`

`review_status` 表示某一天复盘记录当前处于什么状态。

主要值包括：

- `initialized`：记录已创建，但还没有真正开始写
- `draft`：已有人工编辑内容，处于进行中
- `reviewed`：这一天已完成复盘

前端使用位置：

- 复盘工作台列表：显示状态标签
- 复盘工作台列表：决定操作按钮显示“开始复盘 / 继续复盘 / 查看”
- 复盘抽屉：决定是否只读、是否可编辑、是否显示已复盘状态

前端逻辑作用：

- `initialized` 会被视作“待开始”
- `draft` 会被视作“进行中”
- `reviewed` 会被视作“已复盘”
- 它不仅影响显示文案，还影响抽屉进入后的交互模式

### `reviewer_news_notes`

`reviewer_news_notes` 表示用户在复盘工作台中填写的“新闻总结 / 主线判断 / 补充点评”。

前端使用位置：

- 复盘工作台抽屉：作为“新闻总结”输入框的内容来源
- 复盘保存后再次打开抽屉：用于回填草稿内容

前端逻辑作用：

- 如果这一天已有草稿，前端会优先回填它
- 如果没有，前端才会回退到 AI 分析生成的默认摘要
- 因此，这个字段决定了复盘抽屉打开时“新闻总结”区域最终展示的是人工内容还是系统默认内容

<a id="keywords-and-aliases"></a>
## 关键词与标的别名

关键词和标的别名都会参与新闻筛选，但职责不同。

关键词负责“话题加权”：

- 宏观词、市场词会提高相关新闻的通过概率
- 噪音词会压低相关新闻分数
- 它不直接绑定到某个具体标的

标的别名负责“标的归因”：

- 如果新闻提到了某个跟踪标的的常见写法，系统就能把新闻和该标的关联起来
- 这会影响 `related_symbols`，也会影响后续 LLM 的上下文判断

什么时候加别名：

- 你关心某个具体公司、ETF 或资产在新闻中被准确识别
- 新闻里经常出现该标的的中文名、简称、行业叫法或英文别名

什么时候加关键词：

- 你关心某类宏观或行业主题，希望相关新闻更容易通过
- 你想压低某类重复噪音新闻的权重

简单判断原则：

- 关注“某个具体标的”时，加别名
- 关注“某类话题或噪音”时，加关键词

<a id="review-workflow"></a>
## 复盘工作流

复盘工作流以最近已收盘的美股交易日为主线。

系统会先识别最近一个已收盘的复盘日，再在网页中展示待复盘日期。用户打开某天复盘后，系统会自动回填：

- 当日价格快照
- 对应新闻窗口内的新闻
- 日期级 AI 分析
- 上一个已完成复盘日的参考字段
- 这一天已有的草稿内容

之后用户可以继续编辑并保存内容。当前复盘内容主要包括：

- 新闻总结
- 大盘盘点
- 板块轮动
- 操作计划
- 深度总结

状态上可以理解为：

- `initialized`：记录已创建，但还没有真正开始写
- `draft`：已经有人工编辑内容，处于进行中
- `reviewed`：这一天的复盘已完成

### 手动归档当前版本

如果你担心 bug 或误操作覆盖掉当前复盘内容，可以在任意复盘日手动创建一次快照。系统不会自动归档，只有显式调用接口时才会把当前主表内容复制到快照表。

当前使用的两张快照表：

- `daily_review_snapshots`
- `daily_news_ai_analysis_snapshots`

版本号字段统一为整数 `version_no`，按同一日期递增：

- 第一次归档：`version_no = 1`
- 第二次归档：`version_no = 2`

当前支持的接口：

```bash
curl -X POST "$INGEST_API_BASE_URL/api/reviews/2026-03-20/snapshot" \
  -H "Authorization: Bearer $INGEST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"snapshotReason":"修复前手动备份"}'
```

接口说明：

- 方法：`POST`
- 路径：`/api/reviews/<archive_date>/snapshot`
- 示例：`/api/reviews/2026-03-20/snapshot`
- 请求体：可选，当前支持 `snapshotReason`
- 行为：按 `archive_date` 分别从 `daily_review_archive` 与 `daily_news_ai_analysis` 读取当前记录，并写入各自的快照表
- 返回：分别给出 `reviewSnapshot` / `analysisSnapshot` 的 `version_no`；如果其中一张主表不存在，会在 `skipped` 中说明

说明：

- 同一个 `archive_date` 会分别对 `daily_review_archive` 和 `daily_news_ai_analysis` 计算下一个 `version_no`
- 两张主表互不依赖；如果其中一张当天没有记录，另一张仍会成功归档
- 第一版只负责保存快照，不提供自动恢复 UI；如果后续要恢复，需要再单独增加恢复能力

<a id="testing"></a>
## 测试

项目当前包含集成测试与测试数据生成脚本。

集成测试：

```bash
.venv/bin/python tests/integration/run_weekly_integration.py \
  --worker-base https://my-financial-agent-test.rtw1994.workers.dev \
  --db-name my-financial-agent-test \
  --ingest-token "$INGEST_API_TOKEN"
```

生成历史基线 seed：

```bash
.venv/bin/python tests/testdata/prepare_history_seed.py \
  tests/testdata/test_week_seed_20260315.sql \
  tests/testdata/_generated_history_seed.sql
```

测试环境与生产环境分离，便于做集成验证和回归检查。

<a id="docs"></a>
## 文档

更多细节可参考：

- `docs/arch/TECHNICAL_ARCHITECTURE.md`
- `docs/rfcs/项目需求文档.md`
- `docs/api/NEWS_PIPELINE_SEQUENCE.md`
