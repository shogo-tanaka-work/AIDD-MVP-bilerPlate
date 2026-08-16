---
name: deployment-patterns
description: Webアプリケーション向けのdeploy workflow、CI/CD pipelineパターン、Dockerによるcontainer化、health check、rollback戦略、本番投入前チェックリスト。CI/CDを構築するとき、アプリをcontainer化するとき、リリース前に本番準備状況を確認するときに使う。
metadata:
  origin: ECC
---

# Deployment Patterns

本番deployのworkflowとCI/CDのベストプラクティス。

## いつ発動するか

- CI/CD pipelineを構築するとき
- アプリケーションをDocker化するとき
- deploy戦略（blue-green、canary、rolling）を検討するとき
- health checkとreadiness probeを実装するとき
- 本番リリースを準備するとき
- 環境ごとの設定を構成するとき

## Deploy戦略

### Rolling Deployment（既定）

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

### Blue-Green Deployment

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

### Canary Deployment

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

## Docker

### Multi-Stage Dockerfile（Node.js）

```dockerfile
# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --production

# Stage 3: Production image
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001
USER appuser

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

### Multi-Stage Dockerfile（Go）

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

FROM alpine:3.19 AS runner
RUN apk --no-cache add ca-certificates
RUN adduser -D -u 1001 appuser
USER appuser

COPY --from=builder /server /server

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["/server"]
```

### Multi-Stage Dockerfile（Python/Django）

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

FROM python:3.12-slim AS runner
WORKDIR /app

RUN useradd -r -u 1001 appuser
USER appuser

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/')" || exit 1
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4"]
```

### Dockerのベストプラクティス

```
# GOOD practices
- バージョンを固定したtagを使う（node:latestではなくnode:22-alpine）
- multi-stage buildでimageサイズを最小化する
- 非rootユーザーで実行する
- 依存定義ファイルを先にCOPYする（layer cache）
- .dockerignoreでnode_modules、.git、testを除外する
- HEALTHCHECK命令を追加する
- docker-composeまたはk8sでリソース上限を設定する

# BAD practices
- rootで実行する
- :latest tagを使う
- リポジトリ全体を1つのCOPY layerでコピーする
- 本番imageにdev依存をインストールする
- image内にsecretを保存する（環境変数またはsecrets managerを使う）
```

## CI/CD Pipeline

### GitHub Actions（標準pipeline）

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Deploy to production
        run: |
          # プラットフォーム固有のdeployコマンド
          # Railway: railway up
          # Vercel: vercel --prod
          # K8s: kubectl set image deployment/app app=ghcr.io/${{ github.repository }}:${{ github.sha }}
          echo "Deploying ${{ github.sha }}"
```

### Pipelineのステージ

```
PR opened:
  lint → typecheck → unit tests → integration tests → preview deploy

Merged to main:
  lint → typecheck → unit tests → integration tests → build image → deploy staging → smoke tests → deploy production
```

## Health Check

### Health Check Endpoint

```typescript
// シンプルなhealth check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// 詳細なhealth check（内部監視向け）
app.get("/health/detailed", async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    externalApi: await checkExternalApi(),
  };

  const allHealthy = Object.values(checks).every(c => c.status === "ok");

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || "unknown",
    uptime: process.uptime(),
    checks,
  });
});

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await db.query("SELECT 1");
    return { status: "ok", latency_ms: 2 };
  } catch (err) {
    return { status: "error", message: "Database unreachable" };
  }
}
```

### Kubernetesのprobe

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 2

startupProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 0
  periodSeconds: 5
  failureThreshold: 30    # 30 * 5s = 最大150sの起動時間
```

## 環境設定

### Twelve-Factor Appパターン

```bash
# 設定はすべて環境変数から取得する — コードに書かない
DATABASE_URL=postgres://user:pass@host:5432/db
REDIS_URL=redis://host:6379/0
API_KEY=${API_KEY}           # secrets managerが注入する
LOG_LEVEL=info
PORT=3000

# 環境ごとの挙動
NODE_ENV=production          # または staging, development
APP_ENV=production           # アプリ環境を明示する
```

### 設定の検証

```typescript
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

// 起動時に検証する — 設定が不正なら即座に落とす
export const env = envSchema.parse(process.env);
```

## Rollback戦略

### 即時rollback

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

### Rollbackチェックリスト

- [ ] 直前のimage/artifactが利用可能でtag付けされている
- [ ] database migrationが後方互換である（破壊的変更がない）
- [ ] feature flagでdeployなしに新機能を無効化できる
- [ ] エラー率の急増に対する監視alertが設定されている
- [ ] 本番リリース前にstagingでrollbackを検証済み

## 本番投入前チェックリスト

すべての本番deployの前に確認する。

### アプリケーション
- [ ] すべてのtestが通る（unit、integration、E2E）
- [ ] コードや設定ファイルにhardcodeされたsecretがない
- [ ] error handlingがすべてのedge caseを網羅している
- [ ] ログが構造化（JSON）されており、個人情報を含まない
- [ ] health check endpointが意味のある状態を返す

### インフラ
- [ ] Docker imageが再現可能にbuildできる（バージョン固定）
- [ ] 環境変数が文書化され、起動時に検証される
- [ ] リソース上限が設定されている（CPU、メモリ）
- [ ] 水平スケーリングが設定されている（最小/最大インスタンス数）
- [ ] すべてのendpointでSSL/TLSが有効

### 監視
- [ ] アプリケーションのmetricsを出力している（リクエスト数、latency、エラー）
- [ ] エラー率が閾値を超えた際のalertが設定されている
- [ ] ログ集約が構築されている（構造化ログ、検索可能）
- [ ] health endpointへの死活監視がある

### セキュリティ
- [ ] 依存関係のCVEをスキャン済み
- [ ] CORSが許可originのみに設定されている
- [ ] 公開endpointでrate limitingが有効
- [ ] 認証と認可を検証済み
- [ ] セキュリティヘッダーを設定済み（CSP、HSTS、X-Frame-Options）

### 運用
- [ ] rollback手順が文書化され検証済み
- [ ] 本番相当のデータ量でdatabase migrationを検証済み
- [ ] よくある障害シナリオのrunbookがある
- [ ] on-callローテーションとエスカレーション経路が定義されている
