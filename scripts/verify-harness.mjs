#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdir, readFile, readlink, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exists = async target => {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const readDirectories = async target => {
  if (!(await exists(target))) return [];
  const entries = await readdir(target, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
};

const readFilesWithExtension = async (target, extension) => {
  if (!(await exists(target))) return [];
  const entries = await readdir(target, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => entry.name.slice(0, -extension.length))
    .sort();
};

const unique = values => [...new Set(values)];

const parseYamlListSection = (source, section, endSections = []) => {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `${section}:`);
  if (start < 0) return [];

  const values = [];
  for (const line of lines.slice(start + 1)) {
    if (endSections.some(name => line === `${name}:`)) break;
    const match = line.match(/^\s+-\s+([A-Za-z0-9_-]+)\s*$/);
    if (match) values.push(match[1]);
  }
  return unique(values);
};

const parseSkillGroups = source => {
  const groups = { global: [], project_base: [], profiles: {} };
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === 'skills:');
  if (start < 0) return groups;

  let group = null;
  let profile = null;
  for (const line of lines.slice(start + 1)) {
    if (/^[a-z_]+:/.test(line)) break;
    const groupMatch = line.match(/^  (global|project_base|profiles):\s*$/);
    if (groupMatch) {
      group = groupMatch[1];
      profile = null;
      continue;
    }
    const profileMatch = line.match(/^    ([a-z_]+):\s*$/);
    if (group === 'profiles' && profileMatch) {
      profile = profileMatch[1];
      groups.profiles[profile] = [];
      continue;
    }
    const itemMatch = line.match(/^\s+-\s+([A-Za-z0-9_-]+)\s*$/);
    if (!itemMatch) continue;
    if (group === 'global' || group === 'project_base') groups[group].push(itemMatch[1]);
    if (group === 'profiles' && profile) groups.profiles[profile].push(itemMatch[1]);
  }
  return groups;
};

const parseRulePacks = source => {
  const result = { common: [], profiles: {} };
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === 'rule_packs:');
  if (start < 0) return result;

  let section = null;
  let profile = null;
  for (const line of lines.slice(start + 1)) {
    if (/^[a-z_]+:/.test(line)) break;
    if (/^  common:\s*$/.test(line)) {
      section = 'common';
      profile = null;
      continue;
    }
    if (/^  profiles:\s*$/.test(line)) {
      section = 'profiles';
      profile = null;
      continue;
    }
    const emptyProfile = line.match(/^    ([a-z_]+):\s*\[\]\s*$/);
    const profileHeader = line.match(/^    ([a-z_]+):\s*$/);
    if (section === 'profiles' && (emptyProfile || profileHeader)) {
      profile = (emptyProfile ?? profileHeader)[1];
      result.profiles[profile] = [];
      continue;
    }
    const item = line.match(/^\s+-\s+([^\s]+)\s*$/);
    if (!item) continue;
    if (section === 'common') result.common.push(item[1]);
    if (section === 'profiles' && profile) result.profiles[profile].push(item[1]);
  }
  return result;
};

const parseFrontmatter = source => {
  const lines = source.split('\n');
  if (lines[0] !== '---') return {};
  const end = lines.indexOf('---', 1);
  if (end < 0) return {};

  // nameとdescriptionの存在確認が目的なので、YAMLのblock scalar（> / |）と
  // 字下げされた継続行を直前のkeyへ連結する程度の解析にとどめる。
  const entries = [];
  for (const line of lines.slice(1, end)) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      const raw = keyMatch[2].trim();
      entries.push([keyMatch[1], /^[>|][-+]?$/.test(raw) ? '' : raw]);
      continue;
    }
    const continuation = line.match(/^\s+(\S.*)$/);
    if (continuation && entries.length > 0) {
      const last = entries[entries.length - 1];
      last[1] = last[1] ? `${last[1]} ${continuation[1].trim()}` : continuation[1].trim();
    }
  }
  return Object.fromEntries(entries);
};

