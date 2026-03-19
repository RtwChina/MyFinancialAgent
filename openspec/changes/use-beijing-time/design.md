## Context

系统时间戳（`updated_at`、`captured_at`、`reviewed_at`）由 Worker（JS）和 Python 脚本分别写入，当前均使用 UTC。用户主要在北京时区工作，希望直接读时间戳不需换算。

## Goals / Non-Goals

**Goals:**
- Worker `isoNow()` 改为 UTC+8 字符串
- Worker `todayDate()` 改为 UTC+8 日期
- Python 侧写入时间戳统一改为 UTC+8

**Non-Goals:**
- 不修改 `k_date`、`archive_date`、`pub_date` 等业务日期
- 不回填历史数据
- 不修改 D1 schema

## Decisions

### Worker：手动 +8 偏移

JS 没有内置时区库，`Intl.DateTimeFormat` 可用但输出格式不稳定。采用最简方案：

```js
function isoNow() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}
```

`todayDate()` 同理，用偏移后的 Date 取 `.toISOString().slice(0, 10)`。

### Python：`datetime.now(tz=ZoneInfo("Asia/Shanghai"))`

Python 3.9+ 内置 `zoneinfo`，无需额外依赖。格式化为 `%Y-%m-%d %H:%M:%S`。

抽取为统一工具函数 `now_cst()` 放在 `db_utils.py` 或各脚本顶部，替换所有 `datetime.utcnow()` / `datetime.now()` 写入点。

## Risks / Trade-offs

- **存量数据混时区** → 历史记录是 UTC，新记录是 UTC+8；不回填，接受混用。若后续需区分，可通过时间段判断（早期数据均早于本次上线时间）
- **夏令时** → 北京时间不调夏令时，UTC+8 固定偏移，无风险
- **Cloudflare Workers 环境** → `Date.now()` 返回 UTC epoch，手动 +8 可靠
