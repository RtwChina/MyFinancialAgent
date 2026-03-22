## ADDED Requirements

### Requirement: 设置面板入口
Header 区域提供 ⚙ 图标按钮，点击打开设置面板；面板外点击关闭。

#### Scenario: 点击 ⚙ 打开面板
- **WHEN** 用户点击 Header 中的 ⚙ 图标
- **THEN** 设置面板可见，包含令牌输入框和保存/清除按钮

#### Scenario: 点击面板外关闭
- **WHEN** 用户点击设置面板区域外
- **THEN** 面板隐藏

---

### Requirement: 令牌输入与持久化
输入框默认遮蔽（password），旁边有眼睛图标切换明文/密文；保存后写入 `localStorage[myFinancialAgentApiToken]`。

#### Scenario: 保存令牌
- **WHEN** 用户输入令牌后点击"保存"
- **THEN** 令牌写入 localStorage，面板关闭，页面显示 toast "令牌已保存"

#### Scenario: 清除令牌
- **WHEN** 用户点击"清除"
- **THEN** localStorage 中的令牌被删除，输入框清空，显示 toast "令牌已清除"

---

### Requirement: 无令牌时写操作引导
令牌未配置时，写操作触发设置面板打开，面板顶部显示上下文提示，不弹 `window.prompt()`。

#### Scenario: 无令牌触发写操作
- **WHEN** 用户触发需要鉴权的写操作（关键词更新/复盘保存），且 localStorage 无令牌
- **THEN** 设置面板打开，顶部显示 "「{操作名称}」需要写入令牌，请在此配置后重试。"，写操作本次不执行

---

### Requirement: 401 后令牌清除提示
API 返回 401 时，清除本地令牌并通过 toast 引导用户去设置面板，不再自动 prompt。

#### Scenario: 401 响应处理
- **WHEN** 写请求返回 HTTP 401
- **THEN** localStorage 令牌被清除，显示 toast "令牌无效，请在设置中重新配置"，不自动弹出任何对话框
