## ADDED Requirements

### Requirement: stock_raw 表字段语义

`stock_raw` 表 SHALL 使用以下字段语义：

| 字段 | 含义 | 示例 |
|-----|------|-----|
| `symbol` | 系统标识，关联 `tracked_symbols.symbol` | `GSPC`、`通信ETF` |
| `yahoo_symbol` | Yahoo Finance 代码，数据来源标识 | `^GSPC`、`515880.SS` |

#### Scenario: 价格写入时填充 yahoo_symbol
- **WHEN** 采集价格数据写入 `stock_raw`
- **THEN** `symbol` 存系统标识，`yahoo_symbol` 从 `tracked_symbols` 查询填入

#### Scenario: 查询使用系统标识
- **WHEN** 查询 `stock_raw` 表
- **THEN** `symbol` 字段使用系统标识（如 `GSPC`），而非 Yahoo 代码（如 `^GSPC`）