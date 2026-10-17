# US1 标的一级与桌面内部 MVP 验收

日期：2026-10-16。范围：T011～T020；仅本地 APP_ENV=test，未访问生产写入口，未部署、提交或 push。

## 环境与数据

- Worker：`http://127.0.0.1:8787`，健康响应 `ok=true`、`env=test`。
- D1：`tests/testdata/config/wrangler.test.toml`，`my-financial-agent-test`，固定 `--local` 与 `tests/.wrangler-state/market-review`。
- 使用正式 migration 001～027 和同源夹具；US1 使用无历史笔记的日期 E（2026-09-01）。
- 模型/API 的 SQLite harness 同样重放全部正式迁移，不替代 Worker 业务或数据库结果。

## 红→绿证据

- 模型接口先可加载，因搜索、身份、重复和更换行为缺失失败；实现后基础和 US1 共 39 项通过。
- 保存 API 先出现非法输入错误返回 200、新结构未持久化等 26 项业务失败；完成结构替换和身份校验后通过。
- 真 SQLite 补充回归先发现省略 marketReview 时覆盖并发新文档、live 镜像修剪价位原文空白；加入 SQL 条件更新/RETURNING 和镜像保真后通过。
- 桌面用例在新模型已可导入时先因旧两个步骤、缺少新表格/选择器而失败；改为单入口后通过。未把导入或环境失败计为功能红证据。

## 复验

| 验证 | 命令/证据 | 结果 |
|---|---|---|
| 模型、API、harness、事务与往返 | `node --test tests/market_review_api.test.mjs tests/market_review_model.test.mjs tests/review_completion_harness.test.mjs tests/review_completion_atomicity.test.mjs tests/review_completion_roundtrips.test.mjs` | 112/112 PASS |
| 桌面真实应用 | `./node_modules/.bin/playwright test tests/smoke/market_review.spec.js --workers=1` | 主 agent 独立复验 6/6 PASS，17.0 秒 |
| Worker/Web 语法 | `npm run check:worker`、`npm run check:web` | PASS |
| 差异格式 | `git diff --check` | PASS |
| 手动浏览器 | test 健康检查、E 日选择 MU、输入原文、关闭详情、顶部保存后 GET 校验 | HTTP 200，原文一致；右侧距视口 18px，吸底按钮可见 |

桌面用例覆盖 1440×1000、1920×1080：唯一市场步骤、五列、标题右工具栏、无重复分组、28px 短蓝条、右侧详情和长文本滚动；无行情候选、搜索、重复定位、只思考更换、稳定 id、排序/删除确认、Enter/Space/Esc、目录和 tooltip、安全正文；保存重开、目录真实断网重试、真实 Worker 拒绝后草稿保留和重试、reviewed 只读无写；原操作计划 modal 仍居中。

截图：

- [1440 详情](market-review-desktop/detail-1440.png)
- [1920 详情](market-review-desktop/detail-1920.png)
- [1440 表格](market-review-desktop/table-1440.png)
- [1920 表格](market-review-desktop/table-1920.png)

未出现 pageerror。站点既有 `/favicon.ico` 404 明确作为基线排除；其他控制台错误不得忽略。

## 未包含的后续范围

US2 二级添加/整理、US3 市场与计划双向共用价位、US4 历史转换/首次证据冻结/沿用及消费者、US5 US10Y 推导尚未在此验收。原旧合同全量回归需在收尾逐项更新并验证。US1 仅内部新记录 MVP，不代表完整功能可上线，也不是用户对完整成品的确认。