const removeFencedCode = source => {
  let fence = null;
  return source
    .split('\n')
    .filter(line => {
      const match = line.match(/^\s*(```|~~~)/);
      if (match) {
        fence = fence ? null : match[1];
        return false;
      }
      return fence === null;
    })
    .join('\n');
};

const localReferences = source => {
  const withoutCode = removeFencedCode(source);
  const markdown = [...withoutCode.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
  const skillRoot = [...withoutCode.matchAll(/\$SKILL_DIR\/([A-Za-z0-9_.\/-]+)/g)]
    .map(match => match[1]);

  return unique([...markdown, ...skillRoot])
    .map(reference => reference.replace(/^</, '').replace(/>$/, '').split('#', 1)[0])
    .filter(reference => reference && !/^(?:https?:|mailto:|#|\/)/.test(reference));
};

const compareSets = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

// adapterごとに登録されているべきHook。Codex側は非Gitディレクトリでもrootを解決するshell前置きを要求する。
const hookExpectations = [
  {
    event: 'PreToolUse',
    script: 'pre-tool-use.mjs',
    maxTimeout: 5,
    tools: {
      claude: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob'],
      codex: ['Bash', 'apply_patch', 'Read', 'Write', 'Edit', 'Grep', 'Glob'],
    },
    codexFallback: 'exit 2',
  },
  {
    event: 'PostToolUse',
    script: 'post-tool-use.mjs',
    maxTimeout: 60,
    tools: {
      claude: ['Write', 'Edit'],
      codex: ['apply_patch', 'Write', 'Edit'],
    },
    codexFallback: 'exit 0',
  },
];

const hasValidHookRegistration = (config, adapter, expectation) => {
  const registrations = Array.isArray(config?.hooks?.[expectation.event]) ? config.hooks[expectation.event] : [];
  return registrations.some(registration => {
    const tools = String(registration?.matcher ?? '').split('|');
    const hooks = Array.isArray(registration?.hooks) ? registration.hooks : [];
    return expectation.tools[adapter].every(tool => tools.includes(tool)) &&
      hooks.some(hook => {
        const command = String(hook?.command ?? '');
        const commandValid = adapter === 'claude'
          ? command === `node "\${CLAUDE_PROJECT_DIR}/.agents/hooks/${expectation.script}"`
          : command.startsWith('AIDD_HOOK_ROOT="$PWD";') &&
            command.includes(expectation.codexFallback) &&
            command.endsWith(`node "$AIDD_HOOK_ROOT/.agents/hooks/${expectation.script}"`);
        return hook?.type === 'command' &&
          Number.isInteger(hook.timeout) && hook.timeout > 0 && hook.timeout <= expectation.maxTimeout &&
          commandValid;
      });
  });
};

const issue = (code, message, issuePath) => ({
  code,
  message,
  ...(issuePath ? { path: issuePath } : {}),
});

export const verifyHarness = async rootInput => {
  const root = path.resolve(rootInput);
  const issues = [];
  const manifestPath = path.join(root, 'aidd.yml');

  if (!(await exists(manifestPath))) {
    return {
      ok: false,
      root,
      issues: [issue('manifest.missing', 'aidd.ymlがありません。', 'aidd.yml')],
      summary: { skills: { declared: 0, installed: 0 }, agents: { claude: 0, codex: 0 } },
    };
  }

  const manifest = await readFile(manifestPath, 'utf8');
  const skillGroups = parseSkillGroups(manifest);
  const rulePacks = parseRulePacks(manifest);
  const declaredSkills = unique([
    ...skillGroups.global,
    ...skillGroups.project_base,
    ...Object.values(skillGroups.profiles).flat(),
  ]).sort();
  const declaredAgents = parseYamlListSection(manifest, 'agents', ['local_only', 'updates']).sort();
  const installedSkills = await readDirectories(path.join(root, '.agents/skills'));
  const sourceRoot =
    (await exists(path.join(root, 'bin/aidd'))) &&
    (await exists(path.join(root, 'scripts/apply-project-harness.sh')));

  let selectedProfiles = [];
  const statePath = path.join(root, '.agents/aidd-state.json');
  if (!sourceRoot && await exists(statePath)) {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      if (
        state.schema_version !== 1 ||
        !Array.isArray(state.profiles) ||
        !state.profiles.every(profile => typeof profile === 'string' && profile in skillGroups.profiles)
      ) throw new Error('schemaまたはprofileが不正です');
      selectedProfiles = unique(state.profiles).sort();
    } catch (error) {
      issues.push(issue('state.invalid', `aidd-state.jsonが不正です: ${error.message}`, '.agents/aidd-state.json'));
    }
  } else if (!sourceRoot) {
    selectedProfiles = Object.entries(skillGroups.profiles)
      .filter(([, skills]) => skills.some(name => installedSkills.includes(name)))
      .map(([profile]) => profile);
  }

  const requiredSkills = sourceRoot
    ? declaredSkills
    : unique([
        ...skillGroups.global,
        ...skillGroups.project_base,
        ...selectedProfiles.flatMap(profile => skillGroups.profiles[profile] ?? []),
      ]).sort();

  for (const name of requiredSkills) {
    if (!installedSkills.includes(name)) {
      issues.push(issue('skill.missing', `宣言されたSkillがありません: ${name}`, `.agents/skills/${name}`));
    }
  }
  for (const name of installedSkills) {
    if (!declaredSkills.includes(name)) {
      issues.push(issue('skill.undeclared', `台帳にないSkillがあります: ${name}`, `.agents/skills/${name}`));
    }
  }

  const skillProfileNames = Object.keys(skillGroups.profiles).sort();
  const ruleProfileNames = Object.keys(rulePacks.profiles).sort();
  if (!compareSets(skillProfileNames, ruleProfileNames)) {
    issues.push(issue('profile.mapping-mismatch', 'Skill profileとRule profileの一覧が一致しません。'));
  }

  const requiredRules = sourceRoot
    ? [...rulePacks.common, ...Object.values(rulePacks.profiles).flat()]
    : [
        ...rulePacks.common,
        ...selectedProfiles.flatMap(profile => rulePacks.profiles[profile] ?? []),
      ];
  for (const relativeRule of unique(requiredRules)) {
    const relativePath = `.agents/rules/${relativeRule}`;
    if (!(await exists(path.join(root, relativePath)))) {
      issues.push(issue('rule.missing', `宣言されたRuleがありません: ${relativeRule}`, relativePath));
    }
  }

  for (const name of installedSkills) {
    const relativeSkillPath = `.agents/skills/${name}/SKILL.md`;
    const skillPath = path.join(root, relativeSkillPath);
    if (!(await exists(skillPath))) {
      issues.push(issue('skill.entrypoint-missing', `SKILL.mdがありません: ${name}`, relativeSkillPath));
      continue;
    }

    const source = await readFile(skillPath, 'utf8');
    const frontmatter = parseFrontmatter(source);
    if (frontmatter.name !== name || !frontmatter.description) {
      issues.push(issue('skill.frontmatter-invalid', `frontmatterのnameまたはdescriptionが不正です: ${name}`, relativeSkillPath));
    }

    for (const reference of localReferences(source)) {
      const referencePath = path.resolve(path.dirname(skillPath), reference);
      if (!(await exists(referencePath))) {
        issues.push(issue(
          'skill.reference-missing',
          `Skillの相対参照が見つかりません: ${reference}`,
          path.relative(root, referencePath),
        ));
      }
    }
  }

  const claudeAgents = await readFilesWithExtension(path.join(root, '.claude/agents'), '.md');
  const codexAgents = await readFilesWithExtension(path.join(root, '.codex/agents'), '.toml');
  if (!compareSets(claudeAgents, codexAgents) || !compareSets(claudeAgents, declaredAgents)) {
    issues.push(issue('agent.adapter-mismatch', 'Claude、Codex、aidd.ymlのAgent一覧が一致しません。'));
  }

  const parsedConfigs = new Map();
  for (const relativePath of ['.claude/settings.json', '.codex/hooks.json']) {
    const target = path.join(root, relativePath);
    try {
      parsedConfigs.set(relativePath, JSON.parse(await readFile(target, 'utf8')));
    } catch (error) {
      issues.push(issue('config.invalid-json', `${relativePath}をJSONとして読めません: ${error.message}`, relativePath));
    }
  }

  for (const [relativePath, config] of parsedConfigs) {
    const adapter = relativePath.startsWith('.claude') ? 'claude' : 'codex';
    for (const expectation of hookExpectations) {
      if (!hasValidHookRegistration(config, adapter, expectation)) {
        issues.push(issue(
          'hook.registration-invalid',
          `${relativePath}の${expectation.event} Hook登録が不正です。`,
          relativePath,
        ));
      }
    }
  }

  for (const relativePath of ['scripts/apply-project-harness.sh', 'scripts/apply-home-harness.sh']) {
    const target = path.join(root, relativePath);
    if (!(await exists(target))) continue;
    const syntax = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
    if (syntax.status !== 0) {
      issues.push(issue('script.invalid-shell', `${relativePath}のshell構文が不正です。`, relativePath));
    }
  }

  for (const expectation of hookExpectations) {
    const relativeHookPath = `.agents/hooks/${expectation.script}`;
    if (!(await exists(path.join(root, relativeHookPath)))) {
      issues.push(issue('hook.missing', `共通${expectation.event} Hookがありません。`, relativeHookPath));
    }
  }

  const codexRulesPath = path.join(root, '.codex/rules/default.rules');
  if (!(await exists(codexRulesPath))) {
    issues.push(issue('codex.rules-missing', 'Codex execpolicyがありません。', '.codex/rules/default.rules'));
  }

  const licensePath = path.join(root, '.agents/licenses/ECC-LICENSE');
  if (!(await exists(licensePath))) {
    issues.push(issue('license.missing', 'ECC由来資産のライセンス全文がありません。', '.agents/licenses/ECC-LICENSE'));
  }

  const claudeSkills = path.join(root, '.claude/skills');
  try {
    const destination = await readlink(claudeSkills);
    if (destination !== '../.agents/skills') {
      issues.push(issue('adapter.symlink-invalid', '.claude/skillsのリンク先が不正です。', '.claude/skills'));
    }
  } catch {
    issues.push(issue('adapter.symlink-invalid', '.claude/skillsが相対symlinkではありません。', '.claude/skills'));
  }

  return {
    ok: issues.length === 0,
    root,
    issues,
    summary: {
      skills: { declared: declaredSkills.length, installed: installedSkills.length },
      agents: { claude: claudeAgents.length, codex: codexAgents.length },
    },
  };
};

const printHuman = report => {
  const mark = report.ok ? 'PASS' : 'FAIL';
  process.stdout.write(`AIDD VERIFY: ${mark}\n`);
  process.stdout.write(`root: ${report.root}\n`);
  process.stdout.write(`skills: ${report.summary.skills.installed}/${report.summary.skills.declared}\n`);
  process.stdout.write(`agents: Claude ${report.summary.agents.claude} / Codex ${report.summary.agents.codex}\n`);
  for (const current of report.issues) {
    process.stdout.write(`- [${current.code}] ${current.message}${current.path ? ` (${current.path})` : ''}\n`);
  }
};

const run = async () => {
  const args = process.argv.slice(2);
  const formatIndex = args.indexOf('--format');
  const format = formatIndex >= 0 ? args[formatIndex + 1] : 'text';
  if (formatIndex >= 0) args.splice(formatIndex, 2);
  if (!['text', 'json'].includes(format)) {
    process.stderr.write(`未対応のformatです: ${format}\n`);
    process.exitCode = 2;
    return;
  }

  const root = args[0] ?? process.cwd();
  const report = await verifyHarness(root);
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }
  if (!report.ok) process.exitCode = 1;
};

const isMain = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isMain) await run();
