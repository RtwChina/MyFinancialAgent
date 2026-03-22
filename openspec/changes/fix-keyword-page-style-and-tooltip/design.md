## Context

当前 `styles.css` 中 `.keywords-add-bar` 有独立的 `padding: 12px 16px` 和内嵌 `.search-field` 覆盖规则，与 `.symbols-add-bar`（无内边距，直接复用全局 `.search-field`）在视觉层级上存在差距。

`.tip-trigger.tip-panel .bubble` 通过 `top: calc(100% + 8px)` 与触发 icon 保持 8px 间距（用于放置 `::after` 小三角）。当鼠标从 icon 移向气泡时，会经过这段间距，此时触发元素失去 hover，子元素气泡尚未获得 hover，CSS 无法维持可见状态，气泡消失。

## Goals / Non-Goals

**Goals:**
- `keywords-add-bar` 区域视觉与 `symbols-add-bar` 对齐（间距、背景、输入框层次）
- 修复 `.tip-trigger.tip-panel .bubble` 鼠标移入过程中气泡消失的问题（针对 `.tip-panel` 变体）

**Non-Goals:**
- 不修改标准（非 `.tip-panel`）tooltip 的行为
- 不重构 HTML 结构（仅 CSS 调整）
- 不涉及功能逻辑、Worker 或采集链路

## Decisions

### 决策 1：用 `::before` 透明桥接修复 tip-panel hover 间距

**方案 A（采用）**：在 `.tip-trigger.tip-panel .bubble::before` 添加透明伪元素，高度覆盖 8px 间距，置于气泡顶部外侧，使鼠标经过时 hover 链保持连通。

```css
.tip-trigger.tip-panel .bubble::before {
  content: "";
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 100%;
  height: 12px; /* 大于 8px 的间距，留余量 */
  background: transparent;
}
```

**方案 B（放弃）**：用 JavaScript `mouseenter/mouseleave` + 延迟隐藏。引入 JS 增加复杂度，且违背"只做被要求的改动"原则。

**方案 C（放弃）**：将 `top` 改为 `top: 100%`（零间距）。会遮挡 `::after` 三角，视觉断裂。

### 决策 2：`keywords-add-bar` 样式与 `symbols-add-bar` 对齐

移除 `.keywords-add-bar` 中多余的 `padding: 12px 16px`，使其与 `.symbols-add-bar` 的 `margin-bottom: 16px` 节奏保持一致。输入框与 select 继承全局 `.search-field` 样式，无需独立覆盖 `border-radius`、`padding` 等。

## Risks / Trade-offs

- `::before` 桥接元素覆盖了气泡上方区域，若未来调整气泡偏移量需同步更新 `height`。→ 在 CSS 注释中标注 `/* bridge: matches top offset */`
- 修改 `keywords-add-bar` padding 可能影响小屏幕下的 `flex-wrap` 换行时机，需验证移动端宽度。
