## Context

当前 live 价格采集路径为：

```text
tracked_symbols
   -> yfinance history(start, end)
   -> 取最后一根 K 线
   -> 写 stock_raw / D1
```

这个流程对美股与全球常见标的通常可用，但对中国市场标的存在两个脆弱点：

1. Yahoo 对 `.SS` / `.SZ` 标的偶尔返回空值
2. 现有逻辑把“请求成功但价格为空”与“真正成功”混在一起，难以区分数据源失败与业务成功

我们已经确认：

- `000001.SS` 在某些时点可能空值，但稍后又可恢复
- `515880.SS` 这类 A 股 ETF 存在返回空价或异常缺口的实际案例

这说明问题不是“完全拿不到中国市场数据”，而是 Yahoo 在部分标的上会产生空结果，需要保留主源的同时增加针对性 fallback。

## Goals / Non-Goals

**Goals**

- 保持 Yahoo 为所有价格标的的默认主源
- 定义明确的一次采集失败标准，避免空值被误判为成功
- 对中国内地市场（`.SS` / `.SZ`）接入备用价格源
- 对美股 / 美股 ETF / 美股指数 / Yahoo 通用国际标的接入 secondary source
- 在不重写现有交易日判断逻辑的前提下，为空结果补充备用链路
- 在日志中明确区分 `primary` / `fallback` 来源

**Non-Goals**

- 本次不替换掉 Yahoo 主链路
- 本次不引入付费商业行情源
- 本次不新增 tracked_symbols 的市场字段，先复用现有 `yahoo_symbol` 规则
- 本次不重写现有 Yahoo “最后一根 K 线 + 未收盘回退一根”的主逻辑

## Decision

### 决策 1：按 `yahoo_symbol` 后缀识别市场，而不是新增 market 字段

已有代码已经在 `price_live.py` 中用后缀识别收盘时间：

- `.SS`
- `.SZ`
- `.HK`
- `.KS`
- `.T`

因此 fallback 路由继续复用这一模式，能保持最小改动。当前阶段先识别：

- `.SS` / `.SZ` => 中国内地市场
- `.HK` => 国际市场链路
- 纯字母股票 / ETF / 美股指数 / 商品 / 外汇 => 国际市场链路

### 决策 2：中国市场 fallback 使用 AKShare，国际市场 fallback 使用 Finnhub

原因：

- 项目依赖已包含 `akshare`
- 项目依赖已包含 `finnhub-python`
- 接入成本低，可快速验证
- 更贴近 A 股指数 / ETF 场景
- Finnhub 更适合美股股票 / ETF / 指数 candle 场景

同时保留未来升级路径：

```text
Yahoo
  -> AKShare fallback
  -> Finnhub fallback
  -> (future) Tushare Pro fallback / replacement
```

### 决策 3：fallback 触发条件仅针对“空结果/异常”，不重写现有交易日逻辑

本轮采用更克制的方案 B：

- 保留现有 Yahoo 主链路
- 保留现有“最后一根 K 线 + 未收盘回退一根”逻辑
- 仅在以下情况下触发 fallback：
  - HTTP / 网络异常
  - 返回空 DataFrame
  - 主链路最终生成的 `current_price is None`

这样可以先解决当前最痛的“空结果补洞”问题，同时避免在第一版引入更复杂的 target-trading-day 判断。

### 决策 4：中美市场一起纳入 fallback 设计，但按市场选择不同 secondary source

当前真实痛点集中在中国市场标的，但如果设计层只覆盖中国市场，后续补美股 secondary source 时仍需再次重构失败判定、路由和日志格式。更合理的方式是本轮一次性定义统一框架：

- 中国市场：`Yahoo -> AKShare`
- 国际 / 美股 / 港股市场：`Yahoo -> Finnhub`

这样实现可以分阶段推进，但路由模型与 capability 一次成型。

## Proposed Flow

```text
                 ┌──────────────────────┐
                 │  Yahoo primary path  │
                 └──────────┬───────────┘
                            │
                   empty/invalid result?
                    no  │         │ yes
                        │         ▼
                        │   market route by
                        │   yahoo_symbol suffix
                        │
                        │   .SS / .SZ ? ── yes ──> AKShare fallback
                        │         │
                        │         no
                        │         ▼
                        │      Finnhub fallback
                        │         │
                        │   recovered current_price?
                        │   yes │            │ no
                        ▼       │            ▼
                    persist     │      placeholder + error log
                                │
                                ▼
                             persist
```

## Risks / Trade-offs

- **AKShare 稳定性不如正式商业 API**：适合 fallback，但不应被误当成长期唯一主源
- **国际市场边界较宽**：`.HK`、商品、外汇、指数等全球标的虽然先并入国际链路，但 Finnhub 对不同品类的覆盖度需要分别验证
- **不同源字段对齐成本**：需统一成 `k_date/current_price/change_percent/volume`
- **旧日期非空结果仍可能通过**：由于本轮不改主链路交易日判断，若 Yahoo 返回旧日期但价格非空，第一版不会触发 fallback

## Open Questions

- 若 AKShare 与 Yahoo 同时返回，但数值冲突，是否需要额外审计日志
- Finnhub 对商品、外汇、非美指数的覆盖是否足够支撑国际链路 fallback
- 后续是否要升级到更严格的 target-trading-day 校验，拦截“旧日期但非空”的结果
