## Context

Stage 1 初筛关键词（4 类共 84 个）硬编码在 `collect_news_v3.py` 的 `BASE_*` 常量中。Pipeline 通过 `_get_static_screening_base()` 读取这些常量构建 screening profile，传入 `score_news_by_rules()` 为每条新闻计算 rule_score。

当前系统已有的管理模式：`tracked_symbols` 表 + `/api/symbols` CRUD + 前端标的管理页面。关键词管理复用同样的架构模式。

Workers API 使用 `index.js` 单文件路由，D1 通过 `env.DB` 访问，前端为 `cloudflare/web/` 下的静态页面（`app.js` + `index.html` + `styles.css`）。

## Goals / Non-Goals

**Goals:**
- 全量关键词入库（D1 `screening_keywords` 表），基础词通过 migration seed
- 前端可视化管理：按类型 Tab 展示、is_active 开关、新增/删除
- Pipeline 启动时从 API 拉取生效关键词，替代硬编码
- API 不可达时降级为本地静态兜底

**Non-Goals:**
- 不做关键词权重自定义（当前 BM25 Strategy C 的权重逻辑不变）
- 不做关键词变更审计日志（仅用 `updated_at` 记录最后修改时间）
- 不做关键词导入/导出功能
- 不做 focus_topics 管理（保留为后续扩展）

## Decisions

### 1. 表名 `screening_keywords`，不用 `keyword_overrides`

全量入库后没有"覆盖"语义了，直接用描述性表名。

### 2. 表结构

```sql
CREATE TABLE IF NOT EXISTS screening_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    keyword_type TEXT NOT NULL
        CHECK(keyword_type IN ('macro', 'market', 'noise', 'symbol_context')),
    language TEXT NOT NULL DEFAULT 'zh'
        CHECK(language IN ('zh', 'en')),
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(keyword, keyword_type)
);
```

- `UNIQUE(keyword, keyword_type)`: 同一个词在同一类型下唯一，但允许"earnings"同时出现在 market 和 symbol_context
- `language`: 方便前端按中/英文分组展示
- `sort_order`: 预留排序，默认 0
- `is_active`: 禁用时设为 0，不删记录

### 3. API 端点设计（复用 `/api/symbols` 模式）

| 方法 | 路径 | 功能 | 鉴权 |
|------|------|------|------|
| GET | `/api/screening-keywords` | 查询全部（支持 `?type=macro&active=1`） | 无 |
| POST | `/api/screening-keywords` | 新增关键词 | Token |
| PUT | `/api/screening-keywords/:id` | 修改（keyword / type / is_active） | Token |
| DELETE | `/api/screening-keywords/:id` | 物理删除 | Token |

GET 端点不需要鉴权（和 `/api/symbols` 一致），Pipeline 读取时也不需要传 Token。
写操作需要 `INGEST_API_TOKEN` 鉴权。

### 4. Pipeline 集成方式

```
Pipeline 启动
    │
    ├─ GET {INGEST_API_BASE_URL}/api/screening-keywords?active=1
    │     成功 → 按 keyword_type 分组构建 profile
    │     失败 → logger.warning + 使用本地 FALLBACK_KEYWORDS
    │
    └─ profile 传入 score_news_by_rules()
```

`FALLBACK_KEYWORDS` 是一个 Python dict 常量，内容与 migration seed 数据一致，作为网络不可达时的兜底。比现有 84 个 BASE_* 常量精简为一个结构化 dict。

### 5. 前端页面

在现有 `app.js` 中新增关键词管理视图，复用 `tracked_symbols` 管理页面的 UI 模式：
- Tab 切换四种类型
- 每个类型下展示关键词列表，带 is_active toggle
- 顶部输入框 + 语言选择 + 添加按钮
- 删除按钮（物理删除用户添加的词，基础词只能禁用不能删）

基础词与用户添加词的区分：seed 数据 `sort_order = 0`，用户添加的 `sort_order = 100`。前端可据此区分展示。

## Risks / Trade-offs

- **[API 延迟]** → Pipeline 启动时多一次 HTTP 请求（< 200ms），可接受。超时设 5s，失败降级。
- **[Seed 数据与兜底不同步]** → 如果后续在 D1 中改了基础词但忘记更新 Python 兜底常量，降级时会用旧词表。→ 可接受风险，降级场景极少发生。
- **[误删基础词]** → 前端区分基础词（只能禁用）和用户词（可删除），降低误操作风险。
