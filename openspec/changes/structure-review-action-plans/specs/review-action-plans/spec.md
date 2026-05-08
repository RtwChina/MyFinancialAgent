## ADDED Requirements

### Requirement: Structured review action plan storage
The system SHALL store daily review action plans as child records keyed by review date and symbol, while preserving the existing daily review archive record.

#### Scenario: Save one plan per symbol per review date
- **GIVEN** a review exists for archive date `2026-05-07`
- **WHEN** the user saves action plans for `MU` and `MSFT`
- **THEN** the system SHALL store one child plan for `2026-05-07 + MU` and one child plan for `2026-05-07 + MSFT`
- **AND** the system SHALL NOT modify action plans for any other archive date

#### Scenario: Update existing symbol plan for same date
- **GIVEN** a child action plan already exists for `2026-05-07 + MU`
- **WHEN** the user saves a changed `MU` plan for `2026-05-07`
- **THEN** the system SHALL update the existing `2026-05-07 + MU` child record instead of creating a duplicate

#### Scenario: Preserve symbol history across dates
- **GIVEN** child action plans exist for `2026-05-06 + MU` and `2026-05-07 + MU`
- **WHEN** the user edits the `2026-05-07 + MU` plan
- **THEN** the system SHALL leave the `2026-05-06 + MU` plan unchanged

### Requirement: Action plan fields and enumerations
The system SHALL support structured action plan fields for symbol, action, entry plan, take profit plan, stop loss plan, key levels, current position, thinking, and sort order.

#### Scenario: Accepted action values
- **GIVEN** the user is editing an action plan
- **WHEN** the action value is saved
- **THEN** the system SHALL support `准备开仓`, `持仓观察`, and `已清仓复盘` as valid action values

#### Scenario: Accepted current position values
- **GIVEN** the user is editing an action plan
- **WHEN** the current position value is saved
- **THEN** the system SHALL support `0-10%`, `10%-20%`, `20%-30%`, and `>30%` as valid current position values

#### Scenario: Preserve multiline key levels
- **GIVEN** the user enters multiline support and resistance text in `key_levels`
- **WHEN** the action plan is saved and reloaded
- **THEN** the system SHALL preserve the line breaks, price ranges, strength labels, and notes in `key_levels`

### Requirement: Review bootstrap returns action plans
The review bootstrap endpoint SHALL return structured action plans for the requested archive date.

#### Scenario: Bootstrap with structured action plans
- **GIVEN** child action plans exist for `2026-05-07`
- **WHEN** the client requests `GET /api/reviews/2026-05-07/bootstrap`
- **THEN** the response SHALL include an `actionPlans` array containing only plans whose `archive_date` is `2026-05-07`

#### Scenario: Bootstrap with legacy text only
- **GIVEN** no child action plans exist for `2026-05-07`
- **AND** `daily_review_archive.asset_plan` contains legacy text
- **WHEN** the client requests `GET /api/reviews/2026-05-07/bootstrap`
- **THEN** the response SHALL include an empty `actionPlans` array
- **AND** the response SHALL still include the legacy `asset_plan` text in the draft payload for fallback display

### Requirement: Review save persists action plans and compatibility summary
The review save endpoint SHALL persist structured action plans and maintain a compatible text summary in `asset_plan`.

#### Scenario: Save structured action plans
- **GIVEN** the client submits review draft fields and an `actionPlans` array for `2026-05-07`
- **WHEN** the system saves the review
- **THEN** the system SHALL upsert the parent `daily_review_archive` row
- **AND** the system SHALL upsert child action plans for `2026-05-07`
- **AND** the system SHALL remove child action plans for `2026-05-07` that were omitted from the submitted array
- **AND** the system SHALL NOT remove child action plans for any other archive date

#### Scenario: Generate compatibility asset plan summary
- **GIVEN** the client submits a non-empty `actionPlans` array
- **WHEN** the system saves the review
- **THEN** the system SHALL generate a Markdown text summary from the structured action plans
- **AND** the system SHALL store that summary in `daily_review_archive.asset_plan`

### Requirement: Review action plan frontend
The review workspace SHALL replace the operation plan textarea with a structured table and editing area in the action plan step.

#### Scenario: Render version A action plan editor
- **GIVEN** the user opens the review drawer for a date
- **WHEN** the user navigates to the operation plan step
- **THEN** the UI SHALL show a table with symbol, action, current position, entry plan, take profit plan, stop loss plan, key levels, and thinking
- **AND** the UI SHALL show an editing area for the selected row

#### Scenario: Symbol display uses code only
- **GIVEN** an action plan has symbol `MU`
- **WHEN** the action plan appears in the table
- **THEN** the symbol cell SHALL display `MU`
- **AND** the symbol cell SHALL NOT require or display the Chinese asset name

#### Scenario: Legacy text fallback display
- **GIVEN** the bootstrap response contains no structured action plans
- **AND** the draft contains legacy `asset_plan` text
- **WHEN** the user opens the operation plan step
- **THEN** the UI SHALL make the legacy text visible as reference content instead of silently discarding it

### Requirement: Temporary legacy conversion script
The system SHALL provide a temporary script for converting legacy `asset_plan` text into structured action plan records.

#### Scenario: Dry run conversion
- **GIVEN** historical review rows contain legacy `asset_plan` text
- **WHEN** `scripts/temporary/convert_asset_plan_to_action_plans.py` runs in dry-run mode
- **THEN** the script SHALL produce preview output without writing to the database
- **AND** the preview SHALL include the target archive date, proposed action plans, and any unparsed or uncertain text

#### Scenario: Apply confirmed conversion
- **GIVEN** a reviewed conversion preview exists
- **WHEN** `scripts/temporary/convert_asset_plan_to_action_plans.py` runs in apply mode
- **THEN** the script SHALL write confirmed action plans into `daily_review_action_plans`
- **AND** the script SHALL NOT delete or clear the original `daily_review_archive.asset_plan`

#### Scenario: Skip dates with existing structured plans by default
- **GIVEN** a historical archive date already has child action plans
- **WHEN** the temporary conversion script runs without an explicit override
- **THEN** the script SHALL skip that archive date
