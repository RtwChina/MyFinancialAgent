# SM-023: 凌晨初始化复制活态计划到当日

## 目标

验证 `POST /api/reviews/:date/initialize` 在当日 `daily_review_action_plans` 为空时从 `account_live_action_plans` 复制快照，并在重复调用时保持幂等。

## 前置条件

- 本地或测试环境已执行 migration `023_account_live_action_plans.sql`
- `account_live_action_plans` 至少有 1 条 active symbol 的计划
- 目标日期 `D` 存在或可初始化，且测试前 `daily_review_action_plans(D)` 为空

## 步骤

1. 记录当前 `account_live_action_plans` 全量行，排除 `tracked_symbols.is_active = 0` 的 symbol。
2. 清空目标日 `daily_review_action_plans`。
3. 调用 `POST /api/reviews/D/initialize`。
4. 查询 `daily_review_action_plans(D)`。
5. 再次调用 `POST /api/reviews/D/initialize`。
6. 再次查询 `daily_review_action_plans(D)`。
7. 构造一条 live plan，其 symbol 在 `tracked_symbols` 中为 `is_active = 0`，换一个空目标日重复步骤 3。

## 期望

- 第一次 init 返回 `ok: true`，`liveCopied` 等于 active live plan 数量
- `daily_review_action_plans(D)` 与 active live plan 逐字段一致，且 `archive_date = D`
- 第二次 init 不新增、不覆盖，行数与字段保持不变
- untracked symbol 不复制，返回或日志可追踪跳过 symbol，其余 plan 继续复制
