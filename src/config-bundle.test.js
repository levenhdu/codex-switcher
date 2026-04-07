import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';
import { getAuthPath } from './auth.js';
import { getConfigPath } from './config.js';
import { CONFIG_BUNDLE_VERSION, importConfigBundle, writeConfigBundle } from './config-bundle.js';
import { getAccountDir, loadRegistry, saveRegistry } from './registry.js';

function setupSandbox(t) {
  const rootDir = mkdtempSync(join(tmpdir(), 'codex-switcher-config-bundle-'));
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

  return { rootDir };
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

test('成功导出配置包', { concurrency: false }, (t) => {
  const { rootDir } = setupSandbox(t);
  const bundlePath = join(rootDir, 'bundle.json');
  const registry = {
    active: null,
    accounts: [
      {
        id: 'team-user',
        type: 'team',
        alias: 'Team',
        email: 'team@example.com',
        last_used_at: '2026-04-08T01:02:03.000Z',
        use_count: 4,
      },
    ],
  };

  writeAccountAuth('team-user', { tokens: { id_token: 'team-token' } });

  const bundle = writeConfigBundle(bundlePath, registry);
  const savedBundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));

  assert.equal(bundle.version, CONFIG_BUNDLE_VERSION);
  assert.equal(savedBundle.version, CONFIG_BUNDLE_VERSION);
  assert.equal(savedBundle.accounts.length, 1);
  assert.equal(savedBundle.accounts[0].account.id, 'team-user');
  assert.equal(savedBundle.accounts[0].account.use_count, 4);
  assert.deepEqual(savedBundle.accounts[0].auth_json, { tokens: { id_token: 'team-token' } });
});

test('成功导入配置包且不影响 live 配置', { concurrency: false }, (t) => {
  const { rootDir } = setupSandbox(t);
  const bundlePath = join(rootDir, 'bundle.json');
  const liveAuth = { tokens: { id_token: 'live-team-token' } };
  const liveConfig = TOML.stringify({
    model: 'gpt-5.4',
    model_provider: 'user_provider',
    model_providers: {
      user_provider: {
        name: 'User Provider',
        base_url: 'https://user.example.com',
      },
    },
  });

  writeJson(getAuthPath(), liveAuth);
  writeText(getConfigPath(), liveConfig);
  writeJson(bundlePath, {
    version: CONFIG_BUNDLE_VERSION,
    exported_at: '2026-04-08T02:00:00.000Z',
    accounts: [
      {
        account: {
          id: 'custom-user',
          type: 'custom_api',
          alias: 'Imported Custom',
          apiKey: 'sk-imported',
          base_url: 'https://imported.example.com',
          use_count: 2,
          last_used_at: '2026-04-08T01:00:00.000Z',
        },
        auth_json: {
          OPENAI_API_KEY: 'sk-imported',
        },
      },
    ],
  });

  const registry = loadRegistry();
  const result = importConfigBundle(bundlePath, registry);
  const savedRegistry = loadRegistry();
  const importedAuthPath = join(getAccountDir('custom-user'), 'auth.json');

  assert.equal(result.imported_count, 1);
  assert.equal(savedRegistry.accounts.length, 1);
  assert.equal(savedRegistry.accounts[0].id, 'custom-user');
  assert.equal(savedRegistry.active, null);
  assert.deepEqual(JSON.parse(readFileSync(importedAuthPath, 'utf-8')), { OPENAI_API_KEY: 'sk-imported' });
  assert.deepEqual(JSON.parse(readFileSync(getAuthPath(), 'utf-8')), liveAuth);
  assert.equal(readFileSync(getConfigPath(), 'utf-8'), liveConfig);
});

test('坏配置包会拒绝导入且不写入本地数据', { concurrency: false }, (t) => {
  const { rootDir } = setupSandbox(t);
  const bundlePath = join(rootDir, 'broken-bundle.json');

  writeJson(bundlePath, {
    version: 999,
    exported_at: '2026-04-08T02:00:00.000Z',
    accounts: [],
  });

  const registry = loadRegistry();

  assert.throws(
    () => importConfigBundle(bundlePath, registry),
    /配置包版本不受支持/
  );

  assert.equal(loadRegistry().accounts.length, 0);
  assert.equal(existsSync(getAccountDir('custom-user')), false);
});

test('冲突账号会拒绝导入且不覆盖已有配置', { concurrency: false }, (t) => {
  const { rootDir } = setupSandbox(t);
  const bundlePath = join(rootDir, 'bundle.json');
  const existingRegistry = {
    active: 'team-user',
    accounts: [
      {
        id: 'team-user',
        type: 'team',
        alias: 'Existing Team',
      },
    ],
  };

  saveRegistry(existingRegistry);
  writeAccountAuth('team-user', { tokens: { id_token: 'existing-token' } });
  writeJson(bundlePath, {
    version: CONFIG_BUNDLE_VERSION,
    exported_at: '2026-04-08T02:00:00.000Z',
    accounts: [
      {
        account: {
          id: 'team-user',
          type: 'team',
          alias: 'Imported Team',
        },
        auth_json: {
          tokens: { id_token: 'imported-token' },
        },
      },
    ],
  });

  const registry = loadRegistry();

  assert.throws(
    () => importConfigBundle(bundlePath, registry),
    /本地已存在同名账号/
  );

  assert.equal(loadRegistry().accounts[0].alias, 'Existing Team');
  assert.deepEqual(
    JSON.parse(readFileSync(join(getAccountDir('team-user'), 'auth.json'), 'utf-8')),
    { tokens: { id_token: 'existing-token' } }
  );
});
