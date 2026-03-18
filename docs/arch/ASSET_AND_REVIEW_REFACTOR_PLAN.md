# 标的体系与复盘页重构方案

## 1. 背景与目标

当前项目在三个地方存在同一类问题：

- 标的定义依赖硬编码，扩展成本高
- 价格 code、新闻识别 alias、前端展示名称没有统一主数据
- 新闻类型、复盘价格分组、分析展示之间耦合较重

本次重构目标是建立一套统一的“资产主数据体系”，让以下能力都基于同一层资产定义运行：

- 标的管理
- 价格采集
- 新闻识别与分类
- 复盘页展示

## 2. 需求总结

### 2.1 标的类型

系统内标的分为三类：

- 大盘
- 板块
- 个股

需要单独维护在数据库中，并提供一个“标的管理页面”，允许随时新增、编辑、停用。

### 2.2 code 映射

用户插入标的时，录入的 code 不一定和 Yahoo 使用的 code 一致。

因此系统不能只依赖单一 symbol，必须支持：

- 内部标准标识
- 多 provider code 映射
- 新闻别名映射
- 展示 code

### 2.3 新闻类型优化

当前新闻类型需要从“宏观 / 标的”细化为：

- 宏观（大盘 + 板块）
- 个股

建议最终在数据层拆成：

- 一级类型：`macro | stock`
- 二级范围：`market | sector | null`

这样 UI 上可以展示成：

- 宏观 · 大盘
- 宏观 · 板块
- 个股

### 2.4 复盘页价格分组

复盘时的“当日价格”需要按三组展示，并支持折叠：

- 大盘分析
- 板块分析
- 个股深度研究

其中：

- 大盘分析：欧美指数、亚洲指数、大宗商品、美元、VIX
- 板块分析：科技与可选消费、能源与金融等
- 个股深度研究：核心关注个股

## 3. 总体设计

## 3.1 核心原则

不要再用“一个 symbol 打天下”的方式继续扩展。

系统改为三层模型：

1. 资产定义层
2. 标识映射层
3. 业务使用层

### 3.1.1 资产定义层

定义“这是什么资产”：

- 中文名
- 英文名
- 类型（大盘 / 板块 / 个股）
- 资产类别（指数 / 商品 / 汇率 / ETF / 股票）
- 所属区域
- 展示顺序

### 3.1.2 标识映射层

定义“这个资产在不同上下文里叫什么”：

- Yahoo code
- 手工录入 code
- 新闻别名
- 展示 code

### 3.1.3 业务使用层

价格采集、新闻识别、复盘展示都只通过资产主数据使用，不再各自维护一套 symbol 规则。

## 4. 数据库设计

### 4.1 主表：`tracked_assets`

建议新增：

