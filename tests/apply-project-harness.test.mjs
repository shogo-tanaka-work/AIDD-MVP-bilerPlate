import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applyScript = path.join(repoRoot, 'scripts/apply-project-harness.sh');

const runApply = args => spawnSync('bash', [applyScript, ...args], {
  cwd: repoRoot,
  encoding: 'utf8',
});

const withTarget = async callback => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'aidd-apply-'));
  try {
    await callback(target);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
};

test('初回適用後にverifyが成功する', async () => {
  await withTarget(async target => {
    const applied = runApply([target]);
    assert.equal(applied.status, 0, applied.stderr);

    const verified = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/verify-harness.mjs'), target, '--format', 'json'], {
      encoding: 'utf8',
    });
    assert.equal(verified.status, 0, verified.stderr || verified.stdout);
    assert.equal(JSON.parse(verified.stdout).ok, true);
  });
});

test('非対話のupdateはyesなしでは変更しない', async () => {
  await withTarget(async target => {
    assert.equal(runApply([target]).status, 0);
    const agentsPath = path.join(target, 'AGENTS.md');
    await writeFile(agentsPath, 'project-owned\n');

    const result = runApply([target, '--update']);
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(agentsPath, 'utf8'), 'project-owned\n');
    assert.match(result.stderr, /--yes/);
  });
});

test('update dry-runは差分を表示するが変更しない', async () => {
  await withTarget(async target => {
    assert.equal(runApply([target]).status, 0);
    const agentsPath = path.join(target, 'AGENTS.md');
    await writeFile(agentsPath, 'project-owned\n');

    const result = runApply([target, '--update', '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(agentsPath, 'utf8'), 'project-owned\n');
    assert.match(result.stdout, /更新/);
  });
});

test('frontend profileだけが対応するRule packを追加する', async () => {
  await withTarget(async target => {
    const result = runApply([target, '--profile', 'frontend']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(path.join(target, '.agents/rules/profiles/frontend.md'), 'utf8').then(() => true), true);
    await assert.rejects(readFile(path.join(target, '.agents/rules/profiles/mobile-ios.md'), 'utf8'));
  });
});

test('update実行時はbackup manifestを残す', async () => {
  await withTarget(async target => {
    assert.equal(runApply([target]).status, 0);
    await writeFile(path.join(target, 'AGENTS.md'), 'project-owned\n');

    const result = runApply([target, '--update', '--yes']);
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), 'project-owned\n');
    assert.match(result.stdout, /backup:/);
    assert.match(result.stdout, /manifest\.json/);
  });
});

test('更新後verifyが失敗した場合は変更前へrollbackする', async () => {
  await withTarget(async target => {
    assert.equal(runApply([target]).status, 0);
    const agentsPath = path.join(target, 'AGENTS.md');
    await writeFile(agentsPath, 'project-owned\n');

    const undeclared = path.join(target, '.agents/skills/not-declared');
    await mkdir(undeclared, { recursive: true });
    await writeFile(path.join(undeclared, 'SKILL.md'), '---\nname: not-declared\ndescription: fixture\n---\n');

    const result = runApply([target, '--update', '--yes']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /rollback/);
    assert.equal(await readFile(agentsPath, 'utf8'), 'project-owned\n');
  });
});

test('対象外を指すsymlinkは更新せず拒否する', async () => {
  await withTarget(async target => {
    const outside = path.join(os.tmpdir(), `aidd-outside-${process.pid}.txt`);
    await writeFile(outside, 'outside\n');
    await symlink(outside, path.join(target, 'AGENTS.md'));
    try {
      const result = runApply([target, '--update', '--yes']);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /symlink/);
      assert.equal(await readFile(outside, 'utf8'), 'outside\n');
    } finally {
      await rm(outside, { force: true });
    }
  });
});

test('dry-runは存在しない対象を作成しない', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'aidd-dry-parent-'));
  const target = path.join(parent, 'new-project');
  try {
    const result = runApply([target, '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(lstat(target));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('途中でsymlink安全性検査に失敗したら先行変更をrollbackする', async () => {
  await withTarget(async target => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'aidd-outside-dir-'));
    await symlink(outside, path.join(target, '.agents'));
    try {
      const result = runApply([target, '--yes']);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /rollback/);
      await assert.rejects(lstat(path.join(target, 'AGENTS.md')));
      assert.deepEqual(await (await import('node:fs/promises')).readdir(outside), []);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

test('file配置先がdirectoryなら拒否して先行変更をrollbackする', async () => {
  await withTarget(async target => {
    await mkdir(path.join(target, 'aidd.yml'));
    const result = runApply([target, '--yes']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /directory/);
    await assert.rejects(lstat(path.join(target, 'AGENTS.md')));
    assert.equal((await lstat(path.join(target, 'aidd.yml'))).isDirectory(), true);
  });
});

test('dry-runは存在しない対象directoryを作成しない', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'aidd-dry-parent-'));
  const target = path.join(parent, 'missing');
  try {
    const result = runApply([target, '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(lstat(target));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('既存symlink経由でproject外を上書きしない', async () => {
  await withTarget(async target => {
    const outside = path.join(os.tmpdir(), `aidd-outside-${process.pid}`);
    await writeFile(outside, 'outside\n');
    await symlink(outside, path.join(target, 'AGENTS.md'));
    try {
      const result = runApply([target, '--update', '--yes']);
      assert.notEqual(result.status, 0);
      assert.equal(await readFile(outside, 'utf8'), 'outside\n');
    } finally {
      await rm(outside, { force: true });
    }
  });
});
