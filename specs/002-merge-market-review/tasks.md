# 实施任务：市场复盘合并与标的化一级主题

**日期**：2026-10-15  
**特性目录**：`specs/002-merge-market-review`  
**实际 Git 分支**：`main`；本轮不创建/切换分支。

**输入**：[规格](spec.md)、[计划](plan.md)、[调研](research.md)、[数据模型](data-model.md)、[API 契约](contracts/review-api.md)、[桌面契约](contracts/desktop-ui.md)、[本地验证指南](quickstart.md)。

**本轮边界**：仅生成本任务清单，不执行其中的实现、测试写库或发布操作。全部任务保持未完成。后续实现授权也不自动授权生产迁移、部署、提交或 push。

**测试要求**：规格 SC-006、计划及用户已要求真实链路回归，因此包含测试任务。先写对应断言，确认实现前失败原因是功能缺失，再实现并验证通过；不能把导入错误/环境错误当作红测试证据，也不能只放宽断言。所有 SQL/夹具仅使用正式迁移构建的真实 SQLite 或本地 D1，禁止生产写测。

## 格式与路径约定

任务格式为 `- [ ] Tnnn [P?] [USn?] 描述和具体路径`。`[P]` 仅表示在其前置任务已完成后，可与指定的不同文件任务并行；不表示可跳过依赖。

- US1～US5 对应 spec.md 的五个故事；基础和收尾任务不标 US。
- 源码保持 `cloudflare/worker/src/index.js` 和 vanilla JS `cloudflare/web/`；只新增计划中的共用纯模型模块，不增加框架/ORM。
- migration 唯一入口为 `cloudflare/migrations/`。027 文件尚未实现，若编号被并行工作使用，顺延并同步本特性文档与测试，不改他人迁移。
- 测试、脚本、SQL、截图、报告均放 `tests/`，测试环境为 `APP_ENV=test`。
- 本轮不修改宪章/skill/权限配置。宪章是未配置模板，采用计划已核对的 CLAUDE.md 和测试标准。

## 阶段 1：准备与测试登记

**目标**：在实现前登记测试边界和真实本地环境，不新建应用结构或下载新依赖。

- [X] T001 [P] 在 `tests/standards/smoke-test.md` 登记 quickstart.md 的 SM-MR-001～010，更新旧 SM-021/SM-026/SM-028 及受影响账户计划用例的入口/价位断言；沿用“目标、前置、步骤、预期、优先级、是否阻断提交”表格格式，移除旧两个步骤必须分别填写的要求。
- [X] T002 [P] 在 `tests/standards/integration-test.md` 登记 IT-MR-001～003，覆盖旧GET零写、首次物化、live证据冻结、混合日期沿用、初始化/批量完成、真实SQL回滚/快照/Python；保留环境隔离要求，说明当前分支命名按 CLAUDE.md 的 main/test 规则。
- [X] T003 在 `tests/helpers/market-review-local.mjs` 创建本地D1夹具加载工具：读取 `tests/testdata/config/wrangler.test.toml`，固定 `--local`、数据库 my-financial-agent-test、persist-to=`tests/.wrangler-state/market-review`，先校验本地health环境test；提供 `--seed` 入口供桌面测试使用，拒绝非本地API地址，不增加远程模式或生产写入口。

**检查点**：测试标准已登记，后续夹具/API/SQL使用同一配置和本地状态目录；T001、T002可并行，T003随后完成。此阶段不执行生产操作。

## 阶段 2：共享基础（阻塞所有故事）

**目标**：具备正式schema、纯数据模型和可测的原子写入基础；不把旧账户价位列当新权威。

