## ADDED Requirements

### Requirement: `env_key` 模式不得隐式修改 shell 启动文件

系统 SHALL NOT 在新增自定义 API 账号或切换自定义 API 账号时，自动把密钥写入 `~/.zshrc`、`~/.bash_profile`、`~/.bashrc` 等 shell 启动文件。

#### Scenario: 新增 `env_key` 模式账号
- **WHEN** 用户新增一个使用 `env_key` 的自定义 API 账号
- **THEN** 系统 SHALL 保存账号元数据与受控配置
- **AND** 系统 SHALL NOT 自动写入任何 shell 启动文件

#### Scenario: 切换到 `env_key` 模式账号
- **WHEN** 用户切换到一个使用 `env_key` 的自定义 API 账号
- **THEN** 系统 SHALL 只更新受控的 live 配置
- **AND** 系统 SHALL NOT 自动写入任何 shell 启动文件

### Requirement: 依赖环境变量时必须提供显式提示

当某个 provider 需要依赖环境变量名称时，系统 MUST 显式提示变量名与手动配置方式，而不是声称已自动完成环境注入。

#### Scenario: `env_key` provider 需要用户后续处理
- **WHEN** 用户完成新增账号或切换账号，且当前 provider 依赖 `env_key`
- **THEN** 系统 SHALL 输出所需变量名和手动设置建议
- **AND** 系统 SHALL NOT 输出“已自动注入 shell profile”之类的成功提示
