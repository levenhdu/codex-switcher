/**
 * config.toml 读写管理
 * 切换账号时修改 model_provider 相关配置，保留其他用户设置
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import TOML from '@iarna/toml';
import { getCodexHome } from './auth.js';
import { atomicWriteFile, snapshotFile, restoreFile } from './file-utils.js';

/**
 * 获取 config.toml 路径
 */
export function getConfigPath() {
  return join(getCodexHome(), 'config.toml');
}

/**
 * 读取 config.toml，返回解析后的对象
 */
export function readConfig() {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    return TOML.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`无法安全解析 config.toml，请先修复后再重试: ${error.message}`);
  }
}

/**
 * 写入 config.toml，保留格式
 */
export function writeConfig(config) {
  const path = getConfigPath();
  atomicWriteFile(path, TOML.stringify(config));
}

export function getProviderKey(account) {
  return account?.provider_key || `custom_${sanitizeKey(account?.id || '')}`;
}

export function getManagedProviderKeys(accounts = []) {
  const keys = new Set(['custom']);

  for (const account of accounts) {
    if (!account || account.type === 'team') continue;
    keys.add(getProviderKey(account));
  }

  return [...keys];
}

function removeManagedProviders(config, managedProviderKeys, keepProviderKey = null) {
  const managedKeys = new Set(managedProviderKeys);

  if (config.model_provider && managedKeys.has(config.model_provider) && config.model_provider !== keepProviderKey) {
    delete config.model_provider;
  }

  if (config.model_providers) {
    for (const providerKey of managedKeys) {
      if (providerKey !== keepProviderKey && config.model_providers[providerKey]) {
        delete config.model_providers[providerKey];
      }
    }
  }

  if (config.model_providers && Object.keys(config.model_providers).length === 0) {
    delete config.model_providers;
  }
}

/**
 * 应用自定义 API provider 配置到 config.toml
 * 只修改 provider 相关字段，保留其他用户配置
 */
export function applyCustomProvider(account, managedProviderKeys = []) {
  const config = readConfig();

  // 设置 model_provider 指向自定义 provider
  // 若账号指定了 provider_key（如安装脚本生成的 "myprovider"），优先使用；否则自动生成
  const providerKey = getProviderKey(account);
  removeManagedProviders(config, managedProviderKeys, providerKey);
  config.model_provider = providerKey;

  // 如果账号指定了 model，则设置
  if (account.model) {
    config.model = account.model;
  }

  // 如果账号指定了 review_model，则设置
  if (account.review_model) {
    config.review_model = account.review_model;
  }

  // 如果指定了 model_reasoning_effort，则设置
  if (account.model_reasoning_effort) {
    config.model_reasoning_effort = account.model_reasoning_effort;
  }

  // 创建或更新 model_providers 段
  if (!config.model_providers) {
    config.model_providers = {};
  }

  const providerConfig = {
    name: account.alias || account.id,
    base_url: account.base_url,
  };

  // 认证方式：
  // 1. requires_openai_auth === true  → 使用 OpenAI OAuth
  // 2. requires_openai_auth === false → 使用 auth.json（不设任何额外认证字段）
  // 3. requires_openai_auth 未定义 + env_key 存在 → 使用环境变量
  if (account.requires_openai_auth) {
    providerConfig.requires_openai_auth = true;
  } else if (account.env_key && account.requires_openai_auth === undefined) {
    providerConfig.env_key = account.env_key;
  }

  // wire_api
  if (account.wire_api) {
    providerConfig.wire_api = account.wire_api;
  }

  config.model_providers[providerKey] = providerConfig;

  writeConfig(config);
  return providerKey;
}

/**
 * 恢复为默认 OpenAI provider（Team 账号模式）
 * 移除 model_provider 和自定义 provider 配置
 */
export function resetToDefault(managedProviderKeys = [], teamAccount = null) {
  const config = readConfig();

  // 如果 Team 账号有指定 model，设置它
  if (teamAccount?.type === 'team' && teamAccount.model) {
    config.model = teamAccount.model;
  }

  removeManagedProviders(config, managedProviderKeys);

  writeConfig(config);
}

/**
 * 清理字符串为安全的 TOML key
 */
function sanitizeKey(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

/**
 * 备份当前 config.toml 中 provider 相关的配置
 * 用于后续恢复
 */
export function snapshotProviderConfig() {
  const config = readConfig();
  return {
    model: config.model,
    model_provider: config.model_provider,
    review_model: config.review_model,
    model_reasoning_effort: config.model_reasoning_effort,
  };
}

/**
 * 快照 live config.toml，用于切换失败回滚
 */
export function snapshotConfigFile() {
  return snapshotFile(getConfigPath());
}

/**
 * 恢复 live config.toml 到快照内容
 */
export function restoreConfigFile(snapshot) {
  restoreFile(getConfigPath(), snapshot);
}
