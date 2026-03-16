/**
 * 交互式 UI 和终端输出
 */
import { select, input, confirm, checkbox } from '@inquirer/prompts';
import { maskSecret } from './auth.js';

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

/**
 * 打印 Logo
 */
export function printLogo() {
  console.log();
  console.log(c('cyan', '  ╔═══════════════════════════════════════╗'));
  console.log(c('cyan', '  ║') + c('bold', '   🔑 Codex Account Manager            ') + c('cyan', '║'));
  console.log(c('cyan', '  ║') + c('dim', '   支持 Team 账号 + 自定义 API          ') + c('cyan', '║'));
  console.log(c('cyan', '  ╚═══════════════════════════════════════╝'));
  console.log();
}

/**
 * 打印账号列表
 */
export function printAccountList(registry) {
  const { accounts, active } = registry;

  if (accounts.length === 0) {
    console.log(c('yellow', '  还没有添加任何账号。'));
    console.log(c('dim', '  使用 codex-switcher add 添加账号'));
    return;
  }

  // 表头
  const header = `  ${'#'.padEnd(4)}${'状态'.padEnd(6)}${'类型'.padEnd(12)}${'别名'.padEnd(20)}${'详情'}`;
  console.log(c('dim', '  ' + '─'.repeat(72)));
  console.log(c('bold', header));
  console.log(c('dim', '  ' + '─'.repeat(72)));

  accounts.forEach((acc, idx) => {
    const num = String(idx + 1).padEnd(4);
    const isActive = acc.id === active;
    const status = isActive ? c('green', '● 活跃') : c('dim', '  ─   ');
    const type = acc.type === 'team'
      ? c('blue', 'Team'.padEnd(10))
      : c('magenta', 'Custom'.padEnd(10));
    const alias = (acc.alias || acc.id).padEnd(18);

    let detail = '';
    if (acc.type === 'team') {
      const email = acc.email || '未知';
      const plan = acc.plan ? c('yellow', `[${acc.plan}]`) : '';
      detail = `${email} ${plan}`;
    } else {
      const url = acc.base_url || '未设置';
      const model = acc.model ? c('cyan', `[${acc.model}]`) : '';
      detail = `${url} ${model}`;
    }

    console.log(`  ${num}${status}  ${type}${alias}${detail}`);
  });

  console.log(c('dim', '  ' + '─'.repeat(72)));
  console.log();
}

/**
 * 交互式选择账号
 * @returns {object|null} 选中的账号
 */
export async function selectAccount(registry, message = '选择账号') {
  if (registry.accounts.length === 0) {
    console.log(c('yellow', '  没有可选的账号'));
    return null;
  }

  const choices = registry.accounts.map((acc, idx) => {
    const isActive = acc.id === registry.active;
    const tag = acc.type === 'team' ? '🏢 Team' : '🔑 Custom';
    const activeTag = isActive ? ' ✅' : '';
    let desc = '';
    if (acc.type === 'team') {
      desc = acc.email || '未知邮箱';
      if (acc.plan) desc += ` [${acc.plan}]`;
    } else {
      desc = acc.base_url || '未配置';
      if (acc.model) desc += ` [${acc.model}]`;
    }

    return {
      name: `${tag} ${acc.alias || acc.id} — ${desc}${activeTag}`,
      value: acc,
    };
  });

  return await select({ message, choices });
}

/**
 * 交互式多选账号（用于删除）
 */
export async function selectMultipleAccounts(registry) {
  if (registry.accounts.length === 0) {
    console.log(c('yellow', '  没有可删除的账号'));
    return [];
  }

  const choices = registry.accounts.map((acc) => {
    const tag = acc.type === 'team' ? '🏢' : '🔑';
    const isActive = acc.id === registry.active;
    const desc = acc.type === 'team' ? (acc.email || '未知') : (acc.base_url || '未配置');
    return {
      name: `${tag} ${acc.alias || acc.id} — ${desc}${isActive ? ' (当前活跃)' : ''}`,
      value: acc.id,
    };
  });

  return await checkbox({
    message: '选择要删除的账号（空格选中，回车确认）',
    choices,
  });
}

