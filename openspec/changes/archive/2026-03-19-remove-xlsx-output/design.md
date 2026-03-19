## Context

项目数据已全量迁移至 Cloudflare D1，两个定时采集任务（`collect_news_v3.py`、`collect_prices.py`）在完成 D1 写入后仍调用 `export_to_excel` 生成本地 `.xlsx` 文件。这些文件在 GitHub Actions runner 上生成后既没有被 upload artifact，也没有任何下游消费，属于死代码。

## Goals / Non-Goals

**Goals:**
- 删除 `export_to_excel` 函数定义及所有调用点
- 清理相关导入（`openpyxl`、`pandas.ExcelWriter` 等仅用于 xlsx 的部分）
- 评估并移除 `requirements.txt` 中仅服务于 xlsx 导出的依赖

**Non-Goals:**
- 不修改数据采集逻辑本身
- 不修改 D1 写入路径
- 不重构 `main.py` 的其他部分

## Decisions

**删除而非注释**：代码已无任何用途，直接删除，避免留下误导性的注释代码。

**依赖清理策略**：
- `openpyxl`：仅用于 xlsx 写入，可直接移除
- `pandas`：用途广泛（数据处理、D1 写入前的 DataFrame 操作），保留；仅移除 `to_excel` / `ExcelWriter` 相关调用

**OUTPUT_DIR 变量**：若 `export_to_excel` 是 `OUTPUT_DIR` 的唯一使用者，一并删除该变量定义；否则保留。

## Risks / Trade-offs

- [风险] 误删仍在使用的 `pandas` 功能 → 逐文件确认 `pandas` 用途后再决定是否移除
- [风险] `openpyxl` 被其他隐式依赖引用 → 移除后在本地或 CI 中运行一次采集验证无报错
- 整体风险极低，变更范围明确，逻辑独立