- [X] T004 [P] 在 `tests/helpers/market-review-fixtures.mjs` 定义可用于SQLite与本地D1的同源夹具数据：两账户SOXX差异价位、GSPC大盘维度和七轮动标的、未知/跨标的历史标题、无行情/停用/TNX目录项、旧重复id/预设、NULL/显式空、日期H/D、新旧交错来源、key_levels和导出区间，另含无旧笔记、无价位行的新空日期E（GSPC/SPY/SOXX/MU与无行情候选）供US1独立验收；T003加载器使用这些数据，不复制旧tests/schema.sql。
- [X] T005 [P] 在 `tests/integration/market_review_migration.py` 先增加正式迁移重放和升级的schema断言：新日期价位表复合主键/非空两列、归档与快照新字段、保留旧证据列、无级联删除；在 `tests/integration/migrations_fresh_replay.py` 加入新最终schema检查，记录迁移尚未实现时的失败。
- [X] T006 根据 data-model.md 在 `cloudflare/migrations/027_market_review_symbol_levels.sql` 增加日期价位表、归档market_review_json、快照market_review_json/symbol_levels_json，仅DDL；不回填历史、不修改TNX目录、不DROP旧列，运行T005直到通过。
- [X] T007 先在 `tests/market_review_model.test.mjs` 写基础模型断言，建立可加载的 `cloudflare/web/market-review-model.js` 接口后确认因行为缺失而非导入错误失败，再完成纯ES模块：version=1、symbol/legacy块、稳定id、六种kind＋custom、序列化剥离价位body、按symbol装配正文；模块不得使用fetch、DB、DOM或框架。
- [X] T008 在 `tests/helpers/review-completion-harness.mjs` 增加显式GET/POST/PUT/DELETE请求支持与共享夹具加载，保持原request/complete调用可用；在 `tests/helpers/review-completion-fixtures.mjs` 更新新marketReview合同，完整重放正式迁移并保留真实事务/往返计数，禁止stub掉Worker业务或数据库结果。
- [X] T009 先在 `tests/market_review_api.test.mjs` 编写并用真实SQLite验证json_each集合UPSERT/成员删除/参数边界的SQL断言，再在 `cloudflare/worker/src/index.js` 增加各写入口复用的语句构建；当前阶段只验证真实SQL基础，本功能端点事务的红测试由T028在T031/T034前补齐，不逐标的查询、不用跨100条分块当全事务，不改变账户非价位字段语义。
- [X] T010 先在 `tests/market_review_api.test.mjs` 对新空记录补bootstrap/date GET响应、显式空saved和全表零写断言，确认旧行为失败后，在 `cloudflare/worker/src/index.js` 接入T007：phaseOne batch读完整目录/日期价位，返回marketReview/symbolLevels；日期详情不跨日沿用，旧记录的详细转换在US4完成。

**依赖**：T004/T005可并行；T006在T005红测试后；T007和T008都要在T006之后，T007与T008文件不重叠可并行但都完成后才进入T009；T010依赖T007～T009。所有故事开始前T004～T010须完成。

**检查点**：新空记录可读，正式schema可用；旧记录不得在此阶段部署不完整投影。只有本地新记录可用于后续故事独立验证。

## 阶段 3：US1 — 从标的管理选择一级主题（P1，内部MVP）

**目标**：新复盘可以选择一级标的、保存重开、辨识指数/ETF、拒绝重复及错误更换，并具备桌面表格与详情入口。

**独立验收**：对一个没有旧笔记的新日期，搜索/添加MU和SOXX，重复SOXX不增加行，GSPC和SPY可区分，含价位二级的SOXX不能更换；保存重开身份/原二级不丢。无行情标的可选，目录失败不清草稿。

### 先补测试

- [X] T011 [P] [US1] 在 `tests/market_review_model.test.mjs` 增加US1结构与身份断言：id唯一、候选来自目录、代码/名称/别名匹配和歧义、新建重复、已含空价位二级也拒绝更换、只含思考的更换保留正文、不可伪造legacyOrigin放行重复。
- [X] T012 [P] [US1] 在 `tests/market_review_api.test.mjs` 经真实Worker/SQLite覆盖新POST结构替换、目录身份/不可用历史身份延续、400/409且写入前拒绝、完整响应；明确省略整个marketReview才保持结构，提交时blocks与levels必须同时为数组，null/缺任一数组拒绝；旧camelCase和snake_case两组字段均返回刷新错误，不执行生产POST。
- [X] T013 [P] [US1] 在 `tests/smoke/market_review.spec.js` 基于T004的新空日期E增加SM-MR-001（结构/样式部分）与SM-MR-002a的桌面用例骨架，使用T003/T004加载器；不依赖US10Y、共用价位带值或旧笔记（分别由T052、T029、T051验证）；断言只有一个市场入口、五列/标题工具栏、搜索/重复/更换、无行情候选和失败草稿保护，API和SQL必须同一本地环境。

### 实现

