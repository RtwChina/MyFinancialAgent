## Context

`repair-prices` 当前已经形成一条独立的延迟修复链路：先查询最近 3 天 `stock_raw` 中 `k_date` 已存在但 `current_price` 为空的记录，再按 `(symbol, yahoo_symbol, k_date)` 重查 Yahoo，命中同一 `k_date` 才更新原记录。

最新线上结果表明，这条链路已经能修复类似 `000001.SS @ 2026-04-02` 这样的短时 Yahoo 异常，但对于 Yahoo 当前根本缺少目标日线的中国市场标的，修复任务仍然只能跳过。另一方面，当前 `Finnhub` key 对 `stock_candles` 类价格接口返回 `403`，暂时不具备作为价格 repair fallback 的条件。

## Goals / Non-Goals

**Goals:**
- 仅在 `repair-prices` 任务中，增加中国市场的 `Yahoo -> AKShare` 修复顺序
- 继续以记录自身的 `k_date` 为准，不接受错日数据
- 保持现有 update 语义不变，修复成功时仍按 `(symbol, k_date)` 更新已有坏记录
- 让中国市场标的在 Yahoo 缺目标日线时可通过 AKShare 补齐
- 让国际链路在当前无可用 secondary source 时输出明确日志，而不是误导性地继续请求 Finnhub

**Non-Goals:**
- 不改主 `collect-prices` 的 Yahoo 取价与回退逻辑
- 不把 AKShare 变成主价格源
- 不把 Finnhub 变成主价格源
- 不在当前版本中为国际链路启用实际 price fallback
- 不处理 `k_date` 为空的 placeholder 记录

## Decisions

### 1. 只在 repair 任务内部补位

AKShare fallback 只放在 `repair-prices` 链路中，主任务 `collect-prices` 保持 Yahoo-only。

这样做的原因：
- 当前真实问题已经分成两类：Yahoo 短时异常、Yahoo 长期缺目标日线
- 第一类已由现有 repair job 解决
- 第二类只需要在 repair job 里补洞即可，没必要扩大到主采集

### 2. 按市场分流 repair 行为
只有满足以下条件时才进入 repair 分流：
- Yahoo 修复没有返回结果，或返回的数据未命中目标 `k_date`
- 候选记录 `k_date` 已存在

市场分流规则：
- `.SS` / `.SZ` -> `AKShare`
- `.HK`、美股、商品、汇率及其他国际链路 -> 仅记录“无可用 secondary source”，不执行实际 fallback

Yahoo 已经成功命中目标日的记录不得触发任何备用处理。

### 3. AKShare 必须按目标 k_date 验证

AKShare 不能只是“取最近一根”，必须显式校验：
- 返回记录日期 == 候选记录的 `k_date`
- `current_price` 非空

只有同时满足这两点，才允许 update 原记录。

### 4. 修复来源日志需要显式区分

修复任务需要能回答这几个问题：
- 是 Yahoo 修好的，还是 AKShare 修好的
- Yahoo 为什么失败，是空表、缺目标日线，还是目标日价格为空
- 中国市场备用源是否失败
- 国际链路是否因为“当前无可用 secondary source”而被跳过

所以日志应至少区分：
- `Yahoo repair hit`
- `Yahoo repair miss -> trying AKShare`
- `AKShare repair hit`
- `AKShare repair miss`
- `No secondary source for international repair`

### 5. 继续复用现有 repair update 接口

AKShare fallback 不新增数据库表、不新增新的 repair 写入模式。只要最终得到一份满足条件的标准 price payload，就继续走现有 `(symbol, k_date)` update 语义。

## Risks / Trade-offs

- **[依赖风险] AKShare 底层数据源也可能波动** → 只把它作为中国市场 repair fallback，不升级为主链路
- **[权限风险] Finnhub 当前 key 对价格 candles 接口返回 403** → 当前版本不再对国际链路执行实际 Finnhub fallback
- **[覆盖边界] 备用源按市场分流，仍需依赖后缀/代码模式识别** → 路由逻辑集中在 repair 层，避免散落
- **[字段映射差异] AKShare 的列名与 Yahoo 不完全相同** → 在 repair source 层做统一 price payload 映射，避免污染写库层
- **[调试复杂度] 多一个数据源意味着日志链更长** → 通过来源标记日志控制可观测性
