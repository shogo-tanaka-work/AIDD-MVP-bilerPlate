import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readlink, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'scripts/apply-home-harness.sh');

const prepareUserRoot = async root => {
  await mkdir(path.join(root, '.codex'), { recursive: true });
  await mkdir(path.join(root, '.claude'), { recursive: true });
  await writeFile(path.join(root, '.codex/AGENTS.md'), 'existing codex instructions\n');
  await writeFile(path.join(root, '.claude/CLAUDE.md'), 'existing claude instructions\n');
  await writeFile(path.join(root, '.codex/hooks.json'), '{}\n');
  await writeFile(path.join(root, '.claude/settings.json'), '{}\n');
};

test('隔離したuser rootへhome harnessを適用できる', async () => {
  const userRoot = await mkdtemp(path.join(os.tmpdir(), 'aidd-home-'));
  try {
    await prepareUserRoot(userRoot);
    const result = spawnSync('bash', [script, '--yes'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, AIDD_USER_ROOT_OVERRIDE: userRoot },
    });
    assert.equal(result.status, 0, result.stderr);
    const backup = result.stdout.match(/^backup: (.+)$/m)?.[1];
    assert.ok(backup);
    assert.match(await readFile(path.join(backup, 'manifest.json'), 'utf8'), /sha256/);
    assert.match(await readFile(path.join(userRoot, '.agents/licenses/ECC-LICENSE'), 'utf8'), /MIT License/);
    const settings = await readFile(path.join(userRoot, '.claude/settings.json'), 'utf8');
    assert.match(settings, /pre-tool-use\.mjs/);
    assert.match(settings, /\$HOME\/\.agents\/hooks\/pre-tool-use\.mjs/);
    assert.equal(
      JSON.parse(settings).pluginConfigs['agents-md@builtin'].options.instructionFiles,
      'claude-md-and-agents-md',
    );
  } finally {
    await rm(userRoot, { recursive: true, force: true });
  }
});

test('home dry-runは設定用directoryを作らない', async () => {
  const userRoot = await mkdtemp(path.join(os.tmpdir(), 'aidd-home-dry-'));
  try {
    await prepareUserRoot(userRoot);
    const result = spawnSync('bash', [script, '--dry-run'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, AIDD_USER_ROOT_OVERRIDE: userRoot },
    });
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(lstat(path.join(userRoot, '.agents')));
  } finally {
    await rm(userRoot, { recursive: true, force: true });
  }
});

test('JSON設定が未作成でも安全に初期化できる', async () => {
  const userRoot = await mkdtemp(path.join(os.tmpdir(), 'aidd-home-fresh-'));
  try {
    const result = spawnSync('bash', [script, '--yes'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, AIDD_USER_ROOT_OVERRIDE: userRoot },
    });
    assert.equal(result.status, 0, result.stderr);
    JSON.parse(await readFile(path.join(userRoot, '.codex/hooks.json'), 'utf8'));
    JSON.parse(await readFile(path.join(userRoot, '.claude/settings.json'), 'utf8'));
  } finally {
    await rm(userRoot, { recursive: true, force: true });
  }
});

test('更新した既存symlinkをrestoreする', async () => {
  const userRoot = await mkdtemp(path.join(os.tmpdir(), 'aidd-home-link-'));
  try {
    await prepareUserRoot(userRoot);
    const link = path.join(userRoot, '.codex/AGENTS.md');
    await rm(link);
    await symlink('../old/AGENTS.md', link);
    const applied = spawnSync('bash', [script, '--update', '--yes'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, AIDD_USER_ROOT_OVERRIDE: userRoot },
    });
    assert.equal(applied.status, 0, applied.stderr);
    const backup = applied.stdout.match(/^backup: (.+)$/m)?.[1];
    assert.ok(backup);
    const restored = spawnSync('bash', [path.join(repoRoot, 'bin/aidd'), 'restore', backup, userRoot, '--yes'], { encoding: 'utf8' });
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(await readlink(link), '../old/AGENTS.md');
  } finally {
    await rm(userRoot, { recursive: true, force: true });
  }
});

test('Hook更新時に同じregistrationの他Hookを保持する', async () => {
  const userRoot = await mkdtemp(path.join(os.tmpdir(), 'aidd-home-hooks-'));
  try {
    await prepareUserRoot(userRoot);
    await writeFile(path.join(userRoot, '.claude/settings.json'), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
        { type: 'command', command: 'node /old/pre-tool-use.mjs' },
        { type: 'command', command: 'node /custom/audit.mjs' },
      ] }] },
    }));
    const result = spawnSync('bash', [script, '--update', '--yes'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, AIDD_USER_ROOT_OVERRIDE: userRoot },
    });
    assert.equal(result.status, 0, result.stderr);
    const settings = await readFile(path.join(userRoot, '.claude/settings.json'), 'utf8');
    assert.match(settings, /audit\.mjs/);
    assert.equal((settings.match(/pre-tool-use\.mjs/g) ?? []).length, 1);
  } finally {
    await rm(userRoot, { recursive: true, force: true });
  }
});
