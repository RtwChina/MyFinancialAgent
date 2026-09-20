# Tasks: 完成复盘提速且保持业务逻辑不变

**Input**: `specs/001-speedup-review-completion/` 中的 spec.md、plan.md、research.md、data-model.md、contracts/review-completion.md、quickstart.md。
**Created**: 2026-09-18
**Tests**: 规格 FR-010/011、SC-001 至 SC-004 明确要求差分、故障与性能测试，因此包含测试任务；本文件生成不代表测试或实现已经执行。
**Organization**: 按 US1（每日提速，P1）、US2（失败恢复，P1）、US3（入口兼容，P2）组织。

## Format and Path Conventions

所有路径相对仓库根目录。`[P]` 表示在其前置任务完成后，同一阶段内可与指定不同文件任务并行，不表示可跨依赖提前开始。新增文件路径是实施时的交付物，不要求目前存在。

## Phase 1: Setup — 固定当前业务基线

**Purpose**: 使用现有工程与依赖，不新建框架或业务模型；先保存未提交的现有业务状态，再修改任何应用代码。

- [X] T001 核对 `specs/001-speedup-review-completion/plan.md` 与当前源码是否一致，将实际分支、工作区差异摘要、依赖版本和运行条件记录到 `test-results/review-completion/environment.json`；保持 main/工作区现有改动，不自动提交、切分支或部署。
- [X] T002 在 `scripts/benchmark-review-completion.mjs` 增加基线捕获模式，复制当前 `cloudflare/worker/src/index.js`、完整 `cloudflare/web/`、`cloudflare/migrations/`、package 清单和测试配置到 `.tests/review-completion/baseline/`，生成 SHA-256 manifest；拒绝覆盖已有基线，执行捕获并确认不以 HEAD 代替工作区。
- [X] T003 检查并按需补充 `.gitignore` 的 `test-results/review-completion/` 排除规则，在 `specs/001-speedup-review-completion/quickstart.md` 记录基线启动方式与相互隔离的状态目录；不得复制凭据或生产数据库内容。

**Checkpoint**: 基线副本、哈希及恢复说明存在，后续应用改动不再改变基线。

## Phase 2: Foundational — 共享对照与测量基础

**Purpose**: 所有用户故事实施前必须完成 T004–T008；此阶段只构建测试基础，不改业务行为。

- [X] T004 在 `tests/helpers/review-completion-fixtures.mjs` 定义确定性合成数据与恢复操作：normal=50 新闻/20 计划/3 账户，large=200 新闻/40 计划/3 账户且走时间窗口分支；包含前一交易日行情、历史计划与已完成参考记录，确保每轮起始状态为未完成。
- [X] T005 在 `tests/helpers/review-completion-harness.mjs` 实现基线/候选隔离实例、迁移及 T004 数据装载、业务表导出和逐语句事件追踪；按阶段、表、业务键、序号定位错误，支持写入前失败和写入成功后响应丢失，保留原异常与已有 batch 语义。
- [ ] T006 在 `tests/helpers/review-completion-compare.mjs` 实现 `data-model.md` 涉及全部表的差分比较：正文、数量、关系、状态、账户值均精确比较，生成 ID 映射与时间生成/保留规则分别校验，不整体忽略元数据；将诊断输出到 `test-results/review-completion/diffs/`。
- [ ] T007 完善 `scripts/benchmark-review-completion.mjs` 的 URL/目标检查、双实例数据恢复和单 worker 浏览器测量；生产主机始终拒绝，远程仅允许明确登记的隔离测试目标；输出 samples.json/summary.json，记录首轮与后续运行，nearest-rank P95 取排序第 ceil(0.95*N) 项。
- [ ] T008 使用 `tests/helpers/review-completion-harness.mjs` 验证基线对自身业务差分为零、故障可重现、两组数据确实能完成，并运行 T007 的基线对自身测量检查；将准备结果及环境查询额度检查记入 `test-results/review-completion/preflight.json`，不以 mock 性能代替真实耗时，不自动升级付费配置。

