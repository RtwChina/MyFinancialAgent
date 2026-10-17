# 数据模型：市场与板块

**日期**：2026-10-15  
**状态**：规划，尚未创建或执行迁移。

## 一、关系与权威来源

```text
tracked_symbols.symbol
  ├─ daily_review_archive.market_review_json.blocks[*].symbol
  ├─ daily_review_symbol_levels (archive_date, symbol)
  └─ daily_review_action_plans (archive_date, account_id, symbol)
       └─ 按 (archive_date, symbol) 读取共用价位

account_live_action_plans (account_id, symbol)
  └─ 有最新归档日时价位投影该日共用值；原两列仅为实时镜像
```

新表不对 `tracked_symbols` 建级联删除外键，以免删除目录标的导致历史内容或价位被删。新增标的身份在写入口校验；历史停用/已删除的身份允许延续。

## 二、规划迁移 027

计划文件：`cloudflare/migrations/027_market_review_symbol_levels.sql`（实现时创建；若并行工作已使用编号，按最新编号递增）。

| 对象 | 变化 | 历史数据处理 |
|---|---|---|
| `daily_review_archive` | 增加 nullable TEXT `market_review_json` | 不 UPDATE 回填 |
| `daily_review_symbol_levels` | 新表 | 不批量复制历史或 live |
| `daily_review_snapshots` | 增加 nullable TEXT `market_review_json`、`symbol_levels_json` | 旧快照保持原样 |
| 原 `market_sentiment_blocks_json`、`sector_rotation_blocks_json` | 保留 | 新保存不再更新，作为归并原始证据 |
| 日计划 `support_levels`、`resistance_levels` | 保留 | 旧内容是迁移候选，新路径不更新这两列；新计划可留默认 NULL |
| live 价位两列 | 保留 | 保存时从权威值更新实时镜像；无归档日时使用 |
| `key_levels` | 无迁移 | 不合并、不清理已有原值；新价位修改不重新生成它 |

每个当日价位行包含以下字段：

| 字段 | 类型 | 约束/含义 |
|---|---|---|
| `archive_date` | TEXT | NOT NULL；复盘日 `YYYY-MM-DD` |
| `symbol` | TEXT | NOT NULL；系统标的键，TNX 不改名 |
| `support_levels` | TEXT | NOT NULL DEFAULT ''；原多行文本 |
| `resistance_levels` | TEXT | NOT NULL DEFAULT ''；原多行文本 |
| `created_at`、`updated_at` | TEXT | 延续 Worker 现有时间格式 |

复合主键 `(archive_date, symbol)` 同时支持本日全量读取与单标的定位。本需求不增加额外索引。删除计划/笔记不删除该表行；明确清空价位保存空字符串，不能删行后再退回旧来源。

## 三、市场文档（存储 JSON）

