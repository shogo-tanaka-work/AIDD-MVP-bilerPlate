---
name: deployment-patterns
description: Webアプリケーション向けのdeploy workflow、CI/CD pipelineパターン、Dockerによるcontainer化、health check、rollback戦略、本番投入前チェックリスト。CI/CDを構築するとき、アプリをcontainer化するとき、リリース前に本番準備状況を確認するときに使う。
metadata:
  origin: ECC
---

# Deployment Patterns

本番deployのworkflowとCI/CDの判断基準。設定ファイルやコードの具体例は`references/`に分ける。

## いつ発動するか

- CI/CD pipelineを構築するとき
- アプリケーションをDocker化するとき
- deploy戦略（blue-green、canary、rolling）を検討するとき
- health checkとreadiness probeを実装するとき
- 本番リリースを準備するとき
- 環境ごとの設定を構成するとき

## Deploy戦略の使い分け

| 戦略 | 特徴 | 使いどころ |
|---|---|---|
| Rolling（既定） | インスタンスを段階的に置換。新旧が同時稼働するため後方互換が必須 | 通常のdeploy、後方互換な変更 |
| Blue-Green | 同一構成を2面用意し一括切替。rollbackは即時だがインフラが2倍 | 重要サービス、問題を一切許容できない場合 |
| Canary | 少量トラフィックで検証してから拡大。分割基盤と監視が必要 | 高トラフィック、リスクの高い変更、feature flag |

どの戦略でもdatabase migrationは後方互換に保ち、rollback時にschemaを戻さずに済む形にする。

## 判断基準

秘密値の扱いは常時ロードされる`.agents/rules/secrets.md`、本番設定変更のdry-run / preview検証は`.agents/rules/verification.md`に従う。

### Container化

- baseはバージョン固定tag（`node:22-alpine`）を使い、`:latest`を使わない。
- multi-stage buildでbuild依存とdev依存を本番imageから除き、非rootユーザーで実行する。
- 依存定義ファイルを先にCOPYしてlayer cacheを効かせ、`.dockerignore`で`node_modules`・`.git`・testを除外する。
- `HEALTHCHECK`を定義し、compose / k8sでCPU・メモリ上限を設定する。

### CI/CD pipeline

- PR: lint → typecheck → unit test → integration test → preview deploy。
- main merge: 上記 → image build → staging deploy → smoke test → production deploy。
- production deployは`environment`で保護し、image tagにcommit SHAを使って再現可能にする。
- deploy失敗時に無制限の自動retryをしない。

### Health checkと設定

- `/health`は軽量な生存確認に留め、`/health/detailed`で依存先（DB、cache、外部API）を個別に確認して`503`で縮退を伝える。
- Kubernetesはliveness / readiness / startupを分ける。依存先の障害はreadinessに反映し、livenessでは落とさない。
- 設定は環境変数から取得し、起動時にschemaで検証して不正なら即座に落とす。`NODE_ENV`とは別に`APP_ENV`でアプリ環境を明示する。

### Rollback

- 直前のimage / artifactを常にtag付きで残し、即時rollbackの手順を文書化する。
- feature flagでdeployなしに新機能を無効化できるようにする。
- 本番前にstagingでrollbackを実際に試す。

## 本番投入前チェックリスト

### アプリケーション
- [ ] すべてのtestが通る（unit、integration、E2E）
- [ ] ログが構造化（JSON）されている
- [ ] health check endpointが依存先の状態を反映する

### インフラ
- [ ] Docker imageが再現可能にbuildできる（バージョン固定、SHA tag）
- [ ] 環境変数が文書化され、起動時に検証される
- [ ] リソース上限（CPU、メモリ）とスケーリング範囲（最小/最大）が設定されている
- [ ] すべてのendpointでTLSが有効

### 監視
- [ ] リクエスト数・latency・エラー率のmetricsを出力している
- [ ] エラー率閾値のalertと、health endpointの死活監視がある
- [ ] ログ集約が検索可能な形で構築されている

### セキュリティ
- [ ] 依存関係のCVEをスキャン済み
- [ ] CORSが許可originのみで、公開endpointにrate limitingがある
- [ ] セキュリティヘッダー（CSP、HSTS、X-Frame-Options）を設定済み

### 運用
- [ ] rollback手順が文書化され、stagingで検証済み
- [ ] 本番相当のデータ量でdatabase migrationを検証済み
- [ ] 障害シナリオのrunbookと、on-callローテーション・エスカレーション経路がある

## 参照

- [references/deploy-strategies.md](references/deploy-strategies.md) — rolling / blue-green / canaryの遷移図、rollbackコマンドとチェックリスト
- [references/docker.md](references/docker.md) — Node.js / Go / Python向けmulti-stage Dockerfileと良否の実践一覧
- [references/ci-cd.md](references/ci-cd.md) — GitHub Actionsの標準pipelineとステージ構成
- [references/health-and-config.md](references/health-and-config.md) — health check endpoint、Kubernetes probe、Twelve-Factor設定と環境変数のschema検証
