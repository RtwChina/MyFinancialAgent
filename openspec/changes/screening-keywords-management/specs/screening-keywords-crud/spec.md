## ADDED Requirements

### Requirement: D1 存储全量初筛关键词

系统 SHALL 在 Cloudflare D1 中维护 `screening_keywords` 表，存储所有初筛关键词。每条记录包含 keyword、keyword_type（macro/market/noise/symbol_context）、language（zh/en）、is_active 状态。基础词通过 migration seed 写入。

接口分类：A 类（可控）— D1 数据库，通过 Workers API 访问。

#### Scenario: 初始 seed 后数据完整
- **WHEN** migration 011 执行完成
- **THEN** `screening_keywords` 表 SHALL 包含全部 84 个基础词，所有记录 `is_active = 1`，`sort_order = 0`

#### Scenario: 关键词唯一约束
- **WHEN** 尝试插入与现有记录相同 `keyword + keyword_type` 的记录
- **THEN** 数据库 SHALL 拒绝插入（UNIQUE 约束）

### Requirement: Workers API 提供关键词 CRUD

Workers API SHALL 提供 `/api/screening-keywords` 端点，支持查询、新增、修改、删除操作。GET 请求无需鉴权，写操作 SHALL 校验 `INGEST_API_TOKEN`。

接口分类：A 类（可控）— 自有 Workers API。

#### Scenario: 查询全部生效关键词
- **WHEN** `GET /api/screening-keywords?active=1`
- **THEN** 返回所有 `is_active = 1` 的关键词列表，按 `keyword_type` 分组

#### Scenario: 按类型筛选
- **WHEN** `GET /api/screening-keywords?type=macro`
- **THEN** 仅返回 `keyword_type = 'macro'` 的记录

#### Scenario: 新增关键词
- **WHEN** `POST /api/screening-keywords` 携带 `{ keyword: "DeepSeek", keyword_type: "market", language: "en" }` 和有效 Token
- **THEN** 新记录 SHALL 写入 D1，`is_active = 1`，`sort_order = 100`

#### Scenario: 新增重复关键词
- **WHEN** `POST /api/screening-keywords` 携带已存在的 keyword + keyword_type 组合
- **THEN** 返回 409 Conflict 错误

#### Scenario: 禁用关键词
- **WHEN** `PUT /api/screening-keywords/:id` 携带 `{ is_active: 0 }` 和有效 Token
- **THEN** 该关键词 `is_active` SHALL 更新为 0，`updated_at` 更新为当前时间

#### Scenario: 删除关键词
- **WHEN** `DELETE /api/screening-keywords/:id` 携带有效 Token
- **THEN** 该记录 SHALL 从数据库物理删除

#### Scenario: 无 Token 写操作被拒
- **WHEN** `POST/PUT/DELETE` 请求未携带有效 Token
- **THEN** 返回 401 Unauthorized

### Requirement: 前端关键词管理页面

前端 SHALL 提供关键词管理界面，支持按 keyword_type Tab 切换查看、toggle is_active、新增关键词、删除用户添加的关键词。

接口分类：A 类（可控）— 自有前端页面。

冒烟用例触发条件：打开关键词管理页面，能看到四个 Tab 和关键词列表。

#### Scenario: 按类型 Tab 展示
- **WHEN** 用户打开关键词管理页面
- **THEN** 页面 SHALL 显示 macro / market / noise / symbol_context 四个 Tab，默认展示第一个 Tab 的关键词列表

#### Scenario: 切换 is_active
- **WHEN** 用户点击某个关键词的 is_active 开关
- **THEN** 前端 SHALL 调用 `PUT /api/screening-keywords/:id` 更新状态，列表即时刷新

#### Scenario: 新增关键词
- **WHEN** 用户在输入框输入关键词、选择语言、点击添加
- **THEN** 前端 SHALL 调用 `POST /api/screening-keywords` 创建记录，成功后列表刷新显示新词

#### Scenario: 删除用户添加的关键词
- **WHEN** 用户点击 `sort_order >= 100` 的关键词的删除按钮
- **THEN** 前端 SHALL 调用 `DELETE /api/screening-keywords/:id` 物理删除

#### Scenario: 基础词不可删除
- **WHEN** 关键词 `sort_order = 0`（seed 基础词）
- **THEN** 前端 SHALL 不显示删除按钮，仅显示 is_active 开关
