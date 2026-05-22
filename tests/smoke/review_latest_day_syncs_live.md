# SM-024: 最新复盘日编辑回流活态

## 目标

验证在 `archiveDate == latestArchiveDate` 的复盘抽屉中保存操作计划，会同步覆盖 `account_live_action_plans`；历史日保存不影响 live。

## 前置条件

- 本地或测试环境已执行 migration `023_account_live_action_plans.sql`
- `daily_review_archive` 至少有 2 个日期：最新日 `D = MAX(archive_date)`，历史日 `H < D`
- `D` 和 `H` 均可打开复盘抽屉

## 步骤

1. 打开 `D` 的复盘抽屉，确认头部显示「此编辑会同步到账户管理」。
2. 进入「操作计划」，新增或编辑一条 plan，保存复盘。
3. 查询 `daily_review_action_plans(D)` 与 `account_live_action_plans`。
4. 打开 `H` 的复盘抽屉，确认头部显示「历史草稿」或不同步提示（若 `H` 未 reviewed）。
5. 编辑 `H` 的操作计划并保存。
6. 查询 `daily_review_action_plans(H)` 与 `account_live_action_plans`。

## 期望

- 步骤 2 后，`daily_review_action_plans(D)` 与 `account_live_action_plans` 归一化集合一致
- 步骤 5 后，仅 `daily_review_action_plans(H)` 改变，`account_live_action_plans` 保持步骤 3 后的集合
- bootstrap 响应包含 `latestArchiveDate`，且不包含 `carryForward`
