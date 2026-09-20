# mergeとrebase、コンフリクト解消

## Merge（履歴を保持する）

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

## Rebase（直線的な履歴）

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

## コンフリクトの把握

```bash
# merge前にコンフリクトを確認する
git checkout main
git merge feature/user-auth --no-commit --no-ff

# コンフリクトがあればGitは次のように表示する:
# CONFLICT (content): Merge conflict in src/auth/login.ts
# Automatic merge failed; fix conflicts and then commit the result.
```

## コンフリクトの解消

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

解消後は必ずテストを再実行し、両側の意図が残っていることを確認する。

## コンフリクトを防ぐ工夫

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

## forkをupstreamへ同期する

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
