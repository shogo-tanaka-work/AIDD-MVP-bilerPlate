# 層構成パターン

RESTful APIの構造と、Repository・Service・Middlewareの分離の実装例。

## RESTful APIの構造

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

## Repositoryパターン

data accessロジックをinterfaceの背後に抽象化する。Serviceは具象クライアント（Supabase、Prismaなど）を直接触らない。

```typescript
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

    if (error) throw new Error(`markets.findAll failed: ${error.message}`, { cause: error })
    return data
  }

  // その他のメソッド...
}
```

## Service層パターン

業務ロジックをdata accessから分離する。Serviceはconstructorでrepositoryを受け取り、testではmockに差し替える。

```typescript
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

## Middlewareパターン

request/responseの処理パイプライン。横断関心（認証、logging、rate limiting）はhandlerをラップする高階関数として実装する。

```typescript
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
