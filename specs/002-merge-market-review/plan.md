# 实现计划：市场复盘合并与标的化一级主题

**Git 分支**：`main`（未创建/切换分支）  
**特性标识**：`002-merge-market-review`  
**日期**：2026-10-15  
**规格**：[spec.md](spec.md)  
**输入**：已确认的 DEMO 和规格；仅规划，不实现、不部署、不修改生产数据。

setup-plan.sh 返回的 BRANCH=002-merge-market-review 是 `.specify/feature.json` 派生特性标识，实际 `git branch --show-current` 为 main；不把目录编号当作已创建 Git 分支。

## 概要（Summary）

将“大盘盘点”“大宗商品与板块轮动”合并为桌面的“市场与板块”。一级关联管理标的，二级采用六种预设及自定义；CTA 流动性/JPM collar/EPS 预计归 GSPC。US10Y 仅为 TNX 展示身份，不改变 ^TNX 采集或创建重复标的。

新增 `daily_review_symbol_levels(archive_date,symbol)` 作为当日两项价位唯一来源；归档新 JSON 只保存主题结构与冲突证据。两个入口在浏览器共用一个 symbolLevels 状态，操作计划按账户维护其他字段。旧记录 GET 时生成无损投影，首次显式保存时落新结构和价位，不批量重写历史。最新日与 live 的既有双向同步范围不变，加入共用价位和实时镜像同步。

界面参照真实操作计划表格、标的搜索和字段视觉，采用已评审的“表格总览＋右侧详情”：无重复“市场标的”分组，每标的短蓝条，不做移动端适配。

## 技术背景（Technical Context）

| 项目 | 当前事实/计划 |
|---|---|
| 语言/版本 | ES modules JavaScript，Cloudflare Workers compatibility_date=2026-03-15；Python 3 既有本地读写链路；本地 Node 支持 node:sqlite |
| 主要依赖 | 原有 Wrangler ^4.6.0、Playwright ^1.58.2；浏览器原生 DOM，无新前端框架、状态库或ORM |
| 存储 | Cloudflare D1（SQLite）；本地 SQLite/local D1验证；正式 migration 唯一入口 cloudflare/migrations |
| 测试 | node:test＋真实SQLite SQL harness；Python migration/integration；Playwright 桌面＋真实本地 Worker/D1 |
| 目标平台 | 桌面浏览器＋Worker，1440/1920 桌面窗口；移动端不在范围 |
| 项目类型 | 静态 ASSETS＋Worker API 的个人金融复盘工具 |
| 性能目标 | 不逐标的增加串行请求/DB往返；bootstrap新增查询并入已有batch；普通/大规模保存完成保留现有 normal≤7、large≤9 往返守门，不能凭推算声称耗时收益 |
| 原子性 | 单次复盘保存中的新结构、共用价位、日计划和live镜像在一个D1 batch提交；集合SQL控制语句数，不以跨100条分块假装全事务 |
| 约束 | 只读历史打开零写；明确空不回填；旧原文和冲突保留；无生产测试写入；不清理key_levels；不新增SPX/NDX/ES=F资产、不讨论行情身份改名 |
| 规模 | 只读样本146份复盘、最新七个轮动资产；计划数量和实际目录动态加载，不把最新样本写成候选硬编码 |

需要研究的存储位置、跨账户冲突、历史归属/沿用、live同步、导出、测试环境问题均已在 [research.md](research.md) 解决，无剩余澄清项。

## 宪章核对（Constitution Check）

`.specify/memory/constitution.md` 仍为含占位符的未配置模板，不能将示例原则当作有效宪章；本轮不擅自制定/修改宪章。按当前 `CLAUDE.md`、测试标准及用户已确认边界作为实际门禁。

| 门禁 | Phase 0前 | Phase 1后 |
|---|---|---|
| 仅实现本需求，无额外重构 | 通过 | 通过：仅一个共用模型模块＋必要字段链路，不改整个账户/目录体系 |
| 测试/夹具在tests，migration在cloudflare/migrations | 通过 | 通过：新增schema只由正式迁移管理；不新建初始化SQL |
| main/test环境隔离，用户授权部署 | 通过 | 通过：本轮只文档；quickstart明确local test config，无remote写命令 |
| 原有主链路测试标准 | 已读取 | 通过：quickstart按表格登记冒烟/集成方案，tasks阶段追加正式测试标准中的用例 |
| 生产数据与额度保护 | 通过 | 通过：无批量迁移历史、无生产写测，GET归并零写 |
| 规格和DEMO边界 | 通过 | 通过：桌面、标的一级、价位共用、历史保留、原UI复用一致 |
| 新旧读写与所有消费者覆盖 | 待研究 | 通过：save/bootstrap/complete/init/live/快照/导出/列表/Python均有落点 |
| 明确空与原子保存 | 待设计 | 通过：字段存在语义、删除不删价位、单batch业务事务明确 |

未发现需要违背门禁的事项。历史标准的 master 旧称采用 CLAUDE.md 当前 main/test规则，不修改配置来迁就旧文档。

## 项目结构（Project Structure）

### 本特性文档

