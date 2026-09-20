# Quickstart: 验证复盘提速与兼容性

## 环境与基线

在仓库根目录运行。需要支持 `node:sqlite` 的 Node（本轮 v26.5.0）、现有 npm 依赖和 Playwright 可用浏览器。macOS 本轮使用已安装 Chrome：

```sh
export PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

实现前的工作区基线已保存在 `.tests/review-completion/baseline/`，含 SHA-256 manifest。不要重新捕获已经修改过的候选作为基线。首次捕获命令如下，已有目录时拒绝覆盖：

```sh
node scripts/benchmark-review-completion.mjs --capture-baseline
```

基线含当时未提交的业务修改，不能用 HEAD 替代。`.tests/` 和 `test-results/` 均被 Git 忽略；把 Playwright 输出指定到独立目录，避免清理基线。不同机器复现前需单独复制这份基线及其 manifest。

## 语法与业务差分

```sh
npm run check:web
npm run check:worker
node --test tests/review_completion_contract.test.mjs tests/review_completion_failures.test.mjs tests/review_completion_atomicity.test.mjs tests/review_completion_roundtrips.test.mjs tests/worker_review_list_contract.test.mjs
```

`review_completion_roundtrips` 断言 D1 往返次数不随复盘条目线性增长，`review_completion_atomicity` 断言批次中途失败不留下半删半插的破损归档。收益必须以往返次数度量，prepare 次数与本地耗时都不能替代。

测试调用实际 Worker，使用迁移和确定性合成数据装载独立的 Node SQLite 数据库。它模拟 D1 API、batch 回滚和 100 绑定参数限制，不代表真实 D1 行为已经验收。比较全部业务表与接口结果；故障矩阵逐个写入点注入执行前失败、执行后错误，并对照重试。

普通成功组为 50 新闻/20 计划/3 账户，大组为 200 新闻/40 计划/3 账户。100 计划及 101 来源 ID 是保留原有容量限制的失败测试，不进入成功性能统计。

## 浏览器回归

先在另一个终端启动供原有批量 UI 测试使用的静态服务器（API 会被测试拦截）：

```sh
python3 -m http.server 8787 --bind 127.0.0.1 --directory cloudflare/web
```

```sh
npx playwright test tests/smoke/review_completion_performance.spec.js tests/smoke/review_completion_recovery.spec.js tests/smoke/review_completion_compatibility.spec.js tests/smoke/batch_pending_reviews.spec.js --workers=1 --reporter=line --output=.tests/review-playwright-final --timeout=20000
```

若 Playwright 自带浏览器未安装（`~/Library/Caches/ms-playwright/` 为空）且无法联网执行 `npx playwright install`，可指向本机 Chrome：

```sh
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx playwright test ...
```

已知在本机 Chrome 下 `editing an already completed review` 会在打开编辑抽屉处超时，基线与候选同样失败，属环境差异而非回归；用自带浏览器复跑以确认。

新增测试直接加载真实静态资源并把 API 交给隔离 Worker/SQLite，无须连接线上。覆盖完成请求次数、保存失败、完成失败重试、列表失败、响应丢失、旧页面再次完成、单独保存、历史完成和批量持久化。受控并发交错、连续点击等剩余覆盖见 tasks.md；当前通过不能替代全部验收。

## 本地性能采样

```sh
node scripts/benchmark-review-completion.mjs --local-sqlite --baseline-self --pairs 1 --output test-results/review-completion/self-check
node scripts/benchmark-review-completion.mjs --local-sqlite --pairs 30 --fixtures normal,large --output test-results/review-completion/click-final
```

每组 30 对，顺序交错，每次新建隔离数据。计时从页面捕获实际点击到最终列表处理后抽屉隐藏；另保留自动化驱动总耗时以区分点击前等待。输出 samples.json、summary.json、comparisons.json，含各 API 耗时、数据库调用数、prepare 次数、首次运行标记与业务对比。P95 为 nearest-rank。

**这些是本地浏览器 + Node SQLite 测量，不是远程 D1 延迟验收。** 当前脚本未实现远程数据恢复适配器，不接受 `--baseline-url`/`--candidate-url` 运行远程实验。远程验收还需两套等配置的隔离测试 Worker/D1、明确的地址白名单、恢复适配器和配额核验；不得用生产历史复盘补测。现有 wrangler.test.toml 不是远程写入授权。

## 判定与发布

两组均需中位数降低至少 30%、P95 降低至少 20%，成功率 100%，全部业务及故障兼容场景通过。任一门槛未满足，保留原始证据和未勾选任务，不宣称已经解决性能问题。后续应用代码变更须重新采样。

本轮未部署。发布就绪、仍缺证据和完整回退说明见 [validation-report.md](validation-report.md)。
