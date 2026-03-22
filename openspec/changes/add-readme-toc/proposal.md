## Why

当前 `README.md` 已经承载了系统说明、架构、数据存储、新闻流程、字段说明和复盘工作流等大量内容，并且会同步到前端 ReadMe 页面展示。文档长度上来以后，用户在 GitHub 和本地页面里都需要反复滚动，难以快速定位到目标章节，因此需要一个稳定、可点击的目录来提升阅读和跳转效率。

## What Changes

- 在根 `README.md` 顶部新增目录区块，列出主要章节并提供可点击跳转入口
- 为 ReadMe 页面渲染后的标题生成稳定锚点，确保目录链接在本地页面中可用
- 约定目录与正文标题的维护方式，保证 `README.md` 继续作为唯一文档源，不引入第二份目录配置
- 为目录跳转补充最小必要的样式与滚动体验，避免顶部定位被页面布局遮挡

## Capabilities

### New Capabilities
- `readme-navigation`: 为单一来源 `README.md` 提供目录导航能力，并保证 GitHub 与前端 ReadMe 页面中的章节跳转都可用

### Modified Capabilities
- 无

## Impact

- `README.md`：新增目录内容并调整章节锚点写法
- `cloudflare/web/app.js`：为渲染后的 ReadMe 标题补充锚点处理，保证目录链接生效
- `cloudflare/web/index.html` / `cloudflare/web/styles.css`（如有需要）：补充目录展示或锚点滚动的最小样式
- 不影响业务数据模型、Worker API、D1、定时采集链路
