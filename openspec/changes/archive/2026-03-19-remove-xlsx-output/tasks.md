## 1. 删除价格采集的 xlsx 导出

- [x] 1.1 读取 `src/collect_prices.py`，删除 `export_to_excel` 函数定义（约第 51-63 行）
- [x] 1.2 删除 `src/collect_prices.py` 中调用 `export_to_excel` 的代码行（约第 95 行）
- [x] 1.3 删除 `src/collect_prices.py` 中因 xlsx 导出而引入的 `OUTPUT_DIR` 定义（若无其他用途）

## 2. 删除新闻采集的 xlsx 导出

- [x] 2.1 读取 `src/collect_news_v3.py`，删除 `export_to_excel` 函数定义（约第 1384-1397 行）
- [x] 2.2 删除 `src/collect_news_v3.py` 中调用 `export_to_excel` 的代码行（约第 1493 行）
- [x] 2.3 删除 `src/collect_news_v3.py` 中因 xlsx 导出而引入的 `OUTPUT_DIR` 定义（若无其他用途）

## 3. 清理 main.py

- [x] 3.1 读取 `main.py`，删除对 `export_to_excel` 的导入语句（约第 26 行）
- [x] 3.2 删除 `main.py` 中调用 `export_to_excel` 的代码块（约第 40 行）

## 4. 清理依赖

- [x] 4.1 检查 `requirements.txt`，确认 `openpyxl` 是否只用于 xlsx 导出
- [x] 4.2 若确认无其他用途，从 `requirements.txt` 中移除 `openpyxl`
- [x] 4.3 检查 `pandas` 是否仍有其他用途（数据处理、D1 写入等），保留或移除

## 5. 验证

- [x] 5.1 本地运行 `python main.py close-summary` 确认无 ImportError 和 xlsx 相关报错
- [x] 5.2 本地运行 `python main.py`（新闻采集入口）确认正常执行
- [x] 5.3 确认运行后无 `.xlsx` 文件生成
