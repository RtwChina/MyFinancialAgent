## Why

The action-plan page already stores structured support and resistance ranges, but users still need to manually translate those ranges into chart drawing commands. A one-click export reduces repetitive copy work and keeps chart annotations aligned with the current action-plan data.

## What Changes

- Add an export entry in the `个股与资产操作计划` step for generating `draw_zone(...)` commands from the current structured action plans.
- Convert each parseable support/resistance range into one command using `symbol`, lower bound, upper bound, and a readable label.
- Preserve range strength and trailing notes in the exported label, for example `支撑: 381-392 (中) 长线`.
- Show the generated output in a preview dialog with copy support before users paste it elsewhere.
- Skip unparseable or empty support/resistance lines rather than blocking export.
- Do not change action-plan persistence, account grouping, or database schema.

## Capabilities

### New Capabilities
- `action-plan-zone-export`: Export support and resistance ranges from structured action plans into chart-zone drawing commands.

### Modified Capabilities

None.

## Impact

- Frontend review workspace: add the export button, preview dialog, parsing/formatting logic, and copy behavior.
- Frontend tests/smoke coverage: verify support/resistance lines are converted to expected `draw_zone(...)` output.
- No Worker API, D1 migration, or backend dependency changes are expected.
