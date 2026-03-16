/**
 * config.toml 读写管理
 * 切换账号时修改 model_provider 相关配置，保留其他用户设置
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import TOML from '@iarna/toml';
import { getCodexHome } from './auth.js';

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
  } catch {
    return {};
  }
}

/**
 * 写入 config.toml，保留格式
 */
export function writeConfig(config) {
  const path = getConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, TOML.stringify(config), 'utf-8');
}

// codex-switcher 管理的 config 字段（切换时会修改这些字段）
const MANAGED_KEYS = ['model_provider'];

/**
 * 应用自定义 API provider 配置到 config.toml
 * 只修改 provider 相关字段，保留其他用户配置
 */
export function applyCustomProvider(account) {
  const config = readConfig();

  // 设置 model_provider 指向自定义 provider
  const providerKey = `custom_${sanitizeKey(account.id)}`;
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

  // 认证方式
  if (account.requires_openai_auth) {
    providerConfig.requires_openai_auth = true;
  } else if (account.env_key) {
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
export function resetToDefault(account) {
  const config = readConfig();

  // 移除 model_provider 设置（让 Codex 使用默认 OpenAI）
  delete config.model_provider;

  // 如果 Team 账号有指定 model，设置它
  if (account?.model) {
    config.model = account.model;
  }

  // 清理所有 custom_ 开头的 provider（由本工具创建的）
  if (config.model_providers) {
    for (const key of Object.keys(config.model_providers)) {
      if (key.startsWith('custom_')) {
        delete config.model_providers[key];
      }
    }
    // 如果 model_providers 为空，移除整个段
    if (Object.keys(config.model_providers).length === 0) {
      delete config.model_providers;
    }
  }

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