- [X] T014 [US1] 在 `cloudflare/web/market-review-model.js` 实现US1新块建立/身份校验/重复拒绝和标的更换约束，严格区分目录系统键与展示值，保持稳定block/child id和现有正文；不使用未知大写token或LLM回退建立身份。
- [X] T015 [US1] 在 `cloudflare/worker/src/index.js` 的saveReviewDraft实现marketReview.blocks整份替换：仅省略整个marketReview才保持结构；提交该对象必须提供blocks与levels两个数组，null/缺数组返回400；目录/已有身份批量校验、响应完整，拒绝旧两组camelCase/snake_case字段，不双写旧列，后续US3接level补丁但不接受账户独立价位写源；提交blocks时即最终结构，服务端不追加主题/二级。
- [X] T016 [US1] 在 `cloudflare/web/index.html` 合并market/rotation为“市场与板块”面板，增加五列表格和当前标的右侧详情容器，工具栏在标题右侧；删除重复“市场标的”层，保留其他步骤/原操作计划modal位置。
- [X] T017 [US1] 在 `cloudflare/web/app.js` 接入marketReview状态、表格/目录渲染及复用原symbol picker的添加/定位/更换流程，搜索完整启用目录，不按行情过滤；新标的默认支撑位/压力位/思考，保存只提交新字段，失败保留草稿。
- [X] T018 [P] [US1] 在 `cloudflare/web/styles.css` 复用action-plan表格/按钮/字段视觉，增加市场右侧详情布局、五列宽度、每标的短浅蓝竖条/选中深蓝；不使用外围连续蓝线、不增加移动端专属样式、不改变其他页面或原操作计划modal。
- [X] T019 [US1] 在 `cloudflare/web/app.js` 完成按稳定id的一级上移/下移/自动排序/确认删除、行/目录/Enter/Space打开详情、Esc关闭、长文本tooltip和只读工具栏；自动排序按目录分组/sort_order/symbol，legacy排序规则在US4补齐，关闭与完成编辑只更新草稿不逐项POST。
- [X] T020 [US1] 执行 `tests/market_review_model.test.mjs`、`tests/market_review_api.test.mjs`、`tests/smoke/market_review.spec.js` 中US1用例，将独立结果记录到 `tests/reports/market-review-us1.md`，确认测试因功能缺失红→实现通过；只在本地新记录展示MVP，不发布到含旧数据的环境。

**检查点**：US1为内部可演示MVP。不能以此替代US2/3/4/5完整上线验收。

## 阶段 4：US2 — 常用二级标题整理分析（P1）

**目标**：六种预设唯一、自定义可多个且非空；GSPC下维护CTA/collar/EPS，二级排序/删除/只读和合并必填步骤成立。

**独立验收**：在新GSPC块添加六类预设和两个自定义，重复预设禁用，自定义空白标题保存被拒绝；文字、金额、区间、顺序保存重开一致；只有一个合并市场必填项。

### 先补测试

- [X] T021 [P] [US2] 在 `tests/market_review_model.test.mjs` 和 `tests/market_review_api.test.mjs` 添加US2预设字面量/固定标题/唯一性、自定义非空、未知kind拒绝、正文空值允许、稳定排序、合并校验断言，确认新输入不借历史宽松解析绕过校验。
- [X] T022 [P] [US2] 在 `tests/smoke/market_review.spec.js` 增加SM-MR-003和正常完成路径的US2断言：菜单已添加禁用、自定义多项、GSPC维度、二级上移/下移/删除、只读详情、保存重开及单市场步骤必填。

### 实现

- [X] T023 [US2] 在 `cloudflare/web/market-review-model.js` 完成按kind推导固定标题、预设新增/唯一性、自定义标题及二级排序/删除的纯数据操作；支持空正文，不添加CTA/EPS自动计算或新数据源。
- [X] T024 [US2] 在 `cloudflare/worker/src/index.js` 新保存入口验证二级结构/固定预设/custom非空及id唯一，明确返回400/409并在写batch前终止，不吞错保存或丢弃非法二级假装成功。
- [X] T025 [US2] 在 `cloudflare/web/app.js` 实现右侧详情的预设/自定义输入、添加菜单、排序删除及本地草稿反馈；长内容宽行、支撑压力并排，字段变化即时进入同一文档；UI错误可定位字段，详情完成编辑不独立POST。
- [X] T026 [US2] 在 `cloudflare/web/app.js` 的REVIEW_STEPS/目录/完整度/正常完成流程和 `cloudflare/worker/src/index.js` 的getBatchReviewReadiness/completeReview中，将旧两项校验改为marketReview一项，保留新闻/计划/总结规则和先save后complete；batch沿用保存后的校验在US4闭环。
- [X] T027 [US2] 运行 `tests/market_review_model.test.mjs`、`tests/market_review_api.test.mjs`、`tests/smoke/market_review.spec.js` 中US2用例，记录 `tests/reports/market-review-us2.md`，核对GSPC的CTA/JPM collar/EPS正文数字原样保存且未绑定JPM股票。

## 阶段 5：US3 — 市场与操作计划共用价位（P1）

**目标**：同日同标的只有一份支撑/压力，两入口跨账户双向同步；省略保持、明确空、删除保留、实时最新日同步及原子事务完整。

