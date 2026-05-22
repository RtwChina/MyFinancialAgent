# SM-022: 账户管理活态计划 CRUD

## 目标

验证账户管理页可创建、编辑、删除账户活态操作计划，并且 API 列表可读回最新状态。

## 前置条件

- 本地或测试环境已执行 migration `023_account_live_action_plans.sql`
- `/api/investment-accounts` 至少存在 1 个 `enabled = 1` 的账户
- `/api/account-live-action-plans/symbols` 返回至少 1 个可选 symbol

## 步骤

1. 打开账户管理页。
2. 确认「账户操作计划」面板出现，并渲染当前 live plans。
3. 点击「新增计划」，选择启用账户与 symbol，填写动作、仓位、每日记录、止盈、止损、支撑位、压力位、思考。
4. 保存并关闭，调用 `GET /api/account-live-action-plans`。
5. 编辑刚创建的计划，修改 `takeProfitPlan` 或 `thinking` 后保存。
6. 再次调用 `GET /api/account-live-action-plans`。
7. 对同一 `(accountId, symbol)` 再提交一次 `POST /api/account-live-action-plans`。
8. 删除该计划，刷新账户管理页。

## 期望

- 步骤 3 保存返回 2xx，列表出现新计划并含 `id`
- 步骤 5 保存返回 2xx，列表字段与最近修改一致
- 步骤 7 返回 HTTP 409，列表没有重复 `(accountId, symbol)` 行
- 步骤 8 返回 2xx，列表不再包含该计划
- 页面无 JS 运行时错误，已停用账户如有历史 live plan 仍显示但不能作为新增计划账户
