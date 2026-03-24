## ADDED Requirements

### Requirement: Canonical News Types

系统 MUST 将新闻标准类型限制为且仅限于以下三种：

- `index`
- `sector`
- `stock`

#### Scenario: New writes use only canonical types

- **WHEN** 新新闻被持久化到系统
- **THEN** 其 `type` MUST 为 `index`、`sector` 或 `stock` 之一
- **AND** 系统 MUST NOT 再新增 `macro`、`market` 或 `symbol`

### Requirement: Historical Type Migration

系统 MUST 支持将历史数据中的旧新闻类型归并为标准类型。

#### Scenario: Historical types are migrated in D1

- **WHEN** 对历史新闻数据执行标准化迁移
- **THEN** `macro` MUST 被更新为 `index`
- **AND** `market` MUST 被更新为 `index`
- **AND** `symbol` MUST 被更新为 `stock`

### Requirement: Review News Grouping Uses Canonical Types

复盘页 MUST 基于三类标准新闻类型进行分组展示。

#### Scenario: Reviewed archive news is grouped consistently

- **WHEN** 用户打开某个复盘日的新闻分组视图
- **THEN** 所有新闻 MUST 只会出现在“大盘新闻”“板块新闻”“个股新闻”三类之一
- **AND** 历史 `market` 新闻在迁移后 MUST 出现在“大盘新闻”
- **AND** 历史 `symbol` 新闻在迁移后 MUST 出现在“个股新闻”
