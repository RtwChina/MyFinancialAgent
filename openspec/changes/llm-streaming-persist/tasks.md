## 1. enhance_news_with_llm 新增回调参数

- [x] 1.1 `src/collect_news_v3.py` `enhance_news_with_llm` 签名新增 `on_batch_done: Optional[Callable] = None`
- [x] 1.2 主批次 `as_completed` 循环内，`_merge_batch_result` 之后立即调用 `on_batch_done(processed_items, kept_items)`（异常捕获，仅 WARNING）
- [x] 1.3 重试子批次 `as_completed` 循环内，同样在 `_merge_batch_result` 之后立即调用 `on_batch_done`

## 2. collect_all_news 提供回调

- [x] 2.1 `collect_all_news` 中定义 `_on_batch_done(processed_items, kept_items)` 内部函数：
  - 远端模式：调用 `send_news(processed_items)`
  - 本地模式：调用 `upsert_news_batch(processed_items)`
  - 异常捕获，仅记录 WARNING
- [x] 2.2 调用 `enhance_news_with_llm(..., on_batch_done=_on_batch_done)`
- [x] 2.3 原有"全量结果统一写 DB"逻辑改为：仅对 `news_already_persisted=False` 时执行，避免重复写入

## 3. 冒烟测试

- [ ] 3.1 本地运行 `python main.py hourly-news`，确认日志中批次完成后立即有写入日志，无需等待全部批次完成
- [x] 3.2 `tests/standards/smoke-test.md` 追加 SM-017：Stage 3 有超时批次时，其余批次的写入日志早于超时批次完成日志

## 4. 发布

- [ ] 4.1 push 到 `main`，观察 GitHub Actions 日志中成功批次写入时序是否早于重试批次
