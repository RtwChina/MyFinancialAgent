## ADDED Requirements

### Requirement: 关键词管理页面输入区样式与标的管理一致
关键词管理的添加输入区（`.keywords-add-bar`）SHALL 与标的管理的 `.symbols-add-bar` 在间距、层次、输入框尺寸上保持视觉一致，不得有独立的背景填充或额外内边距。

#### Scenario: 两页面输入区视觉对比
- **WHEN** 用户切换「标的管理」和「关键词管理」标签页
- **THEN** 两个页面的输入区在视觉层级、间距和输入框样式上保持一致，不出现明显的风格跳变

#### Scenario: 小屏幕下 flex-wrap 正常换行
- **WHEN** 视口宽度小于 600px
- **THEN** 关键词管理输入区的多个 `.search-field` SHALL 正常换行，不出现横向溢出

### Requirement: tip-panel 气泡在鼠标移入时保持可见
`.tip-trigger.tip-panel .bubble` SHALL 在用户将鼠标从触发图标移向气泡内容的过程中保持可见，不得因鼠标经过图标与气泡之间的间隙而消失。

#### Scenario: 鼠标从 icon 移向气泡不消失
- **WHEN** 用户将鼠标悬停在 `.tip-trigger.tip-panel` 的 SVG 图标上，气泡展开
- **WHEN** 用户将鼠标从图标移向气泡内容区域
- **THEN** 气泡 SHALL 持续可见，不得在鼠标经过图标与气泡之间间隙时消失

#### Scenario: 鼠标在气泡内部时气泡保持可见
- **WHEN** 用户将鼠标移入已展开的气泡内容区域
- **THEN** 气泡 SHALL 保持可见，允许用户阅读气泡中的文字内容

#### Scenario: 鼠标离开触发区域后气泡收起
- **WHEN** 用户将鼠标移出 `.tip-trigger.tip-panel` 及其气泡范围
- **THEN** 气泡 SHALL 收起隐藏
