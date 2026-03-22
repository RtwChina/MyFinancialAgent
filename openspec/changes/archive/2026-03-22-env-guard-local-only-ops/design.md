## Context

当前代码有两条并行的"是否本地"判断：
- `use_remote = ENABLE_REMOTE_WRITE and is_remote_write_configured()` → 控制写哪个后端
- `context.app_env` → 控制运行环境语义

两者不等价：`app_env=test` + `ENABLE_REMOTE_WRITE=true` 在现有代码里会走 remote 路径，但 rejected_news 写本地的条件是 `app_env == "local"`，导致 test 环境下本地写也不执行。

## Goals / Non-Goals

**Goals:**
- 统一"本地专属操作"的判断为 `app_env in ("local", "test")`
- `prod` 环境下永远不触碰本地 SQLite
- `test == local`：两者在本地专属操作上行为完全一致

**Non-Goals:**
- 不改变 `use_remote` 的含义（它仍控制写 D1 还是本地）
- 不重构整个写入路径，只修正本地专属操作的守卫条件

## Decisions

**新增 `is_local_env(context)` helper**（放在 `context.py`）：
```python
def is_local_env(context: ExecutionContext) -> bool:
    return context.app_env in ("local", "test")
```

所有"本地专属"操作（写本地 SQLite、`init_database`、`save_daily_news_ai_analysis`、`initialize_archive_record`）改用此 helper 守卫，而非 `not use_remote`。

**写入路径区分**：
- 写哪个后端（D1 vs 本地 SQLite）：继续用 `use_remote`
- 是否执行本地专属操作（rejected 写本地、初始化本地 DB）：改用 `is_local_env(context)`

`main.py` 和 `collect_prices.py` 的价格写入路径：`else` 分支（写本地）加 `is_local_env(context)` 守卫，不符合时抛出明确错误而非静默写本地。

## Risks / Trade-offs

- `test` 环境如果配置了 `ENABLE_REMOTE_WRITE=true`，仍会写 remote D1（这是预期行为），但本地 SQLite 操作也会执行（新行为）；可接受，test 就是本地环境
