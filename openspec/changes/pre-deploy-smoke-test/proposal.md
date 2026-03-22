## Why

`fix-initialize-review-data-loss` 修复了一个严重的数据丢失 bug，同时清理了 `draft` 状态死代码。上线前需要在本地环境对主链路做一次完整的基础冒烟验证，覆盖：复盘数据保护（新增 guard）、前端交互（编辑/保存/完成复盘）、采集 pipeline（关键词加载、新闻写入、pipeline trace），确认无回归后再部署 Worker 到生产。

## What Changes

- 按 `tests/standards/smoke-test.md` 执行 SM-001 ～ SM-013 中与本次改动相关的全部用例
- 重点验证：SM-013（已复盘 initialize 保护）、复盘流程前端交互、Worker API 核心端点
- 通过后执行 `wrangler deploy` 上线

## Capabilities

### New Capabilities
（无，本次为测试执行，不新增系统能力）

### Modified Capabilities
（无）

## Impact

- 仅验证，不改动生产代码
- 若发现回归，在本 change 的 tasks 中记录并修复后重测