```text
specs/002-merge-market-review/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── review-api.md
│   └── desktop-ui.md
├── quickstart.md
└── tasks.md                    # 后续speckit-tasks生成，本轮不创建
```

### 源码落点

以下新增项是后续实现规划，不代表本轮已经创建源码：

```text
cloudflare/
├── migrations/027_market_review_symbol_levels.sql  # 拟新增DDL
├── worker/src/index.js                             # 原API/DB编排
└── web/
    ├── market-review-model.js                      # 拟新增纯模型模块，Worker/浏览器共用
    ├── app.js                                     # 原页面状态与交互
    ├── index.html                                 # 合并步骤/市场详情面板
    ├── styles.css                                 # 复用原样式，仅市场局部增补
    └── zone-export.js                             # 新模型输入，原导出语义
src/db_utils.py                                    # 原本地SQL读写对齐
tests/
├── helpers/market-review-fixtures.mjs               # 拟新增正式迁移夹具
├── market_review_model.test.mjs                     # 拟新增纯模型测试
├── market_review_api.test.mjs                       # 拟新增真实SQL/API测试
├── smoke/market_review.spec.js                      # 拟新增桌面测试
├── integration/market_review_migration.py           # 拟新增空库/旧库升级验证
├── helpers/review-completion-harness.mjs            # 复用现有harness
├── review_completion_roundtrips.test.mjs            # 保留/加强守门
├── worker_review_list_contract.test.mjs             # 更新新合并内容断言
├── zone_export.test.mjs                             # 保留原导出+新输入
├── smoke/                                         # 原复盘/账户/batch/export回归
├── testdata/                                      # 夹具与本地测试配置
└── standards/                                     # 实现前更新相关注册用例
```

**结构决定**：优先在现有文件里改原入口，仅新增被两个运行时共享的确定性模型与正式migration/测试；无服务层/仓储层重构。Canvas React demo不进入部署资产。

## Phase 0：结论与证据

详见 [research.md](research.md)。核心结论：

1. 日计划表现为账户键，没有可直接复用的日期＋标的价位权威；新表必要。
2. 旧列、多个账户价位和未知历史标题确有差异，不能静默自动覆盖。字段分别取市场优先，原文冲突持久化。
3. `NULL`、明确空结构、明确空价位必须区分；不能把已保存新JSON仍用冻结旧列二次沿用。
4. 实时计划会整集回写最新归档日且不保护reviewed，本需求明确保持范围。只改价位一致性，不另加跨日政策。
5. 原source代码导出含GSPC专用模板，必须适配统一模型，不简单用通用区间替换。
6. 当前真实操作计划详情CSS为居中modal；本特性按评审选右侧面板，复用视觉而非宣称原CSS原本就是右侧。
7. 当前write helper分块100语句，单业务保存不能跨块而半写；规划集合SQL解决绑定/语句增长。
8. 当前宪章和部分Python/测试DDL文档过时；仅本链路读取正式migration并修正必要读写，不扩大为全面代码清理。

## Phase 1：数据与接口设计

### 1. 新模型与迁移

实施内容见 [data-model.md](data-model.md)：一个日期价位表、归档新JSON、快照新JSON字段。DDL-only，不UPDATE146份历史，不DROP旧证据列。

`market-review-model.js` 提供预设字面量、严格新输入检查、目录身份投影、确定性旧块归并、初始价位冲突选择、显示投影与补齐规则。只收/返回数据，禁止内部fetch/数据库/DOM；Worker控制读写，app控制界面，避免前后端各自迁移判定。

### 2. Worker保存和读取

- `getReviewBootstrap`（当前 `index.js:1349`）：把目录、日期价位和沿用候选读放入原phaseOne batch，组装marketReview与symbolLevels；日计划价位以同一映射投影。不能从已有stock_raw INNER JOIN结果当完整目录，未采价格的标的也可选。
- `getReviewByDate`（1323）：复用解析但不跨日沿用；旧raw列仍可留作证据响应。
- `saveReviewDraft`（2916）：由新marketReview聚合字段替换旧两个写入口，校验稳定id/目录/legacy原文；blocks整份替换＋levels字段补丁。新输入严格，旧DB读取容忍已有格式。
- 单个保存read batch获取必要校验材料，写stage用集合SQL并入一次batch；不按每标的追加查询。日期level更新和应更新的live镜像同提交。
- `completeReview`（3013）与getBatchReviewReadiness：合并原两组校验为一项；手动仍先save后complete；batch autoFill使用新字段并以保存后的有效结构做readiness，保留历史无参考仍能完成/最新保留规则。
- `initializeReview`（3243）：保护reviewed、新字段NULL、计划为空复制live、不写日期价位行且已有行不删。新来源默认只落目标日期。
- `createReviewSnapshots`（3386）：新JSON和当时价位一并复制，旧快照不回填；本需求没有恢复功能/GET快照新接口。
- 复盘列表主线提取（967）：读取新JSON或旧投影，不额外逐日期读价位。

契约见 [review-api.md](contracts/review-api.md)。不新增REST二级/价位端点，不双写旧列，不为旧前端维护长期兼容层。

### 3. 实时与其他消费者

