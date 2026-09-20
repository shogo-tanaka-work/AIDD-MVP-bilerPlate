# Deploy戦略とrollback

rolling / blue-green / canaryの遷移と、即時rollbackのコマンド集。

## Rolling Deployment（既定）

インスタンスを段階的に置き換える。ロールアウト中は新旧バージョンが同時に動く。

```
Instance 1: v1 → v2  (update first)
Instance 2: v1        (still running v1)
Instance 3: v1        (still running v1)

Instance 1: v2
Instance 2: v1 → v2  (update second)
Instance 3: v1

Instance 1: v2
Instance 2: v2
Instance 3: v1 → v2  (update last)
```

**利点:** ダウンタイムなし、段階的なロールアウト
**欠点:** 2バージョンが同時に動くため、後方互換な変更が必要
**使いどころ:** 通常のdeploy、後方互換な変更

## Blue-Green Deployment

同一構成の環境を2つ動かし、トラフィックを一括で切り替える。

```
Blue  (v1) ← traffic
Green (v2)   idle, running new version

# After verification:
Blue  (v1)   idle (becomes standby)
Green (v2) ← traffic
```

**利点:** 即座のrollback（blueへ戻すだけ）、綺麗な切り替え
**欠点:** deploy中に2倍のインフラが必要
**使いどころ:** 重要なサービス、問題を一切許容できない場合

## Canary Deployment

まず少量のトラフィックだけを新バージョンへ流す。

```
v1: 95% of traffic
v2:  5% of traffic  (canary)

# If metrics look good:
v1: 50% of traffic
v2: 50% of traffic

# Final:
v2: 100% of traffic
```

**利点:** 全面展開の前に実トラフィックで問題を検出できる
**欠点:** トラフィック分割の基盤と監視が必要
**使いどころ:** 高トラフィックなサービス、リスクの高い変更、feature flag

## 即時rollback

```bash
# Docker/Kubernetes: 直前のimageを指す
kubectl rollout undo deployment/app

# Vercel: 直前のdeploymentを昇格させる
vercel rollback

# Railway: 直前のcommitを再deployする
railway up --commit <previous-sha>

# Database: migrationを巻き戻す（可逆な場合）
npx prisma migrate resolve --rolled-back <migration-name>
```

## Rollbackチェックリスト

- [ ] 直前のimage/artifactが利用可能でtag付けされている
- [ ] database migrationが後方互換である（破壊的変更がない）
- [ ] feature flagでdeployなしに新機能を無効化できる
- [ ] エラー率の急増に対する監視alertが設定されている
- [ ] 本番リリース前にstagingでrollbackを検証済み
