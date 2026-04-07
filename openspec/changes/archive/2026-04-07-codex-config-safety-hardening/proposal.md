## Why

对照 `cc-switch` 的实现后，当前仓库在 `~/.codex/auth.json` 和 `~/.codex/config.toml` 的处理上存在明显的安全边界问题：解析失败时可能覆盖用户配置、切回 Team 时会误删整个 `model_providers`、删除活跃自定义账号后会残留 live credentials，并且会把密钥写入 shell profile。现在需要把这几条高风险路径收敛成“最小侵入、失败可恢复、状态一致”的行为。

## What Changes

- 为 `config.toml` 和 `auth.json` 引入失败安全的读写约束，禁止在解析失败时静默回退成空配置并覆盖用户文件。
- 将 provider 清理逻辑收敛为“只修改或删除工具自己管理的 provider”，不再删除整个 `model_providers` 表。
- 收敛活跃账号删除逻辑，确保 registry、live auth 和 live config 在删除后保持一致，不再留下已删除自定义账号的有效凭据。
- 移除新增/切换自定义 API 账号时对 `~/.zshrc`、`~/.bash_profile`、`~/.bashrc` 的自动密钥注入，改为显式提示。
- 为上述行为补充回归测试，覆盖坏配置、切 Team、删除活跃账号、`env_key` 模式等路径。

## Capabilities

### New Capabilities
- `codex-config-safety`: 约束 `config.toml` / `auth.json` 的失败安全、原子性和最小侵入修改边界。
- `account-lifecycle-consistency`: 定义账号切换、删除后的 live 状态和 registry 状态一致性。
- `custom-api-secret-handling`: 定义自定义 API 密钥在 `env_key` 模式下的存储边界和提示行为。

### Modified Capabilities

## Impact

- `src/config.js`
- `src/switcher.js`
- `src/auth.js`
- `bin/cli.js`
- `src/registry.js`
- 新增测试文件，覆盖配置安全和账号生命周期回归场景
