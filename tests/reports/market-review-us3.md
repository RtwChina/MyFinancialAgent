# US3 共用价位验收

日期：2026-10-16。范围 T028～T039；仅本地 APP_ENV=test 正式迁移 SQLite/Worker/D1（`tests/.wrangler-state/market-review`），未部署、提交或 push。

## 独立复验结果

| 项目 | 命令 | 结果 |
|---|---|---|
| US3 桌面冒烟 | `./node_modules/.bin/playwright test tests/smoke/market_review.spec.js --workers=1 --grep US3` | 13/13 PASS，1.1 分钟 |
| 市场与板块全部冒烟（US1+US2+US3 回归） | `./node_modules/.bin/playwright test tests/smoke/market_review.spec.js --workers=1` | 24/24 PASS，连续两遍各 1.6 分钟 |
| Python 正式迁移 SQLite | `python3 tests/integration/market_review_db_utils.py` | 41/41 OK |
| Node 模型/API/harness/事务/往返/失败重试/列表合同 | `node --test tests/market_review_api.test.mjs tests/market_review_model.test.mjs tests/review_completion_harness.test.mjs tests/review_completion_atomicity.test.mjs tests/review_completion_roundtrips.test.mjs tests/review_completion_failures.test.mjs tests/worker_review_list_contract.test.mjs` | 285/285 PASS |
| 语法/格式 | `npm run check:worker`、`npm run check:web`、`node --check cloudflare/web/market-review-model.js`、`git diff --check` | PASS |

## 覆盖内容

- SM-MR-004/005/008 与 SM-MR-002b：1440×1000、1920×1080 下市场→计划、计划→市场双向带值，首尾空格与换行原样保存；保存只发 `marketReview.levels` 补丁，计划不带价位字段；成功后清 dirty，再次保存补丁为空。
- 计划实际填写非空价位时补齐 GOLD/MU 主题；新建市场标的与新建计划带出视图外已有共用值（IGV）。
- 删除价位二级/一级、清空、仅改仓位、同值回填、排序、删除计划均不改价位表、不复活主题；清空两字段是权威值，重开后两个账户都为空。
- reviewed 日两处价位只读，共享账户提示可读，全程 GET 零写。
- 真实 D1 触发器制造约束失败：复盘保存 500、实时 PUT 500 均无部分写入，草稿保留，重试成功。
- 实时 PUT/POST/排序：只发送实际变化字段；排序 PUT 只含 `sortOrder`；新账户计划不提交继承值；最新日市场保存同步到全部实时镜像，历史日 E 和账户动作/仓位/金额/思考/key_levels 不变。

## 本轮对测试的修订（代码为准，重定义而非放宽）

1. **实时 PUT 未提交价位**：原断言要求账户 2 的压力位镜像保持旧原文 `raw live resistance 2`。规格 data-model.md「live 价位两列：保存时从权威值更新实时镜像」，Worker `buildLivePriceMirrorStatement` 有最新归档日时按该日权威行对齐同标的全部镜像。改为断言：权威压力位不变、镜像等于权威值、实时 GET 前后各账户显示的压力位逐行一致（且修改前已等于权威值）、其他非价位字段不变。
2. **二级只读按钮**：已定「二级仅删除」，同文件第 313 行已断言无上移/下移。只读与 legacy 两处改为上移/下移不存在、删除按钮存在且禁用。
3. **1920 长文本溢出**：1920 下详情弹窗更宽，思考框自动长高后 757px 内恰好放下，原 240 段文本不再溢出。文本加长到 480 段，保留「详情区可滚动＋吸底按钮可见」两条断言。
4. **支撑/压力并排**：重新添加二级后详情区仍在滚动，两次分开的 `boundingBox` 取到不同帧，偶发相差 4～11px。改为同一帧内一次测量三个框，容差仍为 2px；该用例连跑 10 次全过。

## 环境备注

本机终端解析 `registry.npmjs.org` 固定卡 30 秒后失败，wrangler 每次启动做版本检查且失败不写缓存，导致每条本地 SQL 白等 30 秒、用例前置超时。处理方式：在系统临时目录预写 `update-check/wrangler-latest.json`（记为已是 4.73.0），未改仓库与 node_modules。缓存过期后需重写，否则冒烟会大面积超时。

截图：

- [1440 市场详情共用价位](market-review-desktop/us3-market-1440.png)、[1920](market-review-desktop/us3-market-1920.png)
- [1440 计划详情共用价位](market-review-desktop/us3-plan-1440.png)、[1920](market-review-desktop/us3-plan-1920.png)

## 后续范围

US4 历史归并/沿用/冲突的桌面链路（T051）、US5 展示身份、导出与全量原回归仍待闭环。此记录不是完整上线或用户最终风格确认。
