# GitHub リポジトリ初期設定ガイド

新規プロジェクト作成後に **必ず** 行うGitHub設定。
これらはリポジトリのコードに含まれないため、手動設定が必要。

---

## 1. mainブランチの保護（必須）

**Settings → Rules → Rulesets → New ruleset**

| 項目 | 設定値 |
|------|--------|
| Name | `main` |
| Enforcement | **Active**（Disabledだと全ルールが無効） |
| Target branches | `refs/heads/main` |

**追加するルール:**

| ルール | 用途 |
|--------|------|
| Restrict deletions | mainブランチの削除を禁止 |
| Block force pushes | force pushを禁止 |
| Require a pull request before merging | PR必須（Required approvals: 0でOK） |
| Require status checks to pass | CIの `test` ジョブを必須に設定 |
| → Require branches to be up to date | マージ前にブランチ最新化を強制 |

> **注意:** 「Require status checks」で `test` が候補に出ない場合は、
> 先に1本PRを出してCIを実行させてから設定する。

---

## 2. マージ戦略（必須）

**Settings → General → Pull Requests**

| 項目 | 設定値 |
|------|--------|
| Allow merge commits | **OFF** |
| Allow squash merging | **ON** |
| → Default commit message | Default to pull request title |
| Allow rebase merging | **OFF** |
| Automatically delete head branches | **ON** |

---

## 3. Dependabot（必須）

**Settings → Code security**

| 項目 | 設定値 |
|------|--------|
| Dependabot alerts | **Enable** |
| Dependabot security updates | **Enable** |

> `dependabot.yml` はリポジトリに含まれているため、ファイル設定は不要。

---

## 4. Secrets（Claude Code Action使用時）

**Settings → Secrets and variables → Actions → New repository secret**

| Name | 用途 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude Code Action の実行に必要 |

---

## 設定確認コマンド（gh CLI）

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# リポジトリ設定
gh api repos/$REPO --jq '{
  allow_merge_commit,
  allow_squash_merge,
  allow_rebase_merge,
  delete_branch_on_merge
}'

# セキュリティ設定
gh api repos/$REPO --jq '.security_and_analysis'

# Rulesets
gh api repos/$REPO/rulesets

# Secrets（件数のみ）
gh api repos/$REPO/actions/secrets --jq '.total_count'
```
