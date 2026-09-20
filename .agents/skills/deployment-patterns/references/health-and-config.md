# Health Checkと環境設定

health check endpoint、Kubernetes probe、環境変数のschema検証。秘密値の扱いは常時ロードされる`.agents/rules/secrets.md`に従う。

## Health Check Endpoint

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

`/health/detailed`は依存先の名前を露出するため、内部networkまたは認証付きに限定する。

## Kubernetesのprobe

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

- liveness: 失敗するとcontainerが再起動される。依存先の障害で落とさない（自身のdeadlock検知に限る）。
- readiness: 失敗するとトラフィックが来なくなる。依存先の一時障害で縮退させたいときはこちらに反映する。
- startup: 起動完了までliveness / readinessを抑止する。起動が遅いアプリの誤再起動を防ぐ。

## Twelve-Factor Appパターン

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

## 設定の検証

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

検証済みの`env`だけをアプリ内で参照し、`process.env`を直接読む箇所を残さない。
