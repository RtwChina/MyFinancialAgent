## ADDED Requirements

### Requirement: Date-Level Summary Buckets Must Have Distinct Responsibilities

日期级 summary 的三个桶必须有明确职责边界，以减少重复。

#### Scenario: Index bucket focuses on market regime
- **WHEN** 系统生成大盘桶 summary
- **THEN** 大盘桶必须主要输出当天宏观、指数、流动性、风险偏好主线
- **AND** 不得把板块细节或个股催化展开为主要内容

#### Scenario: Sector bucket focuses on sector impacts
- **WHEN** 系统生成板块桶 summary
- **THEN** 板块桶必须主要输出行业、主题、产业链、轮动方向
- **AND** 不得重复宏观总主线

#### Scenario: Stock bucket focuses on stock-level catalysts
- **WHEN** 系统生成个股桶 summary
- **THEN** 个股桶必须主要输出核心标的催化与个股层逻辑链
- **AND** 不得复述整体市场主线
