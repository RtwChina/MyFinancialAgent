## 1. 低风险清理（可安全删除）

- [ ] 1.1 确认 `financial_data.db` 未在版本控制中，删除
- [ ] 1.2 确认 `output/financial_data.db` 未在版本控制中，删除
- [ ] 1.3 删除 `logs/` 目录
- [ ] 1.4 删除 `.wrangler/cache/` 目录
- [ ] 1.5 删除 `test-results/.last-run.json`
- [ ] 1.6 确认 `.gitignore` 已包含这些路径

## 2. 归档已完成的 OpenSpec 变更

- [ ] 2.1 归档 `enhance-logging-detail` (11/11)
- [ ] 2.2 归档 `standardize-logging` (34/34)
- [ ] 2.3 归档 `fix-news-time-format` (13/13)

## 3. 高风险项审查（先对比再决定）

### 3.1 tests/runs/ 历史测试报告
- [ ] 3.1.1 检查 `tests/runs/` 下文件是否有保留价值
- [ ] 3.1.2 根据审查结果决定：删除 / 移动到其他位置 / 保留

### 3.2 测试规范重复
- [ ] 3.2.1 对比 `openspec/docs/testing/` 与 `tests/standards/` 内容差异
- [ ] 3.2.2 如有差异，合并到 `tests/standards/`
- [ ] 3.2.3 确认无遗漏后删除 `openspec/docs/testing/`

### 3.3 PRD 重复
- [ ] 3.3.1 对比根目录 `项目需求文档.md` 与 `docs/rfcs/项目需求文档.md`
- [ ] 3.3.2 如有差异，合并到 `docs/rfcs/`
- [ ] 3.3.3 确认无遗漏后删除根目录副本

## 4. 归档未完成的 OpenSpec 变更

- [ ] 4.1 归档 `refactor-screening-rules` (10/11)
- [ ] 4.2 归档 `use-beijing-time` (7/8)
- [ ] 4.3 归档 `normalize-news-related-symbols` (5/7)
- [ ] 4.4 归档 `fix-price-partial-candle` (11/12)
- [ ] 4.5 归档 `fix-news-workflow-mode` (1/2)

## 5. 文档审查（列出差异，待确认后修改）

### 5.1 CLAUDE.md 审查
- [ ] 5.1.1 阅读当前 `CLAUDE.md`
- [ ] 5.1.2 对比当前代码实现，列出不一致项
- [ ] 5.1.3 提出修改建议，待确认

### 5.2 README.md 审查
- [ ] 5.2.1 阅读当前 `README.md`
- [ ] 5.2.2 检查安装步骤是否有效
- [ ] 5.2.3 列出需要更新的内容，待确认

### 5.3 docs/rfcs/项目需求文档.md 审查
- [ ] 5.3.1 阅读当前 PRD
- [ ] 5.3.2 对比已实现功能，列出不一致项
- [ ] 5.3.3 提出修改建议，待确认

### 5.4 tests/standards/ 审查
- [ ] 5.4.1 阅读当前测试规范
- [ ] 5.4.2 对比当前测试代码，列出不一致项
- [ ] 5.4.3 提出修改建议，待确认

### 5.5 docs/arch/ 架构文档审查
- [ ] 5.5.1 阅读当前架构文档
- [ ] 5.5.2 对比当前代码结构，列出不一致项
- [ ] 5.5.3 提出修改建议，待确认

## 6. 执行文档修改（确认后执行）

- [ ] 6.1 根据审查结果更新各文档
- [ ] 6.2 验证项目仍可正常运行