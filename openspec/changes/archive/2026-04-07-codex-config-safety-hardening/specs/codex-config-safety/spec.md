## ADDED Requirements

### Requirement: 配置变更必须在可安全解析的前提下进行

系统 MUST 在能够安全读取并解析 `~/.codex/config.toml` 的前提下执行配置变更；如果配置文件不可解析，系统 SHALL 终止本次变更并保留原文件内容。

#### Scenario: `config.toml` 无法解析
- **WHEN** 用户执行账号切换、账号删除后的配置重置或模型配置更新，且 `~/.codex/config.toml` 无法被解析
- **THEN** 系统 SHALL 返回明确错误
- **AND** 系统 SHALL NOT 用新的配置内容覆盖原文件

### Requirement: 工具只允许修改自己管理的 provider 配置

系统 SHALL 仅新增、更新或删除由当前工具管理的 provider 条目，而不得清空整个 `model_providers` 表或删除不属于当前工具的用户配置。

#### Scenario: 从自定义 API 切回 Team
- **WHEN** 当前活跃账号是自定义 API，且 `config.toml` 中同时存在工具受控 provider 和用户自定义 provider
- **THEN** 系统 SHALL 只移除当前活跃账号对应的受控 provider
- **AND** 系统 SHALL 保留其他 `model_providers` 条目不变

#### Scenario: 更新自定义 API provider
- **WHEN** 用户切换到某个自定义 API 账号
- **THEN** 系统 SHALL 只更新该账号对应的 provider 配置和关联的受控顶层字段
- **AND** 系统 SHALL 保留无关配置项不变

### Requirement: 账号切换的 live 文件更新必须失败可恢复

系统 SHALL 将账号切换视为跨 `auth.json` 和 `config.toml` 的单次状态更新；如果其中任一步失败，系统 MUST 回滚已写入的前一步结果。

#### Scenario: `auth.json` 已写入但 `config.toml` 写入失败
- **WHEN** 账号切换过程中 `auth.json` 更新成功而 `config.toml` 更新失败
- **THEN** 系统 SHALL 恢复切换前的 `auth.json`
- **AND** 系统 SHALL 让本次切换以失败结束
