## ADDED Requirements

### Requirement: LLM 输出的 related_symbols 写入前规范化为系统代码

系统 SHALL 在将 LLM 批处理结果写入 `news_raw_data.related_symbols` 之前，对每个 symbol 进行规范化：
- 若 symbol 已是 `tracked_symbols.symbol`（系统代码），保留
- 若 symbol 是系统代码的已知别名（在 `symbol_registry.py` aliases 中），转换为对应系统代码
- 否则丢弃

最终存储的 `related_symbols` 中，所有值 MUST 是 `tracked_symbols.symbol` 中存在的系统代码。

#### Scenario: LLM 输出非跟踪 A 股代码

- **GIVEN** LLM 返回 `related_symbols = ["002475.SZ", "MU"]`
- **WHEN** 执行规范化
- **THEN** 结果为 `["MU"]`，`002475.SZ` 被丢弃

#### Scenario: LLM 输出 Yahoo Finance 格式别名

- **GIVEN** LLM 返回 `related_symbols = ["DX-Y.NYB", "GC=F"]`
- **WHEN** 执行规范化
- **THEN** 结果为 `["DXY", "GOLD"]`（映射为系统代码）

#### Scenario: LLM 输出已是系统代码

- **GIVEN** LLM 返回 `related_symbols = ["DXY", "GSPC", "MU"]`
- **WHEN** 执行规范化
- **THEN** 结果为 `["DXY", "GSPC", "MU"]`，无变化

#### Scenario: LLM 输出全部为未知代码

- **GIVEN** LLM 返回 `related_symbols = ["002475.SZ", "600519.SH"]`
- **WHEN** 执行规范化
- **THEN** 结果为 `[]`，`primary_symbol` 为 `null`

#### Scenario: 规则初筛路径不受影响

- **GIVEN** 新闻经 `derive_related_symbols` 生成 `related_symbols`（已是系统代码）
- **WHEN** 该新闻未经 LLM 处理直接入库（`persist_summary=False` 路径）
- **THEN** `related_symbols` 保持不变，不经过新规范化函数
