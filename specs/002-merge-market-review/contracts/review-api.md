# 读写契约：复盘与实时计划

**日期**：2026-10-15  
**状态**：设计中的契约，尚未实现。路由复用既有接口，不新建远程价位编辑接口。

数据实体和存储字段见 [data-model.md](../data-model.md)。下列例子只展示变动字段，其他原复盘/计划字段保持现有定义。

## 一、GET /api/reviews/{date}/bootstrap

延续原 bootstrap 的账户、新闻、行情、分析、快照与 latestArchiveDate。新的合并笔记响应为：

```json
{
  "archiveDate": "2026-10-14",
  "latestArchiveDate": "2026-10-14",
  "structuredNotes": {
    "marketReview": {
      "version": 1,
      "source": "saved",
      "sourceDates": [],
      "blocks": [
        {
          "id": "soxx-1",
          "type": "symbol",
          "symbol": "SOXX",
          "identity": {"catalogId": 42, "displayCode": "SOXX", "displayName": "半导体板块"},
          "children": [
            {"id": "soxx-support-1", "kind": "support", "title": "支撑位", "body": "486–532（强）"}
          ]
        }
      ],
      "conflicts": []
    }
  },
  "symbolLevels": {
    "SOXX": {"supportLevels": "486–532（强）", "resistanceLevels": "550–580（强）"}
  },
  "actionPlans": [
    {"accountId": 1, "symbol": "SOXX", "supportLevels": "486–532（强）", "resistanceLevels": "550–580（强）"}
  ]
}
```

- `source`：`saved`（已存新结构）、`legacy`（本日旧结构投影）、`inherited`（使用历史默认）、`empty`（无内容）。显式保存 `blocks: []` 是 saved，不能当成待回填。
- `sourceDates`：实际历史默认来源日期；可能两组不同，不伪装成目标日原文。元数据不参与金融判断。
- `symbolLevels` 包含本日已保存价位、当日计划及有效主题所需价位；无行情不删除标的。
- 响应的 price child `body` 是 symbolLevels 投影；页面写路径只维护 symbolLevels，不维护独立 child body。
- `conflicts` 包含首次归并未采纳原文，已保存证据也回传；只读可查看，编辑时突出提示。
- 原 `structuredNotes.marketSentiment/sectorRotation` 和 draft 内两组前端专用别名退出新页面合同；数据库原列仍作为 legacy 读取来源。不在浏览器继续维护两组状态。
- GET 全程不 INSERT/UPDATE/DELETE，不调用 symbol resolve/LLM/Yahoo。

## 二、GET /api/reviews/{date}

保持 `{archiveDate, review}` 结构与无记录时 review=null；在 review 内追加同构 `marketReview` 与 `symbolLevels`，但不跨日沿用，只投影本日持久内容及旧来源。原数据库 JSON 列可以继续由原 row 字段返回，不作为新写入入口。详情与 bootstrap 的差异是沿用，而不是两个不同的归并算法。

## 三、GET 标的目录

适用 `/api/symbols`、`/api/symbols/{id}`、`/api/reviews/{date}/action-plan-symbols`、`/api/account-live-action-plans/symbols`。

- 保持既有字段命名：管理目录为 snake_case，复盘目录已有 camelCase；只新增 `displayCode`，不重命名其他字段。
- TNX 的核心结果为 `symbol: "TNX"`、`displayCode: "US10Y"`、Yahoo `^TNX`、原显示名；展示搜索别名包含 US10Y，数据库不写入。
- `active=0` 继续包含停用标的；新增候选仅 active 标的，旧块可以使用保存 identity 显示不可用状态。
- 对外选择提交必须用系统 symbol，不提交 displayCode；不从 displayCode 创建新资产。

## 四、POST /api/reviews/{date}

新增字段 `marketReview`。保留现有 reviewerNewsNotes、tradingSummary、reviewStatus、actionPlans 等字段的业务归属。

```json
{
  "reviewStatus": "draft",
  "reviewerNewsNotes": "当天新闻总结",
  "tradingSummary": "",
  "marketReview": {
    "blocks": [
      {
        "id": "soxx-1",
        "type": "symbol",
        "symbol": "SOXX",
        "children": [
          {"id": "soxx-support-1", "kind": "support", "title": "支撑位"},
          {"id": "soxx-thinking-1", "kind": "thinking", "title": "思考", "body": "观察板块强弱"}
        ]
      }
    ],
    "levels": [
      {"symbol": "SOXX", "supportLevels": "500–520（强）"}
    ]
  },
  "actionPlans": [
    {"accountId": 1, "symbol": "SOXX", "actionType": "持仓观察", "currentPosition": "15%-20%"}
  ]
}
```