**独立验收**：在已存新结构日期的两账户SOXX上，从市场改支撑、计划改压力，两处两账户一致；删主题价位仍在、清空后不回填；历史H不改D/live，其他账户字段不变。实际非空填写计划价位才补市场结构。

### 先补测试

- [X] T028 [P] [US3] 在 `tests/market_review_api.test.mjs` 增加US3补丁存在性/空字符串/null/仅symbol无字段/重复symbol、不同写源409、跨账户投影、删除优先、仅市场编辑同步live、日期隔离/删除保留/无日期GET零写；同一请求含MU非空补丁但blocks无MU时保存后仍无MU主题且MU价位行已写入，live与省略marketReview入口实际非空填写才由服务端补齐；同时先写新JSON/level/日计划/live真实事务回滚和大请求单write batch/绑定上限断言，确认功能缺失红后才做T031/T034，T038复验；旧首次证据场景在US4扩展。
- [X] T029 [P] [US3] 在 `tests/smoke/market_review.spec.js` 增加SM-MR-004/005/008及SM-MR-002b中新建标的初始带出已有共用价位：市场→计划、计划→市场、GOLD/MU缺主题补齐、共享账户提示、只读两处锁定、删主题/二级、清空、随后只改仓位/排序不复活；用本地真实GET/DB结果校验。

### 实现

- [X] T030 [US3] 在 `cloudflare/web/market-review-model.js` 实现唯一symbolLevels映射更新、字段补丁和price child装配/剥离、实际非空变化才补主题/二级、明确删除优先；首次物化/清空/未变化计划镜像不得重新建主题。
- [X] T031 [US3] 在 `cloudflare/worker/src/index.js` 将T009集合SQL接入复盘保存：日期价位补丁与新文档/日计划集合/应同步live镜像一个batch；存在行的两个空字符串是权威，新计划旧price列不再写为独立源；校验绑定上限和SELECT UPSERT语法，不逐账户串行写新价位；提交blocks时只写价位补丁不补主题，服务端补齐仅限未提交blocks的写入口。
- [X] T032 [US3] 在 `cloudflare/worker/src/index.js` 日计划/详情/bootstrap/complete的读结果中按(archive_date,symbol)装配supportLevels/resistanceLevels，新JSON内价位正文不重复保存；省略marketReview/计划数组保持各自职责，响应不用逐标的重查，key_levels原值不因价位变化重算。
- [X] T033 [US3] 在 `cloudflare/worker/src/index.js` 实时GET/单项GET以最新归档日共用值投影；无归档日时逐字段取账户展示顺序首个非空live值，跨账户统一显示并返回差异提示，零写且不制造日期。
- [X] T034 [US3] 在 `cloudflare/worker/src/index.js` 实时POST/PUT/DELETE与syncLatestDailyFromLive实现显式变化价位同步、同symbol各live镜像和最新日计划集合原子更新；保留MAX(archive_date)及reviewed最新日同步现状，删plan保留市场/价位，非价位更新不覆盖共用值，US4补齐旧日期首次证据冻结。
- [X] T035 [US3] 在 `cloudflare/web/app.js` 将市场textarea、计划详情、所有账户表格接到同一symbolLevels更新入口；保存dirty levels到marketReview.levels，计划价位只是投影；live修改发送实际变化字段，改仓位/排序不夹带旧价位覆盖；保存成功采用响应并清dirty，失败保持编辑内容。
- [X] T036 [P] [US3] 在 `tests/integration/market_review_db_utils.py` 新增正式迁移SQLite上的Python日计划投影/显式symbol_levels补丁/同事务回滚/空值/日期隔离断言，旧列不同而新价位已存时必须用新值；不使用旧tests/schema.sql或生产数据库。
- [X] T037 [US3] 在 `src/db_utils.py` 使list_review_action_plans读取共用价位，replace_review_action_plans接受可选显式symbol_levels补丁并与计划同一SQLite事务，不借账户镜像覆盖新权威、不重新生成key_levels；只修相关SQL/调用，不改其他pipeline。
- [X] T038 [US3] 执行T028先行写入 `tests/market_review_api.test.mjs` 的真实约束/事务失败和大请求集合SQL断言，复验T031/T034后新JSON/level/日计划/live全部回滚、绑定上限内、业务保存只一个write batch；无法真实构造的失败分支明确审查证据，不放宽断言或mock业务回避。
- [X] T039 [US3] 在真实本地Worker/D1运行 `tests/smoke/market_review.spec.js` 的US3路径和 `tests/integration/market_review_db_utils.py`、SQLite API测试，记录 `tests/reports/market-review-us3.md`；核对两项价位以外的账户动作/仓位/金额/思考未变。

