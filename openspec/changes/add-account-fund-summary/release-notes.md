## Release Notes

### What changed

- Added the read-only `GET /api/account-fund-summary` Worker endpoint.
- Added the `统计汇总` entry inside `账户管理`; it opens a dedicated `?view=fundSummary` browser tab for currency-grouped fund distribution.
- Summary data is grouped by account currency and does not perform USD/CNY conversion.
- Each symbol row shows `占总资产`, calculated as its same-currency total amount divided by the total assets of that currency group.
- USD summary, account coverage, and symbol totals show muted CNY reference values; a tooltip beside `美元账户` explains the fixed display rate `1 USD = 6.80 CNY`.
- Symbol amounts use manual per-position amount first, then account total assets multiplied by the position bucket midpoint.
- Estimated values show a `*` marker with tooltip text `按仓位区间中位数估算`.

### Data sources

- `investment_accounts`
- `account_live_action_plans`

The summary does not call external broker, fund, market-data, or exchange-rate services.

### Validation

- Local Worker health was verified with `APP_ENV=test`.
- Local D1 commands were executed without `--remote`.
- Desktop and mobile layout checks verified no page-level horizontal overflow.

### Rollback

- Hide or remove the `统计汇总` account-management action to disable the UI.
- The API is read-only, so rollback does not require data migration.
