## Context

当前结构化操作计划已经落地为 `daily_review_action_plans`，以 `archive_date + symbol` 表示某天某个标的一行计划，并额外保存 `market_type` 用于 `美股 / 大A` 分组。这个模型解决了自由文本难维护的问题，但仍把操作计划绑定到市场分组，而不是绑定到真实执行资金所在的账户。

用户当前有 3 个账户：`老虎-美股`、`东方财富-国内`、`天天基金-国内`。这些账户不仅市场范围不同，资金规模、可用资金、币种和调仓约束也不同。操作计划应围绕“哪个账户执行这条计划”展开；市场属性继续服务价格、新闻和标的展示。

约束：

- 不能破坏已有结构化操作计划和旧 `asset_plan` 摘要兼容。
- 测试环境与生产环境仍通过既有 APP_ENV / Worker / D1 配置隔离。
- 第一版账户资金由用户手动维护，不接券商同步，不处理下单。

## Goals / Non-Goals

**Goals:**

- 新增账户管理数据模型和账户管理页面/API。
- 操作计划绑定账户，并按账户分组展示。
- 支持同一复盘日同一标的在不同账户中拥有不同计划。
- 保留 `market_type` 作为兼容字段和标的/市场提示，不再作为操作计划主分组。
- 账户标题展示总资产、可用资金、币种等资金摘要。
- 旧数据无账户时可显示、可迁移、可继续保存。

**Non-Goals:**

- 不接入老虎、东方财富、天天基金 API。
- 不自动同步资金、持仓或成交。
- 不做账户资金历史快照。
- 不做交易下单、委托管理或资金流水。
- 不改变价格采集、新闻采集和市场路由规则。

## Decisions

### 决策 1：新增 `investment_accounts` 表

建议表结构：

```sql
CREATE TABLE IF NOT EXISTS investment_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    broker TEXT,
    account_type TEXT NOT NULL DEFAULT 'stock',
    region TEXT,
    currency TEXT NOT NULL DEFAULT 'CNY',
    total_assets REAL,
    available_cash REAL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name)
);
```

字段口径：

- `total_assets`：账户整体规模，包含持仓市值、现金和其他可计入账户权益的资产。
- `available_cash`：当前可立刻用于买入、申购或调仓的资金，可能扣除冻结资金、未成交委托或平台限制。
- `account_type`：第一版可取 `stock`、`fund`、`mixed`，用于前端提示和后续过滤。
- `region`：账户区域/交易口径，如 `US`、`CN`，只作为账户属性，不直接驱动价格源。

替代方案：把账户写死在前端配置中。放弃，因为资金字段需要用户维护，且后续可能新增账户。

### 决策 2：操作计划通过 `account_id` 绑定账户

`daily_review_action_plans` 新增：

```sql
account_id INTEGER REFERENCES investment_accounts(id)
```

唯一性从：

```sql
UNIQUE(archive_date, symbol)
```

演进为：

```sql
UNIQUE(archive_date, account_id, symbol)
```

这样同一天 `MU` 可以同时出现在不同账户中，且每个账户内仍避免重复。

替代方案：继续用 `market_type`，把 `老虎-美股` 映射成市场。放弃，因为账户是资金实体，市场只是标的属性，两者语义不同。

### 决策 3：保留 `market_type`，但降级为兼容字段

`market_type` 暂不删除：

- 用于旧数据回填账户时的启发式映射。
- 用于标的展示和迁移兼容。
- 避免一次性重构影响价格源、新闻源和历史摘要。

新 UI 不再用 `market_type` 作为操作计划分组标题。保存新计划时可继续写入标的对应市场，便于旧路径读取。

### 决策 4：默认账户种子数据

迁移时应保证至少存在：

```text
老虎-美股      currency=USD account_type=stock region=US sort_order=10
东方财富-国内  currency=CNY account_type=stock region=CN sort_order=20
天天基金-国内  currency=CNY account_type=fund  region=CN sort_order=30
```

生产迁移应使用 upsert，不覆盖用户已手动编辑的资金字段。测试环境可使用固定种子，方便 smoke 测试。

### 决策 5：旧计划账户回填策略

历史操作计划可能只有 `market_type`：

- `美股` 默认回填到 `老虎-美股`。
- `大A` 默认回填到 `东方财富-国内`。
- 无法判断时回填到 `未分配账户`，该账户默认 enabled，可在 UI 中提醒用户整理。

不自动把基金类计划识别到 `天天基金-国内`，除非未来有明确的标的类型/基金标识；第一版避免猜错账户。

### 决策 6：API 返回账户和账户化计划

bootstrap 建议返回：

```json
{
  "investmentAccounts": [...],
  "actionPlans": [
    {
      "accountId": 1,
      "accountName": "老虎-美股",
      "symbol": "MU",
      "marketType": "美股"
    }
  ]
}
```

保存时后端必须校验：

- `accountId` 存在且启用，或按兼容规则落到默认/未分配账户。
- 同一 `archive_date + account_id + symbol` 不重复。
- `symbol` 仍遵循当前标的管理校验。

### 决策 7：账户管理页走现有 Web/Worker 风格

账户管理页与标的管理类似，提供列表 + 表单：

- 列表展示账户名、类型、币种、总资产、可用资金、启用状态和排序。
- 表单允许新增/编辑账户。
- 禁用账户不在新增操作计划时默认展示，但历史计划仍可显示。

### 决策 8：`asset_plan` 摘要按账户生成

保存结构化计划时，兼容 Markdown 摘要格式调整为：

```text
## 老虎-美股

### MU
- 动作：持仓观察
- 当前仓位：10%-20%
- ...

## 东方财富-国内
...
```

旧读取路径仍能看到完整计划，新摘要也更贴近真实调仓语境。

## Risks / Trade-offs

- [历史唯一键迁移复杂] → 新增表/索引迁移时先填充 `account_id`，再创建新唯一索引；保留旧字段用于回滚。
- [旧数据被错误归到账户] → 只对明确 `美股 / 大A` 做默认映射，其余进入“未分配账户”，让用户人工整理。
- [资金字段被误解为实时同步] → UI 文案应强调为手动维护值，命名使用“总资产”“可用资金”，不承诺自动刷新。
- [账户禁用后历史计划消失] → 历史计划按账户 id 展示，即使账户禁用也保留只读/历史可见。
- [同一标的跨账户后前端重复判断失效] → 重复校验必须从全局 symbol 改为账户内 symbol。

## Migration Plan

1. 新增账户表迁移和测试 schema。
2. 写入默认账户种子，生产 upsert 不覆盖资金字段。
3. 为 `daily_review_action_plans` 增加 `account_id`。
4. 根据旧 `market_type` 回填 `account_id`；无法判断则回填“未分配账户”。
5. 调整唯一索引为 `archive_date + account_id + symbol`。
6. Worker bootstrap/save 返回并接受账户字段。
7. 前端新增账户管理页，并将操作计划改为账户分组。
8. 更新 `asset_plan` 摘要生成。
9. 补 smoke/integration 测试后再用于生产环境。

回滚策略：

- 保留 `market_type` 和旧 `asset_plan` 摘要字段。
- 若前端账户化视图回滚，后端仍可按 `market_type` 展示旧分组。
- 新账户表为附加表，回滚不会删除历史计划。

## Open Questions

- `天天基金-国内` 第一版是否只用于基金计划，还是允许任何国内资产计划手动选择？
- 账户资金是否需要记录“更新时间”字段，提醒用户资金值多久没有维护？
- 操作计划里的仓位百分比是相对账户总资产，还是继续作为用户自由语义？第一版建议相对账户总资产展示，但不强制计算。
