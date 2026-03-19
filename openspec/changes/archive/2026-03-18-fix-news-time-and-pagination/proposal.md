## Why

新闻检索台中 `pub_date` 的时间部分在某些显示场景下未强制使用 24 小时制，导致阅读歧义；同时检索台和复盘工作台均无分页能力，当结果超过默认上限（100条）时数据被截断，用户无法获取完整信息。

## What Changes

- **时间格式统一**：前端所有涉及 `pub_date` 的展示路径（`buildNewsRow`、时间窗口边界格式化函数）强制使用 24 小时制（`HH:mm` / `YYYY-MM-DD HH:mm`），移除任何 12 小时制格式化路径。
- **新闻检索台分页**：`GET /api/news` 接口增加 `page` / `pageSize` 参数；前端新增分页控件（上一页/下一页/页码/每页条数），并展示总条数。
- **复盘工作台分页**：`GET /api/reviews` 接口增加 `page` / `pageSize` 参数；前端对复盘记录列表同样增加分页控件。
- 后端移除"客户端侧过滤后再截断"逻辑，改为数据库层 `LIMIT + OFFSET` 分页，`total` 字段改为返回符合条件的真实总数（`COUNT(*)`）。

## Capabilities

### New Capabilities

- `news-time-24h`: 新闻发布时间在所有显示场景下强制 24 小时制
- `news-list-pagination`: 新闻检索台支持分页浏览（page/pageSize，显示总条数与翻页控件）
- `review-list-pagination`: 复盘工作台列表支持分页浏览

### Modified Capabilities

（无现有 spec 文件需要同步修改）

## Impact

| 模块 | 变更类型 | 说明 |
|------|----------|------|
| `cloudflare/worker/src/index.js` | 接口变更 | `getNewsList`、`getReviewList` 增加 `page`/`pageSize` 参数，`total` 改为 COUNT |
| `cloudflare/web/app.js` | 逻辑变更 | 分页状态管理、分页控件渲染、时间格式化函数修改 |
| `cloudflare/web/index.html` | UI 变更 | 两处列表区域新增分页控件 HTML |
| 现有调用方 | 向后兼容 | `limit` 参数保留兼容，`page` 默认为 1，不影响无分页场景 |
