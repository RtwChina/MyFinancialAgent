## 1. CSS 修改

- [ ] 1.1 将 `styles.css` 中 `.keywords-tabs` 的 `padding: 0 16px 8px` 改为 `padding: 0 0 8px`，消除水平方向多余缩进
- [ ] 1.2 将 `styles.css` 中 `.keywords-content` 的 `padding: 8px 16px 16px` 改为 `padding: 8px 0 16px`，消除水平方向多余缩进

## 2. 验证与发布

- [ ] 2.1 在本地开发环境打开前端页面，执行以下检查清单：
  - [ ] 关键词管理：Tab bar 左边界与上方「关键词」输入框左边界对齐
  - [ ] 关键词管理：表格左边界与上方输入区对齐
  - [ ] 切换至标的管理：确认标的管理页面布局不受影响
  - [ ] Tab bar 底部分隔线仍横跨全宽（无视觉断裂）
- [ ] 2.2 确认 `styles.css` 无语法错误（DevTools Console 无 CSS 报错）
- [ ] 2.3 确认通过后，部署至生产环境（`wrangler pages deploy` 或等效命令）
