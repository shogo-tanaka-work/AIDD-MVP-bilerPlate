#!/bin/bash
set -euo pipefail

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

usage() {
  cat <<'EOF'
使い方: apply-project-harness.sh [対象ディレクトリ] [オプション]

オプション:
  --profile <名前>   技術profileのSkillとRuleを追加する（複数指定可）
  --update           既存ファイルをbackupのうえ更新する（既定は追加のみ）
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

mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"

if [ "$TARGET" = "$AIDD_ROOT" ]; then
  echo "中断: ボイラープレート自身へは適用できません" >&2
  exit 1
fi

for profile in ${PROFILES[@]+"${PROFILES[@]}"}; do
  if ! list_profiles | grep -qx "$profile"; then
    echo "中断: 未知のprofileです: $profile" >&2
    echo "利用可能: $(list_profiles | tr '\n' ' ')" >&2
    exit 1
  fi
done

BACKUP_DIR="$TARGET/.agents/backups/$(date +%Y-%m-%d-%H%M%S)"
ADDED=0
UPDATED=0
SKIPPED=0

log_add()  { echo "  + $1"; ADDED=$((ADDED + 1)); }
log_upd()  { echo "  ~ $1  (更新)"; UPDATED=$((UPDATED + 1)); }
log_skip() { echo "  = $1  (既存のまま。差分あり)"; SKIPPED=$((SKIPPED + 1)); }

backup() {
  local rel="$1"
  [ "$DRY_RUN" -eq 1 ] && return 0
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  cp -Rp "$TARGET/$rel" "$BACKUP_DIR/$rel"
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
    mkdir -p "$(dirname "$dst")"
    cp -p "$src" "$dst"
    return 0
  fi

  cmp -s "$src" "$dst" && return 0

  if [ "$MODE" = "update" ]; then
    log_upd "$rel"
    backup "$rel"
    [ "$DRY_RUN" -eq 1 ] && return 0
    cp -p "$src" "$dst"
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

place_link() {
  local rel="$1"
  local dest="$2"
  local dst="$TARGET/$rel"

  if [ -L "$dst" ]; then
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

  mkdir -p "$(dirname "$dst")"
  ln -s "$dest" "$dst"
}

# .gitignoreは上書きせず、不足している行だけを追記する。
merge_gitignore() {
  local src="$AIDD_ROOT/.gitignore" dst="$TARGET/.gitignore"

  if [ ! -e "$dst" ]; then
    place_file ".gitignore"
    return 0
  fi

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
  {
    echo ""
    echo "# AIDD boilerplate"
    printf '%s\n' "${missing[@]}"
  } >> "$dst"
}

selected_skills() {
  local groups="global project_base ${PROFILES[*]-}"
  read_skill_groups | awk -F'\t' -v g=" $groups " 'index(g, " " $1 " ") { print $2 }' | sort -u
}

echo "適用元: $AIDD_ROOT"
echo "適用先: $TARGET"
echo "モード: $([ "$MODE" = update ] && echo "更新あり" || echo "追加のみ")$([ "$DRY_RUN" -eq 1 ] && echo " / dry-run")"
[ ${#PROFILES[@]} -gt 0 ] && echo "profile: ${PROFILES[*]}"
echo ""

place_file "AGENTS.md"
place_file "CLAUDE.md"
place_file "aidd.yml"
place_file ".env.example"
place_file "docs/SPEC.md"
place_file "docs/ARCH.md"
place_file "docs/GITHUB_SETUP.md"
place_file ".agents/memory/MEMORY.md"

place_tree ".agents/rules"
place_tree ".agents/hooks"
place_tree ".agents/licenses"
place_tree ".claude/agents"
place_tree ".codex/agents"
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

echo ""
echo "追加 $ADDED / 更新 $UPDATED / 据え置き $SKIPPED"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-runのため書き込みはしていません。"
  exit 0
fi

[ "$UPDATED" -gt 0 ] && [ -d "$BACKUP_DIR" ] && echo "backup: $BACKUP_DIR"

if [ "$SKIPPED" -gt 0 ]; then
  echo "据え置いたファイルはボイラープレートと差分があります。取り込む場合は --update を付けて再実行してください。"
fi

if [ ! -d "$TARGET/.git" ]; then
  echo ""
  echo "次の手順: git init -b main && git add -A && git commit"
fi
echo "docs/SPEC.md を書いてから実装を始めてください。"
