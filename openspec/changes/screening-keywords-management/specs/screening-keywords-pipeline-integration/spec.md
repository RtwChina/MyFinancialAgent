## ADDED Requirements

### Requirement: Pipeline 从 API 拉取关键词

Pipeline 启动时 SHALL 通过 `GET /api/screening-keywords?active=1` 拉取全部生效关键词，按 keyword_type 分组构建 screening profile，替代硬编码 `BASE_*` 常量。

接口分类：B 类（不可控）— 网络请求可能失败。Mock 策略：集成测试时 mock HTTP 响应返回固定关键词列表。

冒烟用例触发条件：`python main.py hourly-news` 启动后日志输出 `[Stage 1] 从 API 加载 N 个关键词`。

#### Scenario: API 正常返回
- **WHEN** Pipeline 启动且 API 返回 200 + 关键词列表
- **THEN** Pipeline SHALL 按 keyword_type 分组构建 profile（macro_keywords / market_keywords / noise_keywords / symbol_context_keywords），日志记录加载数量

#### Scenario: API 不可达降级
- **WHEN** Pipeline 启动且 API 请求超时（5s）或返回非 200
- **THEN** Pipeline SHALL 使用本地 `FALLBACK_KEYWORDS` 常量作为兜底，日志输出 warning 级别告警，Pipeline 继续正常执行

#### Scenario: API 返回空列表
- **WHEN** API 返回 200 但关键词列表为空
- **THEN** Pipeline SHALL 使用本地 `FALLBACK_KEYWORDS` 兜底（空列表视为异常状态）

### Requirement: 移除硬编码关键词常量

`collect_news_v3.py` 中的 `BASE_MACRO_KEYWORDS` / `BASE_MARKET_KEYWORDS` / `BASE_NOISE_KEYWORDS` / `BASE_SYMBOL_CONTEXT_KEYWORDS` 四个常量 SHALL 被移除，替换为 `FALLBACK_KEYWORDS` 单一 dict 常量（内容与 seed 数据一致）。

#### Scenario: 兜底数据与 seed 一致
- **WHEN** `FALLBACK_KEYWORDS` 被使用
- **THEN** 其内容 SHALL 与 migration seed 的基础词完全一致（84 个词，按 keyword_type 分组）
