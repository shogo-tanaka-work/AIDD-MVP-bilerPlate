#!/usr/bin/env node

import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const existsInfo = async target => {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

export const assertSafeManagedPath = async (rootInput, targetInput, options = {}) => {
  const root = path.resolve(rootInput);
  const target = path.resolve(targetInput);
  const relative = path.relative(root, target);
  if (relative === '' && !options.allowRoot) throw new Error('管理対象にroot自体は指定できません。');
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`管理対象がroot外です: ${target}`);
  }

  const rootInfo = await existsInfo(root);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(`管理rootは実directoryである必要があります: ${root}`);
  }
  if (await realpath(root) !== root) {
    throw new Error(`管理rootにsymlinkを含められません: ${root}`);
  }

  const parts = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const info = await existsInfo(current);
    if (!info) continue;
    const leaf = index === parts.length - 1;
    if (info.isSymbolicLink() && !(leaf && options.allowLeafSymlink)) {
      throw new Error(`symlink経由の操作を拒否しました: ${current}`);
    }
    if (leaf && info.isDirectory() && !options.allowLeafDirectory) {
      throw new Error(`file配置先がdirectoryです: ${current}`);
    }
    if (leaf && !info.isFile() && !info.isDirectory() && !info.isSymbolicLink()) {
      throw new Error(`管理対象の型を扱えません: ${current}`);
    }
    if (!leaf && !info.isDirectory()) {
      throw new Error(`親pathがdirectoryではありません: ${current}`);
    }
  }
  return target;
};

const run = async () => {
  const [root, target, mode = 'regular'] = process.argv.slice(2);
  if (!root || !target || !['regular', 'link', 'root'].includes(mode)) {
    throw new Error('使い方: path-safety.mjs <root> <target> [regular|link|root]');
  }
  await assertSafeManagedPath(root, target, {
    allowLeafSymlink: mode === 'link',
    allowLeafDirectory: mode === 'root',
    allowRoot: mode === 'root',
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    process.stderr.write(`安全性検査失敗: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
