## ADDED Requirements

### Requirement: symbol-profile-embeddings
系统 SHALL 为每个 tracked_symbol 维护一段 profile 文本（如 "Micron Technology MU 美光科技 DRAM NAND 半导体存储芯片"），并在每次 pipeline 执行时通过 DashScope text-embedding-v3 API 生成 profile 向量。

第三方接口分类：DashScope Embedding API（B 类，不可控）。测试时使用固定 mock 向量。

#### Scenario: profile 向量生成
- **GIVEN** tracked_symbols 包含 MU、LITE、MSFT、GOOGL 等标的
- **WHEN** pipeline 启动 Embedding 阶段
- **THEN** 为每个标的生成一个 embedding 向量，维度与 text-embedding-v3 输出一致

### Requirement: news-embedding-batch
系统 SHALL 对 Stage 1 通过的新闻批量调用 DashScope text-embedding-v3 API，输入为 `title + content[:200]` 拼接文本。

#### Scenario: 批量生成新闻向量
- **GIVEN** Stage 1 通过了 60 条新闻
- **WHEN** 调用 Embedding API
- **THEN** 返回 60 个向量，每条新闻对应一个

### Requirement: cosine-similarity-filter
系统 SHALL 计算每条新闻向量与所有标的 profile 向量的余弦相似度，取最大值。低于 `EMBEDDING_SIMILARITY_THRESHOLD`（默认 0.3）的新闻被过滤。

#### Scenario: 相似度高于阈值
- **GIVEN** 一条关于"美光科技 DRAM 涨价"的新闻，与 MU profile 的余弦相似度 = 0.72
- **WHEN** 阈值 = 0.3
- **THEN** 新闻通过 Embedding 过滤，filter_log 记录 `embedding_decision='pass'`，`embedding_similarity=0.72`，`embedding_matched_symbol='MU'`

#### Scenario: 相似度低于阈值
- **GIVEN** 一条关于"某地方政府债券发行"的新闻，与所有标的的最大相似度 = 0.15
- **WHEN** 阈值 = 0.3
- **THEN** 新闻被过滤，filter_log 记录 `embedding_decision='filter'`，`embedding_similarity=0.15`

### Requirement: embedding-api-degradation
DashScope Embedding API 超时或异常时，系统 SHALL 跳过整个 Embedding 阶段，所有 Stage 1 通过的新闻直接进入 Stage 3。

#### Scenario: API 超时降级
- **GIVEN** DashScope Embedding API 调用超时
- **WHEN** 异常被捕获
- **THEN** 所有 Stage 1 通过的新闻 `embedding_decision='skipped'`，直接进入 LLM 阶段，pipeline_trace 记录 `error_message` 包含 "embedding API timeout"

### Requirement: embedding-threshold-configurable
`EMBEDDING_SIMILARITY_THRESHOLD` SHALL 可通过环境变量配置，默认 0.3。

#### Scenario: 调高阈值
- **GIVEN** `EMBEDDING_SIMILARITY_THRESHOLD=0.5`
- **WHEN** Embedding 过滤执行
- **THEN** 更多新闻被过滤，进入 Stage 3 的数量减少

冒烟用例触发条件：当 Embedding 过滤逻辑有变更时，需验证：(1) 正常过滤生效 (2) API 超时降级不阻塞 pipeline (3) 阈值配置生效。
