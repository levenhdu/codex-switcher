import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import TOML from '@iarna/toml';
import { getAuthPath } from './auth.js';
import { getConfigPath } from './config.js';
import { getAccountDir } from './registry.js';
import { switchToCustom, switchToTeam, deleteAccounts } from './switcher.js';

function setupSandbox(t) {
  const rootDir = mkdtempSync(join(tmpdir(), 'codex-switcher-'));
  const previousCodexHome = process.env.CODEX_HOME;
  const previousHome = process.env.HOME;

  process.env.CODEX_HOME = join(rootDir, '.codex');
  process.env.HOME = rootDir;

  t.after(() => {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }

    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    rmSync(rootDir, { recursive: true, force: true });
  });

  return {
    rootDir,
    codexHome: process.env.CODEX_HOME,
  };
}

function writeJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function writeText(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

function writeAccountAuth(accountId, data) {
  const dir = getAccountDir(accountId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'auth.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function readToml(filePath) {
  return TOML.parse(readFileSync(filePath, 'utf-8'));
}

test('坏 config.toml 不会被覆盖，并回滚已写入的 auth.json', { concurrency: false }, async (t) => {
  setupSandbox(t);

  const teamAccount = { id: 'team-user', type: 'team', alias: 'Team' };
  const customAccount = {
    id: 'custom-user',
    type: 'custom_api',
    alias: 'Custom',
    apiKey: 'sk-new-key',
    base_url: 'https://api.example.com',
    model: 'gpt-5.4',
  };
  const registry = { active: teamAccount.id, accounts: [teamAccount, customAccount] };

  const authPath = getAuthPath();
  const configPath = getConfigPath();
  const originalAuth = { tokens: { id_token: 'team-token' } };
  const brokenConfig = 'model_provider = [';

  writeJson(authPath, originalAuth);
  writeAccountAuth(customAccount.id, { OPENAI_API_KEY: customAccount.apiKey });
  writeText(configPath, brokenConfig);

  await assert.rejects(
    switchToCustom(registry, customAccount),
    /无法安全解析 config\.toml/
  );

  assert.equal(readFileSync(configPath, 'utf-8'), brokenConfig);
  assert.deepEqual(JSON.parse(readFileSync(authPath, 'utf-8')), originalAuth);
});

test('切回 Team 时保留用户自定义 model_providers 条目', { concurrency: false }, async (t) => {
  setupSandbox(t);

  const customAccount = {
    id: 'custom-user',
    type: 'custom_api',
    alias: 'Custom',
    provider_key: 'custom_demo',
    apiKey: 'sk-live-key',
    base_url: 'https://api.example.com',
    model: 'gpt-5.4',
  };
  const teamAccount = { id: 'team-user', type: 'team', alias: 'Team' };
  const registry = { active: customAccount.id, accounts: [customAccount, teamAccount] };
  const authPath = getAuthPath();
  const configPath = getConfigPath();

  writeJson(authPath, { OPENAI_API_KEY: customAccount.apiKey });
  writeAccountAuth(teamAccount.id, { tokens: { id_token: 'team-token' } });
  writeText(configPath, TOML.stringify({
    model_provider: 'custom_demo',
    model_providers: {
      custom_demo: {
        name: 'Custom',
        base_url: 'https://api.example.com',
      },
      user_provider: {
        name: 'User Provider',
        base_url: 'https://user.example.com',
      },
    },
  }));

  await switchToTeam(registry, teamAccount);

  const nextConfig = readToml(configPath);
  assert.equal(nextConfig.model_provider, undefined);
  assert.equal(nextConfig.model_providers.custom_demo, undefined);
  assert.deepEqual(nextConfig.model_providers.user_provider, {
    name: 'User Provider',
    base_url: 'https://user.example.com',
  });
  assert.deepEqual(JSON.parse(readFileSync(authPath, 'utf-8')), { tokens: { id_token: 'team-token' } });
});

test('删除活跃自定义账号后不再残留 live API Key', { concurrency: false }, async (t) => {
  setupSandbox(t);

  const customAccount = {
    id: 'custom-user',
    type: 'custom_api',
    alias: 'Custom',
    provider_key: 'custom_demo',
    apiKey: 'sk-live-key',
    base_url: 'https://api.example.com',
  };
  const registry = { active: customAccount.id, accounts: [customAccount] };
  const authPath = getAuthPath();
  const configPath = getConfigPath();
  const accountDir = getAccountDir(customAccount.id);

  writeJson(authPath, { OPENAI_API_KEY: customAccount.apiKey });
  mkdirSync(accountDir, { recursive: true });
  writeText(configPath, TOML.stringify({
    model_provider: 'custom_demo',
    model_providers: {
      custom_demo: {
        name: 'Custom',
        base_url: 'https://api.example.com',
      },
      user_provider: {
        name: 'User Provider',
        base_url: 'https://user.example.com',
      },
    },
  }));

  const result = await deleteAccounts(registry, [customAccount.id]);

  assert.equal(result.activeDeleted, true);
  assert.equal(result.removedActiveType, 'custom_api');
  assert.equal(registry.active, null);
  assert.equal(registry.accounts.length, 0);
  assert.deepEqual(JSON.parse(readFileSync(authPath, 'utf-8')), {});
  assert.equal(existsSync(accountDir), false);

  const nextConfig = readToml(configPath);
  assert.equal(nextConfig.model_provider, undefined);
  assert.equal(nextConfig.model_providers.custom_demo, undefined);
  assert.deepEqual(nextConfig.model_providers.user_provider, {
    name: 'User Provider',
    base_url: 'https://user.example.com',
  });
});

test('env_key 模式切换不会修改 shell profile 文件', { concurrency: false }, async (t) => {
  const { rootDir } = setupSandbox(t);

  const customAccount = {
    id: 'custom-user',
    type: 'custom_api',
    alias: 'Env Key Custom',
    apiKey: 'sk-env-key',
    base_url: 'https://api.example.com',
    env_key: 'CODEX_KEY_ENV_KEY_CUSTOM',
    model: 'gpt-5.4',
  };
  const registry = { active: null, accounts: [customAccount] };

  const zshrc = join(rootDir, '.zshrc');
  const bashProfile = join(rootDir, '.bash_profile');
  const bashrc = join(rootDir, '.bashrc');
  const profileContent = '# existing shell profile\n';

  writeFileSync(zshrc, profileContent, 'utf-8');
  writeFileSync(bashProfile, profileContent, 'utf-8');
  writeFileSync(bashrc, profileContent, 'utf-8');
  writeAccountAuth(customAccount.id, { OPENAI_API_KEY: customAccount.apiKey });

  await switchToCustom(registry, customAccount);

  assert.equal(readFileSync(zshrc, 'utf-8'), profileContent);
  assert.equal(readFileSync(bashProfile, 'utf-8'), profileContent);
  assert.equal(readFileSync(bashrc, 'utf-8'), profileContent);
});

test('切换自定义账号时会清理历史受控 provider，只保留目标 provider', { concurrency: false }, async (t) => {
  setupSandbox(t);

  const legacyAccount = {
    id: 'legacy-custom',
    type: 'custom_api',
    alias: 'Legacy',
    provider_key: 'custom',
    apiKey: 'sk-legacy-key',
    base_url: 'https://legacy.example.com',
  };
  const importedAccount = {
    id: 'ccswitch-imported',
    type: 'custom_api',
    alias: 'Imported',
    provider_key: 'ccswitch_demo',
    apiKey: 'sk-imported-key',
    base_url: 'https://imported.example.com',
    model: 'gpt-5.4',
  };
  const targetAccount = {
    id: 'custom-user',
    type: 'custom_api',
    alias: 'Target',
    apiKey: 'sk-target-key',
    base_url: 'https://target.example.com',
    model: 'gpt-5.4',
  };
  const registry = {
    active: legacyAccount.id,
    accounts: [legacyAccount, importedAccount, targetAccount],
  };
  const configPath = getConfigPath();

  writeJson(getAuthPath(), { OPENAI_API_KEY: legacyAccount.apiKey });
  writeAccountAuth(targetAccount.id, { OPENAI_API_KEY: targetAccount.apiKey });
  writeText(configPath, TOML.stringify({
    model_provider: 'custom',
    model_providers: {
      custom: {
        name: 'Legacy',
        base_url: 'https://legacy.example.com',
      },
      ccswitch_demo: {
        name: 'Imported',
        base_url: 'https://imported.example.com',
      },
      user_provider: {
        name: 'User Provider',
        base_url: 'https://user.example.com',
      },
    },
  }));

  await switchToCustom(registry, targetAccount);

  const nextConfig = readToml(configPath);
  assert.equal(nextConfig.model_provider, 'custom_custom-user');
  assert.equal(nextConfig.model_providers.custom, undefined);
  assert.equal(nextConfig.model_providers.ccswitch_demo, undefined);
  assert.deepEqual(nextConfig.model_providers['custom_custom-user'], {
    name: 'Target',
    base_url: 'https://target.example.com',
  });
  assert.deepEqual(nextConfig.model_providers.user_provider, {
    name: 'User Provider',
    base_url: 'https://user.example.com',
  });
});
