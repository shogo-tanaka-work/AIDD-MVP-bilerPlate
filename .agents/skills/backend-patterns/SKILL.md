---
name: backend-patterns
description: Node.js、Express、Next.js API routeのためのbackendアーキテクチャパターン、API設計、database最適化、server-sideのベストプラクティス。Node.js、Express、Next.jsのAPI routeとそのdata accessを実装・レビューするときに使う。
metadata:
  origin: ECC
---

# Backend開発パターン

スケールするserver-sideアプリケーションのためのbackendアーキテクチャパターンとベストプラクティス。

## 適用する場面

- REST・GraphQLのAPI endpointを設計するとき
- repository、service、controller層を実装するとき
- database queryを最適化するとき（N+1、index、connection pooling）
- cacheを追加するとき（Redis、in-memory、HTTP cache header）
- background jobや非同期処理を構築するとき
- APIのエラー処理とvalidationを構造化するとき
- middlewareを実装するとき（認証、logging、rate limiting）

## API設計パターン

### RESTful APIの構造

```typescript
// PASS: リソースベースのURL
GET    /api/markets                 # リソース一覧
GET    /api/markets/:id             # 単一リソース取得
POST   /api/markets                 # リソース作成
PUT    /api/markets/:id             # リソース置換
PATCH  /api/markets/:id             # リソース更新
DELETE /api/markets/:id             # リソース削除

// PASS: filter、sort、paginationにはquery parameterを使う
GET /api/markets?status=active&sort=volume&limit=20&offset=0
```

### Repositoryパターン

```typescript
// data accessロジックを抽象化する
interface MarketRepository {
  findAll(filters?: MarketFilters): Promise<Market[]>
  findById(id: string): Promise<Market | null>
  create(data: CreateMarketDto): Promise<Market>
  update(id: string, data: UpdateMarketDto): Promise<Market>
  delete(id: string): Promise<void>
}

class SupabaseMarketRepository implements MarketRepository {
  async findAll(filters?: MarketFilters): Promise<Market[]> {
    let query = supabase.from('markets').select('*')

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)
    return data
  }

  // その他のメソッド...
}
```

### Service層パターン

```typescript
// 業務ロジックをdata accessから分離する
class MarketService {
  constructor(private marketRepo: MarketRepository) {}

  async searchMarkets(query: string, limit: number = 10): Promise<Market[]> {
    // 業務ロジック
    const embedding = await generateEmbedding(query)
    const results = await this.vectorSearch(embedding, limit)

    // 全データを取得
    const markets = await this.marketRepo.findByIds(results.map(r => r.id))

    // 類似度でソート
    return markets.sort((a, b) => {
      const scoreA = results.find(r => r.id === a.id)?.score || 0
      const scoreB = results.find(r => r.id === b.id)?.score || 0
      return scoreA - scoreB
    })
  }

  private async vectorSearch(embedding: number[], limit: number) {
    // vector search実装
  }
}
```

### Middlewareパターン

```typescript
// request/responseの処理パイプライン
export function withAuth(handler: NextApiHandler): NextApiHandler {
  return async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      const user = await verifyToken(token)
      req.user = user
      return handler(req, res)
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}

// 使い方
export default withAuth(async (req, res) => {
  // handlerはreq.userへアクセスできる
})
```

## Databaseパターン

### Query最適化

```typescript
// PASS: 良い例: 必要なカラムだけをselectする
const { data } = await supabase
  .from('markets')
  .select('id, name, status, volume')
  .eq('status', 'active')
  .order('volume', { ascending: false })
  .limit(10)

// FAIL: 悪い例: すべてをselectする
const { data } = await supabase
  .from('markets')
  .select('*')
```

### N+1 Queryの回避

```typescript
// FAIL: 悪い例: N+1 query問題
const markets = await getMarkets()
for (const market of markets) {
  market.creator = await getUser(market.creator_id)  // N回のquery
}

// PASS: 良い例: 一括取得
const markets = await getMarkets()
const creatorIds = markets.map(m => m.creator_id)
const creators = await getUsers(creatorIds)  // 1回のquery
const creatorMap = new Map(creators.map(c => [c.id, c]))

markets.forEach(market => {
  market.creator = creatorMap.get(market.creator_id)
})
```

### Transactionパターン

```typescript
async function createMarketWithPosition(
  marketData: CreateMarketDto,
  positionData: CreatePositionDto
) {
  // Supabaseのtransactionを使う
  const { data, error } = await supabase.rpc('create_market_with_position', {
    market_data: marketData,
    position_data: positionData
  })

  if (error) throw new Error('Transaction failed')
  return data
}

// Supabase側のSQL関数
CREATE OR REPLACE FUNCTION create_market_with_position(
  market_data jsonb,
  position_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  -- transactionは自動的に開始される
  INSERT INTO markets VALUES (market_data);
  INSERT INTO positions VALUES (position_data);
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    -- rollbackは自動的に行われる
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

## Cache戦略

### Redis Cache層

```typescript
class CachedMarketRepository implements MarketRepository {
  constructor(
    private baseRepo: MarketRepository,
    private redis: RedisClient
  ) {}

  async findById(id: string): Promise<Market | null> {
    // 先にcacheを確認する
    const cached = await this.redis.get(`market:${id}`)

    if (cached) {
      return JSON.parse(cached)
    }

    // cache miss - databaseから取得
    const market = await this.baseRepo.findById(id)

    if (market) {
      // 5分間cacheする
      await this.redis.setex(`market:${id}`, 300, JSON.stringify(market))
    }

    return market
  }

