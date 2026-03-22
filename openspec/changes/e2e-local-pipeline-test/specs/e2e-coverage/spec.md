## Overview

本地真实数据端到端测试覆盖范围。

## Requirements

- REQ-1：hourly-news 任务执行完成，日志无 CRITICAL/未预期异常
- REQ-2：D1 中有新闻写入（`news_raw_data` 条数 > 0）
- REQ-3：pipeline_trace 有记录，三级漏斗数据完整
- REQ-4：复盘记录被初始化（`daily_review_archive` 有 initialized 记录）
- REQ-5：前端新闻列表可展示真实数据
- REQ-6：close-summary 任务执行完成，价格数据写入正常
- REQ-7：若有已 reviewed 记录，guard 生效（日志含"跳过初始化"warning）
