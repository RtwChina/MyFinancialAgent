## Why

当前日志缺乏统一规范：启动信息冗余重复（两段分隔线 + 版本号不一致）、配置参数和阶段超时分两行打印、各模块日志格式不统一（有的用 f-string 有的用 %s）、print 与 logger 混用、缺少阶段耗时统计。排查问题时难以快速定位关键信息。

## What Changes

- 定义日志级别使用规范：INFO 只输出关键节点，DEBUG 输出过程细节
- 统一启动日志：合并为一段，包含版本、配置、时区信息
- 合并配置日志：将 LLM_TIMEOUT 和各阶段超时合为一行
- 移除冗余分隔线和重复的版本号日志
- 统一 logger 调用风格：全部使用 `%s` 占位符，不用 f-string
- 每个阶段结束时输出耗时（秒）
- 移除 print 输出，全部改用 logger
- 统一错误日志格式：`[阶段] 错误描述: 详情`
- 外部调用异常（HTTP、LLM、D1）统一打 ERROR 日志
- Pipeline 结束时输出 LLM 调用汇总：按模型分组统计调用次数、token 数、耗时
- 关键中间态数据（初筛关键词、LLM 返回片段等）记入 INFO 日志，逐条打分细节用 DEBUG

## Capabilities

### New Capabilities
- `logging-standard`: 日志规范定义，包括级别使用规则、格式模板、阶段耗时统计

### Modified Capabilities

## Impact

- `src/logger_utils.py` — 格式调整
- `src/collect_news_v3.py` — 主要改动，约 40+ 处日志调用
- `src/collect_prices.py` — 少量日志调整
- `src/cloudflare_ingest.py` — 少量日志调整
- `src/llm_client.py` — 错误日志格式统一，新增调用计数器和汇总方法
- `main.py` — 启动日志合并
- `src/data_sources/news_live.py` — 统一格式
- `src/data_sources/price_live.py` — 统一格式
- 不涉及 API 接口变更，不涉及数据库变更
