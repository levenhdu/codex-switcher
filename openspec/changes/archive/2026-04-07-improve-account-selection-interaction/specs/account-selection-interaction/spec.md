## ADDED Requirements

### Requirement: 交互式账号选择必须支持键盘导航

系统 MUST 在需要用户交互式选择账号时提供可键盘导航的选择列表，使用户能够使用上下方向键浏览候选账号并确认目标项，而不依赖手动输入序号。

#### Scenario: 交互式切换账号
- **WHEN** 用户在未传入账号参数的情况下执行账号切换
- **THEN** 系统 SHALL 展示可通过上下方向键导航的账号选择列表
- **AND** 系统 SHALL 允许用户直接确认当前高亮账号作为切换目标

#### Scenario: 交互式删除账号
- **WHEN** 用户进入交互式账号删除流程
- **THEN** 系统 SHALL 展示可通过上下方向键导航的账号多选列表
- **AND** 系统 SHALL 保留现有的多选确认方式

### Requirement: 交互式账号列表必须按最近使用和使用频次排序

系统 SHALL 为账号保存最近使用时间与累计使用次数，并在交互式账号选择列表中优先展示最近使用过且使用频次更高的账号。

#### Scenario: 最近使用账号优先展示
- **WHEN** 多个账号都存在使用历史，且它们的最近使用时间不同
- **THEN** 系统 SHALL 按 `last_used_at` 从新到旧排序交互式账号列表

#### Scenario: 最近时间相同时按频次排序
- **WHEN** 多个账号的最近使用时间相同或均缺失
- **THEN** 系统 SHALL 按 `use_count` 从高到低排序这些账号

#### Scenario: 无历史账号保持稳定顺序
- **WHEN** 账号没有 `last_used_at` 和 `use_count` 等使用历史
- **THEN** 系统 SHALL 保持它们在注册表中的原有相对顺序

#### Scenario: 切换成功后更新使用历史
- **WHEN** 用户成功切换到某个账号
- **THEN** 系统 SHALL 更新该账号的 `last_used_at`
- **AND** 系统 SHALL 将该账号的 `use_count` 增加 1