**Checkpoint**: 测量能识别真实业务完成和界面更新；数据重置及比较可靠。环境不足时记录阻碍并停止相应性能验收，不能使用生产环境补测。

## Phase 3: User Story 1 — 更快完成每日复盘 (Priority: P1)

**Goal**: 消除完成时的重复展示工作，复用 SQL 准备过程，保持全部业务写入顺序。
**Independent Test**: 在相同种子下完成最新日期，两版业务结果一致；候选只执行一次最终列表刷新且不新增保存触发的预览；两种数据量各至少 30 对达到中位数 ≥30%、P95 ≥20% 的降幅。

### Tests for User Story 1

- [ ] T009 [P] [US1] 在 `tests/smoke/review_completion_performance.spec.js` 添加有效点击至抽屉关闭/最终列表更新的测量与网络断言，验证原保存 payload、最新编辑、校验拒绝及“保存→完成→最终刷新”顺序；确认减少中间列表和预览的断言在基线上失败，避免用固定 sleep 判定成功。
- [ ] T010 [P] [US1] 在 `tests/review_completion_contract.test.mjs` 添加原保存/完成接口成功响应与全部业务表差分，覆盖来源新闻 ID/窗口分支、空新闻、重复/空 hash、空及多账户计划、缺失行情、快照更新；先运行基线确保兼容断言通过。

### Implementation for User Story 1

- [X] T011 [US1] 在 `cloudflare/web/app.js` 给内部 `saveReview` 增加默认 false 的 `forCompletion` 选项，保留校验、payload 构建、保存和本地状态更新；仅完成模式省略保存后列表、预览和编辑器重绘，默认保存路径不变。
- [X] T012 [US1] 在 `cloudflare/web/app.js` 的 `handleNextStep` 最后一步接入完成模式，保留账户快照收集位置和成功后 reviewed→列表→关闭顺序；保留现有校验返回分支，不增加按钮锁、幂等键、请求取消或提前成功。
- [X] T013 [US1] 在 `cloudflare/worker/src/index.js` 的新闻归档、每日计划、实时计划及账户同步循环内复用同一 SQL 的 prepare，收集全部语句后按块 50 提交 `env.DB.batch()`（2026-09-20 修订，原为逐条 await run）；归档新闻的 DELETE 与 INSERT 同批，计划的尾部清理 DELETE 排在全部 UPSERT 之后；SQL、参数、过滤条件与语句相对顺序全部不变，归档时间每次统一取一次。
- [X] T014 [US1] 在 `cloudflare/worker/src/index.js` 添加计划指定 save/complete 阶段的非敏感耗时及数量记录，使用请求内 runId、finally 记录失败且重新传播原异常；不记录正文、账户值、payload，不更改外部响应或增加 D1 写入。
- [ ] T015 [US1] 完成 `scripts/benchmark-review-completion.mjs` 的基线/候选交错运行、每轮恢复和两组各 30 对统计，报告点击端到端及阶段耗时、实际数据库调用量、成功率和差分结果；prepare 复用不得被计作少写数据库。
- [ ] T016 [US1] 运行 T009/T010 与 T015，输出 `test-results/review-completion/us1-summary.json`；正常业务结果一致且两组达到 SC-001 才勾选本任务，未达标保留原始结果并明确主要瓶颈。收益以 D1 往返次数度量，不得降低门槛（批量写入已于 2026-09-20 获用户批准，见 spec.md FR-007 与 research.md R2a）。

**Checkpoint**: US1 可独立演示和计量，但不得仅凭正常路径发布；US2/US3 是整个功能的必要验收。

## Phase 4: User Story 2 — 保存和完成异常仍可按原方式恢复 (Priority: P1)