## 阶段 6：US4 — 无损历史查看与继续编辑（P2，发布阻断项）

**目标**：旧笔记和计划价位归并不丢原文、冲突可追溯，GET零写、未关联内容只读可删/关联，新旧跨日沿用/初始化/批量/快照消费者齐全。

**独立验收**：用旧H和新旧交错来源比对所有原标题/正文/数字，GET前后表相等；首次保存保留冲突证据和旧列；更早来源不会覆盖较新统一基线，明确空不回填；首次live“500/480→510”证据冻结正确。

### 先补测试

- [X] T040 [P] [US4] 在 `tests/market_review_model.test.mjs` 加旧明确代码/唯一别名/歧义和多代码legacy、原动态一级文字、原二级标题、重复原id及预设、date+group+index稳定来源、字段各自市场优先/账户兜底、原文冲突、NULL/[]/新旧交错日期沿用断言，legacy块支撑/压力原文保存在文档中、重开仍在且不写价位表，逐项比较原文而非只计块数。
- [X] T041 [P] [US4] 在 `tests/market_review_api.test.mjs` 加旧GET全表快照零写、首次显式保存新JSON+初值+补丁、旧列冻结、legacy不可改/可删/合法关联、伪造来源拒绝、已存空不回填、首次live市场500/计划480/本次510仍保存500/480证据、非价位写入一次物化的断言；另加非reviewed初始化不写价位行、初始化后首次保存仍按市场优先产生冲突证据，以及新初始化日只改live仓位后打开复盘沿用主题仍在（不物化为空文档）。
- [X] T042 [P] [US4] 在 `tests/integration/market_review_migration.py` 扩展“001～026旧数据后执行027”升级测试：DDL不改旧归档/日计划/key_levels/快照数据且新表为空；检测重复迁移由正式migration机制管理，不对生产执行重放；未知目录与历史标题不能自动落新身份。

### 实现

- [X] T043 [US4] 在 `cloudflare/web/market-review-model.js` 实现保守旧块转换、原文/legacyOrigin保留、旧重复id按日期+来源组+原序号生成唯一稳定id、首预设后重复转custom、历史重复一级例外但来源不可复用；原GSPC下国债留原处，未知/多标的不猜个股、不调用LLM/Yahoo；legacy块的支撑/压力二级保留原文body，不读写价位表，关联标的后也不自动写入共用价位。
- [X] T044 [US4] 在 `cloudflare/web/market-review-model.js` 实现当日新JSON权威/旧字段NULL才沿用、两旧组独立来源、最近新基线N＋更晚旧组替换同legacyOrigin.group、无旧来源的新建主题保留、N前旧组/冻结旧列排除、空中间日跳过；level初值按目标权威行→本日市场→本日日计划→沿用来源，空权威不兜底。
- [X] T045 [US4] 在 `cloudflare/worker/src/index.js` bootstrap/save共享读取批次中加入旧来源和新基线必要数据并接T043/T044：bootstrap允许沿用，日期详情不跨日，返回source/sourceDates/初始conflicts；选择来源后读取所需价位仍合批、不逐日期/标的串行查询，GET绝不物化写库。
- [X] T046 [US4] 在 `cloudflare/worker/src/index.js` 所有首次物化路径（复盘save、latest live POST/PUT及相关首次写入）先用写前材料（有效展示结构，含跨日沿用与sourceDates）冻结market_review_json/conflicts及初始值，再叠本次level补丁并同batch提交；后续保留证据，不以新的当前值反算首次证据，不把未改镜像恢复已删结构。
- [X] T047 [US4] 在 `cloudflare/web/app.js` 显示历史未关联列表/原标题正文、冲突采用源/未采纳原文与当前值；未关联原文只读、可确认删除或关联未用标的，已完成查看/进入编辑不自动POST，关联后旧原文仍可找到。
- [X] T048 [US4] 在 `cloudflare/worker/src/index.js` initialize/delete保护reviewed并将新旧笔记字段置NULL但保留既有level，日计划为空才复制活跃live，初始化不写日期价位行；complete/batch autoFill与 `cloudflare/web/app.js` 使用新marketReview默认，显式空/已有内容优先，保存后readiness校验、最新保留、无参考历史可完成/失败重试不变。
- [X] T049 [US4] 先在 `tests/market_review_api.test.mjs` 与 `tests/worker_review_list_contract.test.mjs` 加快照与列表断言并确认行为缺失失败，再在 `cloudflare/worker/src/index.js` 的createReviewSnapshots复制当时新文档+日期价位、旧快照不回填，thesis读取新JSON/旧投影不逐日期查level；验证改当前价位不变旧快照、列表内容完整且无逐行价位查询。
- [X] T050 [P] [US4] 先在 `tests/integration/market_review_db_utils.py` 写旧原文/冲突/初始化断言并确认真实schema行为失败，再在 `src/db_utils.py` 对齐save_archive/initialize_archive_record/get_archive_by_date的新结构/旧GET投影/reviewed保护，停止引用022已删text列；在 `tests/testdata/prepare_history_seed.py` 更新相关seed新合同，不翻修旧离线转换器。
- [X] T051 [US4] 在 `tests/smoke/market_review.spec.js` 补SM-MR-001旧笔记D日部分、SM-MR-006/007/010和IT-MR-001/002完整历史链路，用T040～T050断言运行真实本地SQLite/Worker/D1；记录 `tests/reports/market-review-us4.md`，缺失任一原文字段或GET写入都阻断通过。

