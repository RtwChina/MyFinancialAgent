# OpenSpec 使用指南

## 是什么

OpenSpec 是一个 AI 辅助编码的规范框架。核心思路：**在 AI 写代码之前，先让人和 AI 对齐需求规范**，避免 AI 乱写、返工多。

```
传统方式：你说一句话 → AI 直接写代码 → 结果不对 → 反复修改
OpenSpec：你提需求 → AI 生成规划文档 → 你确认 → AI 按图索骥写代码
```

---

## 安装

```bash
# 需要 Node.js 20.19.0+
npm install -g @fission-ai/openspec@latest
```

---

## 新项目初始化

```bash
cd your-project
openspec init
```

生成目录结构：

```
openspec/
├── specs/       # 系统行为的"真相来源"，记录当前功能规格
├── changes/     # 每个功能变更的独立文件夹
└── config.yaml  # AI 协作规范配置
```

**初始化后，把通用配置复制进来：**

```bash
# 从 my-ai-config 仓库复制
cp path/to/my-ai-config/openspec/config.yaml ./openspec/
cp -r path/to/my-ai-config/docs/testing ./docs/
```

---

## 核心工作流

### 快速路径（默认，core profile）

```
/opsx:propose → /opsx:apply → /opsx:archive
```

### 完整路径（扩展 profile）

```
/opsx:new → /opsx:ff → /opsx:apply → /opsx:verify → /opsx:archive
```

开启扩展命令：

```bash
openspec config profile   # 选择扩展 profile
openspec update           # 刷新 AI 指令
```

---

## 完整流程示例：查看今天天气

### 第一步：提需求

在 AI（如 Claude Code）中：

```
你: /opsx:propose show-today-weather
```

AI 自动生成四份规划文档：

```
openspec/changes/show-today-weather/
├── proposal.md   # 为什么做、做什么
├── specs/        # 功能需求和验收场景
├── design.md     # 技术方案
└── tasks.md      # 实现清单（带 checkbox）
```

### 第二步：确认文档（可修改）

AI 生成后，你可以直接编辑这些文档，调整任务粒度、补充细节，再继续。

### 第三步：让 AI 写代码

```
你: /opsx:apply
```

```
AI:  ✓ 1.1 创建 weatherService.ts
     ✓ 1.2 添加错误处理
     ✓ 2.1 创建 WeatherCard 组件
     ✓ 2.2 创建 SearchBar 组件
     All tasks complete!
```

### 第四步：验证（可选）

```
你: /opsx:verify
```

```
AI:  ✓ 所有 tasks 已完成
     ✓ specs 需求均有对应代码
     ⚠ "搜索城市"场景缺少测试覆盖
     Ready to archive (with 1 warning)
```

### 第五步：归档

```
你: /opsx:archive
```

```
AI:  ✓ Delta specs 合并到 openspec/specs/
     ✓ 变更归档到 openspec/changes/archive/2026-03-18-show-today-weather/
     完成！
```

---

## 所有命令速查

### AI 对话命令（在 Claude Code / Cursor 等工具里使用）

| 命令 | 说明 | 场景 |
|------|------|------|
| `/opsx:propose <需求名>` | 一步生成所有规划文档 | 快速路径，最常用 |
| `/opsx:explore` | 先调研再决定怎么做 | 需求不清晰时 |
| `/opsx:new <需求名>` | 只创建变更文件夹 | 扩展模式 |
| `/opsx:ff` | 一次性生成所有规划文档 | 扩展模式，需求清晰时 |
| `/opsx:continue` | 逐步生成下一个文档 | 扩展模式，边探索边规划 |
| `/opsx:apply` | 按 tasks.md 实现代码 | 规划完成后 |
| `/opsx:verify` | 验证实现是否符合规格 | 归档前检查 |
| `/opsx:archive` | 归档完成的变更 | 功能完成后 |
| `/opsx:bulk-archive` | 批量归档多个变更 | 并行开发时 |

### 终端 CLI 命令

```bash
openspec list                    # 查看所有活跃变更
openspec show <变更名>            # 查看某个变更详情
openspec validate <变更名>        # 校验 spec 格式
openspec view                    # 打开交互式 Dashboard
openspec config profile          # 切换工作流 profile
openspec update                  # 更新 AI 指令文件
openspec schema fork <原> <新>    # Fork 一个 schema 自定义
```

---

## 每个变更文件夹包含什么

```
openspec/changes/<变更名>/
├── proposal.md   # 为什么做、做什么、影响范围
├── specs/        # Delta 需求（ADDED / MODIFIED / REMOVED）
├── design.md     # 技术方案、架构决策
└── tasks.md      # 实现清单，AI 按此逐条执行
```

归档后移动到：

```
openspec/changes/archive/YYYY-MM-DD-<变更名>/
```

---

## 自定义 AI 规范（config.yaml）

`openspec/config.yaml` 是项目的 AI 协作规范，控制 AI 生成文档的行为。

```yaml
schema: spec-driven

context: |
  # 全局注入，每次生成任何文档都会带上
  角色：具备架构师思维的高级开发工程师
  执行改动前先读文档

rules:
  proposal:
    - 明确需求边界、优先级、不做项
  specs:
    - 场景必须用 Given/When/Then 格式
  design:
    - 说明环境隔离边界
  tasks:
    - 涉及主链路改动时，追加"更新冒烟文档"任务
```

---

## 多电脑同步方案

配置文件放在独立 git 仓库 `my-ai-config`，随代码版本控制。

**换电脑时：**

```bash
# 1. 拉取配置
git clone https://github.com/RtwChina/my-ai-config.git

# 2. 安装工具
npm install -g @fission-ai/openspec@latest

# 3. 进入你的项目，复制配置
cp path/to/my-ai-config/openspec/config.yaml ./openspec/
cp -r path/to/my-ai-config/docs/testing ./docs/

# 4. 重新生成 AI 指令
openspec update
```

**哪些文件上传 git：**

| 文件 | 上传？ | 原因 |
|------|--------|------|
| `openspec/config.yaml` | ✅ | AI 协作规范，需同步 |
| `openspec/specs/` | ✅ | 系统规格文档，需同步 |
| `openspec/changes/` | ✅ | 变更历史，需同步 |
| `docs/testing/` | ✅ | 测试规范，需同步 |
| `.claude/skills/` | 可选 | `openspec update` 会重新生成 |

---

## 常见问题

**Q: 命令不被识别？**
```bash
openspec init    # 确认已初始化
openspec update  # 重新生成 AI 指令
```

**Q: 多个变更并行时怎么切换？**
```
你: /opsx:apply show-today-weather   # 指定变更名即可
```

**Q: OpenSpec 升级后会覆盖我的配置吗？**
不会。`config.yaml`、`specs/`、`changes/` 不会被覆盖，只有 AI 指令文件会重新生成。

**Q: 升级 OpenSpec**
```bash
npm install -g @fission-ai/openspec@latest
openspec update   # 在项目目录里执行
```
