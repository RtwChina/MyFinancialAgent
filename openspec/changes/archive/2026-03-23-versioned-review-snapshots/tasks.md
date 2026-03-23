## 1. 快照表结构

- [x] 1.1 新增 migration，创建 `daily_review_snapshots`
- [x] 1.2 新增 migration，创建 `daily_news_ai_analysis_snapshots`
- [x] 1.3 为两张表添加 `(archive_date, version_no)` / `(analysis_date, version_no)` 唯一约束与常用索引

## 2. 快照生成逻辑

- [x] 2.1 设计并实现“手动归档当前版本”的后端入口
- [x] 2.2 归档 `daily_review_archive` 当前记录到 `daily_review_snapshots`
- [x] 2.3 归档 `daily_news_ai_analysis` 当前记录到 `daily_news_ai_analysis_snapshots`
- [x] 2.4 自动计算同日期下一个 `version_no`
- [x] 2.5 允许仅一张主表存在时只归档对应快照，不要求两张都存在

## 3. API / 客户端接入

- [x] 3.1 若采用 Worker API，新增对应归档接口
- [x] 3.2 如有需要，在 `src/cloudflare_ingest.py` 中增加封装
- [x] 3.3 设计错误返回：当前记录不存在时给出清晰提示

## 4. 文档与运维

- [x] 4.1 README 增加“如何手动归档当前版本”的说明
- [x] 4.2 文档说明 `version_no` 为整数递增版本号
- [x] 4.3 文档说明第一版仅保存快照，不提供自动恢复 UI

## 5. 验证

- [x] 5.1 验证首次归档生成 `version_no=1`
- [x] 5.2 验证同一日期再次归档生成 `version_no=2`
- [x] 5.3 验证一张主表缺失时另一张仍可成功归档