### 存在、空值与替换规则

| 输入 | 行为 |
|---|---|
| 省略 marketReview | 不替换市场结构、不推测价位变更；保存其他原字段按现状 |
| marketReview 为 null/非对象 | 400 |
| 提交 marketReview | blocks 和 levels 都须为数组；blocks 是整份结构替换，levels 是字段补丁 |
| blocks=[]、levels=[] | 明确清空市场主题，价位和计划不被连带清空 |
| 某补丁省略 supportLevels | 保持该字段现值 |
| supportLevels="" | 明确清空；后续读取不能回退到旧计划值 |
| 补丁字段 null/数字 | 400，不能当作空字符串 |
| 一个补丁只有 symbol，无价位字段 | 400 |
| 同 symbol 出现多个补丁 | 400，避免顺序覆盖歧义 |
| 省略 actionPlans | 日计划的账户字段/集合不变，价位读投影可改变 |
| actionPlans=[] | 删除本日日计划；最新日同步清空 live 集合；日期价位仍保留 |
| actionPlans 中 supportLevels/resistanceLevels | 仅允许省略或与有效共用值一致；不同值返回 409，提示使用 marketReview.levels |
| 同时提交原 marketSentimentBlocks/sectorRotationBlocks 或其 snake_case 别名 | 400 `旧复盘字段已停用，请刷新页面后重试`，不双写旧列 |

新结构校验在写 batch 前完成；id、目录身份、history 原文与重复例外由服务器验证。身份快照由当前目录或旧合法来源生成，客户端不得伪造已删除标的/legacyOrigin 创建新主题。

### 价位与结构补齐

- 正常价位补丁更新本日 symbolLevels，并装配所有账户计划读值；补丁的 symbol 不要求出现在 blocks 中，价位可独立于主题存在。
- 提交了 `marketReview.blocks` 时，blocks 即最终结构，服务端不追加主题/二级。页面在用户填写计划价位时已在草稿中补齐；用户随后在草稿中删除的主题（不论是否既有）不会被补回。页面删除操作不产生价位补丁。
- 服务端补齐只用于未提交 blocks 的写入口（live CRUD、省略 marketReview 的复盘保存、Python 写入）：真正填写新的非空价位且目标结构缺少主题/二级时追加；清空补丁和保存未修改的价位镜像不重新创建结构。
- 首次保存旧日物化初始价位与冲突证据；同字段已有权威空值时不重新读旧来源。
- 未关联 legacy 原文不能改；允许保留/删除或关联未用标的。迁移的重复标的块只有相同旧来源 id 可继续保留。
- 每请求单个 D1 batch 原子提交：归档文档、价位、日计划集合和应同步的 live 镜像；失败无部分写入。大请求使用集合 SQL 控制语句条数，不把一个业务事务交给跨批 runWriteBatches。
- 最新日同步整个计划集合的现状保持；仅价位编辑时也更新相应 live 镜像，不修改账户动作/仓位。其他日写入不动 live。

成功仍 HTTP 200，新增返回：

```json
{
  "ok": true,
  "archiveDate": "2026-10-14",
  "reviewStatus": "draft",
  "actionPlanCount": 1,
  "syncedToLive": true,
  "marketReview": {
    "version": 1,
    "blocks": [
      {
        "id": "soxx-1", "type": "symbol", "symbol": "SOXX",
        "identity": {"catalogId": 42, "displayCode": "SOXX", "displayName": "半导体板块"},
        "children": [
          {"id": "soxx-support-1", "kind": "support", "title": "支撑位", "body": "500–520（强）"},
          {"id": "soxx-thinking-1", "kind": "thinking", "title": "思考", "body": "观察板块强弱"}
        ]
      }
    ],
    "conflicts": []
  },
  "symbolLevels": {"SOXX": {"supportLevels": "500–520（强）", "resistanceLevels": "550–580（强）"}}
}
```

返回本次保存后的完整结构。前端以响应替换并清除本地 dirty levels。无需为响应重新查询每个标的。

### 错误边界

- 400：数据形状/类型错误、自定义空标题、未知 kind、伪造旧来源、新建不存在/停用标的。
- 409：新增重复标的、含价位二级的标的更换、修改未关联历史原文、提交互相冲突的价位写源。
- 数据库错误：沿用现有 Worker 错误封装，不能吞掉后声称保存成功；事务回滚。
- 不改变现有访问控制；不增加允许通过任意自定义前端接口写数据库的通用入口。