```sql
CREATE TABLE tracked_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code TEXT NOT NULL UNIQUE,
  asset_name_cn TEXT NOT NULL,
  asset_name_en TEXT,
  asset_type TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  region TEXT,
  display_code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

字段说明：

- `asset_code`：内部标准标识，例如 `CN_INDEX_SSE`
- `asset_name_cn`：中文名，例如 `上证指数`
- `asset_name_en`：英文名，例如 `SSE Composite`
- `asset_type`：`market | sector | stock`
- `asset_class`：`index | commodity | fx | etf | equity`
- `display_code`：前端默认展示 code，例如 `000001.SS`
- `is_active`：是否启用
- `display_order`：前端排序

### 4.2 映射表：`tracked_asset_identifiers`

```sql
CREATE TABLE tracked_asset_identifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  purpose TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES tracked_assets(id)
);
```

字段说明：

- `identifier_type`：
  - `yahoo`
  - `manual`
  - `news_alias`
  - `display`
- `identifier_value`：实际值
- `purpose`：
  - `quote`
  - `news`
  - `display`
- `is_primary`：是否主映射

### 4.3 新闻表扩展建议

当前新闻表建议扩展这些字段：

- `news_type`：`macro | stock`
- `macro_scope`：`market | sector | null`
- `primary_asset_code`
- `related_asset_codes`

这样新闻最终分类能表达成：

- `macro + market`
- `macro + sector`
- `stock`

## 5. 标的管理页面设计

## 5.1 页面目标

提供一个独立“标的管理”页面，用于维护资产主数据。

### 5.1.1 页面功能

- 查看全部资产
- 按类型筛选：大盘 / 板块 / 个股
- 新增资产
- 编辑资产
- 停用资产
- 维护映射 code
- 维护新闻别名
- 调整显示顺序

### 5.1.2 新增/编辑表单字段

- 中文名
- 英文名
- 类型
- 资产类别
- 区域
- 展示 code
- Yahoo code
- 新闻别名（多值）
- 是否启用
- 排序

### 5.1.3 推荐页面结构

- 列表区
  - 中文名
  - 类型
  - 展示 code
  - Yahoo code
  - 状态
  - 操作
- 详情抽屉 / 弹窗
  - 基础信息
  - code 映射
  - 新闻别名
  - 保存 / 停用

## 6. 价格采集改造方案

### 6.1 当前问题

当前价格采集依赖硬编码 symbol 列表，扩展成本高。

### 6.2 改造方案

价格采集逻辑改为：

1. 从 `tracked_assets` 读取启用资产
2. 通过 `tracked_asset_identifiers` 找到 `purpose=quote` 且 `identifier_type=yahoo` 的映射
3. 用该映射执行价格采集
4. 落库时保留原始 code，但前端展示优先取资产主数据中文名

### 6.3 前端展示规则

价格卡统一显示：

- `中文名 · code`

例如：

- `上证指数 · 000001.SS`
- `标普500 · ^GSPC`
- `美元指数 · DX-Y.NYB`

## 7. 新闻分类改造方案

## 7.1 新分类模型

### 一级分类

- `macro`
- `stock`

### 二级分类

仅对 `macro` 有效：

- `market`
- `sector`

### UI 展示

- `宏观 · 大盘`
- `宏观 · 板块`
- `个股`

## 7.2 分类标准

### 宏观 · 大盘

满足任一特征：

- 央行、利率、通胀、汇率、地缘风险
- 大盘指数、风险偏好
- 大宗商品
- 跨市场流动性变化

### 宏观 · 板块

满足任一特征：

- 行业政策
- 行业景气
- 板块资本开支
- 板块供需变化
- 影响对象是行业 / 主题，而不是单一公司

### 个股

满足任一特征：

- 主体是具体上市公司
- 财报、指引、订单、产品、监管、并购、管理层、股东变化

## 7.3 规则 + LLM 协同方案

### 规则层

基于 `tracked_asset_identifiers` 中的 `news_alias` 做第一层命中：

- 命中 `stock` 资产：优先归为个股候选
- 命中 `market/sector` 资产：优先归为宏观候选

### LLM 层

LLM 用于：

- 歧义场景判别
- 最终一级 / 二级分类
- 识别主资产与关联资产
- 给出重要性星级

### LLM 输出建议

```json
{
  "news_type": "macro",
  "macro_scope": "sector",
  "primary_asset_code": "US_SECTOR_AI",
  "related_asset_codes": ["US_STOCK_MU", "US_STOCK_MSFT"],
  "importance_stars": 4,
  "ai_summary": "...",
  "market_impact": "..."
}
```

## 7.4 LLM 提示词标准建议

提示词里要明确：

- 如果事件主体是具体公司，默认优先判 `stock`
- 如果影响对象是行业/主题，判 `macro + sector`
- 如果影响对象是指数、利率、汇率、大宗商品、地缘和风险偏好，判 `macro + market`
- 不允许把单公司新闻误判成板块主线，除非新闻明确描述行业级扩散影响

## 8. 复盘页改造方案

## 8.1 当日价格区域

改造成 3 个可折叠区块：

### 大盘分析

展示：

- 欧美指数
- 亚洲指数
- 大宗商品
- 美元 / VIX

### 板块分析

展示：

- 科技与可选消费
- 能源与金融
- 其他重要板块

### 个股深度研究

展示：

- 当前重点个股

## 8.2 数据来源

复盘页价格分组不再靠 symbol 猜，而是直接依据 `tracked_assets.asset_type`：

- `market`
- `sector`
- `stock`

## 8.3 复盘新闻区

新闻区类型显示同步升级：

- 宏观 · 大盘
- 宏观 · 板块
- 个股

## 9. API 方案

建议新增：

- `GET /api/assets`
- `POST /api/assets`
- `PATCH /api/assets/:id`
- `GET /api/assets/:id/identifiers`
- `POST /api/assets/:id/identifiers`
- `DELETE /api/assets/:id/identifiers/:identifierId`

建议复盘 bootstrap 扩展返回：

```json
{
  "market_prices": [],
  "sector_prices": [],
  "stock_prices": []
}
```

这样前端不需要再自行分组。

## 10. 实施顺序

### Phase 1：主数据层

- 建 `tracked_assets`
- 建 `tracked_asset_identifiers`
- 把现有硬编码标的迁入数据库

### Phase 2：标的管理页面

- 先支持增删改查
- 再支持 alias / code 映射维护

### Phase 3：价格采集接入主数据

- 从数据库读取 quote 标的
- 不再依赖代码硬编码 symbol 列表

### Phase 4：新闻分类升级

- 扩展新闻表字段
- 加规则命中资产
- 更新 LLM 分类提示词

### Phase 5：复盘页分组展示

- 价格三组折叠展示
- 新闻分类口径升级

## 11. 风险与注意事项

### 11.1 不建议的做法

不建议只在现有表里加一个 `asset_type` 字段继续硬补：

- code 映射问题仍然存在
- 新闻 alias 仍然分散
- 展示层仍然耦合

### 11.2 推荐做法

一定要建立：

- 资产主表
- 标识映射表

这是这次重构的根。

## 12. 最终建议

本次需求最合理的技术路线是：

- 用 `tracked_assets` 统一资产定义
- 用 `tracked_asset_identifiers` 统一 code / alias / display 映射
- 用 `news_type + macro_scope + asset_code` 统一新闻分类
- 用资产类型驱动复盘页三组展示

这样后续新增资产、新增板块、新增 provider、调整新闻分类标准，都不需要再改一圈代码。
