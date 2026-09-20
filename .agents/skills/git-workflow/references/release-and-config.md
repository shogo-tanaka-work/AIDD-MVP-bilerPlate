# リリース管理とGit設定

## セマンティックバージョニング

```
MAJOR.MINOR.PATCH

MAJOR: 破壊的変更
MINOR: 後方互換のある新機能
PATCH: 後方互換のある不具合修正

例:
1.0.0 → 1.0.1 (patch: 不具合修正)
1.0.1 → 1.1.0 (minor: 新機能)
1.1.0 → 2.0.0 (major: 破壊的変更)
```

## リリースの作成

```bash
# 注釈付きタグを作る
git tag -a v1.2.0 -m "Release v1.2.0

Features:
- Add user authentication
- Implement password reset

Fixes:
- Resolve login redirect issue

Breaking Changes:
- None"

# タグをリモートへpushする
git push origin v1.2.0

# タグ一覧を表示する
git tag -l

# タグを削除する
git tag -d v1.2.0
git push origin --delete v1.2.0
```

## changelogの生成

```bash
# commitからchangelogを生成する
git log v1.1.0..v1.2.0 --oneline --no-merges

# またはconventional-changelogを使う
npx conventional-changelog -i CHANGELOG.md -s
```

Conventional Commitsを守っていれば、changelogはcommit履歴から機械的に生成できる。

## Gitの設定

### 推奨設定

```bash
# ユーザー情報
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# 既定のブランチ名
git config --global init.defaultBranch main

# pullの挙動（mergeではなくrebase）
git config --global pull.rebase true

# pushの挙動（現在のブランチだけをpush）
git config --global push.default current

# タイプミスの自動訂正
git config --global help.autocorrect 1

# より良いdiffアルゴリズム
git config --global diff.algorithm histogram

# 色付き出力
git config --global color.ui auto
```

### 便利なalias

```bash
# ~/.gitconfigへ追加する
[alias]
    co = checkout
    br = branch
    ci = commit
    st = status
    unstage = reset HEAD --
    last = log -1 HEAD
    visual = log --oneline --graph --all
    amend = commit --amend --no-edit
    wip = commit -m "WIP"
    undo = reset --soft HEAD~1
    contributors = shortlog -sn
```

### gitignoreのパターン

環境変数ファイルと秘密鍵の除外パターンは、秘密情報ルール（`.agents/rules/secrets.md`相当）とプロジェクトの`.gitignore`正本に従う。ここでは生成物・環境依存ファイルのパターンだけを挙げる。

```gitignore
# 依存
node_modules/
vendor/

# build成果物
dist/
build/
*.o
*.exe

# IDE
.idea/
.vscode/
*.swp
*.swo

# OSのファイル
.DS_Store
Thumbs.db

# ログ
*.log
logs/

# テストcoverage
coverage/

# キャッシュ
.cache/
*.tsbuildinfo
```
