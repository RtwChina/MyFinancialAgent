## Context

`collect_news_v3.py` 的 LLM 批处理路径（`_merge_batch_result`）将 LLM 输出的 `related_symbols` 经 `_normalize_related_symbols` 后直接存储，不做系统代码校验。`symbol_registry.py` 已提供 `build_aliases_lookup()` 和 `get_tracked_symbols()`，可直接用于映射和过滤。

规则初筛路径（`derive_related_symbols`）已正确使用系统代码，不受影响。

## Goals / Non-Goals

**Goals:**
- LLM 输出的 `related_symbols` 写入 DB 前，统一映射到 `tracked_symbols.symbol`
- 无法映射的代码丢弃（如 `002475.SZ` 等非跟踪标的）

**Non-Goals:**
- 不回填历史数据
- 不修改 Worker 或前端
- 不修改规则初筛路径（`derive_related_symbols` 已正确）

## Decisions

### 新增 `canonicalize_related_symbols(raw, tracked_set, aliases_lookup) -> List[str]`

签名：
```python
def canonicalize_related_symbols(
    raw: List[str],
    tracked_set: set[str],
    aliases_lookup: dict[str, list[dict]],
) -> List[str]
```

逻辑：
1. 对每个输入 symbol：
   - 若已在 `tracked_set` → 直接保留
   - 否则做小写别名查找 → 取第一个匹配的系统代码
   - 无匹配 → 丢弃
2. 去重、保持顺序返回

### 调用方预先构建，循环外只构建一次

`_merge_batch_result` 在**循环外**构建 `tracked_set` 和 `aliases_lookup`，通过参数传入，避免每条新闻重复构建：

```python
tracked_set = {rec["symbol"] for rec in get_tracked_symbols()}
aliases_lookup = build_aliases_lookup()

for news in news_batch:
    ...
    related_symbols = canonicalize_related_symbols(
        _normalize_related_symbols(item_result.get("related_symbols"), news.get("related_symbols", [])),
        tracked_set,
        aliases_lookup,
    )
```

**为何不在函数内部缓存：** `get_tracked_symbols()` 已有模块级 `_cache`（不会重复查 D1），但 `build_aliases_lookup()` 每次都重建 dict。批处理时同一批次多条新闻共享同一次构建结果，传参比函数内部隐式调用更清晰，也更易测试。

### 不修改 `_normalize_related_symbols`

保持其职责单一（类型校验 + fallback），规范化逻辑独立封装，便于测试。

## Risks / Trade-offs

- **别名表覆盖范围** → 若 LLM 输出了系统不跟踪的中国 A 股代码，会被丢弃，符合预期；若 LLM 输出了别名表未收录的系统标的写法，也会丢弃。可通过完善 `symbol_registry.py` 的 aliases 弥补，但不在本次范围内
- **`get_tracked_symbols()` 已有模块级缓存** → 不会重复查 D1，性能无问题；`build_aliases_lookup()` 在循环外构建一次，无重复开销
