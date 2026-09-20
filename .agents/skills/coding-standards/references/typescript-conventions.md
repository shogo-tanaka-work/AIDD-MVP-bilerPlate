# TypeScript / JavaScriptの規約

## 変数の命名

```typescript
// PASS: GOOD: 説明的な名前
const marketSearchQuery = 'election'
const isUserAuthenticated = true
const totalRevenue = 1000

// FAIL: BAD: 意味が不明瞭な名前
const q = 'election'
const flag = true
const x = 1000
```

## 関数の命名

```typescript
// PASS: GOOD: 動詞＋名詞のパターン
async function fetchMarketData(marketId: string) { }
function calculateSimilarity(a: number[], b: number[]) { }
function isValidEmail(email: string): boolean { }

// FAIL: BAD: 不明瞭または名詞のみ
async function market(id: string) { }
function similarity(a, b) { }
function email(e) { }
```

## 不変性のパターン（CRITICAL）

```typescript
// PASS: 常にspread operatorを使う
const updatedUser = {
  ...user,
  name: 'New Name'
}

const updatedArray = [...items, newItem]

// FAIL: 直接mutateしない
user.name = 'New Name'  // BAD
items.push(newItem)     // BAD
```

## Async/Awaitのbest practice

```typescript
// PASS: GOOD: 可能なら並列実行する
const [users, markets, stats] = await Promise.all([
  fetchUsers(),
  fetchMarkets(),
  fetchStats()
])

// FAIL: BAD: 不要な逐次実行
const users = await fetchUsers()
const markets = await fetchMarkets()
const stats = await fetchStats()
```

## 型安全性

```typescript
// PASS: GOOD: 適切な型付け
interface Market {
  id: string
  name: string
  status: 'active' | 'resolved' | 'closed'
  created_at: Date
}

function getMarket(id: string): Promise<Market> {
  // 実装
}

// FAIL: BAD: 'any'の使用
function getMarket(id: any): Promise<any> {
  // 実装
}
```

## コメントとドキュメント

### コメントを書くとき

```typescript
// PASS: GOOD: WHATではなくWHYを説明する
// 障害時にAPIへ負荷をかけないようexponential backoffを使う
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)

// 大きな配列での性能のため意図的にmutationを使っている
items.push(newItem)

// FAIL: BAD: 自明なことを書いている
// counterを1増やす
count++

// nameにuserのnameを設定する
name = user.name
```

### 公開APIのJSDoc

```typescript
/**
 * 意味的類似度でmarketを検索する。
 *
 * @param query - 自然言語の検索query
 * @param limit - 結果の最大件数（default: 10）
 * @returns 類似度スコア順に並べたmarketの配列
 * @throws {Error} OpenAI APIが失敗した場合、またはRedisが利用不可の場合
 *
 * @example
 * ```typescript
 * const results = await searchMarkets('election', 5)
 * console.log(results[0].name) // "Trump vs Biden"
 * ```
 */
export async function searchMarkets(
  query: string,
  limit: number = 10
): Promise<Market[]> {
  // 実装
}
```
