import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

export function ensureParentDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function atomicWriteFile(filePath, content) {
  ensureParentDir(filePath);
  const tempPath = join(dirname(filePath), `.${randomUUID()}.tmp`);

  try {
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, filePath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

export function snapshotFile(filePath) {
  if (!existsSync(filePath)) {
    return { exists: false, content: null };
  }

  return {
    exists: true,
    content: readFileSync(filePath, 'utf-8'),
  };
}

export function restoreFile(filePath, snapshot) {
  if (!snapshot?.exists) {
    rmSync(filePath, { force: true });
    return;
  }

  atomicWriteFile(filePath, snapshot.content);
}
