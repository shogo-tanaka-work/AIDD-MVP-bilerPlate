import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyHarness } from '../scripts/verify-harness.mjs';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const withFixture = async callback => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'aidd-verify-'));
  try {
    await cp(repoRoot, fixture, {
      recursive: true,
      filter: source => !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`),
    });
    await callback(fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
};

test('ボイラープレートの整合性検査が成功する', async () => {
  const report = await verifyHarness(repoRoot);
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.summary.skills.declared, 55);
  assert.equal(report.summary.agents.claude, 4);
  assert.equal(report.summary.agents.codex, 4);
});

test('宣言されたSkillの実体不足を検出する', async () => {
  await withFixture(async fixture => {
    await rm(path.join(fixture, '.agents/skills/react-testing'), { recursive: true });
    const report = await verifyHarness(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(issue => issue.code === 'skill.missing'));
  });
});

test('Skill内の壊れた相対参照を検出する', async () => {
  await withFixture(async fixture => {
    const skillPath = path.join(fixture, '.agents/skills/loop-engineering/SKILL.md');
    const source = await readFile(skillPath, 'utf8');
    await writeFile(skillPath, `${source}\n[missing](references/not-found.md)\n`);
    const report = await verifyHarness(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(issue => issue.code === 'skill.reference-missing'));
  });
});

test('コードブロック内の相対リンク例は参照切れとみなさない', async () => {
  await withFixture(async fixture => {
    const skillPath = path.join(fixture, '.agents/skills/coding-standards/SKILL.md');
    const source = await readFile(skillPath, 'utf8');
    await writeFile(skillPath, `${source}\n\`\`\`markdown\n[example](not-created-yet.md)\n\`\`\`\n`);
    const report = await verifyHarness(fixture);
    assert.equal(
      report.issues.some(issue => issue.path?.includes('not-created-yet.md')),
      false,
    );
  });
});

test('ClaudeとCodexのAgent差分を検出する', async () => {
  await withFixture(async fixture => {
    await rm(path.join(fixture, '.codex/agents/explorer.toml'));
    const report = await verifyHarness(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(issue => issue.code === 'agent.adapter-mismatch'));
  });
});

test('JSON設定の構文エラーを検出する', async () => {
  await withFixture(async fixture => {
    await writeFile(path.join(fixture, '.codex/hooks.json'), '{');
    const report = await verifyHarness(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(issue => issue.code === 'config.invalid-json'));
  });
});

test('宣言されたRuleファイルの不足を検出する', async () => {
  await withFixture(async fixture => {
    await rm(path.join(fixture, '.agents/rules/profiles/frontend.md'));
    const report = await verifyHarness(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(issue => issue.code === 'rule.missing'));
  });
});

test('Skill profileとRule profileの対応漏れを検出する', async () => {
  await withFixture(async fixture => {
    const manifestPath = path.join(fixture, 'aidd.yml');
    const source = await readFile(manifestPath, 'utf8');
    await writeFile(manifestPath, source.replace('    quality: []\n', ''));
    const report = await verifyHarness(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(issue => issue.code === 'profile.mapping-mismatch'));
  });
});

test('Codex execpolicyの不足を検出する', async () => {
  await withFixture(async fixture => {
    await rm(path.join(fixture, '.codex/rules/default.rules'));
    const report = await verifyHarness(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(issue => issue.code === 'codex.rules-missing'));
  });
});

test('適用済みfrontend profileのRule不足を検出する', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'aidd-profile-verify-'));
  try {
    const result = spawnSync('bash', [path.join(repoRoot, 'scripts/apply-project-harness.sh'), target, '--profile', 'frontend'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    await rm(path.join(target, '.agents/rules/profiles/frontend.md'));
    const report = await verifyHarness(target);
    assert.ok(report.issues.some(issue => issue.code === 'rule.missing'));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test('適用済みfrontend profileのSkill不足をstateから検出する', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'aidd-profile-state-'));
  try {
    const result = spawnSync('bash', [path.join(repoRoot, 'scripts/apply-project-harness.sh'), target, '--profile', 'frontend'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    await rm(path.join(target, '.agents/skills/react-testing'), { recursive: true });
    const report = await verifyHarness(target);
    assert.ok(report.issues.some(issue => issue.code === 'skill.missing' && issue.path?.includes('react-testing')));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test('Hook登録の欠落を検出する', async () => {
  await withFixture(async fixture => {
    await writeFile(path.join(fixture, '.codex/hooks.json'), '{}\n');
    const report = await verifyHarness(fixture);
    assert.ok(report.issues.some(issue => issue.code === 'hook.registration-invalid'));
  });
});

test('PostToolUse登録の欠落を検出する', async () => {
  await withFixture(async fixture => {
    const target = path.join(fixture, '.claude/settings.json');
    const config = JSON.parse(await readFile(target, 'utf8'));
    delete config.hooks.PostToolUse;
    await writeFile(target, `${JSON.stringify(config)}\n`);
    const report = await verifyHarness(fixture);
    assert.ok(report.issues.some(issue =>
      issue.code === 'hook.registration-invalid' && issue.message.includes('PostToolUse'),
    ));
    assert.equal(report.issues.some(issue => issue.message.includes('PreToolUse')), false);
  });
});

test('PostToolUse Hook本体の欠落を検出する', async () => {
  await withFixture(async fixture => {
    await rm(path.join(fixture, '.agents/hooks/post-tool-use.mjs'));
    const report = await verifyHarness(fixture);
    assert.ok(report.issues.some(issue => issue.code === 'hook.missing' && issue.path?.includes('post-tool-use')));
  });
});

test('Hook scriptを実行しない偽commandを検出する', async () => {
  await withFixture(async fixture => {
    const target = path.join(fixture, '.codex/hooks.json');
    const config = JSON.parse(await readFile(target, 'utf8'));
    config.hooks.PreToolUse[0].hooks[0].command = 'true # pre-tool-use.mjs';
    await writeFile(target, `${JSON.stringify(config)}\n`);
    const report = await verifyHarness(fixture);
    assert.ok(report.issues.some(issue => issue.code === 'hook.registration-invalid'));
  });
});
