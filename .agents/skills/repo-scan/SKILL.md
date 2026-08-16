---
name: repo-scan
description: 外部のrepo-scan skillを、pinされたレビュー可能なcommitから導入するbootstrapポインタ。cross-stackなソースコード資産監査を実行する前にrepo-scanを導入する必要があるときに使う。このECCポインタ自体は監査を行わない。
metadata:
  origin: community
---

# repo-scan

> どのエコシステムにも固有の依存管理ツールはあるが、C++・Android・iOS・Webを横断して「どれが自分たちのコードで、どれがサードパーティで、どれが不要な重荷か」を教えてくれるツールはない。

## 使いどころ

- 大規模なレガシーコードベースを引き継ぎ、構造の全体像が必要なとき
- 大きなrefactorの前 — 中核・重複・デッドコードを識別する
- package managerに宣言されず、ソースへ直接埋め込まれたサードパーティ依存を監査するとき
- monorepo再編のためのarchitecture decision recordを準備するとき

## インストール

```bash
# インストール前にpinされたcommitをレビューできるよう、先にcloneする
set -euo pipefail

REPO_SCAN_COMMIT=2742664ebcad1450c208eda0ae45d3c17fad5dd8
REPO_SCAN_INSTALL_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/repo-scan"
REPO_SCAN_INSTALL_PARENT="$(dirname "$REPO_SCAN_INSTALL_DIR")"
mkdir -p "$REPO_SCAN_INSTALL_PARENT"
REPO_SCAN_TMP="$(mktemp -d "$REPO_SCAN_INSTALL_PARENT/.repo-scan-install.XXXXXX")"
REPO_SCAN_TOKEN="${REPO_SCAN_TMP##*.}"
REPO_SCAN_STAGE="$REPO_SCAN_TMP/stage-$REPO_SCAN_TOKEN"
REPO_SCAN_BACKUP="$REPO_SCAN_TMP/backup-$REPO_SCAN_TOKEN"
REPO_SCAN_LOCK="$REPO_SCAN_INSTALL_PARENT/.repo-scan-install.lock"
REPO_SCAN_KEEP_TMP=0
REPO_SCAN_LOCK_HELD=0
REPO_SCAN_MV_HAS_NO_TARGET=0
cleanup_repo_scan_install() {
  if [ "$REPO_SCAN_KEEP_TMP" -eq 0 ]; then
    rm -rf -- "$REPO_SCAN_TMP"
  fi
  if [ "$REPO_SCAN_LOCK_HELD" -eq 1 ] && ! rmdir -- "$REPO_SCAN_LOCK"; then
    printf 'Could not release installation lock at %s\n' "$REPO_SCAN_LOCK" >&2
  fi
}
trap cleanup_repo_scan_install EXIT
mkdir "$REPO_SCAN_TMP/mv-probe-source"
if mv -T -- "$REPO_SCAN_TMP/mv-probe-source" \
  "$REPO_SCAN_TMP/mv-probe-destination" 2>/dev/null; then
  REPO_SCAN_MV_HAS_NO_TARGET=1
  rmdir "$REPO_SCAN_TMP/mv-probe-destination"
else
  rmdir "$REPO_SCAN_TMP/mv-probe-source"
fi
move_repo_scan_dir() {
  REPO_SCAN_MOVE_SOURCE=$1
  REPO_SCAN_MOVE_DESTINATION=$2
  REPO_SCAN_MOVE_NAME=${REPO_SCAN_MOVE_SOURCE##*/}
  if [ -e "$REPO_SCAN_MOVE_DESTINATION" ] || [ -L "$REPO_SCAN_MOVE_DESTINATION" ]; then
    return 1
  fi
  if [ "$REPO_SCAN_MV_HAS_NO_TARGET" -eq 1 ]; then
    mv -T -- "$REPO_SCAN_MOVE_SOURCE" "$REPO_SCAN_MOVE_DESTINATION"
    return
  fi
  if ! mv -- "$REPO_SCAN_MOVE_SOURCE" "$REPO_SCAN_MOVE_DESTINATION"; then
    return 1
  fi
  if [ -e "$REPO_SCAN_MOVE_DESTINATION/$REPO_SCAN_MOVE_NAME" ] || \
    [ -L "$REPO_SCAN_MOVE_DESTINATION/$REPO_SCAN_MOVE_NAME" ]; then
    if ! mv -- "$REPO_SCAN_MOVE_DESTINATION/$REPO_SCAN_MOVE_NAME" \
      "$REPO_SCAN_MOVE_SOURCE"; then
      REPO_SCAN_KEEP_TMP=1
      printf 'Move conflict recovery failed; staged data remains at %s\n' \
        "$REPO_SCAN_MOVE_DESTINATION/$REPO_SCAN_MOVE_NAME" >&2
    fi
    return 1
  fi
}

git clone --filter=blob:none --no-checkout \
  https://github.com/haibindev/repo-scan.git "$REPO_SCAN_TMP/source"
git -C "$REPO_SCAN_TMP/source" checkout --detach "$REPO_SCAN_COMMIT"
mkdir -p "$REPO_SCAN_STAGE"
git -C "$REPO_SCAN_TMP/source" archive "$REPO_SCAN_COMMIT" | \
  tar -xf - -C "$REPO_SCAN_STAGE"

# インストールを承認する前に "$REPO_SCAN_TMP/source" をレビューする。
printf 'Type install to replace %s after reviewing the pinned source: ' \
  "$REPO_SCAN_INSTALL_DIR" >&2
read -r REPO_SCAN_CONFIRM
if [ "$REPO_SCAN_CONFIRM" != install ]; then
  printf 'Installation cancelled.\n' >&2
  exit 1
fi
if ! mkdir -- "$REPO_SCAN_LOCK" 2>/dev/null; then
  printf 'Another repo-scan installation holds the lock at %s\n' \
    "$REPO_SCAN_LOCK" >&2
  exit 1
fi
REPO_SCAN_LOCK_HELD=1

if [ -e "$REPO_SCAN_INSTALL_DIR" ] || [ -L "$REPO_SCAN_INSTALL_DIR" ]; then
  move_repo_scan_dir "$REPO_SCAN_INSTALL_DIR" "$REPO_SCAN_BACKUP"
fi
if ! move_repo_scan_dir "$REPO_SCAN_STAGE" "$REPO_SCAN_INSTALL_DIR"; then
  if [ -e "$REPO_SCAN_BACKUP" ] || [ -L "$REPO_SCAN_BACKUP" ]; then
    if [ -e "$REPO_SCAN_INSTALL_DIR" ] || [ -L "$REPO_SCAN_INSTALL_DIR" ]; then
      REPO_SCAN_KEEP_TMP=1
      printf 'Replacement failed and target was recreated; previous installation preserved at %s\n' \
        "$REPO_SCAN_BACKUP" >&2
    elif ! move_repo_scan_dir "$REPO_SCAN_BACKUP" "$REPO_SCAN_INSTALL_DIR"; then
      REPO_SCAN_KEEP_TMP=1
      printf 'Replacement and rollback failed; previous installation preserved at %s\n' \
        "$REPO_SCAN_BACKUP" >&2
    fi
  fi
  exit 1
fi
```

