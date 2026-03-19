## Context

当前系统由 Cloudflare Workers（Hono 框架）提供 API，前端为纯静态 HTML + Vanilla JS。新闻检索接口 `GET /api/news` 默认返回最多 100 条（最大 200 条），无法应对数据量持续增长的场景。`pub_date` 直接从数据库返回字符串，前端部分时间格式化路径未强制 24 小时制。

## Goals / Non-Goals

**Goals:**
- `pub_date` 在检索台和复盘工作台所有展示场景统一为 24 小时制
- `GET /api/news` 与 `GET /api/reviews` 支持 `page` / `pageSize` 服务端分页
- 前端两处列表区域增加分页控件，展示总条数
- 分页 `total` 由数据库 `COUNT(*)` 返回，不依赖截断后的数组长度

**Non-Goals:**
- 不引入游标分页（数据量级不需要）
- 不改动新闻采集侧的时间存储逻辑
- 不修改移动端适配或响应式布局

## Decisions

### 1. 分页策略：Offset 分页

**选择**：`LIMIT pageSize OFFSET (page-1)*pageSize`

**原因**：数据量级在千至万级，Offset 分页实现简单，前端页码控件直观。游标分页适合亿级流式场景，此处过度设计。

接口参数：
```
GET /api/news?page=1&pageSize=20&...
GET /api/reviews?page=1&pageSize=20&...
```

响应结构：
```json
{
  "items": [...],
  "total": 342,
  "page": 1,
  "pageSize": 20,
  "totalPages": 18
}
```

**向后兼容**：`limit` 参数保留，若 `page` 未传则退回原有 `limit` 行为，确保其他调用方不受影响。

### 2. total 计算：独立 COUNT 查询

**选择**：同一 WHERE 条件执行 `SELECT COUNT(*) ...`，再执行 `SELECT ... LIMIT OFFSET`。

**原因**：Cloudflare D1 不支持 `SQL_CALC_FOUND_ROWS`，两次查询是标准做法；D1 请求量按次计费，两次查询可接受。

### 3. 客户端侧过滤移至服务端

当前 symbol 过滤和 stars 过滤是客户端取回所有数据后再筛，分页后必须移到 WHERE 子句。

### 4. 时间格式化

前端 `buildNewsRow` 中 `pub_date` 已为 `YYYY-MM-DD HH:MM:SS` 字符串，直接截取 `HH:MM` 部分（`pub_date.slice(11, 16)`）即可保证 24 小时制，无需引入 date 库。`formatBeijingMoment` 等辅助函数使用 `String.padStart(2,'0')` 组装小时，已是 24 小时制，确认后保持不变。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| D1 COUNT 查询增加延迟 | COUNT 与数据查询并行发起（`Promise.all`）|
| symbol/stars 移入 WHERE 后 SQL 复杂度提升 | 用参数化查询数组拼接，有单测覆盖 |
| 前端分页状态与搜索条件联动复杂 | 每次筛选条件变更重置 page=1 |
| 向后兼容 `limit` 参数 | `page` 存在时忽略 `limit`，`page` 不存在时走旧逻辑 |

## Migration Plan

1. 先部署 Worker（接口向后兼容）
2. 再部署前端静态资源
3. 无数据库 schema 变更，无需 migration 脚本
4. 回滚：重新部署旧版 Worker + 前端即可
