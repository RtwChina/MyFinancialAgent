## Why

`collect_news.yml`（每小时执行）调用 `python main.py` 不带参数，默认走 `full` mode，会同时跑价格采集 + 新闻采集 + LLM summary，导致每小时都在重复采集价格数据，与 `collect_prices.yml` 职责重叠。正确行为应该只采新闻，不写价格、不写 summary。

## What Changes

- **修改** `collect_news.yml`：将 `python main.py` 改为 `python main.py hourly-news`，只走纯新闻采集路径

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无 spec 级行为变化，仅 CI 配置修正）

## Impact

**受影响文件：**
- `.github/workflows/collect_news.yml` — `run` 命令加上 `hourly-news` 参数

**不影响：**
- `collect_prices.yml`（已正确使用 `close-summary`）
- `main.py` 逻辑（`hourly-news` mode 已存在且正确）
