## ADDED Requirements

### Requirement: CLAUDE.md 与代码规范一致
项目规范文档 `CLAUDE.md` SHALL 反映当前代码的实际规范和约束。

#### Scenario: 检查 CLAUDE.md 规范有效性
- **WHEN** 开发者阅读 `CLAUDE.md` 中的规范
- **THEN** 规范内容与当前代码实现一致

### Requirement: README.md 反映项目当前状态
项目说明 `README.md` SHALL 包含准确的项目描述、安装步骤和使用方法。

#### Scenario: README 安装步骤有效
- **WHEN** 新用户按照 `README.md` 的安装步骤操作
- **THEN** 能够成功运行项目

### Requirement: PRD 反映当前功能范围
`docs/rfcs/项目需求文档.md` SHALL 描述已实现的功能范围。

#### Scenario: PRD 功能列表准确
- **WHEN** 查看 PRD 中的功能列表
- **THEN** 与已实现的功能一致，未实现的功能标记为"规划中"

### Requirement: 测试规范与测试代码一致
`tests/standards/*.md` SHALL 反映当前测试实现。

#### Scenario: 测试规范可执行
- **WHEN** 按照 `tests/standards/smoke-test.md` 执行冒烟测试
- **THEN** 测试步骤与当前代码匹配

### Requirement: 架构文档与代码架构一致
`docs/arch/*.md` SHALL 反映当前系统架构。

#### Scenario: 架构图准确
- **WHEN** 查看 `docs/arch/TECHNICAL_ARCHITECTURE.md`
- **THEN** 架构图与当前代码结构匹配