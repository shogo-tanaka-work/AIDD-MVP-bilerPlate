#!/bin/bash
set -Eeuo pipefail

# AIDDボイラープレートを任意のプロジェクトディレクトリへ適用する。
# 空のディレクトリにも、作業を始めた後のディレクトリにも適用できる。
# 既存ファイルは既定で上書きせず、--update を付けたときだけbackupを取って更新する。

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
TARGET="$PWD"
PROFILES=()
MODE="add"
DRY_RUN=0
YES=0

usage() {
  cat <<'EOF'
使い方: apply-project-harness.sh [対象ディレクトリ] [オプション]

オプション:
  --profile <名前>   技術profileのSkillとRuleを追加する（複数指定可）
  --update           既存ファイルをbackupのうえ更新する（既定は追加のみ）
  --yes              非対話でのupdate実行を明示的に承認する
  --dry-run          変更せず、適用内容だけを表示する
  --list-profiles    利用可能なprofileを一覧表示する
  -h, --help         このヘルプを表示する

例:
  aidd apply                                # カレントディレクトリへ適用
  aidd apply ~/開発/my-app --profile frontend
  aidd apply --update --dry-run             # 更新差分の確認だけ
EOF
}

# aidd.ymlのskillsセクションを "グループ<TAB>Skill名" として読み出す。
read_skill_groups() {
  awk '
    /^skills:/ { in_skills = 1; next }
    /^[a-z_]+:/ { in_skills = 0 }
    !in_skills { next }
    /^  profiles:[[:space:]]*$/ { in_profiles = 1; group = ""; next }
    /^  [a-z_]+:[[:space:]]*$/ {
      in_profiles = 0
      group = $1; sub(":", "", group)
      next
    }
    in_profiles && /^    [a-z_]+:[[:space:]]*$/ {
      group = $1; sub(":", "", group)
      next
    }
    /^ *- / {
      name = $2
      if (group != "") print group "\t" name
    }
  ' "$AIDD_ROOT/aidd.yml"
}

list_profiles() {
  read_skill_groups | awk -F'\t' '$1 != "global" && $1 != "project_base" { print $1 }' | sort -u
}

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILES+=("${2:?--profile には名前が必要です}"); shift 2 ;;
    --update) MODE="update"; shift ;;
    --yes) YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --list-profiles) list_profiles; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "不明なオプション: $1" >&2; usage >&2; exit 1 ;;
    *) TARGET="$1"; shift ;;
  esac
done

if [ ! -f "$AIDD_ROOT/aidd.yml" ] || [ ! -d "$AIDD_ROOT/.agents" ]; then
  echo "中断: ボイラープレートのルートを解決できません: $AIDD_ROOT" >&2
  exit 1
fi

if ! node "$AIDD_ROOT/scripts/verify-harness.mjs" "$AIDD_ROOT" >/dev/null; then
  echo "中断: ボイラープレート自身のverifyに失敗しました" >&2
  exit 1
fi

TARGET="$(node -e 'const path=require("node:path"); process.stdout.write(path.resolve(process.argv[1]))' "$TARGET")"
[ ! -d "$TARGET" ] || TARGET="$(cd "$TARGET" && pwd -P)"

if [ "$TARGET" = "$AIDD_ROOT" ]; then
  echo "中断: ボイラープレート自身へは適用できません" >&2
  exit 1
fi

if [ -e "$TARGET/.agents/aidd-state.json" ] || [ -L "$TARGET/.agents/aidd-state.json" ]; then
  if [ -L "$TARGET/.agents" ] || [ -L "$TARGET/.agents/aidd-state.json" ]; then
    echo "中断: aidd-state.jsonへのsymlink経由アクセスを拒否しました" >&2
    exit 1
  fi
  STATE_PROFILES="$(node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(!Array.isArray(value.profiles)||!value.profiles.every(v=>typeof v==="string")) process.exit(2); console.log([...new Set(value.profiles)].join("\n"));' "$TARGET/.agents/aidd-state.json")"
  while IFS= read -r profile; do [ -z "$profile" ] || PROFILES+=("$profile"); done <<< "$STATE_PROFILES"
