## Why

前端页面（关键词管理、ReadMe、标的管理 tip-panel）存在多处 BUG，目前缺乏系统性的本地测试流程。每次改动后无法在发布前验证功能正确性，导致问题流向生产环境。

**Why Now**: 关键词管理功能刚开发完成，需要确保页面交互稳定后再发布。

## What Changes

- 新增本地前端测试框架（Playwright），支持模拟用户点击操作
- 编写冒烟测试用例覆盖核心页面流程
- 建立"开发 → 本地测试 → 修复 → 复测"的迭代流程

## Capabilities

### New Capabilities

- `frontend-smoke-test`: 前端页面冒烟测试，覆盖导航、标签页切换、表单交互、API 调用 mock

### Modified Capabilities

无

## Impact

- 新增 `tests/frontend/` 目录存放 Playwright 测试脚本
- 新增 npm 依赖（playwright）
- 不影响现有代码逻辑