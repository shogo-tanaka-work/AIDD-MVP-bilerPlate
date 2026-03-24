#!/bin/bash
set -euo pipefail

# リポジトリURLを設定してください。
REPO_URL="https://github.com/<your-username>/AIDD-MVP-bilerPlate.git"

# クローンしたリポジトリの保存先を設定してください。
DEFAULT_TARGET_DIR="/Volumes/PortableSSD/Documents/codes/byTech"

if [ $# -eq 0 ]; then
  echo "使い方: ./init.sh <プロジェクト名> [作成先ディレクトリ]"
  echo "例:     ./init.sh my-new-app"
  echo "例:     ./init.sh my-new-app /path/to/target"
  echo "デフォルト作成先: $DEFAULT_TARGET_DIR"
  exit 1
fi

PROJECT_NAME="$1"
TARGET_DIR="${2:-$DEFAULT_TARGET_DIR}"

PROJECT_PATH="$TARGET_DIR/$PROJECT_NAME"

if [ -d "$PROJECT_PATH" ]; then
  echo "エラー: $PROJECT_PATH は既に存在します"
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "エラー: 作成先ディレクトリが存在しません: $TARGET_DIR"
  exit 1
fi

echo "==> ボイラープレートを取得中... ($PROJECT_PATH)"
git clone --depth 1 "$REPO_URL" "$PROJECT_PATH"

cd "$PROJECT_PATH"
rm -rf .git

echo "==> Git リポジトリを初期化中..."
git init -b main
git add -A
git commit -m "init: AIDD-MVPボイラープレートから初期化"

echo "==> テンプレート用ファイルを削除中..."
rm -f TEMPLATE_USAGE.md init.sh

git add -A
git commit -m "chore: テンプレート用ファイルを削除"

echo "==> GitHub にリモートリポジトリを作成中..."
gh repo create "$PROJECT_NAME" --public --source=. --push

echo ""
echo "完了! 次のステップ:"
echo "  cd $PROJECT_PATH"
echo "  docs/SPEC.md を編集して仕様を書く"
