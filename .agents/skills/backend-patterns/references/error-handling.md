# エラー処理パターン

集約error handlerと指数バックオフ再試行の実装例。原則は常時ロードされる`.agents/rules/error-handling.md`に従う。

## 集約エラーハンドラ

HTTP status code付きの`ApiError`と、validation errorの変換を一箇所に集める。想定外のエラーは500で内部詳細を返さない。

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

## 指数バックオフによる再試行

冪等な外部呼び出しにだけ適用する。上限回数を超えたら最後のエラーを文脈付きで投げる。

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

  throw new Error(`fetchWithRetry: ${maxRetries}回失敗`, { cause: lastError! })
}

// 使い方
const data = await fetchWithRetry(() => fetchFromAPI())
```
