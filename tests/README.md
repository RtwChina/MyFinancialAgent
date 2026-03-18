# Tests Directory Guide

当前 `tests/` 已按三块整理：

## 1. `tests/standards/`

放项目统一测试规范。

当前主文档：

- `tests/standards/TESTING_STANDARD.md`

## 2. `tests/cases/`

放可执行测试用例和辅助测试资源，包括：

- `tests/cases/smoke/`
  放冒烟测试说明和 Playwright UI 测试脚本
- `tests/cases/integration/`
  放集成测试说明和完整测试矩阵
- `tests/cases/config/`
  放测试环境配置，如 `wrangler.test.toml`
- `tests/cases/fixtures/`
  放辅助测试数据，如测试 SQL seed
  其中历史复盘辅助数据建议先看 `tests/cases/fixtures/TEST_DATA_SPEC.md`，
  再通过 `tests/cases/fixtures/prepare_history_seed.py`
  转成兼容当前 schema 的 seed，再导入测试库

## 3. `tests/runs/`

放每次测试执行后的结果和发布评审材料，包括：

- 集成测试报告
- 集成测试复跑报告
- 发布建议/发布评审结论

## Notes

- `test-results/` 是 Playwright 运行产物目录，不属于规范、用例或结果文档本身。
- `tests/__pycache__/` 是缓存目录，可忽略。