  async invalidateCache(id: string): Promise<void> {
    await this.redis.del(`market:${id}`)
  }
}
```

### Cache-Asideパターン

```typescript
async function getMarketWithCache(id: string): Promise<Market> {
  const cacheKey = `market:${id}`

  // cacheを試す
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  // cache miss - DBから取得
  const market = await db.markets.findUnique({ where: { id } })

  if (!market) throw new Error('Market not found')

  // cacheを更新
  await redis.setex(cacheKey, 300, JSON.stringify(market))

  return market
}
```

## エラー処理パターン

### 集約エラーハンドラ

```typescript
class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message)
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

export function errorHandler(error: unknown, req: Request): Response {
  if (error instanceof ApiError) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: error.statusCode })
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json({
      success: false,
      error: 'Validation failed',
      details: error.issues
    }, { status: 400 })
  }

  // 想定外のエラーをlogに残す
  console.error('Unexpected error:', error)

  return NextResponse.json({
    success: false,
    error: 'Internal server error'
  }, { status: 500 })
}

// 使い方
export async function GET(request: Request) {
  try {
    const data = await fetchData()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorHandler(error, request)
  }
}
```

### 指数バックオフによる再試行

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (i < maxRetries - 1) {
        // 指数バックオフ: 1s, 2s, 4s
        const delay = Math.pow(2, i) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError!
}

// 使い方
const data = await fetchWithRetry(() => fetchFromAPI())
```

## 認証と認可

### JWT Tokenの検証

```typescript
import jwt from 'jsonwebtoken'

interface JWTPayload {
  userId: string
  email: string
  role: 'admin' | 'user'
}

export function verifyToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload
    return payload
  } catch (error) {
    throw new ApiError(401, 'Invalid token')
  }
}

export async function requireAuth(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')

  if (!token) {
    throw new ApiError(401, 'Missing authorization token')
  }

  return verifyToken(token)
}

// API routeでの使い方
export async function GET(request: Request) {
  const user = await requireAuth(request)

  const data = await getDataForUser(user.userId)

  return NextResponse.json({ success: true, data })
}
```

### ロールベースのアクセス制御

```typescript
type Permission = 'read' | 'write' | 'delete' | 'admin'

interface User {
  id: string
  role: 'admin' | 'moderator' | 'user'
}

const rolePermissions: Record<User['role'], Permission[]> = {
  admin: ['read', 'write', 'delete', 'admin'],
  moderator: ['read', 'write', 'delete'],
  user: ['read', 'write']
}

export function hasPermission(user: User, permission: Permission): boolean {
  return rolePermissions[user.role].includes(permission)
}

export function requirePermission(permission: Permission) {
  return (handler: (request: Request, user: User) => Promise<Response>) => {
    return async (request: Request) => {
      const user = await requireAuth(request)

      if (!hasPermission(user, permission)) {
        throw new ApiError(403, 'Insufficient permissions')
      }

      return handler(request, user)
    }
  }
}

// 使い方 - 高階関数がhandlerをラップする
export const DELETE = requirePermission('delete')(
  async (request: Request, user: User) => {
    // handlerは権限を検証済みの認証ユーザーを受け取る
    return new Response('Deleted', { status: 200 })
  }
)
```

## Rate Limiting

rate limitingにはRedis、gateway、プラットフォーム標準のlimiterなど共有storeを使う。
本番APIでプロセスごとのin-memory counterを使わない。deployでリセットされ、
replica間で分断され、serverlessやマルチインスタンス環境ではfail openになる。

統合ポイントとエラー形式の選択はbackend層の責務に保つ。HTTP契約は`api-design`、
悪用ケースのレビューは`security-review`を使う。

## Background JobとQueue

### シンプルなQueueパターン

```typescript
class JobQueue<T> {
  private queue: T[] = []
  private processing = false

  async add(job: T): Promise<void> {
    this.queue.push(job)

    if (!this.processing) {
      this.process()
    }
  }

  private async process(): Promise<void> {
    this.processing = true

    while (this.queue.length > 0) {
      const job = this.queue.shift()!

      try {
        await this.execute(job)
      } catch (error) {
        console.error('Job failed:', error)
      }
    }

    this.processing = false
  }

  private async execute(job: T): Promise<void> {
    // jobの実行ロジック
  }
}

// marketのindexing用途での使い方
interface IndexJob {
  marketId: string
}

const indexQueue = new JobQueue<IndexJob>()

export async function POST(request: Request) {
  const { marketId } = await request.json()

  // ブロックせずqueueへ追加する
  await indexQueue.add({ marketId })

  return NextResponse.json({ success: true, message: 'Job queued' })
}
```

## LoggingとMonitoring

### 構造化Logging

```typescript
interface LogContext {
  userId?: string
  requestId?: string
  method?: string
  path?: string
  [key: string]: unknown
}

class Logger {
  log(level: 'info' | 'warn' | 'error', message: string, context?: LogContext) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    }

    console.log(JSON.stringify(entry))
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context)
  }

  error(message: string, error: Error, context?: LogContext) {
    this.log('error', message, {
      ...context,
      error: error.message,
      stack: error.stack
    })
  }
}

const logger = new Logger()

// 使い方
export async function GET(request: Request) {
  const requestId = crypto.randomUUID()

  logger.info('Fetching markets', {
    requestId,
    method: 'GET',
    path: '/api/markets'
  })

  try {
    const markets = await fetchMarkets()
    return NextResponse.json({ success: true, data: markets })
  } catch (error) {
    logger.error('Failed to fetch markets', error as Error, { requestId })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

**要点**: backendパターンはスケールし保守しやすいserver-sideアプリケーションを実現する。複雑さの水準に合ったパターンを選ぶ。
