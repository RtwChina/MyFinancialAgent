## 1. index.html：新增设置入口与面板 DOM

- [ ] 1.1 在 Header 区域（`.site-header` 或顶部导航）新增 `<button id="settingsBtn" class="settings-btn" title="设置">⚙</button>`
- [ ] 1.2 在 `<body>` 末尾新增设置面板 HTML：`#settingsPanel`，含令牌输入框（`#tokenInput`，type=password）、眼睛图标切换按钮（`#toggleTokenVisibility`）、保存按钮（`#saveTokenBtn`）、清除按钮（`#clearTokenBtn`）、提示文案区域（`#settingsPanelReason`）

## 2. styles.css：设置面板样式

- [ ] 2.1 `#settingsPanel`：`position: fixed; top: 48px; right: 16px; z-index: 1000; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; width: 320px; display: none;`
- [ ] 2.2 `#settingsPanel.open { display: block; }`；令牌输入行（`input + button`）flex 布局，保存/清除按钮行 flex row gap
- [ ] 2.3 `#settingsBtn` 样式：无边框、透明背景、cursor pointer、hover 变色

## 3. app.js：设置面板逻辑

- [ ] 3.1 新增 `initTokenSettingsPanel()` 函数：绑定 `settingsBtn` click（toggle open）、面板外 click 关闭、眼睛图标切换明密文
- [ ] 3.2 保存按钮：读取 `#tokenInput` 值 → `setStoredAppToken()` → 关闭面板 → `showToast("令牌已保存")`
- [ ] 3.3 清除按钮：`clearStoredAppToken()` → 清空输入框 → `showToast("令牌已清除")`
- [ ] 3.4 新增 `openTokenSettingsPanel({ reason })` 函数：打开面板，若 reason 非空则在 `#settingsPanelReason` 显示提示文案；打开时将当前存储的令牌回填到输入框（若有）
- [ ] 3.5 修改 `getAppToken()`：无令牌时抛出 `Object.assign(new Error("未配置写入令牌"), { needsToken: true })`，不再调用 `window.prompt()`
- [ ] 3.6 修改 `fetchJson()`：catch 到 `err.needsToken === true` 时，调用 `openTokenSettingsPanel({ reason: authReason })`，不继续抛出（操作被静默取消，提示已在面板内）
- [ ] 3.7 修改 401 处理：`clearStoredAppToken()` + `showToast("令牌无效，请在设置中重新配置")` + 不再自动调用 `sendRequest(true)`（直接 throw）
- [ ] 3.8 在 `init()` / boot 时调用 `initTokenSettingsPanel()`；面板初始化时将 localStorage 已有令牌回填到输入框

## 4. 冒烟验证

- [ ] 4.1 无令牌状态，触发关键词写操作 → 设置面板弹出，顶部有提示，不弹 prompt
- [ ] 4.2 输入令牌保存 → toast 出现，面板关闭 → 再次触发写操作成功
- [ ] 4.3 清除令牌 → toast 出现 → 再次写操作重新触发面板
- [ ] 4.4 DevTools Console 无 JS 报错
