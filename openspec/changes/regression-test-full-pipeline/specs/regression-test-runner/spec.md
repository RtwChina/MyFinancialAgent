## ADDED Requirements

### Requirement: 参数矩阵驱动多组 Run
脚本 SHALL 支持 6 组参数组合（3 策略 × 2 Embedding 阈值）自动依次执行，每组 Run 通过 subprocess 隔离环境变量。

#### Scenario: 默认执行全部 6 组
- **GIVEN** 用户未指定 `--only` 参数
- **WHEN** 执行 `run_pipeline_regression.py`
- **THEN** 脚本依次执行 R1-R6 共 6 组 Run，每组使用独立子进程，环境变量按矩阵表注入

#### Scenario: 选择性执行部分 Run
- **GIVEN** 用户指定 `--only=R1,R4`
- **WHEN** 执行脚本
- **THEN** 仅执行 R1 和 R4，跳过其余 Run

#### Scenario: Run 间隔防 rate limit
- **GIVEN** 连续执行多组 Run
- **WHEN** 前一组 Run 结束
- **THEN** 等待 10 秒后再启动下一组，防止 Finnhub API rate limit

### Requirement: 子进程隔离执行
每组 Run MUST 使用 `subprocess.run()` 调用 wrapper 脚本，通过环境变量注入 `RULE_ACTIVE_STRATEGY`、`EMBEDDING_SIMILARITY_THRESHOLD`、`LLM_BATCH_TIMEOUT`、`LLM_RULES_TIMEOUT` 等参数。

#### Scenario: 环境变量隔离
- **GIVEN** R1 使用 Strategy=A, Threshold=0.40
- **WHEN** R1 执行完毕后启动 R2 (Strategy=B, Threshold=0.40)
- **THEN** R2 进程读取到的环境变量为 B/0.40，不受 R1 残留影响

#### Scenario: 子进程崩溃不阻塞后续
- **GIVEN** R3 因 LLM API 异常崩溃（exit code ≠ 0）
- **WHEN** 主脚本检测到子进程失败
- **THEN** 记录错误信息到该 Run 的 JSON 结果 `errors` 字段，继续执行 R4

### Requirement: 完整漏斗数据采集
每组 Run 的 JSON 结果 MUST 包含三级漏斗每层的 input/output/filtered/filter_rate/duration。

#### Scenario: 正常 Run 数据完整
- **GIVEN** 一组 Run 正常完成
- **WHEN** 解析输出 JSON
- **THEN** `funnel` 对象包含 `fetched`、`deduped`、`rule_input`、`rule_output`、`embedding_input`、`embedding_output`、`llm_input`、`llm_output` 及各阶段 `duration`

#### Scenario: Embedding 降级时数据标记
- **GIVEN** Embedding API 调用失败触发降级
- **WHEN** 该 Run 结束
- **THEN** `funnel.embedding_output` = `funnel.embedding_input`（全部放行），且 JSON 中 `embedding_degraded` = true

### Requirement: 打星分布与 CoT 质量采集
每组 Run MUST 记录 LLM 打星分布（1-5 星各多少条）、star_fallback_triggered 状态、以及 top 3 CoT 样本。

#### Scenario: 打星分布记录
- **GIVEN** LLM 阶段正常完成
- **WHEN** 解析输出 JSON
- **THEN** `star_distribution` 为 `{"1": N, "2": N, "3": N, "4": N, "5": N}` 格式

#### Scenario: 兜底触发记录
- **GIVEN** 某 batch 超时导致全 5 星，触发 `_score_to_stars()` 兜底
- **WHEN** 解析输出 JSON
- **THEN** `star_fallback_triggered` = true

#### Scenario: CoT 样本采集
- **GIVEN** LLM 正常返回带 `cot_reasoning` 的结果
- **WHEN** 解析输出 JSON
- **THEN** `cot_samples` 包含 3 条样本，每条含 `title`、`stars`、`cot_reasoning`

### Requirement: 英文新闻与空标题新闻追踪
每组 Run MUST 分别统计英文新闻和空标题新闻在各阶段的通过情况。

第三方接口分类：
- Finnhub API (B 类 - 不可控): 免费版 60 call/min，需配置 `FINNHUB_API_KEY`。mock 策略：回归测试不 mock，使用真实 API
- AkShare (B 类 - 不可控): 无 API Key 限制。mock 策略：回归测试不 mock，使用真实数据

#### Scenario: 英文新闻统计
- **GIVEN** FINNHUB_API_KEY 已配置，采集到英文新闻
- **WHEN** 解析输出 JSON
- **THEN** `english_news` 包含 `total`（采集到的英文条数）、`rule_passed`、`embedding_passed`、`llm_kept`

#### Scenario: 空标题新闻统计
- **GIVEN** 采集源包含 Jin10（title 为空）
- **WHEN** 解析输出 JSON
- **THEN** `empty_title` 包含 `total`（空标题条数）、`rule_passed`（策略 C 应退化为 B）、`final_kept`

### Requirement: 动态规则生成状态记录
每组 Run MUST 记录动态关键词规则生成是否成功，超时降级时记录降级信息。

#### Scenario: 动态规则成功
- **GIVEN** qwen3.5-plus 在 LLM_RULES_TIMEOUT 内返回动态规则
- **WHEN** 解析输出 JSON
- **THEN** `dynamic_rules_status` = "success"，`dynamic_rules_detail` 包含各类关键词数量

#### Scenario: 动态规则超时降级
- **GIVEN** 动态规则生成超时
- **WHEN** 解析输出 JSON
- **THEN** `dynamic_rules_status` = "timeout_degraded"

### Requirement: 固定参数保障可比性
所有 Run MUST 使用固定的 `LLM_BATCH_SIZE=8`、`LLM_MAX_WORKERS=3`、`LLM_BATCH_TIMEOUT=90`、`LLM_RULES_TIMEOUT=120`，确保策略对比公平。

#### Scenario: 参数一致性验证
- **GIVEN** 6 组 Run 全部完成
- **WHEN** 对比各 Run 的 `params` 字段
- **THEN** `LLM_BATCH_SIZE`、`LLM_MAX_WORKERS`、`LLM_BATCH_TIMEOUT`、`LLM_RULES_TIMEOUT` 在所有 Run 中一致

### Requirement: 结果 JSON 持久化
每组 Run 的结果 MUST 保存为独立 JSON 文件到 `tests/regression/results/` 目录。

#### Scenario: JSON 文件命名
- **GIVEN** R1 执行完成
- **WHEN** 查看结果目录
- **THEN** 存在文件 `tests/regression/results/R1_A_0.40_{timestamp}.json`

#### Scenario: 目录自动创建
- **GIVEN** `tests/regression/results/` 不存在
- **WHEN** 脚本启动
- **THEN** 自动创建目录
