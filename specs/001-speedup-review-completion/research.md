# Research: 完成复盘提速

日期：2026-09-18。方法：源码静态检查、现有测试和官方平台文档；未对生产复盘执行写操作，未取得真实性能基线。

## R1 — 保留双写接口，只去掉纯展示冗余

**Decision**: saveReview 增加完成模式，跳过中间列表、预览和编辑器重绘；保留本地状态提交，失败时恢复展示。
**Rationale**: app.js 的 handleNextStep 先 saveReview，再 complete，再 loadReviews；saveReview 内部还 loadReviews 并调度 preview。getReviews 与 previewReviewAccountImpact 都是只读，且前端自行捕获错误，不是业务前置校验。原流程至少四个串行网络阶段可以减少为三个，另去掉一次旁路预览。
**Alternatives considered**: 合并保存和完成接口会扩大失败契约；提前关闭界面掩盖等待；取消所有请求会影响其他用户操作；均不采用。

## R2 — 写入 batch 不符合当前失败不变约束（已于 2026-09-20 被 R2a 取代）

**Decision**: 保留逐条 await run；仅把相同 SQL 的 prepare 移到非空循环前。
**Rationale**: completeReview 先清理归档再逐条插入，操作计划先逐条 upsert 后清理多余记录；账户逐条更新。对应故障可留下已提交前缀。D1 batch 内失败会回滚整个批次，不能当作等价性能重构。
**Alternatives considered**: Promise.all 写入改变执行顺序和故障后的写入；INSERT SELECT 改变语句原子性/类型转换；失败回滚后重放引入额外写入和重试；均不采用。
**Source**: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch （本任务会话已查阅）。

## R2a — 改用 batch 合批（2026-09-20，取代 R2）

**Decision**: 新闻归档、每日计划、实时计划、账户同步四处改用 `env.DB.batch()`，分块 50；归档新闻的 DELETE 与 INSERT 同批提交。
**Rationale**: R2 的结论在收益侧被实测推翻——prepare 复用**没有减少任何 D1 往返**（normal 125→125、large 315→315），本地仅降 15–17%，远程实测仅降 6–7%。远程真机一次完成复盘 5–7 秒，几乎全部耗在逐条往返上：normal 基线 save 51 次往返/1913ms、complete 68 次/2391ms，折合每次往返约 28ms。合批后 normal 往返 119→28、large 309→31，而语句执行数 125/315 保持不变，证明没有增删任何业务写入。
**Trade-off accepted**: 用户于 2026-09-20 明确同意放宽回滚范围，接受「批次内原子、跨批次仍可能部分完成」。该变化在归档新闻上实际改善了语义：原流程先整表 DELETE 再逐条 INSERT，中途失败会留下「旧归档删一半、新的插一半」的破损态，合批后旧归档整体保留。
**Constraint preserved**: D1 单条 SQL 绑定参数上限 100 是**每条语句**的限制，合批不改变单条语句的参数数，因此既有的「100 计划 / 101 来源 ID 超限」失败行为原样保持，已由 `tests/review_completion_failures.test.mjs` 对照基线验证。
**Source**: 分块大小 50 沿用 `tests/helpers/review-completion-remote-adapter.mjs` 中已对真实远程 D1 验证过的值；`env.DB.batch()` 在本代码库既有使用（`ensureDefaultInvestmentAccounts`、`getLatestPricePointMap`、`getReviewBootstrap`）。

## R3 — 重复账户查询并非都能安全删除

**Decision**: 保留现有账户初始化、读取及计划解析的阶段位置，不新增请求缓存。
**Rationale**: resolveActionPlanAccountsForSave 默认执行 ensureDefaultInvestmentAccounts，后者会写入缺失账户；snapshot 阶段也会 ensureDefaults。取消第二次调用会改变错误边界，并发账户编辑/删除时也可能改变业务结果。写入快照后的读取同样是已有可失败阶段。
**Alternatives considered**: 请求内统一 accountMap、并行读取、从内存直接返回 snapshot；在更宽松约束下可优化，本次均不采用。

## R4 — 修正不可完成的默认基准

**Decision**: 保留普通组 50 新闻/20 计划/3 账户；较大成功组为 200 新闻/40 计划/3 账户。新闻大组使用原有时间窗口筛选分支，来源 ID 分支另用不超过 100 条的样本验证。100 计划和 101 来源 ID 属于失败兼容组。
**Rationale**: replaceReviewActionPlans 的 DELETE 参数为 1 + 2N，100 计划需 201；D1 每条语句参数上限 100。40 计划需 81；100 来源 ID 的 IN 查询为 100。修正的是本会话设定的默认测试规模，不改业务容量规则。测试账户必须支持现有查询数量，Free 的单次 50 查询额度不能用于大组成功对照。
**Alternatives considered**: 修复参数上限会使原本失败的输入成功，违反严格故障一致要求；在 mock 中放宽平台限制不能证明线上性能。
**Source**: https://developers.cloudflare.com/d1/platform/limits/ （2026-09-18 查阅，参数 100，Paid/Free 查询额度分别 1000/50）。

## R5 — 差分基线来自工作区，不来自 HEAD

**Decision**: 保存当前源码和迁移副本及哈希，在隔离环境交错运行基线和候选，分别恢复初始数据。
**Rationale**: 当前 main 上有未提交的已发布业务改动；仅 checkout HEAD 会丢失历史自动回填等基线。30 对样本分别计算中位数和 nearest-rank P95（第 ceil(0.95*N) 项）。
**Alternatives considered**: 生产反复点击不可接受；仅 mock 延迟只能验证少请求，不能作为平台提速验收证据。

## Research execution

按技能要求已派发只读研究代理；代理因额度限制未完成。上述结论均由主代理直接复核源码和官方文档，不引用未返回的代理结论。未知实现选择已收敛；剩余的真实耗时与性能收益属于明确的实施验收工作，而非已取得成果。
