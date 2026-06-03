# MyFinancialAgent 全量测试用例（v1）

最后更新：2026-03-17
适用范围：`main.py`、`collect_prices.py`、`collect_news_v3.py`、`db_utils.py`、`cloudflare_ingest.py`、`cloudflare/worker/src/index.js`、`cloudflare/web/app.js`、`cloudflare/migrations/`

## 1. 测试目标与覆盖边界

- 验证“价格采集 + 新闻采集 + 日期级分析 + 复盘工作台”的完整闭环可用。
- 验证本地 SQLite 与 Cloudflare D1 两种数据路径一致性。
- 验证规则初筛、LLM 精选、复盘状态机（initialized/draft/reviewed）行为正确。
- 验证关键失败场景（超时、重试、鉴权失败、空数据、重复写入）可控且可恢复。

## 2. 测试环境矩阵

- E1：本地模式（`ENABLE_REMOTE_WRITE=false`，SQLite）
- E2：远端模式（`ENABLE_REMOTE_WRITE=true` + `INGEST_API_BASE_URL` + `INGEST_API_TOKEN`）
- E3：跳过 LLM（`SKIP_LLM=true`）
- E4：真实 LLM（`SKIP_LLM=false`，有效 `LLM_API_KEY`）

## 3. 全量测试用例

### A. 配置与启动

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| CFG-001 | `config.py` | 默认配置加载 | 无 `.env` | 启动 `python main.py full` | 使用默认配置，程序可启动 | P1 |
| CFG-002 | `config.py` | `.env` 覆盖默认值 | 设置 `LLM_MODEL_ID` | 启动新闻流程 | 日志显示生效模型为 `.env` 值 | P1 |
| CFG-003 | `main.py` | 参数模式 `full` | 无 | `python main.py full` | 执行价格+新闻两阶段 | P1 |
| CFG-004 | `main.py` | 参数模式 `hourly-news` | 无 | `python main.py hourly-news` | 仅新闻采集，`persist_summary=False` | P1 |
| CFG-005 | `main.py` | 参数模式 `close-summary` | 无 | `python main.py close-summary` | 价格采集 + 新闻汇总（不重新抓新闻） | P1 |
| CFG-006 | `main.py` | 非法 mode 拦截 | 无 | `python main.py invalid-mode` | 参数校验失败并退出非 0 | P2 |

### B. 价格采集链路

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| PRICE-001 | `collect_prices.py` | 单标的成功抓取 | 网络可用 | 调 `fetch_stock_data("MU")` | 返回含 `k_date/current_price/change_percent` | P1 |
| PRICE-002 | `collect_prices.py` | 无数据标的兜底 | 模拟空历史数据 | 调 `fetch_stock_data` | 返回 `None`，记录 warning | P1 |
| PRICE-003 | `collect_prices.py` | 前收盘涨跌幅计算 | 历史有 2+ 行 | 调 `fetch_stock_data` | `change_percent=(close-prev_close)/prev_close` | P1 |
| PRICE-004 | `collect_prices.py` | 单日数据涨跌幅退化逻辑 | 历史仅 1 行 | 调 `fetch_stock_data` | 使用 `(close-open)/open` | P2 |
| PRICE-005 | `collect_prices.py` | 批量采集含失败标的 | 至少 1 个失败 symbol | 调 `collect_all_prices()` | DataFrame 包含失败标的空值行 | P1 |
| PRICE-007 | `collect_prices.py` | Excel 导出成功 | 有 DataFrame | 调 `export_to_excel` | 生成 `output/stock_prices_*.xlsx` | P2 |
| PRICE-008 | `main.py` | 本地写库流程 | E1 | 执行价格任务 | `stock_raw` 新增数据，日志含 inserted 数 | P1 |
| PRICE-009 | `main.py`+`cloudflare_ingest.py` | 远端写库流程 | E2 | 执行价格任务 | 调用 `/api/ingest/prices` 成功 | P1 |
| PRICE-010 | `db_utils.py` | 价格去重 | 同日同 symbol 二次写入 | 连续写入两次 | 第 2 次 `ignored`，总记录不增加 | P1 |

