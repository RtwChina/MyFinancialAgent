## Why

上线前的冒烟测试目前只验证了 API 结构，本地数据库为空，从未真实跑过采集任务。这意味着：新闻写入、复盘初始化 guard、pipeline trace 写入、前端展示都没有经过真实数据验证。上线前必须在本地用真实数据跑通两个定时任务（hourly-news + close-summary），并验证数据从采集到前端展示的完整链路。

## What Changes

- 本地运行 `python main.py hourly-news`（ENABLE_REMOTE_WRITE=true，写入本地 wrangler dev）
- 本地运行 `python main.py close-summary`（价格采集）
- 验证新闻写入、复盘初始化、pipeline trace 写入均正常
- 验证前端新闻列表、复盘流程可正常操作真实数据
- 确认 `fix-initialize-review-data-loss` 的 guard 在真实采集链路中生效

## Capabilities

### New Capabilities
（无，纯测试执行）

### Modified Capabilities
（无）

## Impact

- 仅本地环境，ENABLE_REMOTE_WRITE=true 写入 wrangler dev 的本地 D1
- 不影响生产数据库
- 若发现 bug 需先修复再上线
