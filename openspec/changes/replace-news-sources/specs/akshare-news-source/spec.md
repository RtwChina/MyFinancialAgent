## ADDED Requirements

### Requirement: AkShare 财联社新闻采集
系统 SHALL 通过 `akshare.stock_info_global_cls()` 采集财联社全球快讯，返回标题、内容、发布时间。

接口分类：B 类（不可控，依赖财联社站点）。Mock 策略：测试时用固定 DataFrame 替代 API 调用。

#### Scenario: 正常采集财联社新闻
- **WHEN** 调用 AkShare 财联社采集函数
- **THEN** 返回 `list[dict]`，每条包含 time/title/content/source 字段，source 值为 `"cls"`

#### Scenario: 财联社接口异常
- **WHEN** `stock_info_global_cls()` 抛出异常
- **THEN** 记录错误日志并返回空列表，不影响其他源采集

### Requirement: AkShare 同花顺新闻采集
系统 SHALL 通过 `akshare.stock_info_global_ths()` 采集同花顺全球快讯，返回标题、内容、发布时间、链接。

接口分类：B 类（不可控）。Mock 策略：同上。

#### Scenario: 正常采集同花顺新闻
- **WHEN** 调用 AkShare 同花顺采集函数
- **THEN** 返回 `list[dict]`，每条包含 time/title/content/url/source 字段，source 值为 `"10jqka"`

#### Scenario: 同花顺接口异常
- **WHEN** `stock_info_global_ths()` 抛出异常
- **THEN** 记录错误日志并返回空列表

### Requirement: AkShare 新浪新闻采集
系统 SHALL 通过 `akshare.stock_info_global_sina()` 采集新浪全球快讯，返回内容和发布时间。

接口分类：B 类（不可控）。Mock 策略：同上。

#### Scenario: 正常采集新浪新闻
- **WHEN** 调用 AkShare 新浪采集函数
- **THEN** 返回 `list[dict]`，每条包含 time/content/source 字段，source 值为 `"sina"`

#### Scenario: 新浪接口异常
- **WHEN** `stock_info_global_sina()` 抛出异常
- **THEN** 记录错误日志并返回空列表

### Requirement: AkShare 富途新闻采集
系统 SHALL 通过 `akshare.stock_info_global_futu()` 采集富途全球快讯，返回标题、内容、发布时间、链接。

接口分类：B 类（不可控）。Mock 策略：同上。

#### Scenario: 正常采集富途新闻
- **WHEN** 调用 AkShare 富途采集函数
- **THEN** 返回 `list[dict]`，每条包含 time/title/content/url/source 字段，source 值为 `"futu"`

#### Scenario: 富途接口异常
- **WHEN** `stock_info_global_futu()` 抛出异常
- **THEN** 记录错误日志并返回空列表

### Requirement: AkShare 新闻时间统一为北京时间
所有 AkShare 源返回的 time 字段 SHALL 统一为北京时间格式 `YYYY-MM-DD HH:MM:SS`。

#### Scenario: 时间格式标准化
- **WHEN** AkShare 返回的发布时间为日期+时间分开的字段
- **THEN** 合并为 `YYYY-MM-DD HH:MM:SS` 格式字符串
