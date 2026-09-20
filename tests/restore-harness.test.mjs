import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aidd = path.join(repoRoot, 'bin/aidd');

const run = args => spawnSync('bash', [aidd, ...args], {
  cwd: repoRoot,
  encoding: 'utf8',
});

test('backup manifestから更新前のファイルを復元する', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'aidd-restore-'));
  try {
    assert.equal(run(['apply', target]).status, 0);
    const agentsPath = path.join(target, 'AGENTS.md');
    await writeFile(agentsPath, 'before-update\n');

    const updated = run(['apply', target, '--update', '--yes']);
    assert.equal(updated.status, 0, updated.stderr);
    const backup = updated.stdout.match(/^backup: (.+)$/m)?.[1];
    assert.ok(backup);
    await writeFile(agentsPath, 'after-update\n');

    const restored = run(['restore', backup, target, '--yes']);
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(await readFile(agentsPath, 'utf8'), 'before-update\n');
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test('backupのhashが一致しない場合は復元しない', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'aidd-restore-hash-'));
  try {
    assert.equal(run(['apply', target]).status, 0);
    const agentsPath = path.join(target, 'AGENTS.md');
    await writeFile(agentsPath, 'before-update\n');
    const updated = run(['apply', target, '--update', '--yes']);
    const backup = updated.stdout.match(/^backup: (.+)$/m)?.[1];
    assert.ok(backup);

    await writeFile(path.join(backup, 'AGENTS.md'), 'tampered\n');
    await writeFile(agentsPath, 'current\n');
    const restored = run(['restore', backup, target, '--yes']);
    assert.notEqual(restored.status, 0);
    assert.match(restored.stderr, /hash/);
    assert.equal(await readFile(agentsPath, 'utf8'), 'current\n');
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test('適用後に変更した追加fileは削除しない', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'aidd-restore-drift-'));
  try {
    const applied = run(['apply', target]);
    assert.equal(applied.status, 0, applied.stderr);
    const backup = applied.stdout.match(/^backup: (.+)$/m)?.[1];
    assert.ok(backup);
    const added = path.join(target, 'AGENTS.md');
    await writeFile(added, 'user-change\n');
    const restored = run(['restore', backup, target, '--yes']);
    assert.notEqual(restored.status, 0);
    assert.match(restored.stderr, /変更された/);
    assert.equal(await readFile(added, 'utf8'), 'user-change\n');
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test('symlink ancestor経由の対象外復元を拒否する', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'aidd-restore-link-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'aidd-restore-outside-'));
  try {
    const backup = path.join(target, '.agents/backups/fixture');
    await mkdir(path.join(backup, 'linked'), { recursive: true });
    await writeFile(path.join(backup, 'linked/file.txt'), 'backup\n');
    await symlink(outside, path.join(target, 'linked'));
    const sha256 = createHash('sha256').update('backup\n').digest('hex');
    await writeFile(path.join(backup, 'manifest.json'), JSON.stringify({
      schema_version: 2,
      target: await (await import('node:fs/promises')).realpath(target),
      files: [{ path: 'linked/file.txt', type: 'file', sha256 }],
      added: [],
    }));
    const restored = run(['restore', backup, target, '--yes']);
    assert.notEqual(restored.status, 0);
    assert.match(restored.stderr, /symlink/);
    await assert.rejects(readFile(path.join(outside, 'file.txt')));
  } finally {
    await rm(target, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('後続pathが危険な場合は先頭fileも復元しない', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'aidd-restore-preflight-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'aidd-restore-preflight-out-'));
  try {
    const backup = path.join(target, '.agents/backups/fixture');
    await mkdir(path.join(backup, 'linked'), { recursive: true });
    await writeFile(path.join(backup, 'safe.txt'), 'backup-safe\n');
    await writeFile(path.join(backup, 'linked/file.txt'), 'backup-linked\n');
    await writeFile(path.join(target, 'safe.txt'), 'current-safe\n');
    await symlink(outside, path.join(target, 'linked'));
    const digest = value => createHash('sha256').update(value).digest('hex');
    await writeFile(path.join(backup, 'manifest.json'), JSON.stringify({
      schema_version: 2,
      target: await (await import('node:fs/promises')).realpath(target),
      files: [
        { path: 'safe.txt', type: 'file', sha256: digest('backup-safe\n') },
        { path: 'linked/file.txt', type: 'file', sha256: digest('backup-linked\n') },
      ],
      added: [],
    }));
    const restored = run(['restore', backup, target, '--yes']);
    assert.notEqual(restored.status, 0);
    assert.equal(await readFile(path.join(target, 'safe.txt'), 'utf8'), 'current-safe\n');
  } finally {
    await rm(target, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
