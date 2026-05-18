## 1. Data Model and Migration

- [x] 1.1 Add D1/SQLite migration for `investment_accounts` with account metadata, fund fields, enabled status, sort order, and timestamps.
- [x] 1.2 Add migration seed/upsert for `老虎-美股`, `东方财富-国内`, `天天基金-国内`, and compatibility `未分配账户` without overwriting manual fund values.
- [x] 1.3 Add `account_id` to `daily_review_action_plans` and backfill existing rows from `market_type`.
- [x] 1.4 Replace operation-plan uniqueness with `archive_date + account_id + symbol` after backfill is complete.
- [x] 1.5 Update `tests/schema.sql` and local migration helpers to match the production schema.

## 2. Worker API

- [x] 2.1 Implement account list/create/update endpoints in the Worker using existing API response and validation patterns.
- [x] 2.2 Extend review bootstrap to return `investmentAccounts` and account metadata on each `actionPlans` item.
- [x] 2.3 Extend review save to accept `accountId`, validate enabled/existing account references, and fallback only through documented compatibility rules.
- [x] 2.4 Update action plan duplicate detection and upsert logic to operate within `archive_date + account_id + symbol`.
- [x] 2.5 Update legacy `asset_plan` Markdown generation to group structured plans by account name.

## 3. Frontend Account Management

- [x] 3.1 Add account management navigation entry and page shell consistent with the existing admin UI.
- [x] 3.2 Render account list with name, broker, account type, region, currency, total assets, available cash, enabled status, and sort order.
- [x] 3.3 Add account create/edit form with validation for required fields and numeric fund values.
- [x] 3.4 Persist account edits through the Worker API and refresh account state after save.

## 4. Frontend Action Plans

- [x] 4.1 Replace `美股 / 大A` action-plan groups with account groups ordered by account sort order.
- [x] 4.2 Show account fund summary in each action-plan group heading.
- [x] 4.3 Add account selection to the action-plan editor and keep market type as secondary metadata.
- [x] 4.4 Change duplicate-plan checks to allow the same symbol in different accounts and reject duplicates only inside the same account.
- [x] 4.5 Ensure disabled accounts remain visible for historical plans but are not selected by default for new plans.
- [x] 4.6 Update read-only/reviewed mode behavior so account-grouped plans remain inspectable.

## 5. Local Python and Compatibility Tools

- [x] 5.1 Update `src/db_utils.py` structured action-plan read/write helpers to include `account_id` and account metadata.
- [x] 5.2 Update temporary conversion or maintenance scripts so historical text/structured plans can be assigned to accounts.
- [x] 5.3 Add a compatibility check or script output that reports plans still assigned to `未分配账户`.

## 6. Tests and Smoke Documentation

- [x] 6.1 Read `tests/standards/TESTING_STANDARD.md`, `tests/standards/integration-test.md`, `tests/standards/smoke-test.md`, `tests/standards/test-data.md`, and `tests/standards/test-env.md` before writing tests.
- [x] 6.2 Update smoke documentation with account management and account-grouped action-plan cases, including same-symbol-across-accounts coverage.
- [x] 6.3 Add or update integration tests for account CRUD, bootstrap account payloads, save validation, backfill compatibility, and `asset_plan` summary grouping.
- [x] 6.4 Add or update frontend smoke tests for account group rendering, account selection, duplicate detection, and disabled-account history visibility.
- [x] 6.5 Ensure all new test data is reproducible, isolated to test DB/environment, and placed under the test data area expected by project standards.

## 7. Verification and Release

- [x] 7.1 Run targeted unit/integration tests for Worker action plan and account APIs.
- [x] 7.2 Run frontend smoke tests for review edit cycle and account management.
- [x] 7.3 Run database migration verification on a test database with existing market-based action plans.
- [x] 7.4 Perform release pre-check: confirm APP_ENV, target D1 database, migration order, rollback notes, and no production data writes from test runs.
- [x] 7.5 Manually verify a review date with the three default accounts: account headings display funds, same symbol can exist in two accounts, and legacy `asset_plan` summary is account grouped.
