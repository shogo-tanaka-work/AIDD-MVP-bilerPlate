---
name: coding-standards
description: 命名、可読性、不変性、コード品質レビューに関するプロジェクト横断のベースラインとなるコーディング規約。framework固有のパターンは詳細なfrontend・backendスキルを使う。適用できるframework固有スキルがない状態でコード品質や命名をレビューするときに使う。
metadata:
  origin: ECC
---

# Coding Standards & Best Practices

プロジェクト横断で適用できるベースラインのコーディング規約。

このスキルは共通の土台であり、framework別の詳細なplaybookではない。

- React、state、form、rendering、UIアーキテクチャには`frontend-patterns`を使う。
- repository/service層、endpoint設計、検証、server固有の関心事には`backend-patterns`または`api-design`を使う。
- スキル全体を辿るのではなく最小限の再利用可能なルール層が必要なときは`rules/common/coding-style.md`を使う。

## いつ使うか

- 新しいプロジェクトやmoduleを始めるとき
- 品質と保守性の観点でコードをレビューするとき
- 規約に沿って既存コードをrefactorするとき
- 命名、formatting、構造の一貫性を徹底するとき
- lint、formatting、型検査のルールを設定するとき
- 新しいcontributorにコーディング規約を共有するとき

## 適用範囲の境界

次の場合にこのスキルを使う。
- 説明的な命名
- 不変性のデフォルト
- 可読性、KISS、DRY、YAGNIの徹底
- エラー処理の期待値とcode smellのレビュー

次の一次情報源としては使わない。
- Reactのcomposition、hook、renderingパターン
- backendアーキテクチャ、API設計、database層の設計
- より狭いECCスキルが既に存在するdomain固有のframework指針

## コード品質の原則

### 1. 可読性を最優先する
- コードは書かれる回数より読まれる回数が多い
- 変数名と関数名を明確にする
- コメントよりも自己説明的なコードを優先する
- formattingを一貫させる

### 2. KISS (Keep It Simple, Stupid)
- 動作する最もシンプルな解を選ぶ
- over-engineeringを避ける
- 早すぎる最適化をしない
- 賢いコードより理解しやすさを優先する

### 3. DRY (Don't Repeat Yourself)
- 共通ロジックを関数へ抽出する
- 再利用可能なcomponentを作る
- utilityをmodule間で共有する
- copy-pasteプログラミングを避ける

### 4. YAGNI (You Aren't Gonna Need It)
- 必要になる前に機能を作らない
- 投機的な一般化を避ける
- 必要になったときだけ複雑さを足す
- シンプルに始め、必要になったらrefactorする

## TypeScript/JavaScriptの規約

### 変数の命名

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

### 関数の命名

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

### 不変性のパターン（CRITICAL）

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

### エラー処理

```typescript
// PASS: GOOD: 網羅的なエラー処理
async function fetchData(url: string) {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Fetch failed:', error)
    throw new Error('Failed to fetch data')
  }
}

// FAIL: BAD: エラー処理がない
async function fetchData(url) {
  const response = await fetch(url)
  return response.json()
}
```

### Async/Awaitのbest practice

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

### 型安全性

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

## Reactのbest practice

### componentの構造

```typescript
// PASS: GOOD: 型付きのfunctional component
interface ButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

export function Button({
  children,
  onClick,
  disabled = false,
  variant = 'primary'
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  )
}

// FAIL: BAD: 型がなく構造も不明瞭
export function Button(props) {
  return <button onClick={props.onClick}>{props.children}</button>
}
```

### custom hook

```typescript
// PASS: GOOD: 再利用可能なcustom hook
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// 使用例
const debouncedQuery = useDebounce(searchQuery, 500)
```

### state管理

```typescript
// PASS: GOOD: 適切なstate更新
const [count, setCount] = useState(0)

// 直前のstateに基づく場合はfunctional updateを使う
setCount(prev => prev + 1)

// FAIL: BAD: stateを直接参照する
setCount(count + 1)  // 非同期処理では古い値になりうる
```

### 条件付きrendering

```typescript
// PASS: GOOD: 明確な条件付きrendering
{isLoading && <Spinner />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}

// FAIL: BAD: 三項演算子の入れ子地獄
{isLoading ? <Spinner /> : error ? <ErrorMessage error={error} /> : data ? <DataDisplay data={data} /> : null}
```

## API設計の規約

### REST APIの規約

```
GET    /api/markets              # 全marketの一覧取得
GET    /api/markets/:id          # 特定のmarketを取得
POST   /api/markets              # 新しいmarketを作成
PUT    /api/markets/:id          # marketを更新（全体）
PATCH  /api/markets/:id          # marketを更新（部分）
DELETE /api/markets/:id          # marketを削除

# 絞り込み用のquery parameter
GET /api/markets?status=active&limit=10&offset=0
```

