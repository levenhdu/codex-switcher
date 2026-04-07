# account-lifecycle-consistency Specification

## Purpose
TBD - created by archiving change codex-config-safety-hardening. Update Purpose after archive.
## Requirements
### Requirement: 删除活跃自定义账号时必须撤销其 live 凭据

当被删除账号是当前活跃 `custom_api` 账号时，系统 MUST 同步撤销该账号在 live `auth.json` 和 live `config.toml` 中的生效状态。

#### Scenario: 删除当前活跃的自定义 API 账号
- **WHEN** 用户删除当前活跃的 `custom_api` 账号
- **THEN** 系统 SHALL 清除 registry 中的活跃指针
- **AND** 系统 SHALL 撤销该账号对应的 live provider 配置
- **AND** 系统 SHALL 不再保留该账号的 live API 凭据继续生效

### Requirement: 删除非活跃账号不得影响当前 live 状态

系统 SHALL 将非活跃账号删除限定在注册表和账号存储目录范围内，而不影响当前 live `auth.json` 和 live `config.toml`。

#### Scenario: 删除非活跃账号
- **WHEN** 用户删除一个当前并未活跃的账号
- **THEN** 系统 SHALL 仅移除该账号的 registry 记录和本地账号目录
- **AND** 系统 SHALL 保持当前 live auth 与当前 live provider 配置不变

