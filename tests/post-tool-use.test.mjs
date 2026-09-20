import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { changedPaths, planChecks } from '../.agents/hooks/post-tool-use.mjs';

const hookPath = fileURLToPath(new URL('../.agents/hooks/post-tool-use.mjs', import.meta.url));

const withProject = async (files, callback) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aidd-post-hook-'));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
      await writeFile(path.join(root, relativePath), content);
    }
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const editInput = filePath => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
});

const runHook = (root, input) =>
  spawnSync(process.execPath, [hookPath], {
    cwd: root,
    encoding: 'utf8',
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...process.env, AIDD_PROJECT_DIR: root, AIDD_POST_EDIT_VALIDATE: '1' },
  });

test('Edit / Write / apply_patchの変更pathを抽出する', () => {
  assert.deepEqual(changedPaths(editInput('src/a.ts')), ['src/a.ts']);
  assert.deepEqual(
    changedPaths({ tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n*** Update File: src/b.py\n*** Delete File: src/c.py\n*** End Patch' } }),
    ['src/b.py'],
  );
  assert.deepEqual(changedPaths(null), []);
});

test('scriptファイルの変更でpackage.jsonのlintとtypecheckを予定する', async () => {
  await withProject({ 'package.json': JSON.stringify({ scripts: { lint: 'true', typecheck: 'true', test: 'true' } }) }, root => {
    const { checks } = planChecks({ root, paths: ['src/a.ts'], env: {} });
    assert.deepEqual(checks, [['npm', 'run', 'lint'], ['npm', 'run', 'typecheck']]);
  });
});

test('lockfileからpackage managerを選ぶ', async () => {
  await withProject({ 'package.json': JSON.stringify({ scripts: { lint: 'true' } }), 'pnpm-lock.yaml': '' }, root => {
    const { checks } = planChecks({ root, paths: ['src/a.tsx'], env: {} });
    assert.deepEqual(checks, [['pnpm', 'run', 'lint']]);
  });
});

test('Markdownなど対象外の変更では何も実行しない', async () => {
  await withProject({ 'package.json': JSON.stringify({ scripts: { lint: 'true' } }) }, root => {
    const { checks } = planChecks({ root, paths: ['docs/readme.md'], env: {} });
    assert.deepEqual(checks, []);
  });
});

test('環境変数で無効化できる', async () => {
  await withProject({ 'package.json': JSON.stringify({ scripts: { lint: 'true' } }) }, root => {
    const { checks } = planChecks({ root, paths: ['src/a.ts'], env: { AIDD_POST_EDIT_VALIDATE: '0' } });
    assert.deepEqual(checks, []);
  });
});

test('Pythonプロジェクトでは変更ファイルの構文チェックだけを予定する', async () => {
  await withProject({ 'pyproject.toml': '' }, root => {
    const { checks } = planChecks({ root, paths: ['app/main.py'], env: {} });
    assert.deepEqual(checks, [['python3', '-m', 'compileall', '-q', 'app/main.py']]);
  });
});

test('壊れたpackage.jsonは省略理由を残して検証を予定しない', async () => {
  await withProject({ 'package.json': '{' }, root => {
    const { checks, notes } = planChecks({ root, paths: ['src/a.ts'], env: {} });
    assert.deepEqual(checks, []);
    assert.equal(notes.length, 1);
    assert.match(notes[0], /package\.json/);
  });
});

test('lintが失敗すると終了コード2で内容をエージェントへ返す', async () => {
  await withProject({ 'package.json': JSON.stringify({ scripts: { lint: 'echo lint-broken && exit 1' } }) }, root => {
    const result = runHook(root, editInput('src/a.ts'));
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /post-edit検証が失敗しました（編集は適用済み）: npm run lint/);
    assert.match(result.stderr, /lint-broken/);
  });
});

test('lintが成功すると終了コード0で何も出さない', async () => {
  await withProject({ 'package.json': JSON.stringify({ scripts: { lint: 'exit 0' } }) }, root => {
    const result = runHook(root, editInput('src/a.ts'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  });
});

test('不正JSONは作業を止めずに省略理由を残す', async () => {
  await withProject({}, root => {
    const result = runHook(root, '{');
    assert.equal(result.status, 0);
    assert.match(result.stderr, /post-edit検証を省略しました/);
  });
});
