## Context

本次上线涉及两类改动：
1. Worker `initializeReview` 新增 reviewed guard + 返回 `skipped: true`
2. 前端清理 draft 死代码（initializeBtn、setReviewMode）、Worker saveReview 简化

测试在本地 `wrangler dev`（APP_ENV=test）环境执行，覆盖 API 端点和前端交互。

## Goals / Non-Goals

**Goals:**
- 验证 guard 逻辑正确，reviewed 记录不被覆盖
- 验证前端编辑/保存/完成复盘流程无回归
- 验证 Worker 核心 API（health、news、reviews）正常响应
- 验证采集 pipeline 关键词加载、新闻写入、trace 记录正常

**Non-Goals:**
- 不覆盖所有边界情况（完整回归测试）
- 不测试生产数据库（仅本地 D1）

## Decisions

测试分三层：
1. **API 层**：用 curl 直接调用 Worker 端点
2. **前端层**：手动操作本地页面验证交互
3. **Pipeline 层**：dry-run 模式运行采集脚本验证日志

## Risks / Trade-offs

- 本地测试环境与生产存在数据差异，但核心逻辑一致
- APP_ENV=test 下 INGEST_API_TOKEN 为空，write 接口不需要鉴权，与生产鉴权行为略有差异