> agent skillを導入する前に、必ずソースをレビューする。

インストールで完了するのはbootstrapだけ。agent harnessを再読み込みしてから、あらためて`repo-scan`を呼び出す。このECCポインタは外部skillを導入するだけで、スキャン自体は行わない。

## 中核機能

| 機能 | 説明 |
|---|---|
| **Cross-stackスキャン** | C/C++、Java/Android、iOS（OC/Swift）、Web（TS/JS/Vue）を1パスで処理 |
| **ファイル分類** | 全ファイルをproject code、third-party、build artifactのいずれかへタグ付け |
| **ライブラリ検出** | 既知の50以上のライブラリ（FFmpeg、Boost、OpenSSL…）をversion抽出付きで検出 |
| **4段階の判定** | Core Asset / Extract & Merge / Rebuild / Deprecate |
| **HTMLレポート** | ドリルダウン可能なインタラクティブなdark themeページ |
| **Monorepo対応** | 階層的スキャンによるサマリー＋サブプロジェクトレポート |

## 分析の深さレベル

| レベル | 読むファイル数 | 用途 |
|---|---|---|
| `fast` | module当たり1-2 | 巨大ディレクトリの素早いインベントリ |
| `standard` | module当たり2-5 | 依存とアーキテクチャを一通り確認する既定の監査 |
| `deep` | module当たり5-10 | thread safety、メモリ管理、API一貫性を追加 |
| `full` | 全ファイル | merge前の網羅的レビュー |

## 動作の流れ

1. **repoの表層を分類する**: ファイルを列挙し、それぞれをproject code、埋め込みthird-party code、build artifactへタグ付けする。
2. **埋め込みライブラリを検出する**: ディレクトリ名、header、licenseファイル、versionマーカーを調べ、同梱された依存と推定versionを特定する。
3. **moduleごとに評価する**: moduleやサブシステム単位でファイルをまとめ、所有状況・重複・保守コストから4段階の判定のいずれかを付ける。
4. **構造上のリスクを示す**: 不要なartifact、重複したwrapper、古いvendoredコード、抽出・再構築・廃止すべきmoduleを指摘する。
5. **レポートを出力する**: 簡潔なサマリーと、module単位でドリルダウンできるインタラクティブなHTML出力を返し、監査を非同期にレビューできるようにする。

## 実例

5万ファイルのC++ monorepoでの結果:
- 2015年頃のFFmpeg 2.xが本番でまだ使われていた
- 同一SDK wrapperが3回重複していた
- commitされたDebug/ipch/objのbuild artifactが636 MBあった
- 分類結果: project code 3 MB に対し third-party 596 MB

## ベストプラクティス

- 初回の監査は`standard`の深さから始める
- module数が100を超えるmonorepoでは`fast`で素早くインベントリを取る
- refactor候補として挙がったmoduleに対して`deep`を段階的に実行する
- サブプロジェクト横断の重複検出のため、module横断分析を確認する

## リンク

- [GitHub Repository](https://github.com/haibindev/repo-scan)
