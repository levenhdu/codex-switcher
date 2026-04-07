#!/usr/bin/env node

/**
 * codex-switcher CLI 入口
 * 支持 Team 账号和自定义 API 的多账号切换管理
 */
import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadRegistry, saveRegistry, addAccount, findAccount, setActive, ensureAccountDir } from '../src/registry.js';
import { readAuthJson, extractAuthInfo, buildCustomApiAuth, backupAuthTo } from '../src/auth.js';
import { switchAccount, deleteAccounts } from '../src/switcher.js';
import {
  printLogo, printAccountList, selectAccount, selectMultipleAccounts,
  inputCustomApiConfig, confirmAction, printSuccess, printError, printInfo,
  printAccountDetail,
} from '../src/ui.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  try {
    switch (command) {
      case 'list':
      case 'ls':
        await handleList();
        break;
      case 'add':
        await handleAdd();
        break;
      case 'switch':
      case 'sw':
        await handleSwitch();
        break;
      case 'model':
      case 'mod':
        await handleModel();
        break;
      case 'remove':
      case 'rm':
        await handleRemove();
        break;
      case 'import':
        await handleImport();
        break;
      case 'current':
      case 'status':
        await handleCurrent();
        break;
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;
      case 'version':
      case '--version':
      case '-v':
        printVersion();
        break;
      default:
        printError(`未知命令: ${command}`);
        console.log();
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    if (err.name === 'ExitPromptError') {
      // 用户按 Ctrl+C 取消
      console.log();
      process.exit(0);
    }
    printError(err.message);
    process.exit(1);
  }
}

// ─── list ─────────────────────────────────────────
async function handleList() {
  printLogo();
  const registry = loadRegistry();

  // 同步当前 auth.json 状态
  syncCurrentAuth(registry);

  printAccountList(registry);
}

// ─── add ──────────────────────────────────────────
async function handleAdd() {
  printLogo();
  const registry = loadRegistry();

  const typeFlag = args[1];
  let accountType;

  if (typeFlag === '--team' || typeFlag === '-t') {
    accountType = 'team';
  } else if (typeFlag === '--custom' || typeFlag === '-c') {
    accountType = 'custom_api';
  } else {
    // 交互选择
    const { select } = await import('@inquirer/prompts');
    accountType = await select({
      message: '选择账号类型',
      choices: [
        { name: 'Team 账号', value: 'team', description: '使用 ChatGPT / Team 登录态' },
        { name: '自定义 API', value: 'custom_api', description: '使用第三方或中转 API 配置' },
      ],
    });
  }

  if (accountType === 'team') {
    await addTeamAccount(registry);
  } else {
    await addCustomAccount(registry);
  }
}

async function addTeamAccount(registry) {
  const { select, input } = await import('@inquirer/prompts');

  const method = await select({
    message: 'Team 账号添加方式',
    choices: [
      { name: '读取当前登录态', value: 'current', description: '从 ~/.codex/auth.json 导入' },
      { name: '运行 codex login', value: 'login', description: '登录新账号后再导入' },
      { name: '从文件导入', value: 'file', description: '手动指定 auth.json 路径' },
    ],
  });

  if (method === 'login') {
    printInfo('启动 codex login');
    const { execSync } = await import('node:child_process');
    try {
      execSync('codex login', { stdio: 'inherit' });
    } catch {
      printError('codex login 失败，完成登录后再执行“读取当前登录态”');
      return;
    }
  }

  let authPath;
  if (method === 'file') {
    authPath = await input({
      message: 'auth.json 文件路径',
      validate: (v) => existsSync(resolve(v)) || '文件不存在',
    });
    authPath = resolve(authPath);
  }

  // 读取 auth.json
  let authData;
  if (authPath) {
    authData = JSON.parse(readFileSync(authPath, 'utf-8'));
  } else {
    authData = readAuthJson();
  }

  if (!authData) {
    printError('无法读取 auth.json');
    return;
  }

  const info = extractAuthInfo(authData);
  if (!info || info.type !== 'team') {
    printError('当前 auth.json 不是 Team/ChatGPT 登录格式');
    return;
  }

  const alias = await input({
    message: '账号名称',
    default: info.email || 'team',
  });

  const account = {
    id: info.email || `team-${Date.now()}`,
    type: 'team',
    alias,
    email: info.email,
    plan: info.plan,
    accountId: info.accountId,
    created_at: new Date().toISOString(),
  };

  // 保存 auth.json 到账号目录
  const dir = ensureAccountDir(account.id);
  if (authPath) {
    copyFileSync(authPath, `${dir}/auth.json`);
  } else {
    backupAuthTo(dir);
  }

  addAccount(registry, account);
  saveRegistry(registry);

  printSuccess(`已添加 team 账号: ${alias}`);
  printInfo(`邮箱: ${info.email || '未识别'} | 计划: ${info.plan || '未识别'}`);
}