fi
if [ ${#PROFILES[@]} -gt 0 ]; then
  UNIQUE_PROFILES=()
  while IFS= read -r profile; do UNIQUE_PROFILES+=("$profile"); done < <(printf '%s\n' "${PROFILES[@]}" | sort -u)
  PROFILES=("${UNIQUE_PROFILES[@]}")
fi

for profile in ${PROFILES[@]+"${PROFILES[@]}"}; do
  if ! list_profiles | grep -qx "$profile"; then
    echo "中断: 未知のprofileです: $profile" >&2
    echo "利用可能: $(list_profiles | tr '\n' ' ')" >&2
    exit 1
  fi
done

if [ "$DRY_RUN" -eq 0 ]; then
  mkdir -p "$TARGET"
  TARGET="$(cd "$TARGET" && pwd -P)"
fi

if [ "$MODE" = "update" ] && [ "$DRY_RUN" -eq 0 ] && [ "$YES" -eq 0 ]; then
  if [ -t 0 ]; then
    printf '既存ファイルをbackupして更新します。続行しますか? [y/N] '
    read -r answer
    case "$answer" in y|Y|yes|YES) ;; *) echo "中断しました。"; exit 1 ;; esac
  else
    echo "中断: 非対話でupdateを実行するには --yes が必要です" >&2
    exit 1
  fi
fi

BACKUP_DIR="$TARGET/.agents/backups/$(date +%Y-%m-%d-%H%M%S)-$$"
ADDED=0
UPDATED=0
SKIPPED=0
BACKED_UP=()
ADDED_PATHS=()
MUTATING=0
ROLLING_BACK=0

