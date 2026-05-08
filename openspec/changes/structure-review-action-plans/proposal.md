## Why

每日复盘中的“个股与资产操作计划”目前保存在 `asset_plan` 文本字段中，数据量增加后难以按标的扫描、回看和维护。用户已经确认需要将操作计划改为按日期和标的组织的结构化数据，同时保留旧文本的兼容能力。

## What Changes

- 新增每日复盘操作计划子表，用 `archive_date + symbol` 表示某天某个标的一行完整计划。
- 将复盘页“操作计划”步骤从大 textarea 改为版本 A：表格主视图 + 下方行内编辑区。
- 操作计划字段固定为：标的、动作、开仓计划、止盈计划、止损计划、支撑压力位、当前仓位、思考。
- 动作固定为三态：`准备开仓`、`持仓观察`、`已清仓复盘`。
- 当前仓位固定为四档：`0-10%`、`10%-20%`、`20%-30%`、`>30%`。
- 支撑压力位保留为多行结构化文本，不拆成过细字段。
- Worker bootstrap/save 接口支持读取和保存结构化 `actionPlans`。
- 保留旧 `asset_plan TEXT` 作为兼容摘要字段，新结构化计划保存时同步生成文本摘要。
- 提供一次性临时脚本 `scripts/temporary/convert_asset_plan_to_action_plans.py`，用于把历史 `asset_plan` 辅助转换为结构化计划草稿/写入结果。

不做项：

- 不新增操作计划快照表。
- 不自动静默覆盖历史文本。
- 不把支撑压力位拆成价格带明细表。
- 不改变新闻总结、大盘盘点、板块轮动、交易总结等其他复盘步骤。
- 不把历史转换做成长期 API 或正式前端功能。

## Capabilities

### New Capabilities

- `review-action-plans`: 每日复盘支持按日期和标的保存、展示、编辑结构化操作计划，并提供一次性历史文本迁移能力。

### Modified Capabilities

- None.

## Impact

- 数据库：
  - 新增 D1/SQLite 迁移，创建 `daily_review_action_plans`。
  - 测试 schema 需同步新增子表。
- Worker API：
  - `GET /api/reviews/:date/bootstrap` 返回 `actionPlans`。
  - `POST /api/reviews/:date` 接收并保存 `actionPlans`。
- 前端：
  - `cloudflare/web/index.html` 和 `cloudflare/web/app.js` 的操作计划步骤改为结构化表格和编辑区。
  - `cloudflare/web/styles.css` 增加版本 A 样式。
- 本地 Python/脚本：
  - `src/db_utils.py` 增加本地结构化计划读写能力。
  - `scripts/temporary/convert_asset_plan_to_action_plans.py` 提供 dry-run/apply 临时迁移。
- 兼容性：
  - 旧 `asset_plan` 不删除。
  - 旧日期没有结构化计划时，前端应显示旧文本参考区或回退内容。
  - 新保存的结构化计划应同步生成 `asset_plan` 文本摘要，保证复盘列表和旧导出仍可用。