async function addCustomAccount(registry) {
  const account = await inputCustomApiConfig();

  // 保存 auth.json 到账号目录
  const dir = ensureAccountDir(account.id);
  let authData;
  if (account.requires_openai_auth) {
    // 使用 requires_openai_auth 模式，Key 放入 auth.json 的 OPENAI_API_KEY 字段
    authData = buildCustomApiAuth(account.apiKey);
  } else {
    // 使用 env_key 模式，也保存一份以备切换
    authData = buildCustomApiAuth(account.apiKey);
  }

  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${dir}/auth.json`, JSON.stringify(authData, null, 2), 'utf-8');

  addAccount(registry, account);
  saveRegistry(registry);

  printSuccess(`已添加 custom 账号: ${account.alias}`);
  printInfo(`Base URL: ${account.base_url}`);
  printInfo(`模型: ${account.model}`);

  if (account.env_key) {
    console.log();
    printInfo(`此账号依赖环境变量 ${account.env_key}`);
    printInfo(`请手动设置后再使用，例如: export ${account.env_key}="${account.apiKey}"`);
  }
}

// ─── switch ───────────────────────────────────────
async function handleSwitch() {
  printLogo();
  const registry = loadRegistry();

  if (registry.accounts.length === 0) {
    printError('还没有账号，先运行 codex-switcher add');
    return;
  }

  let account;

  // 检查是否传了参数（别名或索引）
  const target = args[1];
  if (target) {
    // 尝试按数字索引
    const idx = parseInt(target, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= registry.accounts.length) {
      account = registry.accounts[idx - 1];
    } else {
      // 按别名/ID 模糊匹配
      account = findAccount(registry, target);
    }

    if (!account) {
      printError(`未找到匹配的账号: ${target}`);
      printAccountList(registry);
      return;
    }
  } else {
    // 交互式选择
    account = await selectAccount(registry, '切换到哪个账号？');
    if (!account) return;
  }

  if (account.id === registry.active) {
    // 即使注册表已标记为活跃，也重新应用配置，确保 config.toml 与注册表状态同步
    printInfo('已是当前账号，重新写入配置');
    await switchAccount(registry, account);
    saveRegistry(registry);
    const tag = account.type === 'team' ? 'team' : 'custom';
    printSuccess(`当前账号: ${account.alias || account.id} (${tag})`);
    if (account.type === 'team') {
      printInfo(`邮箱: ${account.email || '未识别'} | 计划: ${account.plan || '未识别'}`);
    } else {
      printInfo(`URL: ${account.base_url} | 模型: ${account.model}`);
    }
    return;
  }

  // 执行切换
  await switchAccount(registry, account);
  setActive(registry, account.id);
  saveRegistry(registry);

  const tag = account.type === 'team' ? 'team' : 'custom';
  printSuccess(`当前账号: ${account.alias || account.id} (${tag})`);

  if (account.type === 'team') {
    printInfo(`邮箱: ${account.email || '未识别'} | 计划: ${account.plan || '未识别'}`);
  } else {
    printInfo(`URL: ${account.base_url} | 模型: ${account.model}`);
  }
}

// ─── remove ───────────────────────────────────────
async function handleRemove() {
  printLogo();
  const registry = loadRegistry();

  const selectedIds = await selectMultipleAccounts(registry);
  if (!selectedIds || selectedIds.length === 0) {
    printInfo('未选择账号');
    return;
  }

  const names = selectedIds.map(id => {
    const acc = registry.accounts.find(a => a.id === id);
    return acc?.alias || id;
  }).join('、');

  const ok = await confirmAction(`确定删除以下账号吗？${names}`);
  if (!ok) {
    printInfo('已取消');
    return;
  }

  const result = await deleteAccounts(registry, selectedIds);
  saveRegistry(registry);

  if (result.removedActiveType === 'custom_api') {
    printInfo('当前 custom 账号已删除，live API 凭据和受控 provider 已撤销');
  } else if (result.activeDeleted) {
    printInfo('当前账号已从注册表移除；live 登录态可能仍保留');
  }

  printSuccess(`已删除 ${selectedIds.length} 个账号及配置文件`);
}

// ─── import ───────────────────────────────────────
async function handleImport() {
  printLogo();
  const filePath = args[1];

  if (!filePath) {
    printError('请指定 auth.json 文件路径');
    printInfo('用法: codex-switcher import <path> [--alias <名称>]');
    return;
  }

  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    printError(`文件不存在: ${absPath}`);
    return;
  }

  // 解析 --alias 参数
  const aliasIdx = args.indexOf('--alias');
  const alias = aliasIdx >= 0 ? args[aliasIdx + 1] : undefined;

  const registry = loadRegistry();

  // 读取并解析
  const authData = JSON.parse(readFileSync(absPath, 'utf-8'));
  const info = extractAuthInfo(authData);

  if (!info) {
    printError('无法识别 auth.json 格式');
    return;
  }

  let account;
  if (info.type === 'team') {
    const id = info.email || `team-${Date.now()}`;
    account = {
      id,
      type: 'team',
      alias: alias || info.email || 'Team 账号',
      email: info.email,
      plan: info.plan,
      accountId: info.accountId,
      created_at: new Date().toISOString(),
    };
  } else {
    const id = alias || `apikey-${Date.now()}`;
    account = {
      id,
      type: 'custom_api',
      alias: alias || 'API Key 账号',
      apiKey: info.apiKey,
      created_at: new Date().toISOString(),
    };
  }

  // 保存 auth.json 到账号目录
  const dir = ensureAccountDir(account.id);
  copyFileSync(absPath, `${dir}/auth.json`);

  addAccount(registry, account);
  saveRegistry(registry);

  const tag = account.type === 'team' ? 'team' : 'custom';
  printSuccess(`已导入 ${tag} 账号: ${account.alias}`);
}

// ─── current ──────────────────────────────────────
async function handleCurrent() {
  printLogo();
  const registry = loadRegistry();
  syncCurrentAuth(registry);

  const activeAccount = registry.accounts.find(a => a.id === registry.active);
  printAccountDetail(activeAccount);
}

// ─── 辅助 ─────────────────────────────────────────

/**
 * 同步当前 auth.json 状态到注册表
 * 如果用户通过 codex login 切换了账号，自动更新
 */
function syncCurrentAuth(registry) {
  const authData = readAuthJson();
  if (!authData) return;

  const info = extractAuthInfo(authData);
  if (!info) return;

  if (info.type === 'team' && info.email) {
    // 检查是否已在注册表中
    const existing = registry.accounts.find(a => a.email === info.email);
    if (existing) {
      // 更新活跃状态
      if (registry.active !== existing.id) {
        registry.active = existing.id;
        saveRegistry(registry);
      }
    }
  }
}

// ─── help & version ───────────────────────────────

function printHelp() {
  printLogo();
  console.log('  usage');
  console.log('    codex-switcher <command> [options]');
  console.log();
  console.log('  commands');
  console.log('    list, ls                查看已保存账号');
  console.log('    add [--team|--custom]   添加账号');
  console.log('    switch, sw [别名|序号]  切换账号');
  console.log('    model, mod [模型名]     设置当前模型');
  console.log('    remove, rm              删除账号');
  console.log('    import <path> [--alias] 导入 auth.json');
  console.log('    current, status         查看当前账号');
  console.log('    help, -h                显示帮助');
  console.log('    version, -v             显示版本');
  console.log();
  console.log('  examples');
  console.log('    codex-switcher add --team');
  console.log('    codex-switcher add --custom');
  console.log('    codex-switcher switch');
  console.log('    codex-switcher switch 1');
  console.log('    codex-switcher switch "备用账号"');
  console.log('    codex-switcher model gpt-5.4 --effort xhigh');
  console.log('    codex-switcher import auth.json --alias "备用号"');
  console.log();
}

function printVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    console.log(`codex-switcher v${pkg.version}`);
  } catch {
    console.log('codex-switcher v1.0.0');
  }
}

// ─── model ────────────────────────────────────────
async function handleModel() {
  printLogo();

  const { readConfig, writeConfig } = await import('../src/config.js');

  // 内置常用模型列表
  const MODEL_CHOICES = [
    { name: 'gpt-5.4', value: 'gpt-5.4', description: 'flagship' },
    { name: 'gpt-5.3-codex', value: 'gpt-5.3-codex', description: 'coding' },
    { name: 'gpt-4.5', value: 'gpt-4.5', description: 'balanced' },
    { name: 'gpt-4o', value: 'gpt-4o', description: 'fast' },
    { name: '自定义输入', value: '__custom__' },
  ];

  const EFFORT_CHOICES = [
    { name: 'xhigh', value: 'xhigh', description: '最强推理' },
    { name: 'high', value: 'high', description: '高推理' },
    { name: 'medium', value: 'medium', description: '中等推理' },
    { name: 'low', value: 'low', description: '更快' },
  ];

  const { select, input } = await import('@inquirer/prompts');

  // 解析命令行参数: model [模型名] [--effort <effort>]
  let modelName = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const effortIdx = args.indexOf('--effort');
  let effort = effortIdx >= 0 ? args[effortIdx + 1] : null;

  // 读取当前配置
  const config = readConfig();
  const currentModel = config.model || '未设置';
  const currentEffort = config.model_reasoning_effort || '未设置';

  printInfo(`当前模型: ${currentModel} | 推理: ${currentEffort}`);
  console.log();

  // 交互式选择模型（如未通过参数指定）
  if (!modelName) {
    const choice = await select({ message: '选择目标模型', choices: MODEL_CHOICES });
    if (choice === '__custom__') {
      modelName = await input({
        message: '输入模型名称',
        validate: (v) => v.length > 0 || '不能为空',
      });
    } else {
      modelName = choice;
    }
  }

  // 交互式选择推理深度（如未通过参数指定）
  if (!effort) {
    effort = await select({ message: '选择推理深度', choices: EFFORT_CHOICES });
  }

  // 写入 config.toml
  config.model = modelName;
  config.model_reasoning_effort = effort;
  writeConfig(config);

  // 同步更新 registry 中当前活跃账号的 model/effort
  const registry = loadRegistry();
  if (registry.active) {
    const activeAcc = registry.accounts.find(a => a.id === registry.active);
    if (activeAcc) {
      activeAcc.model = modelName;
      activeAcc.model_reasoning_effort = effort;
      saveRegistry(registry);
    }
  }

  printSuccess(`模型已切换: ${modelName} | 推理: ${effort}`);
}

main();
