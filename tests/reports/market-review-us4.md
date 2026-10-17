# US4 历史笔记、沿用、首次冲突与批量完成验收

日期：2026-10-16。范围 T040～T051；仅本地 APP_ENV=test 正式迁移 SQLite/Worker/D1（`tests/.wrangler-state/market-review`），未部署、提交或 push。

## 独立复验结果

| 项目 | 命令 | 结果 |
|---|---|---|
| US4 桌面冒烟 | `./node_modules/.bin/playwright test tests/smoke/market_review.spec.js --workers=1 --grep US4` | 8/8 PASS，1.1 分钟 |
| 市场与板块全部冒烟（US1～US4） | `./node_modules/.bin/playwright test tests/smoke/market_review.spec.js --workers=1` | 32/32 PASS，连续两遍各 2.8 分钟 |
| Node 模型/API/harness/事务/往返/失败重试/列表合同 | 同 US3 报告命令 | 285/285 PASS |
| Python 正式迁移 SQLite | `python3 tests/integration/market_review_db_utils.py`、`python3 tests/integration/market_review_migration.py` | 41/41 OK、PASS |
| 语法/格式 | `npm run check:worker`、`npm run check:web`、`git diff --check` | PASS |

## 用例与覆盖

| 用例 | 冒烟测试 | 关键断言 |
|---|---|---|
| SM-MR-006 / IT-MR-001 步骤 1–2 | `US4 SM-MR-006 desktop 1440/1920` | 已完成的历史日 H 查看：夹具 2 组 14 个旧块逐一打开详情，每个旧标题出现在「历史来源 … 第 N 项「标题」」，每条二级正文出现在输入框或冲突证据中（含 `480 原第二块`、账户计划 `498–508`/`495`），custom 标题原样；4 个未关联块带徽标；全部只读；全程无非 GET 请求，归档行、日计划、价位表前后完全相同。 |
| SM-MR-006 删除/关联 | `US4 SM-MR-006 legacy blocks` | 进入编辑后：未关联块关联到已用的 SOXX 被拒（提示已存在，块仍是 legacy）；Micron 关联到未用的 MU，原文保留为 custom 二级，未保存前锁定编辑；删除「市场广度」需确认。保存后旧两列原样冻结，MU 价位行不存在或为双空（与 API 测试同口径，旧原文不写成价位），未新建任何历史自由一级，实时计划不变，H 日计划内容与账户内顺序不变；重开仍能找到原文与来源。 |
| SM-MR-001（D 日部分）/ SM-MR-007 | `US4 SM-MR-001/007 desktop 1440/1920` | 最新日 D 沿用 10-12 与 09-27：只有一个「市场与板块」步骤和一张表，行数等于投影块数；每行 3px 短条，未选浅蓝、选中深蓝；详情居中；SOXX 显示「历史价位来源差异 2 项」，含首次采用、未采纳、「当前值（与首次采用一致）」。首次保存冻结冲突证据与块顺序，落本日价位 `505-515/575`；再改支撑为 `  530 新值  ` 后冲突证据不变（不重新归并）、本日价位更新、两个账户实时镜像同步；重开显示「当前值」为新值。 |
| IT-MR-002 首次 live 编辑 | `US4 first live edit on unmaterialized latest` | D 未物化时在账户页改 SOXX 支撑：PUT 只含该字段；先冻结写前沿用结构（含 GSPC 的 JPM collar 原文，不是空文档）和冲突证据（首次采用仍为写前 `505-515`），再叠加本次补丁；之后 bootstrap 不再是 inherited。 |
| IT-MR-002 / SM-MR-010 批量 | `US4 IT-MR-002 SM-MR-010 mixed inheritance` | 09-25 打开即见「较晚 market（09-24）替换基线 market，基线 SOXX 轮动与无来源的 MU 保留」，冻结旧列 `1111`/`222` 与基线前大盘思考不出现，打开零写。批量完成 2 个（09-01、09-25），最新日 D 保留不动；09-25 落 reviewed、块 id/标的与投影一致、本日价位写入；三个来源日归档行与价位行完全不变；账户快照来源为 `batch_review`。 |
| SM-MR-010 已存空 | `US4 SM-MR-010 explicitly saved empty` | 09-25 删除全部主题并保存草稿（blocks []），批量完成后仍为 []，重开 0 行。 |

正常完成路径（先 save 后 complete、新闻/计划校验）已在 US2 报告覆盖；快照接口无前端入口，由 API 测试 T049 覆盖。

## 写用例中修正的期望（以代码和合同为准）

- H 日计划价位只有冲突标的 SOXX 会进入冲突证据，MSFT 不在市场笔记中，不应期望出现。
- 蓝条规则是「每行浅蓝短条，选中行深蓝」（`styles.css` `.market-table tbody tr td:first-child::before`），不是所有行深蓝。
- 历史日保存会重写本日计划行：`updated_at` 更新，且 `normalizeActionPlans` 按全部计划的全局序号重排 `sort_order`（账户 2 唯一一条 SOXX 从 0 变 2）。这段函数与 HEAD 逐字相同，是原有行为、非本功能引入；用例改为比较除这两列外的计划内容和每个账户内的顺序。

## 数据清理

US4 用例前后都会删除夹具外日期的价位行，以及 09-01/09-25 的日计划、快照、归档新闻，并重新加载夹具，保证与 US1～US3 用例互不污染（两遍全量 32/32 验证）。

截图：

- [1440 历史日表格](market-review-desktop/us4-history-table-1440.png)、[1920](market-review-desktop/us4-history-table-1920.png)
- [1440 历史日冲突证据](market-review-desktop/us4-history-conflict-1440.png)、[1920](market-review-desktop/us4-history-conflict-1920.png)
- [1440 最新日首次冲突](market-review-desktop/us4-latest-conflict-1440.png)、[1920](market-review-desktop/us4-latest-conflict-1920.png)

## 后续范围

US5 展示身份（US10Y/TNX）、导出适配 T057/T058、原有冒烟回归 T059、安全复核 T060、性能守门 T061 与总验收 T062～T064 仍待完成。此记录不是完整上线或用户最终风格确认。
