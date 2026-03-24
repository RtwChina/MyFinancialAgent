## ADDED Requirements

### Requirement: Review Summary Sections Must Show Explicit Type Labels

复盘页中 `每日新闻总结`、`市场影响`、`逻辑链` 的每一条都必须显式显示层级标签。

#### Scenario: Every line has a label
- **WHEN** 复盘页渲染 summary 区块
- **THEN** 每一条都必须带 `[大盘]`、`[板块]` 或 `[个股]`

### Requirement: Review Summary Sections Must Use Section-Specific Numbering Styles

三个 summary 区块必须使用不同的编号语法。

#### Scenario: Daily news summary keeps hash-number style
- **WHEN** 渲染 `每日新闻总结`
- **THEN** 每条内容必须使用 `# 1. [标签] 文本` 的格式

#### Scenario: Market impact uses plain numeric style
- **WHEN** 渲染 `市场影响`
- **THEN** 每条内容必须使用 `1. [标签] 文本` 的格式
- **AND** 不得使用 `# 1.` 风格

#### Scenario: Logic chain uses plain numeric style
- **WHEN** 渲染 `逻辑链`
- **THEN** 每条内容必须使用 `1. [标签] 文本` 的格式
- **AND** 不得使用 `# 1.` 风格
