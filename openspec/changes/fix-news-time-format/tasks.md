## 1. 代码修复

- [x] 1.1 修改 `src/db_utils.py` 的 `upsert_news_data()`：INSERT 语句显式传入 `created_at = now_cst()`
- [x] 1.2 检查 `src/db_utils.py` 中其他 INSERT 函数（`stock_raw`、`tracked_symbols` 等），同样显式设置 `created_at`/`updated_at` 为 `now_cst()`
- [x] 1.3 检查 `cloudflare/worker/src/index.js` 中是否有直接 INSERT，确保也使用北京时间

## 2. 前端调整

- [x] 2.1 修改 `cloudflare/web/index.html` 列头：`发布时间` → `发布时间 ❗(北京时间)`
- [x] 2.2 修改 `cloudflare/web/app.js` `buildNewsRow()`：去掉每行的 `<small class="muted">北京时间</small>`

## 3. 代码清理

- [x] 3.1 删除 `src/data_sources/news_live.py` 中的 `_format_for_review_window()` 函数和 `REVIEW_TZ` 常量
- [x] 3.2 确认代码库中无 `_format_for_review_window` 的任何调用或引用

## 4. Spec 修正

- [x] 4.1 更新 `openspec/specs/news-timestamp-accuracy/spec.md`：将 `yahoo-source-ny-time` 改为北京时间，新增 `created-at-beijing-time` 要求

## 5. 已有数据修复

- [x] 5.1 在生产 D1 执行 `UPDATE news_raw_data SET created_at = datetime(created_at, '+8 hours')` 修正现有12条记录
- [x] 5.2 验证修复后所有 `created_at` 与 `captured_at` 时区一致（差值 ≤ 1秒）

## 6. 测试验证

- [x] 6.1 读取 `tests/standards/smoke-test.md` 和 `tests/standards/integration-test.md`，追加时间字段一致性冒烟测试用例
- [x] 6.2 运行测试验证采集链路写入的三个时间字段均为北京时间

## 7. 发布

- [x] 7.1 发布前检查清单：spec 已更新、代码已修改、废弃函数已删除、前端已调整、测试通过、数据已修复