**Goal**: 成功路径变快后，失败仍保留相同业务状态与重试结果，界面能展示已保存草稿。
**Independent Test**: 各写入点执行前失败、执行成功后丢失响应、恢复重试均与基线等价；完成失败时不显示 reviewed，保存成功内容仍可见。

### Tests for User Story 2

- [X] T017 [P] [US2] 在 `tests/review_completion_failures.test.mjs` 枚举保存、默认账户初始化、每日/实时计划、新闻标记/清理/逐条归档、快照、账户更新与最终状态的写入事件，分别注入执行前失败和执行后丢响应，比较落库状态、错误类别及重试后的全表结果；加入 100 计划和 101 来源 ID 的原有超限行为测试。（2026-09-20 修订：落库状态比对由「写入前缀一致」改为「以被回滚批次的首条语句为切点，与基线执行到该批次开始前的状态一致」。）
- [ ] T018 [P] [US2] 在 `tests/smoke/review_completion_recovery.spec.js` 添加草稿保存失败、保存成功但完成失败、完成成功但列表读取失败及反馈丢失场景；验证补偿重绘/刷新不覆盖原业务错误，失败后界面草稿和重试路径与基线一致。

### Implementation for User Story 2

- [X] T019 [US2] 在 `cloudflare/web/app.js` 为完成模式的后续失败补回原保存后的编辑器展示和一次列表读取；只在本次确实保存成功后恢复，保持本地内容、原错误传递方式，不用恢复展示的异常替换完成异常。
- [X] T020 [US2] 在 `tests/review_completion_failures.test.mjs` 验证顺序写入在首项、中间项、末项故障时不新增事务回滚或后续写入，确认快照写后读取及默认账户初始化调用仍保留；通过完整数据差分证明 FR-007，发现不一致仅回退此次优化，不顺带修复既有行为。
- [ ] T021 [US2] 在 `tests/smoke/review_completion_recovery.spec.js` 加入两页面受控交错操作、连续点击及已完成后再次手动操作，对齐各业务屏障而非随机时序，证明候选未引入新幂等、缓存或覆盖语义。
- [ ] T022 [US2] 执行 T017–T021 的全部故障与恢复场景，将结果及失败注入点清单记录到 `test-results/review-completion/us2-summary.json`；业务状态、错误含义与重试结果 100% 一致且无提前成功才勾选。

**Checkpoint**: 失败显示恢复完成，所有原有持久化边界得到验证；保存失败不会新增 complete 调用。

## Phase 5: User Story 3 — 其他复盘入口保持兼容 (Priority: P2)

**Goal**: 单独保存草稿、历史手动完成及历史批量自动复盘不受提速影响。
**Independent Test**: 分别执行三个入口，对比请求、界面和数据；批量最新日期保护、从早到晚、自动回填及失败后继续均保留。

### Tests and Integration for User Story 3

- [ ] T023 [P] [US3] 在 `tests/smoke/review_completion_compatibility.spec.js` 覆盖单独保存的原刷新/预览/编辑行为、历史手动完成及已完成记录编辑；核对历史日不会按最新日规则覆盖实时计划。
- [ ] T024 [P] [US3] 扩展 `tests/smoke/batch_pending_reviews.spec.js` 验证回填保存内容、显式空块保护、日期排序、单日失败后继续、最新记录已完成和仅最新记录待处理，以及跳过响应与前端统计兼容。
- [ ] T025 [US3] 在 `tests/review_completion_contract.test.mjs` 增加真实隔离数据驱动的批量/历史完成对照，覆盖 accountSnapshot/account_snapshot、现有结构化字段别名、onlyIfPending、requireCompleteContent、autoFill、snapshot_source 与 pending/bootstrap/list 的成功/跳过/失败响应；不把仅有浏览器 mock 的结果视作持久化证明。
- [ ] T026 [US3] 执行入口兼容测试及 `tests/worker_review_list_contract.test.mjs`，将结果存入 `test-results/review-completion/us3-summary.json`；只有三类入口业务结果均与基线一致才勾选，如回归则回退引发差异的候选改动，不新增接口。