### responseの形式

```typescript
// PASS: GOOD: 一貫したresponse構造
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}

// 成功response
return NextResponse.json({
  success: true,
  data: markets,
  meta: { total: 100, page: 1, limit: 10 }
})

// エラーresponse
return NextResponse.json({
  success: false,
  error: 'Invalid request'
}, { status: 400 })
```

### 入力検証

```typescript
import { z } from 'zod'

// PASS: GOOD: schemaによる検証
const CreateMarketSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  endDate: z.string().datetime(),
  categories: z.array(z.string()).min(1)
})

export async function POST(request: Request) {
  const body = await request.json()

  try {
    const validated = CreateMarketSchema.parse(body)
    // 検証済みdataで処理を続ける
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: error.issues
      }, { status: 400 })
    }
  }
}
```

## ファイル構成

### プロジェクト構造

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API route
│   ├── markets/           # marketページ
│   └── (auth)/           # 認証ページ（route group）
├── components/            # React component
│   ├── ui/               # 汎用UI component
│   ├── forms/            # form component
│   └── layouts/          # layout component
├── hooks/                # custom React hook
├── lib/                  # utilityと設定
│   ├── api/             # API client
│   ├── utils/           # helper関数
│   └── constants/       # 定数
├── types/                # TypeScriptの型
└── styles/              # global style
```

### ファイルの命名

```
components/Button.tsx          # componentはPascalCase
hooks/useAuth.ts              # camelCaseで'use'をprefixにする
lib/formatDate.ts             # utilityはcamelCase
types/market.types.ts         # camelCaseに.types suffixを付ける
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

## performanceのbest practice

### memoization

```typescript
import { useMemo, useCallback } from 'react'

// PASS: GOOD: 重い計算をmemoizeする
// sortの前にコピーする - Array.prototype.sortは元の配列をmutateする
const sortedMarkets = useMemo(() => {
  return [...markets].sort((a, b) => b.volume - a.volume)
}, [markets])

// PASS: GOOD: callbackをmemoizeする
const handleSearch = useCallback((query: string) => {
  setSearchQuery(query)
}, [])
```

### 遅延読み込み

```typescript
import { lazy, Suspense } from 'react'

// PASS: GOOD: 重いcomponentを遅延読み込みする
const HeavyChart = lazy(() => import('./HeavyChart'))

export function Dashboard() {
  return (
    <Suspense fallback={<Spinner />}>
      <HeavyChart />
    </Suspense>
  )
}
```

### databaseのquery

```typescript
// PASS: GOOD: 必要なcolumnだけを選択する
const { data } = await supabase
  .from('markets')
  .select('id, name, status')
  .limit(10)

// FAIL: BAD: すべてを選択する
const { data } = await supabase
  .from('markets')
  .select('*')
```

## テストの規約

### テストの構造（AAAパターン）

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

### テストの命名

```typescript
// PASS: GOOD: 説明的なテスト名
test('returns empty array when no markets match query', () => { })
test('throws error when OpenAI API key is missing', () => { })
test('falls back to substring search when Redis unavailable', () => { })

// FAIL: BAD: 曖昧なテスト名
test('works', () => { })
test('test search', () => { })
```

## code smellの検出

次のanti-patternに注意する。

### 1. 長い関数
```typescript
// FAIL: BAD: 50行を超える関数
function processMarketData() {
  // 100行のコード
}

// PASS: GOOD: 小さな関数へ分割する
function processMarketData() {
  const validated = validateData()
  const transformed = transformData(validated)
  return saveData(transformed)
}
```

### 2. 深いネスト
```typescript
// FAIL: BAD: 5段階以上のネスト
if (user) {
  if (user.isAdmin) {
    if (market) {
      if (market.isActive) {
        if (hasPermission) {
          // 何らかの処理
        }
      }
    }
  }
}

// PASS: GOOD: 早期return
if (!user) return
if (!user.isAdmin) return
if (!market) return
if (!market.isActive) return
if (!hasPermission) return

// 何らかの処理
```

### 3. マジックナンバー
```typescript
// FAIL: BAD: 説明のない数値
if (retryCount > 3) { }
setTimeout(callback, 500)

// PASS: GOOD: 名前付き定数
const MAX_RETRIES = 3
const DEBOUNCE_DELAY_MS = 500

if (retryCount > MAX_RETRIES) { }
setTimeout(callback, DEBOUNCE_DELAY_MS)
```

**重要**: コード品質は交渉の余地がない。明確で保守しやすいコードが、素早い開発と自信を持ったrefactorを可能にする。
