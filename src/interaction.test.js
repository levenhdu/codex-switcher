import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { getAccountDir } from './registry.js';
import { getAuthPath } from './auth.js';
import { sortAccountsForSelection } from './ui.js';
import { switchAccount } from './switcher.js';

function setupSandbox(t) {
  const rootDir = mkdtempSync(join(tmpdir(), 'codex-switcher-interaction-'));
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

function writeAccountAuth(accountId, data) {
  const dir = getAccountDir(accountId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'auth.json'), JSON.stringify(data, null, 2), 'utf-8');
}

test('交互式账号列表按最近使用时间优先排序', () => {
  const accounts = [
    { id: 'alpha', alias: 'Alpha', type: 'team', last_used_at: '2026-04-01T08:00:00.000Z', use_count: 1 },
    { id: 'beta', alias: 'Beta', type: 'team', last_used_at: '2026-04-06T08:00:00.000Z', use_count: 1 },
    { id: 'gamma', alias: 'Gamma', type: 'team' },
  ];

  const sorted = sortAccountsForSelection(accounts);

  assert.deepEqual(sorted.map(account => account.id), ['beta', 'alpha', 'gamma']);
});

test('最近使用时间相同时按频次排序', () => {
  const accounts = [
    { id: 'alpha', alias: 'Alpha', type: 'team', last_used_at: '2026-04-06T08:00:00.000Z', use_count: 2 },
    { id: 'beta', alias: 'Beta', type: 'team', last_used_at: '2026-04-06T08:00:00.000Z', use_count: 5 },
    { id: 'gamma', alias: 'Gamma', type: 'team', last_used_at: '2026-04-06T08:00:00.000Z', use_count: 1 },
  ];

  const sorted = sortAccountsForSelection(accounts);

  assert.deepEqual(sorted.map(account => account.id), ['beta', 'alpha', 'gamma']);
});

test('无历史账号保持原有顺序', () => {
  const accounts = [
    { id: 'alpha', alias: 'Alpha', type: 'team' },
    { id: 'beta', alias: 'Beta', type: 'custom_api' },
    { id: 'gamma', alias: 'Gamma', type: 'team' },
  ];

  const sorted = sortAccountsForSelection(accounts);

  assert.deepEqual(sorted.map(account => account.id), ['alpha', 'beta', 'gamma']);
});

test('切换成功后写回最近使用时间并递增频次', { concurrency: false }, async (t) => {
  setupSandbox(t);

  const targetAccount = {
    id: 'custom-user',
    type: 'custom_api',
    alias: 'Target',
    apiKey: 'sk-target-key',
    base_url: 'https://target.example.com',
    model: 'gpt-5.4',
    last_used_at: '2026-04-01T08:00:00.000Z',
    use_count: 3,
  };
  const registry = {
    active: null,
    accounts: [targetAccount],
  };

  writeJson(getAuthPath(), { tokens: { id_token: 'team-token' } });
  writeAccountAuth(targetAccount.id, { OPENAI_API_KEY: targetAccount.apiKey });

  await switchAccount(registry, targetAccount);

  assert.equal(registry.active, targetAccount.id);
  assert.equal(targetAccount.use_count, 4);
  assert.ok(Date.parse(targetAccount.last_used_at) > Date.parse('2026-04-01T08:00:00.000Z'));
});
