## Why

当前价格采集默认完全依赖 Yahoo Finance。对于中国市场标的，尤其是 `.SS` / `.SZ` 指数与场内 ETF，Yahoo 偶发会返回空值，或返回存在但 `Close` 为空的记录，导致日志显示“成功获取”但价格为 `None`。

项目需要保留 Yahoo 作为主链路，但在 Yahoo 无法提供可用收盘价时，自动切换到更适合对应市场的备用价格源，避免单一数据源导致价格流水中断。

## What Changes

- 保持 `Yahoo Finance` 为默认主价格源
- 定义克制版“Yahoo 失败”判定条件，包括：
  - 请求异常
  - 返回空数据
  - 当前主链路生成的 `current_price` 为空
- 保留现有 Yahoo 交易日判断与回退行为，不在本次改写“最近应有交易日”的判断逻辑
- 按 `yahoo_symbol` 的市场后缀与代码模式进行 fallback 路由：
  - `.SS` / `.SZ`：回退到中国市场备用源
  - `.HK` 与美股 / 美股 ETF / 美股指数 / Yahoo 通用全球标的：回退到国际市场备用源
- 优先调研并接入：
  - `AKShare` 作为中国市场 fallback
  - `Finnhub` 作为美股与国际市场 secondary source
- 为中国市场保留后续升级到 `Tushare Pro` 的空间
- 明确记录主源命中 / fallback 命中 / fallback 失败日志，便于定位价格来源质量

## Capabilities

### New Capabilities

- `price-source-fallback-routing`: 价格采集在主源失败时，按市场规则切换到备用数据源，并确保最终写入的是目标交易日的有效收盘价

### Modified Capabilities

- `cross-market-price-query`: 现有跨市场价格采集从“单一 Yahoo 获取”扩展为“Yahoo 主源 + 按市场 fallback”

## Impact

- `src/data_sources/price_live.py`：补充 Yahoo 空结果判定、fallback 路由与来源日志
- `src/data_sources/price_router.py` / 新 price source 模块：新增中国市场与国际市场 fallback 实现
- `src/symbol_registry.py`：沿用 `yahoo_symbol` 后缀识别市场，不新增标的字段
- 测试与文档：增加中国市场 fallback 覆盖用例与运行说明
