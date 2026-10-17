# 本地验证指南：市场与板块

**日期**：2026-10-15  
**阶段**：规划。新增 migration 和功能测试尚未实现，下列新用例/命令要在实现后执行，不能把当前 DEMO 通过当成生产功能通过。

## 一、前置与边界

- 已安装仓库现有 Wrangler、Playwright，Node 支持 `node:sqlite`，有 Python 3 与本地 Chrome。
- 完整应用使用 Worker 的 ASSETS + 本地 D1，不使用 Canvas 预览代替真实页面测试。
- 使用 `tests/testdata/config/wrangler.test.toml`：APP_ENV=test、数据库名 my-financial-agent-test；所有测试/夹具放 `tests/`。
- 只使用 `--local`；禁止 `--remote`、生产复盘 POST、生产夹具重置或线上自动写基准。此指南不执行部署。
- 实现前将本指南用例按 `tests/standards/smoke-test.md` 格式登记，并按 `tests/standards/integration-test.md` 登记完整链路；更新旧 SM-021/SM-026/SM-028 及关联用例，不能保留对旧两个步骤的错误断言。

## 二、启动真实本地链路

从仓库根执行（以下步骤只在实现阶段执行）：

```bash
npx wrangler d1 migrations apply my-financial-agent-test --local \
  --config tests/testdata/config/wrangler.test.toml \
  --persist-to tests/.wrangler-state/market-review

npx wrangler dev --local \
  --config tests/testdata/config/wrangler.test.toml \
  --persist-to tests/.wrangler-state/market-review --port 8787
```

测试夹具执行 SQL 使用相同 config、数据库名、persist-to；不得让脚本硬编码另一数据库/local state。`GET http://127.0.0.1:8787/api/health` 应返回环境 test。只有确认环境后才能执行本地 POST 夹具。

数据准备由实现阶段的 `tests/helpers/market-review-fixtures.mjs` 和对应本地 D1加载工具负责，工具名和参数随 tasks 固化；本轮不生成测试 SQL或批量脚本。夹具构造以下内容即可：

- 两个账户含同日 SOXX，价位彼此不同；市场旧笔记有第三份 SOXX 价位。
- 最新日 D、已完成旧日 H、更早的两组非空来源和一个空中间日；另有明确 `[]` 的目标日。
- GSPC 旧动态标题含 CTA/JPM collar/EPS/国债，轮动七个标的及“市场广度”“存储/光通信”未关联一级。
- 没有行情的新候选、停用历史标的、TNX、已存 `key_levels`。
- GSPC 支撑/负伽马/加速下跌模板；QQQ、MSFT 普通区间和无效行。
- 已迁移/未迁移日、重复标的一级和重复二级预设、首次明确空价位。

## 三、桌面冒烟用例

| 用例 ID | 名称 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 | 是否阻断提交 |
|---|---|---|---|---|---|---|---|
| SM-MR-001 | 合并桌面入口 | 验证结构与真实风格 | 本地 Worker与夹具 | 打开新空日期 E 检查步骤/目录/表格（US1）；再打开含旧笔记的 D 复盘点 SOXX（US4） | 只有市场与板块；无重复市场标的分组；每标的短蓝条；详情在右侧，真实按钮字段风格一致 | P0 | 是 |
| SM-MR-002a | 标的选择（US1） | 唯一身份与搜索 | 新空日期 E，目录含候选 | 新建 MU；区分 GSPC/SPY；重复 SOXX；尝试更换有价位二级的 SOXX | 初始三二级存在；重复不覆盖并定位；更换拒绝 | P0 | 是 |
| SM-MR-002b | 标的选择（US3/US5） | 共用价位带入与 US10Y | 日期 D，目录含 TNX | 搜 US10Y 选 TNX；新建已有共用价位的标的 | TNX 身份不变、US10Y 可见；初始支撑/压力带出共用值 | P0 | 是 |
| SM-MR-003 | 二级编辑 | 预设唯一和自由文本 | GSPC 主题存在 | 添加预设/自定义、空标题保存、调整顺序、重开 | 预设禁重、custom空标题拒绝；CTA/collar/EPS正确归属；正文顺序保持 | P0 | 是 |
| SM-MR-004 | 双向价位 | 两入口跨账户一致 | 两账户有SOXX | 市场改支撑；计划改压力；保存重开 | 两入口两账户一致；动作/仓位/计划思考不变；H 不变 | P0 | 是 |
| SM-MR-005 | 删除与明确空 | 不丢价位/不复活 | 有价位与主题 | 删除市场二级/一级，保存；清空字段；再仅改仓位/排序 | 计划价位保留；明确空保持；老镜像不恢复已删结构或旧价位 | P0 | 是 |
| SM-MR-006 | 旧内容只读 | 无损/零写查看 | 旧H已reviewed | 对照标题正文；点查看与进入编辑；删/关联未匹配块 | 查看零写；未匹配原文只读；可删除/关联；没有新建历史自由一级 | P0 | 是 |
| SM-MR-007 | 首次冲突 | 原文可追溯 | 市场与账户价位不同 | 首开、编辑查看冲突、保存重开、再次改价位 | 市场优先；未采用原文保留；后续用权威值不反复归并 | P0 | 是 |
| SM-MR-008 | 实时与日计划 | 现有同步且一致 | D为最新 | 账户页改SOXX支撑、另账户改仓位、删plan；H改价位 | 最新D共用值同步；非价位不覆盖；删plan保留市场/价位；H不动live | P0 | 是 |
| SM-MR-009 | 导出画线 | 原模板与普通区间保留 | 区间夹具 | 复盘及账户页导出，检查GSPC和QQQ/MSFT | 标普模板/负伽马/CTA窄区间保留；普通区间压力优先且去重；无效行跳过 | P0 | 是 |
| SM-MR-010 | 保存完成 | 正常与批量完成守门 | 日/历史草稿 | 正常保存完成；批量处理历史，最新不处理 | 合并校验；已存空不回填；状态、新闻归档、账户快照回归通过 | P0 | 是 |

