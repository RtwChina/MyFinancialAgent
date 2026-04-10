## 1. 路由与失败判定

- [ ] 1.1 梳理 `src/data_sources/price_live.py` 当前 Yahoo 成功路径，确认 fallback 触发条件仅包括：异常、`hist.empty`、`current_price is None`
- [ ] 1.2 基于 `yahoo_symbol` 后缀与代码模式定义市场路由规则，至少覆盖 `.SS` / `.SZ` => 中国市场 fallback，`.HK` + 国际 / 美股链路 => Finnhub fallback
- [ ] 1.3 在日志中明确标记 `primary=yahoo`、`fallback=akshare`、`fallback_failed`

## 2. 中国市场 fallback

- [ ] 2.1 新增 AKShare 中国市场价格拉取实现，覆盖 A 股指数、A 股个股、场内 ETF 所需字段
- [ ] 2.2 将 AKShare 返回统一映射到现有价格结构：`k_date/current_price/change_percent/volume/captured_at`
- [ ] 2.3 仅在 Yahoo 异常、空表或 `current_price is None` 时触发 AKShare fallback，主链路成功时不额外请求备用源

## 3. 国际 / 美股 fallback

- [ ] 3.1 新增 Finnhub secondary source，实现美股 / 美股 ETF / 美股指数 fallback
- [ ] 3.2 将 Finnhub 返回统一映射到现有价格结构：`k_date/current_price/change_percent/volume/captured_at`
- [ ] 3.3 国际链路仅在 Yahoo 异常、空表或 `current_price is None` 时触发 Finnhub fallback，主链路成功时不额外请求备用源

## 4. 主链路兼容性验证

- [ ] 4.1 验证现有 Yahoo “最后一根 K 线 + 未收盘回退一根”主逻辑保持不变
- [ ] 4.2 验证周末与非交易时段场景不会因为 fallback 改造而改变主链路已有行为

## 5. 测试与验证

- [ ] 5.1 为 `.SS` / `.SZ` 标的补充单元测试或回放测试：Yahoo 空表、Yahoo 空 Close 时应正确切到 AKShare
- [ ] 5.2 为美股链路补充回放或模拟测试：Yahoo 异常、空表或空价格时应正确切到 Finnhub
- [ ] 5.3 增加至少一个中国市场真实案例验证：`000001.SS` 和 `515880.SS`
- [ ] 5.4 验证主链路成功时不会额外触发 AKShare / Finnhub，避免增加不必要请求

## 6. 文档与发布检查

- [ ] 6.1 更新价格采集文档，说明 Yahoo 为主源，中国市场回退 AKShare，国际市场回退 Finnhub
- [ ] 6.2 上线后检查 GitHub Actions 日志，确认可以看到主源命中率与 fallback 命中率
