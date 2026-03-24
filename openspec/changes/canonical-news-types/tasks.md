## 1. 标准类型收敛

- [x] 1.1 明确系统标准新闻类型仅保留 `index / sector / stock`
- [x] 1.2 后端写路径不再产出 `macro / market / symbol`
- [x] 1.3 后端读路径统一按三类标准类型处理

## 2. 前端与接口同步

- [x] 2.1 修正前端 `normalizeNewsType()`，移除 `market -> sector` 旧映射
- [x] 2.2 复盘页新闻分组仅基于 `index / sector / stock`
- [x] 2.3 fallback analysis 与类型标签逻辑移除对旧值的长期依赖
- [x] 2.4 更新 README / web README 中类型说明

## 3. D1 历史数据迁移

- [x] 3.1 迁移前统计 `news_raw_data` 的 type 分布
- [x] 3.2 迁移前统计 `daily_review_archive_news` 的 type 分布
- [x] 3.3 执行 D1 update：`macro / market -> index`
- [x] 3.4 执行 D1 update：`symbol -> stock`
- [x] 3.5 迁移后再次统计，确认仅剩 `index / sector / stock`

## 4. 验证

- [x] 4.1 验证新采集新闻不再写出旧类型
- [x] 4.2 验证 reviewed 状态复盘页新闻分组符合新口径
- [ ] 4.3 验证历史复盘日页面中旧 `market` 新闻已移动到“大盘新闻”
- [x] 4.4 验证后续 summary 改造可以直接建立在三类标准类型之上
