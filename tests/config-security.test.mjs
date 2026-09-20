import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Claudeのallow listにproject code実行とcheckoutを含めない', async () => {
  const settings = JSON.parse(await readFile(path.join(repoRoot, '.claude/settings.json'), 'utf8'));
  assert.equal(settings.permissions.allow.includes('Bash(npm run *)'), false);
  assert.equal(settings.permissions.allow.includes('Bash(git checkout *)'), false);
  assert.equal(settings.permissions.allow.some(rule => rule.startsWith('Bash(npm ')), false);
  assert.equal(settings.permissions.allow.some(rule => rule.startsWith('Bash(npx ')), false);
  assert.ok(settings.permissions.deny.some(rule => rule.includes('git reset')));
  assert.ok(settings.permissions.deny.some(rule => rule.includes('git clean')));
});

test('Claudeのdeny listはgitignore構文で秘密ファイルを網羅し.env.exampleを除外する', async () => {
  const settings = JSON.parse(await readFile(path.join(repoRoot, '.claude/settings.json'), 'utf8'));
  const { deny, allow } = settings.permissions;
  // Read/Editルールはgitignore構文でbrace展開を解釈しないため、拡張子ごとに1ルール置く。
  assert.equal(deny.some(rule => /\{.*\}/.test(rule)), false);
  for (const extension of ['key', 'pem', 'p12', 'pfx']) {
    assert.ok(deny.includes(`Read(**/*.${extension})`), extension);
  }
  assert.ok(deny.includes('Read(**/.env)'));
  assert.ok(deny.includes('Read(**/.env.*)'));
  assert.ok(deny.indexOf('Read(!**/.env.example)') > deny.indexOf('Read(**/.env.*)'));
  assert.ok(deny.includes('Read(**/credentials.json)'));
  // MultiEditはlegacyツール名で、permissionsにもHook matcherにも残さない。
  assert.equal(allow.includes('MultiEdit'), false);
  const matchers = Object.values(settings.hooks).flat().map(registration => registration.matcher);
  assert.equal(matchers.some(matcher => /MultiEdit/.test(matcher)), false);
});

test('Claude project hookはproject root環境変数から起動する', async () => {
  const settings = JSON.parse(await readFile(path.join(repoRoot, '.claude/settings.json'), 'utf8'));
  const command = settings.hooks.PreToolUse[0].hooks[0].command;
  assert.match(command, /CLAUDE_PROJECT_DIR/);
  assert.equal(command.includes('git rev-parse'), false);
});

test('Codex hookは非Gitディレクトリでもproject rootを解決できる', async () => {
  const hooks = JSON.parse(await readFile(path.join(repoRoot, '.codex/hooks.json'), 'utf8'));
  const command = hooks.hooks.PreToolUse[0].hooks[0].command;
  assert.equal(command.includes('git rev-parse'), false);
  assert.match(command, /\.codex\/hooks\.json/);
  assert.match(command, /exit 2/);
});

test('Codex execpolicyは危険なcommandをpromptまたはforbiddenにする', async () => {
  const rules = await readFile(path.join(repoRoot, '.codex/rules/default.rules'), 'utf8');
  assert.match(rules, /pattern = \["git", "reset"\][\s\S]*?decision = "prompt"/);
  assert.match(rules, /pattern = \["git", "clean"\][\s\S]*?decision = "prompt"/);
  assert.match(rules, /pattern = \["sudo"\][\s\S]*?decision = "forbidden"/);
});

test('Codex PostToolUse hookはproject rootをAIDD_PROJECT_DIRとして渡す', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'aidd-codex-post-hook-'));
  const project = path.join(parent, 'project');
  const nested = path.join(project, 'src');
  try {
    await mkdir(path.join(project, '.codex'), { recursive: true });
    await mkdir(path.join(project, '.agents/hooks'), { recursive: true });
    await mkdir(nested, { recursive: true });
    await cp(path.join(repoRoot, '.codex/hooks.json'), path.join(project, '.codex/hooks.json'));
    await cp(path.join(repoRoot, '.agents/hooks/post-tool-use.mjs'), path.join(project, '.agents/hooks/post-tool-use.mjs'));
    await writeFile(path.join(project, 'package.json'), JSON.stringify({ scripts: { lint: 'echo root-lint && exit 1' } }));
    const config = JSON.parse(await readFile(path.join(project, '.codex/hooks.json'), 'utf8'));
    const command = config.hooks.PostToolUse[0].hooks[0].command;
    const result = spawnSync('bash', ['-c', command], {
      cwd: nested,
      encoding: 'utf8',
      input: JSON.stringify({ tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n*** Update File: src/a.ts\n*** End Patch' } }),
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /root-lint/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('Codex hookは子directoryから最寄りのproject hookを実行する', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'aidd-codex-hook-'));
  const project = path.join(parent, 'project');
  const nested = path.join(project, 'src/nested');
  try {
    await mkdir(path.join(project, '.codex'), { recursive: true });
    await mkdir(path.join(project, '.agents/hooks'), { recursive: true });
    await mkdir(nested, { recursive: true });
    await cp(path.join(repoRoot, '.codex/hooks.json'), path.join(project, '.codex/hooks.json'));
    await cp(path.join(repoRoot, '.agents/hooks/pre-tool-use.mjs'), path.join(project, '.agents/hooks/pre-tool-use.mjs'));
    await writeFile(path.join(parent, '.git'), 'parent marker\n');
    const config = JSON.parse(await readFile(path.join(project, '.codex/hooks.json'), 'utf8'));
    const command = config.hooks.PreToolUse[0].hooks[0].command;
    const result = spawnSync('bash', ['-c', command], {
      cwd: nested,
      encoding: 'utf8',
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }),
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