## 五、POST /api/reviews/{date}/complete

- 正常桌面路径仍为先 save 再 complete，complete 不接受一套独立价位写源。
- 用合并市场结构执行原一个必填分析步骤校验，旧两个字段的 missingFields 替换为 marketReview；新闻、计划、深度总结的原规则不扩大。
- `requireCompleteContent` 仍是既有开关，不在此需求强制所有历史批量完成补齐内容。
- 批量 autoFill 使用 `autoFill.marketReview`（同样的 blocks＋levels）。本日已保存结构/价位优先于默认；明确空结构/空价位不恢复。历史从早到晚处理、保留最新日、无参考可完成的既有行为不变。
- 批量 autoFill 后 readiness 基于保存后的有效文档，而非保存前 existing；不因旧大盘/轮动为空误判。
- complete 使用共用价位投影日计划；账户影响只改价位来源，不改变计算规则。归档新闻、账户快照、完成状态的既有幂等语义保留。

## 六、POST initialize / delete / snapshot

- initialize 和 delete 仍路由到原初始化语义，不重新定义为物理删除复盘；reviewed 返回 skipped，不变更结构和价位。
- 非 reviewed 初始化新 JSON/旧列为 NULL，保持现有重置范围；已有日期价位不删除。日计划为空才复制 live；初始化不写日期价位行，当日初值由读投影计算，首次保存或首次 live 写入时连同冲突证据物化。
- snapshot 增加保存当时 market_review_json 与 symbol_levels_json 的职责；旧快照不回填，不新增 GET snapshot API，不承诺快照恢复功能。

## 七、实时计划 CRUD

路由和其他字段保持 `/api/account-live-action-plans` GET/POST、`/{id}` GET/PUT/DELETE。

- GET/单项 GET：有最新归档日时 supportLevels/resistanceLevels 从该日权威值读取；未物化旧日使用同样的首次归并投影并回传必要 conflicts 元数据。无归档日时逐字段按账户展示顺序取第一份非空 live 原值，所有同标的账户统一投影并给出差异提示；零写库、不新建日期。
- 首次 POST/PUT 到未物化最新日：先从写入前的有效展示结构（与 bootstrap 相同，含跨日沿用，并记录 sourceDates）生成并冻结初始 market_review_json 和 conflicts，然后叠加本次显式补丁，与日期价位/live/日计划一次 batch 提交。例：市场500、计划480、本次改510；证据仍为首次采用500/未采用480，当前共用值为510。不能提交后再拿510重算首次冲突。没有价位变化的首次 live 写入也采用这一物化顺序。新初始化日只改 live 仓位后，打开复盘仍能看到沿用主题，不能物化为 `blocks: []`。
- POST/PUT：明确提交变化的价位字段即更新最新日期该标的共用字段，并更新同标的其他账户的 live 镜像；省略价位字段时不改价位。新增同标的计划未提交价位则带出已有值。
- live 前端改仓位/排序时只发送变化字段，不把老 detail state 的两列价位作为重新覆盖请求。
- CRUD 与 latest 日计划集合同步放同一业务 batch；更新 latest 日期不影响更早日期。非价位更新只在确有未物化旧数据时初始化日期模型，随后不把删除过的主题恢复。
- DELETE 删除计划和既有 latest 日计划镜像，保留市场主题、价位及其他账户同标的计划。
- 仍拒绝重复 `(accountId,symbol)`；账户和 symbol 变更校验沿用现状，不把改账户等同改价位。

## 八、Python/本地读写边界

- `src/db_utils.py` 的归档写入改用新结构字段，不继续引用迁移 022 已删除的纯文本列；initialize 保留 reviewed 保护。
- 日计划读取投影本日价位；`replace_review_action_plans` 接收可选显式 `symbol_levels` 补丁参数，和计划变更同一 SQLite 事务。没有补丁时不得用计划镜像覆盖权威值；旧首次材料使用一致的确定性初值规则。
- 本地 archive 保存的新块/冲突转换遵循数据模型，不新建一套 SQLite schema 初始化文件。
- `scripts/temporary/convert_asset_plan_to_action_plans.py` 是旧离线转换器，不纳入线上运行、不对生产执行。本轮测试夹具生成器改输出新格式，不能用旧工具直接覆盖新权威价位。
