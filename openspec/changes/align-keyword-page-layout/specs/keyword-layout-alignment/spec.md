## ADDED Requirements

### Requirement: 关键词管理 Tab bar 与添加区左边界对齐
关键词管理页面的 Tab bar（宏观/市场/噪音/标的事件）SHALL 与上方添加输入区的左边界对齐，不得有额外的水平缩进。

#### Scenario: Tab bar 左边界与输入区对齐
- **WHEN** 用户打开关键词管理页面
- **THEN** Tab bar 的第一个 Tab 按钮左边界 SHALL 与上方「关键词」输入框左边界在同一垂直对齐线上

### Requirement: 关键词管理表格区与添加区左边界对齐
关键词管理页面的表格区（`.keywords-content`）SHALL 与上方添加输入区的左边界对齐，不得有额外的水平缩进。

#### Scenario: 表格左边界与输入区对齐
- **WHEN** 用户打开关键词管理页面
- **THEN** 关键词表格的左边界 SHALL 与上方「关键词」输入框左边界在同一垂直对齐线上

#### Scenario: 布局与标的管理一致
- **WHEN** 用户在「标的管理」和「关键词管理」之间切换
- **THEN** 两个页面的内容区（输入区、表格区）在水平方向的起始位置 SHALL 保持一致，不出现明显的缩进差异
