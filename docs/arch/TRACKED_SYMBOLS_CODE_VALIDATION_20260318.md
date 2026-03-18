# tracked_symbols code 可用性校验清单

校验时间：2026-03-18  
校验方式：使用本地 `.venv` 中的 `yfinance` 实时拉取 `history(period="5d")`

## 1. 可直接使用

### 大盘 / 指数 / 商品 / 汇率

| 显示名 | 系统 symbol | Yahoo code | 结果 | 备注 |
|---|---|---|---|---|
| 美元指数 | `DXY` | `DX-Y.NYB` | 可用 | 当前项目已在用 |
| 美元/日元 | `USDJPY` | `JPY=X` | 可用 | 外汇 |
| 美元/人民币 | `USDCNY` | `CNY=X` | 可用 | 外汇 |
| 铜期货 | `COPPER` | `HG=F` | 可用 | 期货 |
| 大豆期货 | `SOYBEAN` | `ZS=F` | 可用 | 期货 |
| Brent原油 | `BRENT` | `BZ=F` | 可用 | 比 `CL=F` 更贴近截图 |
| 比特币/美元 | `BTCUSD` | `BTC-USD` | 可用 | 加密资产 |
| 标普500 | `GSPC` | `^GSPC` | 可用 | 当前项目已在用 |
| 纳斯达克100 | `NDX` | `^NDX` | 可用 | 当前项目已在用 |
| 欧洲斯托克50 | `STOXX50E` | `^STOXX50E` | 可用 | 欧股大盘 |
| 上证指数 | `SSE` | `000001.SS` | 可用 | 当前项目已在用 |
| 韩国综合股价指数 | `KOSPI` | `^KS11` | 可用 | 韩股大盘 |
| 恐慌指数 | `VIX` | `^VIX` | 可用 | 当前项目已在用 |
| 纳指100ETF | `QQQ` | `QQQ` | 可用 | ETF |
| 标普500ETF | `SPY` | `SPY` | 可用 | ETF |

### 板块 / ETF

| 显示名 | 系统 symbol | Yahoo code | 结果 |
|---|---|---|---|
| 半导体板块 | `SOXX` | `SOXX` | 可用 |
| 韩国ETF | `EWY` | `EWY` | 可用 |
| 科技板块 | `XLK` | `XLK` | 可用 |
| 通信服务板块 | `XLC` | `XLC` | 可用 |
| 工业板块 | `XLI` | `XLI` | 可用 |
| 必需消费板块 | `XLP` | `XLP` | 可用 |
| 可选消费板块 | `XLY` | `XLY` | 可用 |
| 金融板块 | `XLF` | `XLF` | 可用 |
| 能源板块 | `XLE` | `XLE` | 可用 |
| 材料板块 | `XLB` | `XLB` | 可用 |
| 公用事业板块 | `XLU` | `XLU` | 可用 |
| 医疗保健板块 | `XLV` | `XLV` | 可用 |
| 美国REIT板块 | `IYR` | `IYR` | 可用 |
| 股息成长板块 | `VIG` | `VIG` | 可用 |
| 美国综合债ETF | `AGG` | `AGG` | 可用 |

## 2. 不建议直接使用 / 当前校验失败

| 显示名 | 系统 symbol | Yahoo code | 结果 | 建议 |
|---|---|---|---|---|
| 黄金现货/美元 | `GOLD` | `GC=F` | 改用期货代理 | Yahoo 上可用，建议直接用 `GC=F` |
| 白银/美元 | `SILVER` | `SI=F` | 改用期货代理 | 建议用 `SI=F` 代替 `XAGUSD=X` |
| 恒生科技指数 | `HSTECH` | `3067.HK` | 改用 ETF 代理 | 采用 `iShares Hang Seng TECH ETF` 作为指数代理 |

## 3. 当前建议

### 建议直接进入 `tracked_symbols` 的新增项

- `USDJPY -> JPY=X`
- `USDCNY -> CNY=X`
- `COPPER -> HG=F`
- `SOYBEAN -> ZS=F`
- `BRENT -> BZ=F`
- `BTCUSD -> BTC-USD`
- `STOXX50E -> ^STOXX50E`
- `KOSPI -> ^KS11`
- `QQQ -> QQQ`
- `SPY -> SPY`
- `EWY -> EWY`
- `XLC -> XLC`
- `XLI -> XLI`
- `XLP -> XLP`
- `XLB -> XLB`
- `XLU -> XLU`
- `XLV -> XLV`
- `IYR -> IYR`
- `VIG -> VIG`
- `AGG -> AGG`

### 建议以代理方式入库的项

- `GOLD -> GC=F`
- `SILVER -> SI=F`
- `HSTECH -> 3067.HK`

## 4. 备注

- 当前项目里 `SSE -> 000001.SS`、`DXY -> DX-Y.NYB`、`GSPC -> ^GSPC`、`NDX -> ^NDX`、`VIX -> ^VIX` 都已被实际验证在本项目链路中可工作。
- 若后续要更严格，可再加一轮：
  - `history(period="1mo")`
  - `fast_info`
  - `instrumentType`
  三项联合校验，作为最终入库门槛。
