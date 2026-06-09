## ADDED Requirements

### Requirement: Action plan zone export entry
The system SHALL provide an export entry in the `个股与资产操作计划` step for exporting current action-plan support and resistance zones.

#### Scenario: Export button is visible in the action plan step
- **GIVEN** the user opens a review workspace with structured action plans
- **WHEN** the user navigates to the `个股与资产操作计划` step
- **THEN** the system SHALL show an export button near the action-plan section title

#### Scenario: Export opens a preview
- **GIVEN** the user is on the `个股与资产操作计划` step
- **WHEN** the user clicks the export button
- **THEN** the system SHALL open a preview dialog containing the generated export text
- **AND** the dialog SHALL provide a copy action

### Requirement: Support and resistance range conversion
The system SHALL convert parseable support and resistance ranges into `draw_zone(...)` commands.

#### Scenario: Convert support range
- **GIVEN** an action plan for `MSFT` has support text `381-392（中） 长线`
- **WHEN** the user exports action-plan zones
- **THEN** the generated output SHALL include `draw_zone('MSFT', 381, 392, '支撑: 381-392 (中) 长线')`

#### Scenario: Convert resistance range
- **GIVEN** an action plan for `MSFT` has resistance text `397-430（超强） 突破右侧`
- **WHEN** the user exports action-plan zones
- **THEN** the generated output SHALL include `draw_zone('MSFT', 397, 430, '压力: 397-430 (超强) 突破右侧')`

#### Scenario: Lower bound is exported before upper bound
- **GIVEN** an action-plan zone line contains a numeric range
- **WHEN** the user exports action-plan zones
- **THEN** the second `draw_zone` argument SHALL be the lower bound
- **AND** the third `draw_zone` argument SHALL be the upper bound

#### Scenario: Multiple ranges export as multiple commands
- **GIVEN** an action plan has multiline support or resistance text with two parseable ranges
- **WHEN** the user exports action-plan zones
- **THEN** the generated output SHALL include one `draw_zone(...)` command per parseable range line

### Requirement: Export parser tolerance
The system SHALL tolerate common range punctuation and skip unparseable lines without blocking export.

#### Scenario: Normalize punctuation
- **GIVEN** an action-plan zone line uses spaces, dash variants, or Chinese parentheses
- **WHEN** the user exports action-plan zones
- **THEN** the system SHALL normalize the generated command to use `lower-upper` and English parentheses in the label

#### Scenario: Skip unparseable line
- **GIVEN** an action-plan support or resistance field contains a line without a recognizable numeric range
- **WHEN** the user exports action-plan zones
- **THEN** the system SHALL omit that line from the generated commands
- **AND** the system SHALL still export other parseable lines

#### Scenario: Empty export result
- **GIVEN** no current action plan contains a parseable support or resistance range
- **WHEN** the user clicks the export button
- **THEN** the system SHALL show an empty-state message in the preview dialog instead of copying an empty export silently