桌面在 1440×1000、1920×1080 检查详情全部字段、工具栏、吸底区和长中文正文；无移动端用例。收集真实页面截图、控制台错误、网络请求和本地数据库结果；不能仅凭 TypeScript/语法检查报验收成功。

## 四、集成用例

### IT-MR-001：旧结构 → GET 投影 → 首次保存 → 再编辑

**前置条件**：正式 migration 001–027 重放到 SQLite/本地 D1，已准备旧两组和账户价位。

| # | 步骤 | 预期 |
|---|---|---|
| 1 | 保存 GET 前各表行快照，调用 bootstrap/date GET | 新投影正确，所有表行前后完全相等 |
| 2 | 遍历所有旧标题、二级正文、数值和区间 | 新投影或历史原文中仍能找到全部文本，无模糊绑定 |
| 3 | 提交新 marketReview，带 SOXX 一个价位补丁 | 新 JSON 和日期价位原子写入；旧列原文不变 |
| 4 | 请求两入口，同标的多账户回查 | 每字段唯一，非价位字段不变；冲突原文持久化 |
| 5 | 删除/清空/只改计划仓位/重复保存 | 删除不连带丢价位；明确空不回填；不重新归并或复活主题 |
| 6 | 日期H与D交叉操作 | H不改D或live；最新D按现有范围同步 |

### IT-MR-002：沿用、初始化与批量处理

覆盖新旧混合历史、两旧来源日期不同、空中间日、当前显式空、新日只复制活跃 live 标的、已reviewed初始化保护、batch只处理历史和失败重试。必须构造“旧market日期 > 新统一基线日期 > 旧rotation日期”：较新market替换对应来源组，新基线rotation和无旧来源的新建主题保留；基线冻结旧列不得参与。来源日不写回，目标日首次保存落本日价位；保存后的合并结构用于校验。

另验证首次live编辑“市场500/计划480/本次改510”：保存证据为采用500、未采纳480，当前共用值为510；无归档日时两账户旧值不同的GET按账户顺序投影一致且所有表零写。

### IT-MR-003：真实 SQL 与原子失败

在正式迁移数据库上调用真实 Worker handler，不 stub业务数据/绕过数据库：

- 集合 json_each UPSERT/成员删除与参数边界正确；正常/大规模计划数量下不跨批半写。
- 通过本地数据库真实约束或事务故障让写 batch 失败，检查所有相关表恢复原状，接口未宣称成功；不可构造的故障分支用代码审查并明确证据限制。
- POST snapshot 复制当时价位，之后修改当前值不影响快照；旧快照不自动回填。
- Python archive读写、日计划读写与真实迁移 schema一致，不使用已删除text列。

## 五、实现后的自动验证命令

已有回归入口：

```bash
npm run check:worker
npm run check:web
node --test tests/review_completion_contract.test.mjs \
  tests/worker_review_list_contract.test.mjs \
  tests/zone_export.test.mjs \
  tests/review_completion_roundtrips.test.mjs
python3 tests/integration/migrations_fresh_replay.py
```

规划新增测试文件（尚不存在，待 tasks/实现创建）与执行入口：

```bash
node --test tests/market_review_model.test.mjs tests/market_review_api.test.mjs
python3 tests/integration/market_review_migration.py
BASE_URL=http://127.0.0.1:8787 \
  npx playwright test tests/smoke/market_review.spec.js --workers=1
```

新增 smoke 的本地 SQL工具读取测试配置与persist-to，不只是设置 BASE_URL。旧 live CRUD、review_edit_cycle、batch_pending_reviews、action_plan_zone_export 也要回归；其中硬编码数据库名/state 的部分先改为测试配置再运行，不能借 BASE_URL 把 API 与 SQL 指向两个环境。

性能沿用现有 normal≤7、large≤9 守门，先在新增真实价位夹具下证明上界仍成立，不能仅放宽断言。此轮规划已执行的旧迁移/旧往返守门通过，不等于这些新测试已执行。

## 六、结果与发布前检查

冒烟报告按标准输出：目的、依据/用例、环境、通过/失败/未执行列表、失败原因、是否阻断提交、文档是否更新。对新功能当前状态应写“未执行：待实现”，而非 DEMO成功即验收。

发布为后续显式授权操作，本轮只列检查：

- [ ] 所有主链路用例通过，桌面真实截图已让用户确认。
- [ ] schema重放、历史升级、空值、冲突、日期隔离与快照覆盖通过。
- [ ] D1批次/绑定参数/原子回滚与性能守门通过，未用生产测试填充。
- [ ] 比较变更范围，仅新增正式migration、必要后端/前端与测试；无新UI框架或目录分类重构。
- [ ] 明确新API/前端同版本发布，旧前端遇旧字段错误提示刷新。
- [ ] 实际发布分支按 CLAUDE.md main/test边界，先确认目标和备份；迁移仅DDL，无历史批量写回。
- [ ] 生产迁移、部署、提交、push均需用户另行授权；不执行本指南中未列出的远程操作。
