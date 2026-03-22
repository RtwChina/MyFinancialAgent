## Context

`.panel` 基础样式有 `padding: 20px`，所有面板内容（panel-header、add bar、table 等）均在这 20px 内对齐。标的管理按此约定：`.symbols-add-bar`、`.symbols-content` 均无额外水平 padding，内容左边界统一在面板 20px 处。

关键词管理存在偏差：
- `.keywords-tabs { padding: 0 16px 8px }` → Tab 按钮左边界在 20+16=36px 处
- `.keywords-content { padding: 8px 16px 16px }` → 表格左边界在 36px 处

结果：Tab bar 和表格相对于上方添加区（20px 处）向右缩进了 16px，视觉上不对齐。

## Goals / Non-Goals

**Goals:**
- 关键词管理的 Tab bar 和表格左右边界与上方添加输入区对齐（统一在 panel 20px 内边距处）
- 视觉上与标的管理的布局层次保持一致

**Non-Goals:**
- 不修改 Tab bar 的功能、样式（颜色、圆角等）
- 不修改表格内容、行样式
- 不改动 HTML 结构
- 不改动输入字段的紧凑样式（属于功能性设计差异）

## Decisions

**只改水平 padding，保留垂直间距**

`.keywords-tabs` 的 `padding: 0 16px 8px` → `padding: 0 0 8px`
`.keywords-content` 的 `padding: 8px 16px 16px` → `padding: 8px 0 16px`

保留垂直方向的 8px/16px 间距以维持内容节奏；仅移除水平 16px，使内容左右边界回到面板 padding 所定义的对齐线。

不需要调整 HTML，不需要新增 class，CSS 改动最小。

## Risks / Trade-offs

- 变更极小（4 个字符的 padding 值修改），风险可忽略
- `.keywords-tabs` 的 `border-bottom` 本身在元素 border-box 上，去掉水平 padding 后 border 宽度不变（仍横跨 panel 内容区全宽）— 不影响分隔线视觉
