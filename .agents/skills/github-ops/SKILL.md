---
name: github-ops
description: GitHubリポジトリの運用・自動化・管理。gh CLIを使ったissue triage、PR管理、CI/CD運用、release管理、セキュリティ監視。GitHubのissue・PR・CI状況・release・contributor・停滞item、その他単純なgitコマンドを超えるGitHub運用タスクを扱いたいときに使う。
metadata:
  origin: ECC
---

# GitHub運用

community health、CIの信頼性、contributor体験を重視してGitHubリポジトリを管理する。

## 発動タイミング

- issueのtriage（分類、labeling、返信、重複判定）
- PRの管理（レビュー状況、CI check、停滞PR、merge可否）
- CI/CD失敗のdebug
- releaseとchangelogの準備
- Dependabotとセキュリティalertの監視
- open-source projectでのcontributor体験の管理
- ユーザーが「GitHubを見て」「issueをtriageして」「PRをレビューして」「merge」「release」「CIが壊れている」と言ったとき

## ツール要件

- すべてのGitHub API操作に**gh CLI**を使う
- `gh auth login`でリポジトリアクセスを設定しておく

## Issue triage

各issueを種別と優先度で分類する。

**種別:** bug, feature-request, question, documentation, enhancement, duplicate, invalid, good-first-issue

**優先度:** critical（破壊的／セキュリティ）、high（影響大）、medium（あると良い）、low（見た目のみ）

### Triageの流れ

1. issueのtitle、body、commentを読む
2. 既存issueと重複していないか確認する（keywordで検索）
3. `gh issue edit --add-label`で適切なlabelを付ける
4. 質問の場合: 有用な回答を作成して投稿する
5. 情報不足のbugの場合: 再現手順を尋ねる
6. good first issueの場合: `good-first-issue` labelを付ける
7. 重複の場合: 元issueへのリンクをcommentし、`duplicate` labelを付ける

```bash
# 重複候補を検索する
gh issue list --search "keyword" --state all --limit 20

# labelを付ける
gh issue edit <number> --add-label "bug,high-priority"

# issueにcommentする
gh issue comment <number> --body "Thanks for reporting. Could you share reproduction steps?"
```

## PR管理

### レビューチェックリスト

1. CI状況を確認する: `gh pr checks <number>`
2. merge可能か確認する: `gh pr view <number> --json mergeable`
3. 経過日数と最終活動を確認する
4. 5日以上レビューが付いていないPRを洗い出す
5. community PRの場合: testがあり規約に沿っているか確認する

### 停滞ポリシー

- 14日以上活動のないissue: `stale` labelを付け、状況を尋ねるcommentをする
- 7日以上活動のないPR: まだ進行中か尋ねるcommentをする
- 30日応答のない停滞issueは自動closeする（`closed-stale` labelを付ける）

```bash
# 停滞issueを探す（14日以上活動なし）
gh issue list --label "stale" --state open

# 直近の活動がないPRを探す
gh pr list --json number,title,updatedAt --jq '.[] | select(.updatedAt < "2026-03-01")'
```

## CI/CD運用

CIが失敗したとき:

1. workflow runを確認する: `gh run view <run-id> --log-failed`
2. 失敗したstepを特定する
3. flaky testか実際の失敗かを判断する
4. 実際の失敗の場合: 根本原因を特定し修正案を示す
5. flaky testの場合: 後の調査に向けてパターンを記録する

```bash
# 直近の失敗runを一覧する
gh run list --status failure --limit 10

# 失敗したrunのlogを見る
gh run view <run-id> --log-failed

# 失敗したworkflowを再実行する
gh run rerun <run-id> --failed
```

## Release管理

releaseを準備するとき:

1. mainのCIがすべてgreenか確認する
2. 未releaseの変更を確認する: `gh pr list --state merged --base main`
3. PR titleからchangelogを生成する
4. releaseを作成する: `gh release create`

```bash
# 前回release以降にmergeされたPRを一覧する
gh pr list --state merged --base main --search "merged:>2026-03-01"

# releaseを作成する
gh release create v1.2.0 --title "v1.2.0" --generate-notes

# pre-releaseを作成する
gh release create v1.3.0-rc1 --prerelease --title "v1.3.0 Release Candidate 1"
```

## セキュリティ監視

```bash
# Dependabot alertを確認する
gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[].security_advisory.summary'

# secret scanning alertを確認する
gh api repos/{owner}/{repo}/secret-scanning/alerts --jq '.[].state'

# 安全な依存更新をレビューして自動mergeする
gh pr list --label "dependencies" --json number,title
```

- 安全な依存更新をレビューして自動mergeする
- critical/high severityのalertは直ちに報告する
- Dependabot alertは最低でも週次で確認する

## 品質ゲート

GitHub運用タスクを完了する前に:
- triageしたissueすべてに適切なlabelが付いている
- レビューもcommentも無いまま7日以上経過したPRが無い
- CI失敗を調査済み（単に再実行しただけではない）
- releaseに正確なchangelogが含まれている
- セキュリティalertを確認し追跡している
