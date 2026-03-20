# 集成测试规范

## 触发时机
多个迭代完成后执行，不是每次提交都执行。

## 环境规则
- 开发环境 = 测试环境=开发环境：联调和集成测试，绑定所有非 master 分支
- 生产环境：绑定 master 分支

## 资源隔离要求
测试资源与生产资源必须隔离，至少包括：
- 2 个数据库
- 2 个 Workers（或服务实例）
- 2 个前端入口

## 部署边界
- 非 master 分支只允许部署到测试资源
- master 分支只允许部署到生产资源
- 测试数据、测试任务、测试调用绝不能污染生产资源

## 环境标识
- 运行时必须有统一环境标识：`APP_ENV=test` / `APP_ENV=prod`
- 代码优先通过运行时配置识别环境，不依赖数据库作为主判断来源
- 健康检查接口应返回当前环境标识

## 高风险逻辑处理
涉及以下场景时，必须通过环境标识区分逻辑：
- 批量写入 / 删除 / 清理
- 回填 / 初始化
- 调试入口 / 运维入口

## 已注册用例

### IT-NEWS-001：新闻数据源替换端到端集成

**场景**：AkShare + Finnhub 替换旧爬虫后的完整采集→筛选→入库→API→前端链路验证

**前置条件**：
- 本地 DB 已执行 migration 009（language、sub_source 字段存在）
- `FINNHUB_API_KEY` 已配置
- Python 依赖已安装（akshare>=1.18.0、finnhub-python>=2.4.0）

**步骤与预期**：

| # | 步骤 | 预期 |
|---|------|------|
| 1 | 运行 `fetch_all_news_live(ctx)` | 返回列表包含 source=akshare（4 个 sub_source）和 source=finnhub（general/company），language 字段 zh/en 正确 |
| 2 | 运行完整 pipeline（SKIP_LLM=true） | 采集→去重→规则初筛→写库全流程无异常，`news_raw_data` 有新增数据 |
| 3 | 检查 DB 字段 | `SELECT source, sub_source, language FROM news_raw_data WHERE source IN ('akshare','finnhub') LIMIT 10` 返回结果字段非空 |
| 4 | Finnhub 英文新闻初筛 | `SELECT COUNT(*) FROM news_raw_data WHERE source='finnhub' AND rule_passed=1` 结果 > 0 |
| 5 | 关键词双语命中验证 | `SELECT rule_reason FROM news_raw_data WHERE source='finnhub' AND rule_passed=1 LIMIT 3` 展示英文关键词命中（如 "war"、"earnings"、"semiconductor"）|
| 6 | API /api/news 返回 language/sub_source | GET `/api/news?source=finnhub` 响应 JSON 每条包含 language 和 sub_source 字段 |
| 7 | 前端来源筛选 | 新闻页面来源下拉框显示 AkShare 和 Finnhub 选项，按来源筛选结果正确 |

**通过标准**：步骤 1-5 本地可验证（无需部署），步骤 6-7 需本地 Worker 运行环境。
