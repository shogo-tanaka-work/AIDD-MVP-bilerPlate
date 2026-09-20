# commitメッセージとPull Request

## Conventional Commits形式

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

本文は「何を」ではなく「なぜ」を書く。プロジェクトが本文の言語（日本語など）を定めていればそれに従う。

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

## Pull Request

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

### よく使う手順

```bash
# 新機能を始める
git checkout main
git pull origin main
git checkout -b feature/user-auth
git add -p
git commit -m "feat(auth): implement OAuth2 login"
git push -u origin feature/user-auth
# GitHub/GitLabでPull Requestを作る

# PRへ変更を追加する
git add -p
git commit -m "feat(auth): add error handling"
git push origin feature/user-auth
```