**检查点**：US4不是因P2可跳过的上线项；没有历史安全、明确空和首次live证据通过，不能向用户报告正式功能可用或请求发布。

## 阶段 7：US5 — US10Y与TNX同一收益率身份（P2）

**目标**：目录/市场/计划可显示并搜索US10Y，而系统键TNX、Yahoo ^TNX和已有行情/新闻/计划关联完全不改。

**独立验收**：目录搜TNX/US10Y只有同一候选，选US10Y保存symbol为TNX；行情/新闻/账户旧关联仍可读，目录隐藏/删除后历史identity显示原内容，不把国债价格/ETF当收益率。

- [ ] T052 [US5] 在 `tests/market_review_model.test.mjs`、`tests/market_review_api.test.mjs`、`tests/smoke/market_review.spec.js` 添加US5（含SM-MR-002b的搜US10Y选TNX）目录推导displayCode/搜索同义身份/存TNX/^TNX不变/历史identity与不可用状态断言；数据库tracked_symbols无新增US10Y或改名，测试不调用远程Yahoo。
- [ ] T053 [US5] 在 `cloudflare/web/market-review-model.js` 统一derive displayCode：TNX→US10Y、其他→symbol，搜索展示别名加入US10Y但保持存储键/identity关联，不引入通用改名机制或另一个资产身份。
- [ ] T054 [US5] 在 `cloudflare/worker/src/index.js` 的管理目录GET/单项GET、复盘action-plan-symbols和live symbols响应中增加displayCode/展示搜索别名；原snake_case/camelCase字段命名保持，不写tracked_symbols或变更Yahoo/news/价格关联。
- [ ] T055 [US5] 在 `cloudflare/web/app.js` 标的管理、市场/操作计划搜索结果与选中显示使用displayCode，内部编辑保留TNX系统键提示；历史目录不可用时用identity快照显示US10Y，不再按名称猜身份。
- [ ] T056 [US5] 执行 `tests/market_review_model.test.mjs`、`tests/market_review_api.test.mjs`、`tests/smoke/market_review.spec.js` 中US5及原 `tests/smoke/symbol_manager_ui.spec.js` 相关回归，记录 `tests/reports/market-review-us5.md`；确认用户收益率数值未换算/改写。

## 阶段 8：跨故事收尾、回归与交付（不包含发布执行）

**目标**：所有旧消费者、新模型和桌面成品完整；测试/报告/发布前清单就绪，未经另行授权不部署/提交。

