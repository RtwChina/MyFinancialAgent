# 冒烟测试文档规范

## 触发时机
每次代码提交、功能迭代、bug 修复、接口改动、页面交互改动、数据结构改动、定时任务改动后必须执行。

## 执行原则
- 目标是最小主链路闭环
- 必须严格按本文档用例逐条执行
- 先补文档再测：改了主链路但冒烟文档未覆盖时，必须先更新文档再执行

## 默认覆盖范围
- 核心入口启动
- 核心 API 可访问
- 核心数据库读写正常
- 关键页面基础交互
- 关键任务最小闭环
- 幂等/去重/状态迁移无明显破坏

## 用例格式

| 用例 ID | 名称 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 | 是否阻断提交 |
|---------|------|------|----------|------|----------|--------|------------|
| SM-001  |      |      |          |      |          | P0     | 是         |

## 汇报格式
每次冒烟必须输出：
- 冒烟目的
- 依据文档与用例范围
- 执行环境
- 结果清单（通过 / 失败 / 未执行）
- 失败原因
- 是否阻断提交
- 是否更新了冒烟文档

## 已注册用例

| 用例 ID | 名称 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 | 是否阻断提交 |
|---------|------|------|----------|------|----------|--------|------------|
| SM-001  | 新闻时间字段时区一致性 | 验证 news_raw_data 三个时间字段均为北京时间 | 新闻采集任务至少执行一次 | 查询 `SELECT pub_date, captured_at, created_at FROM news_raw_data LIMIT 5`，检查三字段时区一致 | 三字段均为北京时间（UTC+8），`captured_at` 与 `created_at` 差值 ≤ 5秒 | P0 | 是 |
| SM-002  | 前端新闻列表时间显示 | 验证列头显示"北京时间"提示，单条不显示 | 新闻页面可访问 | 打开新闻检索页面，检查列头和单条新闻时间格式 | 列头包含"❗(北京时间)"，单条显示"HH:MM · 来源"无"北京时间"文字 | P0 | 是 |

| SM-003  | 新闻采集多源覆盖 | 验证 AkShare 和 Finnhub 均有数据写入且字段完整 | 本地 DB 已跑 migration 009，FINNHUB_API_KEY 已配置 | 1. 运行一次新闻采集任务 2. `SELECT source, sub_source, language, COUNT(*) FROM news_raw_data GROUP BY source, sub_source, language` | 结果包含 source=akshare 的 cls/10jqka/sina/futu 四行，以及 source=finnhub 的 general/company 两行；language 列中文源为 zh，英文源为 en | P0 | 是 |
| SM-004  | 英文新闻规则初筛命中 | 验证 Finnhub 英文新闻能通过关键词初筛而非全部被过滤 | 同 SM-003 | `SELECT COUNT(*) FROM news_raw_data WHERE source='finnhub' AND rule_passed=1` | 结果 > 0（至少有部分英文新闻通过初筛） | P1 | 否 |

