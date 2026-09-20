# ブランチ戦略と命名規約

## GitHub Flow（シンプル。多くの場合に推奨）

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

## Trunk-Based Development（高速に回すチーム向け）

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

## GitFlow（複雑。リリースサイクル駆動）

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

## どれを選ぶか

| 戦略 | チーム規模 | リリース頻度 | 適する対象 |
|----------|-----------|-----------------|----------|
| GitHub Flow | 任意 | 継続的 | SaaS、Webアプリ、スタートアップ |
| Trunk-Based | 熟練5名以上 | 1日複数回 | 高速に回すチーム、feature flag活用 |
| GitFlow | 10名以上 | 計画的 | エンタープライズ、規制業種 |

## ブランチ命名規約

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

## ブランチの整理

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
