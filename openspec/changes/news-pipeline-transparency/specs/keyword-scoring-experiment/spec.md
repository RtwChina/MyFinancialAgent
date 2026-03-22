## ADDED Requirements

### Requirement: three-strategies-parallel
系统 SHALL 对每条新闻同时计算三种关键词评分策略的分数，并全部记入 `news_filter_log`：
- **策略 A（线性加权）**：`score = count * weight`，现有逻辑
- **策略 B（BM25 饱和）**：`score = weight * (count * (k1+1)) / (count + k1)`，k1=1.2
- **策略 C（BM25 饱和 + 标题加权）**：标题命中计数 ×2 + 正文命中计数，再走 BM25 饱和

第三方接口分类：纯本地计算（A 类），无外部依赖。

#### Scenario: 三种分数全部记录
- **GIVEN** 一条新闻标题为"美联储宣布降息50基点"，正文包含"利率"、"通胀"
- **WHEN** 关键词规则阶段执行
- **THEN** filter_log 中 `strategy_a_score`、`strategy_b_score`、`strategy_c_score` 三个字段均有值且各不相同

#### Scenario: 多次关键词命中的饱和效果
- **GIVEN** 一条新闻命中 4 个 macro 关键词（weight=2.5）
- **WHEN** 计算策略 A 和策略 B
- **THEN** 策略 A 分数 = 4 × 2.5 = 10.0，策略 B 分数 ≈ 2.5 × (4×2.2)/(4+1.2) ≈ 4.23（饱和效果明显）

### Requirement: title-weight-fallback
策略 C 中，当新闻 `title` 为空时，SHALL 退化为策略 B 的行为（仅使用正文命中计数）。

#### Scenario: 有标题的新闻
- **GIVEN** 一条新闻 title="美联储降息"（命中"美联储"、"降息"），content 中额外命中"利率"
- **WHEN** 策略 C 计算
- **THEN** macro effective_count = title_hits(2) × 2 + body_hits(1) = 5，饱和后分数 > 策略 B 分数

#### Scenario: 无标题的新闻
- **GIVEN** 一条新闻 title 为空字符串，content 命中 3 个 macro 关键词
- **WHEN** 策略 C 计算
- **THEN** macro effective_count = 0 × 2 + 3 = 3，与策略 B 的 count=3 结果相同

### Requirement: active-strategy-configurable
系统 SHALL 通过 `RULE_ACTIVE_STRATEGY` 配置项（默认 `A`）决定实际过滤使用哪种策略的分数。三种分数始终全部计算并记录。

#### Scenario: 切换激活策略
- **GIVEN** `RULE_ACTIVE_STRATEGY=B`
- **WHEN** 规则初筛判断是否保留
- **THEN** 使用 `strategy_b_score` 与 `rule_threshold` 比较，但 filter_log 中 A、B、C 三个分数都有记录

冒烟用例触发条件：当评分公式或策略切换逻辑有变更时，需验证三种分数均正确计算、active_strategy 切换生效。