**Checkpoint**: 三个入口可分别运行验证，共享逻辑未出现回归。

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 最终整体验证与可审查报告；本任务清单不包含自动生产部署。

- [X] T027 根据实际实现更新 `specs/001-speedup-review-completion/quickstart.md` 的可执行命令、环境前提与测试说明，补齐 `tests/smoke/review_completion_recovery.spec.js`、`tests/smoke/review_completion_compatibility.spec.js` 和 `tests/review_completion_failures.test.mjs` 的运行入口；保留 40 计划成功组与 100 计划故障组的区别。
- [ ] T028 以最终候选版本执行 `specs/001-speedup-review-completion/quickstart.md` 的语法检查、全部差分/浏览器回归及两组各 30 对性能实验，复用 T015 驱动；后续代码修改后旧性能结果失效，没有匹配的隔离远程环境则明确远程验收未完成，不以本地/mock 数值替代。
- [X] T029 在 `specs/001-speedup-review-completion/validation-report.md` 记录最终源码哈希、环境、两组原始数据链接、median/P95 降幅、故障结果、接口一致性及 SC-001 至 SC-004 判定；未达标项明确 FAIL/未完成并阻断完成声明，不将业务约束改为可选。
- [X] T030 在 `specs/001-speedup-review-completion/validation-report.md` 补充发布就绪判定、旧 Worker 与静态资源整体回退步骤及上线观察指标；无迁移、无生产数据修复，部署仅在后续授权下进行，不因本清单生成而执行。

## Dependencies & Execution Order

```text
T001 → T002 → T003
                  ↓
T004 → T005 → T006 → T007 → T008
                              ↓
                 ┌─ T009 ─┐
                 └─ T010 ─┴→ T011 → T012 → T013 → T014 → T015 → T016
                              ↓（代码就绪后，US2/US3 测试可提前，不必等待性能实验完成）
                 T017 ∥ T018 → T019 → T020 → T021 → T022
                 T023 ∥ T024 → T025 → T026
                              ↓
             T016 + T022 + T026 → T027 → T028 → T029 → T030
```

- Phase 1/2 是全部用户故事的前置条件。T009 与 T010 可在 T008 后并行，完成后再修改应用。
- T017/T018、T023/T024 的测试编写可在 T008 后并行；运行候选最终验收分别依赖 US1 代码（T011–T014），US3 最终验收还需 T019 的错误恢复实现。
- T019 修改与 T011/T012 相同的 app.js，不得并行编辑；T025 与 T010 使用同一契约测试文件，串行执行。
- T013/T014 都修改 Worker，按顺序执行，不标记为并行。
- US1 与 US2 同为 P1。US1 性能未达标不妨碍完成 US2/US3 的有用验证，但 T016 和整体验收继续保持未完成。
- 兼容性测试先确认基线可通过；仅针对预期性能改变的断言在基线上应失败，不人为要求兼容断言先失败。

## Parallel Examples by User Story

- **US1**：T008 后，T009 编写浏览器请求/时序测试，T010 编写后端成功数据对照；两者文件不同，可并行。
- **US2**：T008 后，T017 编写数据库故障矩阵，T018 编写浏览器恢复场景；两者文件不同，可并行。T019 须等待前端 US1 改动结束。
- **US3**：T008 后，T023 编写单独保存/历史入口测试，T024 扩展批量入口测试；文件不同，可并行，最终执行须等待候选代码完整。

这些是后续执行安排，不要求本轮启动代理或实施任务。

## Requirements Traceability

