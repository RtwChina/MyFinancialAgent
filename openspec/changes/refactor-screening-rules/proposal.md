## Why

当前初筛规则生成逻辑存在问题：
1. **静态与动态混淆**：日志只显示最终合并结果，无法区分哪些是静态基础词、哪些是 LLM 动态补充
2. **失败静默降级**：LLM 调用失败时静默回退，掩盖了动态词生成失败的真实情况
3. **collect_prices.yml 关闭 LLM**：`SKIP_LLM=true` 导致收盘后任务不做动态规则生成

## What Changes

- `_normalize_screening_profile` 改为**合并**静态词表与动态词表，而非替代
- `generate_dynamic_screening_profile` 失败时抛出 `RuntimeError` 并记录日志，不再静默回退
- 日志区分静态词与动态词来源
- `collect_prices.yml` 开启 LLM（`SKIP_LLM: "false"`）

## Capabilities

### New Capabilities
- `screening-rules-transparency`: 初筛规则透明化，日志清晰区分静态基础词与 LLM 动态补充词

### Modified Capabilities
- 无（现有 specs 不涉及初筛规则）

## Impact

- `src/collect_news_v3.py` — 修改词表合并逻辑，增强日志输出
- `.github/workflows/collect_prices.yml` — `SKIP_LLM` 改为 `false`