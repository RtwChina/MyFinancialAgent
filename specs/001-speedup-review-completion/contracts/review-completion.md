# Review Completion Compatibility Contract

所有外部路径、HTTP 方法、请求字段和响应字段保持不变；不增加客户端必填参数。保存与完成仍是两个独立请求。

| 接口 | 保持的输入与输出/行为 |
|---|---|
| POST /api/reviews/:date | 原 reviewStatus、reviewerNewsNotes/newsBrief、tradingSummary、actionPlans、marketSentimentBlocks、sectorRotationBlocks 及现有兼容别名；返回 ok/archiveDate/reviewStatus/actionPlanCount/结构化块/syncedToLive |
| POST /api/reviews/:date/complete | accountSnapshot/account_snapshot、onlyIfPending、requireCompleteContent、completionSource、autoFill；成功返回 ok/archiveDate/reviewStatus/accountSnapshot/accountImpactSummary；跳过继续返回 skipped/reason 及原有附带字段 |
| GET /api/reviews | 原筛选、分页、items/total/page/pageSize/totalPages/latestArchiveDate 及非分页兼容模式 |
| GET /api/reviews/pending | 原 limit，items/latestClosedDate/latestArchiveDate（保留当前无已收盘日分支的响应） |
| GET /api/reviews/:date/bootstrap | 原 draft、analysis、news、structuredNotes、actionPlans、账户结果及 latestArchiveDate |
| POST /api/reviews/:date/account-impact/preview | 原 actionPlans 输入及 accounts 输出；单独编辑仍可调用 |

## Internal front-end contract

`saveReview({ forCompletion = false } = {})` 为内部选项，不发送到后台。

默认保存：原有保存、状态提交、渲染、预览、列表更新均保留。
完成保存：保留验证、payload 构建、保存、原本本地状态更新，跳过保存后的展示刷新和预览。complete 成功之后一次最终列表刷新并关闭抽屉；complete 失败则恢复保存后展示并重新抛出原错误。不得在 UI 完成之前减少业务处理量。

不可变请求顺序：有效校验 → 保存成功 → 收集原账户快照输入 → complete 成功 → reviewed UI → 最终列表 → 关闭。保存失败不调用 complete；原本计划详情校验返回分支与连续点击行为由基线差分固定，本次不添加新行为。

## Failure compatibility

保持原错误状态码与业务含义、跳过原因、写入顺序及错误传播规则。列表/预览原本捕获错误的行为不升级为阻断提交。恢复展示失败不覆盖业务失败。重复完成不引入新幂等键、不将手动完成改为 onlyIfPending。

## Observability

只增加非敏感计时日志，不依赖客户端读取新响应字段，不改变 JSON schema。相同请求的诊断记录用请求内 runId 关联，不存于全局可变状态。
