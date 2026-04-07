## Context

当前工具直接读写 `~/.codex/auth.json` 与 `~/.codex/config.toml`，但有几条路径会越过“最小侵入”的边界：

- `readConfig()` 解析失败时返回空对象，后续写入会用新的 TOML 覆盖掉原文件。
- `resetToDefault()` 会删除整个 `model_providers`，误伤用户自己维护的 provider。
- 删除活跃自定义账号时只清 registry 和 config，没有同步移除 live `auth.json` 中的已删除凭据。
- `env_key` 模式会自动把密钥写进多个 shell profile 文件，副作用超出 `CODEX_HOME` 范围。

对照 `cc-switch` 的思路，这次变更的方向不是“功能更多”，而是把 live 配置更新收敛为更可预期、更可回滚的路径。

## Goals / Non-Goals

**Goals:**
- 配置解析失败时不覆盖用户原文件。
- 切换 Team / Custom 账号时只修改工具受控的 provider 配置。
- 删除活跃自定义账号后，不再保留它的 live credential。
- 停止自动把 API Key 写入 shell profile。
- 为关键路径补充自动化回归测试。

**Non-Goals:**
- 本次不引入系统级密钥链或新的 secret storage。
- 本次不实现 TOML 注释/空白的完整语法级保留。
- 本次不自动清理用户 shell 文件里已经存在的历史注入条目。

## Decisions

### 1. 配置读取失败时中止变更，而不是回退为空配置

- **Decision**: `config.toml` 读取或解析失败时，切换/删除/模型修改流程直接报错退出，并保留原文件不变。
- **Why**: 对用户配置来说，“操作失败”远比“静默覆盖成新文件”安全。
- **Alternative considered**: 继续返回 `{}` 并尽量重建缺失字段。
  这个方案会把解析失败和“用户本来就是空配置”混为一谈，风险最高。

### 2. 只删除当前活跃的受控 provider，不清空整个 `model_providers`

- **Decision**: 受控 provider 的增删改以当前账号对应的 provider key 为边界；切回 Team 时只清除该 key 和关联的 `model_provider` 指向，不再删除整个 `model_providers` 表。
- **Why**: 用户可能本来就在 `config.toml` 里维护其他 provider；工具不应越权清理。
- **Alternative considered**: 继续删除整个 `model_providers`。
  该方案实现简单，但会直接破坏用户已有配置，与“最小侵入”目标冲突。

### 3. `auth.json` 与 `config.toml` 更新按单次事务思路处理

- **Decision**: 账号切换时先准备目标内容，再用同目录临时文件 + rename 的方式写入；如果第二步失败，则回滚前一步。
- **Why**: 切换是跨文件状态更新，用户感知的是“切换成功”或“切换失败”，不应该出现半成功状态。
- **Alternative considered**: 保留现有顺序写入。
  当前模式一旦中途失败，就会留下 live auth 和 live config 不一致的状态。

### 4. 删除活跃自定义账号时同步撤销 live credential

- **Decision**: 当被删除账号是当前活跃 `custom_api` 账号时，除清理 registry 和受控 provider 外，还要移除或重置当前 `auth.json` 中属于该账号的凭据。
- **Why**: 删除后仍让已删除账号继续作为 live credential 生效，会让 registry 状态和真实运行态脱节。
- **Alternative considered**: 仅调整提示文案，不改 live auth。
  这只能掩盖问题，不能解决状态不一致。

### 5. `env_key` 模式保留声明能力，但停止自动写 shell profile

- **Decision**: `env_key` 继续作为 provider 配置项保留在 `config.toml` 中，但新增/切换流程不再调用 shell profile 注入；CLI 仅提示变量名和手动设置方式。
- **Why**: 这样能保留兼容性，同时把副作用限制在工具受控范围。
- **Alternative considered**: 保留自动注入但改为确认式交互。
  即使增加确认，工具仍会承担修改用户 shell 启动文件的副作用。

## Risks / Trade-offs

- **[Risk]** 更严格的配置校验会让部分以前“凑合能用”的坏配置现在直接失败。**Mitigation**：报错信息要明确指出是 `config.toml` 无法安全解析，而不是泛化成切换失败。
- **[Risk]** 不再自动写 shell profile 后，依赖旧行为的用户需要手动处理环境变量。**Mitigation**：CLI 明确输出变量名和建议命令。
- **[Risk]** 事务化写入和回滚需要新增更多文件操作分支。**Mitigation**：用临时目录和回归测试覆盖成功/失败路径。

## Migration Plan

1. 增加 OpenSpec delta specs，明确配置安全和账号生命周期行为。
2. 重构 `src/config.js` 的安全读取、受控 provider 更新与原子写入路径。
3. 重构 `src/switcher.js` / `bin/cli.js` 的活跃账号删除与 live auth cleanup。
4. 移除 `src/auth.js` 中自动 shell profile 注入的调用路径，并调整 CLI 提示。
5. 补充测试，验证坏 TOML、切 Team、删除活跃账号、`env_key` 模式四条核心路径。

## Open Questions

- 是否需要在后续单独增加一个清理命令，帮助用户移除历史版本写入 shell profile 的密钥行。
- 对于“删除活跃 Team 账号”场景，是否要进一步引导用户切到其他账号而不是简单清 registry。
