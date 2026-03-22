## Why

关键词管理页面的输入区样式与标的管理页面存在视觉差异，影响一致性体验；同时 `.tip-panel` 气泡（`.bubble`）与触发图标之间有 8px 间距，鼠标从图标移向气泡时经过该空隙触发失焦，导致气泡消失。

## What Changes

- 统一 `keywords-add-bar` 布局与 `symbols-add-bar` 保持一致：去除多余的 `padding`、复用 `.search-field` 共享样式，使两个页面的表单区在视觉和交互上对齐
- 修复 `.tip-trigger.tip-panel .bubble` 的 hover 保持逻辑：通过在 `.bubble::before` 添加透明桥接区域（覆盖触发图标与气泡之间的 8px 间距），使鼠标在移入气泡过程中保持 hover 链不断开

## Capabilities

### New Capabilities

无新增独立 capability。

### Modified Capabilities

无 spec 级行为变更（纯 CSS 样式与交互修复）。

## Impact

- `cloudflare/web/styles.css`：修改 `.keywords-add-bar` 布局样式；修改 `.tip-trigger.tip-panel .bubble` 及 `::before` 伪元素规则
- `cloudflare/web/index.html`：`keywords-add-bar` 内 `.search-field` 去掉冗余 class 覆盖（如有）
- 不涉及 Worker、D1、Python 采集链路，无破坏性变更
