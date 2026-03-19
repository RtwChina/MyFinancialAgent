## 1. Python 实现

- [x] 1.1 在 `src/collect_news_v3.py` 中新增 `canonicalize_related_symbols(raw, tracked_set, aliases_lookup) -> List[str]` 函数：用传入的 `tracked_set` 和 `aliases_lookup` 做映射，无匹配则丢弃
- [x] 1.2 在 `_merge_batch_result` 循环**外**预先构建 `tracked_set` 和 `aliases_lookup`（各构建一次），循环内调用 `canonicalize_related_symbols` 传入这两个参数
- [x] 1.3 确认 `derive_related_symbols` 路径（规则初筛）不调用新函数，两条路径互不干扰

## 2. 验证

- [x] 2.1 本地快速验证：构造含 `002475.SZ`、`DX-Y.NYB`、`MU` 的 raw 列表，调用 `canonicalize_related_symbols`，确认输出为 `["DXY", "MU"]`
- [ ] 2.2 执行冒烟测试 SMK-003（replay 新闻采集），确认流程无报错，related_symbols 中无非系统代码

## 3. 发布

- [x] 3.1 部署：无需单独部署（Python 脚本由 GitHub Actions 或手动执行，改动即生效）
- [ ] 3.2 下次采集任务执行后，抽查新入库的 `news_raw_data.related_symbols` 确认无非系统代码
