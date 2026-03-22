## Context

现有令牌流程：`getAppToken()` 先查 `localStorage`，有则直接用；无则 `window.prompt()`。若 API 返回 401，则清除 localStorage 再以 `forcePrompt=true` 重新触发 prompt。Token 只在 `fetchJson` 的 `auth: true` 路径下才进入此流程（关键词写操作、复盘写操作）。

问题：`window.prompt()` 是浏览器原生弹窗，无法定制，且没有任何引导说明令牌来自哪里、如何获取。

## Goals / Non-Goals

**Goals:**
- 用设置面板替代 `window.prompt()`，提供统一的令牌配置入口
- 令牌已存储时，写操作无感知直接使用；无令牌时，引导用户去设置面板配置
- 401 时，清除令牌并显示 toast 提示，引导打开设置面板（不再自动重试 prompt）

**Non-Goals:**
- 不新增后端鉴权逻辑，Worker 端 INGEST_API_TOKEN 验证不变
- 不支持多令牌 / 令牌轮换
- 不做令牌有效性预校验（保存时不发请求验证）

## Decisions

**设置面板触发方式**：Header 右侧固定显示 ⚙ 图标，点击弹出覆盖层面板（非 modal dialog，避免层叠问题）。面板外点击关闭。

**令牌遮蔽**：输入框默认 `type="password"`，旁边放眼睛图标切换明文/密文，和常规密码输入框一致。

**无令牌时的写操作流程**：
1. `getAppToken()` 发现无令牌，抛出特殊错误 `{ needsToken: true }`
2. `fetchJson` catch 到 `needsToken`，调用 `openTokenSettingsPanel({ reason: authReason })`，在面板顶部显示提示文案
3. 用户在面板输入保存后，操作不自动重试（避免时序复杂），toast 提示"令牌已保存，请重试操作"

**401 处理**：清除令牌 + toast 提示"令牌无效，请在设置中重新配置" + 不自动弹 prompt。

**DOM 位置**：面板 HTML 写在 `index.html` `<body>` 末尾，`position: fixed`，层级 `z-index: 1000`，默认隐藏。

## Risks / Trade-offs

- 写操作需两步（打开设置保存 → 再次点击触发写操作），比原来 prompt 多一步；但比原来的 prompt 体验更清晰可控
- 面板不验证令牌有效性，用户可能保存无效令牌后再次 401；可接受，已有 401 清除 + toast 提示兜底
