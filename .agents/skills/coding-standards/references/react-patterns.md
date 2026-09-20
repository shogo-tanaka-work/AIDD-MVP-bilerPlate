# Reactのbest practice

React全般の設計（composition、hook設計、renderingアーキテクチャ）は `frontend-patterns` / `react-patterns` を一次情報源にする。ここではコード品質レビューで使う最小限の型と構造の規約だけを扱う。

## componentの構造

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

## custom hook

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

## state管理

```typescript
// PASS: GOOD: 適切なstate更新
const [count, setCount] = useState(0)

// 直前のstateに基づく場合はfunctional updateを使う
setCount(prev => prev + 1)

// FAIL: BAD: stateを直接参照する
setCount(count + 1)  // 非同期処理では古い値になりうる
```

## 条件付きrendering

```typescript
// PASS: GOOD: 明確な条件付きrendering
{isLoading && <Spinner />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}

// FAIL: BAD: 三項演算子の入れ子地獄
{isLoading ? <Spinner /> : error ? <ErrorMessage error={error} /> : data ? <DataDisplay data={data} /> : null}
```

## performance

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