`market_review_json` 为如下版本化包，不嵌入价位正文：

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "symbol-soxx-1",
      "type": "symbol",
      "symbol": "SOXX",
      "identity": {"catalogId": 42, "displayCode": "SOXX", "displayName": "半导体板块"},
      "children": [
        {"id": "dim-support-1", "kind": "support", "title": "支撑位"},
        {"id": "dim-thinking-1", "kind": "thinking", "title": "思考", "body": "观察板块强弱"}
      ]
    }
  ],
  "conflicts": []
}
```

示例 catalogId 仅表示结构；实际值来自目录，不硬编码。API 响应可以在价位二级补 `body` 供展示，POST 时该正文不作为价位写源。

### 一级主题

- `id`：文档内稳定且唯一；排序靠数组顺序，不靠 DOM 索引作为身份。
- `type`：`symbol` 或 `legacy`。新建只能是 `symbol`。
- `symbol`：`symbol` 块必填，使用管理目录系统键；`legacy` 为 null。
- `identity`：保存目录 id（可为 null）、当时展示代码和名称，目录删除后仍可显示；可用目录的当前显示信息优先，不重新猜其身份。
- `children`：有序二级数组；空数组可保存。
- `legacyOrigin`：仅旧内容投影或已存历史块具有，包含原日期、来源 `group: market|rotation`、原一级 id、原序号与原标题。投影 block id 固定由原日期＋来源组＋原数组序号生成，原 id 仅作为证据而非唯一键；二级 id 同样追加原二级序号。服务端每个来源只接受一次，客户不能复制/伪造来源来规避唯一性。新建主题无 legacyOrigin。
- 新旧沿用按日期选择：最近非空新文档作基线，只有更晚旧组可以替换基线中同 legacyOrigin.group 的块；无 legacyOrigin 的新建主题保留。新文档日期的冻结旧列不再参与候选。规则和例子见 research.md 第三节。
- `legacy` 块另保留原 `title` 和原二级标题/正文；所有文本只读。明确关联后变 `symbol`，仍保留原文和来源。
- `legacy` 块的所有二级（包括按标题被识别为支撑/压力的）一律以原标题和 `body` 原文保存在新文档中，不读写价位表。关联到标的后，这些原价位文字仍作为只读原文保留，不自动写入该标的共用价位；需要时由用户手动填写到共用价位。

同一标的新块唯一；确定性迁移产生的重复一级保留，服务端只允许已有重复身份继续存在。关联历史块到已存在标的时拒绝，用户不能借“关联”新制造重复。

### 二级维度

| `kind` | 标题 | 存储正文 |
|---|---|---|
| `support` | 支撑位 | `symbol` 块从价位表装配，不在新文档中保存；`legacy` 块保存原文 `body` |
| `resistance` | 压力位 | 同上 |
| `thinking` | 思考 | `body` 文本 |
| `cta` | CTA 流动性 | `body` 文本 |
| `collar` | JPM collar | `body` 文本 |
| `eps` | EPS 预计 | `body` 文本 |
| `custom` | 用户非空标题 | `body` 文本 |

每一级中各预设最多一个；自定义可多个。预设标题由 kind 推导，不能改成任意标题。kind 用固定字面量，不通过是否有正文推测类型。旧 `支撑位 (Support)`、`支持` 等确定的支撑标题可归为 support，压力同理；如标题带额外判断，原始标题在 legacyOrigin 的二级来源信息中保留。无法明确归类则 custom。所有原文保留，不解析/重新计算数值。

更换已有关联标的时，只要块含 support 或 resistance 二级便拒绝；与价位是否为空无关。删除该二级之后允许按原规则更换，旧标的价位仍保留。

## 四、复盘价位 API 对象

响应 `symbolLevels` 是按系统 symbol 索引的映射，值含 `supportLevels`、`resistanceLevels`。页面两个入口只读写这个映射。日计划响应中原同名字段是映射的投影，不是第三份编辑状态。

写请求 `marketReview.levels` 是补丁数组：每项有 `symbol`，至少一个明确字符串字段。字段省略保持原值；`""` 明确清空；NULL、数值不接受。不存在行第一次补丁时，以解析出的初始完整价位为基础补全未修改字段，再物化整行。

首次保存文档时，物化其全部关联标的和当日日计划标的的初始价位（包括两个空字符串）；后续保存只写变化的价位，不重复扫描/拷贝历史。仅更新结构或删除主题不清除价位。新添计划不自动制造市场主题，只有实际填写价位时才补主题/二级。

## 五、冲突证据

`conflicts` 为服务端产生的有序数组，每项包含：

- `symbol`、`field`（supportLevels/resistanceLevels）；
- `selectedValue`、`selectedSource`；
- `alternatives`：未采用的非空原文及来源日期、块 id 或 accountId；
- `id`：确定性身份，防止保存重开重复增加证据。

冲突中的 selectedValue 是“首次选择时的值”，不是以后变动的当前价位；页面分开展示。第一保存复制证据，后续保留；不让客户端直接重写证据原文。此轮没有冲突审核工作流或撤销功能。

## 六、展示身份

目录响应增加推导 `displayCode`；TNX 返回 US10Y，其余返回 symbol，并将 US10Y 纳入搜索候选别名。数据库 tracked_symbols 不加新行/新列，不改 `TNX` 或 `^TNX`。

复盘写请求、行情查询、新闻关联和计划键始终用 `TNX`。显示 identity 快照保留 US10Y；目录编辑仍显示系统键 TNX 的提示。

## 七、快照与衍生数据

- 显式 POST snapshot 时，复制当时新市场文档和该日价位映射到快照，两个 JSON 与该版本相对应，不能日后 JOIN 当前价位补正文。未落新结构的旧记录快照仍保留旧两列，不反向物化旧日期。
- 日计划其他字段（账户、动作、仓位、金额、每日记录、止盈、止损、思考）保持现有归属。共用仅涉及两项价位，不能顺手共享思考。
- `thesis_preview` 从新 blocks 的标题/思考生成，旧记录继续使用旧归并投影，不增加列表逐日期价位查询。
- 导出在消费边界装配正文；`GSPC` 专用导出不会把 `SPY` ETF 点位当指数。

## 八、状态迁移与生命周期

| 操作 | 新文档 | 日期价位 | 原数据 |
|---|---|---|---|
| 查看旧日 | 只在响应中归并 | 只在响应中选择初值 | 无写入 |
| 第一次保存旧日 | 保存 version=1 的文档/冲突 | 物化本日初值＋补丁 | 旧列保留 |
| 编辑/排序二级 | 替换对应结构 | 无变化（价位正文编辑除外） | 无变化 |
| 清空支撑/压力 | 二级可保留 | 保存对应空字符串 | 不回填旧值 |
| 删除二级/一级 | 删除对应结构 | 保留 | 不连带删除计划 |
| 删除计划 | 计划集合变动 | 保留 | 不删除市场块 |
| 明确填写计划价位 | 页面草稿中追加主题/二级；未提交 blocks 的写入口由服务端补齐 | 修改同日标的共用值 | 同日跨账户显示一致 |
| 最新日 live 价位编辑 | 必要时补最新日主题/二级 | 只改最新日该字段 | 历史其他日不变 |
| 保存为空文档 | `blocks: []` | 保留 | 不从旧列复活主题 |
| 新日沿用 | 默认文档暂存内存 | 来源值作本日初始候选 | 来源日不变 |
| initialize 非 reviewed 日 | 置 NULL | 不写、不删；初值留给读投影和首次物化 | 旧列按现有行为置 NULL；日计划为空才复制 live |
| initialize reviewed 日 | 不变 | 不变 | 返回 skipped |

复盘状态 `initialized/draft/reviewed` 和显式编辑模式保持现状；完成新闻归档/账户快照成功后才置 reviewed。本需求不新增状态枚举。

## 九、校验边界

新 API 输入须验证数组/对象形状、稳定 id 唯一、有限 kind、标的候选、标题非空、预设唯一性、历史原文不可变与重复例外身份。查询/写 SQL 全部绑定参数；DOM 用文本节点或现有 escapeHtml/escapeAttribute，用户正文不能插入未转义 HTML。旧数据读取容忍现有正规化格式，但绝不借此宽松路径接受新写入错误。
