## ADDED Requirements

### Requirement: Account-grouped review action plans
The system SHALL group daily review action plans by investment account instead of market type.

#### Scenario: Render plans by account
- **GIVEN** a review date has action plans linked to multiple investment accounts
- **WHEN** the user opens the review action plan step
- **THEN** the system SHALL render plans under account group headings ordered by account sort order

#### Scenario: Account heading includes funds
- **GIVEN** an account has currency, total assets, and available cash
- **WHEN** the account group heading is rendered
- **THEN** the system SHALL display the account name and a compact fund summary including currency, total assets, and available cash

#### Scenario: Market type is not the primary group
- **GIVEN** action plans include `marketType` values such as `美股` or `大A`
- **WHEN** the user views the action plan step
- **THEN** the system SHALL NOT use `marketType` as the primary grouping title

### Requirement: Action plans bind to accounts
The system SHALL persist an account reference for each structured action plan.

#### Scenario: Save action plan with account
- **GIVEN** the user selects an investment account for an action plan
- **WHEN** the review is saved
- **THEN** the system SHALL store the selected account reference with the action plan

#### Scenario: Load action plan account
- **GIVEN** an action plan has a stored account reference
- **WHEN** bootstrap data is requested for the review date
- **THEN** the system SHALL return the account reference and account display metadata with the action plan

#### Scenario: Reject missing account when no fallback is available
- **GIVEN** an action plan save payload has no account reference and no compatible fallback account exists
- **WHEN** the review save request is processed
- **THEN** the system MUST reject the invalid action plan with a clear validation error

### Requirement: Account-scoped duplicate detection
The system SHALL treat duplicate action plans as duplicates only within the same account and review date.

#### Scenario: Reject duplicate symbol in same account
- **GIVEN** a review date already has a plan for `MU` in `老虎-美股`
- **WHEN** the user saves another `MU` plan in `老虎-美股`
- **THEN** the system MUST reject or merge the duplicate according to the existing upsert behavior for that account

#### Scenario: Allow same symbol in different accounts
- **GIVEN** a review date has a plan for `MU` in one account
- **WHEN** the user adds a `MU` plan in another account
- **THEN** the system SHALL allow both plans to exist independently

### Requirement: Historical plan compatibility
The system SHALL preserve and display historical action plans that do not yet have account references.

#### Scenario: Backfill by market type
- **GIVEN** a historical action plan has `marketType` of `美股` or `大A` and no account reference
- **WHEN** account migration or compatibility loading runs
- **THEN** the system SHALL associate `美股` plans with `老虎-美股` and `大A` plans with `东方财富-国内`

#### Scenario: Backfill unknown plans to unassigned account
- **GIVEN** a historical action plan has no usable account or market information
- **WHEN** account migration or compatibility loading runs
- **THEN** the system SHALL associate the plan with an `未分配账户` group rather than dropping it

#### Scenario: Preserve legacy market type
- **GIVEN** a historical action plan has a `marketType` value
- **WHEN** the plan is migrated or saved with an account
- **THEN** the system SHALL preserve `marketType` for compatibility unless the user explicitly changes related plan data

### Requirement: Account-aware action plan summary
The system SHALL generate the legacy `asset_plan` Markdown summary with account group sections.

#### Scenario: Generate account grouped summary
- **GIVEN** a review has structured action plans across multiple accounts
- **WHEN** the review is saved
- **THEN** the system SHALL write `asset_plan` as a Markdown summary grouped by account name

#### Scenario: Empty account groups omitted
- **GIVEN** an enabled account has no action plans for the review date
- **WHEN** the legacy `asset_plan` summary is generated
- **THEN** the system SHALL omit that empty account group from the summary

### Requirement: Account management smoke coverage
The system SHALL include smoke or integration coverage for the main account-based action plan flow.

#### Scenario: Smoke test account grouped action plans
- **GIVEN** test data includes the default accounts and at least two action plans in different accounts
- **WHEN** the smoke test opens the review action plan step
- **THEN** the test SHALL verify account group headings are visible and plans are grouped under the expected accounts

#### Scenario: Smoke test same symbol across accounts
- **GIVEN** test data includes two accounts
- **WHEN** the test saves the same symbol under both accounts for the same review date
- **THEN** the test SHALL verify both account-specific plans are returned by bootstrap
