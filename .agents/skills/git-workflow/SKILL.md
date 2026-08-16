---
name: git-workflow
description: ブランチ戦略、commit規約、merge対rebase、コンフリクト解消、あらゆる規模のチーム向けの共同開発ベストプラクティスを含むGitワークフローパターン。ブランチ戦略を選ぶとき、commit規約を定めるとき、mergeとrebaseを判断するとき、コンフリクトを解消するときに使う。
metadata:
  origin: ECC
---

# Git Workflow Patterns

Gitのバージョン管理、ブランチ戦略、共同開発のベストプラクティス。

## 起動タイミング

- 新規プロジェクトのGitワークフローを整えるとき
- ブランチ戦略（GitFlow、trunk-based、GitHub flow）を決めるとき
- commitメッセージやPR説明を書くとき
- mergeコンフリクトを解消するとき
- リリースとバージョンタグを管理するとき
- 新メンバーへGit運用を説明するとき

## ブランチ戦略

### GitHub Flow（シンプル。多くの場合に推奨）

継続的デプロイと小〜中規模チームに適する。

```
main (protected, always deployable)
  │
  ├── feature/user-auth      → PR → merge to main
  ├── feature/payment-flow   → PR → merge to main
  └── fix/login-bug          → PR → merge to main
```

**ルール:**
- `main`は常にデプロイ可能に保つ
- feature branchは`main`から作る
- レビュー準備ができたらPull Requestを出す
- 承認とCI通過の後に`main`へmergeする
- merge後すぐにデプロイする

### Trunk-Based Development（高速に回すチーム向け）

強力なCI/CDとfeature flagを持つチームに適する。

```
main (trunk)
  │
  ├── short-lived feature (1-2 days max)
  ├── short-lived feature
  └── short-lived feature
```

**ルール:**
- 全員が`main`または極めて短命なブランチへcommitする
- feature flagで未完成の作業を隠す
- merge前にCIを通す
- 1日に複数回デプロイする

### GitFlow（複雑。リリースサイクル駆動）

計画的なリリースとエンタープライズ案件に適する。

```
main (production releases)
  │
  └── develop (integration branch)
        │
        ├── feature/user-auth
        ├── feature/payment
        │
        ├── release/1.0.0    → merge to main and develop
        │
        └── hotfix/critical  → merge to main and develop
```

**ルール:**
- `main`には本番投入可能なコードだけを置く
- `develop`を統合ブランチにする
- feature branchは`develop`から作り、`develop`へ戻す
- release branchは`develop`から作り、`main`と`develop`へmergeする
- hotfix branchは`main`から作り、`main`と`develop`の両方へmergeする

### どれを選ぶか

| 戦略 | チーム規模 | リリース頻度 | 適する対象 |
|----------|-----------|-----------------|----------|
| GitHub Flow | 任意 | 継続的 | SaaS、Webアプリ、スタートアップ |
| Trunk-Based | 熟練5名以上 | 1日複数回 | 高速に回すチーム、feature flag活用 |
| GitFlow | 10名以上 | 計画的 | エンタープライズ、規制業種 |

## commitメッセージ

### Conventional Commits形式

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### type一覧

| Type | 用途 | 例 |
|------|---------|---------|
| `feat` | 新機能 | `feat(auth): add OAuth2 login` |
| `fix` | 不具合修正 | `fix(api): handle null response in user endpoint` |
| `docs` | ドキュメント | `docs(readme): update installation instructions` |
| `style` | 整形のみ、コード変更なし | `style: fix indentation in login component` |
| `refactor` | コードのrefactor | `refactor(db): extract connection pool to module` |
| `test` | テストの追加・更新 | `test(auth): add unit tests for token validation` |
| `chore` | 保守作業 | `chore(deps): update dependencies` |
| `perf` | performance改善 | `perf(query): add index to users table` |
| `ci` | CI/CDの変更 | `ci: add PostgreSQL service to test workflow` |
| `revert` | 直前commitの取り消し | `revert: revert "feat(auth): add OAuth2 login"` |

### 良い例と悪い例

```
# BAD: 曖昧で文脈がない
git commit -m "fixed stuff"
git commit -m "updates"
git commit -m "WIP"

# GOOD: 明確・具体的で、理由を説明している
git commit -m "fix(api): retry requests on 503 Service Unavailable

The external API occasionally returns 503 errors during peak hours.
Added exponential backoff retry logic with max 3 attempts.

Closes #123"
```

### commitメッセージテンプレート

repoのルートに`.gitmessage`を作る:

```
# <type>(<scope>): <subject>
# # Types: feat, fix, docs, style, refactor, test, chore, perf, ci, revert
# Scope: api, ui, db, auth, etc.
# Subject: imperative mood, no period, max 50 chars
#
# [optional body] - explain why, not what
# [optional footer] - Breaking changes, closes #issue
```

有効化: `git config commit.template .gitmessage`

## mergeとrebase

### Merge（履歴を保持する）

```bash
# merge commitを作る
git checkout main
git merge feature/user-auth

# 結果:
# *   merge commit
# |\
# | * feature commits
# |/
# * main commits
```

