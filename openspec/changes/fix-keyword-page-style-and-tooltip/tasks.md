## 1. 修复 tip-panel 气泡 hover 间隙

- [x] 1.1 在 `styles.css` 的 `.tip-trigger.tip-panel .bubble` 规则块中，添加 `::before` 透明桥接伪元素（`height: 12px; bottom: 100%; left: 0; width: 100%; background: transparent`），注释标注 `/* bridge: matches top offset */`
- [ ] 1.2 验证标的管理和关键词管理页面的 tip-panel：鼠标从 icon 移向气泡时不消失，鼠标在气泡内停留时保持可见，鼠标离开后正常收起

## 2. 统一关键词管理输入区样式

- [x] 2.1 移除 `styles.css` 中 `.keywords-add-bar` 的 `padding: 12px 16px`，使其与 `.symbols-add-bar` 间距对齐
- [x] 2.2 检查 `.keywords-add-bar .search-field` 中是否有重复覆盖全局 `.search-field` 的规则（`border-radius`、`padding`、`border` 等），如有则删除冗余部分，保留必要的 `min-width` 等差异化设置
- [ ] 2.3 在浏览器中对比「标的管理」和「关键词管理」的输入区，确认视觉层级、间距、输入框高度一致

## 3. 验证与发布

- [ ] 3.1 在本地开发环境（`127.0.0.1` 或 `localhost`）打开前端页面，执行以下检查清单：
  - [ ] 关键词管理：鼠标移至 ⓘ 图标 → 气泡展开；鼠标移入气泡 → 气泡保持；鼠标移出 → 气泡收起
  - [ ] 标的管理：同上逻辑，确认原有行为未受影响
  - [ ] 关键词管理输入区与标的管理输入区视觉一致
  - [ ] 小屏幕（< 600px）下关键词管理输入区正常换行
- [ ] 3.2 确认 `styles.css` 无语法错误（浏览器 DevTools Console 无 CSS 报错）
- [ ] 3.3 将变更部署至生产环境（`wrangler pages deploy` 或等效命令），确认线上行为与本地一致
