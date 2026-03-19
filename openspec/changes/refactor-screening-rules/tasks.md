## 1. 词表合并逻辑重构

- [x] 1.1 新增 `_merge_keywords(static_list, dynamic_list)` 函数，负责合并去重
- [x] 1.2 `_normalize_screening_profile` 改为合并静态词表与动态词表（静态词作为基础，动态词增量补充）
- [x] 1.3 保留静态词表常量（`BASE_*_KEYWORDS`）作为基础层

## 2. 日志增强

- [x] 2.1 `generate_dynamic_screening_profile` 打印静态词表统计（宏观/市场/噪音词数）
- [x] 2.2 LLM 成功时打印动态词表增量统计（新增词列表、动态主题）
- [x] 2.3 打印合并后最终词表统计

## 3. 错误处理（降级而非中断）

- [x] 3.1 LLM 调用失败时：记录 WARNING 日志，降级使用静态词表，继续主流程
- [x] 3.2 JSON 解析失败时：记录 WARNING 日志 + 原始响应前 500 字，降级使用静态词表

## 4. 配置变更

- [x] 4.1 `collect_prices.yml` 设置 `SKIP_LLM: "false"`

## 5. 验证

- [x] 5.1 语法检查所有修改文件
- [ ] 5.2 本地测试：验证日志输出静态词 + 动态词分离格式