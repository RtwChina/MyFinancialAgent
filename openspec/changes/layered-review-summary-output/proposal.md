## Why

当前复盘页已经可以展示 `每日新闻总结 / 市场影响 / 逻辑链` 三个区块，但仍存在两个明显问题：

1. **重复较多**  
   日期级 summary 现在由大盘桶、板块桶、个股桶并行生成，再由程序拼装。由于三个桶当前输出职责重叠，常常会围绕同一条宏观主线重复表述，导致用户感觉“写了很多，但其实在反复说同一件事”。

2. **层级不够直观**  
   前端页面上很难一眼分辨每条内容究竟在讲：
   - 大盘
   - 板块
   - 个股

同时，三个区块的展示语法也不够清晰，`每日新闻总结`、`市场影响`、`逻辑链` 目前视觉风格过于接近，用户不容易快速建立“结论层 / 影响层 / 推导层”的阅读节奏。

需要把这个问题作为一个单独 change 处理：

- 上游通过**三桶职责重分配**减少重复
- 下游通过**统一层级标签 + 区块级展示语法**提升可读性

## What Changes

- 重新定义三个日期级 summary 桶的职责：
  - 大盘桶：主要负责“当天主线”
  - 板块桶：主要负责“板块影响”
  - 个股桶：主要负责“标的催化与个股逻辑”
- 调整三桶 prompt，使它们少说重叠内容，避免都在重复宏观主线
- 要求 `daily_major_events`、`sector_impact_map`、`linkage_logic_chain` 三个区块中的每一条都显式带层级标签：
  - `[大盘]`
  - `[板块]`
  - `[个股]`
- 统一复盘页前端展示格式：
  - `每日新闻总结`：保留 `# 1. [大盘] ...` 风格
  - `市场影响`：改为 `1. [大盘] ...` 风格
  - `逻辑链`：改为 `1. [大盘] ...` 风格
- 保持三桶并行生成架构，不引入新的“第 4 次总汇总 LLM”

## Capabilities

### New Capabilities
- `bucketed-summary-responsibilities`: 定义大盘/板块/个股三桶在日期级 summary 中的职责边界
- `review-summary-display-format`: 定义复盘页三个 summary 区块的层级标签与编号样式

## Impact

- `/Users/didi/Project/MyFinancialAgent/src/collect_news_v3.py`
  - 调整三桶 prompt 的职责边界
  - 调整最终拼装逻辑，减少跨桶重复

- `/Users/didi/Project/MyFinancialAgent/cloudflare/worker/src/index.js`
  - 需要保证 summary 文本进入前端前保持层级标签

- `/Users/didi/Project/MyFinancialAgent/cloudflare/web/app.js`
  - 调整三个区块的渲染语法
  - `每日新闻总结` 使用 `# 1.` 风格
  - `市场影响` / `逻辑链` 使用普通 `1.` 风格

- 用户体验
  - 复盘页内容更短、更分层
  - 重复减少
  - 用户能一眼看出每条是在讲大盘、板块还是个股
