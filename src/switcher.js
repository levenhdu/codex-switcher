/**
 * 账号切换核心逻辑
 * 同时更新 auth.json 和 config.toml
 */
import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { ensureAccountDir, getAccountDir } from './registry.js';
import {
  readAuthJson, writeAuthJson, backupAuthTo, restoreAuthFrom,
  buildCustomApiAuth, extractAuthInfo,
} from './auth.js';
import { applyCustomProvider, resetToDefault } from './config.js';

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

/**
 * 切换到 Team 账号
 * 1. 备份当前 auth.json
 * 2. 从账号目录恢复 auth.json
 * 3. 移除 config.toml 中的自定义 provider
 */
export function switchToTeam(registry, account) {
  // 备份当前
  backupCurrentAuth(registry);

  // 恢复目标账号的 auth.json
  const srcDir = getAccountDir(account.id);
  restoreAuthFrom(srcDir);

  // 重置 config.toml 为默认（移除自定义 provider）
  resetToDefault(account);

  registry.active = account.id;
}

/**
 * 切换到自定义 API 账号
 * 1. 备份当前 auth.json
 * 2. 写入自定义 API 的 auth.json
 * 3. 在 config.toml 中设置自定义 provider
 */
export function switchToCustom(registry, account) {
  // 备份当前
  backupCurrentAuth(registry);

  // 读取账号目录中保存的 auth.json（包含 API Key）
  const srcDir = getAccountDir(account.id);
  try {
    restoreAuthFrom(srcDir);
  } catch {
    // 如果账号目录没有 auth.json，用 apiKey 生成一个
    if (account.apiKey) {
      const authData = buildCustomApiAuth(account.apiKey);
      writeAuthJson(authData);
    }
  }

  // 设置 config.toml 中的自定义 provider
  applyCustomProvider(account);

  registry.active = account.id;
}

/**
 * 根据账号类型自动切换
 */
export function switchAccount(registry, account) {
  if (account.type === 'team') {
    switchToTeam(registry, account);
  } else if (account.type === 'custom_api') {
    switchToCustom(registry, account);
  } else {
    throw new Error(`未知账号类型: ${account.type}`);
  }
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