assert_safe_path() {
  node "$AIDD_ROOT/scripts/path-safety.mjs" "$TARGET" "$1" "${2:-regular}"
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

write_state() {
  local rel=".agents/aidd-state.json" dst="$TARGET/.agents/aidd-state.json" temp
  temp="$(mktemp)"
  node - "$temp" ${PROFILES[@]+"${PROFILES[@]}"} <<'NODE'
const fs = require('node:fs');
const [output, ...profiles] = process.argv.slice(2);
fs.writeFileSync(output, `${JSON.stringify({ schema_version: 1, profiles }, null, 2)}\n`);
NODE
  if [ -e "$dst" ] && cmp -s "$temp" "$dst"; then rm -f "$temp"; return 0; fi
  if [ -e "$dst" ]; then
    if [ "$MODE" != "update" ]; then log_skip "$rel"; rm -f "$temp"; return 0; fi
    log_upd "$rel"
    backup "$rel"
  else
    log_add "$rel"
  fi
  if [ "$DRY_RUN" -eq 1 ]; then rm -f "$temp"; return 0; fi
  atomic_copy "$temp" "$dst"
  rm -f "$temp"
  [ -e "$BACKUP_DIR/$rel" ] || ADDED_PATHS+=("$rel")
}

log_add()  { echo "  + $1"; ADDED=$((ADDED + 1)); }
log_upd()  { echo "  ~ $1  (更新)"; UPDATED=$((UPDATED + 1)); }
log_skip() { echo "  = $1  (既存のまま。差分あり)"; SKIPPED=$((SKIPPED + 1)); }

backup() {
  local rel="$1"
  [ "$DRY_RUN" -eq 1 ] && return 0
  assert_safe_path "$TARGET/$rel" link
  assert_safe_path "$BACKUP_DIR/$rel"
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  assert_safe_path "$BACKUP_DIR/$rel"
  cp -Rp "$TARGET/$rel" "$BACKUP_DIR/$rel"
  BACKED_UP+=("$rel")
}

# ファイル1件を配置する。既存かつ内容が異なる場合のみMODEに従う。
place_file() {
  local rel="$1"
  local src="$AIDD_ROOT/$rel"
  local dst="$TARGET/$rel"
  [ -f "$src" ] || return 0

  if [ ! -e "$dst" ]; then
    log_add "$rel"
    [ "$DRY_RUN" -eq 1 ] && return 0
    atomic_copy "$src" "$dst"
    ADDED_PATHS+=("$rel")
    return 0
  fi

  assert_safe_path "$dst"

  cmp -s "$src" "$dst" && return 0

  if [ "$MODE" = "update" ]; then
    log_upd "$rel"
    backup "$rel"
    [ "$DRY_RUN" -eq 1 ] && return 0
    atomic_copy "$src" "$dst"
  else
    log_skip "$rel"
  fi
}

place_tree() {
  local rel="$1"
  local src="$AIDD_ROOT/$rel"
  [ -d "$src" ] || return 0
  local f
  while IFS= read -r f; do
    place_file "$rel/$f"
  done < <(cd "$src" && find . -type f ! -name '.DS_Store' | sed 's|^\./||')
}

read_rule_files() {
  awk -v selected=" ${PROFILES[*]-} " '
    /^rule_packs:/ { in_rules = 1; next }
    /^[a-z_]+:/ { in_rules = 0 }
    !in_rules { next }
    /^  common:/ { section = "common"; profile = ""; next }
    /^  profiles:/ { section = "profiles"; profile = ""; next }
    section == "profiles" && /^    [a-z_]+:[[:space:]]*(\[\])?[[:space:]]*$/ {
      profile = $1; sub(":", "", profile); next
    }
    section == "common" && /^      - / { print $2; next }
    section == "profiles" && profile != "" && index(selected, " " profile " ") && /^      - / {
      print $2
    }
  ' "$AIDD_ROOT/aidd.yml"
}

place_link() {
  local rel="$1"
  local dest="$2"
  local dst="$TARGET/$rel"

  local existed=0
  if [ -L "$dst" ]; then
    existed=1
    [ "$(readlink "$dst")" = "$dest" ] && return 0
    if [ "$MODE" != "update" ]; then log_skip "$rel"; return 0; fi
    log_upd "$rel"
    backup "$rel"
    [ "$DRY_RUN" -eq 1 ] && return 0
    rm "$dst"
  elif [ -e "$dst" ]; then
    log_skip "$rel"
    return 0
  else
    log_add "$rel -> $dest"
    [ "$DRY_RUN" -eq 1 ] && return 0
  fi

  assert_safe_path "$dst" link
  mkdir -p "$(dirname "$dst")"
  assert_safe_path "$dst" link
  ln -s "$dest" "$dst"
  [ "$existed" -eq 1 ] || ADDED_PATHS+=("$rel")
}

# .gitignoreは上書きせず、不足している行だけを追記する。
merge_gitignore() {
  local src="$AIDD_ROOT/.gitignore" dst="$TARGET/.gitignore"

  if [ ! -e "$dst" ]; then
    place_file ".gitignore"
    return 0
  fi

  assert_safe_path "$dst"

  local missing=()
  local line
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in \#*) continue ;; esac
    grep -qxF "$line" "$dst" || missing+=("$line")
  done < "$src"

  [ ${#missing[@]} -eq 0 ] && return 0

  echo "  ~ .gitignore  (${#missing[@]}行を追記: ${missing[*]})"
  UPDATED=$((UPDATED + 1))
  [ "$DRY_RUN" -eq 1 ] && return 0
  backup ".gitignore"
  {
    echo ""
    echo "# AIDD boilerplate"
    printf '%s\n' "${missing[@]}"
  } >> "$dst"
}

write_backup_manifest() {
  [ "$DRY_RUN" -eq 0 ] || return 0
  if [ -z "${BACKED_UP[*]-}" ] && [ -z "${ADDED_PATHS[*]-}" ]; then return 0; fi
  mkdir -p "$BACKUP_DIR"
  node - "$BACKUP_DIR/manifest.json" "$TARGET" --files ${BACKED_UP[@]+"${BACKED_UP[@]}"} --added ${ADDED_PATHS[@]+"${ADDED_PATHS[@]}"} <<'NODE'
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
const added = args.slice(addedIndex + 1).map(relativePath => {
  const source = path.join(target, relativePath);
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
  added,
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
}

rollback_changes() {
  local rel dst src
  [ "$ROLLING_BACK" -eq 0 ] || return 0
  ROLLING_BACK=1
  trap - ERR
  for rel in ${ADDED_PATHS[@]+"${ADDED_PATHS[@]}"}; do
    dst="$TARGET/$rel"
    if [ -f "$dst" ] || [ -L "$dst" ]; then
      rm -f -- "$dst"
    fi
  done
  for rel in ${BACKED_UP[@]+"${BACKED_UP[@]}"}; do
    dst="$TARGET/$rel"
    src="$BACKUP_DIR/$rel"
    if [ -f "$dst" ] || [ -L "$dst" ]; then
      rm -f -- "$dst"
    fi
    mkdir -p "$(dirname "$dst")"
    cp -Rp "$src" "$dst"
  done
  echo "rollback: 適用前の状態へ復旧しました" >&2
}

on_error() {
  local status=$?
  if [ "$MUTATING" -eq 1 ]; then rollback_changes; fi
  exit "$status"
}

trap on_error ERR

selected_skills() {
  local groups="global project_base ${PROFILES[*]-}"
  read_skill_groups | awk -F'\t' -v g=" $groups " 'index(g, " " $1 " ") { print $2 }' | sort -u
}

echo "適用元: $AIDD_ROOT"
echo "適用先: $TARGET"
echo "モード: $([ "$MODE" = update ] && echo "更新あり" || echo "追加のみ")$([ "$DRY_RUN" -eq 1 ] && echo " / dry-run")"
[ ${#PROFILES[@]} -gt 0 ] && echo "profile: ${PROFILES[*]}"
echo ""

[ "$DRY_RUN" -eq 1 ] || MUTATING=1
place_file "AGENTS.md"
place_file "aidd.yml"
place_file ".env.example"
place_file "docs/SPEC.md"
place_file "docs/ARCH.md"
place_file "docs/GITHUB_SETUP.md"
place_file ".agents/memory/MEMORY.md"

while IFS= read -r rule; do
  place_file ".agents/rules/$rule"
done < <(read_rule_files)
place_tree ".agents/hooks"
place_tree ".agents/licenses"
place_tree ".claude/agents"
place_tree ".codex/agents"
place_tree ".codex/rules"
place_tree ".github"
place_file ".claude/settings.json"
place_file ".codex/config.toml"
place_file ".codex/hooks.json"

while IFS= read -r skill; do
  place_tree ".agents/skills/$skill"
done < <(selected_skills)

place_link ".claude/skills" "../.agents/skills"
for rule in code-design error-handling secrets security verification; do
  place_link ".claude/rules/$rule.md" "../../.agents/rules/$rule.md"
done
place_link ".claude/rules/profiles" "../../.agents/rules/profiles"

merge_gitignore
write_state

echo ""
echo "追加 $ADDED / 更新 $UPDATED / 据え置き $SKIPPED"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-runのため書き込みはしていません。"
  exit 0
fi

write_backup_manifest

if ! node "$AIDD_ROOT/scripts/verify-harness.mjs" "$TARGET" >/dev/null; then
  rollback_changes
  echo "中断: 適用後のverifyに失敗しました: $BACKUP_DIR" >&2
  exit 1
fi
MUTATING=0
trap - ERR

[ -f "$BACKUP_DIR/manifest.json" ] && {
  echo "backup: $BACKUP_DIR"
  echo "backup manifest: $BACKUP_DIR/manifest.json"
}

if [ "$SKIPPED" -gt 0 ]; then
  echo "据え置いたファイルはボイラープレートと差分があります。取り込む場合は --update を付けて再実行してください。"
fi

if [ ! -d "$TARGET/.git" ]; then
  echo ""
  echo "次の手順: git init -b main && git add -A && git commit"
fi
echo "docs/SPEC.md を書いてから実装を始めてください。"
