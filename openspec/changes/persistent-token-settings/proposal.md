## Why

每次打开生产页面进行写操作（关键词管理、复盘编辑）时，`window.prompt()` 会强制弹出浏览器原生对话框要求输入令牌，即使 localStorage 中已有存储值（因 401 被清除后触发重新输入）。这个交互极差——原生 prompt 无法定制样式，也没有"记住令牌"的引导，导致用户每次切换设备或清除缓存后都要重新输入，且不知道去哪里配置。

## What Changes

- 在页面 Header 区域新增**设置图标（⚙）**，点击后弹出设置面板
- 设置面板包含「写入令牌」输入框，支持查看（眼睛图标切换 show/hide）、保存、清除
- 令牌保存至 `localStorage`（key: `myFinancialAgentApiToken`，与现有逻辑一致）
- `getAppToken()` 改为：无令牌时打开设置面板而非 `window.prompt()`；401 时主动清除令牌并提示用户去设置面板重新配置
- 移除所有 `window.prompt()` 调用

## Capabilities

### New Capabilities
- `token-settings-panel`: 前端设置面板——令牌输入、保存、清除、show/hide；替代 window.prompt 的令牌录入入口

### Modified Capabilities
（无 spec 层级变更，鉴权 Worker 逻辑不变）

## Impact

- `cloudflare/web/app.js`: 新增 `initTokenSettingsPanel()`，修改 `getAppToken()`
- `cloudflare/web/index.html`: 新增设置图标按钮 + 设置面板 DOM
- `cloudflare/web/styles.css`: 设置面板样式
- Worker 鉴权逻辑不变
