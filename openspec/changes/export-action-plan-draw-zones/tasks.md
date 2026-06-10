## 1. Discovery And Test Planning

- [x] 1.1 Read the current action-plan rendering, editor, and save/load paths in `cloudflare/web/app.js` and `cloudflare/web/index.html`.
- [x] 1.2 Read `tests/standards/smoke-test.md` and identify the smoke coverage to add for zone export.
- [x] 1.3 Add or update focused frontend smoke coverage for exporting support/resistance zones before implementation.

## 2. Export Formatting

- [x] 2.1 Implement a small parser for action-plan zone lines that recognizes numeric lower/upper ranges, decimal values, dash variants, and Chinese/English parentheses.
- [x] 2.2 Format support and resistance lines into `draw_zone('SYMBOL', lower, upper, '类型: lower-upper (力度) 备注')`.
- [x] 2.3 Skip empty or unparseable lines while preserving exportable lines from the same plan.
- [x] 2.4 Cover parser edge cases for lower/upper ordering, multiple lines, missing strength, and trailing notes.

## 3. Frontend UI

- [x] 3.1 Add an export button near the `个股与资产操作计划` section title.
- [x] 3.2 Add a lightweight export preview dialog with generated output, empty-state handling, close action, and copy action.
- [x] 3.3 Wire the export button to the current `state.actionPlans` without adding backend API calls.
- [x] 3.4 Style the button and dialog consistently with existing review/action-plan UI on desktop and mobile.

## 4. Verification And Release

- [x] 4.1 Update `tests/standards/smoke-test.md` with a new operation-plan zone export case.
- [x] 4.2 Run the focused Playwright smoke test for action-plan zone export.
- [x] 4.3 Run existing relevant action-plan smoke tests to guard account grouping and structured plan behavior.
- [x] 4.4 Run `npm run check:web`, `npm run check:worker`, and `git diff --check`.
- [x] 4.5 If deployment is requested, verify Cloudflare auth, deploy with the existing deploy command, and record the deployed Worker version.
