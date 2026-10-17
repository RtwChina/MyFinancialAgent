# US2 二级维度与完成校验验收

日期：2026-10-16。范围 T021～T027；仅本地 APP_ENV=test 正式迁移 SQLite/Worker/D1，未部署、提交或 push。

## 红→绿

- 纯二级接口先可加载：新增/改标题/移动/删除的 19 项行为失败，随后基础+US1+US2 59/59 通过；保留原 39 项断言。
- API 六预设、自定义标题和正文、重复预设均已在新保存入口校验，11 个新强断言通过。完成校验先出现 3 项业务失败：仍依赖旧两个组、显式空被旧列放行；改为新市场一项后通过。
- UI 在真实 Worker/test 健康检查成功后因缺少 `#marketChildKindSelect` 失败，二级菜单和交互完成后通过。不把导入/环境错误计为功能红证据。

## 独立复验结果

| 项目 | 命令 | 结果 |
|---|---|---|
| US2 模型/API 定向 | `node --test --test-name-pattern='US2' tests/market_review_model.test.mjs tests/market_review_api.test.mjs` | 34/34 PASS |
| 所有已实现模型/API、harness、事务、往返和失败重试 | `node --test tests/market_review_api.test.mjs tests/market_review_model.test.mjs tests/review_completion_harness.test.mjs tests/review_completion_atomicity.test.mjs tests/review_completion_roundtrips.test.mjs tests/review_completion_failures.test.mjs` | 207/207 PASS（包含 US3 后端已实现增量，不代表 US3 桌面验收） |
| US1+US2 真实桌面 | `./node_modules/.bin/playwright test tests/smoke/market_review.spec.js --workers=1` | 主 agent 独立 11/11 PASS，47.9 秒 |
| 语法/格式 | `npm run check:worker`、`npm run check:web`、`git diff --check` | PASS |

桌面新增五项用例包含 1440×1000、1920×1080 六种预设已添加禁用、多个自定义与空正文、稳定 child id、首尾移动禁用、确认删除/取消、删预设后可再添加、支撑/压力并排及其他宽行、长中文和吸底按钮；保存重开/SQL 原文与顺序一致，HTML 仅原文无执行。

CTA `6480/6450`、`$30.5bn`，JPM collar `6900 call / 5800 put`，EPS `300 / 325.50` 原样存于 GSPC，未新增 JPM 主题或自动计算。

空白自定义标题保留输入缓冲和所有正文，顶部保存与完成路径均在 POST 前阻止、展开对应详情并定位错误输入；修正后能保存，不丢弃非法二级假装成功。reviewed 与未关联 legacy 详情的二级修改禁用，但原标题和正文可读、零写。

正常路径新闻和计划校验保持，唯一市场步骤有主题即可；深度总结继续可选。网络严格为先复盘 save 200 再 complete 200，完成后 reviewed/计划/正文一致。

截图：

- [1440 二级详情](market-review-desktop/us2-detail-1440.png)
- [1920 二级详情](market-review-desktop/us2-detail-1920.png)

## 后续范围

US3 桌面共用价位、US4 历史归并/沿用/批量保存后校验与消费者、US5 展示身份及全量原回归仍待闭环。此记录不是完整上线或用户最终风格确认。
