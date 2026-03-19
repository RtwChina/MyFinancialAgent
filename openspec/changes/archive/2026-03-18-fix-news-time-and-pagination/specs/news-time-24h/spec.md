## ADDED Requirements

### Requirement: 新闻发布时间使用 24 小时制展示
前端所有展示 `pub_date` 的位置（检索台列表行、新闻详情弹窗、复盘新闻选择器）SHALL 以 24 小时制格式（`HH:mm` 或 `YYYY-MM-DD HH:mm`）显示时间，不得出现 AM/PM 标识或 12 小时制数字。

#### Scenario: 检索台列表行时间显示
- **GIVEN** API 返回的 `pub_date` 为 `"2026-03-18 14:30:00"`
- **WHEN** `buildNewsRow` 渲染该条新闻
- **THEN** 时间列显示 `"14:30"`，不显示 `"2:30 PM"`

#### Scenario: 深夜时间不歧义
- **GIVEN** `pub_date` 为 `"2026-03-18 00:05:00"`
- **WHEN** 前端渲染该时间
- **THEN** 显示 `"00:05"`，不显示 `"12:05"`

#### Scenario: 时间窗口边界格式化
- **GIVEN** 复盘时间窗口边界值为 `"2026-03-18 20:00:00"`
- **WHEN** `formatNewsWindowBoundaryBeijing` 格式化该值
- **THEN** 输出包含 `"20:00"` 而非 `"8:00 PM"`
