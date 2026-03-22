## Context

项目已经把根 `README.md` 作为唯一文档源，并同步到 `cloudflare/web/readme.md` 供本地与线上 ReadMe 页面渲染。当前文档体量较大，用户在 GitHub 和前端页面里都只能依赖长滚动查找章节，缺少稳定导航入口。

这次变更同时涉及两个阅读环境：

- GitHub / 仓库阅读：直接渲染根 `README.md`
- 前端 ReadMe 页面：异步 `fetch('/readme.md')` 后再由 `snarkdown` 转成 HTML

约束是继续保持单一来源，不新增第二份目录配置，也不引入额外 Markdown 构建依赖。

## Goals / Non-Goals

**Goals:**

- 在 `README.md` 顶部提供可点击的目录，覆盖主要二级章节
- 让同一套目录链接在 GitHub 和前端 ReadMe 页面中都可跳转
- 保持 `README.md -> cloudflare/web/readme.md` 的同步链路不变
- 处理异步渲染带来的 hash 定位问题，避免首次带锚点进入时失效

**Non-Goals:**

- 不引入自动生成目录的构建器或新的第三方依赖
- 不改造为独立帮助中心、搜索页或多文档体系
- 不修改 Worker API、数据库结构、定时任务或环境配置
- 不变更 `APP_ENV` 语义；该变更在本地与生产环境使用相同的静态文档同步策略

## Decisions

**使用显式锚点，而不是依赖不同渲染器的自动 slug**

- 在 `README.md` 中为主要章节添加显式 ASCII 锚点，并在顶部目录中直接引用这些锚点
- 这样可以避免 GitHub、浏览器和 `snarkdown` 对中文标题生成 slug 规则不一致的问题
- 备选方案是前端按标题文本动态生成 slug，但这会让 GitHub 与前端的锚点规则分叉，维护成本更高

**目录直接写入 `README.md`，不单独维护 TOC 配置**

- 目录作为文档正文的一部分，和章节内容一起评审、一起同步
- 这样可以继续保持根 `README.md` 为唯一来源，`scripts/sync-readme.mjs` 无需理解目录结构
- 备选方案是单独生成 `toc.json` 或在同步脚本里解析 Markdown 自动生成目录，但这会引入第二份事实来源

**前端在渲染后执行最小锚点增强**

- `renderReadme()` 在把 Markdown 注入 `#readmeContent` 后，需要执行一次锚点增强逻辑
- 增强逻辑负责：
  - 让显式锚点具备稳定的滚动目标
  - 在页面首次通过 `#hash` 打开时，于内容异步加载完成后重新定位
  - 为锚点目标补充 `scroll-margin-top` 或等价处理，避免标题被顶部布局遮挡
- 备选方案是完全依赖浏览器默认锚点行为，但异步渲染场景下首次加载 hash 容易失效

**不新增环境分叉**

- 本地 `npm run dev` 和生产 `npm run deploy` 仍统一依赖 `sync:readme`
- 不新增测试/生产两套目录内容，也不需要为 `APP_ENV` 增加特殊分支
- 这样可维持测试环境与生产环境在文档行为上的一致性，只通过部署目标区分环境

## Risks / Trade-offs

- [目录与章节标题漂移] → 通过显式锚点命名和 README 内联目录，降低“标题变了但链接没变”的风险；实现时同步检查目录条目和章节锚点
- [GitHub 对原生 HTML 锚点的兼容性差异] → 使用简单、常见的 `id` 锚点写法，并优先采用 ASCII 标识，避免依赖平台私有 slug 规则
- [前端异步渲染导致 hash 不生效] → 在 `renderReadme()` 成功后主动检查 `location.hash` 并二次滚动到目标
- [目录过长影响首屏] → 只覆盖主要二级章节，不为每个三级小节都建目录
