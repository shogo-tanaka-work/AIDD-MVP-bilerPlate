#!/usr/bin/env node

import { cp, lstat, mkdir, readFile, readlink, realpath, rm, rmdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { assertSafeManagedPath } from './path-safety.mjs';

const exists = async target => {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const safeRelativePath = value => {
  if (typeof value !== 'string' || value === '' || path.isAbsolute(value)) return false;
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
};

const assertFileEntries = value => {
  if (!Array.isArray(value)) throw new Error('backup manifestのfilesが不正です。');
  return value.map(entry => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !safeRelativePath(entry.path) ||
      !['file', 'symlink'].includes(entry.type) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      throw new Error('backup manifestのfile entryが不正です。');
    }
    return entry;
  });
};

const assertDisjointEntries = (files, added) => {
  const all = [...files.map(entry => entry.path), ...added.map(entry => entry.path)];
  if (new Set(all).size !== all.length) throw new Error('backup manifestのpathが重複しています。');
  for (const current of all) {
    if (all.some(other => other !== current && current.startsWith(`${other}${path.sep}`))) {
      throw new Error('backup manifestのpathが親子で重なっています。');
    }
  }
};

const fileDigest = async (source, type) => {
  const value = type === 'symlink'
    ? await readlink(source)
    : await readFile(source);
  return createHash('sha256').update(value).digest('hex');
};

const removeFileOrLink = async target => {
  if (!(await exists(target))) return;
  const info = await lstat(target);
  if (info.isDirectory() && !info.isSymbolicLink()) {
    throw new Error(`復元対象がdirectoryへ変わっています: ${target}`);
  }
  await rm(target, { force: true });
};

const removeAddedPath = async (root, target) => {
  if (!(await exists(target))) return;
  await assertSafeManagedPath(root, target, { allowLeafSymlink: true });
  const info = await lstat(target);
  if (info.isDirectory() && !info.isSymbolicLink()) {
    throw new Error(`追加済みpathがdirectoryへ変わっています: ${target}`);
  }
  await rm(target, { force: true });
  let parent = path.dirname(target);
  while (parent !== root) {
    try {
      await rmdir(parent);
    } catch (error) {
      if (['ENOTEMPTY', 'ENOENT'].includes(error?.code)) break;
      throw error;
    }
    parent = path.dirname(parent);
  }
};

export const restoreHarness = async (backupInput, targetInput) => {
  const backup = await realpath(path.resolve(backupInput));
  const manifestPath = path.join(backup, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema_version !== 2 || typeof manifest.target !== 'string') {
    throw new Error('対応していないbackup manifestです。');
  }

  const requestedTarget = path.resolve(targetInput ?? manifest.target);
  const target = await realpath(requestedTarget);
  if (target !== path.resolve(manifest.target)) {
    throw new Error('指定した対象とbackup manifestの対象が一致しません。');
  }
  if (await realpath(target) !== target) throw new Error('対象rootにsymlinkを含められません。');
  await assertSafeManagedPath(target, target, { allowRoot: true });

  const expectedBackupRoot = path.join(target, '.agents', 'backups');
  const relativeBackup = path.relative(expectedBackupRoot, backup);
  if (relativeBackup.startsWith('..') || path.isAbsolute(relativeBackup)) {
    throw new Error('backupは対象projectの.agents/backups配下にある必要があります。');
  }
  await assertSafeManagedPath(target, backup, { allowLeafDirectory: true });
  if (await realpath(backup) !== backup) throw new Error('backup pathにsymlinkを含められません。');

  const files = assertFileEntries(manifest.files);
  const added = assertFileEntries(manifest.added ?? []);
  assertDisjointEntries(files, added);

  for (const entry of files) {
    const source = path.join(backup, entry.path);
    await assertSafeManagedPath(backup, source, { allowLeafSymlink: entry.type === 'symlink' });
    if (!(await exists(source))) throw new Error(`backupファイルがありません: ${entry.path}`);
    const info = await lstat(source);
    const actualType = info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : 'other';
    if (actualType !== entry.type) throw new Error(`backupのtypeが一致しません: ${entry.path}`);
    const actualHash = await fileDigest(source, entry.type);
    if (actualHash !== entry.sha256) throw new Error(`backupのhashが一致しません: ${entry.path}`);
  }

  for (const entry of added) {
    const current = path.join(target, entry.path);
    await assertSafeManagedPath(target, current, { allowLeafSymlink: true });
    if (!(await exists(current))) continue;
    const info = await lstat(current);
    const actualType = info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : 'other';
    if (actualType !== entry.type || await fileDigest(current, entry.type) !== entry.sha256) {
      throw new Error(`追加後に変更されたpathは削除できません: ${entry.path}`);
    }
  }

  for (const entry of files) {
    const destination = path.join(target, entry.path);
    await assertSafeManagedPath(target, destination, { allowLeafSymlink: true });
  }

  for (const entry of files) {
    const source = path.join(backup, entry.path);
    const destination = path.join(target, entry.path);
    await removeFileOrLink(destination);
    await mkdir(path.dirname(destination), { recursive: true });
    if (entry.type === 'symlink') {
      await symlink(await readlink(source), destination);
    } else {
      await cp(source, destination, { recursive: false });
    }
  }

  for (const entry of added) {
    await removeAddedPath(target, path.join(target, entry.path));
  }

  return { target, backup, restored: files.length, removed: added.length };
};

const run = async () => {
  const args = process.argv.slice(2);
  const yesIndex = args.indexOf('--yes');
  const yes = yesIndex >= 0;
  if (yes) args.splice(yesIndex, 1);
  const [backup, target] = args;
  if (!backup) {
    process.stderr.write('使い方: aidd restore <backupディレクトリ> [対象ディレクトリ] [--yes]\n');
    process.exitCode = 2;
    return;
  }
  if (!yes && !process.stdin.isTTY) {
    process.stderr.write('中断: 非対話でrestoreを実行するには --yes が必要です\n');
    process.exitCode = 2;
    return;
  }

  if (!yes) {
    process.stdout.write('backupから復元します。続行する場合は yes を入力してください: ');
    const answer = await new Promise(resolve => {
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', resolve);
    });
    if (String(answer).trim().toLowerCase() !== 'yes') {
      process.stderr.write('中断しました。\n');
      process.exitCode = 1;
      return;
    }
  }

  const result = await restoreHarness(backup, target);
  process.stdout.write(`復元完了: ${result.restored}件復元 / ${result.removed}件削除\n`);
};

run().catch(error => {
  process.stderr.write(`復元失敗: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
