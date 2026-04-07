## 1. 配置安全收敛

- [x] 1.1 重构 `src/config.js`，使 `config.toml` 解析失败时中止操作并保留原文件。
- [x] 1.2 为 `config.toml` / `auth.json` 增加同目录临时文件写入与失败回滚逻辑。
- [x] 1.3 收敛 Team 切换时的 provider 清理逻辑，只移除工具受控的当前 provider。

## 2. 账号生命周期一致性

- [x] 2.1 调整活跃自定义账号删除流程，确保 registry、live config、live auth 同步撤销。
- [x] 2.2 校正删除后的 CLI 提示，避免把“仍保留 live credential”的状态描述成已重置。
- [x] 2.3 复核切换路径中的 registry 更新时机，避免半成功状态落盘。

## 3. 自定义 API 密钥边界收敛

- [x] 3.1 移除新增账号和切换账号流程中的 shell profile 自动注入调用。
- [x] 3.2 调整 `env_key` 模式提示文案，只输出变量名和手动设置建议。

## 4. 回归验证

- [x] 4.1 增加测试：坏 `config.toml` 不应被覆盖。
- [x] 4.2 增加测试：切回 Team 时保留用户自定义 `model_providers` 条目。
- [x] 4.3 增加测试：删除活跃自定义账号后不再残留 live API Key。
- [x] 4.4 增加测试：`env_key` 模式不会修改 shell profile 文件。
