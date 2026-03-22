## ADDED Requirements

### Requirement: Navigation switches views correctly
The system SHALL switch between views when user clicks navigation buttons.

#### Scenario: Switch to keywords view
- **WHEN** user clicks "关键词管理" navigation button
- **THEN** keywords view becomes active and keywords list loads

#### Scenario: Switch to symbols view
- **WHEN** user clicks "标的管理" navigation button
- **THEN** symbols view becomes active and symbols list loads

#### Scenario: Switch to readme view
- **WHEN** user clicks "ReadMe" navigation button
- **THEN** readme view becomes active and readme content renders

### Requirement: Keywords management CRUD operations
The system SHALL support adding, toggling, and deleting keywords.

#### Scenario: Add new keyword
- **WHEN** user enters keyword text, selects type and language, then clicks "添加"
- **THEN** keyword is added to list with correct type and language

#### Scenario: Toggle keyword active status
- **WHEN** user clicks the active toggle switch for a keyword
- **THEN** keyword is_active status toggles between true and false

#### Scenario: Delete custom keyword
- **WHEN** user clicks delete button on a custom keyword (sort_order >= 100)
- **THEN** keyword is removed from list after confirmation

#### Scenario: Cannot delete base keyword
- **WHEN** base keyword (sort_order = 0) is displayed
- **THEN** delete button is NOT shown

### Requirement: Keywords type tabs switch correctly
The system SHALL filter keywords by type when user clicks type tabs.

#### Scenario: Switch to market tab
- **WHEN** user clicks "市场" tab
- **THEN** only keywords with type="market" are displayed

#### Scenario: Switch to noise tab
- **WHEN** user clicks "噪音" tab
- **THEN** only keywords with type="noise" are displayed

### Requirement: Symbols management operations
The system SHALL support adding, editing, and toggling symbols.

#### Scenario: Resolve symbol input
- **WHEN** user enters "英伟达" and clicks "智能解析"
- **THEN** system shows resolved symbol preview with correct yahoo_symbol

#### Scenario: Toggle symbol visibility
- **WHEN** user clicks show/hide toggle for a symbol
- **THEN** symbol is_visible status toggles

### Requirement: API errors display gracefully
The system SHALL display error messages when API calls fail.

#### Scenario: Keywords API failure
- **WHEN** keywords API returns error or timeout
- **THEN** error message is displayed in keywords content area

#### Scenario: Symbols API failure
- **WHEN** symbols API returns error or timeout
- **THEN** error message is displayed in symbols content area