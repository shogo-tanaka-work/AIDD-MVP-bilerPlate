# 日常操作: stash、取り消し、クイックリファレンス

## Stashの使い方

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

## 失敗を取り消す

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

`reset --hard`と`--amend`は履歴を書き換える。push済みのcommitには`revert`を使う。

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
| 変更のstage | `git add -p`（対話的）または`git add <path>` |
| commit | `git commit -m "message"` |
| push | `git push origin branch-name` |
| pull | `git pull origin branch-name` |
| stash | `git stash push -m "message"` |
| 直前commitの取り消し | `git reset --soft HEAD~1` |
| commitのrevert | `git revert HEAD` |
