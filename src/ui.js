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

function getTerminalWidth() {
  const columns = process.stdout.columns || 80;
  return Math.max(64, Math.min(columns, 108));
}

function getContentWidth() {
  return getTerminalWidth() - 2;
}

function fit(text, width) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (value.length <= width) {
    return value.padEnd(width);
  }
  if (width <= 1) {
    return value.slice(0, width);
  }
  return `${value.slice(0, width - 1)}…`;
}

function printDivider(width = getContentWidth()) {
  console.log(c('dim', `  ${'─'.repeat(width)}`));
}

function formatTypeLabel(type) {
  return type === 'team' ? 'team' : 'custom';
}

function formatAccountMeta(account) {
  if (account.type === 'team') {
    const detail = [account.email || '未识别邮箱', account.plan || null].filter(Boolean);
    return detail.join(' · ');
  }

  const detail = [account.base_url || '未配置 base_url', account.model || null].filter(Boolean);
  return detail.join(' · ');
}

function getListLayout() {
  const width = getContentWidth();
  const indexWidth = 4;
  const currentWidth = 6;
  const typeWidth = 10;
  const nameWidth = Math.max(14, Math.min(22, Math.floor(width * 0.24)));
  const detailWidth = Math.max(20, width - indexWidth - currentWidth - typeWidth - nameWidth);

  return {
    width,
    indexWidth,
    currentWidth,
    typeWidth,
    nameWidth,
    detailWidth,
  };
}

function printField(label, value) {
  console.log(`  ${fit(`${label}:`, 10)} ${value}`);
}

/**
 * 打印 Logo
 */
export function printLogo() {
  console.log();
  console.log(`  ${c('bold', 'codex-switcher')}`);
  printDivider(Math.min(34, getContentWidth()));
}

/**
 * 打印账号列表
 */
export function printAccountList(registry) {
  const { accounts, active } = registry;

  if (accounts.length === 0) {
    console.log(c('yellow', '  无已保存账号'));
    console.log(c('dim', '  使用 codex-switcher add 添加账号'));
    return;
  }

  const activeAccount = accounts.find((acc) => acc.id === active);
  const summary = activeAccount
    ? `  已保存 ${accounts.length} 个账号 · 当前 ${activeAccount.alias || activeAccount.id} · ${formatTypeLabel(activeAccount.type)}`
    : `  已保存 ${accounts.length} 个账号`;

  console.log(c('dim', summary));
  const layout = getListLayout();
  printDivider(layout.width);
  const header = `  ${fit('#', layout.indexWidth)}${fit('当前', layout.currentWidth)}${fit('类型', layout.typeWidth)}${fit('名称', layout.nameWidth)}${fit('详情', layout.detailWidth)}`;
  console.log(c('bold', header));
  printDivider(layout.width);

  accounts.forEach((acc, idx) => {
    const num = fit(String(idx + 1), layout.indexWidth);
    const isActive = acc.id === active;
    const status = isActive ? c('green', fit('*', layout.currentWidth)) : c('dim', fit('', layout.currentWidth));
    const typeRaw = fit(formatTypeLabel(acc.type), layout.typeWidth);
    const type = acc.type === 'team' ? c('blue', typeRaw) : c('magenta', typeRaw);
    const alias = fit(acc.alias || acc.id, layout.nameWidth);
    const detail = fit(formatAccountMeta(acc), layout.detailWidth);

    console.log(`  ${num}${status}${type}${alias}${detail}`);
  });

  printDivider(layout.width);
}

/**
 * 交互式选择账号
 * @returns {object|null} 选中的账号
 */
export async function selectAccount(registry, message = '选择账号') {
  if (registry.accounts.length === 0) {
    console.log(c('yellow', '  没有可选账号'));
    return null;
  }

  const choices = registry.accounts.map((acc, idx) => {
    const isActive = acc.id === registry.active;

    return {
      name: `${idx + 1}. ${acc.alias || acc.id}${isActive ? '  [current]' : ''}`,
      description: `${formatTypeLabel(acc.type)} · ${formatAccountMeta(acc)}`,
      value: acc,
    };
  });

  return await select({ message, choices, pageSize: Math.min(10, choices.length) });
}

/**
 * 交互式多选账号（用于删除）
 */
export async function selectMultipleAccounts(registry) {
  if (registry.accounts.length === 0) {
    console.log(c('yellow', '  没有可删除账号'));
    return [];
  }

  const choices = registry.accounts.map((acc) => {
    const isActive = acc.id === registry.active;
    return {
      name: `${acc.alias || acc.id}${isActive ? '  [current]' : ''}`,
      description: `${formatTypeLabel(acc.type)} · ${formatAccountMeta(acc)}`,
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
  console.log(c('bold', '  新建自定义 API'));
  printDivider(Math.min(30, getContentWidth()));

  const alias = await input({
    message: '账号名称',
    default: 'custom-api',
  });

  const base_url = await input({
    message: 'Base URL',
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
    message: '协议',
    choices: [
      { name: 'responses', value: 'responses', description: '默认' },
      { name: 'chat', value: 'chat' },
    ],
  });

  const authMethod = await select({
    message: '认证方式',
    choices: [
      { name: '环境变量', value: 'env_key', description: '推荐。避免覆盖 Team 登录态' },
      { name: 'OpenAI Auth', value: 'openai_auth', description: '仅在代理必须复用 Team Token 时使用' },
    ],
  });

  const review_model = await input({
    message: 'Review 模型（可留空）',
    default: '',
  });

  const model_reasoning_effort = await select({
    message: '推理强度',
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
    requires_openai_auth: authMethod === 'openai_auth' ? true : undefined,
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
  console.log(`  ${c('green', '[ok]')} ${message}`);
}

/**
 * 显示错误消息
 */
export function printError(message) {
  console.log(`  ${c('red', '[x]')} ${message}`);
}

/**
 * 显示信息
 */
export function printInfo(message) {
  console.log(`  ${c('cyan', '[i]')} ${message}`);
}

/**
 * 显示当前账号详情
 */
export function printAccountDetail(account) {
  console.log(c('bold', '  当前账号'));
  printDivider(Math.min(44, getContentWidth()));

  if (!account) {
    console.log(c('yellow', '  未设置活跃账号'));
    printDivider(Math.min(44, getContentWidth()));
    return;
  }

  printField('类型', account.type === 'team' ? c('blue', 'team') : c('magenta', 'custom'));
  printField('名称', c('bold', account.alias || account.id));

  if (account.type === 'team') {
    printField('邮箱', account.email || '未识别');
    printField('计划', account.plan ? c('yellow', account.plan) : '未识别');
  } else {
    printField('Base URL', account.base_url || '未设置');
    printField('模型', account.model || '默认');
    printField('协议', account.wire_api || 'responses');
    if (account.apiKey) {
      printField('API Key', maskSecret(account.apiKey));
    }
  }

  printField('添加于', account.created_at || '未知');
  printDivider(Math.min(44, getContentWidth()));
}
