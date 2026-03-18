# MyFinancialAgent 测试环境集成测试报告

报告日期：2026-03-16

## 1. 测试目标

本轮集成测试目标：

- 验证测试环境中的真实第三方链路是否可用
- 验证 Python -> Worker ingest -> 测试 D1 是否打通
- 验证 `daily_news_ai_analysis` 是否可被测试前端消费
- 验证复盘状态机是否可在测试环境正常流转
- 验证定时任务等价手动入口是否可执行

## 2. 测试环境说明

- 当前分支：`test`
- 测试 Worker：`my-financial-agent-test`
- 测试入口：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试 D1：`my-financial-agent-test`
- 运行时环境标识：`APP_ENV=test`
- 生产环境未参与本轮集成测试

## 3. 测试范围

本轮执行并验证了以下集成测试项：

- `INT-001` 采集到数据库闭环
- `INT-002` Ingest API 闭环
- `INT-003` `daily_news_ai_analysis` 到前端展示闭环
- `INT-004` 复盘状态机闭环
- `INT-005` 幂等与重复执行
- `INT-006` 测试前端入口可用
- `INT-007` 定时任务手动触发验证

## 4. 执行结果

### 4.1 通过项

- `INT-001`：通过
  - `main.py full` 在测试环境完成真实价格采集、真实新闻采集、真实 LLM 摘要，并成功写入测试 D1
- `INT-002`：通过
  - Python -> Worker ingest -> 测试 D1 可用
- `INT-003`：通过
  - `/api/reviews/2026-03-13/bootstrap` 返回完整价格、新闻、摘要
- `INT-004`：通过
  - `initialized -> draft -> reviewed` 状态流转可回查
- `INT-006`：通过
  - 测试前端入口可访问，复盘列表可看到目标日期并进入工作台
- `INT-007`：通过
  - `hourly-news` 可作为新闻任务手动入口，且不写 summary
  - `close-summary` 可作为收盘任务手动入口，且会生成 summary 并初始化 archive

### 4.2 部分通过项

- `INT-005`：部分通过
  - 价格链路：通过
    - 相同交易日和相同标的重复执行时，不新增重复价格记录
  - 新闻链路：按真实源口径通过
    - 真实新闻源场景下出现增量更新
    - 未发现同一 `news_hash` 重复污染
    - 结论应理解为“真实增量更新正常”，而不是“严格静态幂等”

## 5. 本轮发现并已处理的问题

### 5.1 测试 Worker 缺少 ingest 鉴权

- 问题：测试 Worker 初始未配置 `INGEST_API_TOKEN`
- 影响：`INT-001` / `INT-002` 初始被 `401 Unauthorized` 阻塞
- 处理：已为测试 Worker 配置 `INGEST_API_TOKEN`
- 当前状态：已解决

### 5.2 价格远端写入前存在非法浮点值

- 问题：价格 payload 中包含 `NaN/Inf` 类值，导致 JSON 序列化失败
- 影响：价格远端写入第一次执行失败
- 处理：已在 `cloudflare_ingest.py` 中发送前清洗为 `null`
- 当前状态：已解决

## 6. 持续观察项

- `DX-Y.NYB` 真实价格源仍会报 `'chart'`
  - 当前系统具备容错能力，不会阻断整条链路
  - 但该标的的价格采集稳定性仍需单独关注
- 真实 LLM 路径出现过一次超时重试
  - 重试后成功
  - 当前不构成阻断，但需要持续观察 LLM 超时和重试成本

## 7. 当前测试库状态

本轮完成后，测试 D1 关键表状态为：

- `stock_raw = 9`
- `news_raw_data = 18`
- `daily_news_ai_analysis = 1`
- `daily_review_archive = 2`

## 8. 风险归因

- 代码问题：
  - 价格远端写入前未清洗非法浮点值
- 环境问题：
  - 测试 Worker 缺少 `INGEST_API_TOKEN`
- 第三方依赖问题：
  - `DX-Y.NYB` 价格源不稳定
  - LLM 存在超时重试情况
- 测试口径问题：
  - 新闻链路在真实新闻源场景下不能按“静态输入严格幂等”理解，应区分真实新增与重复污染

## 9. 阶段结论

- 当前测试环境主链路已经打通
- 测试环境可用于后续继续执行集成测试和发布前验证
- 本轮结论：**有条件可继续推进**

条件如下：

- 继续关注 `DX-Y.NYB` 价格源稳定性
- 后续如需更严格验证新闻幂等，应使用固定窗口或辅助源头数据
- 发布前仍需执行对应版本的冒烟验证与发布前检查