**使う場面:**
- feature branchを`main`へmergeするとき
- 履歴を正確に保持したいとき
- 複数人がそのブランチで作業したとき
- すでにpush済みで、他の人がその上に作業している可能性があるとき

### Rebase（直線的な履歴）

```bash
# featureのcommitを対象ブランチ上へ書き換える
git checkout feature/user-auth
git rebase main

# 結果:
# * feature commits (rewritten)
# * main commits
```

**使う場面:**
- ローカルのfeature branchを最新の`main`へ追従させるとき
- 直線的でクリーンな履歴にしたいとき
- ブランチがローカル限定（未push）のとき
- そのブランチで作業しているのが自分だけのとき

### Rebaseの手順

```bash
# PR前にfeature branchを最新のmainへ追従させる
git checkout feature/user-auth
git fetch origin
git rebase origin/main

# コンフリクトを解消する
# テストは通ったままであること

# force push（自分だけが作業している場合のみ）
git push --force-with-lease origin feature/user-auth
```

### Rebaseしてはいけない場面

```
# 次のブランチは絶対にrebaseしない:
- 共有リポジトリへpush済みのブランチ
- 他の人がその上に作業しているブランチ
- protected branch（main、develop）
- すでにmerge済みのブランチ

# 理由: rebaseは履歴を書き換え、他人の作業を壊す
```

## Pull Requestの流れ

### PRタイトルの形式

```
<type>(<scope>): <description>

例:
feat(auth): add SSO support for enterprise users
fix(api): resolve race condition in order processing
docs(api): add OpenAPI specification for v2 endpoints
```

### PR説明テンプレート

```markdown
## What

このPRが何をするかの簡潔な説明。

## Why

動機と背景を説明する。

## How

特筆すべき実装上の要点。

## Testing

- [ ] unit testを追加・更新した
- [ ] integration testを追加・更新した
- [ ] 手動テストを実施した

## Screenshots (if applicable)

UI変更のbefore/afterスクリーンショット。

## Checklist

- [ ] プロジェクトのスタイル規約に従っている
- [ ] セルフレビュー済み
- [ ] 複雑なロジックにコメントを付けた
- [ ] ドキュメントを更新した
- [ ] 新しい警告を発生させていない
- [ ] ローカルでテストが通る
- [ ] 関連issueをリンクした

Closes #123
```

### コードレビューのチェックリスト

**レビュアー向け:**

- [ ] そのコードは提示された問題を解決しているか
- [ ] 未処理の境界ケースはないか
- [ ] 読みやすく保守しやすいか
- [ ] テストは十分か
- [ ] セキュリティ上の懸念はないか
- [ ] commit履歴は整理されているか（必要ならsquash済みか）

**作成者向け:**

- [ ] レビュー依頼前にセルフレビューを済ませた
- [ ] CIが通る（テスト、lint、型検査）
- [ ] PRのサイズが妥当（500行未満が理想）
- [ ] 単一の機能・修正に絞られている
- [ ] 説明文が変更内容を明確に伝えている

## コンフリクト解消

### コンフリクトの把握

```bash
# merge前にコンフリクトを確認する
git checkout main
git merge feature/user-auth --no-commit --no-ff

# コンフリクトがあればGitは次のように表示する:
# CONFLICT (content): Merge conflict in src/auth/login.ts
# Automatic merge failed; fix conflicts and then commit the result.
```

### コンフリクトの解消

```bash
# コンフリクトしたファイルを見る
git status

# ファイル内のコンフリクトマーカーを確認する
# <<<<<<< HEAD
# mainの内容
# =======
# feature branchの内容
# >>>>>>> feature/user-auth

# 方法1: 手動で解消する
# ファイルを編集し、マーカーを削除して正しい内容を残す

# 方法2: merge toolを使う
git mergetool

# 方法3: 片側を採用する
git checkout --ours src/auth/login.ts    # mainの内容を残す
git checkout --theirs src/auth/login.ts  # featureの内容を残す

# 解消後、stageしてcommitする
git add src/auth/login.ts
git commit
```

### コンフリクトを防ぐ工夫

```bash
# 1. feature branchを小さく短命に保つ
# 2. mainへ頻繁にrebaseする
git checkout feature/user-auth
git fetch origin
git rebase origin/main

# 3. 共有ファイルを触るときはチームへ共有する
# 4. 長命なブランチの代わりにfeature flagを使う
# 5. PRは速やかにレビューしmergeする
```

## ブランチ管理

### 命名規約

```
# feature branch
feature/user-authentication
feature/JIRA-123-payment-integration

# 不具合修正
fix/login-redirect-loop
fix/456-null-pointer-exception

# hotfix（本番障害）
hotfix/critical-security-patch
hotfix/database-connection-leak

# リリース
release/1.2.0
release/2024-01-hotfix

# 実験・PoC
experiment/new-caching-strategy
poc/graphql-migration
```

### ブランチの整理

