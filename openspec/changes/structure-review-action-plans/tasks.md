## 1. Data Model

- [x] 1.1 Add a D1 migration for `daily_review_action_plans` with `UNIQUE(archive_date, symbol)` and date/symbol indexes
- [x] 1.2 Update `tests/schema.sql` with the new child table and indexes
- [x] 1.3 Add local DB helpers in `src/db_utils.py` to list, upsert, replace, and summarize review action plans
- [x] 1.4 Add a shared normalization rule for `action_type` and `current_position` enum values

## 2. Worker API

- [x] 2.1 Update review bootstrap to load `actionPlans` for the requested `archive_date`
- [x] 2.2 Update review save to accept an `actionPlans` array and persist it in a transaction-like sequence
- [x] 2.3 Ensure child plan deletion is scoped only to the current `archive_date`
- [x] 2.4 Generate a Markdown compatibility summary into `daily_review_archive.asset_plan` when structured plans are submitted
- [x] 2.5 Preserve legacy `asset_plan` fallback when no structured plans are present

## 3. Frontend Implementation

- [x] 3.1 Replace the operation plan textarea in `cloudflare/web/index.html` with the version A table and editing area
- [x] 3.2 Add action plan state management in `cloudflare/web/app.js`
- [x] 3.3 Render bootstrap `actionPlans` into the table and selected-row editor
- [x] 3.4 Support adding, selecting, editing, reordering, and deleting per-symbol plan rows
- [x] 3.5 Serialize structured plans into the review save payload
- [x] 3.6 Show legacy `asset_plan` reference content when structured plans are empty
- [x] 3.7 Add responsive CSS for the table, editor, action enum, position enum, and multiline key levels

## 4. Temporary Migration Script

- [x] 4.1 Create `scripts/temporary/convert_asset_plan_to_action_plans.py`
- [x] 4.2 Implement dry-run mode that reads legacy `asset_plan` and writes preview JSON/Markdown
- [x] 4.3 Implement apply mode that imports reviewed preview output into `daily_review_action_plans`
- [x] 4.4 Skip dates that already have structured plans unless an explicit override is passed
- [x] 4.5 Preserve original `daily_review_archive.asset_plan` during conversion
- [x] 4.6 Add script usage notes and safety checks for target environment/database

## 5. Tests And Documentation

- [x] 5.1 Read `tests/standards/` and update the relevant smoke/integration test descriptions for structured action plans
- [x] 5.2 Add or update frontend smoke coverage for opening the review drawer and saving structured plans
- [x] 5.3 Add Worker/API test coverage or integration checks for bootstrap/save action plan behavior
- [x] 5.4 Add temporary migration preview fixtures under `.tests/` or the project test-data area used by this repo
- [x] 5.5 Update user-facing or architecture documentation to reference the finalized structured action plan design

## 6. Verification And Release

- [x] 6.1 Run local schema/API checks for a date with no legacy plan, legacy text only, and structured plans
- [x] 6.2 Verify the review drawer can save a draft and complete a review with structured plans
- [x] 6.3 Verify legacy `asset_plan` still appears in review lists or fallback displays
- [x] 6.4 Run the migration script in dry-run mode and inspect preview output before any apply
- [x] 6.5 Perform release checks for APP_ENV, Worker/D1 binding, and migration target before deployment
