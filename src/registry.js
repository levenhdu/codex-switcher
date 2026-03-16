/**
 * 账号注册表管理
 * 管理 ~/.codex/accounts/registry.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCodexHome } from './auth.js';

/**
 * 获取 accounts 目录路径
 */
export function getAccountsDir() {
  return join(getCodexHome(), 'accounts');
}

/**
 * 获取 registry.json 路径
 */
export function getRegistryPath() {
  return join(getAccountsDir(), 'registry.json');
}

/**
 * 加载注册表，不存在则返回空注册表
 */
export function loadRegistry() {
  const path = getRegistryPath();
  if (!existsSync(path)) {
    return { active: null, accounts: [] };
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return { active: null, accounts: [] };
  }
}

/**
 * 保存注册表
 */
export function saveRegistry(registry) {
  const dir = getAccountsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * 获取账号存储目录（每个账号一个子目录）
 */
export function getAccountDir(accountId) {
  // 用 base64url 编码 accountId 作为目录名，避免特殊字符问题
  const safeName = Buffer.from(accountId).toString('base64url');
  return join(getAccountsDir(), safeName);
}

/**
 * 确保账号目录存在
 */
export function ensureAccountDir(accountId) {
  const dir = getAccountDir(accountId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 添加账号到注册表
 */
export function addAccount(registry, account) {
  const idx = registry.accounts.findIndex(a => a.id === account.id);
  if (idx >= 0) {
    // 更新已有账号
    registry.accounts[idx] = { ...registry.accounts[idx], ...account };
  } else {
    registry.accounts.push(account);
  }
}

/**
 * 移除账号
 */
export function removeAccount(registry, accountId) {
  registry.accounts = registry.accounts.filter(a => a.id !== accountId);
  if (registry.active === accountId) {
    registry.active = null;
  }
}

/**
 * 按 ID 或别名查找账号
 */
export function findAccount(registry, query) {
  const q = query.toLowerCase();
  return registry.accounts.find(
    a => a.id.toLowerCase() === q ||
      (a.alias && a.alias.toLowerCase() === q) ||
      a.id.toLowerCase().includes(q) ||
      (a.alias && a.alias.toLowerCase().includes(q))
  );
}

/**
 * 设置活跃账号
 */
export function setActive(registry, accountId) {
  registry.active = accountId;
}
