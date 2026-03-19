## Context

当前 8 个 Python 模块共约 100 处日志调用，存在以下问题：
1. 启动日志冗余：`main.py` 打一段分隔线，`collect_news_v3.py` 又打一段，版本号不一致（v4.0 vs v5.0）
2. 配置信息拆成两行：`配置: ...LLM_TIMEOUT=300s` 和 `阶段超时: rules=300s, batch=300s, summary=300s`
3. print 与 logger 混用：`collect_news_v3.py` 中有 `print("正在采集新闻...")`
4. 格式风格不统一：有 f-string（`f"失败: {str(e)}"`）也有 %s 占位符
5. 缺少阶段耗时：无法快速判断哪个阶段慢

## Goals / Non-Goals

**Goals:**
- 定义清晰的日志级别规范
- 启动日志合并为一段，消除重复
- 每个关键阶段输出耗时
- 统一代码风格为 `%s` 占位符
- 移除所有 print，统一用 logger
- 外部调用异常统一打 ERROR 日志（HTTP、LLM、D1 等）
- Pipeline 结束时输出 LLM 调用汇总（按模型分组：调用次数、token 数、总耗时）
- 关键中间态数据记入 DEBUG 日志（初筛关键词、规则得分、LLM 原始输出片段等）

**Non-Goals:**
- 不引入结构化日志（JSON 格式），当前 plain text 足够
- 不改动日志文件名或轮转策略
- 不改动 logger_utils.py 的核心架构

## Decisions

### 1. 日志级别规范

| 级别 | 用途 | 示例 |
|------|------|------|
| ERROR | 影响功能的异常，需要关注 | LLM 超时、API 写入失败 |
| INFO | 关键节点和结果 | 阶段开始/完成 + 耗时、最终结果计数 |
| DEBUG | 单条记录级别的过程细节 | 单条新闻的规则命中词和得分 |

**不使用 WARNING**：当前场景中"警告"都应该是 ERROR（超时、失败）或 INFO（正常提示）。

### 2. 启动日志格式

合并为一段，取消重复分隔线：

```
========== 新闻采集 v5.0 启动 ==========
分析日: 2026-03-18 | 模式: hourly-news
LLM: rules=qwen3.5-plus, batch=qwen3.5-flash, summary=qwen3.5-plus
超时: rules=300s, batch=300s, summary=300s | 重试=2 | 并发=2 | 批量=6
================================================
```

### 3. 阶段耗时格式

每个阶段完成时输出耗时：

```
[采集] 完成: 114条, 耗时 3.2s
[初筛] 完成: 保留 10/114条, 耗时 64.1s
[批次分析] 完成: 保留 8条, 耗时 53.4s
[写入D1] 完成: 新增 7, 更新 3, 耗时 5.8s
[日总结] 完成: 已更新, 耗时 12.3s
```

### 4. 错误日志格式

统一为 `[阶段] 错误类型: 详情`：

```
[初筛] LLM超时: model=qwen3.5-plus, timeout=300s, retry=2/2
[写入D1] API错误: status=500, message=...
```

### 5. 代码风格

- 全部使用 `logger.info("xxx %s", var)` 风格，不用 f-string
- 理由：延迟求值，日志被过滤时不会浪费格式化开销

### 6. 外部调用异常统一 ERROR

所有外部调用（HTTP 请求、LLM API、Cloudflare D1）的异常一律用 `logger.error`，格式为 `[阶段] 错误类型: 详情`。
当前部分数据源采集失败只打了 f-string error，需统一格式并确保 `exc_info=True` 用于可追溯的异常。

### 7. LLM 调用汇总

在 `LLMClient` 中增加实例级计数器，按 model 累计：
- `call_count`: 调用次数（含失败）
- `total_prompt_chars`: 总 prompt 字符数
- `total_response_chars`: 总 response 字符数
- `total_elapsed`: 总耗时（秒）

Pipeline 结束时调用 `llm_client.log_summary()` 输出汇总：

```
[LLM汇总] qwen3.5-plus: 调用 5次, prompt 12.3k字, response 4.1k字, 耗时 89.2s
[LLM汇总] qwen3.5-flash: 调用 2次, prompt 6.8k字, response 2.0k字, 耗时 24.5s
```

### 8. 中间态数据日志

关键中间态数据用 `logger.info` 记录，便于排查问题：

- 初筛阶段：动态生成的关键词列表、score_threshold
- 批次分析：LLM 原始返回文本片段（前 200 字符）
- 日总结：候选新闻数量和 news_hash 列表

单条新闻级别的细节（每条的命中关键词和得分）用 `logger.debug`，避免刷屏。

## Risks / Trade-offs

- [风险] 改动面广（100+ 处） → 分模块逐个改，每改完一个模块验证一次
- [风险] 阶段标签 `[采集]` 增加了字符 → 换来的是快速定位能力，值得
- [取舍] 不做 JSON 结构化日志 → 当前单用户场景 plain text 够用，未来需要可再加