| 需求/目标 | 主要任务 |
|---|---|
| FR-001、FR-009、SC-001 | T007–T009、T011–T016、T028 |
| FR-002、FR-003、FR-004、FR-005、FR-010、SC-002 | T004–T006、T010、T013、T025–T026 |
| FR-006、FR-007、SC-003 | T005、T012、T017–T022 |
| FR-008、SC-004 | T023–T026、T028 |
| FR-011 | T001–T008、T014–T016、T028–T029 |
| FR-012（范围边界） | T001–T003、T013、T029–T030 |

## Implementation Strategy

1. **MVP**：先做 Phase 1/2 和 US1，获得可独立演示的正常完成提速及真实数据；该 MVP 不绕过业务不变门禁，不能直接上线。
2. **安全补全**：完成 US2 的失败恢复与差分验证，然后完成 US3 的入口兼容；可提前并行编写各自测试，避免同文件冲突。
3. **最终交付**：执行完整 quickstart，记录性能与业务判定；满足全部标准才声明可交付，否则保留未完成任务和实际证据。
4. **不扩范围**：不修复既有容量上限、不变更计算/模型/权限、不自动部署。事务边界已于 2026-09-20 经用户明确批准放宽为按批提交；缓存、后台完成、并行写入仍未获批准，若需采用须重新讨论约束与目标，而不是静默放宽。

## Notes

- 共 30 项：Setup 3、Foundational 5、US1 8、US2 6、US3 4、Polish 4。
- 全部任务初始未勾选。质量清单通过不等于功能实现或性能已达标。
- 无扩展 hooks 配置；前后 hooks 按技能规则跳过。

## Implementation audit — 2026-09-18

候选已实现，尚未整体验收，也未部署。勾选按整项要求核对；已有部分证据但未满足全部要求的任务保持未勾选。

- T006：已比较全表、精确 ID、种子时间保留与生成时间格式；尚缺完整时间先后关系校验及专用 diffs 产物，不能称为完整元数据契约。
- T007/T008：本地双实例、重置、统计和自检可运行；远程恢复适配器、隔离目标及 D1 配额验证未完成。
- T009/T010：请求精简和成功差分已通过；所有编辑字段、校验拒绝、空/重复 hash 等要求尚未穷尽，部分用例仅覆盖重复来源 ID。
- T011–T014、T019：候选实现完成；四处惰性 prepare 复用没有减少数据库执行次数。
- T015/T016：本地两组各 30 对已执行；旧样本含自动化点击前等待，最终依据 click-final 目录实际点击采样。没有远程阶段/延迟证据，不以本地数字勾选远程验收。
- T017/T020：28 个写入事件各执行前/后共 56 个故障点及重试已通过，另有两项参数上限失败兼容测试。
- T018：保存失败、完成失败、列表失败、完成响应丢失后的界面和重试通过；恢复展示自身异常不覆盖原错仍需专门断言。
- T021/T022：两旧页面顺序完成及响应丢失重试通过；受控重叠交错、连续点击尚缺，不勾选全部恢复验收。
- T023–T026：单独保存、历史完成、批量持久化和最新日保护已通过；已完成记录完整编辑、全部别名/跳过统计组合尚未穷尽。
- T027/T029/T030：已记录可运行命令、真实证据、缺口及不就绪判定；报告任务完成不等于功能通过。
- T028：远程环境缺失且覆盖尚不完整，保持未完成。详见 validation-report.md。

## Implementation audit — 2026-09-20（合批改造）

用户明确批准放宽回滚范围后，按轻量 TDD 完成合批改造。任务勾选状态未变，因为门槛判定仍依赖尚未执行的远程验收。

