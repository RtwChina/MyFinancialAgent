## Why

项目经过多轮迭代后，存在以下问题：
1. **未完成的变更堆积**：4个进行中的 OpenSpec 变更未完成，影响工作区整洁
2. **可废弃文件残留**：测试数据库、日志文件、缓存文件等未纳入版本控制
3. **文档重复与过时**：测试规范在两处重复、PRD 有副本、架构文档可能过时

## What Changes

### 清理与归档
- 归档 4 个未完成的 OpenSpec 变更（`use-beijing-time`、`normalize-news-related-symbols`、`fix-price-partial-candle`、`fix-news-workflow-mode`）
- 删除可废弃文件：`financial_data.db`、`logs/`、`.wrangler/cache/`、`test-results/`、`tests/runs/*`
- 删除重复文档：`openspec/docs/testing/*`、根目录的 `项目需求文档.md`

### 文档更新
- 更新 `CLAUDE.md` 确保与当前代码规范一致
- 更新 `README.md` 反映当前项目状态
- 更新 `docs/rfcs/项目需求文档.md` 反映当前功能范围
- 更新 `tests/standards/*.md` 确保与当前测试实现一致
- 更新 `docs/arch/*.md` 确保与当前架构一致

### 目录结构优化
- 统一测试规范位置：`tests/standards/`
- 统一 PRD 位置：`docs/rfcs/`

## Capabilities

### New Capabilities
- `documentation-consistency`: 文档与代码一致性规范，确保文档反映当前实现状态

### Modified Capabilities
- 无（本次为文档清理，不涉及功能变更）

## Impact

- 删除文件不影响代码运行（均为临时文件或副本）
- 文档更新可能影响开发规范
- 归档变更不影响已完成的功能