### C. 新闻抓取与初筛

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| NEWS-001 | `collect_news_v3.py` | 新浪抓取成功 | 网络可用 | 调 `fetch_sina_finance()` | 返回列表，字段完整 | P1 |
| NEWS-002 | `collect_news_v3.py` | 财联社抓取失败容错 | 模拟页面结构变化 | 调 `fetch_cls_cn()` | 返回空列表，不抛出未处理异常 | P1 |
| NEWS-003 | `collect_news_v3.py` | 金十去重有效 | 构造重复内容 | 调 `fetch_jin10()` | 重复快讯被去重 | P2 |
| NEWS-004 | `collect_news_v3.py` | Yahoo 双路径抓取 | 网络可用 | 调 `fetch_yahoo_finance_news()` | 页面抓取 + `yfinance` 新闻合并 | P2 |
| NEWS-005 | `collect_news_v3.py` | 新闻合并去重 | 多源含重复新闻 | 调 `merge_and_deduplicate` | 按 hash 去重后数量减少 | P1 |
| NEWS-006 | `collect_news_v3.py` | 规则初筛通过 | 输入宏观/标的相关新闻 | 调 `filter_news_by_rules` | 保留并打上 `rule_passed=1` | P1 |
| NEWS-007 | `collect_news_v3.py` | 规则初筛拒绝噪音 | 输入明显噪音文案 | 调 `filter_news_by_rules` | 被过滤，不进入正式新闻池 | P1 |
| NEWS-008 | `collect_news_v3.py` | 初筛上限生效 | 输入超限候选 | 调 `filter_news_by_rules` | 仅保留前 `LLM_CANDIDATE_LIMIT` | P1 |
| NEWS-009 | `collect_news_v3.py` | 无发布时间新闻拦截 | `time/pub_date` 为空 | 写入流程 | 跳过写库，返回 ignored | P1 |

### D. LLM 精选与摘要

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| LLM-001 | `llm_client.py` | 普通非流式成功 | E5 | 调 `call_chat(stream=False)` | `success=true` 且返回文本 | P1 |
| LLM-002 | `llm_client.py` | 流式成功 | E5 | 调 `call_chat(stream=True)` | 有 `first_chunk_seconds` 与完整拼接文本 | P2 |
| LLM-003 | `llm_client.py` | 超时重试 | 模拟超时 | 调 `call_chat(max_retries>0)` | 重试至上限后返回 `success=false` | P1 |
| LLM-004 | `llm_client.py` | HTTP 错误处理 | 模拟 4xx/5xx | 调 `call_chat` | 返回失败对象，不抛未捕获异常 | P1 |
| LLM-005 | `collect_news_v3.py` | `SKIP_LLM` 降级 | E4 | 执行新闻采集 | 使用规则摘要 fallback，流程完成 | P1 |
| LLM-006 | `collect_news_v3.py` | 批处理分块 | 设置小 `LLM_BATCH_SIZE` | 执行新闻采集 | 触发多批次处理，结果合并正确 | P2 |
| LLM-007 | `collect_news_v3.py` | LLM JSON 提取容错 | 返回 fenced JSON 文本 | 调 `_extract_json_payload` | 成功解析 JSON | P2 |
| LLM-008 | `collect_news_v3.py` | LLM 异常回退 | 模拟批次失败 | 执行增强流程 | 回退 `_fallback_batch_result`，不中断全局 | P1 |
| LLM-009 | `collect_news_v3.py` | 日级摘要重算 | 窗口内有新闻 | 执行 `build_daily_summary_record` | 生成 `global/market/symbol/analysis` | P1 |
| LLM-010 | `collect_news_v3.py` | 窗口空新闻处理 | 窗口为空 | 执行 summary | 返回空摘要结构，不报错 | P1 |

### E. 数据库与去重一致性

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| DB-001 | `db_utils.py` | 初始化建表 | 清空 DB | 调 `init_database()` | 4 张核心表+索引创建成功 | P1 |
| DB-002 | `db_utils.py` | 重建数据库 | 已存在旧 DB | 调 `rebuild_database()` | 旧库删除并重建 | P2 |
| DB-003 | `db_utils.py` | 价格查询按 symbol 排序 | 数据已写入 | 调 `get_price_by_date` | 返回按 `symbol` 升序 | P3 |
| DB-004 | `db_utils.py` | 新闻 upsert 新增 | 不存在 hash | 调 `upsert_news_data` | 返回 `inserted` | P1 |
| DB-005 | `db_utils.py` | 新闻 upsert 更新 | 已存在 hash | 重复写入变更字段 | 返回 `updated` 且字段更新 | P1 |
| DB-006 | `db_utils.py` | 批量写入统计准确 | 混合 inserted/updated/ignored | 调 `upsert_news_batch` | 计数与实际一致 | P1 |
| DB-007 | `db_utils.py` | 时间窗口新闻查询 | 有跨天新闻 | 调 `get_news_by_date_range` | 边界包含且按时间倒序 | P1 |
| DB-008 | `db_utils.py` | `news_hash` 生成稳定 | 相同输入重复调用 | 调 `generate_news_hash` | 返回一致 hash | P2 |

