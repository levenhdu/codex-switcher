/**
 * 账号切换核心逻辑
 * 同时更新 auth.json 和 config.toml
 */
import { readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { ensureAccountDir, getAccountDir, removeAccount, markAccountUsed } from './registry.js';
import {
  writeAuthJson, backupAuthTo, restoreAuthFrom, clearAuthJson,
  buildCustomApiAuth, extractAuthInfo, snapshotAuthFile, restoreAuthFile,
} from './auth.js';
import {
  applyCustomProvider,
  resetToDefault,
  snapshotConfigFile,
  restoreConfigFile,
  getManagedProviderKeys,
} from './config.js';

/**
 * 备份当前活跃账号的认证文件
 * @param {object} registry - 注册表
 */
export function backupCurrentAuth(registry) {
  if (registry.active) {
    const dir = ensureAccountDir(registry.active);
    backupAuthTo(dir);
  }
}

function getActiveManagedAccount(registry) {
  return registry.accounts.find(
    account => account.id === registry.active && account.type !== 'team'
  ) || null;
}

function getLiveManagedProviderKeys(registry) {
  const managedAccounts = [...registry.accounts];
  const activeManagedAccount = getActiveManagedAccount(registry);
  if (activeManagedAccount) {
    managedAccounts.push(activeManagedAccount);
  }
  return getManagedProviderKeys(managedAccounts);
}

async function runLiveStateTransaction(action) {
  const authSnapshot = snapshotAuthFile();
  const configSnapshot = snapshotConfigFile();

  try {
    await action();
  } catch (error) {
    try {
      restoreAuthFile(authSnapshot);
      restoreConfigFile(configSnapshot);
    } catch (rollbackError) {
      throw new Error(`${error.message}；回滚失败: ${rollbackError.message}`);
    }
    throw error;
  }
}

/**
 * 切换到 Team 账号
 * 1. 备份当前 auth.json
 * 2. 从账号目录恢复 auth.json
 * 3. 移除 config.toml 中的自定义 provider
 */
export async function switchToTeam(registry, account) {
  // 备份当前
  backupCurrentAuth(registry);

  await runLiveStateTransaction(async () => {
    // 恢复目标账号的 auth.json
    const srcDir = getAccountDir(account.id);
    restoreAuthFrom(srcDir);

    // 移除所有工具受控 provider，保留用户自定义 provider
    resetToDefault(getLiveManagedProviderKeys(registry), account);
  });
}

/**
 * 切换到自定义 API 账号
 * 1. 备份当前 auth.json
 * 2. 写入自定义 API 的 auth.json
 * 3. 在 config.toml 中设置自定义 provider
 */
export async function switchToCustom(registry, account) {
  // 备份当前
  backupCurrentAuth(registry);

  await runLiveStateTransaction(async () => {
    // 读取账号目录中保存的 auth.json（包含 API Key）
    const srcDir = getAccountDir(account.id);
    try {
      restoreAuthFrom(srcDir);
    } catch {
      // 如果账号目录没有 auth.json，用 apiKey 生成一个
      if (account.apiKey) {
        const authData = buildCustomApiAuth(account.apiKey);
        writeAuthJson(authData);
      } else {
        throw new Error(`账号认证文件不存在: ${account.id}`);
      }
    }

    // 设置 config.toml 中的自定义 provider
    applyCustomProvider(account, getLiveManagedProviderKeys(registry));
  });
}

/**
 * 根据账号类型自动切换
 */
export async function switchAccount(registry, account) {
  if (account.type === 'team') {
    await switchToTeam(registry, account);
  } else if (account.type === 'custom_api') {
    await switchToCustom(registry, account);
  } else {
    throw new Error(`未知账号类型: ${account.type}`);
  }

  markAccountUsed(registry, account.id);
}

/**
 * 删除账号，并在删除活跃自定义账号时同步撤销 live 状态
 */
export async function deleteAccounts(registry, accountIds) {
  const selectedAccounts = registry.accounts.filter(account => accountIds.includes(account.id));
  const activeAccount = selectedAccounts.find(account => account.id === registry.active) || null;

  if (activeAccount && activeAccount.type !== 'team') {
    await runLiveStateTransaction(async () => {
      clearAuthJson();
      resetToDefault(getLiveManagedProviderKeys(registry));
    });
  }

  for (const id of accountIds) {
    removeAccount(registry, id);

    const dir = getAccountDir(id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  return {
    activeDeleted: Boolean(activeAccount),
    removedActiveType: activeAccount?.type || null,
  };
}

/**
 * 导入 auth.json 文件并添加为账号
 * 自动识别账号类型（Team / API Key）
 * @returns {object} 导入的账号信息
 */
export function importAuthFile(filePath, alias) {
  if (!existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const authData = JSON.parse(readFileSync(filePath, 'utf-8'));
  const info = extractAuthInfo(authData);

  if (!info) {
    throw new Error('无法识别 auth.json 格式');
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

    // 保存 auth.json 到账号目录
    const dir = ensureAccountDir(id);
    copyFileSync(filePath, `${dir}/auth.json`);
  } else {
    const id = alias || `apikey-${Date.now()}`;
    account = {
      id,
      type: 'custom_api',
      alias: alias || 'API Key 账号',
      apiKey: info.apiKey,
      created_at: new Date().toISOString(),
    };

    // 保存 auth.json 到账号目录
    const dir = ensureAccountDir(id);
    copyFileSync(filePath, `${dir}/auth.json`);
  }

  return account;
}