| SM-005  | 三策略评分正确性 | 验证 A/B/C 三种关键词评分策略均返回有效分数 | 新闻采集任务至少执行一次 | 1. 运行一次新闻采集 2. 检查 `_scoring` 字段包含 `strategy_a_score`、`strategy_b_score`、`strategy_c_score` | 三个策略分数均为数值且 ≥ 0，B 策略使用 BM25 饱和，C 策略标题加权 | P0 | 是 |
| SM-006  | Embedding 过滤及降级 | 验证 Embedding 过滤正常工作，API 失败时自动降级 | DashScope API Key 已配置 | 1. 正常运行：检查 `_embedding.decision` 字段 2. 断开 API：验证全部新闻 decision=skipped 直接进入 Stage 3 | 正常时 decision 为 pass/filter；降级时全部 skipped 且不中断流程 | P0 | 是 |
| SM-007  | 打星兜底触发 | 验证 ≥80% 五星时兜底机制自动触发 | LLM 返回结果中 ≥80% 为 5 星 | 检查 `star_fallback_triggered` 标记和 `llm_original_stars` 字段 | 兜底触发后星级重新分配，`llm_original_stars` 保留原始值，`pipeline_trace.star_fallback_triggered=1` | P1 | 否 |
| SM-008  | pipeline_trace 写入 | 验证每次采集生成完整 pipeline_trace 记录 | 远程写入已配置 | 1. 运行一次采集 2. `GET /api/pipeline-traces?date=YYYY-MM-DD` | 返回记录包含 run_id、三级漏斗数据、各阶段耗时、config_snapshot | P0 | 是 |
| SM-009  | filter_log 写入 | 验证 filter_log 记录每条新闻在各阶段的决策 | 同 SM-008 | `GET /api/filter-logs?run_id=xxx` | 返回记录包含三策略分数、embedding_similarity、llm_stars、final_decision | P0 | 是 |

| SM-010  | 关键词 API 可访问 | 验证 GET /api/screening-keywords 返回全量激活词 | migration 011 已 apply，Workers 已部署 | `GET /api/screening-keywords?active=1` | 返回数组长度 ≥ 100（seed 151 条），每条含 id/keyword/keyword_type/language/is_active/sort_order | P0 | 是 |
| SM-011  | Pipeline 从 API 加载关键词 | 验证 collect_news_v3 能从 Workers API 拉取关键词并使用 | INGEST_API_BASE_URL 已配置 | 运行 `python main.py hourly-news`（ENABLE_REMOTE_WRITE=false），检查日志 | 日志含 "[初筛] 关键词来源=API: 宏观=N词, 市场=N词..." | P0 | 是 |
| SM-012  | Pipeline 关键词 API 降级 | 验证 API 不可达时降级到 FALLBACK_KEYWORDS 且 Pipeline 正常完成 | INGEST_API_BASE_URL 配置错误 URL | 临时设置错误 INGEST_API_BASE_URL，运行 `python main.py hourly-news`（ENABLE_REMOTE_WRITE=false） | 日志含 "[初筛] 关键词来源=FALLBACK"，Pipeline 正常完成无异常 | P0 | 是 |

| SM-013  | 已复盘记录 initialize 保护 | 验证夜间任务调用 initialize 不会覆盖已完成复盘的数据 | 数据库中存在 `review_status='reviewed'` 的记录 | 1. 记录该日期的 `reviewer_news_notes` 内容 2. 调用 `POST /api/reviews/<date>/initialize` 3. 查询数据库确认字段未变更 | 接口返回 `{ ok: true, skipped: true, reason: "already reviewed" }`，数据库记录完全未变更 | P0 | 是 |

| SM-014  | Stage 3 批次拆分重试 | 验证批次失败后触发拆分重试路径，日志可观测，最终无未处理异常 | LLM API 可访问，至少一个批次发生超时或解析失败 | 1. 运行 `python main.py hourly-news` 2. 在日志中查找 `[Stage 3 重试]` 关键词 3. 确认子批次成功（`[Stage 3 重试] xxx 成功`）或降级（`[Stage 3 重试] xxx 失败，降级处理`）4. 确认 Stage 3 正常完成，无未捕获异常 | 日志包含 `[Stage 3 重试]` 行；重试批次显示 `成功` 或 `降级处理`；Stage 3 总体完成无异常 | P1 | 否 |

| SM-015  | Hash 预过滤跳过重复新闻 | 验证连续两次运行时第二次能跳过已存在新闻，减少 Stage 1-3 处理量 | 本地或远端数据库已有当日新闻，迁移 012 已 apply | 1. 运行第一次 `python main.py hourly-news` 2. 等待完成 3. 立即运行第二次 `python main.py hourly-news` 4. 检查第二次日志 | 第二次日志含 `[预过滤] 跳过已存在 N 条`，N > 0；Trace 日志中 `预过滤跳过=N` > 0；Stage 3 批次数明显少于第一次 | P0 | 是 |