```bash
# merge済みのローカルブランチを削除する
git branch --merged main | grep -v "^\*\|main" | xargs -n 1 git branch -d

# 削除済みリモートブランチの追跡参照を削除する
git fetch -p

# ローカルブランチを削除する
git branch -d feature/user-auth  # 安全な削除（merge済みのみ）
git branch -D feature/user-auth  # 強制削除

# リモートブランチを削除する
git push origin --delete feature/user-auth
```

### Stashの使い方

```bash
# 作業中の変更を退避する
git stash push -m "WIP: user authentication"

# stash一覧を表示する
git stash list

# 直近のstashを適用する
git stash pop

# 特定のstashを適用する
git stash apply stash@{2}

# stashを破棄する
git stash drop stash@{0}
```

## リリース管理

### セマンティックバージョニング

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

### リリースの作成

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

### changelogの生成

```bash
# commitからchangelogを生成する
git log v1.1.0..v1.2.0 --oneline --no-merges

# またはconventional-changelogを使う
npx conventional-changelog -i CHANGELOG.md -s
```

## Gitの設定

### 必須の設定

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

```gitignore
# 依存
node_modules/
vendor/

# build成果物
dist/
build/
*.o
*.exe

# 環境変数ファイル
.env
.env.local
.env.*.local

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

## よく使う手順

### 新機能を始める

```bash
# 1. mainブランチを更新する
git checkout main
git pull origin main

# 2. feature branchを作る
git checkout -b feature/user-auth

# 3. 変更してcommitする
git add .
git commit -m "feat(auth): implement OAuth2 login"

# 4. リモートへpushする
git push -u origin feature/user-auth

# 5. GitHub/GitLabでPull Requestを作る
```

### PRへ変更を追加する

```bash
# 1. さらに変更を加える
git add .
git commit -m "feat(auth): add error handling"

# 2. 更新をpushする
git push origin feature/user-auth
```

### forkをupstreamへ同期する

```bash
# 1. upstream remoteを追加する（初回のみ）
git remote add upstream https://github.com/original/repo.git

# 2. upstreamをfetchする
git fetch upstream

# 3. upstream/mainを自分のmainへmergeする
git checkout main
git merge upstream/main

# 4. 自分のforkへpushする
git push origin main
```

### 失敗を取り消す

```bash
# 直前のcommitを取り消す（変更は残す）
git reset --soft HEAD~1

# 直前のcommitを取り消す（変更も破棄）
git reset --hard HEAD~1

# push済みの直前commitを取り消す
git revert HEAD
git push origin main

# 特定ファイルの変更を取り消す
git checkout HEAD -- path/to/file

# 直前のcommitメッセージを直す
git commit --amend -m "New message"

# 入れ忘れたファイルを直前のcommitへ追加する
git add forgotten-file
git commit --amend --no-edit
```

## Git Hooks

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# lintを実行する
npm run lint || exit 1

# テストを実行する
npm test || exit 1

# 秘密情報が含まれていないか確認する
if git diff --cached | grep -E '(password|api_key|secret)'; then
    echo "Possible secret detected. Commit aborted."
    exit 1
fi
```

### Pre-Push Hook

```bash
#!/bin/bash
# .git/hooks/pre-push

# 全テストを実行する
npm run test:all || exit 1

# console.logの残りを確認する
if git diff origin/main | grep -E 'console\.log'; then
    echo "Remove console.log statements before pushing."
    exit 1
fi
```

## アンチパターン

```
# BAD: mainへ直接commitする
git checkout main
git commit -m "fix bug"

# GOOD: feature branchとPRを使う

# BAD: 秘密情報をcommitする
git add .env  # APIキーを含む

# GOOD: .gitignoreへ追加し、環境変数を使う

# BAD: 巨大なPR（1000行以上）
# GOOD: 小さく焦点の絞られたPRへ分割する

# BAD: 「update」だけのcommitメッセージ
git commit -m "update"
git commit -m "fix"

# GOOD: 内容が分かるメッセージ
git commit -m "fix(auth): resolve redirect loop after login"

# BAD: 公開済み履歴を書き換える
git push --force origin main

# GOOD: 公開ブランチにはrevertを使う
git revert HEAD

# BAD: 長命なfeature branch（数週間〜数か月）
# GOOD: ブランチは数日で終わらせ、頻繁にrebaseする

# BAD: 生成物をcommitする
git add dist/
git add node_modules/

# GOOD: .gitignoreへ追加する
```

## クイックリファレンス

| 操作 | コマンド |
|------|---------|
| ブランチ作成 | `git checkout -b feature/name` |
| ブランチ切り替え | `git checkout branch-name` |
| ブランチ削除 | `git branch -d branch-name` |
| ブランチのmerge | `git merge branch-name` |
| ブランチのrebase | `git rebase main` |
| 履歴の表示 | `git log --oneline --graph` |
| 変更の表示 | `git diff` |
| 変更のstage | `git add .` または `git add -p` |
| commit | `git commit -m "message"` |
| push | `git push origin branch-name` |
| pull | `git pull origin branch-name` |
| stash | `git stash push -m "message"` |
| 直前commitの取り消し | `git reset --soft HEAD~1` |
| commitのrevert | `git revert HEAD` |
