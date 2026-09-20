#!/usr/bin/env node

// 編集直後の軽量検証。package.jsonのlint / typecheck、Pythonの構文チェックだけを
// 上限付きで実行し、失敗をエージェントへ返す。full test suiteは回さない。
// 無効化: AIDD_POST_EDIT_VALIDATE=0

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const MAX_CHECKS = 2;
const CHECK_TIMEOUT_MS = 25_000;
const OUTPUT_LIMIT = 4_000;
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/i;
const PYTHON_FILE = /\.py$/i;

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const collectValuesForKeys = (value, acceptedKeys, currentKey = '') => {
  if (typeof value === 'string') {
    return acceptedKeys.has(currentKey) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => collectValuesForKeys(item, acceptedKeys, currentKey));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) =>
    collectValuesForKeys(child, acceptedKeys, key),
  );
};

const extractPatchPaths = patch =>
  patch
    .split('\n')
    .map(line => line.match(/^\*\*\* (?:Add|Update) File: (.+)$/)?.[1])
    .filter(Boolean);

export const changedPaths = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  const toolInput = input.tool_input ?? input.toolInput ?? {};
  const direct = collectValuesForKeys(toolInput, new Set(['file_path', 'filePath', 'path']));
  const patches = collectValuesForKeys(toolInput, new Set(['patch', 'input']));
  return [...direct, ...patches.flatMap(extractPatchPaths)];
};

const isDisabled = env =>
  ['0', 'false', 'no', 'off'].includes(String(env.AIDD_POST_EDIT_VALIDATE ?? '1').toLowerCase());

const packageManager = root => {
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(root, 'bun.lock')) || existsSync(path.join(root, 'bun.lockb'))) return 'bun';
  return 'npm';
};

const readPackageScripts = root => {
  const packageJsonPath = path.join(root, 'package.json');
  if (!existsSync(packageJsonPath)) return { scripts: {} };
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const scripts = parsed && typeof parsed.scripts === 'object' && parsed.scripts ? parsed.scripts : {};
    return { scripts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { scripts: {}, note: `package.jsonを読めないためlint / typecheckを省略しました: ${message}` };
  }
};

// 実行する検証コマンドを決める純粋関数。副作用はファイル存在確認とpackage.json読み込みだけ。
export const planChecks = ({ root, paths, env = process.env }) => {
  if (isDisabled(env)) return { checks: [], notes: [] };

  const checks = [];
  const notes = [];

  if (paths.some(target => SCRIPT_FILE.test(target))) {
    const { scripts, note } = readPackageScripts(root);
    if (note) notes.push(note);
    const manager = packageManager(root);
    for (const script of ['lint', 'typecheck']) {
      if (typeof scripts[script] === 'string') checks.push([manager, 'run', script]);
    }
  }

  const pythonFiles = paths.filter(target => PYTHON_FILE.test(target));
  if (pythonFiles.length > 0 && existsSync(path.join(root, 'pyproject.toml'))) {
    checks.push(['python3', '-m', 'compileall', '-q', ...pythonFiles]);
  }

  return { checks: checks.slice(0, MAX_CHECKS), notes };
};

const tail = value => (value.length > OUTPUT_LIMIT ? value.slice(-OUTPUT_LIMIT) : value);

export const runChecks = (checks, root) => {
  for (const check of checks) {
    const [executable, ...args] = check;
    const result = spawnSync(executable, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: CHECK_TIMEOUT_MS,
      env: { ...process.env, CI: '1' },
    });
    const label = check.join(' ');
    if (result.error) {
      const reason = result.error.code === 'ETIMEDOUT'
        ? `${CHECK_TIMEOUT_MS / 1000}秒以内に終了しませんでした`
        : result.error.message;
      return { status: 'skipped', command: label, message: `${label} を実行できませんでした: ${reason}` };
    }
    if (result.status !== 0) {
      return {
        status: 'failed',
        command: label,
        output: tail(`${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()),
      };
    }
  }
  return { status: 'passed' };
};

const run = async () => {
  let input;
  try {
    const raw = await readStdin();
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    // PostToolUseは事後検証なので、入力不正で作業を止めずに記録だけ残す。
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`post-edit検証を省略しました: Hook入力を読めません: ${message}\n`);
    return;
  }

  const root = process.env.AIDD_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const { checks, notes } = planChecks({ root, paths: changedPaths(input) });
  for (const note of notes) process.stderr.write(`${note}\n`);
  if (checks.length === 0) return;

  const outcome = runChecks(checks, root);
  if (outcome.status === 'skipped') {
    process.stderr.write(`post-edit検証を省略しました: ${outcome.message}\n`);
    return;
  }
  if (outcome.status === 'failed') {
    // Codexではexit 2の出力がtool結果を置き換えるため、編集が適用済みであることを明記する。
    process.stderr.write(`post-edit検証が失敗しました（編集は適用済み）: ${outcome.command}\n${outcome.output}\n`);
    process.exitCode = 2;
  }
};

const isMain = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isMain) await run();