- 改 live GET/CRUD、syncLatestDailyFromLive、buildReviewActionPlanStatements及live镜像入口：保持集合/日期规则；同标的显式变化字段写日期价位，非价位更新不覆盖共用值。
- 仅编辑市场最新日价位也同步live镜像，历史编辑不动live。删除任一计划/主题不删除日期价位。
- 日计划的旧price列不再当写源，live现有列承载镜像/尚无归档日期场景，key_levels不参与新模型。
- 目录所有相关响应/标的管理显示追加推导displayCode，TNX→US10Y；系统symbol/采集/news键不改，目录hard-delete后旧身份快照继续显示。
- `zone-export.js` 改输入为统一结构/价位；原GSPC支撑、负伽马、加速窄区间模板及普通压力优先规则不变。无重复从市场/多个账户再读同价位。
- `src/db_utils.py` 只调整归档、初始化、计划读写中与这次schema有关的SQL和入参；同期修正其引用已删market_sentiment/sector_rotation的问题。本地计划写入采用显式价位补丁，不用镜像恢复旧值。
- 测试夹具/历史seed生成器更新新合同；旧临时转换工具不投入线上运行或对生产执行，不顺手翻修整个Python pipeline。

### 4. 前端与桌面样式

详见 [desktop-ui.md](contracts/desktop-ui.md)。

- REVIEW_STEPS、目录、步骤面板、完整度、batch autoFill、保存payload同步删除旧rotation独立入口。
- state维护marketReview.blocks与symbolLevels；两个编辑入口共用修改函数，控制价位dirty字段。计划其他属性仍按账户归属。
- 主表五列、标题右侧工具栏、每行短蓝条、选中加深；无第二层分组标题。
- 复用现有symbol picker/type groups/tooltip/字段视觉；市场详情右侧面板，吸底区和历史冲突提示；不改现有操作计划modal位置。
- 只读两边锁定，查看零写；预设唯一、自定义标题验证、稳定id排序/删除、重复标的保护。
- 不增加移动端专属CSS或手机测试；不改别的页面布局，不引入React。

### 5. 测试策略与实施顺序

1. 先更新正式测试标准和本地夹具，新增模型/迁移失败断言；数据库从全部正式迁移构建。
2. 实施DDL＋纯模型，验证旧样本全量文字、确定性重复身份、歧义、NULL/空值、冲突字段分别选择。
3. 实施Worker完整读写/日期level/live镜像与Python必要schema适配，验证API合同、原子失败/日期隔离；相关消费者不能只修前端。
4. 实施桌面表格/详情/picker与两入口状态联动，再适配导出、列表、batch、快照。
5. 运行原回归＋新真实本地Worker/D1/Chrome冒烟，截真实成品页面给用户确认；既有normal≤7、large≤9守门不放宽。
6. 用户另行确认后才进入发布：校验分支/目标、备份、DDL迁移、同版本前后端部署；没有后台批量历史转换。发布任务必须列发布前检查和失败处理，不在本轮执行。

本阶段没有编写tasks.md，编号任务由下一步speckit-tasks据此生成。

### 6. 需求追溯

| 规格 | 设计落点/验证 |
|---|---|
| FR-001、015 | 合并step/outline/readiness/complete/batch；SM-MR-001/010 |
| FR-002～005 | 目录搜索、系统身份、严格校验/重复与更换限制；SM-MR-002 |
| FR-006～008 | 有限kind、自定义/排序/删除、GSPC维度；SM-MR-003 |
| FR-009～011 | 日期价位表、双向UI、live镜像、删除语义；SM-MR-004/005/008 |
| FR-012～014 | 旧投影、legacy原文、冲突、沿用/明确空；SM-MR-006/007、IT-MR-001/002 |
| FR-016 | TNX displayCode及identity快照，采集键不变；SM-MR-002 |
| FR-017 | 导出/list/snapshot/Python、账户其他字段回归；SM-MR-009、IT-MR-003 |
| FR-018＋桌面评审 | 真实操作计划视觉、右侧详情、无重复组、逐行短蓝条；SM-MR-001 |

## 复杂度记录（Complexity Tracking）

没有宪章例外。新增价位表用于无账户市场标的和跨账户同值，无法用单个原账户行正确替代；新增纯模型模块仅消除两个运行时的归并差异，不建立新应用层。保留旧列用于逐日无损转换与证据，不作为新写权威，也不建立旧新双写机制。

## Phase 1完成核对

- 已生成research、data-model、API/UI契约与quickstart，文档中所有设计澄清均已解决。
- 已读取CLAUDE及两份测试标准，Phase 0/Phase 1门禁通过。
- 本轮已执行旧迁移重放PASS和旧往返守门1/1通过；功能尚未实现，新用例未执行。精确计数补测被拦截，未重试、未声称有新增实测数据。
- 本轮只修改本特性规格/规划文档，不提交、不改源码/生产数据、不创建Git分支。
- Extension hooks：执行前未发现 `.specify/extensions.yml`；结束前再核对，缺失则前后hook均不执行。
- 下一步：用户确认计划后执行speckit-tasks。实现、真实页面验收和发布为后续阶段。
