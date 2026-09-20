# Implementation Plan: 完成复盘提速且保持业务逻辑不变

**Branch**: `main`（实际 Git 分支，未创建新分支） | **Date**: 2026-09-18 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-speedup-review-completion/spec.md`

## Summary

首先固定当前未提交工作区作为业务基线并建立阶段计时；重点删除手动完成流程中的一次多余列表刷新和一次只读账户影响预览。保留“保存 → 完成 → 最终刷新”的两个写入请求及所有后端写入顺序。后端仅复用循环内相同 SQL 的准备过程，保留每条 bind/run、取时、错误传播及提交边界。不以批量事务、减少归档记录或提前返回成功提速。

## Technical Context

**Language/Version**: JavaScript ES modules；开发环境 Node v26.5.0，Worker compatibility_date 2026-03-15。
**Primary Dependencies**: Wrangler（当前安装 4.73.0，包声明 ^4.6.0）、Playwright ^1.58.2；原生浏览器界面。
**Storage**: Cloudflare D1；沿用现有表和索引，无迁移。
**Testing**: node:test、Playwright、隔离 D1 行为对照、同环境浏览器耗时采样。
**Target Platform**: 现有 Cloudflare Worker 和静态网页，桌面与移动浏览器。
**Project Type**: 财务复盘 Web 应用。
**Performance Goals**: 普通组 50 新闻/20 计划/3 账户，大组 200 新闻/40 计划/3 账户；各至少 30 对，中位数降低 ≥30%、P95 降低 ≥20%。尚未测量，不能保证达到。
**Constraints**: 成功结果一致；SQL 内容、绑定参数、语句顺序、校验、新闻筛选、账户计算、实时同步均不变；不开新后台任务，不调整生产数据。事务边界已于 2026-09-20 经用户批准放宽为按批提交（批内原子、跨批可部分完成），详见 research.md R2a 与 spec.md FR-007。
**Scale/Scope**: 主路径是每天手动完成；单独保存、历史手动及批量完成作为回归范围。

## Constitution Check

- 宪章为未填写模板，不把示例规则当作批准的约束。
- 以 FR-002 至 FR-010 作为业务不变门禁；合批提交已于 2026-09-20 获用户批准，仍禁止并行写入及跨阶段数据缓存。
- Phase 0：PASS，已用源码及官方 D1 文档确定架构、接口与失败边界。
- Phase 1：PASS（设计门禁），无数据库迁移、无外部接口破坏、语句顺序不变；100 计划成功基准冲突已在 spec.md 显式修正。
- 实现/发布门禁尚未运行：全部差分测试通过且性能目标达标才可称为完成；若未达标，记录真实收益并停止发布为“已达标”。FR-007 已按用户明确批准修订为按批原子，任何进一步放宽仍须重新取得批准。

## Project Structure

### Documentation (this feature)

```text
specs/001-speedup-review-completion/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/review-completion.md
├── quickstart.md
└── checklists/requirements.md
```

`tasks.md` 由下一步 speckit-tasks 生成，本轮不创建。

### Source Code (repository root)

```text
cloudflare/web/app.js
cloudflare/worker/src/index.js
tests/worker_review_list_contract.test.mjs
tests/smoke/batch_pending_reviews.spec.js
tests/testdata/config/wrangler.test.toml
tests/review_completion_contract.test.mjs              # 待实现
tests/smoke/review_completion_performance.spec.js       # 待实现
scripts/benchmark-review-completion.mjs                # 待实现
```

**Structure Decision**: 保留现有项目结构；不引入框架、数据访问层或新服务。

## Implementation Design

### 1. 固定基线与计时

- 从当前工作区复制 Worker、完整 web 资源、迁移及测试配置至忽略的测试输出目录；生成文件 SHA-256 清单。不能用 HEAD 替代，因为当前业务基线包含未提交修改。
- 使用独立测试包装器记录保存、完成各阶段的 D1 调用数量、耗时及写入事件；包装器保留原调用返回与异常。部署版本仅记录阶段名、耗时、数量和成功失败，禁止日志记录新闻正文、资产值或输入 payload。
- 浏览器记录有效点击至 reviewed 展示且最终列表刷新结束/抽屉关闭的时长，HTTP 等待和 DOM 工作单独记录；基线和候选使用相同测量方式。
- 后端阶段：save.validate、save.draft、save.daily_plans、save.live_plans；complete.guard、complete.autofill、complete.news、complete.impact、complete.snapshot、complete.accounts、complete.status。

### 2. 手动完成专用的前端保存模式

- 为内部 `saveReview` 增加默认关闭的 `forCompletion` 选项；默认路径保持全部现有行为。
- `handleNextStep` 最后一步调用 `saveReview({ forCompletion: true })`。仍先同步当前计划编辑器、构造原 payload、等待保存成功、提交本地新增计划并更新本地 draft/计划/结构化字段。
- 完成模式跳过中间 `loadReviews()`，跳过本次保存触发的 `scheduleAccountImpactPreview(0)`，不做随后立即关闭的编辑器重绘；保留输入读取顺序，不提前收集账户快照。
- 不取消用户此前发起的独立只读请求，不新增全局按钮锁或幂等语义。现有编辑器校验与重复点击行为用差分场景固定，不夹带独立 bug 修复。
- 保存成功才发起原 `/complete`。完成成功后按原顺序更新 reviewed、本地状态、执行一次 `loadReviews()`、关闭抽屉。
- 若保存成功但完成失败，补做被省略的编辑器重绘和一次列表刷新，恢复保存后应可见的状态；刷新错误不能覆盖原完成错误。保留现有错误传递/显示方式。
- 原 `loadReviews` 会自行捕获读取错误，账户预览也是只读并自行捕获错误；删去它们不会移除原本阻止完成的业务写入或校验。无需更改后台完成响应格式。

### 3. 后端有界优化

- 新闻归档、每日计划、实时计划、账户更新循环中，相同 SQL 只 prepare 一次，收集全部语句后按块 50 提交 `env.DB.batch()`。归档新闻的 DELETE 与后续 INSERT 同批提交；操作计划的尾部清理 DELETE 排在全部 UPSERT 之后同批提交。SQL 内容、绑定参数、字段归一化与语句相对顺序不变；归档时间改为每次归档统一取一次。
- 保留 `ensureDefaultInvestmentAccounts` 的现有调用次数和位置。它包含写入，不能以“重复读取”为由删除或提前。
- 不复用两个阶段之间的账户或计划读取，不跳过快照写入后的读取，不合并新闻标记与归档，不新增读取并行。否则可能改变故障位置或并发更新可见性。
- 不改 SQL 内容、参数数目或查询结果，现有行情查询的只读 batch 原样保留。不引入跨请求缓存。
- 收益必须以 **D1 往返次数**度量，不得用 prepare 次数或本地耗时代替。实测往返 normal 119→28、large 309→31，而语句执行数 125/315 保持不变；后者是「没有增删业务写入」的核心证据，回归时须一并检查。

### 4. 差分验收与发布

- 相同初始数据分别运行基线与候选；写入事件按业务阶段、表、记录业务键和序号定位，不能只按调用总数注入故障。
- 对每条可写语句注入执行前失败、成功后响应丢失；比较完整相关表、错误类别、reviewed 状态及恢复重试。生成时间和 ID 按关系/更新规则比较，不忽略全部元数据。
- 验证接口成功、跳过及失败兼容；覆盖最新日、历史日、显式空块、重复新闻、无新闻、双账户同标的、缺失账户/行情、保存后失败、已完成后再次操作及两个页面交错操作。
- 单独保存请求/渲染行为不变；正常完成只有一次最终列表读取，不新增保存触发的预览。完成失败后列表仍可见已保存草稿。
- 测试隔离环境完成后，经后续实现请求中的发布授权发布；保存旧 Worker 版本及配套静态资源用于整体回退。无数据库回滚或迁移。
- 任一业务差异立即阻断；任何性能目标未达到则记录耗时主因，不能自行采用改变部分提交语义的写入批处理。

## Risks and Decisions

- 逐条 D1 写入仍可能占绝大部分耗时，因此本设计不承诺 30%/20% 必然可达；性能门禁是真实实验结果，达不到不能宣称已完成。
- 测试环境 D1 查询额度必须容纳现有流程（较大组需支持单次超过 50 条查询）；先校验隔离环境能力，绝不为测试升级付费配置或触碰生产数据。
- 已知既有容量限制：100 计划生成 201 个删除条件参数，来源新闻 ID 超过 100 也可能超限；保留为失败兼容用例，不属于此次修复。
