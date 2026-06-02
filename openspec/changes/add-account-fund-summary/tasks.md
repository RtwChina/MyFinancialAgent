## 1. Baseline And Unit Consistency

- [x] 1.1 Read existing account/action-plan specs, `tests/standards` smoke documentation, and current Worker/frontend account code paths.
- [x] 1.2 Fix account total assets and available cash form handling so UI inputs are in 万 and persisted as raw currency units.
- [x] 1.3 Add or update smoke coverage proving account asset input `2` stores `20000` and displays `$2万` / `¥2万`.

## 2. Summary Calculation API

- [x] 2.1 Add a shared position-bucket midpoint helper for `0%`, `0-5%`, `5%-10%`, `10%-15%`, `15%-20%`, `20%-25%`, `25%-30%`, and `>30%`.
- [x] 2.2 Implement fund summary aggregation from enabled `investment_accounts` and current `account_live_action_plans`.
- [x] 2.3 Ensure calculation uses manual `position_amount` first, then bucket midpoint estimate, then zero/unavailable fallback.
- [x] 2.4 Group summary results by account currency and keep same symbols in different currencies separate.
- [x] 2.5 Expose a read-only Worker API for the current fund summary.
- [x] 2.6 Add API tests for exact amount, estimated amount, zero position, unavailable account assets, and cross-account same-symbol aggregation.

## 3. Frontend Summary View

- [x] 3.1 Add a fund summary navigation entry or account-page tab consistent with existing navigation patterns.
- [x] 3.2 Render currency sections with total assets, estimated position amount, and unallocated amount.
- [x] 3.3 Render account coverage cards per currency group.
- [x] 3.4 Render the symbol matrix with columns for symbol, total amount, and accounts only.
- [x] 3.5 Add `*` markers and tooltip text for estimated amounts, without showing separate `备注` or `来源` columns.
- [x] 3.6 Ensure desktop layout has no page-level horizontal overflow and mobile keeps matrix scrolling inside its container.
- [x] 3.7 Refine the confirmed summary layout into a compact horizontal account band above the full-width symbol matrix.
- [x] 3.8 Use a soft-blue summary palette and remove redundant manual-amount color encoding.
- [x] 3.9 Apply the confirmed B palette with a white summary header and softly highlighted account cards.
- [x] 3.10 Increase progress-track contrast within the confirmed B palette for readable allocation shares.

## 4. Smoke Documentation And Tests

- [x] 4.1 Update `tests/standards` smoke documentation with the fund summary scenarios and trigger conditions.
- [x] 4.2 Add frontend smoke coverage for USD/CNY grouping, account columns, estimated `*` marker, and tooltip.
- [x] 4.3 Add regression coverage for no external broker/fund/rate service dependency in summary tests.
- [x] 4.4 Verify existing account-based action plan and review list smoke tests still pass.

## 5. Release Checks

- [x] 5.1 Run local Worker/API tests with test `APP_ENV` and confirm no production data is touched.
- [x] 5.2 Run frontend visual verification for the summary page at desktop and mobile widths.
- [x] 5.3 Run the project’s pre-deploy validation commands used by the current Cloudflare deployment flow.
- [x] 5.4 Prepare deployment notes covering the new summary API, UI entry, and rollback-by-hiding-entry option.
