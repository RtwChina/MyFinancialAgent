## REMOVED Requirements

### Requirement: 新闻采集结果导出为 xlsx 文件
采集完成后，系统将新闻列表和 AI 摘要写入本地 `.xlsx` 文件。

**Reason**: 数据已全量迁移至 Cloudflare D1，本地文件输出无消费方，属于死代码。
**Migration**: 数据通过 `cloudflare_ingest.py` 写入 D1，直接查询 D1 获取新闻数据。

#### Scenario: 新闻采集成功后不再生成 xlsx
- **WHEN** 新闻采集任务完成并写入 D1
- **THEN** 系统不生成任何 `.xlsx` 文件，`export_to_excel` 函数不存在

### Requirement: 价格采集结果导出为 xlsx 文件
采集完成后，系统将股票价格 DataFrame 写入本地 `.xlsx` 文件。

**Reason**: 数据已全量迁移至 Cloudflare D1，本地文件输出无消费方，属于死代码。
**Migration**: 数据通过 `cloudflare_ingest.py` 写入 D1，直接查询 D1 获取价格数据。

#### Scenario: 价格采集成功后不再生成 xlsx
- **WHEN** 价格采集任务完成并写入 D1
- **THEN** 系统不生成任何 `.xlsx` 文件，`export_to_excel` 函数不存在
