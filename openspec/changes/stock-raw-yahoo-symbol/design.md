## Context

`stock_raw` 表当前结构：
- `symbol`: 存系统标识（如 `GSPC`、`通信ETF`）
- `stock_code`: 与 `symbol` 相同，冗余
- `stock_name`: Yahoo 返回的名称

`tracked_symbols` 表已有映射：
- `symbol`: 系统唯一标识
- `yahoo_symbol`: Yahoo Finance 代码（如 `^GSPC`、`515880.SS`）

## Goals / Non-Goals

**Goals:**
- 字段语义清晰化：`symbol` 为关联键，`yahoo_symbol` 为数据来源代码
- 保持 `stock_raw` 与 `tracked_symbols` 的 JOIN 关系不变
- 修复 Worker 中硬编码查询的 Bug
- 迁移历史数据和测试数据

**Non-Goals:**
- 不改变 API 接口行为
- 不引入新的数据源（未来扩展不在本次范围）

## Decisions

### 1. 字段重命名方式

**决策**: 新增 `yahoo_symbol` 字段，保留 `stock_code` 做双写过渡

**理由**:
- 兼容历史代码和查询
- 部署后验证无误再删除 `stock_code`

### 2. 生产环境数据迁移

**决策**: 分两步
1. 先部署代码改动（写入时双写 `stock_code` 和 `yahoo_symbol`）
2. 用 SQL 批量更新历史数据

```sql
UPDATE stock_raw
SET yahoo_symbol = (
  SELECT yahoo_symbol FROM tracked_symbols
  WHERE tracked_symbols.symbol = stock_raw.symbol
);
```

### 3. 测试数据迁移

**决策**: 用脚本批量更新 fixture 文件

需要建立 `symbol → yahoo_symbol` 映射表，遍历所有 fixture 文件替换：
- 字段名 `stock_code` → `yahoo_symbol`
- 字段值从系统标识改为 Yahoo 代码

### 4. 线上验证方案

**决策**:
1. 删除 `k_date = '2026-03-19'` 的数据（43 条）
2. 手动触发 `python main.py collect-prices` 重新采集
3. 验证 `yahoo_symbol` 字段有正确值

## Risks / Trade-offs

| 风险 | 缓解措施 |
|-----|---------|
| 历史数据中 `symbol` 与 `tracked_symbols` 不匹配 | 迁移后检查 `yahoo_symbol IS NULL` 的记录，手动处理 |
| 测试 fixture 改造遗漏 | 本地跑一遍集成测试验证 |
| 线上重新采集失败 | 保留 `k_date = '2026-03-18'` 的数据作为备份 |