- [X] T057 [P] 在 `tests/zone_export.test.mjs` 补新blocks/symbolLevels输入与旧原文保留场景：GSPC专用SPX,ES1!,ES支撑顺序/负伽马/CTA加速±1模板、普通压力不进标普模板、普通标的压力优先/去重/无效行跳过、普通数字分析不误判、legacy不臆造symbol。
- [X] T058 在 `cloudflare/web/zone-export.js` 和 `cloudflare/web/app.js` 将复盘/账户顶部导出读取新统一身份/价位及原GSPC维度，保留T057全部原命令语义；不靠标题重新猜已关联symbol，不新增重复导出入口/跟踪资产，也不把多账户同价位重复导出。
- [x] T059 在 `tests/smoke/review_edit_cycle.spec.js`、`tests/smoke/account_live_action_plans_api.spec.js`、`tests/smoke/account_based_action_plans.spec.js`、`tests/smoke/batch_pending_reviews.spec.js`、`tests/smoke/action_plan_zone_export.spec.js` 及相关 `tests/helpers/` 原夹具更新新合同/单市场入口，复用T003本地环境配置；逐个保留原资金/计划/批量/导出强断言，禁止仅改BASE_URL让SQL/API落两个本地环境。
- [ ] T060 在 `cloudflare/worker/src/index.js`、`cloudflare/web/app.js` 和 `tests/market_review_api.test.mjs` 复核输入校验与HTML/SQL边界：kind/id/symbol/历史来源严格、正文安全渲染、SQL绑定、错误batch前拒绝、失败不清草稿、不新增可任意写DB的接口；测试用户正文含HTML和引号而不放宽既有访问控制。
- [x] T061 在 `tests/review_completion_roundtrips.test.mjs` 与 `tests/helpers/review-completion-fixtures.mjs` 给normal(50新闻/20计划)、large(200新闻/40计划)加入真实marketReview/level/live数据并继续要求normal≤7、large≤9；补首次物化规模与读写batch计数证明，不因任务变复杂直接上调守门阈值，不用prepare数代替网络往返。
- [ ] T062 执行 `specs/002-merge-market-review/quickstart.md` 的正式迁移重放、Node模型/API/原回归、Python、新旧smoke与真实本地Worker/D1主链路，在 `tests/reports/market-review-validation.md` 按标准记录通过/失败/未执行及原因；所有新数据仅在本地测试库，未解决红测试不得勾选完成。
- [ ] T063 在本地真实应用而非Canvas，用桌面1440×1000和1920×1080验证完整五列表格、右侧详情/吸底区、长中文、目录、只读/编辑、同步和旧内容；截图放 `tests/reports/market-review-desktop/` 并在 `tests/reports/market-review-validation.md` 记录用户对成品风格的确认，不能用语法检查替代功能验收，不补手机用例。
- [ ] T064 [P] 根据最终实现与T062/T063结果更新 `specs/002-merge-market-review/quickstart.md` 的实际验证命令、报告链接和发布前检查清单，列明main/test目标、DDL-only迁移/备份/同版本前后端/失败处理及需用户另行授权的生产迁移、部署、提交、push；本任务只准备文档，不执行发布。

## 依赖与执行顺序

### 故事依赖图

```text
准备 T001～T003
  └─ 基础 T004～T010
       ├─ US1 T011～T020 ── US2 T021～T027
       │       └────────── US3 T028～T039
       │                      └─ US4 T040～T051（也需US2）
       └─ US5 T052～T056（目录后端/纯函数可独立准备；界面需US1）

US1＋US2＋US3＋US4＋US5
  └─ 收尾 T057～T064
       └─ 另行用户授权后才讨论发布；此清单没有自动发布任务
```

US3在基础与US1完成后可开始其独立测试，整体集成检查点需US2；US4依赖US1～US3完整结构和价位入口。US5逻辑没有价位/历史业务依赖，但与其他故事共用model/app/worker文件，默认故事实现按US1→US2→US3→US4→US5串行。

### 关键前置

| 任务/组合 | 前置 |
|---|---|
| T001/T002 | 输入文档已存在，可并行 |
| T003 | T001/T002 |
| T004/T005 | 阶段1；两者不同文件可并行 |
| T006 | T005已写并确认功能缺失失败 |
| T007/T008 | T006、T004；不同文件可并行 |
| T009→T010 | T007/T008都完成→T009→T010 |
| T011/T012/T013→T014～T019→T020 | 基础完成；测试先行，T016先于T017/T018；T018可与T017并行；T019接T017 |
| T021/T022→T023/T024→T025/T026→T027 | US1；同model/worker/app文件内部串行 |
| T028/T029→T030～T035→T038→T039 | US1；T031依赖T030，T032→T033→T034顺序修改worker；T035需US2详情字段 |
| T036→T037 | 共享schema/合同已就绪；可与JavaScript实现并行，T039统一验收 |
| T040/T041/T042→T043→T044→T045→T046 | US1～US3；三个测试文件互不重叠，模型/Worker实现串行 |
| T047/T048/T049 | T045/T046后；两个app改动不并行，两个worker改动不并行 |
| T050 | T043/T044规则已确定、T037；可与T048/T049并行，T051统一验收 |
| T052→T053→T054→T055→T056 | 基础/US1可开始测试准备，默认在US4之后避免共享文件争写 |
| T057→T058→T059→T062 | 五故事已完成；导出先写红测试再实现 |
| T060/T061→T062 | 完整实现；API/fixture共用文件不与T059同文件任务并行 |
| T063 | T062通过；用户确认未得到时保持未完成，不猜测确认 |
| T064 | T062、T063；可与不修改quickstart的交付整理并行，绝不自动部署 |

