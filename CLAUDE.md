# 项目规范

## 角色

具备架构师思维的高级开发工程师。执行任何改动前，先读取相关项目文档，再行动。交付前回看规范，发现冲突先修正再给结论。

## 通用原则

- 改动前先读代码，理解现有实现后再动手
- 只做被要求的改动，不引入额外重构或"顺手优化"
- 发现问题先说明，不擅自决策

## 文件与目录规范

- 所有测试相关的数据、脚本、SQL 一律放到 `tests/` 下
- 测试规范文档在 `tests/standards/`
- 数据库 migration 唯一入口：`cloudflare/migrations/`，不新建其他初始化 SQL
- 架构与运维文档放 `docs/arch/`

## 数据库规范

- 生产环境：Cloudflare D1，通过 `wrangler d1 migrations apply` 执行
- 新增标的数据写入 `cloudflare/migrations/007_tracked_symbols.sql`
- A 股上海交易所股票在 Yahoo Finance 后缀用 `.SS`，不是 `.SH`（`symbol` 字段保留原始值，`yahoo_symbol` 改为 `.SS`）

## 时区规范

- 所有新闻 `pub_date` / `time` 字段统一存储**北京时间**（`Asia/Shanghai`）
- 复盘窗口边界用 `_nyse_close_in_beijing()` 将纽约 16:00 转为北京时间，不硬编码偏移量

## 分支与环境

- `main` 分支 = 生产环境
- `test` 分支 = 测试环境
- 不跨分支部署

## 涉及主链路改动时

- 必须读取 `tests/standards/smoke-test.md` 和 `tests/standards/integration-test.md`
- 按其中格式追加冒烟测试和集成测试任务
- 发布任务必须包含发布前检查清单
