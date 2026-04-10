## ADDED Requirements

### Requirement: Yahoo 主源失败时必须按市场切换到备用价格源

价格采集 MUST 默认先尝试 Yahoo Finance；当 Yahoo 无法产出有效价格值时，系统 MUST 根据标的市场规则切换到对应备用源。

#### Scenario: 中国市场标的触发 fallback

- **GIVEN** 标的 `yahoo_symbol` 以 `.SS` 或 `.SZ` 结尾
- **AND** Yahoo 抛出异常，或返回空数据，或主链路最终生成的 `current_price` 为空
- **WHEN** 系统执行 live 价格采集
- **THEN** 系统必须调用中国市场备用价格源重试
- **AND** 若备用源返回有效价格值，则系统必须使用该结果入库

#### Scenario: 国际市场标的触发 fallback

- **GIVEN** 标的不属于 `.SS` 或 `.SZ` 中国内地市场链路
- **AND** Yahoo 抛出异常，或返回空数据，或主链路最终生成的 `current_price` 为空
- **WHEN** 系统执行 live 价格采集
- **THEN** 系统必须调用国际市场 secondary source 重试
- **AND** 若 secondary source 返回有效价格值，则系统必须使用该结果入库

#### Scenario: Yahoo 主链路成功时不触发 fallback

- **GIVEN** Yahoo 已返回目标交易日的有效收盘价
- **WHEN** 系统执行 live 价格采集
- **THEN** 系统不得继续调用备用价格源

### Requirement: 空价格结果不得直接入库

无论来自主源还是备用源，系统 MUST 不得将空价格结果直接作为成功价格写入最终结果。

#### Scenario: 返回记录存在但收盘价为空

- **GIVEN** 某价格源返回了目标交易日记录
- **AND** 该记录 `Close` 为空或不可解析
- **WHEN** 系统校验该价格结果
- **THEN** 该结果必须被视为无效

### Requirement: 日志必须区分主源成功与 fallback 成功

系统 MUST 在日志中记录价格来源与 fallback 状态，便于后续统计价格源稳定性。

#### Scenario: Yahoo 主源成功

- **GIVEN** Yahoo 成功返回有效价格
- **WHEN** 系统完成单个标的采集
- **THEN** 日志必须标记主源为 Yahoo
- **AND** 日志不得误报 fallback 已执行

#### Scenario: AKShare fallback 成功

- **GIVEN** Yahoo 失败
- **AND** AKShare 返回有效价格
- **WHEN** 系统完成单个标的采集
- **THEN** 日志必须标记该价格来自 fallback
- **AND** 日志必须说明主源 Yahoo 已失败

#### Scenario: Finnhub fallback 成功

- **GIVEN** Yahoo 失败
- **AND** Finnhub 返回有效价格
- **WHEN** 系统完成单个标的采集
- **THEN** 日志必须标记该价格来自 fallback
- **AND** 日志必须说明主源 Yahoo 已失败
