## Context

项目当前状态：
- 9 个 OpenSpec 变更（4 个完成、4 个未完成、1 个进行中）
- 多处临时文件未清理（数据库、日志、缓存）
- 文档分散在多处，部分可能过时

当前目录结构问题：
```
tests/standards/          # 测试规范
openspec/docs/testing/    # 重复的测试规范

docs/rfcs/项目需求文档.md  # PRD
项目需求文档.md            # PRD 副本
```

## Goals / Non-Goals

**Goals:**
- 归档所有未完成的 OpenSpec 变更
- 删除不纳入版本控制的临时文件
- 统一文档位置，删除重复文件
- 更新文档确保与当前代码一致

**Non-Goals:**
- 不修改任何代码逻辑
- 不添加新功能
- 不修改数据库 schema

## Decisions

### 1. OpenSpec 变更处理

| 变更名 | 状态 | 处理方式 |
|--------|------|----------|
| use-beijing-time | 7/8 | 归档（功能已基本完成） |
| normalize-news-related-symbols | 5/7 | 归档（核心功能已完成） |
| fix-price-partial-candle | 11/12 | 归档（核心功能已完成） |
| fix-news-workflow-mode | 1/2 | 归档（剩余任务不重要） |

**命令**：`openspec archive <change-name>`

### 2. 文件删除清单

**删除**：
```
financial_data.db                    # 本地 SQLite（生产用 D1）
output/financial_data.db             # 输出目录数据库
logs/                                # 本地日志目录
.wrangler/cache/                     # Cloudflare 缓存
test-results/.last-run.json          # 测试运行缓存
tests/runs/*                         # 历史测试报告（12个文件）
openspec/docs/testing/*              # 重复的测试规范
项目需求文档.md                       # PRD 副本
```

### 3. 文档更新顺序

```
1. CLAUDE.md          # 项目规范（最高优先级）
2. README.md          # 项目说明
3. docs/rfcs/项目需求文档.md  # PRD
4. tests/standards/*  # 测试规范
5. docs/arch/*        # 架构文档
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 删除文件可能误删重要内容 | 先检查 `.gitignore`，确认这些文件本就不应提交 |
| 文档更新可能引入错误 | 对比代码实现，逐项验证 |
| 归档变更可能丢失上下文 | 归档后文件仍在 `openspec/changes/archive/` 可查 |