## Overview

上线前基础冒烟覆盖范围。

## Requirements

- REQ-1：SM-013 必须通过（reviewed 记录 initialize 返回 skipped，数据不变）
- REQ-2：Worker health、news list、reviews list API 返回 200 且结构正确
- REQ-3：前端复盘流程（打开复盘 → 保存草稿 → 完成复盘 → 编辑 → 退出编辑）无 JS 报错
- REQ-4：Pipeline dry-run 关键词能从 API 加载，日志无异常
- REQ-5：所有 P0 用例通过后方可执行 wrangler deploy
