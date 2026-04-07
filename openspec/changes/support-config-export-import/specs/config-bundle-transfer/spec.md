## ADDED Requirements

### Requirement: 系统必须支持导出工具管理的配置包

系统 MUST 支持将工具管理的账号配置导出为单个可移植配置包，至少包含账号元数据、使用历史、认证快照以及配置包版本信息。

#### Scenario: 导出已保存账号配置
- **WHEN** 用户执行导出配置命令
- **THEN** 系统 SHALL 生成单个配置包文件
- **AND** 系统 SHALL 在配置包中写入 `version`、`exported_at` 和账号列表
- **AND** 系统 SHALL 包含每个账号的元数据、使用历史和账号目录中的认证快照

### Requirement: 系统必须在导入前校验配置包

系统 MUST 在写入任何本地账号数据之前完成配置包的结构校验、版本校验和账号冲突检查；若校验失败，系统 SHALL 拒绝本次导入。

#### Scenario: 配置包结构无效
- **WHEN** 用户导入的配置包缺少必填字段、结构不合法或版本不受支持
- **THEN** 系统 SHALL 返回明确错误
- **AND** 系统 SHALL NOT 写入任何账号目录或注册表变更

#### Scenario: 配置包与本地账号冲突
- **WHEN** 配置包中的账号 ID 与本地已有账号 ID 冲突
- **THEN** 系统 SHALL 拒绝本次导入
- **AND** 系统 SHALL NOT 覆盖已有账号配置

### Requirement: 导入配置包必须只恢复已保存账号配置

系统 SHALL 在导入配置包成功后恢复账号注册表与账号目录中的认证快照，但 SHALL NOT 直接覆盖当前 live `auth.json` 或 `config.toml`，也 SHALL NOT 自动切换当前账号。

#### Scenario: 导入配置包成功
- **WHEN** 用户导入一个通过校验且无冲突的配置包
- **THEN** 系统 SHALL 恢复其中的账号记录到本地注册表
- **AND** 系统 SHALL 恢复每个账号对应的认证快照到账号目录
- **AND** 系统 SHALL NOT 直接修改当前 live `auth.json`
- **AND** 系统 SHALL NOT 直接修改当前 live `config.toml`
- **AND** 系统 SHALL NOT 自动切换当前账号