### F. Cloudflare Ingest 客户端

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| INGEST-001 | `cloudflare_ingest.py` | 未配置远端参数拦截 | 清空 base/token | 调 `send_prices` | 抛 `CloudflareIngestError` | P1 |
| INGEST-002 | `cloudflare_ingest.py` | POST 重试成功 | 模拟前两次失败 | 调 `_post` | 第三次成功返回 JSON | P1 |
| INGEST-003 | `cloudflare_ingest.py` | POST 重试失败 | 持续失败 | 调 `_post` | 达上限后抛业务异常 | P1 |
| INGEST-004 | `cloudflare_ingest.py` | GET 拉取新闻成功 | E2 | 调 `fetch_news` | 返回 `items` 列表 | P1 |
| INGEST-005 | `cloudflare_ingest.py` | 分批发送价格 | >5 条价格 | 调 `send_prices` | 分批调用并汇总 inserted/ignored | P2 |
| INGEST-006 | `cloudflare_ingest.py` | 分批发送新闻 | >20 条新闻 | 调 `send_news` | 分批调用并汇总 inserted/updated/ignored | P2 |
| INGEST-007 | `cloudflare_ingest.py` | 初始化复盘远端调用 | E2 | 调 `initialize_review` | 返回 `{ok:true}` | P1 |

