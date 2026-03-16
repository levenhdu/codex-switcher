/**
 * auth.json 处理和 JWT Token 解析
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

/**
 * 获取 CODEX_HOME 路径
 */
export function getCodexHome() {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

/**
 * 获取 auth.json 路径
 */
export function getAuthPath() {
  return join(getCodexHome(), 'auth.json');
}

/**
 * 读取当前 auth.json
 */
export function readAuthJson() {
  const path = getAuthPath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 写入 auth.json
 */
export function writeAuthJson(data) {
  const path = getAuthPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 备份 auth.json 到指定的账号目录
 */
export function backupAuthTo(destDir) {
  const src = getAuthPath();
  if (!existsSync(src)) return;
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  copyFileSync(src, join(destDir, 'auth.json'));
}

/**
 * 从账号目录恢复 auth.json
 */
export function restoreAuthFrom(srcDir) {
  const src = join(srcDir, 'auth.json');
  if (!existsSync(src)) {
    throw new Error(`账号认证文件不存在: ${src}`);
  }
  const dest = getAuthPath();
  copyFileSync(src, dest);
}

/**
 * Base64url 解码
 */
function base64urlDecode(str) {
  // 补齐 padding
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  return Buffer.from(padded, 'base64').toString('utf-8');
}

/**
 * 解析 JWT Token 的 payload 部分
 */
export function decodeJwtPayload(jwt) {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('无效的 JWT Token');
  }
  try {
    return JSON.parse(base64urlDecode(parts[1]));
  } catch {
    throw new Error('JWT payload 解码失败');
  }
}

/**
 * 从 auth.json 数据中提取账号信息
 * @returns {{ type: 'team'|'apikey', email?: string, plan?: string, accountId?: string }}
 */
export function extractAuthInfo(authData) {
  if (!authData) return null;

  // 检查是否是 API Key 模式
  if (authData.OPENAI_API_KEY && authData.OPENAI_API_KEY !== null) {
    return {
      type: 'apikey',
      authMode: authData.auth_mode || 'apikey',
      apiKey: authData.OPENAI_API_KEY,
    };
  }

  // 检查是否是 ChatGPT OAuth 模式（有 tokens.id_token）
  if (authData.tokens?.id_token) {
    try {
      const payload = decodeJwtPayload(authData.tokens.id_token);
      const email = payload.email || null;
      const authClaims = payload['https://api.openai.com/auth'] || {};
      const plan = authClaims.chatgpt_plan_type || null;
      const accountId = authClaims.chatgpt_account_id || authData.tokens?.account_id || null;

      return {
        type: 'team',
        authMode: authData.auth_mode || 'chatgpt',
        email,
        plan,
        accountId,
      };
    } catch {
      return {
        type: 'team',
        authMode: authData.auth_mode || 'chatgpt',
        email: null,
        plan: null,
      };
    }
  }

  return null;
}

/**
 * 生成自定义 API 的 auth.json 内容
 */
export function buildCustomApiAuth(apiKey) {
  return {
    OPENAI_API_KEY: apiKey,
  };
}

/**
 * 遮蔽 API Key / Token 显示
 */
export function maskSecret(secret) {
  if (!secret || secret.length < 10) return '***';
  return secret.substring(0, 6) + '...' + secret.substring(secret.length - 4);
}
