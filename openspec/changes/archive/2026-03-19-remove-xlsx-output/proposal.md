## Why

两个定时采集任务（新闻采集、价格采集）在写入 Cloudflare D1 之后，仍然在本地生成 `.xlsx` 文件。数据已全量迁移至 D1，本地文件输出既无消费方，又增加了无谓的依赖（`openpyxl`）和磁盘操作，应予移除。

## What Changes

- 删除 `src/collect_news_v3.py` 中的 `export_to_excel` 函数及其调用点
- 删除 `src/collect_prices.py` 中的 `export_to_excel` 函数及其调用点
- 删除 `main.py` 中对 `export_to_excel` 的导入和调用
- 从 `requirements.txt` 中移除 `openpyxl` 依赖（如果没有其他用途）

## Capabilities

### New Capabilities

无新能力引入。

### Modified Capabilities

无规格层面行为变更，仅为实现层面清理。

## Impact

- **受影响文件**：`src/collect_news_v3.py`、`src/collect_prices.py`、`main.py`、`requirements.txt`
- **无 API/接口变更**：xlsx 输出从未对外暴露，移除不影响任何下游消费
- **依赖**：需确认 `openpyxl`、`pandas` 是否还有其他用途，若无则可同步移除
- **风险**：极低，纯删除无副作用代码
