#!/bin/bash
set -Eeuo pipefail

resolve_self() {
  local src="${BASH_SOURCE[0]}" dir
  while [ -L "$src" ]; do
    dir="$(cd -P "$(dirname "$src")" && pwd)"
    src="$(readlink "$src")"
    [[ "$src" != /* ]] && src="$dir/$src"
  done
  cd -P "$(dirname "$src")" && pwd
}

AIDD_ROOT="$(dirname "$(resolve_self)")"
AIDD_USER_ROOT="${AIDD_USER_ROOT_OVERRIDE:-${HOME:?HOME is required}}"
AIDD_USER_ROOT="$(node -e 'const path=require("node:path"); process.stdout.write(path.resolve(process.argv[1]))' "$AIDD_USER_ROOT")"
[ ! -d "$AIDD_USER_ROOT" ] || AIDD_USER_ROOT="$(cd "$AIDD_USER_ROOT" && pwd -P)"
MODE="add"
YES=0
DRY_RUN=0

usage() {
  cat <<'EOF'
使い方: apply-home-harness.sh [--update] [--yes] [--dry-run]

  --update   既存の共通資産をbackupして更新する
  --yes      非対話での変更を明示的に承認する
  --dry-run  変更予定だけを表示する
EOF
}

read_global_skills() {
  awk '
    /^skills:/ { in_skills=1; next }
    in_skills && /^  global:/ { in_global=1; next }
    in_global && /^  [a-z_]+:/ { exit }
    in_global && /^    - / { print $2 }
  ' "$AIDD_ROOT/aidd.yml"
}

read_common_rules() {
  awk '
    /^rule_packs:/ { in_rules=1; next }
    in_rules && /^  common:/ { in_common=1; next }
    in_common && /^  profiles:/ { exit }
    in_common && /^      - / { print $2 }
  ' "$AIDD_ROOT/aidd.yml"
}

read_agents() {
  awk '
    /^agents:/ { in_agents=1; next }
    in_agents && /^[a-z_]+:/ { exit }
    in_agents && /^    - / { print $2 }
  ' "$AIDD_ROOT/aidd.yml"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --update) MODE="update"; shift ;;
    --yes) YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if ! node "$AIDD_ROOT/scripts/verify-harness.mjs" "$AIDD_ROOT" >/dev/null; then
  echo "中断: ボイラープレート自身のverifyに失敗しました" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "中断: apply-homeにはjqが必要です" >&2
  exit 1
fi
node "$AIDD_ROOT/scripts/path-safety.mjs" "$AIDD_USER_ROOT" "$AIDD_USER_ROOT" root
for settings in "$AIDD_USER_ROOT/.codex/hooks.json" "$AIDD_USER_ROOT/.claude/settings.json"; do
  node "$AIDD_ROOT/scripts/path-safety.mjs" "$AIDD_USER_ROOT" "$settings" regular
  if [ -e "$settings" ] && ! jq empty "$settings" >/dev/null 2>&1; then
    echo "中断: JSON設定が不正です: $settings" >&2
    exit 1
  fi
done

if [ "$DRY_RUN" -eq 0 ] && [ "$YES" -eq 0 ]; then
  if [ -t 0 ]; then
    printf 'ホーム環境のharness設定を変更します。続行しますか? [y/N] '
    read -r answer
    case "$answer" in y|Y|yes|YES) ;; *) echo "中断しました。"; exit 1 ;; esac
  else
    echo "中断: 非対話で実行するには --yes が必要です" >&2
    exit 1
  fi
fi

AIDD_BACKUP_DIR="$AIDD_USER_ROOT/.agents/backups/$(date +%Y-%m-%d-%H%M%S)-$$"
AIDD_HOOK_COMMAND='node "$HOME/.agents/hooks/pre-tool-use.mjs"'
ADDED=0
UPDATED=0
SKIPPED=0
BACKED_UP=()
ADDED_PATHS=()
MUTATING=0
ROLLING_BACK=0

assert_safe_path() {
  node "$AIDD_ROOT/scripts/path-safety.mjs" "$AIDD_USER_ROOT" "$1" "${2:-regular}"
}

atomic_copy() {
  local src="$1" dst="$2" temp
  assert_safe_path "$dst"
  mkdir -p "$(dirname "$dst")"
  assert_safe_path "$dst"
  temp="$(mktemp "$(dirname "$dst")/.aidd-tmp.XXXXXX")"
  cp -p "$src" "$temp"
  mv -f "$temp" "$dst"
}

log_add() { echo "  + $1"; ADDED=$((ADDED + 1)); }
log_update() { echo "  ~ $1"; UPDATED=$((UPDATED + 1)); }
log_skip() { echo "  = $1  (既存のまま)"; SKIPPED=$((SKIPPED + 1)); }

backup_path() {
  local dst="$1" rel="$2"
  [ "$DRY_RUN" -eq 0 ] || return 0
  [ -e "$dst" ] || [ -L "$dst" ] || return 0
  assert_safe_path "$dst" link
  assert_safe_path "$AIDD_BACKUP_DIR/$rel"
  mkdir -p "$AIDD_BACKUP_DIR/$(dirname "$rel")"
  assert_safe_path "$AIDD_BACKUP_DIR/$rel"
  cp -Rp "$dst" "$AIDD_BACKUP_DIR/$rel"
  BACKED_UP+=("$rel")
}

install_file() {
  local src="$1" dst="$2" rel="$3"
  if [ ! -e "$dst" ] && [ ! -L "$dst" ]; then
    log_add "$rel"
    [ "$DRY_RUN" -eq 1 ] && return 0
    atomic_copy "$src" "$dst"
    ADDED_PATHS+=("$rel")
    return 0
  fi
  assert_safe_path "$dst"
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then return 0; fi
  if [ "$MODE" != "update" ]; then log_skip "$rel"; return 0; fi
  log_update "$rel"
  backup_path "$dst" "$rel"
  [ "$DRY_RUN" -eq 1 ] && return 0
  atomic_copy "$src" "$dst"
}

install_tree() {
  local src="$1" dst="$2" rel="$3"
  local file
  while IFS= read -r file; do
    install_file "$src/$file" "$dst/$file" "$rel/$file"
  done < <(cd "$src" && find . -type f | sed 's|^\./||')
}

install_link() {
  local destination="$1" link="$2" rel="$3"
  local existed=0
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$destination" ]; then return 0; fi
  if [ -d "$link" ] && [ ! -L "$link" ]; then
    log_skip "$rel (directoryのためsymlinkへ置換しません)"
    return 0
  fi
  if [ -e "$link" ] || [ -L "$link" ]; then
    existed=1
    if [ "$MODE" != "update" ]; then log_skip "$rel"; return 0; fi
    log_update "$rel"
    backup_path "$link" "$rel"
    [ "$DRY_RUN" -eq 1 ] && return 0
    rm -f -- "$link"
  else
    log_add "$rel"
    [ "$DRY_RUN" -eq 1 ] && return 0
  fi
  assert_safe_path "$link" link
  mkdir -p "$(dirname "$link")"
  assert_safe_path "$link" link
  ln -s "$destination" "$link"
  [ "$existed" -eq 1 ] || ADDED_PATHS+=("$rel")
}

write_backup_manifest() {
  [ "$DRY_RUN" -eq 0 ] || return 0
  if [ -z "${BACKED_UP[*]-}" ] && [ -z "${ADDED_PATHS[*]-}" ]; then return 0; fi
  mkdir -p "$AIDD_BACKUP_DIR"
  node - "$AIDD_BACKUP_DIR/manifest.json" "$AIDD_USER_ROOT" --files ${BACKED_UP[@]+"${BACKED_UP[@]}"} --added ${ADDED_PATHS[@]+"${ADDED_PATHS[@]}"} <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const [manifestPath, target, ...args] = process.argv.slice(2);
const filesIndex = args.indexOf('--files');
const addedIndex = args.indexOf('--added');
const backupRoot = path.dirname(manifestPath);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const files = args.slice(filesIndex + 1, addedIndex).map(relativePath => {
  const source = path.join(backupRoot, relativePath);
  const info = fs.lstatSync(source);
  const type = info.isSymbolicLink() ? 'symlink' : 'file';
  const value = type === 'symlink' ? fs.readlinkSync(source) : fs.readFileSync(source);
  return { path: relativePath, type, sha256: digest(value) };
});
const manifest = {
  schema_version: 2,
  created_at: new Date().toISOString(),
  target,
  files,
  added: args.slice(addedIndex + 1).map(relativePath => {
    const source = path.join(target, relativePath);
    const info = fs.lstatSync(source);
    const type = info.isSymbolicLink() ? 'symlink' : 'file';
    const value = type === 'symlink' ? fs.readlinkSync(source) : fs.readFileSync(source);
    return { path: relativePath, type, sha256: digest(value) };
  }),
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
}

merge_json_hook() {
  local src_kind="$1" settings="$2" rel="$3" temp input empty_input=""
  local existed=1
  [ -e "$settings" ] || existed=0
  [ "$existed" -eq 0 ] || assert_safe_path "$settings"
  temp="$(mktemp)"
  input="$settings"
  if [ "$existed" -eq 0 ]; then
    empty_input="$(mktemp)"
    printf '{}\n' > "$empty_input"
    input="$empty_input"
  fi
  if [ "$src_kind" = "codex" ]; then
    jq --arg command "$AIDD_HOOK_COMMAND" '
      .hooks //= {} | .hooks.PreToolUse //= [] |
      .hooks.PreToolUse |= map(.hooks |= map(select((.command | tostring | contains("pre-tool-use.mjs")) | not))) |
      .hooks.PreToolUse |= map(select((.hooks | length) > 0)) |
      .hooks.PreToolUse += [{matcher: "Bash|apply_patch|Edit|Write|Read|Grep|Glob", hooks: [{type: "command", command: $command, timeout: 5, statusMessage: "危険操作と秘密情報へのアクセスを確認中"}]}]
    ' "$input" > "$temp"
  else
    jq --arg command "$AIDD_HOOK_COMMAND" '
      .hooks //= {} | .hooks.PreToolUse //= [] |
      .hooks.PreToolUse |= map(.hooks |= map(select((.command | tostring | contains("pre-tool-use.mjs")) | not))) |
      .hooks.PreToolUse |= map(select((.hooks | length) > 0)) |
      .hooks.PreToolUse += [{matcher: "Bash|Read|Write|Edit|Grep|Glob", hooks: [{type: "command", command: $command, timeout: 5}]}] |
      .pluginConfigs //= {} | .pluginConfigs["agents-md@builtin"] //= {} |
      .pluginConfigs["agents-md@builtin"].options //= {} |
      .pluginConfigs["agents-md@builtin"].options.instructionFiles = "claude-md-and-agents-md"
    ' "$input" > "$temp"
  fi
  [ -z "$empty_input" ] || rm -f "$empty_input"
  jq empty "$temp"
  if [ "$existed" -eq 1 ] && cmp -s "$temp" "$settings"; then rm -f "$temp"; return 0; fi
  if [ "$existed" -eq 1 ]; then
    log_update "$rel"
    backup_path "$settings" "$rel"
  else
    log_add "$rel"
  fi
  if [ "$DRY_RUN" -eq 1 ]; then rm -f "$temp"; return 0; fi
  assert_safe_path "$settings"
  mkdir -p "$(dirname "$settings")"
  assert_safe_path "$settings"
  mv "$temp" "$settings"
  [ "$existed" -eq 1 ] || ADDED_PATHS+=("$rel")
}

rollback_changes() {
  local rel dst src
  [ "$ROLLING_BACK" -eq 0 ] || return 0
  ROLLING_BACK=1
  trap - ERR
  for rel in ${ADDED_PATHS[@]+"${ADDED_PATHS[@]}"}; do
    dst="$AIDD_USER_ROOT/$rel"
    if [ -f "$dst" ] || [ -L "$dst" ]; then rm -f -- "$dst"; fi
  done
  for rel in ${BACKED_UP[@]+"${BACKED_UP[@]}"}; do
    dst="$AIDD_USER_ROOT/$rel"
    src="$AIDD_BACKUP_DIR/$rel"
    if [ -f "$dst" ] || [ -L "$dst" ]; then rm -f -- "$dst"; fi
    mkdir -p "$(dirname "$dst")"
    cp -Rp "$src" "$dst"
  done
  echo "rollback: home harnessを適用前の状態へ復旧しました" >&2
}

on_error() {
  local status=$?
  if [ "$MUTATING" -eq 1 ]; then rollback_changes; fi
  exit "$status"
}

trap on_error ERR

[ "$DRY_RUN" -eq 1 ] || MUTATING=1

install_file "$AIDD_ROOT/.agents/home/AGENTS.md" "$AIDD_USER_ROOT/.agents/AGENTS.md" ".agents/AGENTS.md"
install_file "$AIDD_ROOT/.agents/home/CLAUDE.md" "$AIDD_USER_ROOT/.claude/CLAUDE.md" ".claude/CLAUDE.md"
install_link "../.agents/AGENTS.md" "$AIDD_USER_ROOT/.codex/AGENTS.md" ".codex/AGENTS.md"

while IFS= read -r name; do
  install_tree "$AIDD_ROOT/.agents/skills/$name" "$AIDD_USER_ROOT/.agents/skills/$name" ".agents/skills/$name"
  install_link "../../.agents/skills/$name" "$AIDD_USER_ROOT/.claude/skills/$name" ".claude/skills/$name"
done < <(read_global_skills)

while IFS= read -r rule; do
  name="${rule%.md}"
  install_file "$AIDD_ROOT/.agents/rules/$rule" "$AIDD_USER_ROOT/.agents/rules/$rule" ".agents/rules/$rule"
  install_link "../../.agents/rules/$rule" "$AIDD_USER_ROOT/.claude/rules/aidd-$name.md" ".claude/rules/aidd-$name.md"
done < <(read_common_rules)

install_file "$AIDD_ROOT/.agents/hooks/pre-tool-use.mjs" "$AIDD_USER_ROOT/.agents/hooks/pre-tool-use.mjs" ".agents/hooks/pre-tool-use.mjs"
install_file "$AIDD_ROOT/.agents/licenses/ECC-LICENSE" "$AIDD_USER_ROOT/.agents/licenses/ECC-LICENSE" ".agents/licenses/ECC-LICENSE"
install_file "$AIDD_ROOT/.codex/rules/default.rules" "$AIDD_USER_ROOT/.codex/rules/aidd-default.rules" ".codex/rules/aidd-default.rules"

while IFS= read -r name; do
  install_file "$AIDD_ROOT/.claude/agents/$name.md" "$AIDD_USER_ROOT/.claude/agents/$name.md" ".claude/agents/$name.md"
  install_file "$AIDD_ROOT/.codex/agents/$name.toml" "$AIDD_USER_ROOT/.codex/agents/$name.toml" ".codex/agents/$name.toml"
done < <(read_agents)

merge_json_hook codex "$AIDD_USER_ROOT/.codex/hooks.json" ".codex/hooks.json"
merge_json_hook claude "$AIDD_USER_ROOT/.claude/settings.json" ".claude/settings.json"

write_backup_manifest
MUTATING=0
trap - ERR

echo ""
echo "home harness: 追加 $ADDED / 更新 $UPDATED / 据え置き $SKIPPED"
[ -f "$AIDD_BACKUP_DIR/manifest.json" ] && {
  echo "backup: $AIDD_BACKUP_DIR"
  echo "backup manifest: $AIDD_BACKUP_DIR/manifest.json"
}
echo "Codexでは次回起動時に /hooks で追加Hookを確認・信頼してください。"
