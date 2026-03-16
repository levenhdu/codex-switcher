# codex-acm

🔑 **Codex Account Manager** — Codex 多账号切换管理工具，同时支持 **Team 账号**（ChatGPT OAuth）和 **自定义 API**（第三方中转）。

## ✨ 特性

- 🏢 **Team 账号**：通过 ChatGPT OAuth 登录，自动管理 `auth.json`
- 🔑 **自定义 API**：支持第三方中转服务，配置 `base_url` + API Key
- 🔄 **一键切换**：同时更新 `auth.json` 和 `config.toml`，无需手动编辑
- 📋 **多账号管理**：添加、删除、列表、导入，灵活管理多个认证配置
- 🎨 **交互式 UI**：美观的命令行界面，支持交互式选择

## 📦 安装

```bash
# 全局安装
npm install -g codex-acm

# 或直接使用 npx
npx codex-acm
```

## 🚀 快速开始

```bash
# 导入当前已登录的 Team 账号
codex-acm add --team

# 添加自定义 API 账号
codex-acm add --custom

# 查看所有账号
codex-acm list

# 切换账号
codex-acm switch          # 交互式选择
codex-acm switch 1        # 按序号
codex-acm switch "别名"   # 按别名

# 查看当前账号
codex-acm current
```

## 📋 命令

| 命令 | 说明 |
|---|---|
| `codex-acm list` | 列出所有账号 |
| `codex-acm add --team` | 添加 Team 账号 |
| `codex-acm add --custom` | 添加自定义 API 账号 |
| `codex-acm switch [别名\|序号]` | 切换账号 |
| `codex-acm remove` | 删除账号 |
| `codex-acm import <path> [--alias 别名]` | 导入 auth.json |
| `codex-acm current` | 显示当前账号详情 |

## 🔧 工作原理

切换到 **Team 账号**时：
1. 将 Team 的 `auth.json`（JWT Token）恢复到 `~/.codex/auth.json`
2. 移除 `config.toml` 中的自定义 provider（使用默认 OpenAI）

切换到 **自定义 API** 时：
1. 将 `{"OPENAI_API_KEY": "sk-xxx"}` 写入 `~/.codex/auth.json`
2. 在 `config.toml` 中配置 `model_provider` 和 `base_url`

所有账号数据存储在 `~/.codex/accounts/` 目录下。

## 📂 项目结构

```
codex-acm/
├── bin/cli.js          # CLI 入口
├── src/
│   ├── auth.js         # auth.json 读写 & JWT 解析
│   ├── config.js       # config.toml 读写
│   ├── registry.js     # 账号注册表管理
│   ├── switcher.js     # 切换核心逻辑
│   └── ui.js           # 交互式 UI
├── package.json
└── README.md
```

## License

MIT
