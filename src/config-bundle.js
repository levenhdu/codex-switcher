import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { addAccount, ensureAccountDir, getAccountDir, loadRegistry, saveRegistry } from './registry.js';
import { atomicWriteFile } from './file-utils.js';

export const CONFIG_BUNDLE_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getAccountAuthPath(accountId) {
  return join(getAccountDir(accountId), 'auth.json');
}

function readAccountAuthSnapshot(accountId) {
  const authPath = getAccountAuthPath(accountId);
  if (!existsSync(authPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(authPath, 'utf-8'));
  } catch (error) {
    throw new Error(`账号 ${accountId} 的 auth.json 无法解析: ${error.message}`);
  }
}

function validateBundleAccountItem(item, seenIds) {
  if (!isPlainObject(item)) {
    throw new Error('配置包中的账号项格式不正确');
  }

  const { account, auth_json: authJson } = item;
  if (!isPlainObject(account)) {
    throw new Error('配置包中的账号元数据格式不正确');
  }

  if (typeof account.id !== 'string' || account.id.length === 0) {
    throw new Error('配置包中的账号缺少有效的 id');
  }

  if (account.type !== 'team' && account.type !== 'custom_api') {
    throw new Error(`配置包中的账号类型不受支持: ${account.id}`);
  }

  if (seenIds.has(account.id)) {
    throw new Error(`配置包中存在重复账号 ID: ${account.id}`);
  }
  seenIds.add(account.id);

  if (authJson !== null && !isPlainObject(authJson)) {
    throw new Error(`配置包中的认证快照格式不正确: ${account.id}`);
  }
}

export function createConfigBundle(registry = loadRegistry()) {
  return {
    version: CONFIG_BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    accounts: registry.accounts.map(account => ({
      account: { ...account },
      auth_json: readAccountAuthSnapshot(account.id),
    })),
  };
}

export function writeConfigBundle(filePath, registry = loadRegistry()) {
  const bundle = createConfigBundle(registry);
  atomicWriteFile(filePath, JSON.stringify(bundle, null, 2));
  return bundle;
}

export function readConfigBundle(filePath) {
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(`配置包无法解析: ${error.message}`);
  }

  validateConfigBundle(bundle);
  return bundle;
}

export function validateConfigBundle(bundle, registry = loadRegistry()) {
  if (!isPlainObject(bundle)) {
    throw new Error('配置包格式不正确');
  }

  if (bundle.version !== CONFIG_BUNDLE_VERSION) {
    throw new Error(`配置包版本不受支持: ${bundle.version}`);
  }

  if (!bundle.exported_at || Number.isNaN(Date.parse(bundle.exported_at))) {
    throw new Error('配置包缺少有效的 exported_at');
  }

  if (!Array.isArray(bundle.accounts)) {
    throw new Error('配置包缺少有效的 accounts 列表');
  }

  const seenIds = new Set();
  for (const item of bundle.accounts) {
    validateBundleAccountItem(item, seenIds);
  }

  const existingIds = new Set(registry.accounts.map(account => account.id));
  for (const item of bundle.accounts) {
    const accountId = item.account.id;
    if (existingIds.has(accountId)) {
      throw new Error(`本地已存在同名账号: ${accountId}`);
    }

    const accountDir = getAccountDir(accountId);
    if (existsSync(accountDir)) {
      throw new Error(`本地账号目录已存在，无法导入: ${accountId}`);
    }
  }

  return bundle;
}

export function importConfigBundle(filePath, registry = loadRegistry()) {
  const bundle = readConfigBundle(filePath);
  validateConfigBundle(bundle, registry);

  const createdDirs = [];
  const nextRegistry = {
    active: registry.active,
    accounts: [...registry.accounts],
  };

  try {
    for (const item of bundle.accounts) {
      const { account, auth_json: authJson } = item;
      const dir = ensureAccountDir(account.id);
      createdDirs.push(dir);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      if (authJson !== null) {
        atomicWriteFile(getAccountAuthPath(account.id), JSON.stringify(authJson, null, 2));
      }

      addAccount(nextRegistry, account);
    }

    saveRegistry(nextRegistry);
  } catch (error) {
    for (const dir of createdDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    throw error;
  }

  registry.active = nextRegistry.active;
  registry.accounts = nextRegistry.accounts;

  return {
    imported_count: bundle.accounts.length,
    version: bundle.version,
  };
}
