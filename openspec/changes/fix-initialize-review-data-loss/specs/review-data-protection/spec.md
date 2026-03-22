## Overview

已完成的复盘记录（`review_status = 'reviewed'`）不可被系统自动初始化流程覆盖或清空。

## Requirements

- REQ-1：`initializeReview` 接口在执行写操作前，必须检查目标记录的 `review_status`
- REQ-2：若 `review_status = 'reviewed'`，接口必须跳过所有写操作，返回 `{ ok: true, skipped: true, reason: "already reviewed" }`
- REQ-3：Python 采集脚本在调用 `initialize_remote_review` 时，若收到 `skipped: true` 响应，应在日志中记录 warning 并正常继续，不报错
