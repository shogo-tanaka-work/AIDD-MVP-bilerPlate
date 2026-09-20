# Data accessパターン

query最適化、N+1回避、transaction、cache層の実装例。

## Query最適化

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

## N+1 Queryの回避

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

## Transactionパターン

複数テーブルへの書き込みはDB側の関数（RPC）で原子性を保証する。

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

  if (error) throw new Error('createMarketWithPosition: transaction failed', { cause: error })
  return data
}
```

```sql
-- Supabase側のSQL関数
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

## Redis Cache層（Repository decorator）

cacheはRepositoryをラップするdecoratorとして実装し、Serviceからはcacheの有無が見えないようにする。

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

## Cache-Asideパターン

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

更新・削除時は同じkeyをinvalidateする経路を必ず用意する。TTLだけに頼ると、更新直後に古い値を返す。