每个故事的验收任务必须待该故事所有实现/测试前置完成，不因为故事标题优先级低跳过。T020～T027的新记录内部MVP不代表历史接口、实时同步、US10Y或导出已完成。

## 并行机会与每个故事的示例

只并行不同文件、无需对方未完成结果的工作；标记与前置表一起理解。运行多个会改同一本地D1库的smoke串行，用workers=1或独立本地状态，不能让夹具互相清空。

- 准备：T001（smoke标准）与T002（integration标准）。
- 基础：T004（同源夹具）与T005（schema测试）；迁移完成后T007（纯模型接口）与T008（harness接入）。
- US1：T011模型测试、T012API测试、T013桌面测试可同时编写；T016完成后T017交互与T018CSS可同时实现。
- US2：T021模型/API断言与T022桌面断言可同时编写；T023～T026共享文件需要串行。
- US3：T028 API断言与T029桌面断言并行；T036/T037 Python支线与T030～T035 JS/Worker支线并行，规则由同一合同给定，T039汇合。
- US4：T040模型、T041API、T042迁移升级断言并行；T043/T044完成后T050 Python适配可与T048/T049 Worker支线并行。
- US5：不标共享源码任务为P；T052中的不同测试文件可以分给独立人员写对应断言，但合并/运行必须由同一任务负责人核对。
- 收尾：T057导出单元测试可与不修改zone-export文件的既有实现审查并行；T064只在其前置满足后整理文档。

## 实施策略

### 内部MVP

先完成准备、基础和US1，在空白本地复盘中证明“一级标的→表格详情→保存重开”。这只是内部增量，不部署；US1新增标的默认价位维度先占位，实际共享值和历史完整内容分别由US3/US4闭环。

### 完整交付

按故事逐步增加二级维度、日期价位和live双向同步、无损历史与来源取舍、US10Y展示，再跑导出/快照/列表/Python/原账户链路收尾。完整发布范围为五个故事全部完成，不把历史安全降为可选优化。

### 安全边界

- 只创建一个日期价位表；不再建无日期live权威表。
- 市场新JSON无价位正文，旧列是只读证据；新写不兼容双写旧两组字段。
- 新价位两个空字符串是明确值；删除主题/计划不删价位，不被未变镜像重建。
- 初始冲突先冻结后修改，市场500/计划480/本次510必须同时可验证。
- 无生产夹具/写测，无移动端，无自动采集/计算，无新增SPX/NDX/ES=F标的。
- 本轮任务生成不运行实现测试；任务勾选只在实际执行并验证之后。未经请求不提交，未经另行授权不运行迁移/部署。

## 需求与任务覆盖

| 需求 | 主任务 |
|---|---|
| FR-001/015 合并入口与校验 | T016/T017/T026/T048，测试T013/T022/T051 |
| FR-002～005 候选/搜索/身份/重复/更换 | T011～T020，历史来源防伪T040/T041/T043 |
| FR-006～008 预设、自定义、GSPC内容、编辑排序 | T021～T027，旧标题维度归并T043 |
| FR-009～011 共用价位、补齐、删除保留、日期隔离 | T028～T039，旧首次物化T046 |
| FR-012～014 历史原文、冲突、沿用/明确空 | T040～T051，空值基础T028/T030/T031 |
| FR-016 US10Y/TNX | T052～T056 |
| FR-017 导出/消费者/账户其他规则 | T032/T037/T048～T050/T057～T062 |
| FR-018 桌面表格/详情/逐行蓝条 | T013/T016～T019/T025/T047/T063 |
| 性能/原子性/环境保护 | T003～T010/T031/T034/T038/T045/T060～T064 |

## 任务统计与完成标准

| 范围 | 数量 | 独立完成标准 |
|---|---:|---|
| 准备 | 3 | 标准与本地加载边界就绪 |
| 共享基础 | 7 | 正式schema/模型/可测读写基础 |
| US1 | 10 | 新记录标的选择、身份、表格、保存重开 |
| US2 | 7 | 预设/自定义、GSPC维度、排序/校验 |
| US3 | 12 | 双入口跨账户共用、live/日期隔离/回滚 |
| US4 | 12 | 原文零丢失、GET零写、冲突/沿用/快照/Python |
| US5 | 5 | US10Y显示搜索、TNX/^TNX身份关联不变 |
| 跨故事收尾 | 8 | 完整本地回归、性能、桌面确认与发布前文档 |
| 合计 | 64 | 全部仍未执行，发布另行授权 |

每项都有唯一连续ID、checkbox和具体路径；US阶段所有任务均需US标签。任务生成后下一步为speckit-analyze检查spec/plan/tasks，不自动执行speckit-implement。
