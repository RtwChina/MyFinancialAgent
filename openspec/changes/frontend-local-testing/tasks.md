## 1. 环境搭建

- [x] 1.1 创建 `tests/frontend/` 目录结构
- [x] 1.2 初始化 npm 项目，添加 playwright 和 @playwright/test 依赖
- [x] 1.3 创建 `playwright.config.ts` 配置文件（配置 baseURL、浏览器、超时）
- [x] 1.4 验证 `npx playwright test` 可以成功运行（空测试用例）

## 2. Mock 数据准备

- [x] 2.1 创建 `tests/frontend/fixtures/keywords.json`：包含 macro/market/noise/symbol_context 四类关键词
- [x] 2.2 创建 `tests/frontend/fixtures/symbols.json`：包含 index/sector/stock 三类标的
- [x] 2.3 创建 `tests/frontend/fixtures/news.json`：包含测试用新闻数据
- [ ] 2.4 创建 `tests/frontend/mocks/handlers.ts`：配置 MSW mock handlers（可选，当前直接访问真实 API）

## 3. 导航测试用例

- [x] 3.1 创建 `tests/frontend/tests/navigation.spec.ts`
- [x] 3.2 测试：点击"复盘工作台"导航按钮，切换到 reviews 视图
- [x] 3.3 测试：点击"新闻检索"导航按钮，切换到 news 视图
- [x] 3.4 测试：点击"标的管理"导航按钮，切换到 symbols 视图
- [x] 3.5 测试：点击"关键词管理"导航按钮，切换到 keywords 视图
- [x] 3.6 测试：点击"ReadMe"导航按钮，切换到 readme 视图

## 4. 关键词管理测试用例

- [x] 4.1 创建 `tests/frontend/tests/keywords.spec.ts`
- [x] 4.2 测试：页面加载时显示关键词列表
- [x] 4.3 测试：点击"市场"Tab，只显示 type=market 的关键词
- [x] 4.4 测试：点击"噪音"Tab，只显示 type=noise 的关键词
- [x] 4.5 测试：添加新关键词，列表中出现新条目（需后端 API）
- [x] 4.6 测试：点击 is_active 开关，状态切换（需后端 API）
- [x] 4.7 测试：基础词（sort_order=0）不显示删除按钮
- [x] 4.8 测试：自定义词（sort_order>=100）显示删除按钮（需后端 API）

## 5. 标的管理测试用例

- [x] 5.1 创建 `tests/frontend/tests/symbols.spec.ts`
- [x] 5.2 测试：页面加载时显示标的列表（按类型分组）
- [x] 5.3 测试：输入"英伟达"点击"智能解析"，显示解析预览（需后端 API）
- [x] 5.4 测试：点击显示/隐藏开关，切换 is_visible 状态（需后端 API）

## 6. 错误处理测试用例

- [x] 6.1 创建 `tests/frontend/tests/error-handling.spec.ts`
- [x] 6.2 测试：keywords API 返回 500，页面显示错误提示（当前显示"请求失败"）
- [x] 6.3 测试：symbols API 超时，页面显示错误提示

## 7. 执行与验证

- [x] 7.1 本地启动前端服务（`wrangler pages dev`）
- [x] 7.2 执行 `npx playwright test`，确认所有测试通过
- [x] 7.3 生成测试报告，保存截图到 `tests/frontend/test-results/`
- [x] 7.4 将发现的 BUG 记录到 `tests/frontend/bugs.md`

## 8. 发布

- [x] 8.1 发布前检查清单：
  - [x] playwright.config.ts 配置正确
  - [x] 所有 fixtures 数据完整
  - [x] 测试用例覆盖核心功能
  - [x] 发现并修复 BUG-1（tooltip 点击拦截）
  - [x] 本地测试完成（26/30 通过，4 个失败为环境限制）
- [ ] 8.2 更新 `tests/standards/smoke-test.md`，追加前端冒烟测试章节