### G. Worker API（Cloudflare）

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| API-001 | Worker | 健康检查 | Worker 已启动 | `GET /api/health` | 200 且 `ok=true` | P1 |
| API-002 | Worker | CORS 预检 | 无 | `OPTIONS /api/*` | 返回允许头/方法 | P2 |
| API-003 | Worker | Ingest 鉴权失败 | 无 token/错误 token | `POST /api/ingest/prices` | 401 Unauthorized | P1 |
| API-004 | Worker | Ingest 价格写入幂等 | 相同价格重复提交 | 连续 POST | 首次 inserted，再次 ignored | P1 |
| API-005 | Worker | Ingest 新闻 upsert | 同 hash 二次提交变更字段 | 连续 POST | 第 1 次 inserted，第 2 次 updated | P1 |
| API-006 | Worker | `GET /api/news` 默认筛选 | DB 有多星级数据 | 请求不带参数 | 返回总数与默认过滤一致 | P1 |
| API-007 | Worker | 新闻 `type=major` 语义 | 有低星和不相关新闻 | `GET /api/news?type=major` | 仅 `is_relevant=1` 且 `stars>=3` | P1 |
| API-008 | Worker | 新闻关键词查询 | 有匹配标题/摘要 | `GET /api/news?keyword=...` | 只返回命中项 | P1 |
| API-009 | Worker | 新闻来源筛选 | 多来源数据 | `GET /api/news?source=sina` | 仅新浪来源 | P2 |
| API-010 | Worker | 新闻类型筛选 index | 数据混合 | `GET /api/news?type=index` | 包含 `index` 类型新闻（旧 `macro` 已迁移） | P2 |
| API-011 | Worker | 新闻星级筛选 | 有 1-5 星 | `GET /api/news?stars=1,2` | 仅返回 1/2 星 | P1 |
| API-012 | Worker | 新闻标的筛选 | 有 related symbols | `GET /api/news?symbol=MU` | `related_symbols` 含 MU | P1 |
| API-013 | Worker | 新闻详情存在 | 指定 id 存在 | `GET /api/news/{id}` | 返回 item 详情 | P1 |
| API-014 | Worker | 新闻详情不存在 | 不存在 id | `GET /api/news/999999` | 404 | P2 |
| API-015 | Worker | 待复盘列表生成 | 已有价格日和 archive 状态 | `GET /api/reviews/pending` | 返回未 reviewed 的收盘日 | P1 |
| API-016 | Worker | 复盘列表状态筛选 | 有 initialized/draft/reviewed | `GET /api/reviews?status=draft` | 仅 draft | P1 |
| API-017 | Worker | `bootstrap` 回填完整性 | 目标日存在数据 | `GET /api/reviews/{date}/bootstrap` | 含 prices/news/analysis/carryForward/draft | P1 |
| API-018 | Worker | 保存草稿 | bootstrap 后 | `POST /api/reviews/{date}` | 记录状态 `draft` 且字段落库 | P1 |
| API-019 | Worker | 标记完成 | 草稿存在 | `POST /api/reviews/{date}/complete` | 状态转 `reviewed`，`reviewed_at` 更新 | P1 |
| API-020 | Worker | 重新初始化 | 已 reviewed | `POST /api/reviews/{date}/initialize` | 内容清空，状态回 `initialized` | P1 |
| API-021 | Worker | 初始化后新闻状态回滚 | 窗口内新闻是 reviewed | 调 initialize | 窗口内 reviewed -> llm_processed | P1 |
| API-022 | Worker | 完成后新闻状态提升 | 窗口内相关新闻 | 调 complete | 窗口内相关新闻 -> reviewed | P1 |
| API-023 | Worker | review status 兼容映射 | 历史 completed/deleted | 查询 reviews | 映射为 reviewed/initialized | P2 |
| API-024 | Worker | 错误路由返回 | 未定义路径 | `GET /api/unknown` | 404 JSON 错误 | P3 |
| API-025 | Worker | 获取标的列表 | tracked_symbols 有数据 | `GET /api/symbols` | 返回 `{items:[...], total:N}`，含 index/sector/stock 分类 | P1 |
| API-026 | Worker | 按类型筛选标的 | 有多种类型标的 | `GET /api/symbols?type=stock` | 只返回 stock 类标的 | P1 |
| API-027 | Worker | 创建标的 | 合法 payload | `POST /api/symbols` body={symbol,display_name,symbol_type} | 201 返回创建项，symbol 唯一 | P1 |
| API-028 | Worker | 创建重复 symbol | symbol 已存在 | `POST /api/symbols` 相同 symbol | 409 Conflict | P1 |
| API-029 | Worker | 更新标的 | 标的存在 | `PUT /api/symbols/:id` body 包含 display_name/aliases | 返回 `{ok:true,item}` 且字段更新 | P1 |
| API-030 | Worker | 更新 sort_order | 拖拽排序场景 | `PUT /api/symbols/:id` body={sort_order:3} | 仅更新排序，其余字段不变 | P2 |
| API-031 | Worker | 删除标的（软删除） | 标的存在 | `DELETE /api/symbols/:id` | `is_active=0`，GET 列表不再返回该项 | P1 |
| API-032 | Worker | LLM 智能识别 | LLM_API_KEY 有效 | `POST /api/symbols/resolve` body={input:"美光"} | 返回 `{resolved:{symbol,yahoo_symbol,display_name,symbol_type,aliases},isDuplicate}` | P1 |
| API-033 | Worker | LLM 不可用降级 | LLM_API_KEY 无效 | `POST /api/symbols/resolve` | 返回 `{resolved:null}` 或错误，不崩溃 | P1 |
| API-034 | Worker | Yahoo 验价成功 | Yahoo 代码有效 | `POST /api/symbols/validate` body={yahoo_symbol:"MU"} | 返回 `{valid:true,latestPrice,change}` | P1 |
| API-035 | Worker | Yahoo 验价失败 | 代码不存在 | `POST /api/symbols/validate` body={yahoo_symbol:"INVALID999"} | 返回 `{valid:false,error}` | P2 |
| API-036 | Worker | bootstrap pricesByType 分组 | tracked_symbols 有数据且 stock_raw 有价格 | `GET /api/reviews/:date/bootstrap` | 返回 `prices` 为 `{usStock:[],cnStock:[],sector:[],index:[]}` 对象，兼容字段 `stock` 包含全部个股 | P1 |

