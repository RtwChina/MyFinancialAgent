## Why

LLM 批处理后，新闻的 `related_symbols` 字段可能包含不在系统标的表中的原始代码（如 `002475.SZ`）或 Yahoo Finance 格式代码（如 `DX-Y.NYB`），导致前端展示出无意义或不一致的标签。统一为 `tracked_symbols.symbol` 系统代码，可确保新闻标签与标的管理模块完全对齐。

## What Changes

- **Python 侧新增** `canonicalize_related_symbols()` 函数：将 LLM 输出的原始 symbol 列表映射到系统代码（`tracked_symbols.symbol`），别名匹配成功则转换，无法匹配则丢弃
- **修改** `_normalize_related_symbols()` 或 `_merge_batch_result()`：在赋值 `related_symbols` 之前调用规范化函数
- **不做项**：不修改历史已存储数据（存量 `news_raw_data.related_symbols` 不回填）；不修改 Worker 侧展示逻辑（系统代码本身即可直接展示）

## Capabilities

### New Capabilities

- `news-symbol-canonicalization`: 新闻 related_symbols 在写入 DB 前统一规范化为系统代码

### Modified Capabilities

（无，现有规格无 related_symbols 规范化的行为约束）

## Impact

**受影响文件：**
- `src/collect_news_v3.py` — `_normalize_related_symbols` 或 `_merge_batch_result` 调用点
- `src/symbol_registry.py` — 无需修改（`build_aliases_lookup` 和 `get_tracked_symbols` 已可直接使用）

**不影响：**
- Worker / 前端展示逻辑（系统代码格式不变）
- `news_raw_data` schema（字段不变，只是内容更干净）
- `derive_related_symbols`（规则初筛路径，已使用系统代码，不受影响）
