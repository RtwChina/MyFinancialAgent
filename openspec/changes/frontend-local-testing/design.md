## Context

前端页面（`cloudflare/web/`）包含 5 个主要视图：
- 复盘工作台（reviews）
- 新闻检索台（news）
- 标的管理（symbols）
- 关键词管理（keywords）
- ReadMe

用户反馈关键词管理等新功能存在 BUG，缺乏发布前的本地验证流程。

## Goals / Non-Goals

**Goals:**
- 建立 Playwright 本地测试框架，模拟用户点击操作
- 覆盖核心页面冒烟测试：导航切换、表单提交、API 响应
- 提供 mock 数据机制，支持离线测试

**Non-Goals:**
- 不做 E2E 端到端测试（需要真实后端）
- 不做视觉回归测试
- 不做性能测试

## Decisions

### 1. 测试框架选型：Playwright
- **理由**：支持多浏览器、支持 TypeScript、内置等待机制、截图功能
- **替代方案**：Puppeteer（无多浏览器支持）、Cypress（不支持多标签页）

### 2. Mock 策略：MSW (Mock Service Worker)
- **理由**：拦截网络请求，无需修改前端代码，支持 REST API mock
- **替代方案**：硬编码 mock 数据（侵入性强）、JSON Server（需要额外服务）

### 3. 测试目录结构
```
tests/frontend/
├── playwright.config.ts
├── package.json
├── mocks/
│   └── handlers.ts
├── fixtures/
│   ├── keywords.json
│   ├── symbols.json
│   └── news.json
└── tests/
    ├── navigation.spec.ts
    ├── keywords.spec.ts
    ├── symbols.spec.ts
    └── news.spec.ts
```

## Risks / Trade-offs

- **[风险]** Playwright 需要安装浏览器，首次运行较慢 → 可接受，测试稳定性更重要
- **[风险]** MSW 需要额外配置 → 使用简单 handlers，仅 mock 必要 API