### H. 前端 Web（News + Review Workspace）

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| WEB-001 | `web/app.js` | 默认打开 News 视图 | 页面可访问 | 打开首页 | News 面板激活 | P1 |
| WEB-002 | `web/app.js` | 视图切换 | 无 | 点击 `Review Workspace` | 切到复盘页 | P1 |
| WEB-003 | `web/app.js` | 新闻默认筛选 | 有新闻数据 | 首次加载 | 默认 3/4/5 星被选中 | P1 |
| WEB-004 | `web/app.js` | 新闻筛选提交 | 有过滤条件 | 提交筛选表单 | 列表刷新且请求参数正确 | P1 |
| WEB-005 | `web/app.js` | 重置筛选 | 已设置条件 | 点击重置 | 回到默认过滤 | P2 |
| WEB-006 | `web/app.js` | 新闻详情弹窗打开关闭 | 列表有行 | 点击“查看详情”再关闭 | 弹窗显示/关闭正常 | P1 |
| WEB-007 | `web/app.js` | 新闻详情字段回退 | 缺摘要/缺链接 | 打开详情 | 显示“暂无”并禁用链接 | P2 |
| WEB-008 | `web/app.js` | 待复盘 Ribbon 渲染 | 有 pending 数据 | 打开复盘页 | 卡片渲染并带状态标签 | P1 |
| WEB-009 | `web/app.js` | 打开复盘抽屉 | 有目标日 | 点击开始复盘 | 抽屉打开并显示 prices/news/analysis | P1 |
| WEB-010 | `web/app.js` | 五步流程前进后退 | 抽屉已打开 | 连续点“下一步/上一步” | 步骤切换与按钮文案正确 | P1 |
| WEB-011 | `web/app.js` | 必填步骤校验 | 清空必填文本 | 点下一步或完成 | 阻止提交并提示 | P1 |
| WEB-012 | `web/app.js` | 保存草稿 | 填写内容 | 点击保存草稿 | 状态更新为进行中（draft） | P1 |
| WEB-013 | `web/app.js` | 完成复盘 | 填完必填项 | 点完成复盘 | 状态更新为已复盘，列表刷新 | P1 |
| WEB-014 | `web/app.js` | 初始化二次确认 | 已有内容 | 点初始化并确认两次 | 清空内容且按钮状态更新 | P1 |
| WEB-015 | `web/app.js` | ESC 关闭弹层 | 弹层打开 | 按 ESC | 详情弹层/复盘抽屉关闭 | P2 |
| WEB-016 | `web/app.js` | 网络错误提示 | 模拟 API 失败 | 刷新新闻/复盘列表 | 页面显示失败文案不崩溃 | P1 |
| WEB-017 | Playwright | `tests/cases/smoke/review_ui_check.spec.js` 回归 | 本地 Worker 启动 | 执行现有 spec | 用例通过并截图产出 | P1 |
| WEB-018 | Playwright | `tests/cases/smoke/news_and_deleted_ui.spec.js` 回归 | 本地 Worker 启动 | 执行现有 spec | 用例通过并截图产出 | P1 |
| WEB-019 | `web/app.js` | 切换到标的管理页 | 无 | 点击导航中"标的管理" | 标的管理视图激活，列表加载 | P1 |
| WEB-020 | `web/app.js` | 标的列表三段分组 | tracked_symbols 有数据 | 打开标的管理页 | 大盘/板块/个股三段 section header 各自显示 | P1 |
| WEB-021 | `web/app.js` | 智能解析入口 | 无 | 输入"美光"点击智能解析 | 预览区出现识别结果 card，含 symbol/display_name/类型 | P1 |
| WEB-022 | `web/app.js` | 确认添加标的 | LLM 解析成功 | 点击确认添加 | 列表刷新，新标的出现在对应类型分组 | P1 |
| WEB-023 | `web/app.js` | 手动添加入口 | 无 | 点击"手动添加"按钮 | 预览区显示空白表单，含 symbol/yahoo_symbol/display_name/symbol_type/aliases 字段 | P1 |
| WEB-024 | `web/app.js` | 手动添加提交 | 表单已填写 | 填写表单点击"添加标的" | 标的写入，列表刷新 | P1 |
| WEB-025 | `web/app.js` | 手动添加必填校验 | symbol 或 display_name 为空 | 点击提交 | alert 提示，不提交 | P1 |
| WEB-026 | `web/app.js` | 编辑标的 | 标的存在 | 点击行编辑按钮 | 预览区显示预填表单，symbol 字段为 readonly | P1 |
| WEB-027 | `web/app.js` | 保存编辑 | 表单已修改 | 修改 display_name 点击"保存修改" | 列表该行更新 | P1 |
| WEB-028 | `web/app.js` | 删除标的 | 标的存在 | 点击删除确认 | 标的从列表消失 | P1 |
| WEB-029 | `web/app.js` | 拖拽排序 | 同类型有 2+ 标的 | 拖拽一行改变顺序 | 视觉顺序改变，PUT 请求发出更新 sort_order | P2 |
| WEB-030 | `web/app.js` | 复盘价格四段折叠 | bootstrap 有 pricesByType 数据 | 打开复盘抽屉 | 大盘/板块/美股个股/大A个股四段 details 各自显示，默认展开，折叠后显示摘要条 | P1 |
| WEB-031 | `web/app.js` | 价格区 AI 解读 | sector_impact_map 含 [大盘]/[板块]/[个股] 标记 | 打开复盘抽屉 | 每段价格区块内显示对应 AI 解读 | P1 |
| WEB-032 | `web/app.js` | 价格折叠状态持久化 | 已折叠某段 | 关闭再打开复盘 | 折叠状态与上次一致（localStorage） | P2 |