| SM-016  | 新闻时间截断 | 验证采集后超龄（>24h）新闻被截断，不进入 pipeline | 无特殊前置 | 1. 运行 `python main.py hourly-news` 2. 检查日志中 `[截断]` 关键词 | `[截断]` 日志存在（丢弃数 ≥ 0，无报错）；pipeline 正常完成；Stage 3 批次数不超过 Stage 2 保留数 / 6 | P0 | 是 |

| SM-017  | Stage 3 流式写入 | 验证 LLM 批次完成后立即写入，成功批次不等待超时批次 | 无特殊前置（有 LLM 超时时效果最明显） | 1. 运行 `python main.py hourly-news` 2. 检查日志中 `[写入] batch N 条写入` 关键词出现时序 | `[写入] batch` 日志在 Stage 3 过程中陆续出现（不是全部集中在 Stage 3 结束后）；Stage 3 完成后日志含 `已在 Stage 3 过程中流式写入，跳过全量写入` | P1 | 否 |

| SM-018  | 结构化操作计划保存 | 验证复盘抽屉操作计划步骤使用结构化表格保存并可回填 | 测试库已执行 `daily_review_action_plans` 迁移，存在可打开的复盘日 | 1. 打开复盘抽屉 2. 进入“操作计划”步骤 3. 添加 `MU` 计划，填写动作、仓位、开仓/止盈/止损、支撑位、压力位和思考 4. 保存并重新请求 bootstrap | `bootstrap.actionPlans` 返回 `MU` 计划，包含 `supportLevels` 与 `resistanceLevels`；`daily_review_archive.asset_plan` 同步生成 Markdown 摘要；其他日期同标的计划不受影响 | P0 | 是 |
| SM-019  | 账户管理基础链路 | 验证账户管理页可读取和维护股票/基金账户资金字段 | 测试库已执行 `investment_accounts` 迁移并包含默认账户 | 1. 打开“账户管理”页 2. 确认 `老虎-美股`、`东方财富-国内`、`天天基金-国内` 可见 3. 编辑一个账户的总资产和可用资金并保存 4. 重新刷新账户列表 | 账户列表展示账户名称、币种、总资产、可用资金和启用状态；编辑后的资金字段可回查；不需要任何券商第三方接口 | P0 | 是 |
| SM-020  | 操作计划按账户分组 | 验证复盘抽屉操作计划按账户而不是市场分组 | 测试库已执行账户化操作计划迁移，存在可打开的复盘日 | 1. 打开复盘抽屉 2. 进入“操作计划”步骤 3. 在 `老虎-美股` 下添加 `MU` 计划 4. 在另一个账户下添加同一标的或另一个标的 5. 保存并请求 bootstrap | 页面显示账户分组标题和资金摘要；`bootstrap.investmentAccounts` 非空；`bootstrap.actionPlans` 每条包含 `accountId`；同一 symbol 可在不同账户下独立存在 | P0 | 是 |
| SM-021  | 大盘与板块自由块保存 | 验证复盘抽屉大盘盘点/板块轮动使用三层自由块保存并可回填 | 测试库已执行结构化复盘块迁移，存在可打开的复盘日 | 1. 打开复盘抽屉 2. 进入“大盘盘点”步骤 3. 新增一级块和二级块，填写正文 4. 进入“板块轮动”步骤执行同样操作 5. 保存并重新请求 bootstrap | `bootstrap.structuredNotes.marketSentiment.blocks` 与 `sectorRotation.blocks` 返回用户自由标题和正文；重开后顺序保持，不做枚举校验 | P0 | 是 |

## 文档更新时机
- 新功能进入主链路
- 主流程步骤改变
- 接口字段/状态机/数据库结构/页面交互变化
- 原有用例不再准确
