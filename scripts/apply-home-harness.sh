#!/bin/bash
set -euo pipefail

AIDD_ROOT="$(git rev-parse --show-toplevel)"
AIDD_USER_ROOT="${HOME:?HOME is required}"
AIDD_BACKUP_DIR="$AIDD_USER_ROOT/.agents/backups/2026-08-14-aidd-harness"
AIDD_HOOK_COMMAND="node \"$AIDD_USER_ROOT/.agents/hooks/pre-tool-use.mjs\""

if [ -e "$AIDD_BACKUP_DIR" ]; then
  echo "中断: backup先が既に存在します: $AIDD_BACKUP_DIR" >&2
  exit 1
fi

for name in architecture-decision-records coding-standards error-handling git-workflow production-audit repo-scan security-review verification-loop workspace-surface-audit; do
  if [ -e "$AIDD_USER_ROOT/.agents/skills/$name" ] || [ -L "$AIDD_USER_ROOT/.agents/skills/$name" ]; then
    echo "中断: global Skillが既に存在します: $name" >&2
    exit 1
  fi
  if [ -e "$AIDD_USER_ROOT/.claude/skills/$name" ] || [ -L "$AIDD_USER_ROOT/.claude/skills/$name" ]; then
    echo "中断: Claude Skillが既に存在します: $name" >&2
    exit 1
  fi
done

mkdir -p \
  "$AIDD_BACKUP_DIR" \
  "$AIDD_USER_ROOT/.agents/rules" \
  "$AIDD_USER_ROOT/.agents/hooks" \
  "$AIDD_USER_ROOT/.agents/licenses" \
  "$AIDD_USER_ROOT/.claude/rules"

cp -p "$AIDD_USER_ROOT/.codex/AGENTS.md" "$AIDD_BACKUP_DIR/codex-AGENTS.md"
cp -p "$AIDD_USER_ROOT/.claude/CLAUDE.md" "$AIDD_BACKUP_DIR/claude-CLAUDE.md"
cp -p "$AIDD_USER_ROOT/.codex/hooks.json" "$AIDD_BACKUP_DIR/codex-hooks.json"
cp -p "$AIDD_USER_ROOT/.claude/settings.json" "$AIDD_BACKUP_DIR/claude-settings.json"

cp -p "$AIDD_ROOT/.agents/home/AGENTS.md" "$AIDD_USER_ROOT/.agents/AGENTS.md"
cp -p "$AIDD_ROOT/.agents/home/CLAUDE.md" "$AIDD_USER_ROOT/.claude/CLAUDE.md"
mv "$AIDD_USER_ROOT/.codex/AGENTS.md" "$AIDD_BACKUP_DIR/codex-AGENTS-moved.md"
ln -s ../.agents/AGENTS.md "$AIDD_USER_ROOT/.codex/AGENTS.md"

for name in architecture-decision-records coding-standards error-handling git-workflow production-audit repo-scan security-review verification-loop workspace-surface-audit; do
  cp -R "$AIDD_ROOT/.agents/skills/$name" "$AIDD_USER_ROOT/.agents/skills/"
  ln -s "../../.agents/skills/$name" "$AIDD_USER_ROOT/.claude/skills/$name"
done

for name in code-design error-handling security secrets verification; do
  cp -p "$AIDD_ROOT/.agents/rules/$name.md" "$AIDD_USER_ROOT/.agents/rules/$name.md"
  ln -s "../../.agents/rules/$name.md" "$AIDD_USER_ROOT/.claude/rules/aidd-$name.md"
done

cp -p "$AIDD_ROOT/.agents/hooks/pre-tool-use.mjs" "$AIDD_USER_ROOT/.agents/hooks/pre-tool-use.mjs"
cp -p "$AIDD_ROOT/.agents/licenses/ECC-LICENSE" "$AIDD_USER_ROOT/.agents/licenses/ECC-LICENSE"

for name in explorer code-reviewer security-auditor docs-researcher; do
  cp -p "$AIDD_ROOT/.claude/agents/$name.md" "$AIDD_USER_ROOT/.claude/agents/$name.md"
  cp -p "$AIDD_ROOT/.codex/agents/$name.toml" "$AIDD_USER_ROOT/.codex/agents/$name.toml"
done

AIDD_CODEX_HOOKS_TMP="$(mktemp)"
jq --arg command "$AIDD_HOOK_COMMAND" '
  .hooks //= {} |
  .hooks.PreToolUse //= [] |
  if any(.hooks.PreToolUse[]?; any(.hooks[]?; .command == $command)) then .
  else .hooks.PreToolUse += [{
    matcher: "Bash|apply_patch|Edit|Write|Read|Grep|Glob",
    hooks: [{type: "command", command: $command, timeout: 5, statusMessage: "秘密情報へのアクセスを確認中"}]
  }] end
' "$AIDD_USER_ROOT/.codex/hooks.json" > "$AIDD_CODEX_HOOKS_TMP"
jq empty "$AIDD_CODEX_HOOKS_TMP"
mv "$AIDD_CODEX_HOOKS_TMP" "$AIDD_USER_ROOT/.codex/hooks.json"

AIDD_CLAUDE_SETTINGS_TMP="$(mktemp)"
jq --arg command "$AIDD_HOOK_COMMAND" '
  .hooks //= {} |
  .hooks.PreToolUse //= [] |
  if any(.hooks.PreToolUse[]?; any(.hooks[]?; .command == $command)) then .
  else .hooks.PreToolUse += [{
    matcher: "Bash|Read|Write|Edit|MultiEdit|Grep|Glob",
    hooks: [{type: "command", command: $command, timeout: 5}]
  }] end
' "$AIDD_USER_ROOT/.claude/settings.json" > "$AIDD_CLAUDE_SETTINGS_TMP"
jq empty "$AIDD_CLAUDE_SETTINGS_TMP"
mv "$AIDD_CLAUDE_SETTINGS_TMP" "$AIDD_USER_ROOT/.claude/settings.json"

test "$(readlink "$AIDD_USER_ROOT/.codex/AGENTS.md")" = "../.agents/AGENTS.md"
for name in architecture-decision-records coding-standards error-handling git-workflow production-audit repo-scan security-review verification-loop workspace-surface-audit; do
  test -f "$AIDD_USER_ROOT/.agents/skills/$name/SKILL.md"
  test -f "$AIDD_USER_ROOT/.claude/skills/$name/SKILL.md"
done

echo "home harnessの配置が完了しました。"
echo "backup: $AIDD_BACKUP_DIR"
echo "Codexでは次回起動時に /hooks で追加Hookを確認・信頼してください。"
