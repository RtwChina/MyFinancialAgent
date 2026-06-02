## ADDED Requirements

### Requirement: Currency-grouped fund summary
The system SHALL provide a fund summary grouped by account currency for current live action plans.

#### Scenario: Render USD and CNY groups separately
- **GIVEN** enabled accounts include USD and CNY accounts
- **WHEN** the user opens the fund summary view
- **THEN** the system SHALL render separate currency groups for USD and CNY
- **AND** the system SHALL NOT convert or combine USD and CNY totals into a cross-currency total

#### Scenario: Currency group totals
- **GIVEN** a currency group has enabled accounts with valid total assets
- **WHEN** the fund summary is calculated
- **THEN** the system SHALL return the currency group total assets, estimated position amount, and unallocated amount
- **AND** unallocated amount SHALL equal total assets minus included position amount for that currency group

### Requirement: Symbol amount matrix
The system SHALL summarize symbol amounts within each currency group and show each account contribution.

#### Scenario: Same symbol across accounts
- **GIVEN** two CNY accounts both have a live action plan for the same symbol
- **WHEN** the fund summary is calculated
- **THEN** the system SHALL return one symbol row for that symbol in the CNY group
- **AND** the symbol total amount SHALL equal the sum of the included amount from both accounts

#### Scenario: Symbol share of currency assets
- **GIVEN** a currency group has total assets and a symbol has an included total amount
- **WHEN** the fund summary is calculated
- **THEN** the symbol row SHALL include `占总资产`
- **AND** that percentage SHALL equal the symbol total amount divided by the total assets of all accounts in that same currency group

#### Scenario: Account cell percentage
- **GIVEN** an account has total assets of `260000`
- **AND** a symbol has included amount of `26000` in that account
- **WHEN** the fund summary is calculated
- **THEN** the account cell for that symbol SHALL show an account share of `10%`

#### Scenario: Symbol appears in different currencies
- **GIVEN** the same symbol appears in a USD account and a CNY account
- **WHEN** the fund summary is calculated
- **THEN** the system SHALL keep the symbol in separate currency groups

### Requirement: Position amount calculation
The system SHALL calculate each action plan's included amount from manual amount first and position bucket fallback second.

#### Scenario: Manual amount wins
- **GIVEN** a live action plan has `position_amount` of `6400`
- **AND** the same plan has `current_position` of `15%-20%`
- **WHEN** the fund summary is calculated
- **THEN** the included amount SHALL be `6400`
- **AND** the amount source SHALL be `exact`

#### Scenario: Estimate from position midpoint
- **GIVEN** an account has total assets of `32000`
- **AND** a live action plan in that account has no `position_amount`
- **AND** the plan has `current_position` of `15%-20%`
- **WHEN** the fund summary is calculated
- **THEN** the included amount SHALL be `5600`
- **AND** the amount source SHALL be `estimated`
- **AND** the estimate tooltip SHALL include `15%-20% → 17.5%`

#### Scenario: Zero position does not allocate funds
- **GIVEN** a live action plan has no `position_amount`
- **AND** the plan has `current_position` of `0%`
- **WHEN** the fund summary is calculated
- **THEN** the plan SHALL NOT appear in the fund summary symbol matrix
- **AND** the plan SHALL NOT contribute any included amount

#### Scenario: Open-ended bucket uses conservative midpoint
- **GIVEN** an account has total assets of `100000`
- **AND** a live action plan has no `position_amount`
- **AND** the plan has `current_position` of `>30%`
- **WHEN** the fund summary is calculated
- **THEN** the included amount SHALL be `30000`
- **AND** the estimate tooltip SHALL include `>30% → 30%`

#### Scenario: Missing account assets cannot be estimated
- **GIVEN** a live action plan has no `position_amount`
- **AND** its account has no valid total assets
- **WHEN** the fund summary is calculated
- **THEN** the plan SHALL NOT contribute a numeric included amount
- **AND** the amount source SHALL be `unavailable`

### Requirement: Ten-thousand unit display and storage
The system SHALL treat account asset inputs and position amount inputs as ten-thousand-unit values in the UI while storing raw currency units.

