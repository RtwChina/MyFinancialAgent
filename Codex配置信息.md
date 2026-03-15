# Codex配置信息

更新时间：2026-03-15 23:08 CST

用途：给新电脑上的 Codex 读取并自动对齐本机配置状态（全局配置、全局记忆、已安装 skills）。

## 1) 全局配置（目标状态）

目标文件：`$HOME/.codex/config.toml`

```toml
model = "gpt-5.4"
model_reasoning_effort = "high"
```

## 2) 全局记忆（目标状态）

目标文件：`$HOME/.codex/memories/MEMORY.md`

```markdown
# 全局偏好记忆

## 用户交互偏好
- **上下文记忆**: 用户希望记住每次聊天的内容，保持较长的上下文连贯性
- **循环上限**: 每次任务自主迭代最多 10 次（不是总计）
- **质量优先**: 目标是准确的内容，耗时可以长一点，但逻辑要自洽
- **迭代记录**: 每次迭代记录优化点和缺点

## Python 开发规范
- **必须使用虚拟环境**：运行 Python 项目时，必须在项目目录下创建 `.venv` 虚拟环境，不使用系统 Python。
- 创建方式：`python -m venv .venv`

## 项目缓存偏好
- **默认建立 Codex 项目缓存**：以后进入每个项目时，默认创建并维护项目级 `.codex/` 目录。
- **缓存内容**：至少包含项目摘要类缓存和迭代记录；如有已有代理缓存，可优先迁移关键内容。
- **聊天缓存默认开启**：以后每个项目默认都要缓存我和用户的协作对话，优先维护到项目内的 `.codex/chat_history.md`。
- **聊天缓存格式**：默认采用“用户原话 + Codex 摘要”的轻量记录方式；如果用户明确要求，再切换为更完整的逐条记录。
- **聊天缓存频率**：默认每次发生一次新的有效协作轮次后，都要尽快把该轮对话摘要追加到项目内 `.codex/chat_history.md`，以降低上下文或会话丢失风险。
- **聊天缓存执行方式**：默认由 Codex 在每次完成一轮有效协作后主动追加聊天缓存，不等待用户提醒。
- **全局执行规则**：把“项目内持续维护聊天缓存”视为所有项目的默认工作流，不需要用户在每个项目里重复要求。
- **版本控制**：默认将 `.codex/` 视为本地缓存目录，优先加入 `.gitignore`，除非用户明确要求纳入版本库。

## 项目工具安装偏好
- **优先项目内安装工具**：像 `wrangler` 这类与项目版本和配置强相关的 CLI，默认优先作为项目依赖安装，不做全局安装。
- **全局安装例外**：只有在用户明确要求，或工具天然就是跨项目全局使用时，才考虑全局安装。
```

## 3) 已安装 Skills（目标状态）

### A. 用户安装技能（`$HOME/.agents/skills`）

- `find-skills`  
  目标路径：`$HOME/.agents/skills/find-skills/SKILL.md`
- `frontend-design`  
  目标路径：`$HOME/.agents/skills/frontend-design/SKILL.md`
- `web-design-guidelines`  
  目标路径：`$HOME/.agents/skills/web-design-guidelines/SKILL.md`
- `webapp-testing`  
  目标路径：`$HOME/.agents/skills/webapp-testing/SKILL.md`

### B. Codex 本地技能（`$HOME/.codex/skills`）

- `.system/openai-docs`  
  目标路径：`$HOME/.codex/skills/.system/openai-docs/SKILL.md`
- `.system/skill-creator`  
  目标路径：`$HOME/.codex/skills/.system/skill-creator/SKILL.md`
- `.system/skill-installer`  
  目标路径：`$HOME/.codex/skills/.system/skill-installer/SKILL.md`
- `cloudflare-deploy`  
  目标路径：`$HOME/.codex/skills/cloudflare-deploy/SKILL.md`
- `doc`  
  目标路径：`$HOME/.codex/skills/doc/SKILL.md`
- `figma`  
  目标路径：`$HOME/.codex/skills/figma/SKILL.md`
- `pdf`  
  目标路径：`$HOME/.codex/skills/pdf/SKILL.md`
- `slides`  
  目标路径：`$HOME/.codex/skills/slides/SKILL.md`

## 4) 对齐要求（给新电脑 Codex）

1. 读取本文件并将本机状态对齐到上述“目标状态”。
2. 若目标路径缺失则创建目录并补齐文件。
3. 对于 skills，优先按名称恢复到对应路径；若无法在线安装，则提示“缺失项 + 需人工补充来源”。
4. 不覆盖凭证类文件（如 `auth.json`），仅处理配置/记忆/skills。

