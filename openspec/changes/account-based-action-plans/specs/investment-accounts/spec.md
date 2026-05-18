## ADDED Requirements

### Requirement: Investment account management
The system SHALL provide a management surface for investment accounts used by review action plans.

#### Scenario: List investment accounts
- **GIVEN** investment accounts exist in the database
- **WHEN** the user opens the account management page
- **THEN** the system SHALL list enabled and disabled accounts with name, broker, account type, region, currency, total assets, available cash, enabled status, and sort order

#### Scenario: Create investment account
- **GIVEN** the user enters a unique account name and required fields
- **WHEN** the user saves the account
- **THEN** the system SHALL persist the account and include it in subsequent account lists

#### Scenario: Update investment account funds
- **GIVEN** an existing investment account
- **WHEN** the user edits total assets or available cash
- **THEN** the system SHALL persist the updated manual values without requiring any third-party brokerage sync

### Requirement: Default investment accounts
The system SHALL seed default accounts for the user's current account structure without overwriting manually maintained fund values.

#### Scenario: Seed default accounts
- **GIVEN** the account table has no matching default accounts
- **WHEN** the account migration or initialization runs
- **THEN** the system SHALL create `老虎-美股`, `东方财富-国内`, and `天天基金-国内` with appropriate default currency, account type, region, enabled status, and sort order

#### Scenario: Preserve existing account funds during seed
- **GIVEN** a default account already exists with manually edited total assets or available cash
- **WHEN** the account seed runs again
- **THEN** the system MUST NOT overwrite the manually edited fund values

### Requirement: Account fund semantics
The system SHALL distinguish total assets from available cash in account UI and API data.

#### Scenario: Display account fund fields
- **GIVEN** an account has total assets and available cash values
- **WHEN** the account appears in account management or action plan grouping
- **THEN** the system SHALL label total assets as the account's overall scale and available cash as funds currently usable for buying, subscription, or rebalancing

#### Scenario: Missing fund values
- **GIVEN** an account has no total assets or available cash value
- **WHEN** the account appears in account management or action plan grouping
- **THEN** the system SHALL show the missing value as empty or unknown without blocking action plan usage

### Requirement: Account availability
The system SHALL allow accounts to be disabled without hiding historical action plans.

#### Scenario: Disabled account hidden from new plan defaults
- **GIVEN** an account is disabled
- **WHEN** the user creates a new action plan
- **THEN** the system SHALL NOT choose the disabled account as the default account

#### Scenario: Disabled account remains visible for history
- **GIVEN** an archived action plan references a disabled account
- **WHEN** the user opens that review date
- **THEN** the system SHALL still display the plan under the referenced account