- T013 已按合批实现更新描述。四处循环改用 `runWriteBatches`（分块 50）：归档新闻 DELETE 与 INSERT 同批；每日计划与实时计划的尾部清理 DELETE 排在全部 UPSERT 之后同批；账户同步一批。
- 实测 D1 往返 normal 119→28、large 309→31，语句执行数 125/315 不变。按阶段拆：normal 基线 save 51 次往返、complete 68 次，候选降为 11 次与 17 次。证据 `test-results/review-completion/batch-round-trips.json`。
- 故障语义断言已重定义而非放宽：harness 记录被回滚批次的首条语句 key，以该 key 为切点重跑基线，断言候选状态精确等于「基线执行到该批次开始前」的状态。56 个故障点中 48 个走此路径、8 个仍走逐条严格比对，两条分支均已验证被真实触发。「重试后与基线收敛」保持不变。
- 新增 `assertConverged`：三张整表重建表的自增主键改比名次而非绝对值（基线自身连续完成即产生 [1,2,3]→[4,5,6]→[7,8,9]）。仅用于确实产生偏移的比对点，顺序场景仍用 `assertEquivalent`。
- 新增测试：`tests/review_completion_roundtrips.test.mjs`（往返数不随条目线性增长）、`tests/review_completion_atomicity.test.mjs`（归档与实时计划批次中途失败不留破损态）。node 测试 45/45 通过。
- 修正 `tests/smoke/review_completion_recovery.spec.js` 的连续双击用例：原先逐字比对请求序列，与 T011 既定的「完成模式跳过账户影响预览」直接矛盾，从未可能通过；改为剔除预览后比对，保留「双击不改变保存与完成请求次数和顺序」这一真正契约。
- 浏览器回归 14/15 通过（`batch_pending_reviews` 需按 quickstart 先启动 8787 静态服务器，补起后 4 项全过）。
- 本地两组各 30 对已完成：normal median -16.2%/P95 -19.4%，large median -15.2%/P95 -14.2%，60 对逐对业务比较全部等价。该降幅与上一轮仅做 prepare 复用时几乎相同，说明本地 SQLite 适配器没有网络延迟、对往返削减不敏感，本地数字不能用于判定 SC-001。原始数据 `test-results/review-completion/batch-local/`。
- `review_completion_compatibility.spec.js` 的「editing an already completed review」在本机 Chrome 下超时，已用探针确认**基线与候选同样失败**，属环境问题而非本轮回归，归入 T023 未尽项；需用 Playwright 自带浏览器复跑确认。

### 远程验收 — 2026-09-20

先前判定的「出网中断」是误判：系统代理在 `127.0.0.1:1082` 正常，但 shell 缺 `http_proxy`/`https_proxy`。补上环境变量后远程验收已执行。

- **normal 组 30 对完整对照**：median 6330→1747 ms（-72.4%，门槛 30%，**PASS**）；P95 7947→2273 ms（-71.4%，门槛 20%，**PASS**）。32 对逐对业务比较全部等价。
- 阶段拆解（normal 单对）：save 1808→911 ms、complete 2413→850 ms、list 335→350 ms。列表读不在改造范围内，保持不变符合预期。
- **large 组抽样 2 对**：median 14704→2227 ms（-84.9%），方向与 normal 一致且更显著。基线 large 单次完成需 14–15 秒，`waitFor` 超时已从 30s 提到 120s。
- 之前 validation-report 里按每次往返约 28ms 外推的 3.4 秒是保守估计，实测 1.75 秒优于外推。
- T015 normal 部分达标；经用户 2026-09-20 决定，large 组**不补跑 30 对**，按抽样收尾，T016/T028 的 large 门槛不作阻塞项。

**收尾（2026-09-20，用户决定）**：large 组不补跑 30 对。理由：核心收益证据是 D1 往返次数（large 已确定性实测 309→31，与数据量无关、不受配额影响），normal 组端到端已 30 对完整达标，large 组只作抽样、不影响结论。改造已提交（`acb954a`）并部署上线（Worker Version `472c7700`）。遗留为已知限制、非阻塞：D1 免费额度当日写入行数耗尽（如需补跑 large 待 UTC 00:00 重置，按 T008 不升级套餐）、`candidate-a` 交叉对照 Worker 不可达（改用单组对照）、`editing an already completed review` 本机 Chrome 环境超时（基线与候选同样失败）。