#### Scenario: Account total assets entered in ten-thousand units
- **GIVEN** the user enters `2` into an account total assets field for a USD account
- **WHEN** the account is saved
- **THEN** the database SHALL store total assets as `20000`
- **AND** account summaries SHALL display `$2万`

#### Scenario: Position amount entered in ten-thousand units
- **GIVEN** the user enters `0.56` into a symbol position amount field
- **WHEN** the action plan is saved
- **THEN** the database SHALL store position amount as `5600`
- **AND** the fund summary SHALL display `$0.56万` or `¥0.56万` according to the account currency

### Requirement: Fund summary UI
The system SHALL render the fund summary as a currency-sectioned account and symbol matrix.

#### Scenario: Open summary in a separate browser tab
- **GIVEN** the user is viewing account management
- **WHEN** the user clicks `统计汇总`
- **THEN** the system SHALL open a new browser tab at `?view=fundSummary`
- **AND** the original account-management tab SHALL remain on account management
- **AND** the new tab SHALL directly display the fund summary view with `账户管理` marked as its parent navigation context

#### Scenario: Summary page structure
- **GIVEN** fund summary data exists
- **WHEN** the user opens the fund summary view
- **THEN** each currency section SHALL show the currency label, total assets, estimated position amount, and unallocated amount
- **AND** each section SHALL show account coverage and a symbol matrix
- **AND** account coverage SHALL appear as a horizontal band before the full-width symbol matrix
- **AND** each symbol row SHALL display its share of total assets within that currency group

#### Scenario: USD summary shows fixed CNY reference amounts
- **GIVEN** the USD currency section is rendered
- **WHEN** USD summary amounts, account coverage amounts, and symbol total amounts are displayed
- **THEN** each SHALL show a muted CNY reference value in parentheses
- **AND** the `美元账户` title SHALL provide a tooltip stating the fixed rate `1 USD = 6.80 CNY`
- **AND** the displayed CNY reference values SHALL NOT repeat the fixed rate inline
- **AND** the CNY section SHALL remain denominated in CNY without reference conversion values

#### Scenario: No note or source columns
- **GIVEN** the fund summary symbol matrix is rendered
- **WHEN** the user views the matrix
- **THEN** the matrix SHALL include symbol, total amount, and account columns
- **AND** the account columns SHALL be placed before `总金额` and `占总资产`
- **AND** the matrix SHALL NOT include separate `备注` or `来源` columns

#### Scenario: Estimated amount marker
- **GIVEN** a symbol amount is estimated from a position bucket
- **WHEN** the amount is displayed
- **THEN** the amount SHALL include a `*` marker
- **AND** hovering the marker SHALL show a tooltip explaining the midpoint estimate

#### Scenario: Manual amount has no marker
- **GIVEN** a symbol amount comes from manual `position_amount`
- **WHEN** the amount is displayed
- **THEN** the amount SHALL NOT include the estimate `*` marker
- **AND** the UI SHALL NOT use a separate color or legend to distinguish manual amounts

#### Scenario: Desktop layout does not overflow page
- **GIVEN** the fund summary view is rendered on a desktop viewport
- **WHEN** the page loads
- **THEN** the document body SHALL NOT have page-level horizontal overflow
- **AND** any horizontal scrolling SHALL be limited to the account band or symbol matrix container when needed

### Requirement: Fund summary smoke coverage
The system SHALL include smoke or integration coverage for the fund summary flow.

#### Scenario: API smoke test for mixed exact and estimated amounts
- **GIVEN** test data has one account with a manual symbol amount and one symbol with only a position bucket
- **WHEN** the fund summary API is requested in the test environment
- **THEN** the response SHALL include both symbols
- **AND** the manual symbol SHALL use source `exact`
- **AND** the bucket-only symbol SHALL use source `estimated`

#### Scenario: UI smoke test for matrix and tooltip
- **GIVEN** the fund summary page has test data with an estimated amount
- **WHEN** the smoke test opens the fund summary view
- **THEN** the test SHALL verify the currency section, account column, `*` marker, and tooltip text are visible

#### Scenario: Third-party dependency classification
- **GIVEN** the fund summary test suite runs
- **WHEN** tests are executed
- **THEN** no third-party broker, fund platform, or exchange-rate service SHALL be required
- **AND** test data SHALL be created through local/test database or existing local APIs