### I. 交易日与时区逻辑

| ID | 模块 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| TZ-001 | `collect_news_v3.py` | 最近收盘日计算 | 常规交易日 | 调 `get_latest_closed_trading_day()` | 返回最近已收盘 NYSE 交易日 | P1 |
| TZ-002 | `collect_news_v3.py` | 未收盘时取上一交易日 | NY 盘中时段 | 调函数 | 不返回当天未收盘日期 | P1 |
| TZ-003 | `collect_news_v3.py` | 周末回退 | 周六/周日 | 调函数 | 返回上一个周五 | P1 |
| TZ-004 | `worker/index.js` | 新闻窗口计算（含前交易日） | 目标日存在前一交易日 | 调 bootstrap | `start=T-1 16:00:00`，`end=T 16:00:00` | P1 |
| TZ-005 | `worker/index.js` | 新闻窗口无前交易日回退 | 历史数据不足 | 调 bootstrap | 使用 `subtractTradingDays` 回退 | P2 |
| TZ-006 | `collect_prices.py` | 夏令时稳定性 | DST 切换周 | 执行采集 | 不触发不存在时间异常 | P1 |

### J. 全链路 E2E 回归

| ID | 流程 | 用例描述 | 前置条件 | 操作步骤 | 预期结果 | P |
|---|---|---|---|---|---|---|
| E2E-001 | 本地全链路 | `full` 全流程（本地） | E1 | `python main.py full` | 价格/新闻/summary/Excel 全完成 | P1 |
| E2E-002 | 小时新闻任务 | 仅新闻+不写 summary | E1 | `python main.py hourly-news` | 新闻入库，`persisted_summary=false` | P1 |
| E2E-003 | 收盘汇总任务 | 价格+汇总已有新闻 | E1 | `python main.py close-summary` | 更新 `daily_news_ai_analysis` 和 archive 初始化 | P1 |
| E2E-004 | 远端写入链路 | Python -> Worker -> D1 | E2 | 跑 `full` | D1 中价格/新闻/分析可查询 | P1 |
| E2E-005 | Web 复盘闭环 | 待复盘 -> 草稿 -> 完成 | API 与前端可用 | 页面操作完整一轮 | 状态机闭环且数据可回查 | P1 |
| E2E-006 | LLM 降级链路 | LLM 不可用仍可跑通 | E4 | 跑新闻流程 | 规则摘要兜底，流程不阻塞 | P1 |
| E2E-007 | 幂等回归 | 同一天重复执行 | 任意模式 | 连续执行两次 | 重复数据被去重，业务状态稳定 | P1 |

## 4. 建议执行顺序

1. P1 冒烟：`CFG-003`、`PRICE-008`、`NEWS-006`、`LLM-005`、`DB-001`、`API-001`、`API-017`、`API-036`、`WEB-009`、`E2E-001`
2. P1 全量：执行所有 P1
3. 扩展回归：执行 P2 + P3

## 5. 通过标准（Release Gate）

- P1 用例通过率 100%
- P2 用例通过率 >= 95%
- 无数据一致性问题（去重、状态迁移、时间窗口）
- 无阻断级前端交互故障（无法查询/无法保存/无法完成复盘）