/**
 * 自定义 API 配置输入表单
 */
export async function inputCustomApiConfig() {
  console.log();
  console.log(c('cyan', '  📝 配置自定义 API 账号'));
  console.log(c('dim', '  请输入以下信息：'));
  console.log();

  const alias = await input({
    message: '别名（用于标识此账号）',
    default: '自定义 API',
  });

  const base_url = await input({
    message: 'API Base URL',
    default: 'https://api.example.com',
    validate: (v) => v.startsWith('http') || '请输入有效的 URL',
  });

  const apiKey = await input({
    message: 'API Key',
    validate: (v) => v.length > 0 || '请输入 API Key',
  });

  const model = await input({
    message: '默认模型',
    default: 'gpt-5.4',
  });

  const wire_api = await select({
    message: 'Wire API 协议',
    choices: [
      { name: 'responses (推荐)', value: 'responses' },
      { name: 'chat', value: 'chat' },
    ],
  });

  const authMethod = await select({
    message: '认证方式',
    choices: [
      { name: '🔑 通过环境变量传递 Key（推荐，避免与 Team 认证冲突）', value: 'env_key' },
      { name: '⚠️  通过 OpenAI OAuth 认证（仅限需要 Team Token 的代理）', value: 'openai_auth' },
    ],
  });

  const review_model = await input({
    message: 'Review 模型（可选，直接回车跳过）',
    default: '',
  });

  const model_reasoning_effort = await select({
    message: '推理深度',
    choices: [
      { name: 'high', value: 'high' },
      { name: 'xhigh', value: 'xhigh' },
      { name: 'medium', value: 'medium' },
      { name: 'low', value: 'low' },
    ],
  });

  const id = `custom-${alias.replace(/\s+/g, '-').toLowerCase()}-${Date.now().toString(36)}`;

  return {
    id,
    type: 'custom_api',
    alias,
    base_url,
    apiKey,
    model,
    review_model: review_model || undefined,
    wire_api,
    model_reasoning_effort,
    requires_openai_auth: authMethod === 'openai_auth',
    env_key: authMethod === 'env_key' ? `CODEX_KEY_${alias.replace(/\s+/g, '_').toUpperCase()}` : undefined,
    created_at: new Date().toISOString(),
  };
}

/**
 * 确认操作
 */
export async function confirmAction(message) {
  return await confirm({ message, default: false });
}

/**
 * 显示成功消息
 */
export function printSuccess(message) {
  console.log(c('green', `  ✅ ${message}`));
}

/**
 * 显示错误消息
 */
export function printError(message) {
  console.log(c('red', `  ❌ ${message}`));
}

/**
 * 显示信息
 */
export function printInfo(message) {
  console.log(c('cyan', `  ℹ️  ${message}`));
}

/**
 * 显示当前账号详情
 */
export function printAccountDetail(account) {
  console.log();
  console.log(c('bold', '  📋 当前活跃账号'));
  console.log(c('dim', '  ' + '─'.repeat(40)));

  if (!account) {
    console.log(c('yellow', '  未设置活跃账号'));
    return;
  }

  console.log(`  类型:  ${account.type === 'team' ? c('blue', '🏢 Team') : c('magenta', '🔑 Custom API')}`);
  console.log(`  别名:  ${c('bold', account.alias || account.id)}`);

  if (account.type === 'team') {
    console.log(`  邮箱:  ${account.email || '未知'}`);
    console.log(`  计划:  ${account.plan ? c('yellow', account.plan) : '未知'}`);
  } else {
    console.log(`  URL:   ${account.base_url || '未设置'}`);
    console.log(`  模型:  ${account.model || '默认'}`);
    console.log(`  协议:  ${account.wire_api || 'responses'}`);
    if (account.apiKey) {
      console.log(`  Key:   ${maskSecret(account.apiKey)}`);
    }
  }

  console.log(`  添加于: ${account.created_at || '未知'}`);
  console.log(c('dim', '  ' + '─'.repeat(40)));
  console.log();
}
