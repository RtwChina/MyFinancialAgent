## Why

夜间采集任务每次运行时无条件调用 `initializeReview`，该接口对已有复盘记录执行无差别 UPDATE，清空所有内容（包括用户已填写的复盘文字、市场情绪、操作计划等），不检查当前 `review_status`，导致已完成复盘（`reviewed`）的数据被静默丢失。

## What Changes

- `initializeReview`（Worker）：新增 guard，若当前记录 `review_status = 'reviewed'`，则跳过清空操作，直接返回，不修改任何字段
- `collect_news_v3.py`：`initialize_remote_review` 调用前增加 guard，若当前记录已为 `reviewed` 状态则跳过（双重保护）
- API 响应增加 `skipped: true` 字段，方便日志追踪

## Capabilities

### New Capabilities
- `review-data-protection`: 复盘数据不可被夜间任务覆盖——已完成复盘（`reviewed`）的记录对 `initializeReview` 免疫

### Modified Capabilities
（无 spec 层面的行为变更，仅修复错误行为）

## Impact

- `cloudflare/worker/src/index.js`：`initializeReview` 函数
- `src/collect_news_v3.py`：`persist_summary` 分支
- 不影响前端手动触发"重置复盘"的流程（用户主动操作时应绕过此 guard，或单独提供 `force` 参数）
