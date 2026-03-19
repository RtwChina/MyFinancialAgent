## 1. 时间格式修复（Worker + 前端）

- [x] 1.1 审查 `cloudflare/web/app.js` 中 `buildNewsRow` 的 `pub_date` 展示逻辑，确认是否存在 12 小时制格式化路径
- [x] 1.2 修改前端时间显示：使用 `pub_date.slice(11, 16)` 截取 `HH:mm`，确保 24 小时制
- [x] 1.3 审查并确认 `formatBeijingMoment`、`formatNewsWindowBoundaryBeijing` 等时间格式化函数全部输出 24 小时制

## 2. Worker 分页：新闻检索 API

- [x] 2.1 在 `getNewsList` 中解析 `page` / `pageSize` 参数，计算 `OFFSET`
- [x] 2.2 将 `symbol` 和 `stars` 过滤从应用层移入 SQL WHERE 子句（参数化查询）
- [x] 2.3 新增 `SELECT COUNT(*)` 并发查询，用 `Promise.all` 并行执行
- [x] 2.4 响应结构增加 `page`、`pageSize`、`totalPages` 字段；保持 `limit` 参数向后兼容

## 3. Worker 分页：复盘列表 API

- [x] 3.1 在 `getReviewList` 中解析 `page` / `pageSize` 参数
- [x] 3.2 新增 COUNT 并发查询，响应增加分页元数据

## 4. 前端分页控件：新闻检索台

- [x] 4.1 在 `index.html` 新闻列表区域下方添加分页控件 HTML（上一页/页码/下一页/每页条数/总条数）
- [x] 4.2 在 `app.js` 中添加分页状态管理（`currentPage`、`currentPageSize`）
- [x] 4.3 `loadNewsList` 改为携带 `page` / `pageSize` 参数，渲染完成后更新分页控件
- [x] 4.4 筛选条件变更时重置 `currentPage = 1`
- [x] 4.5 `total === 0` 时隐藏分页控件

## 5. 前端分页控件：复盘工作台

- [x] 5.1 在 `index.html` 复盘记录列表区域下方添加分页控件 HTML
- [x] 5.2 在 `app.js` 中添加复盘列表分页状态管理
- [x] 5.3 `loadReviewList` 改为携带分页参数，渲染后更新控件
- [x] 5.4 状态筛选变更时重置页码

## 6. 测试

- [x] 6.1 冒烟测试：本地启动 Worker（`wrangler dev`），验证 `/api/news?page=1&pageSize=5` 返回正确 `total` 和 5 条数据
- [x] 6.2 冒烟测试：前端检索台翻页、筛选条件变更后页码重置、空结果时分页控件隐藏
- [x] 6.3 冒烟测试：确认凌晨时间（`00:xx`）显示正确，无 AM/PM
- [x] 6.4 集成测试：复盘工作台分页加载正常，状态过滤联动翻页

## 7. 发布

- [x] 7.1 发布前检查：`wrangler deploy` 预览确认接口响应结构正确
- [x] 7.2 发布前检查：旧版 `limit` 参数兼容性验证（不传 `page` 时行为不变）
- [x] 7.3 部署 Worker（`wrangler deploy`）
- [x] 7.4 部署前端静态资源（推送至 Cloudflare Pages 或更新 Worker 内嵌资源）
- [x] 7.5 线上验证：检索台分页功能正常，时间格式 24 小时制
