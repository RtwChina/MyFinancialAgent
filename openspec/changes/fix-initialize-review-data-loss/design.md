## Context

`initializeReview` 负责在夜间任务结束后为当日复盘记录建档（新建或重置）。当前实现对"已有记录"分支无条件执行 UPDATE，将所有复盘字段清空为空字符串，不区分记录是否已被用户完成。

## Goals / Non-Goals

**Goals:**
- 已完成复盘（`review_status = 'reviewed'`）的记录不被 `initializeReview` 修改
- 日志中可观测到跳过行为（`skipped: true`）
- 用户主动"重置复盘"的操作不受影响（保留手动 force 能力）

**Non-Goals:**
- 不修改复盘完成（`completeReview`）或保存草稿（`saveReview`）的逻辑
- 不新增数据库字段或 migration

## Decisions

**Guard 位置：Worker 侧（主要）+ Python 侧（次要）**

- Worker `initializeReview`：在 UPDATE 前检查 `review_status`，若为 `reviewed` 则提前返回 `{ ok: true, skipped: true }`，不执行任何写操作
- Python `collect_news_v3.py`：在调用 `initialize_remote_review` 前，先 GET 当前记录状态，若已为 `reviewed` 则跳过调用并记录日志（防御性保护，避免 Worker 被意外绕过）
**不需要 `force=true` 参数**

前端对 `reviewed` 记录的"编辑"按钮已在 JS 层拦截，只切换 `editMode`，不调用 `/initialize` API。因此不存在合法的场景需要对 `reviewed` 记录调用 initialize，无需 force 逃生舱。

**不在 Python 侧加 GET 预检**

Python 增加预检会多一次网络请求，Worker guard 是主要保护。Python 侧收到 `skipped: true` 时打 warning log 即可，不增加额外 HTTP 请求。

## Risks / Trade-offs

- 若记录状态字段损坏（非标准值），guard 以精确匹配 `'reviewed'` 为准，其他状态仍正常执行 reset
- 若未来前端新增"强制重置已完成复盘"功能，届时再加 `force=true` 参数，不提前设计
