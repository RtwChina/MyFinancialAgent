## Why

### 差异分析：哪些需要对齐，哪些应该保留

通过逐项对比两个页面的 CSS 和 HTML，差异分为两类：

#### ✅ 应保留的功能性差异（不改）

| 差异点 | 标的管理 | 关键词管理 | 结论 |
|---|---|---|---
| 添加表单 | 1个大宽输入框（border-radius:14px, min-height:42px） | 3个紧凑字段（关键词+类型+语言） | 关键词需要多字段并排，紧凑样式合理 |
| 分类导航 | 无 | Tab bar（宏观/市场/噪音/标的事件） | 功能性分组，关键词独有 |
| 表格结构 | 6列（含拖拽、别名） | 4列（关键词/语言/状态/操作） | 数据结构不同 |
| 行排序 | 支持拖拽排序 | 不需要排序 | 功能差异 |
| 表格分组 | 颜色分节（大盘/板块/个股） | 无分节 | 由 Tab 替代 |

#### ❌ 应该对齐的布局偏差（需改）

| 差异点 | 标的管理 | 关键词管理 | 问题 |
|---|---|---|---|
| 表格区内边距 | `.symbols-content`：无额外 padding | `.keywords-content`：`padding: 8px 16px 16px` | 表格左右额外缩进 16px，与上方输入区不对齐 |
| Tab bar 内边距 | N/A | `.keywords-tabs`：`padding: 0 16px 8px` | Tab 按钮起始位置比输入区多缩进 16px |

**根本原因**：`.panel` 已有 `padding: 20px`，所有内容自然在 20px 边距内；但 `.keywords-content` 和 `.keywords-tabs` 额外加了 16px 左右 padding，导致 Tab 和表格相对于上方添加区有额外缩进，视觉上不对齐。

**结论：只需修复这两处 padding 偏差**，其余差异均为合理的功能性设计。

## What Changes

- 移除 `.keywords-content` 的水平 padding（`16px`），仅保留垂直间距（`8px 0 16px`）
- 移除 `.keywords-tabs` 的水平 padding（`16px`），仅保留底部间距（`0 0 8px`）

这两项修改使 Tab bar 和表格的左右边界与上方添加输入区对齐，和标的管理保持一致。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无 spec 级行为变更（纯 CSS 布局修复）。

## Impact

- `cloudflare/web/styles.css`：修改 `.keywords-content` 和 `.keywords-tabs` 的 padding
- 无逻辑、无 API、无数据变更，非破坏性
